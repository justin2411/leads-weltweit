import "server-only";
import { db } from "@/lib/supabase";
import { COUNTRIES, SEGMENT } from "@/lib/dashboard-data";
import { berlinDay } from "@/lib/dashboard-logic";
import { normalizeRows, type KohorteRow } from "@/lib/kohorten";
import { finanzen, kpiAus as finanzKpi, type AboIn, type Finanzen } from "./finanzen";
import { HEISS, heiss, inboundJeLand, kpiAus as vertriebKpi, vertrieb, type Vertrieb } from "./vertrieb";
import { START, kpiAus as zielKpi, zeilen, type Ziel, type ZielZeile } from "./ziele";
import type { AbteilungKpi } from "./kpi";

/**
 * Daten der Kommandozentrale (Finanzen, Vertrieb, Ziele). Nur serverseitig mit dem Service-Schlüssel, kurze Zeitlimits;
 * ein Fehler liefert null („nicht lesbar“) statt falscher Nullen. Keine Lead-Inhalte, nur Zählungen und Firmennamen
 * der Antworten (wie im Antworten-Cockpit).
 */
const T = (ms = 5000) => AbortSignal.timeout(ms);
const one = <X>(x: X | X[] | null | undefined): X | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

type CustRow = { id: string; country: string; status: string; notes: string | null; stripe_customer_id: string | null };
type SubRow = Omit<AboIn, "country" | "test"> & { customer_id: string };

/** Abos mit Land und Testkauf-Kennung (wie deliveries.is_test_customer / isTestCustomer). */
export async function loadAbos(): Promise<AboIn[] | null> {
  try {
    const [c, s] = await Promise.all([
      db().from("customers").select("id, country, status, notes, stripe_customer_id").limit(5000).abortSignal(T()),
      db().from("subscriptions").select("id, customer_id, status, package, amount_cents, currency, price_eur_month, started_on, cancelled_on").limit(5000).abortSignal(T()),
    ]);
    if (c.error || s.error) throw new Error((c.error ?? s.error)!.message);
    const cust = new Map(((c.data ?? []) as CustRow[]).map((x) => [x.id, x]));
    return ((s.data ?? []) as SubRow[]).map((x) => {
      const k = cust.get(x.customer_id);
      const test = !!k && k.status === "trial" && (!!k.stripe_customer_id || (k.notes ?? "").includes("Stripe-Testmodus"));
      return { ...x, country: k?.country ?? null, test: test || !k, status: k?.status === "cancelled" && x.status === "active" ? "cancelled" : x.status };
    });
  } catch (e) {
    console.error("zentrale abos:", e);
    return null;
  }
}

export async function loadFinanzen(now = new Date()): Promise<Finanzen | null> {
  const abos = await loadAbos();
  return abos ? finanzen(abos, berlinDay(now)) : null;
}

/** Soll-Werte; Tabelle fehlt/leer → Startwerte (Vorschlag), error gesetzt. */
export async function loadZiele(): Promise<{ ziele: Ziel[]; error: string | null }> {
  try {
    const { data, error } = await db().from("company_goals").select("key, titel, einheit, soll, richtung, sort, quelle, updated_at, updated_by").abortSignal(T());
    if (error) throw new Error(error.message);
    const rows = ((data ?? []) as Ziel[]).map((z) => ({ ...z, soll: Number(z.soll) }));
    return rows.length ? { ziele: rows, error: null } : { ziele: START, error: "noch keine Ziele gespeichert" };
  } catch (e) {
    console.error("zentrale ziele:", e);
    return { ziele: START, error: "Ziele nicht lesbar" };
  }
}

async function kohorten(): Promise<KohorteRow[] | null> {
  try {
    const { data, error } = await db().rpc("cohort_funnel", { p_segment: SEGMENT, p_countries: [...COUNTRIES], p_weeks: 52 }).abortSignal(T());
    if (error) throw new Error(error.message);
    return normalizeRows(data);
  } catch {
    return null;
  }
}

type InRow = { intent: string | null; prospects: { country: string | null; segment_id: string | null } | null };
async function inbound() {
  try {
    const { data, error } = await db().from("inbound_replies").select("intent, prospects(country, segment_id)").limit(20000).abortSignal(T());
    if (error) throw new Error(error.message);
    return inboundJeLand(((data ?? []) as unknown as InRow[]).map((r) => one(r.prospects) ? { intent: r.intent, p: one(r.prospects)! } : null)
      .filter((r): r is { intent: string | null; p: { country: string | null; segment_id: string | null } } => !!r && (!r.p.segment_id || r.p.segment_id === SEGMENT))
      .map((r) => ({ intent: r.intent, country: r.p.country })));
  } catch {
    return null;
  }
}

export type HeissRow = {
  id: string; received_at: string | null; processed_at: string | null; status: string; intent: string | null; summary_de: string | null;
  prospects: { company_name: string; country: string } | null;
};
export async function loadHeiss(): Promise<HeissRow[] | null> {
  try {
    const { data, error } = await db().from("inbound_replies").select("id, received_at, processed_at, status, intent, summary_de, prospects(company_name, country)")
      .in("intent", HEISS).in("status", ["offen", "spaeter"]).order("received_at", { ascending: false }).limit(200).abortSignal(T());
    if (error) throw new Error(error.message);
    return heiss(((data ?? []) as any[]).map((r) => ({ ...r, prospects: one(r.prospects) })) as HeissRow[], 12);
  } catch {
    return null;
  }
}

export async function loadVertrieb(now = new Date(), abos?: AboIn[] | null): Promise<Vertrieb | null> {
  const [k, ib, a] = await Promise.all([kohorten(), inbound(), abos === undefined ? loadAbos() : Promise.resolve(abos)]);
  if (!k || !ib) return null;
  const kunden: Record<string, number> = {};
  for (const s of a ?? []) if (!s.test && ["active", "past_due"].includes(s.status) && s.country) kunden[s.country] = (kunden[s.country] ?? 0) + 1;
  return vertrieb(k, ib, kunden, COUNTRIES, berlinDay(now));
}

/** Fehlerquote der Freigabe-Stichprobe (neuester Tag, gewichtet) und grüne Leads der letzten 7 Tage je Land. */
async function leadZahlen(now: Date): Promise<{ fehler: number | null; gruen: Record<string, number>; tage: number } | null> {
  try {
    const von = berlinDay(new Date(now.getTime() - 6 * 86_400_000));
    const { data, error } = await db().from("kpi_daily").select("day, country, metric, value").eq("segment_id", SEGMENT)
      .in("metric", ["freigabe_quote", "freigabe_n", "leads_neu"]).gte("day", von).order("day", { ascending: false }).limit(500).abortSignal(T());
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as { day: string; country: string; metric: string; value: number | string }[];
    const last = rows.find((r) => r.metric === "freigabe_quote")?.day;
    let bad = 0, n = 0;
    for (const r of rows.filter((x) => x.day === last && x.metric === "freigabe_quote")) {
      const nn = Number(rows.find((x) => x.day === last && x.metric === "freigabe_n" && x.country === r.country)?.value ?? 0);
      bad += (1 - Number(r.value)) * nn; n += nn;
    }
    const gruen: Record<string, number> = {};
    for (const r of rows) if (r.metric === "leads_neu") gruen[r.country] = (gruen[r.country] ?? 0) + Number(r.value || 0);
    return { fehler: n ? bad / n : null, gruen, tage: new Set(rows.filter((r) => r.metric === "leads_neu").map((r) => r.day)).size };
  } catch {
    return null;
  }
}

export type ZentraleZiele = { zeilen: ZielZeile[]; error: string | null };
export async function loadZieleIst(now = new Date(), pre?: { fin?: Finanzen | null; ver?: Vertrieb | null }): Promise<ZentraleZiele> {
  const [{ ziele, error }, fin, ver, lz] = await Promise.all([
    loadZiele(), pre?.fin !== undefined ? Promise.resolve(pre.fin) : loadFinanzen(now),
    pre?.ver !== undefined ? Promise.resolve(pre.ver) : loadVertrieb(now), leadZahlen(now),
  ]);
  const ist: Record<string, number | null> = {
    mrr: fin ? fin.mrrSumme : null,
    kunden: fin ? fin.aktiv : null,
    antwortquote: ver && ver.gesamt.zugestellt ? (100 * ver.gesamt.geantwortet) / ver.gesamt.zugestellt : null,
    lead_fehler: lz && lz.fehler !== null ? lz.fehler * 100 : null,
    gruen_uk: lz && lz.tage ? lz.gruen.UK ?? 0 : null,
    gruen_fr: lz && lz.tage ? lz.gruen.FR ?? 0 : null,
  };
  const woche = lz && lz.tage < 7 ? `erst ${lz.tage} Tag${lz.tage === 1 ? "" : "e"} gemessen` : "";
  const hinweise: Record<string, string> = {
    ...(woche ? { gruen_uk: woche, gruen_fr: woche } : {}),
    ...(ver && !ver.gesamt.zugestellt ? { antwortquote: "noch nichts zugestellt" } : {}),
    ...(ver?.schritte[0].jung ? { antwortquote: "Antworten laufen noch (< 14 Tage)" } : {}),
    ...(fin && fin.mrr.length > 1 ? { mrr: "Währungen ohne Umrechnung addiert" } : {}),
  };
  return { zeilen: zeilen(ziele, ist, hinweise), error };
}

/** Alle drei Abteilungs-Kennzahlen für JARVIS (eine Abfragerunde). */
export async function loadZentraleKpis(now = new Date()): Promise<{ finanzen: AbteilungKpi | null; vertrieb: AbteilungKpi | null; ziele: AbteilungKpi }> {
  const abos = await loadAbos();
  const fin = abos ? finanzen(abos, berlinDay(now)) : null;
  const [ver, hot] = await Promise.all([loadVertrieb(now, abos), loadHeiss()]);
  const z = await loadZieleIst(now, { fin, ver });
  const mrrZiel = z.zeilen.find((x) => x.key === "mrr")?.soll ?? null;
  return {
    finanzen: fin ? finanzKpi(fin, mrrZiel) : null,
    vertrieb: ver ? vertriebKpi(ver, hot?.length ?? 0) : null,
    ziele: zielKpi(z.zeilen),
  };
}

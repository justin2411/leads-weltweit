import "server-only";
import { db } from "@/lib/supabase";
import { CONFIG, COUNTRIES, SEGMENT, loadLive, loadOwnerSettings } from "@/lib/dashboard-data";
import { brake, mailboxes, monthly, realSubscriptions, sampleStock } from "@/lib/dashboard-logic";
import { loadBrauchtDich } from "@/lib/braucht-dich-data";
import type { Goal, Langsam, LangsamDb, Schnell, ZentraleDaten } from "@/lib/zentrale-typen";

/**
 * Daten der JARVIS-Zentrale an einer Stelle (Seite /dashboard/jarvis und GET /api/jarvis/zentrale). Nur lesen:
 *  - schnell (alle 10 s): eine Lese-Funktion signalwerk.zentrale_schnell() (~35 ms, alle Teile mit Zeitfilter/Limit)
 *  - langsam (alle 60 s): dashboard_cache 'zentrale' (Wachhund alle 15 min), nur wenn noch nie gerechnet: einmal
 *    zentrale_langsam() direkt. Dazu die Notbremse genau wie deliverability (lib/dashboard-logic brake, dashboard_live).
 * Jede Teilabfrage mit Zeitlimit; Ausfall → dieser Teil null, die Oberfläche zeigt „Stand …“ statt falscher Zahlen.
 * Nie live: observations, leads, watch_companies, prospects (große Tabellen; Zahlen kommen aus Cache/Läufen).
 */
const LESE_RPC = ["zentrale_schnell", "zentrale_langsam"] as const;
// Zeitlimits (Bug 05.10.2026 „Keine Live-Daten“, Kunden/MRR „–“): Datenbank unter Last (Werke, I/O) → 1,5 s reichten
// oft nicht, dashboard_live braucht ~6 s. zentrale_schnell hat selbst statement_timeout 3 s.
const T_SCHNELL = 3000;
const T_CACHE = 4000;
/** Letzter guter Stand je Server-Instanz: ein einzelner Ausfall zeigt den letzten Wert statt „–“ (höchstens 15 min alt). */
const HALTE_MS = 15 * 60_000;
const letzt: { schnell?: { v: Schnell; t: number }; langsam?: { v: { v: LangsamDb; at: string }; t: number };
  live?: { v: LiveTeil; t: number }; kasse?: { v: Kasse; t: number } } = {};
type LiveTeil = { bremse: Langsam["bremse"]; kap: number | null; tank_soll: Record<string, number> };
type Kasse = { mrr: number; kunden: number };
function halte<K extends keyof typeof letzt>(k: K, v: NonNullable<(typeof letzt)[K]>["v"] | null): NonNullable<(typeof letzt)[K]>["v"] | null {
  if (v !== null) { (letzt as Record<string, unknown>)[k] = { v, t: Date.now() }; return v; }
  const alt = letzt[k];
  return alt && Date.now() - alt.t < HALTE_MS ? (alt.v as NonNullable<(typeof letzt)[K]>["v"]) : null;
}

async function lies<T>(fn: (typeof LESE_RPC)[number], ms: number): Promise<T | null> {
  try {
    const { data, error } = await db().rpc(fn, {}).abortSignal(AbortSignal.timeout(ms));
    if (error) throw new Error(error.message);
    return (data ?? null) as T | null;
  } catch {
    return null;
  }
}

const mitLimit = <T,>(p: Promise<T>, ms: number, dflt: T): Promise<T> =>
  Promise.race([p.catch(() => dflt), new Promise<T>((ok) => setTimeout(() => ok(dflt), ms))]);

export async function loadSchnell(): Promise<Schnell | null> {
  return halte("schnell", await lies<Schnell>("zentrale_schnell", T_SCHNELL));
}

async function langsamDb(): Promise<{ v: LangsamDb; at: string } | null> {
  try {
    const { data, error } = await db().from("dashboard_cache").select("value, updated_at").eq("name", "zentrale")
      .abortSignal(AbortSignal.timeout(T_CACHE)).maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.value) return halte("langsam", { v: data.value as LangsamDb, at: data.updated_at as string });
  } catch {
    // Cache gerade nicht lesbar (Last): letzter Stand, nie die schwere Rechnung obendrauf
    return halte("langsam", null);
  }
  // Noch nie gerechnet (z. B. direkt nach der Migration): einmal direkt lesen. Ein alter Cache wird NICHT im Abruf neu
  // gerechnet – er kommt mit seinem Stand (pg_cron frischt alle 5 min auf).
  const v = await lies<LangsamDb>("zentrale_langsam", 8000);
  return halte("langsam", v ? { v, at: v.at } : null);
}

/** Kunden und MRR direkt aus customers/subscriptions (kleine Tabellen, gleiche Regel wie realSubscriptions) –
 *  unabhängig von dashboard_live (~6 s unter Last, Bug 05.10.2026). */
async function kasse(): Promise<Kasse | null> {
  try {
    const sig = () => AbortSignal.timeout(T_CACHE);
    const [c, s] = await Promise.all([
      db().from("customers").select("id, country, status, stripe_customer_id, notes").abortSignal(sig()),
      db().from("subscriptions").select("customer_id, status, amount_cents, price_eur_month").abortSignal(sig()),
    ]);
    if (c.error || s.error) throw new Error((c.error ?? s.error)!.message);
    const customers = (c.data ?? []).map((x) => ({ id: x.id, country: x.country, status: x.status,
      stripe: x.stripe_customer_id != null, test_note: String(x.notes ?? "").includes("Stripe-Testmodus") }));
    const live = { customers, subscriptions: s.data ?? [] } as unknown as Parameters<typeof realSubscriptions>[0];
    const subs = realSubscriptions(live).filter((x) => COUNTRIES.includes(x.customer?.country ?? ""));
    return halte("kasse", { mrr: subs.reduce((a, x) => a + monthly(x), 0), kunden: subs.length });
  } catch {
    return halte("kasse", null);
  }
}

/** Ziele live (kleine Tabelle, < 20 Zeilen): bestätigt/unbestätigt nie aus einem alten Cache (Bug 05.10.2026). */
async function goalsLive(): Promise<Goal[] | null> {
  try {
    const { data, error } = await db().from("company_goals").select("key, titel, einheit, soll, richtung, sort, quelle, updated_at")
      .order("sort").abortSignal(AbortSignal.timeout(T_SCHNELL));
    if (error || !data?.length) return null;
    return data as Goal[];
  } catch {
    return null;
  }
}

/** liveMs: Seitenaufbau kurz (4 s, letzter Stand hilft), Browser-Abruf alle 60 s darf auf dashboard_live (~6 s) warten. */
export async function loadLangsam(liveMs = 4000): Promise<Langsam | null> {
  const [base, live, own, bd, goals, k] = await Promise.all([
    langsamDb(),
    mitLimit(loadLive().then((x) => x as Awaited<ReturnType<typeof loadLive>> | null), liveMs, null),
    mitLimit(loadOwnerSettings(), 2000, null),
    mitLimit(loadBrauchtDich(), 2000, []),
    goalsLive(),
    kasse(),
  ]);
  if (!base) return null;
  const v = goals ? { ...base.v, goals } : base.v;
  let lt: LiveTeil | null = null;
  if (live) {
    const b = brake(live, CONFIG);
    const tank_soll: Record<string, number> = {};
    const cfg = { ...CONFIG, sample_overrides: own?.sample_targets ?? {} };
    for (const r of sampleStock(live, cfg, new Date(live.now))) {
      const [seg, c] = r.key.split("/");
      if (seg === SEGMENT && COUNTRIES.includes(c)) tank_soll[c] = r.target;
    }
    lt = { bremse: { stop: b.stop, sent: b.sent, bounced: b.bounced, complained: b.complained, rate: b.rate },
      kap: mailboxes(live, CONFIG).reduce((a, x) => a + x.cap, 0), tank_soll };
  }
  const l = halte("live", lt) ?? { bremse: null, kap: null, tank_soll: {} };
  return { ...v, stand: base.at, ...l, mrr: k?.mrr ?? null, kunden: k?.kunden ?? null, bd };
}

/** Beide Teile; „schnell“ oder „langsam“ allein für die Abrufe des Browsers. */
export async function loadZentrale(teil: "schnell" | "langsam" | "alle" = "alle"): Promise<ZentraleDaten> {
  const [schnell, langsam] = await Promise.all([
    teil === "langsam" ? Promise.resolve(null) : loadSchnell(),
    teil === "schnell" ? Promise.resolve(null) : loadLangsam(teil === "langsam" ? 9000 : 4000),
  ]);
  return { schnell, langsam, abruf: new Date().toISOString() };
}

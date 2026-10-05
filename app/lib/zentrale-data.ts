import "server-only";
import { db } from "@/lib/supabase";
import { CONFIG, COUNTRIES, SEGMENT, loadLive, loadOwnerSettings } from "@/lib/dashboard-data";
import { brake, mailboxes, monthly, realSubscriptions, sampleStock } from "@/lib/dashboard-logic";
import { loadBrauchtDich } from "@/lib/braucht-dich-data";
import type { Langsam, LangsamDb, Schnell, ZentraleDaten } from "@/lib/zentrale-typen";

/**
 * Daten der JARVIS-Zentrale an einer Stelle (Seite /dashboard/jarvis und GET /api/jarvis/zentrale). Nur lesen:
 *  - schnell (alle 10 s): eine Lese-Funktion signalwerk.zentrale_schnell() (~35 ms, alle Teile mit Zeitfilter/Limit)
 *  - langsam (alle 60 s): dashboard_cache 'zentrale' (Wachhund alle 15 min), nur wenn noch nie gerechnet: einmal
 *    zentrale_langsam() direkt. Dazu die Notbremse genau wie deliverability (lib/dashboard-logic brake, dashboard_live).
 * Jede Teilabfrage mit Zeitlimit; Ausfall → dieser Teil null, die Oberfläche zeigt „Stand …“ statt falscher Zahlen.
 * Nie live: observations, leads, watch_companies, prospects (große Tabellen; Zahlen kommen aus Cache/Läufen).
 */
const LESE_RPC = ["zentrale_schnell", "zentrale_langsam"] as const;
const T_SCHNELL = 1500;

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

export function loadSchnell(): Promise<Schnell | null> {
  return lies<Schnell>("zentrale_schnell", T_SCHNELL);
}

async function langsamDb(): Promise<{ v: LangsamDb; at: string } | null> {
  try {
    const { data, error } = await db().from("dashboard_cache").select("value, updated_at").eq("name", "zentrale")
      .abortSignal(AbortSignal.timeout(T_SCHNELL)).maybeSingle();
    if (error) throw new Error(error.message);
    if (data?.value) return { v: data.value as LangsamDb, at: data.updated_at as string };
  } catch {
    /* Cache nicht lesbar: unten einmal direkt */
  }
  // Noch nie gerechnet (z. B. direkt nach der Migration): einmal direkt lesen. Ein alter Cache wird NICHT im Abruf neu
  // gerechnet – er kommt mit seinem Stand (Wachhund frischt alle 15 min auf).
  const v = await lies<LangsamDb>("zentrale_langsam", 8000);
  return v ? { v, at: v.at } : null;
}

export async function loadLangsam(): Promise<Langsam | null> {
  const [base, live, own, bd] = await Promise.all([
    langsamDb(),
    mitLimit(loadLive().then((x) => x as Awaited<ReturnType<typeof loadLive>> | null), 4000, null),
    mitLimit(loadOwnerSettings(), 2000, null),
    mitLimit(loadBrauchtDich(), 2000, []),
  ]);
  if (!base) return null;
  let bremse: Langsam["bremse"] = null, kap: number | null = null, mrr: number | null = null, kunden: number | null = null;
  const tank_soll: Record<string, number> = {};
  if (live) {
    const b = brake(live, CONFIG);
    bremse = { stop: b.stop, sent: b.sent, bounced: b.bounced, complained: b.complained, rate: b.rate };
    kap = mailboxes(live, CONFIG).reduce((a, x) => a + x.cap, 0);
    const subs = realSubscriptions(live).filter((x) => COUNTRIES.includes(x.customer?.country ?? ""));
    mrr = subs.reduce((a, x) => a + monthly(x), 0);
    kunden = subs.length;
    const cfg = { ...CONFIG, sample_overrides: own?.sample_targets ?? {} };
    for (const r of sampleStock(live, cfg, new Date(live.now))) {
      const [seg, c] = r.key.split("/");
      if (seg === SEGMENT && COUNTRIES.includes(c)) tank_soll[c] = r.target;
    }
  }
  return { ...base.v, stand: base.at, bremse, kap, mrr, kunden, tank_soll, bd };
}

/** Beide Teile; „schnell“ oder „langsam“ allein für die Abrufe des Browsers. */
export async function loadZentrale(teil: "schnell" | "langsam" | "alle" = "alle"): Promise<ZentraleDaten> {
  const [schnell, langsam] = await Promise.all([
    teil === "langsam" ? Promise.resolve(null) : loadSchnell(),
    teil === "schnell" ? Promise.resolve(null) : loadLangsam(),
  ]);
  return { schnell, langsam, abruf: new Date().toISOString() };
}

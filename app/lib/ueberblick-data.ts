import "server-only";
import { db } from "@/lib/supabase";
import type { DecisionLite, FlowRow } from "@/lib/ueberblick";

/**
 * Daten für den JARVIS-Überblick (nur lesen): letzter Zustellbarkeits-Check, grüne Leads je Tag (kpi_daily),
 * letzte 20 Entscheidungen, Datenfluss je Station (RPC datenfluss_stand). Jede Quelle einzeln: Fehler → null,
 * die Seite zeigt dann nichts statt falscher Nullen.
 */
export type Ueberblick = {
  deliver: { day: string; status: string; gruende: string[] } | null;
  leads: { day: string; country: string; value: number }[] | null;
  decisions: DecisionLite[] | null;
  flow: FlowRow[] | null;
};

const T = () => AbortSignal.timeout(4000);
const safe = async <X>(p: PromiseLike<{ data: X | null; error: { message: string } | null }>): Promise<X | null> => {
  try {
    const r = await p;
    return r.error ? null : r.data;
  } catch {
    return null;
  }
};

export async function loadUeberblick(segment: string, countries: string[], today: string): Promise<Ueberblick> {
  const from = new Date(Date.parse(`${today}T12:00:00Z`) - 8 * 86_400_000).toISOString().slice(0, 10);
  const [d, k, dec, flow] = await Promise.all([
    safe(db().from("deliverability_daily").select("day, status, gruende").order("day", { ascending: false }).limit(1).abortSignal(T())),
    safe(db().from("kpi_daily").select("day, country, value").eq("metric", "leads_neu").eq("segment_id", segment).in("country", countries)
      .gte("day", from).lte("day", today).abortSignal(T())),
    safe(db().from("decisions").select("*").order("created_at", { ascending: false }).limit(20).abortSignal(T())),
    safe(db().rpc("datenfluss_stand").abortSignal(T())),
  ]);
  const last = (d as { day: string; status: string; gruende: string[] | null }[] | null)?.[0] ?? null;
  return {
    // nur der Check von heute oder gestern zählt (älter = veraltet, dann kein Hinweis)
    deliver: last && last.day >= new Date(Date.parse(`${today}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10)
      ? { day: last.day, status: last.status, gruende: last.gruende ?? [] } : null,
    leads: k ? (k as { day: string; country: string; value: number | string }[]).map((r) => ({ day: r.day, country: r.country, value: Number(r.value) || 0 })) : null,
    decisions: dec as DecisionLite[] | null,
    flow: flow as FlowRow[] | null,
  };
}

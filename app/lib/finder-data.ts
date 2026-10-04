import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "./supabase";
import { FINDER_COUNTRY, FINDER_DAYS, FINDER_SIGNALS, pickExamples, rotationKey, type FinderExample, type FinderLand, type FinderRow } from "./finder";

export type FinderData = { count: number | null; examples: FinderExample[] };

/**
 * Zahl freigegebener, freier S2-Anlässe der letzten 14 Tage und 3 Beispiele (nur Firmenname, Anlass, Datum).
 * Ausgang ist die kleine Freigabe-Tabelle (lead_checks, released), dazu nur Leads mit Status new (nicht reserviert,
 * nicht in Probe oder Lieferung), ohne Verkehrsregister FMCSA (wie die Beispiele der Landingpage).
 */
async function fetchFinder(land: FinderLand, rot: string): Promise<FinderData> {
  const since = new Date(Date.now() - FINDER_DAYS * 864e5).toISOString().slice(0, 10);
  const { data, count, error } = await db().from("lead_checks")
    .select("lead_id, leads!inner(id, signal_type, event_date, source_name, status, segment_id, country, watch_companies(name, legal_form))", { count: "exact" })
    .eq("result", "released")
    .eq("leads.segment_id", "S2").eq("leads.country", FINDER_COUNTRY[land]).eq("leads.status", "new")
    .gte("leads.event_date", since).in("leads.signal_type", FINDER_SIGNALS)
    .or("source_name.is.null,source_name.not.ilike.*FMCSA*", { referencedTable: "leads" })
    .order("checked_at", { ascending: false }).limit(600);
  if (error) throw new Error(error.message);
  const rows: FinderRow[] = ((data ?? []) as any[]).map((c) => {
    const l = Array.isArray(c.leads) ? c.leads[0] : c.leads;
    const w = Array.isArray(l?.watch_companies) ? l.watch_companies[0] : l?.watch_companies;
    return { id: String(l?.id ?? c.lead_id), name: String(w?.name ?? ""), legal_form: w?.legal_form ?? null,
      signal: String(l?.signal_type ?? ""), date: String(l?.event_date ?? ""), source: l?.source_name ?? null };
  }).filter((r) => r.name);
  return { count: count ?? rows.length, examples: pickExamples(rows, rot) };
}

/** Über alle Server-Instanzen 30 Minuten zwischengespeichert; Beispiele wechseln stündlich (rot im Schlüssel). */
const cached = unstable_cache(fetchFinder, ["finder-v1"], { revalidate: 1800 });

export async function finderData(land: FinderLand): Promise<FinderData> {
  try {
    return await cached(land, rotationKey());
  } catch {
    return { count: null, examples: [] };
  }
}

/**
 * „Optimiert sich selbst“ (Score, letzte automatische Änderungen, offene Vorschläge) laden – für das Strategie-Office
 * (/dashboard/firma/strategie). Jede Quelle einzeln fehlertolerant (null = nicht lesbar, Karte zeigt „–“).
 */
import "server-only";
import { db } from "@/lib/supabase";
import { loadKpiDaily } from "@/lib/dashboard-data";
import { berlinDay } from "@/lib/dashboard-logic";
import { addDays } from "@/lib/trend";
import { anpassungen, gehirnScore, type MetaRow, type SelbstoptRow } from "@/lib/gehirn-lernt";

export async function loadGehirnLernt(now = new Date()) {
  const today = berlinDay(now);
  const soP = db().from("selbstopt_changes").select("created_at, kurz_titel, kurz_grund, status").order("created_at", { ascending: false }).limit(10)
    .then((r) => (r.error ? [] : (r.data ?? []) as SelbstoptRow[]), () => [] as SelbstoptRow[]);
  const metaP = db().from("decisions").select("created_at, kurz_titel, kurz_grund, subject").like("subject", "Meta: %").order("created_at", { ascending: false }).limit(10)
    .then(async (r) => (r.error ? null : anpassungen(await soP, (r.data ?? []) as MetaRow[])), () => null);
  const impP = db().from("brain_improvements").select("id", { count: "exact", head: true }).eq("status", "offen")
    .then((r) => (r.error ? null : r.count ?? 0), () => null);
  const [kpi, meta, offen] = await Promise.all([loadKpiDaily(addDays(today, -14), today).catch(() => []), metaP, impP]);
  return { score: gehirnScore(kpi, today), anpassungen: meta, offen };
}

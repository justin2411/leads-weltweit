import "server-only";
import { loadFunnelCache, loadWebsiteStats } from "@/lib/dashboard-data";
import { db } from "@/lib/supabase";
import { trichterPaket, type ScannerZeile, type Tage, type TrichterPaket } from "@/lib/jarvis-kpi";

/**
 * Website-Trichter der JARVIS-Zentrale (Seite /dashboard/jarvis und GET /api/jarvis/trichter). Nur lesen, gleiche
 * Quellen wie /dashboard/website/auswertung: website_stats(tage) (Tagessummen je Landingpage) und der Trichter-Cache
 * 'website_funnel' (Stripe-Käufe je Land), Link-Scanner aus web_scanner(tage) (abgezogen; fehlt die Messung → nichts abgezogen). Ergebnis 60 s im Speicher je Zeitraum; Ausfall → null (Oberfläche „keine Messung“).
 */
const MERK_MS = 60_000;
const merk: Partial<Record<Tage, { at: number; p: Promise<TrichterPaket | null> }>> = {};

async function scanner(tage: Tage): Promise<ScannerZeile[] | null> {
  const { data, error } = await db().rpc("web_scanner", { p_days: tage }).abortSignal(AbortSignal.timeout(8000));
  if (error) throw new Error(error.message);
  const rows = (data as { rows?: ScannerZeile[] } | null)?.rows;
  return Array.isArray(rows) ? rows : null;
}

async function rechne(tage: Tage): Promise<TrichterPaket | null> {
  const [st, fu, sc] = await Promise.allSettled([loadWebsiteStats(tage), loadFunnelCache(), scanner(tage)]);
  if (st.status === "rejected") { console.error("jarvis-trichter:", st.reason); return null; }
  const kaeufe = fu.status === "fulfilled" ? fu.value?.buy?.[tage === 7 ? "7d" : "30d"] ?? null : null;
  return trichterPaket(st.value, kaeufe, tage, st.value?.now ?? new Date().toISOString(), sc.status === "fulfilled" ? sc.value : null);
}

export function loadTrichter(tage: Tage): Promise<TrichterPaket | null> {
  const m = merk[tage];
  if (m && Date.now() - m.at < MERK_MS) return m.p;
  const p = rechne(tage).catch(() => null);
  merk[tage] = { at: Date.now(), p };
  // Fehlschlag nicht 60 s lang merken
  void p.then((x) => { if (!x && merk[tage]?.p === p) merk[tage] = undefined; });
  return p;
}

import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/supabase";
import { CONFIG, loadLive, loadOwnerSettings } from "@/lib/dashboard-data";
import { sampleStock } from "@/lib/dashboard-logic";
import type { ProbeRow, SegmentInfo, StorageData } from "@/lib/storage";

/**
 * Daten der Speicher-Ansicht (/dashboard/speicher). Zählungen aus signalwerk.dashboard_storage()
 * (Migration 20261004030200, ~1 s warm) + Mail-Länder je Zielgruppe, 5 min zwischengespeichert (nur Zahlen, keine
 * Firmendaten). Fehler werden nicht zwischengespeichert (unstable_cache speichert nur erfolgreiche Ergebnisse).
 */
export type Storage = StorageData & { segments: SegmentInfo[] };

export const loadStorage = unstable_cache(
  async (): Promise<Storage> => {
    const [st, seg] = await Promise.all([
      db().rpc("dashboard_storage").abortSignal(AbortSignal.timeout(25_000)),
      db().from("segments").select("id, email_countries").abortSignal(AbortSignal.timeout(5000)),
    ]);
    if (st.error) throw new Error(`dashboard_storage: ${st.error.message}`);
    if (seg.error) throw new Error(`segments: ${seg.error.message}`);
    return { ...(st.data as StorageData), segments: (seg.data ?? []) as SegmentInfo[] };
  },
  ["dashboard-storage-v1"],
  { revalidate: 300, tags: ["dashboard-stock"] },
);

/**
 * Proben-Vorrat je Live-Seite: Ist aus dashboard_live, Soll wie im übrigen Dashboard (owner_settings.sample_targets,
 * sonst config/proben.yaml über lib/ops-config.json: Fokus fokus_je_seite, sonst andere_je_seite).
 */
export async function loadProben(): Promise<ProbeRow[]> {
  const [live, own] = await Promise.all([loadLive(), loadOwnerSettings()]);
  const cfg = { ...CONFIG, sample_overrides: own.sample_targets };
  return sampleStock(live, cfg, new Date(live.now)).map((r) => ({ key: r.key, slug: r.slug, ready: r.ready, target: r.target }));
}

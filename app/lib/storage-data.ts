import "server-only";
import { after } from "next/server";
import { db } from "@/lib/supabase";
import { CONFIG, loadLive, loadOwnerSettings } from "@/lib/dashboard-data";
import { sampleStock } from "@/lib/dashboard-logic";
import type { ProbeRow, SegmentInfo, StorageData } from "@/lib/storage";

/**
 * Daten der Speicher-Ansicht (/dashboard/speicher). Zählungen aus signalwerk.dashboard_storage()
 * (vorgerechnet in dashboard_cache, Migration 20261004190000) + Mail-Länder je Zielgruppe (nur Zahlen, keine Firmendaten).
 */
export type Storage = StorageData & { segments: SegmentInfo[] };

const STORAGE_FRESH_MS = 10 * 60_000;
let storageRefreshing: Promise<unknown> | null = null;
async function refreshStorage(): Promise<StorageData> {
  const p = (async () => {
    const r = await db().rpc("dashboard_storage_refresh").abortSignal(AbortSignal.timeout(110_000));
    if (r.error) throw new Error(`dashboard_storage_refresh: ${r.error.message}`);
    return r.data as StorageData;
  })();
  storageRefreshing = p.finally(() => { storageRefreshing = null; });
  return p;
}

/**
 * Zählungen sofort aus signalwerk.dashboard_cache ('storage'); älter als 10 min → im Hintergrund neu rechnen (after),
 * die Seite wartet nicht. Nur ohne gespeicherten Stand wird direkt gerechnet (dauert bei großem Bestand > 20 s).
 */
export async function loadStorage(): Promise<Storage> {
  const [cache, seg] = await Promise.all([
    db().from("dashboard_cache").select("value, updated_at").eq("name", "storage").abortSignal(AbortSignal.timeout(4000)).maybeSingle(),
    db().from("segments").select("id, email_countries").abortSignal(AbortSignal.timeout(5000)),
  ]);
  if (seg.error) throw new Error(`segments: ${seg.error.message}`);
  let data = cache.data?.value as StorageData | undefined;
  if (!data) data = await refreshStorage();
  else if (Date.now() - Date.parse(cache.data!.updated_at) > STORAGE_FRESH_MS && !storageRefreshing) {
    after(() => refreshStorage().catch(() => {}));
  }
  return { ...data, segments: (seg.data ?? []) as SegmentInfo[] };
}

/**
 * Proben-Vorrat je Live-Seite: Ist aus dashboard_live, Soll wie im übrigen Dashboard (owner_settings.sample_targets,
 * sonst config/proben.yaml über lib/ops-config.json: Fokus fokus_je_seite, sonst andere_je_seite).
 */
export async function loadProben(): Promise<ProbeRow[]> {
  const [live, own] = await Promise.all([loadLive(), loadOwnerSettings()]);
  const cfg = { ...CONFIG, sample_overrides: own.sample_targets };
  return sampleStock(live, cfg, new Date(live.now)).map((r) => ({ key: r.key, slug: r.slug, ready: r.ready, target: r.target }));
}

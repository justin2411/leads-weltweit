import "server-only";
import { db } from "@/lib/supabase";
import { CONFIG, COUNTRIES, SEGMENT, canDispatch, loadActivity, loadLive, loadPremium } from "@/lib/dashboard-data";
import { mailboxes } from "@/lib/dashboard-logic";
import { running, type Beat } from "@/lib/leitstand";
import { merge, type LaneRegistry, type OwnerSettings, type SettingKey } from "@/lib/owner-settings";
import type { Ack, ReglerCtx } from "@/lib/regler";
import type { LogRow } from "@/lib/regler-verlauf";
import type { StartRequest } from "@/lib/start-queue";
import LANES from "@/lib/werk-linien.json";

/**
 * Daten des Reglers (Inhaber 03.10.2026: „einfache anpassungen direkt einstellen … immer mit einem button“). Nur
 * serverseitig, nichts zwischengespeichert (kleine Tabellen): Einstellungen mit updated_at, Quittungen der Werke
 * (settings_ack), offene/letzte Startwünsche, Live-Seiten mit fertigen Proben, laufende Teile, Versand heute, Verlauf.
 * Einstellungen werden streng geladen: Fehler -> `error` (die Seite sperrt dann „Übernehmen“, statt Standardwerte zu
 * zeigen und darüber zu speichern).
 */
export const REG = LANES as unknown as LaneRegistry;
/** Seiten im Regler: Fokus-Seiten der Dashboard-Zielgruppe (Webagenturen US/UK/FR). */
export const FOCUS_PAGES = COUNTRIES.map((c) => `${SEGMENT}/${c}`);

export function reglerCtx(pages: string[] = FOCUS_PAGES): ReglerCtx {
  return { reg: REG, pages, buyerCountries: COUNTRIES, proben: CONFIG.proben, fokus: CONFIG.fokus, followupDefault: 4 };
}

/** Gespeicherte Einstellungen mit Zeitpunkt je Schlüssel – wirft bei Fehlern (für Speichern und Anzeige). */
export async function loadSettingsStrict(): Promise<{ saved: OwnerSettings; updatedAt: Partial<Record<SettingKey, string>> }> {
  const { data, error } = await db().from("owner_settings").select("key, value, updated_at").abortSignal(AbortSignal.timeout(6000));
  if (error) throw new Error(error.message);
  const rows = (data ?? []) as { key: string; value: unknown; updated_at: string }[];
  return { saved: merge(rows), updatedAt: Object.fromEntries(rows.map((r) => [r.key, r.updated_at])) };
}

export type ReglerData = {
  now: string;
  error: string | null;
  saved: OwnerSettings;
  updatedAt: Partial<Record<SettingKey, string>>;
  acks: Ack[];
  starts: StartRequest[];
  pages: string[];
  /** fertige Proben je Seite */
  ready: Record<string, number>;
  /** Premium je Seite: fertige Premium-Proben (10/10) und freie Premium-Leads (premium_status); null = nicht lesbar */
  premium: Record<string, { ready: number; free: number }> | null;
  /** laufende Teile je Werk (Herzschlag ≤ 6 min) */
  running: Record<string, number>;
  versand: { aktiv: boolean; today: number; cap: number } | null;
  log: LogRow[];
  dispatch: boolean;
};

async function safe<T>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>, fallback: T): Promise<T> {
  try {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return (data ?? fallback) as T;
  } catch {
    return fallback;
  }
}

export async function loadRegler(): Promise<ReglerData> {
  const since = new Date(Date.now() - 3 * 3_600_000).toISOString();
  const [settings, acks, starts, log, live, act, prem] = await Promise.all([
    loadSettingsStrict().then((x) => ({ ...x, error: null as string | null }), (e: Error) => ({ saved: merge([]), updatedAt: {}, error: e.message || "Einstellungen nicht lesbar" })),
    safe<Ack[]>(db().from("settings_ack").select("werk, key, seen_at, value").abortSignal(AbortSignal.timeout(5000)), []),
    safe<StartRequest[]>(db().from("start_requests").select("id, created_at, workflow, status, started_at, note").gte("created_at", since)
      .order("created_at", { ascending: false }).limit(30).abortSignal(AbortSignal.timeout(5000)), []),
    safe<LogRow[]>(db().from("owner_log").select("id, action, target, old_value, new_value, created_at, created_by").like("action", "setting:%")
      .order("created_at", { ascending: false }).limit(8).abortSignal(AbortSignal.timeout(5000)), []),
    loadLive().catch(() => null),
    loadActivity(),
    loadPremium(),
  ]);
  const premium = prem ? Object.fromEntries(prem.map((r) => [`${r.segment_id}/${r.country}`, { ready: r.proben_premium, free: r.premium_frei }])) : null;
  const livePages = live ? new Set(live.pages.map((p) => `${p.segment_id}/${p.country}`)) : null;
  const pages = livePages ? FOCUS_PAGES.filter((k) => livePages.has(k)) : FOCUS_PAGES;
  const ready = Object.fromEntries(FOCUS_PAGES.map((k) => {
    const [seg, c] = k.split("/");
    return [k, Number(live?.stock.find((s) => s.segment_id === seg && s.country === c)?.ready ?? 0)];
  }));
  const t = Date.parse(act.now) || Date.now();
  const run: Record<string, number> = {};
  for (const b of act.heartbeats as Beat[]) if (running(b, t)) run[b.werk] = (run[b.werk] ?? 0) + 1;
  const boxes = live ? mailboxes(live, CONFIG) : null;
  return {
    now: new Date().toISOString(), error: settings.error, saved: settings.saved, updatedAt: settings.updatedAt,
    acks, starts, pages, ready, premium, running: run, log,
    versand: boxes ? { aktiv: CONFIG.versand.aktiv !== false, today: boxes.reduce((a, b) => a + b.today, 0), cap: boxes.reduce((a, b) => a + b.cap, 0) } : null,
    dispatch: canDispatch(),
  };
}

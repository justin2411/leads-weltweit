/**
 * Live-Zustand der Werke (Inhaber 03.10.2026: „es soll sich alles wie ein werk anfühlen wo ich genau von weitem auch
 * weiss es ist aktiv und arbeitet oder nicht“). Reine Funktionen ohne Next/Supabase (testbar).
 *
 * „läuft“ = echtes Lebenszeichen: Herzschlag des Werks (signalwerk.werk_heartbeat, alle ~2 min) jünger als
 * LIVE_BEAT_MIN, oder Aktivität in der Datenbank in den letzten LIVE_MIN Minuten (neue Leads, geprüfte Käufer,
 * gebaute Proben, gesendete Mails …). Ohne GitHub-Token ist das die einzige ehrliche Quelle.
 */
export const LIVE_MIN = 15;
export const LIVE_BEAT_MIN = 6;

export type Heartbeat = { werk: string; part: string; run_id: string | null; started_at: string | null; beat_at: string; processed: number; green: number; note: string | null };
export type Activity = {
  now: string;
  heartbeats: Heartbeat[];
  last_run: Record<string, string>;
  last_lead_at: string | null; leads_15m: number; leads_60m: number;
  last_prospect_at: string | null; last_prospect_checked_at: string | null; buyers_ok_60m: number;
  last_sent_at: string | null; sent_15m: number; sent_60m: number;
  last_reply_at: string | null; replies_60m: number;
  stock_last_built: string | null; stock_built_60m: number; stock_sent_60m: number; last_stock_sent_at: string | null;
  last_request_at: string | null;
  last_gate_at: string | null; gate_60m: Record<string, number>;
  stichprobe: { country: string; finished_at: string; candidates: number; green: number; red: number; reasons: Record<string, number> }[];
};

export const EMPTY_ACTIVITY: Activity = {
  now: new Date(0).toISOString(), heartbeats: [], last_run: {}, last_lead_at: null, leads_15m: 0, leads_60m: 0,
  last_prospect_at: null, last_prospect_checked_at: null, buyers_ok_60m: 0, last_sent_at: null, sent_15m: 0, sent_60m: 0,
  last_reply_at: null, replies_60m: 0, stock_last_built: null, stock_built_60m: 0, stock_sent_60m: 0, last_stock_sent_at: null,
  last_request_at: null, last_gate_at: null, gate_60m: {}, stichprobe: [],
};

const MIN = 60_000;
const minsSince = (ts: string | null | undefined, now: Date) => (ts ? (now.getTime() - Date.parse(ts)) / MIN : Infinity);
const newest = (...ts: (string | null | undefined)[]) => ts.filter(Boolean).sort().pop() ?? null;

export type WerkId = "lead-werk" | "kunden-werk" | "proben-vorrat" | "versand" | "antworten" | "freigabe";

/** Laufende Teile eines Werks (Herzschlag frisch, nicht „fertig“). */
export function liveParts(a: Activity, werk: string, now: Date): Heartbeat[] {
  return a.heartbeats.filter((h) => h.werk === werk && minsSince(h.beat_at, now) <= LIVE_BEAT_MIN && !/^fertig|^abgebrochen/.test(h.note ?? ""));
}

/** Arbeitet das Werk gerade? (für Animationen: nur dann bewegt sich etwas) */
export function isLive(a: Activity, werk: WerkId, now: Date): boolean {
  const recent = (ts: string | null | undefined) => minsSince(ts, now) <= LIVE_MIN;
  switch (werk) {
    case "lead-werk": return liveParts(a, werk, now).length > 0 || a.leads_15m > 0;
    case "kunden-werk": return liveParts(a, werk, now).length > 0 || recent(a.last_prospect_checked_at) || recent(a.last_prospect_at);
    case "proben-vorrat": return liveParts(a, werk, now).length > 0 || recent(a.stock_last_built);
    case "versand": return a.sent_15m > 0 || recent(a.last_sent_at);
    case "antworten": return recent(a.last_reply_at);
    case "freigabe": return recent(a.last_gate_at);
  }
}

/** Letzte Aktivität irgendeiner Art (Herzschlag, Laufende, neues Ergebnis). */
export function lastActivity(a: Activity, werk: WerkId): string | null {
  const beats = a.heartbeats.filter((h) => h.werk === werk).map((h) => h.beat_at);
  const run = a.last_run[werk];
  switch (werk) {
    case "lead-werk": return newest(a.last_lead_at, run, ...beats);
    case "kunden-werk": return newest(a.last_prospect_at, a.last_prospect_checked_at, run, ...beats);
    case "proben-vorrat": return newest(a.stock_last_built, run, ...beats);
    case "versand": return a.last_sent_at;
    case "antworten": return a.last_reply_at;
    case "freigabe": return newest(a.last_gate_at, a.last_run.freigabe);
  }
}

export type WerkStatus = { cls: "t-blue" | "t-green" | "t-gold" | "t-red" | "t-grey"; label: string; why: string; live: boolean };

/**
 * Ehrlicher Status je Werk.
 * - pausiert (Inhaber) -> grau
 * - läuft (Lebenszeichen) -> blau, animiert
 * - letzter GitHub-Lauf fehlgeschlagen -> rot
 * - Kunden-Werk: läuft regelmäßig, findet aber keine NEUEN Käufer (Overture-Pool erschöpft) -> gelb mit Grund, nicht „aus“
 * - sonst nach Alter der letzten Aktivität: aktiv / zu still / steht
 */
export function werkStatus(o: {
  werk: WerkId; a: Activity; now: Date; maxH: number; pausedSince?: string | null; off?: boolean;
  run?: { status: string; conclusion: string | null } | null;
}): WerkStatus {
  const { werk, a, now, maxH } = o;
  if (o.off || o.pausedSince) {
    return { cls: "t-grey", label: "pausiert", why: o.pausedSince ? `vom Inhaber pausiert seit ${new Date(o.pausedSince).toLocaleString("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}` : "vom Inhaber ausgeschaltet", live: false };
  }
  const live = isLive(a, werk, now);
  if (live || (o.run && o.run.status !== "completed")) {
    const parts = liveParts(a, werk, now);
    return { cls: "t-blue", label: "läuft", why: parts.length ? `${parts.length} Teil(e) aktiv` : "Aktivität in den letzten 15 min", live: true };
  }
  if (o.run?.conclusion && !["success", "skipped", "cancelled"].includes(o.run.conclusion)) {
    return { cls: "t-red", label: o.run.conclusion, why: "letzter GitHub-Lauf", live: false };
  }
  const last = lastActivity(a, werk);
  const h = minsSince(last, now) / 60;
  if (werk === "kunden-werk") {
    const newH = minsSince(a.last_prospect_at, now) / 60;
    if (h <= maxH && newH > maxH) {
      const lifted = a.buyers_ok_60m ? ` · ${a.buyers_ok_60m} Käufer in der letzten Stunde nachgeprüft (mail-fähig)` : "";
      return { cls: "t-gold", label: "läuft – Pool erschöpft", why: `prüft regelmäßig, aber keine neuen Käufer seit ${Math.round(newH)} h (Overture-Liste abgearbeitet)${lifted}`, live: false };
    }
  }
  if (h <= maxH) return { cls: "t-green", label: "aktiv", why: "", live: false };
  if (h <= maxH * 2.5) return { cls: "t-gold", label: "zu still", why: `letzte Aktivität vor ${Math.round(h)} h`, live: false };
  return { cls: "t-red", label: last ? "steht" : "unbekannt", why: last ? `letzte Aktivität vor ${Math.round(h)} h` : "keine Daten", live: false };
}

/** Fehlerquote der täglichen Freigabe-Stichprobe je Land und Ampel (über 2 % gelb, über 5 % rot). */
export function sampleErrorRate(s: Activity["stichprobe"]): { country: string; rate: number | null; level: "gruen" | "gelb" | "rot" | "grau"; checked: number; at: string }[] {
  return s.map((r) => {
    const rate = r.candidates ? (r.candidates - r.green) / r.candidates : null;
    const level = rate === null ? "grau" : rate > 0.05 ? "rot" : rate > 0.02 ? "gelb" : "gruen";
    return { country: r.country, rate, level, checked: r.candidates, at: r.finished_at };
  });
}

/** Fließtempo einer Leitung (Sekunden je Punkt): mehr Aktivität = schneller, 0 = steht. */
export function flowSeconds(perHour: number): number | null {
  if (!perHour || perHour <= 0) return null;
  return Math.max(1.2, Math.min(8, 8 / Math.log10(10 + perHour)));
}

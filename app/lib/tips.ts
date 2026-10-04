/**
 * Empfehlungen und Hinweise ausblenden (Inhaber 04.10.2026: „ich möchte hier was jarvis empfiehlt auch sachen löschen
 * können sehr einfach“). Reine Funktionen: stabiler Schlüssel, Ablauf, Filter. Gespeichert in
 * owner_settings.dismissed_tips = { schlüssel: "bis"-Zeitpunkt (ISO) }. Standard 7 Tage; rote Alarme (Sicherheit:
 * Notbremse, Spam, Freigabe rot) höchstens 24 h – danach erscheinen sie wieder, solange sie gelten.
 */

export const DISMISS_DAYS = 7;
export const ALARM_HOURS = 24;
export const MAX_DISMISSALS = 200;
const KEY_RX = /^[a-z0-9äöüß|:/ -]{3,160}$/;

export type DismissMap = Record<string, string>;
export type TipLike = { level: string; title: string; task?: { kind?: string | null; market?: string | null } | null };

/**
 * Stabiler Schlüssel aus Art + Markt + Titel ohne Zahlen: „3 Antworten offen“ und „4 Antworten offen“ sind derselbe
 * Hinweis. Art = Auftragsart, sonst „hinweis“; Markt sonst „-“.
 */
export function tipKey(t: TipLike): string {
  const title = String(t.title ?? "")
    .toLowerCase()
    .replace(/[0-9]+(?:[.,][0-9]+)*/g, " ")
    .replace(/[^a-z0-9äöüß:/ -]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120)
    .trim();
  const kind = String(t.task?.kind ?? "hinweis").toLowerCase().replace(/[^a-z]/g, "") || "hinweis";
  const market = String(t.task?.market ?? "-").toLowerCase().replace(/[^a-z]/g, "") || "-";
  return `${kind}|${market}|${title || "ohne titel"}`;
}

/** Rote Alarme (Sicherheit) lassen sich nur kurz (24 h) ausblenden. */
export const isAlarm = (t: { level: string }) => t.level === "rot";

/** Bis wann ausgeblendet: rot 24 h, sonst 7 Tage. */
export function dismissUntil(level: string, now: Date): string {
  const ms = level === "rot" ? ALARM_HOURS * 3_600_000 : DISMISS_DAYS * 86_400_000;
  return new Date(now.getTime() + ms).toISOString();
}

export class DismissError extends Error {}

/** Schlüssel aus dem Formular prüfen (nur so geformte Schlüssel, wie tipKey sie baut). */
export function validateKey(raw: unknown): string {
  const k = String(raw ?? "").trim();
  if (!KEY_RX.test(k) || k.split("|").length !== 3) throw new DismissError("Hinweis unbekannt");
  return k;
}

/** Nur noch gültige Einträge (abgelaufene und kaputte fallen weg). */
export function activeDismissals(map: unknown, now: Date): DismissMap {
  const out: DismissMap = {};
  if (!map || typeof map !== "object" || Array.isArray(map)) return out;
  for (const [k, v] of Object.entries(map as Record<string, unknown>)) {
    const t = typeof v === "string" ? Date.parse(v) : NaN;
    if (Number.isFinite(t) && t > now.getTime()) out[k] = new Date(t).toISOString();
  }
  return out;
}

/** Neuer Wert nach „X“: abgelaufene aufräumen, Eintrag setzen, höchstens MAX_DISMISSALS (früheste Ablaufzeit fliegt). */
export function addDismissal(map: unknown, key: string, level: string, now: Date): DismissMap {
  const out: DismissMap = { ...activeDismissals(map, now), [validateKey(key)]: dismissUntil(level, now) };
  const keys = Object.keys(out);
  if (keys.length <= MAX_DISMISSALS) return out;
  const keep = keys.sort((a, b) => (out[a] < out[b] ? 1 : -1)).slice(0, MAX_DISMISSALS);
  return Object.fromEntries(keep.map((k) => [k, out[k]]));
}

/** Neuer Wert nach „rückgängig“. */
export function removeDismissal(map: unknown, key: string, now: Date): DismissMap {
  const out = activeDismissals(map, now);
  delete out[validateKey(key)];
  return out;
}

/**
 * Ist der Hinweis gerade ausgeblendet? Rote Alarme nur, wenn der Eintrag höchstens 24 h in die Zukunft reicht – ein
 * als gelb für 7 Tage ausgeblendeter Hinweis, der rot wird, erscheint also sofort wieder.
 */
export function isDismissed(t: TipLike, map: unknown, now: Date): boolean {
  const until = activeDismissals(map, now)[tipKey(t)];
  if (!until) return false;
  if (isAlarm(t)) return Date.parse(until) <= now.getTime() + ALARM_HOURS * 3_600_000;
  return true;
}

/** Sichtbare Hinweise (Reihenfolge bleibt). */
export function visibleTips<T extends TipLike>(tips: T[], map: unknown, now: Date): T[] {
  return tips.filter((t) => !isDismissed(t, map, now));
}

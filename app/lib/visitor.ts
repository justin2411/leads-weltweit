/**
 * Eindeutige Besucher ohne Cookies und ohne gespeicherte IP (Inhaber 04.10.2026: „kannst du dort nur eindeutige nutzer
 * tracken nicht wenn jemand wie ich mehrmals aufgerufen hat“). Reine Funktionen für /api/events (serverseitig).
 *
 * Tages-Besucher-Schlüssel = SHA-256(Tages-Salz | IP | User-Agent | Tag). Das Salz ist ein Zufallswert je Tag, liegt nur
 * in der Datenbank (signalwerk.web_salt) und wird am nächsten Tag verworfen. Gespeichert wird nur der Hash, nie IP oder
 * User-Agent. Grenzen (ehrlich): derselbe Mensch auf zwei Geräten/Browsern oder mit wechselnder IP zählt doppelt;
 * mehrere Personen hinter derselben IP mit identischem Browser zählen einfach; über Mitternacht zählt er neu.
 */
import { createHash } from "node:crypto";

/** Kalendertag in deutscher Zeit (YYYY-MM-DD) – derselbe Tag wie in der Datenbank (Europe/Berlin). */
export function berlinDay(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

/**
 * IP des Aufrufers aus den Kopfzeilen der Plattform (Vercel setzt x-forwarded-for / x-real-ip selbst). Erster Eintrag,
 * IPv4-Port und IPv6-Klammern entfernt. Leer, wenn nichts Brauchbares da ist – dann wird kein Besucher gezählt.
 */
export function clientIp(h: { get(name: string): string | null }): string {
  const raw = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || (h.get("x-real-ip") ?? "").trim();
  let ip = raw.replace(/^\[([^\]]+)\](?::\d+)?$/, "$1");
  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.replace(/:\d+$/, "");
  if (!ip || ip.length > 64 || !/^[0-9a-f.:]+$/i.test(ip)) return "";
  return ip.toLowerCase();
}

/** Einweg-Hash (64 Hex-Zeichen). Ohne Salz, IP oder Tag kein Schlüssel. */
export function visitorHash(salt: string, ip: string, ua: string, day: string): string | null {
  if (!/^[0-9a-f]{64}$/.test(salt) || !ip || !/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  return createHash("sha256").update(`${salt}|${ip}|${String(ua ?? "").slice(0, 400)}|${day}`).digest("hex");
}

/**
 * Wird dieser Aufruf überhaupt gezählt? Nicht bei Inhaber-Sitzung, Vorschau (?vorschau=1 auf der Seite) oder
 * automatischen Abrufen (Bots, Link-Prüfer). Reine Entscheidung, die Prüfungen selbst macht der Aufrufer.
 */
export function countable(p: { owner: boolean; preview: boolean; bot: boolean }): boolean {
  return !p.owner && !p.preview && !p.bot;
}

/**
 * Salz je Server-Instanz zwischenspeichern: gültig nur für denselben deutschen Tag und höchstens maxAgeMs alt.
 * fetchSalt liefert { day, salt } aus der Datenbank (signalwerk.web_salt_today).
 */
export class SaltCache {
  private cur: { day: string; salt: string; at: number } | null = null;
  private pending: Promise<{ day: string; salt: string } | null> | null = null;
  private fetchSalt: () => Promise<{ day: string; salt: string } | null>;
  private maxAgeMs: number;
  constructor(fetchSalt: () => Promise<{ day: string; salt: string } | null>, maxAgeMs = 10 * 60_000) {
    this.fetchSalt = fetchSalt;
    this.maxAgeMs = maxAgeMs;
  }
  async get(now: Date = new Date()): Promise<{ day: string; salt: string } | null> {
    const today = berlinDay(now);
    if (this.cur && this.cur.day === today && now.getTime() - this.cur.at < this.maxAgeMs) return this.cur;
    if (!this.pending) {
      this.pending = this.fetchSalt()
        .then((x) => (x && /^[0-9a-f]{64}$/.test(x.salt) ? x : null), () => null)
        .finally(() => { this.pending = null; });
    }
    const x = await this.pending;
    if (!x) return null;
    this.cur = { ...x, at: now.getTime() };
    return x.day === today ? x : null;
  }
}

/** Kommt der Beacon von einer Vorschau-Seite (?vorschau=1)? Same-Origin-Referer enthält die volle Adresse. */
export function isPreviewRef(referer: string | null | undefined): boolean {
  try {
    return !!referer && new URL(referer).searchParams.get("vorschau") === "1";
  } catch {
    return false;
  }
}

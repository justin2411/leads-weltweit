/**
 * „Seite angesehen“ je Firma (Inhaber 05.10.2026, US/UK/FR; Datenschutzfrage UK/FR beim Inhaber): Besuch der
 * Landingpage über den persönlichen Link der Kaltmail (?r=<Token>). Gezählt wird nur ein Beacon, den der Browser per
 * JavaScript nach ≥ 3 s sichtbarer Seite oder der ersten Interaktion schickt (tracker.tsx) – kein Zählbild, kein Pixel,
 * nichts in der Mail. Reine Funktionen ohne Next/Supabase, damit sie testbar sind.
 *
 * Link-Scanner (wie bei Abmeldungen und web_scanner, #404/#405): Aufrufe < 2 min nach dem Versand, bekannte
 * Scanner-/Bot-User-Agents (lib/website-stats.ts isBot, inkl. headless/Playwright) und Rechenzentrums-Muster der
 * Anfrage (keine Accept-Language – echte Browser schicken sie immer) zählen nicht.
 */
import { isBot } from "./website-stats.ts";

/** Abstand zum Versand, unter dem ein Aufruf als Link-Scanner gilt (gleich SCANNER_SEK / web_scanner: 120 s). */
export const SCANNER_SEK = 120;
/** Sichtbare Zeit bzw. erste Interaktion, ab der der Browser den Besuch meldet. */
export const SEEN_MS = 3000;
export const PAGE_VIEW_COUNTRIES = ["US", "UK", "FR"] as const;

export const TOKEN_RE = /^[A-Za-z0-9_-]{8,80}$/;
export const validToken = (t: unknown): t is string => typeof t === "string" && TOKEN_RE.test(t);

export type ScanInput = {
  /** Versandzeit der Mail (messages.sent_at) */
  sentAt: string | null | undefined;
  now: Date;
  ua: string | null | undefined;
  acceptLanguage: string | null | undefined;
};

/** Grund, warum der Aufruf nicht zählt, oder null (= Mensch). */
export function scannerReason(x: ScanInput): "ua" | "zu_frueh" | "rechenzentrum" | "kein_versand" | null {
  if (isBot(x.ua)) return "ua";
  if (!String(x.acceptLanguage ?? "").trim()) return "rechenzentrum";
  const sent = x.sentAt ? Date.parse(x.sentAt) : NaN;
  if (!Number.isFinite(sent)) return "kein_versand";
  const sek = (x.now.getTime() - sent) / 1000;
  if (sek < SCANNER_SEK) return "zu_frueh";
  return null;
}

/** Höchstens ein Eintrag je Firma und deutschem Tag (email_events.dedupe_key ist eindeutig). */
export const pageViewedKey = (prospectId: string, day: string) => `page_viewed:${prospectId}:${day}`;

export type MailRef = { id: string; prospect_id: string | null; status: string | null; sent_at: string | null; country: string | null };

/** Gehört die Mail zur Seite (Land) und ist sie verschickt? Nur US/UK/FR. */
export function mailFits(m: MailRef | null, slugCountry: string): m is MailRef & { prospect_id: string } {
  if (!m || !m.prospect_id || m.status !== "sent") return false;
  const c = String(m.country ?? "").toUpperCase();
  return c === slugCountry.toUpperCase() && (PAGE_VIEW_COUNTRIES as readonly string[]).includes(c);
}

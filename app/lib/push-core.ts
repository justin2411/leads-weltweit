/**
 * Sofort-Alarm per Web-Push (Nachtschicht 03./04.10.2026): reine Hilfsfunktionen ohne Datenbank und ohne Netz,
 * damit sie mit node:test prüfbar sind. Genutzt von lib/push.ts (server-only) und app/api/push/route.ts.
 *
 * Signatur: HMAC-SHA256 über den rohen Request-Body, Schlüssel = SUPABASE_SERVICE_ROLE_KEY (kennen nur Server und
 * GitHub-Secrets), Kopfzeile X-Signature als Hex (optional mit Präfix „sha256=“). Der Body enthält `ts` (Unix-Sekunden);
 * älter oder neuer als 5 Minuten = abgelehnt. Gegenstück in Python: scripts/lib/push.py.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

export const MAX_SKEW_S = 5 * 60;
export const RATE_LIMIT = 30;
export const RATE_WINDOW_MS = 60 * 60 * 1000;
/** Nach so vielen „gibt es nicht mehr“-Antworten (404/410/403) wird ein Empfänger nicht mehr benutzt (nichts gelöscht). */
export const MAX_FAILURES = 3;

export const KINDS = ["buy", "question", "unclear", "sample", "checkout", "tagescheck", "notbremse", "test", "other"] as const;
export type PushKind = (typeof KINDS)[number];

export type PushPayload = { title: string; body: string; url: string; kind: PushKind; ts: number };

export function sign(rawBody: string, key: string): string {
  return createHmac("sha256", key).update(rawBody, "utf8").digest("hex");
}

/** Prüft Signatur (zeitkonstant) und Zeitstempel. Gibt das geprüfte JSON zurück oder null. */
export function verifySigned(rawBody: string, signature: string | null, key: string | undefined, nowMs = Date.now()):
  Record<string, unknown> | null {
  if (!key || !signature || rawBody.length > 4000) return null;
  const got = signature.trim().replace(/^sha256=/i, "").toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(got)) return null;
  const want = Buffer.from(sign(rawBody, key), "hex");
  if (!timingSafeEqual(want, Buffer.from(got, "hex"))) return null;
  let data: unknown;
  try { data = JSON.parse(rawBody); } catch { return null; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return null;
  const ts = Number((data as Record<string, unknown>).ts);
  if (!Number.isFinite(ts) || Math.abs(nowMs / 1000 - ts) > MAX_SKEW_S) return null;
  return data as Record<string, unknown>;
}

const clip = (x: unknown, n: number) => String(x ?? "").replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * Nur Pfade dieser Website (kein fremder Host, kein „//“, kein javascript:), sonst Antworten-Cockpit.
 * Volle Adressen der eigenen Website werden auf den Pfad gekürzt.
 */
export function safePath(url: unknown, siteUrl = ""): string {
  let u = String(url ?? "").trim();
  const site = siteUrl.replace(/\/+$/, "");
  if (site && u.toLowerCase().startsWith(site.toLowerCase() + "/")) u = u.slice(site.length);
  if (!/^\/(?![/\\])[A-Za-z0-9\-._~/?#[\]@!$&'()*+,;=%:]*$/.test(u) || u.length > 300) return "/dashboard/antworten";
  return u;
}

export function asKind(x: unknown): PushKind {
  return (KINDS as readonly string[]).includes(String(x)) ? (x as PushKind) : "other";
}

/** Inhalt der Benachrichtigung: kurz, ohne Steuerzeichen, Ziel nur innerhalb der Website. */
export function buildPayload(input: { title?: unknown; body?: unknown; url?: unknown; kind?: unknown },
                             siteUrl = "", nowMs = Date.now()): PushPayload | null {
  const title = clip(input.title, 80);
  if (!title) return null;
  return { title, body: clip(input.body, 240), url: safePath(input.url, siteUrl), kind: asKind(input.kind),
           ts: Math.floor(nowMs / 1000) };
}

/** Gleitendes Fenster: höchstens `limit` Alarme je Stunde (je Server-Instanz). */
export class RateLimiter {
  private hits: number[] = [];
  private limit: number;
  private windowMs: number;
  constructor(limit = RATE_LIMIT, windowMs = RATE_WINDOW_MS) { this.limit = limit; this.windowMs = windowMs; }
  take(nowMs = Date.now()): boolean {
    this.hits = this.hits.filter((t) => nowMs - t < this.windowMs);
    if (this.hits.length >= this.limit) return false;
    this.hits.push(nowMs);
    return true;
  }
}

/**
 * Getrennte Budgets (Review 04.10.2026): signierte Alarme (/api/push: Kaufinteresse, Frage, Notbremse …) und der
 * Test-Knopf haben ihr eigenes Budget (30/h); öffentliche Auslöser (Probe-Formular, Checkout) ein kleineres eigenes
 * (10/h). So kann Verkehr von außen nie das Budget für Kaufinteresse-/Frage-Alarme aufbrauchen.
 */
export const PUBLIC_RATE_LIMIT = 10;
export type PushBucket = "signed" | "public";

export class AlarmBudget {
  private buckets: Record<PushBucket, RateLimiter>;
  constructor(signed = RATE_LIMIT, pub = PUBLIC_RATE_LIMIT, windowMs = RATE_WINDOW_MS) {
    this.buckets = { signed: new RateLimiter(signed, windowMs), public: new RateLimiter(pub, windowMs) };
  }
  take(bucket: PushBucket, nowMs = Date.now()): boolean {
    return this.buckets[bucket].take(nowMs);
  }
}

/** Dieselbe Signatur nie zweimal (Wiederholung abgefangener Anfragen innerhalb der 5 Minuten). */
export class ReplayGuard {
  private seen = new Map<string, number>();
  private ttlMs: number;
  constructor(ttlMs = 2 * MAX_SKEW_S * 1000) { this.ttlMs = ttlMs; }
  fresh(sig: string, nowMs = Date.now()): boolean {
    for (const [k, t] of this.seen) if (nowMs - t > this.ttlMs) this.seen.delete(k);
    const key = sig.trim().replace(/^sha256=/i, "").toLowerCase();
    if (this.seen.has(key)) return false;
    this.seen.set(key, nowMs);
    return true;
  }
}

/** Bekannte Push-Dienste der Browser (Chrome/Android, Firefox, Safari/iOS, Edge). Andere Adressen speichern wir nicht. */
const PUSH_HOSTS = [/(^|\.)googleapis\.com$/, /(^|\.)mozilla\.com$/, /(^|\.)mozaws\.net$/, /(^|\.)push\.apple\.com$/,
                    /(^|\.)notify\.windows\.com$/];

export type PushSubscriptionInput = { endpoint: string; p256dh: string; auth: string };

/** Abo aus dem Browser prüfen (PushSubscription.toJSON()). */
export function validSubscription(x: unknown): PushSubscriptionInput | null {
  const s = x as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  const endpoint = String(s?.endpoint ?? "");
  const p256dh = String(s?.keys?.p256dh ?? "");
  const auth = String(s?.keys?.auth ?? "");
  if (endpoint.length > 1000 || !/^[A-Za-z0-9_-]{80,100}$/.test(p256dh) || !/^[A-Za-z0-9_-]{16,32}$/.test(auth)) return null;
  let u: URL;
  try { u = new URL(endpoint); } catch { return null; }
  if (u.protocol !== "https:" || u.username || u.password || (u.port && u.port !== "443")) return null;
  if (!PUSH_HOSTS.some((re) => re.test(u.hostname.toLowerCase()))) return null;
  return { endpoint: u.toString(), p256dh, auth };
}

/** Zählt der Fehler als „Empfänger gibt es nicht mehr / passt nicht mehr“? (sonst nur vorübergehend) */
export function isGoneStatus(status: number | undefined): boolean {
  return status === 404 || status === 410 || status === 403;
}

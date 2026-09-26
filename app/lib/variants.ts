/** Seitenvarianten und Ereignisse – reine Logik, ohne Datenbank (testbar). */

export type Variant = { id: string; traffic_share: number; status: string };

/** Zufällige Auswahl nach traffic_share, ohne Cookie (jeder Aufruf wird neu verteilt). */
export function pickVariant<T extends Variant>(variants: T[], rand: number = Math.random()): T | null {
  const pool = variants.filter((v) => v.traffic_share > 0);
  if (pool.length === 0) return variants[0] ?? null;
  const total = pool.reduce((s, v) => s + v.traffic_share, 0);
  let x = rand * total;
  for (const v of pool) {
    x -= v.traffic_share;
    if (x < 0) return v;
  }
  return pool[pool.length - 1];
}

/** Vom Browser erlaubte Ereignisse. Probe, Checkout und Kauf zählt nur der Server. */
export const CLIENT_EVENTS = new Set(["view", "cta_click"]);

export const FREEMAIL = new Set([
  "gmail.com", "googlemail.com", "yahoo.com", "yahoo.co.uk", "hotmail.com", "hotmail.co.uk", "outlook.com",
  "live.com", "msn.com", "aol.com", "icloud.com", "me.com", "gmx.de", "gmx.net", "web.de", "proton.me",
  "protonmail.com", "mail.com", "yandex.com", "orange.fr", "free.fr", "laposte.net", "wanadoo.fr",
]);

/** Geschäftliche Adresse: syntaktisch gültig und kein Freemail-Anbieter. */
export function isBusinessEmail(email: string): boolean {
  const m = /^[^\s@]+@([^\s@]+\.[a-z]{2,})$/i.exec(email.trim());
  return !!m && !FREEMAIL.has(m[1].toLowerCase());
}

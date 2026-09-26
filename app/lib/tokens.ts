import { createHmac, timingSafeEqual } from "node:crypto";

/** Signierter Link für das Filter-Formular eines Kunden (kein Login nötig, 30 Tage gültig). */
export function filterToken(customerId: string, secret: string, now = Date.now()): string {
  const exp = Math.floor(now / 1000) + 30 * 24 * 3600;
  const payload = `filter.${customerId}.${exp}`;
  return `${customerId}.${exp}.${createHmac("sha256", secret).update(payload).digest("base64url")}`;
}

export function verifyFilterToken(token: string | undefined, secret: string | undefined, now = Date.now()): string | null {
  if (!token || !secret) return null;
  const [id, exp, sig] = token.split(".");
  if (!id || !exp || !sig) return null;
  const expected = Buffer.from(createHmac("sha256", secret).update(`filter.${id}.${exp}`).digest("base64url"));
  const given = Buffer.from(sig);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  return Number(exp) * 1000 > now ? id : null;
}

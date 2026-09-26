import { createHmac, timingSafeEqual } from "node:crypto";

export const SESSION_COOKIE = "sw_session";
const MAX_AGE_SECONDS = 60 * 60 * 24 * 14;

function sign(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

export function createSession(secret: string, now = Date.now()): string {
  const payload = `owner.${Math.floor(now / 1000) + MAX_AGE_SECONDS}`;
  return `${payload}.${sign(payload, secret)}`;
}

export function verifySession(token: string | undefined, secret: string | undefined, now = Date.now()): boolean {
  if (!token || !secret) return false;
  const i = token.lastIndexOf(".");
  if (i < 0) return false;
  const payload = token.slice(0, i);
  const given = Buffer.from(token.slice(i + 1));
  const expected = Buffer.from(sign(payload, secret));
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return false;
  const [who, exp] = payload.split(".");
  return who === "owner" && Number(exp) * 1000 > now;
}

export function passwordMatches(input: string, expected: string | undefined): boolean {
  if (!expected) return false;
  const a = createHmac("sha256", "pw").update(input).digest();
  const b = createHmac("sha256", "pw").update(expected).digest();
  return timingSafeEqual(a, b);
}

export const sessionMaxAge = MAX_AGE_SECONDS;

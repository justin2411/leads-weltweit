import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe ohne SDK (nur fetch). Ohne STRIPE_SECRET_KEY und STRIPE_WEBHOOK_SECRET ist der Bezahlablauf aus.
 * Testmodus: Schlüssel mit sk_test_… verwenden.
 */
export function stripeEnabled(): boolean {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_WEBHOOK_SECRET);
}

export function stripeTestMode(): boolean {
  return (process.env.STRIPE_SECRET_KEY || "").startsWith("sk_test_");
}

/** Stripe-Signatur prüfen (Header "t=…,v1=…"), Toleranz 5 Minuten. */
export function verifyStripeSignature(secret: string, header: string | null, body: string, nowSec = Math.floor(Date.now() / 1000)): boolean {
  if (!secret || !header) return false;
  const parts = header.split(",").map((p) => p.trim().split("="));
  const t = parts.find(([k]) => k === "t")?.[1];
  const sigs = parts.filter(([k]) => k === "v1").map(([, v]) => v);
  if (!t || sigs.length === 0 || Math.abs(nowSec - Number(t)) > 300) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(`${t}.${body}`).digest("hex"));
  return sigs.some((s) => {
    const given = Buffer.from(s ?? "");
    return given.length === expected.length && timingSafeEqual(given, expected);
  });
}

/** Verschachtelte Parameter im Stripe-Formularformat (a[b][0][c]=…). */
export function formEncode(obj: Record<string, unknown>, prefix = ""): string {
  const out: string[] = [];
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    const key = prefix ? `${prefix}[${k}]` : k;
    if (typeof v === "object") out.push(formEncode(v as Record<string, unknown>, key));
    else out.push(`${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`);
  }
  return out.filter(Boolean).join("&");
}

export async function stripe(path: string, params?: Record<string, unknown>, method = "POST"): Promise<any> {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: method === "GET" ? undefined : formEncode(params ?? {}),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${path}: ${data?.error?.message ?? res.status}`);
  return data;
}

export const STATUS_MAP: Record<string, string> = {
  active: "active", trialing: "active", past_due: "past_due", unpaid: "past_due", canceled: "cancelled",
  incomplete: "incomplete", incomplete_expired: "cancelled", paused: "paused",
};

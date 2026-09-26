import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Stripe ohne SDK (nur fetch). Zwei Schlüsselpaare:
 *   live: STRIPE_SECRET_KEY + STRIPE_WEBHOOK_SECRET               (echte Zahlungen, nur öffentliche Seiten in Produktion)
 *   test: STRIPE_TEST_SECRET_KEY + STRIPE_TEST_WEBHOOK_SECRET     (Vorschau-Deployments und Inhaber-Vorschau)
 * Fehlt ein Paar, ist dieser Modus aus.
 */
export type StripeMode = "live" | "test";

export function stripeKeys(mode: StripeMode, env: Record<string, string | undefined> = process.env) {
  const secret = mode === "live" ? env.STRIPE_SECRET_KEY : env.STRIPE_TEST_SECRET_KEY;
  const webhook = mode === "live" ? env.STRIPE_WEBHOOK_SECRET : env.STRIPE_TEST_WEBHOOK_SECRET;
  // Sicherheitsnetz: im Testmodus nur Testschlüssel, im Live-Modus nie Testschlüssel
  const isTestKey = /^(sk|rk)_test_/.test(secret || "");
  if (!secret || !webhook || (mode === "test") !== isTestKey) return null;
  return { secret, webhook };
}

export function stripeEnabled(mode: StripeMode = "live", env: Record<string, string | undefined> = process.env): boolean {
  return stripeKeys(mode, env) !== null;
}

/** Welcher Modus für einen Kauf gilt: Vorschau-Deployments und Inhaber-Vorschau immer Test. */
export function checkoutMode(opts: { vercelEnv?: string; ownerPreview: boolean }): StripeMode {
  return opts.ownerPreview || (opts.vercelEnv ?? "production") !== "production" ? "test" : "live";
}

/** Preis-ID je Modus aus einem Paket (stripe_price_id live, stripe_test_price_id test). */
export function priceFor(plan: { stripe_price_id?: string; stripe_test_price_id?: string } | undefined, mode: StripeMode) {
  return mode === "live" ? plan?.stripe_price_id : plan?.stripe_test_price_id;
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

export async function stripe(path: string, params?: Record<string, unknown>, mode: StripeMode = "live", method = "POST"): Promise<any> {
  const keys = stripeKeys(mode);
  if (!keys) throw new Error(`Stripe ${mode} nicht eingerichtet`);
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${keys.secret}`,
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

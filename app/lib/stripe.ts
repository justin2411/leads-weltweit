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

export type Plan = {
  key: string; name: string; description?: string; price_label?: string;
  amount_cents?: number; currency?: string; interval?: "month" | "year";
  stripe_price_id?: string; stripe_test_price_id?: string;
};

/** Technische Plausibilität (kein Preislimit des Inhabers): 1–10.000 pro Monat, bekannte Währung. */
export function planValid(p: Plan | undefined): boolean {
  if (!p) return false;
  if (p.amount_cents !== undefined) {
    return Number.isInteger(p.amount_cents) && p.amount_cents >= 100 && p.amount_cents <= 1_000_000
      && ["eur", "gbp", "usd"].includes((p.currency ?? "").toLowerCase());
  }
  return false;
}

/**
 * Checkout-Position für ein Paket: feste Stripe-Preis-ID (falls hinterlegt) oder Preis direkt aus der Datenbank
 * (price_data). So kann das Gehirn Preise selbst setzen, ohne in Stripe Preise anzulegen.
 */
export function lineItemFor(plan: Plan | undefined, mode: StripeMode, brand: string): Record<string, unknown> | null {
  if (!plan) return null;
  const id = mode === "live" ? plan.stripe_price_id : plan.stripe_test_price_id;
  if (id) return { price: id, quantity: 1 };
  if (!planValid(plan)) return null;
  return {
    quantity: 1,
    price_data: {
      currency: plan.currency!.toLowerCase(),
      unit_amount: plan.amount_cents,
      recurring: { interval: plan.interval ?? "month" },
      product_data: { name: `${brand} – ${plan.name}` },
    },
  };
}

/** Anzeige, z. B. "£199" oder "249 €". */
export function priceLabel(plan: Plan): string {
  if (plan.price_label) return plan.price_label;
  if (plan.amount_cents === undefined) return "";
  const cur = (plan.currency ?? "eur").toUpperCase();
  return new Intl.NumberFormat(cur === "EUR" ? "de-DE" : "en-GB", { style: "currency", currency: cur, maximumFractionDigits: 0 })
    .format(plan.amount_cents / 100);
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

import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { formEncode, verifyStripeSignature } from "./stripe.ts";
import { filterToken, verifyFilterToken } from "./tokens.ts";
import { isBusinessEmail, pickVariant } from "./variants.ts";
import { canPublish, legalTextsReady } from "./legal.ts";
import { consentText } from "./consent.ts";

test("Stripe-Signatur: gültig, falsch, zu alt", () => {
  const secret = "whsec_test";
  const body = '{"id":"evt_1"}';
  const t = 1760000000;
  const sig = createHmac("sha256", secret).update(`${t}.${body}`).digest("hex");
  assert.equal(verifyStripeSignature(secret, `t=${t},v1=${sig}`, body, t + 10), true);
  assert.equal(verifyStripeSignature(secret, `t=${t},v1=${sig}`, body + " ", t + 10), false);
  assert.equal(verifyStripeSignature(secret, `t=${t},v1=${sig}`, body, t + 1000), false);
  assert.equal(verifyStripeSignature("", `t=${t},v1=${sig}`, body, t), false);
});

test("Stripe-Formularformat", () => {
  assert.equal(formEncode({ mode: "subscription", line_items: { 0: { price: "price_1", quantity: 1 } } }),
    "mode=subscription&line_items%5B0%5D%5Bprice%5D=price_1&line_items%5B0%5D%5Bquantity%5D=1");
});

test("Filter-Link: gültig, manipuliert, abgelaufen", () => {
  const now = Date.now();
  const tok = filterToken("cust-1", "s3cret", now);
  assert.equal(verifyFilterToken(tok, "s3cret", now), "cust-1");
  assert.equal(verifyFilterToken(tok.replace("cust-1", "cust-2"), "s3cret", now), null);
  assert.equal(verifyFilterToken(tok, "anders", now), null);
  assert.equal(verifyFilterToken(tok, "s3cret", now + 31 * 24 * 3600 * 1000), null);
});

test("Variante nach Anteil", () => {
  const vs = [{ id: "A", traffic_share: 50, status: "live" }, { id: "B", traffic_share: 50, status: "live" }];
  assert.equal(pickVariant(vs, 0.1)?.id, "A");
  assert.equal(pickVariant(vs, 0.9)?.id, "B");
  assert.equal(pickVariant([{ id: "A", traffic_share: 100, status: "live" }, { id: "B", traffic_share: 0, status: "live" }], 0.99)?.id, "A");
  assert.equal(pickVariant([], 0.5), null);
});

test("Geschäftliche E-Mail", () => {
  assert.equal(isBusinessEmail("ops@acme-recruitment.co.uk"), true);
  assert.equal(isBusinessEmail("someone@gmail.com"), false);
  assert.equal(isBusinessEmail("kein-at-zeichen"), false);
});

test("Rechtstexte sind Platzhalter -> nichts veröffentlichen", () => {
  assert.equal(legalTextsReady(), false);
  assert.equal(canPublish(true), false);
});

test("Einwilligungstext je Sprache", () => {
  assert.match(consentText("en"), /free sample of 10 leads/);
  assert.match(consentText("fr"), /échantillon gratuit/);
});

import { envStatus } from "./env.ts";
test("Umgebungsvariablen: nur gesetzt/fehlt, nie Werte", () => {
  const s = envStatus({ SUPABASE_URL: "https://x.supabase.co", STRIPE_SECRET_KEY: " " });
  assert.equal(s.find((e) => e.name === "SUPABASE_URL")?.set, true);
  assert.equal(s.find((e) => e.name === "STRIPE_SECRET_KEY")?.set, false);
  assert.ok(!JSON.stringify(s).includes("supabase.co"));
});

import { checkoutMode, lineItemFor, planValid, priceLabel, stripeKeys } from "./stripe.ts";
test("Stripe: Test- und Live-Schlüssel getrennt, nie vertauscht", () => {
  const env = { STRIPE_SECRET_KEY: "rk_live_x", STRIPE_WEBHOOK_SECRET: "whsec_l", STRIPE_TEST_SECRET_KEY: "sk_test_y", STRIPE_TEST_WEBHOOK_SECRET: "whsec_t" };
  assert.equal(stripeKeys("live", env)?.secret, "rk_live_x");
  assert.equal(stripeKeys("test", env)?.secret, "sk_test_y");
  assert.equal(stripeKeys("test", { ...env, STRIPE_TEST_SECRET_KEY: "sk_live_z" }), null);   // Live-Schlüssel im Test-Feld
  assert.equal(stripeKeys("live", { ...env, STRIPE_SECRET_KEY: "sk_test_z" }), null);       // Test-Schlüssel im Live-Feld
  assert.equal(checkoutMode({ vercelEnv: "production", ownerPreview: false }), "live");
  assert.equal(checkoutMode({ vercelEnv: "production", ownerPreview: true }), "test");
  assert.equal(checkoutMode({ vercelEnv: "preview", ownerPreview: false }), "test");
  assert.deepEqual(lineItemFor({ key: "a", name: "A", stripe_price_id: "price_live", stripe_test_price_id: "price_test" }, "test", "X"), { price: "price_test", quantity: 1 });
});

test("Preise aus der Datenbank (vom Gehirn gesetzt)", () => {
  const p = { key: "pro", name: "Pro", amount_cents: 19900, currency: "gbp" };
  const item: any = lineItemFor(p, "live", "NextGen Profit");
  assert.equal(item.price_data.unit_amount, 19900);
  assert.equal(item.price_data.recurring.interval, "month");
  assert.equal(priceLabel(p), "£199");
  assert.equal(planValid({ ...p, amount_cents: 50 }), false);        // unter 1
  assert.equal(planValid({ ...p, currency: "chf" }), false);         // unbekannte Währung
  assert.equal(lineItemFor({ key: "x", name: "X" }, "live", "B"), null);
});

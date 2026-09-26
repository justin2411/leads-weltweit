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

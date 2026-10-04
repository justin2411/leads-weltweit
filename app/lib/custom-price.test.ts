import { test } from "node:test";
import assert from "node:assert/strict";
import { basePlan, customCents, CUSTOM_MAX, CUSTOM_MIN, fromSlider, perMonth, PER_WEEK, toSlider, validWeekly } from "./custom-price.ts";

// Pakete (Inhaber 04.10.2026): Starter 129 bis 15, Pro 249 bis 40 Leads pro Woche
const PLANS = [
  { key: "starter", amount_cents: 12900, currency: "usd" },
  { key: "pro", amount_cents: 24900, currency: "usd" },
];
const pro = PLANS[1];

test("Paketmengen: Starter 15, Pro 40", () => {
  assert.deepEqual(PER_WEEK, { starter: 15, pro: 40 });
  assert.equal(basePlan(PLANS)?.key, "pro");
});

test("Kurve an Pro verankert: 40/Woche ergibt genau 249", () => {
  assert.equal(customCents(pro, 40), 24900);
});

test("Beispielwerte individuelles Volumen", () => {
  assert.equal(customCents(pro, 150), 59600);
  assert.equal(customCents(pro, 500), 131900);
  assert.equal(customCents(pro, 1000), 208400);
  assert.equal(customCents(pro, 10_000), 952400);
});

test("Monoton: mehr Leads kosten mehr, Preis pro Lead sinkt; Grenze unter 10.000 pro Monat", () => {
  let lastCents = customCents(pro, 40);
  let lastPer = lastCents / perMonth(40);
  for (let w = CUSTOM_MIN; w <= CUSTOM_MAX; w += 10) {
    const c = customCents(pro, w);
    const per = c / perMonth(w);
    assert.ok(c >= lastCents, `Preis fällt bei ${w}`);
    assert.ok(per <= lastPer + 0.01, `Preis pro Lead steigt bei ${w}`);
    lastCents = c; lastPer = per;
  }
  assert.ok(customCents(pro, CUSTOM_MAX) < 1_000_000);
  // Individuell ab 150 ist pro Lead günstiger als Pro
  assert.ok(customCents(pro, CUSTOM_MIN) / perMonth(CUSTOM_MIN) < 24900 / perMonth(40));
});

test("Pro pro Lead etwa 1,44", () => {
  assert.equal((24900 / 100 / (PER_WEEK.pro * 52 / 12)).toFixed(2), "1.44");
});

test("Regler und Mengenprüfung", () => {
  assert.equal(fromSlider(0), CUSTOM_MIN);
  assert.equal(fromSlider(1000), CUSTOM_MAX);
  assert.equal(fromSlider(toSlider(500)), 500);
  assert.equal(validWeekly(40), null);
  assert.equal(validWeekly(149), null);
  assert.equal(validWeekly(150), 150);
  assert.equal(validWeekly(10_001), null);
});

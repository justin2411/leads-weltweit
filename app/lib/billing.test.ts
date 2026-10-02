import { test } from "node:test";
import assert from "node:assert/strict";
import { billingOptions, chargesGermanVat, isoOf, normalizeBilling, vatMismatch } from "./billing.ts";

test("Rechnungsland: Länderliste, Standard, Steuer, Abgleich mit der Rechnungsadresse", () => {
  const en = billingOptions("en");
  assert.ok(en.length > 150 && en.some((o) => o.value === "DE" && o.label === "Germany"));
  assert.ok(en.findIndex((o) => o.value === "AT") < en.findIndex((o) => o.value === "DE"), "alphabetisch");
  assert.equal(billingOptions("fr").find((o) => o.value === "DE")?.label, "Allemagne");
  assert.equal(isoOf("uk"), "GB");
  assert.equal(normalizeBilling("de", "US"), "DE");
  assert.equal(normalizeBilling("xx", "UK"), "GB", "Unbekannt -> Land der Seite");
  assert.equal(normalizeBilling(undefined, "FR"), "FR");
  assert.ok(chargesGermanVat("DE"));
  assert.ok(!chargesGermanVat("AT") && !chargesGermanVat("US"));
  assert.ok(vatMismatch("US", "DE"), "deutsche Adresse, aber anderes Land gewählt");
  assert.ok(vatMismatch("DE", "GB"), "Deutschland gewählt, Adresse nicht in DE");
  assert.ok(!vatMismatch("GB", "GB") && !vatMismatch("DE", "de") && !vatMismatch("AT", "FR"));
  assert.ok(!vatMismatch("US", null), "ohne Adresse kein Alarm");
});

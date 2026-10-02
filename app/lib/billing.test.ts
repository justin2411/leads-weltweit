import { test } from "node:test";
import assert from "node:assert/strict";
import { billingOptions, chargesGermanVat, normalizeBilling, vatMismatch } from "./billing.ts";

test("Rechnungsland: Auswahl, Standard, Steuer, Abgleich mit der Rechnungsadresse", () => {
  assert.deepEqual(billingOptions("us", "en").map((o) => o.value), ["US", "DE", "EU", "OTHER"]);
  assert.equal(billingOptions("fr", "fr")[0].label, "France");
  assert.equal(normalizeBilling("de", "US"), "DE");
  assert.equal(normalizeBilling("xx", "UK"), "UK", "Unbekannt -> Land der Seite");
  assert.equal(normalizeBilling(undefined, "FR"), "FR");
  assert.ok(chargesGermanVat("DE"));
  assert.ok(!chargesGermanVat("EU") && !chargesGermanVat("US"));
  assert.ok(vatMismatch("US", "DE"), "deutsche Adresse, aber netto gewählt");
  assert.ok(vatMismatch("DE", "GB"), "19 % gewählt, Adresse nicht in DE");
  assert.ok(!vatMismatch("UK", "GB") && !vatMismatch("DE", "de") && !vatMismatch("EU", "FR"));
  assert.ok(!vatMismatch("US", null), "ohne Adresse kein Alarm");
});

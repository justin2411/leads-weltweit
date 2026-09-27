import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanFirm, fill, fillDeep, splitRegion } from "./personalize.ts";

test("Platzhalter mit Daten und mit Ersatzwörtern", () => {
  const p = { firma: "Harper & Co", ort: "Stockport", region: "Greater Manchester", branche: "payroll" };
  assert.equal(fill("New companies near {ort} for {firma}", p, "en"), "New companies near Stockport for Harper & Co");
  assert.equal(fill("Leads for {firma} in {region}", {}, "en"), "Leads for your firm in your area");
  assert.equal(fill("Pistes pour {firma}", {}, "fr"), "Pistes pour votre entreprise");
  assert.deepEqual(fillDeep([{ title: "{region}", text: "x" }], p, "en"), [{ title: "Greater Manchester", text: "x" }]);
});

test("Branchen-Wörter ersetzen, Unbekanntes bleibt stehen", () => {
  const w = { beruf: "accountants", leistung: "payroll" };
  assert.equal(fill("For {beruf} in {region}: {leistung} {unbekannt}", { region: "Leeds" }, "en", w), "For accountants in Leeds: payroll {unbekannt}");
  assert.deepEqual(fillDeep(["{beruf}"], {}, "en", w), ["accountants"]);
});

test("Firmenname und Region aufbereiten", () => {
  assert.equal(cleanFirm("Harper & Co Accountants Ltd"), "Harper & Co Accountants");
  assert.equal(cleanFirm("Weche Media LLC"), "Weche Media");
  assert.deepEqual(splitRegion("Stockport, Greater Manchester"), { ort: "Stockport", region: "Greater Manchester" });
  assert.deepEqual(splitRegion("Brooklyn, NY"), { ort: "Brooklyn", region: "Brooklyn" });
  assert.deepEqual(splitRegion(null), {});
});

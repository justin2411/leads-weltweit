import { test } from "node:test";
import assert from "node:assert/strict";
import { bySignal, parseChoice, patchFor, signalLabel, validToken, weight } from "./feedback.ts";

test("Token: nur url-sichere 20–64 Zeichen", () => {
  assert.equal(validToken("a".repeat(32)), true);
  assert.equal(validToken("abc"), false);
  assert.equal(validToken("a".repeat(31) + "'"), false);
  assert.equal(validToken(undefined), false);
});

test("Auswahl und Upsert-Felder: nur das angeklickte Feld", () => {
  assert.equal(parseChoice("gut"), "gut");
  assert.equal(parseChoice("delete"), null);
  assert.deepEqual(patchFor("schlecht"), { rating: "schlecht" });
  assert.deepEqual(patchFor("won"), { won: true });
  assert.deepEqual(patchFor("unwon"), { won: false });
});

test("Gewicht wie scripts/lib/feedback.py: erst ab 5 Bewertungen, begrenzt", () => {
  assert.equal(weight(2, 2, 0), 1);
  assert.equal(weight(5, 0, 0), 1.1);
  assert.equal(weight(0, 5, 0), 0.9);
  assert.equal(weight(100, 0, 100), 1.25);
  assert.equal(weight(0, 100, 0), 0.8);
});

test("Auswertung je Anlass summiert Länder", () => {
  const rows = [
    { signal_type: "no_website", country: "US", bewertungen: 4, gut: 4, schlecht: 0, gewonnen: 1, gut_pct: 100 },
    { signal_type: "no_website", country: "UK", bewertungen: 2, gut: 1, schlecht: 1, gewonnen: 0, gut_pct: 50 },
    { signal_type: "relocation", country: "FR", bewertungen: 1, gut: 0, schlecht: 1, gewonnen: 0, gut_pct: 0 },
  ];
  const s = bySignal(rows);
  assert.equal(s[0].signal_type, "no_website");
  assert.equal(s[0].bewertungen, 6);
  assert.deepEqual(s[0].laender, ["UK", "US"]);
  assert.equal(s[0].gut_pct, 83.3);
  assert.ok(s[0].weight > 1);
  assert.equal(s[1].weight, 1);
});

test("Anlass lesbar", () => {
  assert.equal(signalLabel("no_website", "fr"), "Pas de site web");
  assert.equal(signalLabel("contract_award", "en"), "Contract award");
  assert.equal(signalLabel("relocation", "de"), "Umzug");
});

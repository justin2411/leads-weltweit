import { test } from "node:test";
import assert from "node:assert/strict";
import { FINDER_SLUG, FINDER_TEXT, finderDate, finderLand, isLegalPersonName, pickExamples, rotationKey, type FinderRow } from "./finder.ts";

const rows: FinderRow[] = [
  { id: "1", name: "ACME WEB LTD", signal: "no_website", date: "2026-10-01" },
  { id: "2", name: "Honey Pot Daycare", signal: "no_website", date: "2026-10-02" },
  { id: "3", name: "John Smith", legal_form: null, signal: "website_outdated", date: "2026-10-02" },
  { id: "4", name: "Blue River LLC", signal: "website_outdated", date: "2026-09-30" },
  { id: "5", name: "Atelier Lumière SAS", signal: "no_https", date: "2026-09-29" },
  { id: "6", name: "Northwind Ltd", signal: "website_broken", date: "2026-09-28" },
  { id: "7", name: "Some Corp", signal: "new_incorporation", date: "2026-10-03" },
  { id: "8", name: "Беларусь LLC", signal: "no_website", date: "2026-10-03" },
];

test("finderLand: nur us, uk, fr", () => {
  assert.equal(finderLand("US"), "us");
  assert.equal(finderLand("fr"), "fr");
  assert.equal(finderLand("de"), null);
  assert.equal(finderLand(undefined), null);
  assert.equal(FINDER_SLUG.fr, "fr/agences-web");
});

test("isLegalPersonName: nur erkennbare Kapitalgesellschaften", () => {
  assert.equal(isLegalPersonName("ACME WEB LTD"), true);
  assert.equal(isLegalPersonName("Atelier Lumière", "Société par actions simplifiée"), true);
  assert.equal(isLegalPersonName("Honey Pot Daycare"), false);
  assert.equal(isLegalPersonName("John Smith", null), false);
  assert.equal(isLegalPersonName("Беларусь LLC"), false);
});

test("pickExamples: 3, je Firma einmal, keine Personennamen, nur Website-Befunde, nur Name/Anlass/Datum", () => {
  const ex = pickExamples(rows, "2026-10-04T10");
  assert.equal(ex.length, 3);
  assert.equal(new Set(ex.map((e) => e.name)).size, 3);
  for (const e of ex) {
    assert.deepEqual(Object.keys(e).sort(), ["date", "name", "signal"]);
    assert.ok(!/Honey|John|Some Corp|Беларусь/.test(e.name), e.name);
  }
  // verschiedene Befunde bevorzugt
  assert.equal(new Set(ex.map((e) => e.signal)).size, 3);
  // Registernamen lesbar
  assert.ok(ex.every((e) => e.name !== "ACME WEB LTD"));
});

test("pickExamples: Auswahl wechselt mit dem Schlüssel, ist aber je Schlüssel fest", () => {
  const many: FinderRow[] = Array.from({ length: 40 }, (_, i) => ({ id: String(i), name: `Firm ${i} Ltd`, signal: "no_website", date: "2026-10-01" }));
  const a = pickExamples(many, "2026-10-04T10").map((e) => e.name).join();
  assert.equal(pickExamples(many, "2026-10-04T10").map((e) => e.name).join(), a);
  const keys = ["2026-10-04T11", "2026-10-04T12", "2026-10-04T13"].map((k) => pickExamples(many, k).map((e) => e.name).join());
  assert.ok(keys.some((k) => k !== a));
});

test("rotationKey stündlich, Datum lokal", () => {
  assert.equal(rotationKey(new Date("2026-10-04T10:59:00Z")), "2026-10-04T10");
  assert.match(finderDate("2026-10-01", "fr"), /oct/);
  assert.match(finderDate("2026-10-01", "en"), /Oct/);
  assert.match(FINDER_TEXT.fr.title("en France"), /sans site web en France/);
});

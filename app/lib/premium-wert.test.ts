import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { beispielSatz, geld, rechnung, wertBlockAn, wertLand, type WertDaten } from "./premium-wert.ts";

const DATEN = JSON.parse(readFileSync(new URL("../content/premium-wert.json", import.meta.url), "utf8")) as WertDaten;
const CASES = JSON.parse(readFileSync(new URL("../../tests/fixtures/premium_wert_cases.json", import.meta.url), "utf8"));
const DOC = readFileSync(new URL("../../docs/PREMIUM-WERT.md", import.meta.url), "utf8");

test("gemeinsame Fälle: Beträge wie Python", () => {
  for (const c of CASES.geld) assert.equal(geld(c.x, c.sym, c.lang), c.out, JSON.stringify(c));
});

test("gemeinsame Fälle: Rechnung wie Python", () => {
  for (const c of CASES.rechnung) {
    const land = wertLand(DATEN, "S2", c.country)!;
    assert.deepEqual(rechnung(DATEN, land, c.plans), c.out, c.country);
  }
});

test("nur Webagenturen US/UK/FR", () => {
  assert.ok(wertLand(DATEN, "S2", "us"));
  assert.equal(wertLand(DATEN, "S1", "US"), null);
  assert.equal(wertLand(DATEN, "S2", "DE"), null);
  assert.equal(wertLand(DATEN, "S2", "IE"), null);
});

test("Rechnung stimmt mit PREMIUM-WERT.md (41/21, 33/17, 31/16 Monate)", () => {
  const plans = [{ key: "starter", amount_cents: 12900 }, { key: "pro", amount_cents: 24900 }];
  const m = (cc: string) => rechnung(DATEN, wertLand(DATEN, "S2", cc)!, plans)!.monate;
  assert.deepEqual(m("US"), { starter: 41, pro: 21 });
  assert.deepEqual(m("UK"), { starter: 33, pro: 17 });
  assert.deepEqual(m("FR"), { starter: 31, pro: 16 });
  assert.ok(DOC.includes("US 41 / 21 Monate (Starter / Pro), UK 33 / 17, FR 31 / 16"));
});

test("nur Zahlen und Quellen aus PREMIUM-WERT.md", () => {
  for (const v of DATEN.vergleich) {
    assert.ok(DOC.includes(v.url), v.url);
    assert.ok(DOC.includes(String(v.wert).replace(".", ",")), String(v.wert));
  }
  for (const l of Object.values(DATEN.laender)) for (const b of l.belegt) assert.ok(DOC.includes(b.url), b.url);
  assert.ok(DOC.includes("$3.500 + $150/Monat") && DOC.includes("£3.000 + £100/Monat") && DOC.includes("3.000 € + 80 €/Monat"));
});

test("Texte: keine Garantie, keine Exklusivität, Beispiel als solches benannt, FR auf Französisch", () => {
  for (const [lang, t] of Object.entries(DATEN.texte)) {
    const all = Object.values(t).join(" ").toLowerCase();
    for (const w of ["guarant", "garanti", "exclusi", "promise you", "will win", "gagnerez"]) assert.ok(!all.includes(w), `${lang}: ${w}`);
  }
  assert.match(DATEN.texte.en.beispiel_titel, /not a promise/);
  assert.match(DATEN.texte.fr.beispiel_titel, /pas une promesse/);
  const plans = [{ key: "starter", amount_cents: 12900 }, { key: "pro", amount_cents: 24900 }];
  const fr = beispielSatz(DATEN, "fr", rechnung(DATEN, wertLand(DATEN, "S2", "FR")!, plans)!);
  assert.match(fr, /^Imaginons/);
  assert.ok(!/\{\w+\}/.test(fr));
});

test("Block nur bei Variante mit value_block = an", () => {
  assert.equal(wertBlockAn({ value_block: "an" }), true);
  assert.equal(wertBlockAn({ value_block: "aus" }), false);
  assert.equal(wertBlockAn({}), false);
  assert.equal(wertBlockAn(null), false);
});

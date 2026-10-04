import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  AB_STEP_KEYS, checkTest, checkValue, evaluate, funnelView, hashRand, overrides, parseAbParam, pBBetter, testsView, variantValue,
  type AbRegistry, type AbTest,
} from "./ab.ts";
import { assign } from "./ab-assign.ts";

const REG = JSON.parse(readFileSync(new URL("./ab-schritte.json", import.meta.url), "utf8")) as AbRegistry;
const CASES = JSON.parse(readFileSync(new URL("../../tests/fixtures/ab_cases.json", import.meta.url), "utf8"));
const SCOPE = { segmente: ["S2"], laender: ["US", "UK", "FR"] };

test("gemeinsame Fälle: Zuweisung wie Python (sha256, leeres Salz = Betreff-A/B)", () => {
  for (const c of CASES.assign) assert.equal(assign(c.salt, c.unit), c.v, JSON.stringify(c));
});

test("gemeinsame Fälle: P(B > A) wie Python", () => {
  for (const c of CASES.p_b) assert.ok(Math.abs(pBBetter(c.nA, c.kA, c.nB, c.kB) - c.p) < 1e-4, JSON.stringify(c));
});

test("gemeinsame Fälle: Regeln für Varianten wie Python", () => {
  for (const c of CASES.check) assert.equal(checkValue(REG, c.step, c.element, c.value).length === 0, c.ok, JSON.stringify(c));
});

test("gemeinsame Fälle: Auswertung (≥ 95 % und Mindestmenge, 21 Tage → gestoppt)", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  for (const c of CASES.evaluate) {
    const e = evaluate(REG, { step: "mail_betreff", min_n: c.min_n, gestartet: new Date(now.getTime() - c.days * 86_400_000).toISOString() }, c.rows, now);
    assert.equal(e.status, c.status, JSON.stringify(c));
    assert.equal(e.gewinner, c.gewinner, JSON.stringify(c));
    assert.ok(Math.abs(e.sicherheit - c.sicherheit) < 1e-4);
  }
});

test("Schrittliste im Code = ab-schritte.json", () => {
  assert.deepEqual([...AB_STEP_KEYS], REG.schritte.map((s) => s.key));
});

test("ohne Unterschied führt keine Variante", () => {
  const now = new Date("2026-10-20T12:00:00Z");
  assert.equal(evaluate(REG, { step: "tarif", min_n: 100, gestartet: now.toISOString() }, [], now).leader, null);
  assert.equal(evaluate(REG, { step: "tarif", min_n: 100, gestartet: now.toISOString() }, [{ variant: "A", n: 50, k: 5 }, { variant: "B", n: 50, k: 5 }], now).leader, null);
});

test("Zuweisung: ungefähr 50/50 und fest je Einheit", () => {
  const units = Array.from({ length: 2000 }, (_, i) => `u${i}`);
  const share = units.filter((u) => assign("s1", u) === "B").length / units.length;
  assert.ok(share > 0.45 && share < 0.55, String(share));
  assert.deepEqual(units.slice(0, 20).map((u) => assign("s1", u)), units.slice(0, 20).map((u) => assign("s1", u)));
});

test("Freigabe-Liste: nur S2 in US/UK/FR, eine Sache, Hypothese ≤ 160", () => {
  const ok = { step: "tarif", element: "titel", b: "Your weekly leads, ready on Monday", hypothese: "Klarer Titel bringt mehr Stripe-Starts" };
  assert.deepEqual(checkTest(REG, SCOPE, { ...ok, segment: "S2", country: "UK" }), []);
  assert.ok(checkTest(REG, SCOPE, { ...ok, segment: "S1", country: "UK" }).length);
  assert.ok(checkTest(REG, SCOPE, { ...ok, segment: "S2", country: "DE" }).length);
  // Versand rund um die Uhr (Inhaber 04.10.2026): Versandzeit-Test pausiert
  assert.match(checkTest(REG, SCOPE, { ...ok, segment: "S2", country: "US", step: "mail_zeit", element: "fenster", b: "spaet" })[0], /^Schritt pausiert/);
  assert.ok(checkTest(REG, SCOPE, { ...ok, segment: "S2", country: "US", element: "preis" }).length);
  assert.ok(checkTest(REG, SCOPE, { ...ok, segment: "S2", country: "US", hypothese: "x".repeat(161) }).length);
  assert.ok(checkTest(REG, SCOPE, { ...ok, segment: "S2", country: "US", a: ok.b }).includes("A und B sind gleich"));
});

test("nie Preise, Freigabe, Sperrliste, Abmeldung, Notbremse oder Länder als Element", () => {
  const bad = /freigabe|sperr|abmeld|unsub|fusszeile|footer|notbremse|land|countr|pruef|regel|preis|price|pricing|amount|limit/i;
  for (const s of REG.schritte) for (const el of Object.keys(s.elemente)) assert.ok(!bad.test(el), `${s.key}.${el}`);
  assert.ok(checkValue(REG, "checkout", "hinweis", "Only £99 today").length);
});

test("Trichter: Engpass = größter Abfall gegenüber Richtwert, nur mit genug Daten", () => {
  const f = funnelView(REG, [{ station: "mail", n: 214, k: 2 }, { station: "landing", n: 197, k: 1 }, { station: "checkout", n: 12, k: 0 }]);
  assert.equal(f.length, REG.stationen.length);
  assert.equal(f.find((s) => s.engpass)?.key, "landing");
  assert.equal(f.find((s) => s.key === "checkout")?.enough, false);
  assert.equal(funnelView(REG, []).some((s) => s.engpass), false);
});

test("Ansicht: Varianten mit n, Quote, Sicherheit; Gewinner gilt danach für alle", () => {
  const t: AbTest = { id: "t1", step: "mail_betreff", segment_id: "S2", country: "US", element: "betreff", hypothese: "B zuerst Signal",
    varianten: [{ key: "A" }, { key: "B", betreff: "No website yet" }], status: "laeuft", min_n: 100, gestartet: "2026-10-15T00:00:00Z" };
  const v = testsView(REG, [t], [{ test_id: "t1", variant: "A", n: 200, k: 4 }, { test_id: "t1", variant: "B", n: 200, k: 16 }], new Date("2026-10-20T00:00:00Z"))[0];
  assert.equal(v.station, "mail");
  assert.equal(v.variants[1].wert, "No website yet");
  assert.equal(v.eval?.status, "gewonnen");
  assert.equal(variantValue(t, "A"), undefined);
  assert.deepEqual(overrides([{ ...t, status: "gewonnen", gewinner: "B", beendet: "2026-10-20" }], "mail_betreff", "S2", "us"), { betreff: "No website yet" });
  assert.deepEqual(overrides([{ ...t, status: "gewonnen", gewinner: "A" }], "mail_betreff", "S2", "US"), {});
});

test("Link-Parameter ab=<test>.<variante> und feste Zufallszahl", () => {
  assert.deepEqual(parseAbParam("4F0C3A8E-1B2D-4C5E-9F00-112233445566.b"), { testId: "4f0c3a8e-1b2d-4c5e-9f00-112233445566", variant: "B" });
  assert.equal(parseAbParam("x.A"), null);
  assert.equal(parseAbParam("4f0c3a8e-1b2d-4c5e-9f00-112233445566.C"), null);
  const r = hashRand("r:abc");
  assert.equal(r, hashRand("r:abc"));
  assert.ok(r >= 0 && r < 1);
});

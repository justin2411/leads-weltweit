import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtRange, forecast, summary, wilson, type PrognoseIn } from "./prognose.ts";

// Erfundene Zahlen – keine echten Daten.
const base: PrognoseIn = { country: "UK", sent: 0, replies: 0, samples: 0, customers: 0, perDay: 0, freeBuyers: null, price: 129, currency: "£" };

test("wilson: Spanne enthält die Quote, kleines n = breit", () => {
  const a = wilson(2, 20), b = wilson(20, 200);
  assert.ok(a.lo < 0.1 && a.hi > 0.1);
  assert.ok(a.hi - a.lo > b.hi - b.lo);
  assert.deepEqual(wilson(0, 0), { lo: 0, hi: 1 });
  assert.equal(wilson(0, 50).lo, 0);
});

test("0 Antworten: noch keine Basis, keine erfundenen Zahlen", () => {
  const p = forecast({ ...base, sent: 74, perDay: 10 });
  assert.equal(p.basis, "keine");
  assert.equal(p.mails30, 300);
  assert.equal(p.antworten30, null);
  assert.equal(p.kunden30, null);
  assert.equal(p.umsatz30, null);
  assert.match(p.text, /noch keine Basis/);
});

test("kein Versand: keine Prognose", () => {
  assert.equal(forecast({ ...base, sent: 100, replies: 3, perDay: 0 }).basis, "kein_versand");
  assert.equal(forecast({ ...base, sent: 100, replies: 3, perDay: 20, freeBuyers: 0 }).basis, "kein_versand");
});

test("freie Käufer begrenzen die Mails", () => {
  assert.equal(forecast({ ...base, sent: 100, replies: 2, perDay: 50, freeBuyers: 400 }).mails30, 400);
});

test("Antworten ohne Proben: nur bis zur Antwort hochgerechnet", () => {
  const p = forecast({ ...base, sent: 200, replies: 4, perDay: 20 });
  assert.equal(p.basis, "duenn");
  assert.ok(p.antworten30 && p.antworten30.mid === 12);  // 600 × 2 %
  assert.ok(p.antworten30.lo < 12 && p.antworten30.hi > 12);
  assert.equal(p.proben30, null);
  assert.equal(p.kunden30, null);
  assert.match(p.text, /Proben\/Kunden: noch keine Basis/);
});

test("voller Trichter: Kunden und Umsatz mit Spanne", () => {
  const p = forecast({ ...base, sent: 1000, replies: 50, samples: 20, customers: 4, perDay: 100 });
  assert.equal(p.basis, "ok");
  assert.equal(p.antworten30!.mid, 150);
  assert.equal(p.proben30!.mid, 60);
  assert.equal(p.kunden30!.mid, 12);
  assert.equal(p.umsatz30!.mid, 12 * 129);
  assert.ok(p.kunden30!.lo < 12 && p.kunden30!.hi > 12);
  assert.ok(p.text.length <= 160, p.text);
});

test("summary: ehrlich bei fehlender Basis", () => {
  const none = [forecast({ ...base, sent: 74, perDay: 10 }), forecast({ ...base, country: "US", currency: "$", sent: 92, perDay: 12 })];
  assert.equal(summary(none).value, "–");
  assert.equal(summary(none).sub, "noch keine Basis");
  assert.equal(summary([forecast(base)]).sub, "kein Versand");
  const full = summary([forecast({ ...base, sent: 1000, replies: 50, samples: 20, customers: 4, perDay: 100 })]);
  assert.match(full.value, /^\d+–\d+$/);
  assert.match(full.sub, /^Kunden/);
  assert.match(full.sub, /£\/Mon\./);
});

test("fmtRange", () => {
  assert.equal(fmtRange({ lo: 3, mid: 3, hi: 3 }), "3");
  assert.equal(fmtRange({ lo: 1, mid: 3, hi: 7 }, " £"), "1–7 £");
  assert.equal(fmtRange(null), "–");
});

test("gleiche Fälle wie Python (tests/fixtures/prognose_cases.json)", async () => {
  const { readFileSync } = await import("node:fs");
  const cases = JSON.parse(readFileSync(new URL("../../tests/fixtures/prognose_cases.json", import.meta.url), "utf8"));
  for (const c of cases) {
    const p = forecast(c.in);
    assert.equal(p.basis, c.basis, c.name);
    assert.equal(p.mails30, c.mails30, c.name);
    assert.deepEqual([p.antworten30, p.proben30, p.kunden30, p.umsatz30], [c.antworten, c.proben, c.kunden, c.umsatz], c.name);
  }
});

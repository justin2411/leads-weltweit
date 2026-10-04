import { test } from "node:test";
import assert from "node:assert/strict";
import { isJung, kohorte, kohortenBrief, matrix, normalizeRows, weekEnd, type KohorteRow } from "./kohorten.ts";
import { AMPEL_VARS, ampelVon } from "./ampel.ts";

const R = (week: string, country: string, sent: number, delivered: number, replies = 0, positive = 0, samples = 0, customers = 0): KohorteRow =>
  ({ week, country, sent, delivered, replies, positive, samples, customers });

test("ampelVon: grün/gelb/rot nach Quote, grau ohne Basis", () => {
  const s = { gut: 0.05, knapp: 0.02, min: 50 };
  assert.equal(ampelVon(3, 50, s), "green");
  assert.equal(ampelVon(1, 50, s), "gold");
  assert.equal(ampelVon(0, 50, s), "red");
  assert.equal(ampelVon(5, 49, s), "grey");
  assert.equal(ampelVon(0, 0, { gut: 1, knapp: 0.5, min: 0 }), "grey");
  assert.match(AMPEL_VARS, /--amp-green:#3ddc97/);
});

test("weekEnd: Sonntag der ISO-Woche, auch über den Jahreswechsel", () => {
  assert.equal(weekEnd("2026-W40"), "2026-10-04");
  assert.equal(weekEnd("2026-W01"), "2026-01-04");
  assert.equal(weekEnd("2027-W01"), "2027-01-10");
});

test("jung: unter 14 Tagen seit Wochenende ab Antwort grau, Zustellung bewertet", () => {
  assert.equal(isJung("2026-W40", "2026-10-04"), true);
  assert.equal(isJung("2026-W38", "2026-10-04"), false);
  const k = kohorte(R("2026-W40", "US", 69, 66), "2026-10-04");
  assert.equal(k.zellen.zugestellt.ampel, "gold");
  assert.equal(k.zellen.antwort.ampel, "grey");
  assert.equal(k.zellen.antwort.jung, true);
  const alt = kohorte(R("2026-W36", "UK", 100, 99, 4, 3, 2, 1), "2026-10-04");
  assert.deepEqual([alt.zellen.zugestellt.ampel, alt.zellen.antwort.ampel, alt.zellen.positiv.ampel, alt.zellen.probe.ampel, alt.zellen.kunde.ampel],
    ["green", "green", "gold", "green", "grey"]);
});

test("matrix: neueste Woche zuerst, Lücken null, gesamt je Land", () => {
  const rows = normalizeRows([R("2026-W39", "US", 26, 25), R("2026-W40", "FR", 50, 48), R("2026-W40", "US", 69, 66), { week: "kaputt" }]);
  const m = matrix(rows, ["US", "UK", "FR"], "2026-10-04");
  assert.deepEqual(m.weeks, ["2026-W40", "2026-W39"]);
  assert.equal(m.cells[0][1], null);
  assert.equal(m.gesamt[0].sent, 95);
  assert.equal(m.gesamt[1].zellen.zugestellt.ampel, "grey");
  // nur junge Wochen → gesamt ab Antwort grau statt rot
  assert.equal(m.gesamt[0].zellen.antwort.ampel, "grey");
  assert.equal(m.gesamt[0].zellen.zugestellt.ampel, "gold");
});

test("gesamt: Ampel ab Antwort nur aus reifen Wochen", () => {
  const rows = [R("2026-W40", "US", 100, 99, 0), R("2026-W36", "US", 100, 99, 4)];
  const m = matrix(rows, ["US"], "2026-10-04");
  assert.equal(m.gesamt[0].zellen.antwort.k, 4);
  assert.equal(m.gesamt[0].zellen.antwort.n, 198);
  assert.equal(m.gesamt[0].zellen.antwort.ampel, "green");
});

test("kohortenBrief: kompakt, nicht lesbar und leer", () => {
  assert.equal(kohortenBrief(null, ["US"], "2026-10-04"), "nicht lesbar");
  assert.equal(kohortenBrief([], ["US"], "2026-10-04"), "noch keine Erstmails");
  const b = kohortenBrief([R("2026-W40", "US", 69, 66), R("2026-W36", "UK", 100, 90)], ["US", "UK"], "2026-10-04") as { kohorten: string[] };
  assert.deepEqual(b.kohorten, ["W40 US 69→66→0→0→0→0 jung", "W36 UK 100→90→0→0→0→0 rot:zugestellt/Antwort/positiv"]);
});

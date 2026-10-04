import { test } from "node:test";
import assert from "node:assert/strict";
import { autoTip, werkLine, werkTip } from "./werk-zeile.ts";

test("werkLine: eine kurze Zeile über die Plätze", () => {
  assert.equal(werkLine({ running: 0, planned: 26 }), "26 Plätze bereit");
  assert.equal(werkLine({ running: 3, planned: 26 }), "3/26 Plätze aktiv");
  assert.equal(werkLine({ running: 26, planned: 26 }), "26 Plätze aktiv");
  assert.equal(werkLine({ running: 1, planned: 0 }), "1 Platz aktiv");
  assert.equal(werkLine({ running: 0, planned: 1 }), "1 Platz bereit");
  assert.equal(werkLine({ running: 0, planned: 0 }), "keine Plätze");
  assert.equal(werkLine({ running: 4, planned: 26, paused: true }), "pausiert");
  assert.equal(werkLine({ running: -2, planned: NaN }), "keine Plätze");
});

test("werkLine: passt in eine Zeile des Kreises (≤ 18 Zeichen)", () => {
  for (const [r, p] of [[0, 40], [12, 40], [40, 40], [0, 0], [9, 99]]) assert.ok(werkLine({ running: r, planned: p }).length <= 18);
  for (const s of [werkLine({ running: 0, planned: 26 }), werkLine({ running: 3, planned: 26 })]) assert.doesNotMatch(s, /·|läuft|geplant|Auto/);
});

test("werkTip und autoTip", () => {
  assert.equal(werkTip("neue Leads in 24 h", { running: 0, planned: 26 }), "neue Leads in 24 h · Plätze: 26 eingeplant, keiner arbeitet gerade (wartet auf den nächsten Start)");
  assert.equal(werkTip("x", { running: 3, planned: 26 }), "x · Plätze: 26 eingeplant, 3 arbeiten gerade");
  assert.match(autoTip(true), /^Autopilot an – verteilt die Plätze nach Ertrag/);
  assert.match(autoTip(false), /^Autopilot aus/);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { bueroGruppen, countdown, schlechteste, zahlText } from "./buero-kacheln.ts";

const E = { besucher: null, flows: null, dispatch: false, now: Date.parse("2026-10-05T07:00:00Z") };

test("ohne Daten: jede Kachel „–“ und grau, nie erfundene Zahlen", () => {
  const g = bueroGruppen(null, null, E);
  const ks = g.flatMap((x) => x.kacheln);
  assert.equal(ks.length, 18);
  for (const k of ks.filter((k) => !["/dashboard/hilfe", "/dashboard/gehirn", "/dashboard/buero/werke"].includes(k.href))) {
    assert.equal(k.text, "–", k.titel);
    assert.equal(k.ton, "grau", k.titel);
  }
});

test("Raster: Bereiche füllen 6 Spalten in drei vollen Reihen (3+2+1 · 5+1 · 2+2+2)", () => {
  const n = bueroGruppen(null, null, E).map((g) => g.kacheln.length);
  assert.deepEqual(n, [3, 2, 1, 5, 1, 2, 2, 2]);
});

test("Titel kurz, Unterzeilen kurz (wenig Text)", () => {
  for (const k of bueroGruppen(null, null, { ...E, dispatch: true }).flatMap((g) => g.kacheln)) {
    assert.ok(k.titel.length <= 60);
    assert.ok(k.unter.length <= 60, k.unter);
  }
});

test("Format und Countdown", () => {
  assert.equal(zahlText(4.83, 1, "", " GB"), "4,8 GB");
  assert.equal(zahlText(null), "–");
  assert.equal(countdown("2026-10-05T07:37:00Z", E.now), "in 37 min");
  assert.equal(countdown("2026-10-05T08:05:00Z", E.now), "in 1 h 05");
  assert.equal(countdown("2026-10-05T06:00:00Z", E.now), "jetzt");
  assert.equal(schlechteste(["gruen", "grau", "gelb"]), "gelb");
  assert.equal(schlechteste(["grau"]), "grau");
});

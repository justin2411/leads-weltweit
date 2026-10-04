import { test } from "node:test";
import assert from "node:assert/strict";
import { anpassungTitel, gehirnScore, scoreAmpel, trendText } from "./gehirn-lernt.ts";

const row = (day: string, value: number | null, country = "ALL", metric = "gehirn_score") => ({ day, country, metric, value });

test("Gehirn-Score: letzter Tag, Trend gegen 7 Tage davor (gleich brain_meta.py)", () => {
  const rows = ["2026-10-13", "2026-10-14", "2026-10-15", "2026-10-16", "2026-10-17", "2026-10-18", "2026-10-19"].map((d) => row(d, 50));
  assert.equal(gehirnScore([...rows, row("2026-10-20", 55)], "2026-10-20").richtung, "steigt");
  assert.equal(gehirnScore([...rows, row("2026-10-20", 44)], "2026-10-20").richtung, "fällt");
  const g = gehirnScore([...rows, row("2026-10-20", 51)], "2026-10-20");
  assert.equal(g.richtung, "gleich");
  assert.equal(g.delta, 1);
  assert.equal(g.ampel, "gold");
  assert.equal(gehirnScore([row("2026-10-20", 80)], "2026-10-20").richtung, "neu");
  // andere Länder/Kennzahlen und Zukunft zählen nicht; ohne Zeile keine Basis
  const none = gehirnScore([row("2026-10-20", 80, "US"), row("2026-10-20", 1, "ALL", "gs_zustellrate"), row("2026-10-21", 9)], "2026-10-20");
  assert.deepEqual([none.score, none.richtung, none.ampel], [null, "keine Basis", "grey"]);
});

test("Ampel, Trend-Text, Titel ≤ 60", () => {
  assert.deepEqual([scoreAmpel(70), scoreAmpel(40), scoreAmpel(39.9), scoreAmpel(null)], ["green", "gold", "red", "grey"]);
  assert.equal(trendText({ delta: 3.25, richtung: "steigt" }), "↑ +3,3");
  assert.equal(trendText({ delta: -4, richtung: "fällt" }), "↓ −4");
  assert.equal(trendText({ delta: 0.5, richtung: "gleich" }), "→ gleich");
  assert.equal(anpassungTitel({ kurz_titel: null, subject: "Meta: Routine X Takt 1×/Tag → jeden 2. Tag" }), "Routine X Takt 1×/Tag → jeden 2. Tag");
  assert.ok(anpassungTitel({ kurz_titel: "x".repeat(80) }).length <= 60);
});

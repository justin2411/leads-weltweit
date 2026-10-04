import { test } from "node:test";
import assert from "node:assert/strict";
import { badSources, bounceBrief, normalize } from "./bounce-stats.ts";

const RAW = {
  tage: 7, gesendet: 260, bounces: 10,
  klassen: { hart: 4, weich: 2, richtlinie: 1, unbekannt: 3 },
  postfaecher: [{ box: "info@", gesendet: 150, bounces: 6, hart: 3, weich: 1, richtlinie: 1, unbekannt: 1 }],
  quellen: [
    { country: "US", quelle: "Overture", gesendet: 40, bounces: 4, hart: 3, weich: 0, richtlinie: 0, unbekannt: 1 },
    { country: "UK", quelle: "Website", gesendet: 10, bounces: 2, hart: 2, weich: 0, richtlinie: 0, unbekannt: 0 },
    { country: "FR", quelle: "Website", gesendet: 50, bounces: 1, hart: 1, weich: 0, richtlinie: 0, unbekannt: 0 },
  ],
};

test("normalize füllt fehlende Klassen mit 0", () => {
  const st = normalize({ gesendet: 5, bounces: 1, klassen: { hart: 1 } })!;
  assert.deepEqual(st.klassen, { hart: 1, weich: 0, richtlinie: 0, unbekannt: 0 });
  assert.equal(normalize(null), null);
});

test("schlechte Quelle erst ab 20 Mails und über 5 % hart", () => {
  const bad = badSources(normalize(RAW)!);
  assert.deepEqual(bad.map((q) => `${q.country}/${q.quelle}`), ["US/Overture"]);
});

test("Kurzfassung für JARVIS", () => {
  const b = bounceBrief(normalize(RAW)) as { quote_7t: string; schlecht: string[] };
  assert.equal(b.quote_7t, "3.8 % (10/260)");
  assert.deepEqual(b.schlecht, ["US · Overture: 7.5 % hart"]);
  assert.equal((b as unknown as { klassen: string }).klassen, "hart 4 · weich 2 · richtlinie 1 · unbekannt 3");
  assert.equal(bounceBrief(normalize({ gesendet: 0 })), "keine Kaltmails in 7 Tagen");
});

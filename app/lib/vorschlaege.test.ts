import { test } from "node:test";
import assert from "node:assert/strict";
import { acceptBrief, doneRecently, kurzGrund, kurzTitel, numbersOf, openProposals, rejectReason, toProposal, type DecisionRow } from "./vorschlaege.ts";

const NOW = new Date("2026-10-04T10:00:00Z");
const R = (id: number, x: Partial<DecisionRow>): DecisionRow => ({ id, subject: "Vorschlag: X", reasoning: "", status: "proposed", created_at: "2026-10-04T09:00:00Z", ...x });

test("Kurztexte: Titel ≤ 60 Zeichen ohne Vorsilbe, Grund = 1 Satz", () => {
  assert.equal(kurzTitel("Vorschlag: Versand auch am Wochenende"), "Versand auch am Wochenende");
  assert.equal(kurzTitel("umgesetzt: Plätze auf UK umgelegt"), "Plätze auf UK umgelegt");
  const long = kurzTitel(`Vorschlag: ${"sehr langer Titel ".repeat(10)}`);
  assert.ok(long.length <= 60 && long.endsWith("…"), long);
  assert.equal(kurzGrund("Mehr Antworten in UK. Zweiter Satz mit Details."), "Mehr Antworten in UK.");
  assert.ok(kurzGrund("x ".repeat(200)).length <= 160);
});

test("Kurzspalten aus decisions haben Vorrang", () => {
  const p = toProposal(R(1, { kurz_titel: "Kurz", kurz_grund: "Ein Satz.", reasoning: "Lang und breit." }));
  assert.equal(p.title, "Kurz");
  assert.equal(p.reason, "Ein Satz.");
  assert.equal(p.full, "Lang und breit.");
});

test("Offene Vorschläge und Umgesetztes der letzten 7 Tage", () => {
  const rows = [
    R(1, {}), R(2, { subject: "Engpass: Versand" }), R(3, { status: "done" }),
    R(4, { subject: "umgesetzt: A", status: "done", created_at: "2026-10-01T00:00:00Z" }),
    R(5, { subject: "umgesetzt: alt", status: "done", created_at: "2026-09-20T00:00:00Z" }),
  ];
  assert.deepEqual(openProposals(rows).map((p) => p.id), [1]);
  assert.deepEqual(doneRecently(rows, NOW).map((p) => p.id), [4]);
});

test("Kennzahlen, Auftragstext und Ablehnungsgrund", () => {
  assert.deepEqual(numbersOf({ a: 1.234, b: "kurz", c: { x: 1 }, d: "x".repeat(40) }), [["a", "1,23"], ["b", "kurz"]]);
  assert.deepEqual(numbersOf(null), []);
  const b = acceptBrief({ id: 7, subject: "Vorschlag: UK zuerst", reasoning: "weil" });
  assert.equal(b, "Vorschlag umsetzen: UK zuerst (decisions #7). weil");
  assert.ok(acceptBrief({ id: 1, subject: "Vorschlag: x", reasoning: "y".repeat(2000) }).length <= 1000);
  assert.equal(rejectReason("  "), null);
  assert.equal(rejectReason(" zu  teuer "), "zu teuer");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RoutineError, TEMPLATES, berlinAt, dayTimes, dueAt, taktLabel, nextRun, normDays, normTime, routineBrief, scheduleLabel, toRoutine, validateRoutine, whenLabel,
  type BrainRoutine,
} from "./brain-routines.ts";

const R = (x: Partial<BrainRoutine> = {}): BrainRoutine => ({
  id: "r1", name: "Umsatz", aufgabe: "Recherche Umsatz", uhrzeit: "14:00", tage: "taeglich", wochentage: [], dauer_min: 15, aktiv: true,
  last_run_at: null, last_task_id: null, last_result: null, created_at: "2026-10-01T00:00:00Z", ...x,
});

test("Routine prüfen: Uhrzeit, Tage, Dauer, Texte", () => {
  const r = validateRoutine({ name: " Umsatz  maximieren ", aufgabe: "15 min recherchieren", uhrzeit: "14 Uhr", dauer_min: 15 });
  assert.deepEqual(r, { name: "Umsatz maximieren", aufgabe: "15 min recherchieren", uhrzeit: "14:00", tage: "taeglich", wochentage: [], dauer_min: 15 });
  assert.equal(normTime("9:5"), "09:05");
  assert.equal(normTime("9.30"), "09:30");
  assert.equal(normTime("24:00"), null);
  assert.equal(normTime("abc"), null);
  assert.deepEqual(normDays(["Di", "do", 2, "9", "x"]), [2, 4]);
  assert.deepEqual(validateRoutine({ name: "Check", aufgabe: "alles prüfen", uhrzeit: "11:00", tage: "wochentage", wochentage: "Mo, Mi" }).wochentage, [1, 3]);
  assert.throws(() => validateRoutine({ name: "x", aufgabe: "alles prüfen", uhrzeit: "11:00" }), RoutineError);
  assert.throws(() => validateRoutine({ name: "Check", aufgabe: "alles", uhrzeit: "11:00", dauer_min: 61 }), /Dauer/);
  assert.throws(() => validateRoutine({ name: "Check", aufgabe: "alles prüfen", uhrzeit: "25:00" }), /Uhrzeit/);
  assert.throws(() => validateRoutine({ name: "Check", aufgabe: "alles prüfen", uhrzeit: "11:00", tage: "wochentage" }), /Wochentage/);
  assert.throws(() => validateRoutine({ name: "Check", aufgabe: "alles prüfen", uhrzeit: "11:00", tage: "monatlich" }), /Tage/);
  for (const t of TEMPLATES) assert.doesNotThrow(() => validateRoutine(t), t.key);
});

test("Zeit in deutscher Zeit: Sommer- und Winterzeit", () => {
  assert.equal(berlinAt(2026, 10, 4, "14:00").toISOString(), "2026-10-04T12:00:00.000Z"); // MESZ
  assert.equal(berlinAt(2026, 11, 4, "14:00").toISOString(), "2026-11-04T13:00:00.000Z"); // MEZ
  assert.equal(berlinAt(2026, 10, 25, "14:00").toISOString(), "2026-10-25T13:00:00.000Z"); // Tag der Umstellung
  assert.equal(berlinAt(2027, 3, 28, "14:00").toISOString(), "2027-03-28T12:00:00.000Z");
});

test("Fällig: nach der Uhrzeit, einmal je Tag, höchstens 6 h nachholen", () => {
  const before = new Date("2026-10-04T11:59:00Z"); // 13:59 MESZ
  const after = new Date("2026-10-04T12:10:00Z"); // 14:10 MESZ
  assert.equal(dueAt(R(), before), null);
  assert.equal(dueAt(R(), after)?.toISOString(), "2026-10-04T12:00:00.000Z");
  assert.equal(dueAt(R({ last_run_at: "2026-10-04T12:05:00Z" }), after), null); // heute schon beauftragt
  assert.ok(dueAt(R({ last_run_at: "2026-10-03T12:05:00Z" }), after)); // gestern beauftragt
  assert.equal(dueAt(R(), after, true), null); // Auftrag noch offen
  assert.equal(dueAt(R({ aktiv: false }), after), null);
  assert.equal(dueAt(R(), new Date("2026-10-04T18:30:00Z")), null); // 20:30 – zu spät, morgen wieder
  // Winterzeit: 14:00 MEZ = 13:00 UTC
  assert.equal(dueAt(R(), new Date("2026-11-04T12:30:00Z")), null);
  assert.equal(dueAt(R(), new Date("2026-11-04T13:01:00Z"))?.toISOString(), "2026-11-04T13:00:00.000Z");
  // kurz nach Mitternacht: 23:30-Routine vom Vortag wird noch nachgeholt
  assert.equal(dueAt(R({ uhrzeit: "23:30" }), new Date("2026-10-04T22:10:00Z"))?.toISOString(), "2026-10-04T21:30:00.000Z");
});

test("Werktags und bestimmte Wochentage", () => {
  const sun = new Date("2026-10-04T12:10:00Z"); // Sonntag 14:10
  const mon = new Date("2026-10-05T12:10:00Z");
  assert.equal(dueAt(R({ tage: "werktags" }), sun), null);
  assert.ok(dueAt(R({ tage: "werktags" }), mon));
  assert.ok(dueAt(R({ tage: "wochentage", wochentage: [7] }), sun));
  assert.equal(dueAt(R({ tage: "wochentage", wochentage: [2, 4] }), mon), null);
  assert.equal(nextRun(R({ tage: "wochentage", wochentage: [2, 4] }), mon)?.toISOString(), "2026-10-06T12:00:00.000Z");
  assert.equal(nextRun(R({ tage: "werktags" }), sun)?.toISOString(), "2026-10-05T12:00:00.000Z");
  assert.equal(nextRun(R({ aktiv: false }), sun), null);
});

test("Anzeige: Plan, wann, Auftragstext, Datenbank-Zeile", () => {
  const now = new Date("2026-10-04T10:00:00Z"); // 12:00
  assert.equal(scheduleLabel(R()), "täglich 14:00 · 15 min");
  assert.equal(scheduleLabel(R({ tage: "werktags", uhrzeit: "11:00", dauer_min: 10 })), "Mo–Fr 11:00 · 10 min");
  assert.equal(scheduleLabel(R({ tage: "wochentage", wochentage: [2, 4], uhrzeit: "09:30", dauer_min: 5 })), "Di, Do 09:30 · 5 min");
  assert.equal(whenLabel(nextRun(R(), now), now), "heute 14:00");
  assert.equal(whenLabel(nextRun(R({ uhrzeit: "11:00" }), now), now), "morgen 11:00");
  assert.equal(whenLabel(null, now), "aus");
  const b = routineBrief(R({ aufgabe: "x".repeat(2000) }));
  assert.ok(b.length <= 1000 && b.startsWith("Gehirn-Routine Umsatz (15 min): ") && b.includes("brain_knowledge.py"));
  const r = toRoutine({ id: "x", name: "A", aufgabe: "B", uhrzeit: "9:00", tage: "kaputt", wochentage: [3, 1], dauer_min: 10, aktiv: null });
  assert.equal(r.uhrzeit, "09:00");
  assert.equal(r.tage, "taeglich");
  assert.deepEqual(r.wochentage, [1, 3]);
  assert.equal(r.aktiv, true);
});

test("Takt (Meta-Review): 2×/4×/Tag verteilt, 0,5 = jeden 2. Tag, gleich Python day_times", () => {
  assert.deepEqual(dayTimes(R({ takt: 2, uhrzeit: "21:10" }), 2026, 10, 4, 7), ["09:10", "21:10"]);
  assert.deepEqual(dayTimes(R({ takt: 4, uhrzeit: "07:40" }), 2026, 10, 4, 7), ["01:40", "07:40", "13:40", "19:40"]);
  // 2026-10-04 = Tag 20730 seit 1970 (gerade) → läuft; 2026-10-05 nicht
  assert.deepEqual(dayTimes(R({ takt: 0.5 }), 2026, 10, 4, 7), ["14:00"]);
  assert.deepEqual(dayTimes(R({ takt: 0.5 }), 2026, 10, 5, 1), []);
  assert.deepEqual(dayTimes(R({ takt: 2, tage: "werktags" }), 2026, 10, 4, 7), []);
  // 2×/Tag 14:00 → auch 02:00 deutscher Zeit fällig (00:00 UTC im Sommer)
  assert.ok(dueAt(R({ takt: 2, last_run_at: "2026-10-03T12:05:00Z" }), new Date("2026-10-04T00:10:00Z")));
  assert.equal(dueAt(R({ takt: 1, last_run_at: "2026-10-03T12:05:00Z" }), new Date("2026-10-04T00:10:00Z")), null);
  assert.equal(dueAt(R({ takt: 0.5 }), new Date("2026-10-05T12:10:00Z")), null);
  assert.ok(dueAt(R({ takt: 0.5 }), new Date("2026-10-04T12:10:00Z")));
  assert.equal(taktLabel(0.5), "jeden 2. Tag");
  assert.equal(taktLabel(4), "4×/Tag");
  assert.equal(scheduleLabel(R({ takt: 2 })), "täglich 14:00 · 2×/Tag · 15 min");
  assert.equal(toRoutine({ id: "x", name: "A", aufgabe: "B", uhrzeit: "9:00", takt: "7" }).takt, 1);
});

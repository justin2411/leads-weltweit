import { test } from "node:test";
import assert from "node:assert/strict";
import { DismissError, MAX_DISMISSALS, activeDismissals, addDismissal, dismissUntil, isDismissed, removeDismissal, tipKey, tipReactKeys, validateKey, visibleTips } from "./tips.ts";

const NOW = new Date("2026-10-04T12:00:00Z");

test("Schlüssel: Art + Markt + Titel ohne Zahlen, stabil", () => {
  assert.equal(tipKey({ level: "gelb", title: "3 Antworten offen" }), "hinweis|-|antworten offen");
  assert.equal(tipKey({ level: "gelb", title: "12 Antworten offen" }), tipKey({ level: "gelb", title: "3 Antworten offen" }));
  assert.equal(tipKey({ level: "gelb", title: "UK: 1.234 Käufer frei", task: { kind: "kaeufer", market: "UK" } }), "kaeufer|uk|uk: käufer frei");
  assert.notEqual(tipKey({ level: "gelb", title: "Leads holen", task: { kind: "leads", market: "US" } }), tipKey({ level: "gelb", title: "Leads holen", task: { kind: "leads", market: "FR" } }));
  assert.equal(tipKey({ level: "gelb", title: "Engpass: „Proben“ (42 %)" }), "hinweis|-|engpass: proben");
  assert.equal(tipKey({ level: "info", title: "123" }), "hinweis|-|ohne titel");
  assert.ok(tipKey({ level: "gelb", title: "x".repeat(500) }).length <= 160);
  // jeder gebaute Schlüssel besteht die Formularprüfung
  for (const t of ["3 Antworten offen", "Notbremse: Versand gestoppt", "Engpass: Käufer → Versand", "Proben-Vorrat leer"]) validateKey(tipKey({ level: "rot", title: t }));
});

test("Formularprüfung", () => {
  assert.throws(() => validateKey(""), DismissError);
  assert.throws(() => validateKey("ohne-trenner"), DismissError);
  assert.throws(() => validateKey("a|b|<script>"), DismissError);
  assert.equal(validateKey(" hinweis|-|antworten offen "), "hinweis|-|antworten offen");
});

test("Ablauf: 7 Tage, rot 24 h", () => {
  assert.equal(dismissUntil("gelb", NOW), "2026-10-11T12:00:00.000Z");
  assert.equal(dismissUntil("rot", NOW), "2026-10-05T12:00:00.000Z");
  const m = addDismissal({ "alt|-|weg": "2026-10-01T00:00:00Z", kaputt: 5 }, "hinweis|-|antworten offen", "gelb", NOW);
  assert.deepEqual(m, { "hinweis|-|antworten offen": "2026-10-11T12:00:00.000Z" }); // Abgelaufenes aufgeräumt
  assert.deepEqual(activeDismissals(null, NOW), {});
  assert.deepEqual(activeDismissals([1, 2], NOW), {});
  assert.deepEqual(removeDismissal(m, "hinweis|-|antworten offen", NOW), {});
});

test("Filter: ausgeblendet, abgelaufen, rot höchstens 24 h", () => {
  const gelb = { level: "gelb", title: "3 Antworten offen" };
  const rot = { level: "rot", title: "Notbremse: Versand gestoppt" };
  const andere = { level: "gelb", title: "Proben-Vorrat leer" };
  let m = addDismissal({}, tipKey(gelb), "gelb", NOW);
  assert.deepEqual(visibleTips([gelb, andere], m, NOW), [andere]);
  assert.deepEqual(visibleTips([{ ...gelb, title: "5 Antworten offen" }], m, NOW), []); // Zahl egal
  assert.deepEqual(visibleTips([gelb], m, new Date("2026-10-11T12:00:01Z")), [gelb]); // nach 7 Tagen wieder da
  m = addDismissal(m, tipKey(rot), "rot", NOW);
  assert.equal(isDismissed(rot, m, new Date("2026-10-05T11:59:00Z")), true);
  assert.equal(isDismissed(rot, m, new Date("2026-10-05T12:00:01Z")), false);
  // gelb für 7 Tage ausgeblendet, dann rot geworden -> sofort sichtbar
  const wirdRot = { level: "rot", title: gelb.title };
  assert.equal(isDismissed(wirdRot, m, NOW), false);
  // Manipulierter Eintrag mit 30 Tagen für einen roten Alarm greift nicht
  assert.equal(isDismissed(rot, { [tipKey(rot)]: "2026-11-04T12:00:00Z" }, NOW), false);
});

test("höchstens MAX_DISMISSALS Einträge", () => {
  let m: Record<string, string> = {};
  for (let i = 0; i < MAX_DISMISSALS + 5; i++) m[`hinweis|-|h ${String.fromCharCode(97 + (i % 26))}${"x".repeat(Math.floor(i / 26))}`] = new Date(NOW.getTime() + (i + 1) * 60_000).toISOString();
  m = addDismissal(m, "hinweis|-|neu", "gelb", NOW);
  assert.equal(Object.keys(m).length, MAX_DISMISSALS);
  assert.ok(m["hinweis|-|neu"]);
});

test("React-Schlüssel stabil und eindeutig (nicht Listenindex)", () => {
  const a = { level: "gelb", title: "3 Antworten offen" };
  const b = { level: "gelb", title: "Proben-Vorrat leer" };
  assert.deepEqual(tipReactKeys([a, b]), [tipKey(a), tipKey(b)]);
  assert.deepEqual(tipReactKeys([b]), [tipKey(b)]); // nach dem Ausblenden von a behält b seinen Schlüssel
  const k = tipReactKeys([a, { ...a, title: "4 Antworten offen" }]);
  assert.equal(new Set(k).size, 2);
});

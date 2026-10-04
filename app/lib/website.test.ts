import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AREAS, TEMPLATES, WebsiteInputError, agentState, areaTone, countLevels, findingsFor, isDue, nextDue, ringDash, shortTime, toAgent,
  toCheck, toneOf, totalScore, validateAgent, type WebsiteAgent,
} from "./website.ts";
import { KINDS, OWNER_KINDS } from "./agents.ts";
import { orderSessions, toSession } from "./jarvis-chat.ts";

const NOW = new Date("2026-10-04T10:00:00Z"); // 12:00 deutsche Zeit
const ago = (h: number) => new Date(NOW.getTime() - h * 3_600_000).toISOString();

test("Check aus der Datenbank: sichere Werte, unbekannte Bereiche fallen weg", () => {
  const c = toCheck({
    at: "2026-10-04T04:23:00Z", site: "https://www.nextgen-profit.de", seiten: 30,
    scores: { erreichbar: 100, tempo: 104.6, texte: "x", recht: null, fremd: 3 },
    funde: [{ bereich: "texte", stufe: "gelb", text: "Titel zu lang", pfad: "/uk/x" }, { bereich: "gibtsnicht", stufe: "rot", text: "x" },
      { bereich: "fehler", stufe: "rot", text: "kaputter Link", pfad: "javascript:alert(1)" }, { bereich: "tempo", stufe: "komisch", text: " langsam " }, null],
  })!;
  assert.equal(c.scores.tempo, 100);
  assert.equal(c.scores.texte, null);
  assert.equal(c.scores.recht, null);
  assert.equal(c.funde.length, 3);
  assert.equal(c.funde[1].pfad, undefined); // nur Pfade der eigenen Seite
  assert.equal(c.funde[2].stufe, "info");
  assert.equal(c.funde[2].text, "langsam");
  assert.equal(toCheck(null), null);
});

test("Ampel: ab 90 grün, ab 70 gelb, roter Fund immer rot, ohne Wert leer", () => {
  assert.equal(toneOf(95), "gruen");
  assert.equal(toneOf(90), "gruen");
  assert.equal(toneOf(89), "gelb");
  assert.equal(toneOf(70), "gelb");
  assert.equal(toneOf(69), "rot");
  assert.equal(toneOf(100, true), "rot");
  assert.equal(toneOf(null), "leer");
  const c = toCheck({ scores: { fehler: 95, texte: 92 }, funde: [{ bereich: "fehler", stufe: "rot", text: "kaputter Link" }] });
  assert.equal(areaTone(c, "fehler"), "rot");
  assert.equal(areaTone(c, "texte"), "gruen");
  assert.equal(areaTone(c, "recht"), "leer");
  assert.equal(areaTone(null, "texte"), "leer");
});

test("Gesamtwert, Funde je Bereich, Zähler, Ring", () => {
  const c = toCheck({
    scores: { erreichbar: 100, fehler: 60, texte: 81 },
    funde: [{ bereich: "texte", stufe: "info", text: "a" }, { bereich: "texte", stufe: "rot", text: "b" }, { bereich: "texte", stufe: "gelb", text: "c" },
      { bereich: "fehler", stufe: "gelb", text: "d" }],
  });
  assert.equal(totalScore(c), 80);
  assert.equal(totalScore(toCheck({ scores: {} })), null);
  assert.deepEqual(findingsFor(c, "texte").map((f) => f.text), ["b", "c", "a"]);
  assert.equal(findingsFor(c, "texte", 1).length, 1);
  assert.deepEqual(countLevels(c), { rot: 1, gelb: 2 });
  const r = ringDash(75, 10);
  assert.equal(r.c, 62.83);
  assert.equal(r.off, 15.71);
  assert.equal(ringDash(null, 10).off, 62.83);
  assert.equal(ringDash(140, 10).off, 0);
  assert.equal(AREAS.length, 7);
});

test("Eingabeprüfung Agent: Name, Aufgabe in einer Zeile, Rhythmus", () => {
  assert.deepEqual(validateAgent({ name: "  Fehler  & Links ", aufgabe: "Links\nprüfen  bitte", rhythmus: "taeglich" }),
    { name: "Fehler & Links", aufgabe: "Links prüfen bitte", rhythmus: "taeglich" });
  assert.throws(() => validateAgent({ name: "x", aufgabe: "Links prüfen", rhythmus: "taeglich" }), WebsiteInputError);
  assert.throws(() => validateAgent({ name: "Name", aufgabe: "kurz", rhythmus: "taeglich" }), /Aufgabe/);
  assert.throws(() => validateAgent({ name: "Name", aufgabe: "x".repeat(241), rhythmus: "taeglich" }), /Aufgabe/);
  assert.throws(() => validateAgent({ name: "Name", aufgabe: "Links prüfen", rhythmus: "stündlich" }), /Rhythmus/);
  for (const t of TEMPLATES) assert.doesNotThrow(() => validateAgent(t), t.name);
});

const agent = (o: Partial<WebsiteAgent>): WebsiteAgent => toAgent({ id: "a", name: "A", aufgabe: "Links prüfen", rhythmus: "taeglich", aktiv: true, ...o });

test("Fälligkeit wie scripts/website_agents.py", () => {
  assert.equal(isDue(agent({}), NOW), true);
  assert.equal(isDue(agent({ last_run_at: ago(23.5) }), NOW), true);
  assert.equal(isDue(agent({ last_run_at: ago(20) }), NOW), false);
  assert.equal(isDue(agent({ rhythmus: "woechentlich", last_run_at: ago(24 * 6) }), NOW), false);
  assert.equal(isDue(agent({ rhythmus: "woechentlich", last_run_at: ago(24 * 7) }), NOW), true);
  assert.equal(isDue(agent({ rhythmus: "einmal" }), NOW), true);
  assert.equal(isDue(agent({ rhythmus: "einmal", last_run_at: ago(100), last_task_id: "t" }), NOW), false);
  assert.equal(isDue(agent({ aktiv: false }), NOW), false);
  assert.equal(isDue(agent({ last_run_at: ago(48) }), NOW, "laeuft"), false);
  assert.equal(nextDue(agent({ last_run_at: ago(2) }))?.toISOString(), new Date(NOW.getTime() + 21 * 3_600_000).toISOString());
  assert.equal(nextDue(agent({ rhythmus: "einmal", last_run_at: ago(2) })), null);
});

test("Zustand je Agent: aus, in Arbeit, startet um, nächster Lauf", () => {
  assert.equal(agentState(agent({ aktiv: false }), null, NOW, "12:08").text, "aus");
  assert.equal(agentState(agent({ last_run_at: ago(1) }), { status: "laeuft" }, NOW, "12:08").text, "in Arbeit");
  assert.equal(agentState(agent({ last_run_at: ago(1) }), { status: "offen" }, NOW, "12:08").text, "startet um 12:08");
  assert.equal(agentState(agent({}), null, NOW, "12:08").text, "wird beauftragt");
  assert.equal(agentState(agent({ last_run_at: ago(2) }), { status: "fertig" }, NOW, "12:08").text, "nächster Lauf morgen 09:00");
  const bad = agentState(agent({ rhythmus: "einmal", last_run_at: ago(2), last_task_id: "t" }), { status: "fehler" }, NOW, "12:08");
  assert.deepEqual(bad, { text: "erledigt", tone: "bad" });
  assert.equal(shortTime(new Date("2026-10-04T12:30:00Z"), NOW), "14:30");
  assert.equal(shortTime(new Date("2026-10-07T05:00:00Z"), NOW), "Mi 07:00");
});

test("Arten: website ist Agenten-Art, aber nicht im Auftragsformular; Website-Sitzung nicht in der Chat-Liste", () => {
  assert.equal(KINDS.website.icon, "website");
  assert.ok(!(OWNER_KINDS as string[]).includes("website"));
  assert.ok(!(OWNER_KINDS as string[]).includes("kunde"));
  const s = toSession({ id: "w", title: "Website", kind: "website", created_at: "2026-10-04T10:00:00Z" });
  assert.equal(s.kind, "website");
  assert.deepEqual(orderSessions([s]), []);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AREAS, IGNORE_MAX, TEMPLATES, WebsiteInputError, addIgnore, agentState, areaTone, canFixFinding, countLevels, findingKey, findingsFor,
  fixBrief, fixState, isDue, isFindingKey, isIgnored, nextDue, recentlyFixed, ringDash, shortTime, suggestionLine, toAgent, toCheck, toFix,
  toneOf, totalScore, validateAgent, visibleFindings, type Finding, type WebsiteAgent, type WebsiteFix,
} from "./website.ts";
import { fitTitle } from "./site.ts";
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

// ------------------------------------------------------------------------------------------------- Funde beheben
const F_TITLE: Finding = { bereich: "texte", stufe: "gelb", text: "Titel zu lang (90 Zeichen)", pfad: "/fr/agences-web", key: "texte:titel:/fr/agences-web",
  vorschlag: { text: "Titel kürzen auf ≤ 60 Zeichen", alt: "Des entreprises … | NextGen Profit", neu: "Des entreprises partout en France sans site web à jour", auto: true } };
const F_LEGAL: Finding = { bereich: "recht", stufe: "rot", text: "Platzhalter im Rechtstext", pfad: "/impressum", key: "recht:platzhalter:/impressum" };
const fixOf = (o: Partial<WebsiteFix>): WebsiteFix => ({ id: "f1", created_at: ago(1), task_id: "t1", pfad: "/fr/agences-web", keys: [F_TITLE.key], quelle: "inhaber", behoben_at: null, ...o });

test("Check: Fund-Schlüssel und Vorschlag aus der Datenbank, alte Checks bekommen einen Ersatz-Schlüssel", () => {
  const c = toCheck({ at: NOW.toISOString(), site: "x", funde: [
    { bereich: "texte", stufe: "gelb", text: "Titel zu lang (90 Zeichen)", pfad: "/fr/a", key: "texte:titel:/fr/a",
      vorschlag: { text: "  Titel kürzen ", neu: "Kurz", auto: true, böse: "<script>" } },
    { bereich: "texte", stufe: "gelb", text: "Gedankenstrich im Text (1×)", pfad: "/uk/x", key: "kaputt key" },
  ] })!;
  assert.deepEqual(c.funde[0].vorschlag, { text: "Titel kürzen", neu: "Kurz", auto: true });
  assert.equal(c.funde[0].key, "texte:titel:/fr/a");
  assert.equal(c.funde[1].key, "texte:gedankenstrich_im_text:/uk/x");
  assert.equal(c.funde[1].vorschlag, undefined);
  assert.ok(isFindingKey(findingKey("fehler", "kaputter Link (404)", "/a")));
  assert.equal(isFindingKey("texte:titel:/a b"), false);
  assert.equal(isFindingKey("erreichbar:variable:/api/health"), true);
});

test("Vorschlag in einer Zeile, Rechtstexte nur melden", () => {
  assert.equal(suggestionLine(F_TITLE), "„Des entreprises partout en France sans site web à jour“");
  assert.equal(suggestionLine({ ...F_TITLE, vorschlag: { text: "Link korrigieren", auto: true } }), "Link korrigieren");
  assert.equal(suggestionLine(F_LEGAL), "Nur der Inhaber ändert Rechtstexte");
  assert.equal(canFixFinding(F_TITLE), true);
  assert.equal(canFixFinding(F_LEGAL), false);
  assert.equal(canFixFinding({ ...F_TITLE, bereich: "texte", pfad: "/agb" }), false);
});

test("Fix-Stand: wartet, in Arbeit, erledigt bis zum nächsten Check, sonst erneut beheben", () => {
  const checkAt = ago(3);
  assert.equal(fixState(F_TITLE, [], {}, checkAt, "12:08"), null);
  assert.deepEqual(fixState(F_TITLE, [fixOf({})], { t1: { status: "offen" } }, checkAt, "12:08"), { text: "JARVIS behebt · startet um 12:08", tone: "wait", canFix: false });
  assert.equal(fixState(F_TITLE, [fixOf({})], { t1: { status: "laeuft" } }, checkAt, "12:08")!.text, "in Arbeit");
  assert.equal(fixState(F_TITLE, [fixOf({})], { t1: { status: "fertig" } }, checkAt, "12:08")!.text, "erledigt · Check folgt");
  const again = fixState(F_TITLE, [fixOf({ created_at: ago(5) })], { t1: { status: "fertig" } }, checkAt, "12:08")!;
  assert.deepEqual([again.tone, again.canFix], ["bad", true]);
  assert.equal(fixState(F_TITLE, [fixOf({})], { t1: { status: "fehler" } }, checkAt, "12:08")!.text, "Fehler · erneut beheben");
  // neuester Fix zählt
  const two = [fixOf({ id: "a", created_at: ago(10), task_id: "x" }), fixOf({ id: "b", created_at: ago(1), task_id: "y" })];
  assert.equal(fixState(F_TITLE, two, { x: { status: "fehler" }, y: { status: "laeuft" } }, checkAt, "12:08")!.text, "in Arbeit");
});

test("Ignorieren: 30 Tage, Abgelaufenes fällt weg, nur gültige Schlüssel", () => {
  const cur = { "texte:titel:/alt": ago(1), "texte:titel:/x": new Date(NOW.getTime() + 3_600_000).toISOString() };
  const next = addIgnore(cur, F_TITLE.key, NOW);
  assert.deepEqual(Object.keys(next).sort(), ["texte:titel:/fr/agences-web", "texte:titel:/x"]);
  assert.equal(next[F_TITLE.key], new Date(NOW.getTime() + 30 * 24 * 3_600_000).toISOString());
  assert.equal(isIgnored(F_TITLE.key, next, NOW), true);
  assert.equal(isIgnored(F_TITLE.key, next, new Date(NOW.getTime() + 31 * 24 * 3_600_000)), false);
  assert.throws(() => addIgnore({}, "nicht gültig", NOW), WebsiteInputError);
  const many = Object.fromEntries(Array.from({ length: 250 }, (_, i) => [`texte:titel:/p${i}`, new Date(NOW.getTime() + (i + 1) * 60_000).toISOString()]));
  assert.equal(Object.keys(addIgnore(many, "texte:titel:/neu", NOW)).length, IGNORE_MAX);
  const v = visibleFindings([F_TITLE, F_LEGAL], next, NOW);
  assert.deepEqual([v.shown.map((f) => f.key), v.hidden], [[F_LEGAL.key], 1]);
});

test("Auftragstext wie scripts/website_agents.py fix_brief, höchstens 1000 Zeichen", () => {
  const b = fixBrief("/fr/agences-web", [F_TITLE], true);
  assert.ok(b.startsWith("Website-Fix /fr/agences-web (Inhaber): Titel zu lang (90 Zeichen) → „Des entreprises partout en France sans site web à jour“ | "));
  assert.ok(b.includes("Nie Rechtstexte oder Preise"));
  const long = fixBrief(null, Array.from({ length: 30 }, () => F_TITLE));
  assert.ok(long.length <= 1000 && long.startsWith("Website-Fix Website: "));
});

test("Behoben-Liste je Bereich und Fix aus der Datenbank", () => {
  const fixes = [fixOf({ behoben_at: ago(2) }), fixOf({ id: "f2", behoben_at: ago(24 * 5) }), fixOf({ id: "f3", keys: ["tempo:langsam:/"], behoben_at: ago(1) })];
  assert.deepEqual(recentlyFixed(fixes, "texte", NOW).map((f) => f.id), ["f1"]);
  assert.deepEqual(toFix({ id: 1, created_at: "x", keys: ["texte:titel:/a", "böse"], quelle: "auto" }),
    { id: "1", created_at: "x", task_id: null, pfad: null, keys: ["texte:titel:/a"], quelle: "auto", behoben_at: null });
});

test("Seitentitel ≤ 60: Marke nur, wenn sie passt, sonst kürzen", () => {
  assert.equal(fitTitle("B2B leads with a reason to call", "NextGen Profit", true), "NextGen Profit | B2B leads with a reason to call");
  assert.equal(fitTitle("New companies across the UK that still need an accountant", "NextGen Profit"), "New companies across the UK that still need an accountant");
  const t = fitTitle("Des entreprises nouvelles et en croissance, partout en France, qui doivent s'assurer", "NextGen Profit");
  assert.ok(t.length <= 60 && t.endsWith("…"));
  assert.equal(fitTitle("", "NextGen Profit"), "NextGen Profit");
});

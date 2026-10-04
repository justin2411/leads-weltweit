import { test } from "node:test";
import assert from "node:assert/strict";
import { CHAT_BY, TaskError, agentBoard, chatTask, chatThread, formDefaults, freeAgent, inferTask, agentStartLabel, nextAgentRun, nextAgentRound, validateTask, AGENT_COUNT, type AgentTask } from "./agents.ts";

test("Auftrag prüfen", () => {
  assert.deepEqual(validateTask({ agent: "1", kind: "leads", market: "uk", brief: "  mehr  Leads " }), { agent: 1, kind: "leads", market: "UK", brief: "mehr Leads" });
  assert.equal(validateTask({ agent: "2", kind: "kaeufer", market: "", brief: "" }).brief, "Käufer finden");
  assert.throws(() => validateTask({ agent: "9", kind: "leads" }), TaskError);
  assert.throws(() => validateTask({ agent: "1", kind: "senden" }), TaskError);
  assert.throws(() => validateTask({ agent: "1", kind: "leads", market: "DE" }), TaskError); // nur bekannte Märkte
});

test("Tafel je Agent", () => {
  const t = (agent: number, status: AgentTask["status"], created_at: string, finished_at: string | null = null) =>
    ({ id: `${agent}${status}${created_at}`, agent, status, created_at, finished_at, kind: "leads", market: null, brief: "x", progress: 0, step: null, result: null, numbers: {}, started_at: null }) as AgentTask;
  const b = agentBoard([t(1, "offen", "2"), t(1, "laeuft", "1"), t(2, "fertig", "1", "5"), t(2, "fertig", "2", "9"), t(3, "offen", "3"), t(3, "offen", "1")]);
  assert.equal(b.length, 8);
  assert.equal(b[0].current?.status, "laeuft");
  assert.equal(b[0].queued, 1);
  assert.equal(b[1].current?.finished_at, "9");
  assert.equal(b[2].current?.created_at, "1"); // ältester offener zuerst
  assert.equal(b[2].queued, 1);
  assert.equal(b[3].current, null);
});

const mk = (p: Partial<AgentTask>) =>
  ({ id: "x", agent: 1, status: "offen", created_at: "2026-10-04T10:00:00Z", finished_at: null, kind: "leads", market: null, brief: "x", progress: 0, step: null, result: null, numbers: {}, started_at: null, ...p }) as AgentTask;

test("Freitext: Markt erkennen", () => {
  const m = (s: string) => inferTask(s).market;
  assert.equal(m("er soll uk käufer finden"), "UK"); // Inhaber schreibt klein
  assert.equal(m("gb leads"), "UK");
  assert.equal(m("Bukarest"), null);
  assert.equal(m("UK Käufer finden"), "UK");
  assert.equal(m("käufer in england"), "UK");
  assert.equal(m("Großbritannien"), "UK");
  assert.equal(m("Grossbritannien bitte"), "UK");
  assert.equal(m("mehr Leads USA"), "US");
  assert.equal(m("Leads für die US"), "US");
  assert.equal(m("Frankreich prüfen"), "FR");
  assert.equal(m("FR"), "FR");
  assert.equal(m("Irland"), "IE");
  assert.equal(m("NL Quelle"), "NL");
  assert.equal(m("Holland"), "NL");
  assert.equal(m("Belgien"), "BE");
  assert.equal(m("SE Leads"), "SE");
  assert.equal(m("Schweden"), "SE");
  assert.equal(m("hol uns mehr Leads"), null); // „us“ klein ist kein Markt
  assert.equal(m("se, be, ie klein"), null);
  assert.equal(m("Business"), null); // kein Treffer mitten im Wort
  assert.equal(m("erst FR, dann UK"), "FR"); // zuerst genannter
  assert.equal(m(""), null);
});

test("Freitext: Art erkennen", () => {
  const k = (s: string) => inferTask(s).kind;
  assert.equal(k("UK Käufer finden"), "kaeufer");
  assert.equal(k("neue Kunden finden in Irland"), "kaeufer");
  assert.equal(k("Webagenturen in NL suchen"), "kaeufer");
  assert.equal(k("mehr Leads für Webagenturen"), "leads");
  assert.equal(k("neue Quelle für Schweden"), "quelle");
  assert.equal(k("Stichprobe US prüfen"), "pruefen");
  assert.equal(k("Warum keine Antworten in Frankreich?"), "frage");
  assert.equal(k("wie viele Leads haben wir"), "frage");
  assert.equal(k("Lohnt sich UK?"), "frage");
  assert.equal(k("Kannst du UK Käufer finden?"), "kaeufer"); // Bitte, keine Frage
  assert.equal(k("Hallo"), null);
});

test("Formular schlau vorbelegen", () => {
  // Beispiel Inhaber: offener Auftrag „Käufer finden · UK“ → Was und Markt vorausgewählt
  const tasks = [mk({ id: "a", agent: 2, kind: "kaeufer", market: "UK", brief: "Käufer finden UK" })];
  assert.deepEqual(formDefaults({ tasks, agent: 2 }), { agent: 2, kind: "kaeufer", market: "UK", brief: "" });
  // Markt fehlt im Auftrag, steht aber im Text
  const t2 = [mk({ agent: 3, kind: "quelle", market: null, brief: "Quelle für Irland" })];
  assert.equal(formDefaults({ tasks: t2, agent: 3 }).market, "IE");
  // ausdrücklich übergeben (Hinweis) schlägt den alten Auftrag; ungültiges wird ignoriert
  assert.deepEqual(formDefaults({ tasks, agent: 2, kind: "quelle", market: "fr", brief: "x" }), { agent: 2, kind: "quelle", market: "FR", brief: "x" });
  assert.equal(formDefaults({ tasks, agent: 2, kind: "senden", market: "DE" }).kind, "kaeufer");
  // nur Text übergeben: daraus erkennen
  assert.deepEqual(formDefaults({ tasks: [], agent: 1, brief: "Leads Schweden" }), { agent: 1, kind: "leads", market: "SE", brief: "Leads Schweden" });
  // „Neuer Auftrag“: neuester Auftrag überhaupt, freier Agent
  const d = formDefaults({ tasks, agent: null });
  assert.equal(d.market, "UK");
  assert.equal(d.agent, 1);
  // nichts bekannt: Standard
  assert.deepEqual(formDefaults({ tasks: [], agent: 4 }), { agent: 4, kind: "leads", market: null, brief: "" });
});

test("Chat: freier Agent, Auftrag, Verlauf", () => {
  assert.equal(freeAgent([]), 1);
  assert.equal(freeAgent([mk({ agent: 1, status: "laeuft" }), mk({ agent: 2, status: "offen" }), mk({ agent: 3, status: "fertig" })]), 3);
  assert.equal(freeAgent([1, 2, 3, 4].map((a) => mk({ agent: a }))), 5); // A5–A8 frei
  assert.equal(freeAgent([1, 2, 3, 4, 5, 6, 7, 8].map((a) => mk({ agent: a }))), 1); // alle belegt -> A1
  assert.deepEqual(chatTask("  Warum  keine Antworten in UK? ", []), { agent: 1, kind: "frage", market: "UK", brief: "Warum keine Antworten in UK?" });
  assert.equal(chatTask("Hallo JARVIS", []).kind, "frage"); // unklar: nur auswerten
  assert.equal(validateTask(chatTask("UK Käufer finden", [])).kind, "kaeufer");
  const th = chatThread([
    mk({ id: "1", created_by: CHAT_BY, created_at: "1", status: "fertig", result: "In UK 420 neue Käufer." }),
    mk({ id: "2", created_by: CHAT_BY, created_at: "3", status: "offen", agent: 2 }),
    mk({ id: "3", created_by: "Inhaber Dashboard", created_at: "2" }),
    mk({ id: "4", created_by: CHAT_BY, created_at: "2", status: "laeuft", progress: 40, step: "prüfe" }),
  ]);
  assert.deepEqual(th.map((x) => x.id), ["1", "4", "2"]); // nur Chat, älteste oben
  assert.equal(th[0].reply, "In UK 420 neue Käufer.");
  assert.match(th[1].reply, /40 %\) · prüfe/);
  assert.match(th[2].reply, /Agent 2/);
  assert.equal(chatThread([], 6).length, 0);
});

test("acht Agenten A1–A8, 9 bleibt den Kunden-Agenten", () => {
  assert.equal(AGENT_COUNT, 8);
  assert.equal(validateTask({ agent: "8", kind: "leads" }).agent, 8);
  assert.throws(() => validateTask({ agent: "9", kind: "leads" }), TaskError);
  assert.throws(() => validateTask({ agent: "0", kind: "leads" }), TaskError);
  const busy = Array.from({ length: 7 }, (_, i) => mk({ id: String(i), agent: i + 1, status: "laeuft" }));
  assert.equal(freeAgent(busy), 8);
  assert.equal(freeAgent([...busy, mk({ agent: 8, status: "offen" })]), 1); // alle belegt -> A1
});

test("nextAgentRun: :08/:23/:38/:53 deutsche Zeit, auch über die Zeitumstellung", () => {
  const n = (s: string) => nextAgentRun(new Date(s)).toISOString();
  assert.equal(n("2026-10-04T07:52:30Z"), "2026-10-04T07:53:00.000Z");
  assert.equal(n("2026-10-04T07:08:00Z"), "2026-10-04T07:23:00.000Z"); // genau jetzt: nächste
  // Winterzeit (MEZ, UTC+1) und Umstellung 25.10.2026 03:00 MESZ -> 02:00 MEZ
  assert.equal(n("2026-12-01T10:40:00Z"), "2026-12-01T10:53:00.000Z");
  assert.equal(n("2026-10-25T00:55:00Z"), "2026-10-25T01:08:00.000Z");
  assert.equal(agentStartLabel(new Date("2026-10-25T00:55:00Z")), "02:08"); // 02:55 MESZ -> 02:08 MEZ
  assert.equal(agentStartLabel(new Date("2026-10-04T07:40:00Z")), "09:53"); // MESZ
  assert.equal(agentStartLabel(new Date("2026-12-01T22:59:00Z")), "00:08"); // über Mitternacht
  assert.equal(nextAgentRound, nextAgentRun);
});

test("nächste Agenten-Runde (:53) für „startet um HH:MM“", () => {
  assert.equal(nextAgentRound(new Date("2026-10-04T07:10:00Z")).toISOString(), "2026-10-04T07:23:00.000Z");
  assert.equal(nextAgentRound(new Date("2026-10-04T07:40:00Z")).toISOString(), "2026-10-04T07:53:00.000Z");
  assert.equal(nextAgentRound(new Date("2026-10-04T07:53:00Z")).toISOString(), "2026-10-04T08:08:00.000Z"); // genau jetzt: nächste
  assert.equal(nextAgentRound(new Date("2026-10-04T23:59:30Z")).toISOString(), "2026-10-05T00:08:00.000Z"); // über Mitternacht
  const mk = (p: Partial<AgentTask>) => ({ id: "x", agent: 2, status: "offen", created_at: "1", finished_at: null, kind: "leads", market: null, brief: "x", progress: 0, step: null, result: null, numbers: {}, started_at: null, created_by: CHAT_BY, ...p }) as AgentTask;
  assert.equal(chatThread([mk({})], 6, "09:53")[0].reply, "Notiert für Agent 2 – startet um 09:53.");
});

// ---------------------------------------------------------------- Gehirn beauftragt Agenten selbst
import { checkBrainTask, fromBrain, TaskError as TE } from "./agents.ts";
import { satellites } from "./gehirn.ts";

test("Gehirn-Auftrag: frei, Fokus-Märkte, Grund, nie Verbotenes, höchstens 3 je Stunde", () => {
  const now = new Date("2026-10-04T12:00:00Z");
  const T = (x: Partial<AgentTask>): AgentTask => ({ id: Math.random().toString(36), created_at: "2026-10-04T08:00:00Z", agent: 1, kind: "leads", market: null, brief: "x",
    status: "fertig", progress: 0, step: null, result: null, numbers: {}, started_at: null, finished_at: null, ...x });
  const busy1 = [T({ agent: 1, status: "laeuft" })];
  const r = checkBrainTask({ kind: "pruefen", market: "us", brief: "20 US-Leads prüfen", grund: "Fehlerquote US senken" }, busy1, now);
  assert.deepEqual([r.agent, r.market, r.grund], [2, "US", "Fehlerquote US senken"]);
  assert.throws(() => checkBrainTask({ agent: 1, kind: "pruefen", brief: "x x x", grund: "Grund da" }, busy1, now), /A1 ist belegt/);
  assert.throws(() => checkBrainTask({ kind: "website", brief: "x x x", grund: "Grund da" }, [], now), TE);
  assert.throws(() => checkBrainTask({ kind: "pruefen", market: "DE", brief: "x x x", grund: "Grund da" }, [], now), /Fokus/);
  assert.throws(() => checkBrainTask({ kind: "pruefen", brief: "x x x", grund: "" }, [], now), /Grund/);
  assert.throws(() => checkBrainTask({ kind: "pruefen", brief: "Versand einschalten", grund: "mehr Umsatz" }, [], now), /nie per Auftrag/);
  assert.throws(() => checkBrainTask({ kind: "quelle", brief: "Sperrliste aufräumen", grund: "Qualität" }, [], now), /nie per Auftrag/);
  const three = [1, 2, 3].map((i) => T({ agent: 5 + i, created_by: "Gehirn", created_at: new Date(now.getTime() - i * 600_000).toISOString() }));
  assert.throws(() => checkBrainTask({ kind: "frage", brief: "Warum?", grund: "Antwortquote heben" }, three, now), /3 je Stunde/);
  const allBusy = Array.from({ length: 8 }, (_, i) => T({ agent: i + 1, status: "offen" }));
  assert.throws(() => checkBrainTask({ kind: "frage", brief: "Warum?", grund: "Antwortquote heben" }, allBusy, now), /alle Agenten belegt/);
  assert.ok(fromBrain({ created_by: "Gehirn" }) && fromBrain({ created_by: "Gehirn-Routine" }) && !fromBrain({ created_by: "JARVIS-Chat" }) && !fromBrain(null));
  const sats = satellites([T({ agent: 3, status: "laeuft", created_by: "Gehirn", grund: "Umsatz-Hebel" }), T({ agent: 4, status: "offen" })]);
  assert.equal(sats[2].brain, true);
  assert.equal(sats[2].grund, "Umsatz-Hebel");
  assert.equal(sats[3].brain, false);
});

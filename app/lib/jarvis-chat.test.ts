import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ChatInputError, LEGACY_ID, checkBody, checkTitle, chatTime, flowSessionTitle, hasNew, isSessionId, lastUsed, legacyMessages, nextRunAt,
  orderSessions, safeLinks, sessionState, statusText, titleFrom, toMessage, toSession, type ChatSession,
} from "./jarvis-chat.ts";
import type { AgentTask } from "./agents.ts";

const NOW = new Date("2026-10-04T10:10:00Z"); // 12:10 deutsche Zeit
const S = (id: string, x: Partial<ChatSession> = {}): ChatSession => ({
  id, title: id, kind: "chat", flow_id: null, created_at: "2026-10-01T00:00:00Z", updated_at: "2026-10-01T00:00:00Z", read_at: null, archived: false, ...x,
});

test("Nachricht und Titel prüfen", () => {
  assert.equal(checkBody("  Hallo\r\nJARVIS  "), "Hallo\nJARVIS");
  assert.throws(() => checkBody("   "), ChatInputError);
  assert.throws(() => checkBody("x".repeat(8001)), /8000/);
  assert.equal(checkBody("x".repeat(8000)).length, 8000);
  assert.equal(checkTitle("  UK   Leads "), "UK Leads");
  assert.throws(() => checkTitle(""), ChatInputError);
  assert.throws(() => checkTitle("x".repeat(81)), ChatInputError);
  assert.ok(isSessionId("11111111-2222-3333-4444-555555555555"));
  assert.ok(!isSessionId(LEGACY_ID));
});

test("Titel aus der ersten Nachricht", () => {
  assert.equal(titleFrom("\n  UK Käufer finden\nund dann FR"), "UK Käufer finden");
  assert.equal(titleFrom(""), "Neue Sitzung");
  const t = titleFrom("Bitte prüfe warum in Frankreich seit drei Tagen keine Antworten kommen");
  assert.ok(t.length <= 42 && t.endsWith("…"), t);
  assert.equal(flowSessionTitle("US Webagenturen"), "Baukasten: US Webagenturen");
});

test("Status je Nachricht mit nächstem Lauf (:08/:23/:38/:53, deutsche Zeit)", () => {
  assert.equal(nextRunAt(NOW), "12:23");
  assert.deepEqual(statusText({ role: "inhaber", status: "offen" }, NOW), { text: "startet um 12:23", tone: "wait" });
  assert.deepEqual(statusText({ role: "inhaber", status: "offen" }, new Date("2026-10-04T10:55:00Z")), { text: "startet um 13:08", tone: "wait" });
  assert.equal(statusText({ role: "inhaber", status: "in_arbeit" }, NOW)?.text, "in Arbeit");
  assert.equal(statusText({ role: "inhaber", status: "fertig" }, NOW)?.text, "erledigt");
  assert.equal(statusText({ role: "jarvis", status: null }, NOW), null);
  assert.equal(sessionState([{ role: "inhaber", status: "offen" }], NOW), "startet um 12:23");
  assert.equal(sessionState([{ role: "inhaber", status: "offen" }, { role: "inhaber", status: "in_arbeit" }], NOW), "JARVIS arbeitet daran");
  assert.equal(sessionState([{ role: "inhaber", status: "fertig" }], NOW), null);
  // Winterzeit: 23:55 UTC = 00:55 MEZ → nächster Lauf 01:08
  assert.equal(nextRunAt(new Date("2026-12-01T23:55:00Z")), "01:08");
});

test("Zeiten in deutscher Zeit", () => {
  assert.equal(chatTime("2026-10-04T08:05:00Z", NOW), "10:05");
  assert.equal(chatTime("2026-10-03T21:30:00Z", NOW), "03.10. 23:30");
  assert.equal(chatTime("2026-10-03T22:30:00Z", NOW), "00:30"); // schon der 04.10. in Berlin
  assert.equal(chatTime(null, NOW), "");
  assert.equal(chatTime("kaputt", NOW), "");
});

test("Sitzungen: Tagesbericht oben, dann neueste; Baukasten und Archiv nicht in der Liste", () => {
  const list = [
    S("a", { last_at: "2026-10-04T08:00:00Z" }), S("b", { last_at: "2026-10-04T09:00:00Z" }), S("c"),
    S("r", { kind: "bericht", title: "Tagesbericht" }), S("x", { archived: true, last_at: "2026-10-04T09:30:00Z" }),
    S("k", { kind: "baukasten", flow_id: "f" }),
  ];
  assert.deepEqual(orderSessions(list).map((s) => s.id), ["r", "b", "a", "c"]);
  assert.equal(lastUsed(list)?.id, "b");
  assert.equal(lastUsed([S("r", { kind: "bericht" })]), null);
});

test("Punkt bei Neuem", () => {
  assert.ok(!hasNew({ read_at: null, last_jarvis_at: null }));
  assert.ok(hasNew({ read_at: null, last_jarvis_at: "2026-10-04T08:00:00Z" }));
  assert.ok(hasNew({ read_at: "2026-10-04T07:00:00Z", last_jarvis_at: "2026-10-04T08:00:00Z" }));
  assert.ok(!hasNew({ read_at: "2026-10-04T09:00:00Z", last_jarvis_at: "2026-10-04T08:00:00Z" }));
});

test("Links nur https oder Dashboard", () => {
  assert.deepEqual(safeLinks([
    { label: "PR", url: "https://github.com/x/y/pull/1" }, { label: "Bestand", url: "/dashboard/bestand?land=US" },
    { label: "böse", url: "javascript:alert(1)" }, { label: "fremd", url: "//evil.example" }, { label: "", url: "https://a" },
    { label: "http", url: "http://a.example" }, { label: "dash2", url: "/dashboard//evil" }, "kaputt",
  ]), [{ label: "PR", url: "https://github.com/x/y/pull/1" }, { label: "Bestand", url: "/dashboard/bestand?land=US" }]);
  assert.deepEqual(safeLinks(null), []);
  assert.equal(safeLinks(Array.from({ length: 12 }, () => ({ label: "a", url: "https://a" }))).length, 10);
});

test("Zeilen aus der Datenbank sicher machen", () => {
  const m = toMessage({ id: 1, session_id: "s", created_at: "t", role: "jarvis", body: "Hi", status: "offen", links: [{ label: "x", url: "ftp://a" }] });
  assert.deepEqual([m.role, m.status, m.links], ["jarvis", null, []]);
  assert.equal(toMessage({ id: 2, session_id: "s", role: "inhaber", body: "x", status: "komisch" }).status, "offen");
  assert.equal(toSession({ id: "s", kind: "zauber", archived: "ja" }).kind, "chat");
  assert.equal(toSession({ id: "s", kind: "zauber", archived: "ja" }).archived, false);
});

test("Frühere Chat-Aufträge bleiben lesbar", () => {
  const T = (x: Partial<AgentTask>): AgentTask => ({
    id: "t", created_at: "2026-10-04T08:00:00Z", agent: 1, kind: "frage", market: null, brief: "Warum?", status: "fertig", progress: 100,
    step: null, result: "Weil.", numbers: {}, started_at: null, finished_at: "2026-10-04T08:20:00Z", created_by: "JARVIS-Chat", ...x,
  });
  const msgs = legacyMessages([T({}), T({ id: "u", created_at: "2026-10-04T09:00:00Z", status: "offen", result: null }), T({ id: "v", created_by: "Inhaber Dashboard" })]);
  assert.deepEqual(msgs.map((m) => [m.id, m.role, m.status]), [["t-q", "inhaber", "fertig"], ["t-a", "jarvis", null], ["u-q", "inhaber", "offen"]]);
  assert.equal(msgs[1].body, "Weil.");
});

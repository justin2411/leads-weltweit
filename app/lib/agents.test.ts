import { test } from "node:test";
import assert from "node:assert/strict";
import { TaskError, agentBoard, validateTask, type AgentTask } from "./agents.ts";

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
  assert.equal(b.length, 4);
  assert.equal(b[0].current?.status, "laeuft");
  assert.equal(b[0].queued, 1);
  assert.equal(b[1].current?.finished_at, "9");
  assert.equal(b[2].current?.created_at, "1"); // ältester offener zuerst
  assert.equal(b[2].queued, 1);
  assert.equal(b[3].current, null);
});

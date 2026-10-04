import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { FIELDS, NODE_META, parseFlow, problems, type FlowKind } from "./flow.ts";
import { AGENT_COUNT } from "./agents.ts";

// Gemeinsame Fälle mit Python (scripts/lib/flow_check.py – Baukasten-Chat: flow_edit.py prüft wie der Baukasten).
const fx = JSON.parse(readFileSync(new URL("../../tests/fixtures/flow_check_cases.json", import.meta.url), "utf8"));

test("Beschriftungen gleich in TS und Python", () => {
  assert.deepEqual(Object.fromEntries(FIELDS.map((f) => [f.key, f.label])), fx.field_labels);
  assert.deepEqual(Object.fromEntries(Object.entries(NODE_META).map(([k, m]) => [k, m.label])), fx.node_labels);
});

test("parseFlow und problems wie in tests/fixtures/flow_check_cases.json", () => {
  for (const c of fx.cases as { name: string; kind: FlowKind; flow: unknown; parse_errors: string[] | null; problems: unknown[] | null }[]) {
    const p = parseFlow(c.flow);
    assert.deepEqual(p.ok ? null : p.errors, c.parse_errors, c.name);
    const got = p.ok
      ? problems(p.flow, c.kind).map((x) => ({ nodeId: x.nodeId ?? null, msg: x.msg.replace(`Agent 1 bis ${AGENT_COUNT}`, "Agent 1 bis {AGENT_COUNT}"), level: x.level }))
      : null;
    assert.deepEqual(got, c.problems, c.name);
  }
});

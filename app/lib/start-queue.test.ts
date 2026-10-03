import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { START_WORKFLOWS, WACHHUND_MINUTES, fmtBerlin, isStartKey, nextPickup, startState, type StartRequest } from "./start-queue.ts";

test("nächste Abholung durch den Wachhund", () => {
  assert.equal(nextPickup(new Date("2026-10-03T19:30:00Z")).toISOString(), "2026-10-03T19:41:00.000Z");
  assert.equal(nextPickup(new Date("2026-10-03T19:41:00Z")).toISOString(), "2026-10-03T19:56:00.000Z"); // genau jetzt -> nächster
  assert.equal(nextPickup(new Date("2026-10-03T19:57:30Z")).toISOString(), "2026-10-03T20:11:00.000Z");
  assert.equal(nextPickup(new Date("2026-10-03T23:58:00Z")).toISOString(), "2026-10-04T00:11:00.000Z");
});

test("Minuten passen zu wachhund.yml", () => {
  const yml = readFileSync(new URL("../../.github/workflows/wachhund.yml", import.meta.url), "utf8");
  const mins = [...yml.matchAll(/cron:\s*"([\d,]+) \* \* \* \*"/g)].flatMap((m) => m[1].split(",").map(Number)).sort((a, b) => a - b);
  assert.deepEqual(mins, WACHHUND_MINUTES);
});

test("deutsche Zeit (MESZ/MEZ)", () => {
  assert.equal(fmtBerlin(new Date("2026-10-03T19:41:00Z")), "21:41");
  assert.equal(fmtBerlin("2026-12-03T19:41:00Z"), "20:41");
  assert.equal(fmtBerlin(null), "–");
});

test("nur erlaubte Abläufe, nie Versand", () => {
  assert.ok(isStartKey("lead-werk"));
  assert.ok(!isStartKey("versand"));
  assert.ok(!isStartKey("send"));
  assert.ok(!isStartKey("__proto__"));
  assert.ok(!Object.values(START_WORKFLOWS).some((w) => /send|versand|followup|nachfass/.test(w.file)));
  // gleiche Liste wie der Wachhund und die DB-Prüfung
  const py = readFileSync(new URL("../../scripts/wachhund.py", import.meta.url), "utf8");
  for (const [k, w] of Object.entries(START_WORKFLOWS)) assert.ok(py.includes(`"${k}": {"wf": "${w.file}"`), k);
});

test("Startzustand", () => {
  const now = new Date("2026-10-03T19:30:00Z");
  const r = (status: StartRequest["status"], created_at: string, extra: Partial<StartRequest> = {}): StartRequest =>
    ({ id: created_at, created_at, workflow: "lead-werk", status, started_at: null, note: null, ...extra });
  assert.equal(startState([], "lead-werk", now), null);
  assert.deepEqual(startState([r("offen", "2026-10-03T19:20:00Z")], "lead-werk", now), { tone: "wait", text: "Start angefordert – spätestens 21:41" });
  assert.equal(startState([r("gestartet", "2026-10-03T19:00:00Z", { started_at: "2026-10-03T19:11:00Z" }), r("offen", "2026-10-03T18:00:00Z")], "lead-werk", now)?.text, "gestartet 21:11");
  assert.equal(startState([r("fehler", "2026-10-03T19:00:00Z", { note: "GitHub 422" })], "lead-werk", now)?.tone, "bad");
  assert.equal(startState([r("offen", "2026-10-03T17:00:00Z")], "lead-werk", now)?.tone, "bad");     // > 2 h offen
  assert.equal(startState([r("gestartet", "2026-10-03T15:00:00Z")], "lead-werk", now), null);         // zu alt für die Anzeige
  assert.equal(startState([r("offen", "2026-10-03T19:20:00Z")], "kunden-werk", now), null);
});

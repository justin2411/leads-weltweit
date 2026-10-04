import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PLAN, atLocal, isSendDay, lastSendDue, nextSendStart, planText, sendDayStart } from "./versandzeit.ts";
import { nextWorkflowRun } from "./dashboard-logic.ts";
import { cardNext, CARDS } from "./regler.ts";

test("Plan im Dashboard = app/lib/versandzeit.json (Python liest die JSON-Datei)", () => {
  const { _info, ...json } = JSON.parse(readFileSync(new URL("./versandzeit.json", import.meta.url), "utf8"));
  assert.ok(_info);
  assert.deepEqual(json, PLAN);
});

test("Sommer- und Winterzeit: 08:37 deutscher Zeit", () => {
  assert.equal(atLocal(2026, 10, 6, "08:37", "Europe/Berlin").toISOString(), "2026-10-06T06:37:00.000Z");  // MESZ
  assert.equal(atLocal(2026, 10, 27, "08:37", "Europe/Berlin").toISOString(), "2026-10-27T07:37:00.000Z"); // MEZ
});

test("Versand rund um die Uhr: nächster Lauf immer zur nächsten :37, auch am Wochenende", () => {
  // Sonntag 04.10.2026 12:00 UTC (14:00 MESZ) -> 14:37 MESZ
  const sun = new Date("2026-10-04T12:00:00Z");
  assert.equal(nextSendStart(sun)?.at.toISOString(), "2026-10-04T12:37:00.000Z");
  assert.equal(nextSendStart(sun)?.g.gruppe, "alle");
  // kurz nach dem Lauf -> nächste Stunde
  assert.equal(nextSendStart(new Date("2026-10-04T12:40:00Z"))?.at.toISOString(), "2026-10-04T13:37:00.000Z");
  // über Mitternacht (deutscher Zeit) -> 00:37 MESZ
  assert.equal(nextSendStart(new Date("2026-10-04T21:50:00Z"))?.at.toISOString(), "2026-10-04T22:37:00.000Z");
  // nach der Zeitumstellung (25.10.)
  assert.equal(nextSendStart(new Date("2026-10-25T12:00:00Z"))?.at.toISOString(), "2026-10-25T12:37:00.000Z");
  assert.equal(nextWorkflowRun({ file: "send.yml", crons: [] }, sun)?.toISOString(), "2026-10-04T12:37:00.000Z");
  assert.equal(nextWorkflowRun({ file: "x.yml", crons: ["17 12 * * *"] }, sun)?.toISOString(), "2026-10-04T12:17:00.000Z");
  const versand = CARDS.find((c) => c.key === "versand")!;
  assert.equal(versand.cron, "37 * * * *");
  assert.equal(cardNext(versand, sun).toISOString(), "2026-10-04T12:37:00.000Z");
});

test("letzter fälliger Lauf: jede Stunde, jeder Tag", () => {
  const mon = new Date("2026-10-12T10:00:00Z");
  assert.equal(isSendDay(mon), true);
  assert.equal(isSendDay(new Date("2026-10-10T10:00:00Z")), true);   // Samstag
  assert.equal(lastSendDue(mon)?.at.toISOString(), "2026-10-12T08:37:00.000Z");
  assert.equal(sendDayStart(mon)?.toISOString(), "2026-10-11T22:37:00.000Z");  // Mo 00:37 MESZ
  assert.equal(planText(), "täglich 0–24 Uhr · stündlich :37");
});

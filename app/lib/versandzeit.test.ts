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

test("nächster Lauf: nur Di–Do, UK/FR morgens, US nachmittags", () => {
  // Sonntag 04.10.2026 12:00 UTC -> Dienstag 06.10. 08:37 MESZ
  const sun = new Date("2026-10-04T12:00:00Z");
  assert.equal(nextSendStart(sun)?.at.toISOString(), "2026-10-06T06:37:00.000Z");
  assert.equal(nextSendStart(sun)?.g.gruppe, "europa");
  // Dienstag nach dem UK/FR-Lauf -> US 14:37 MESZ
  assert.equal(nextSendStart(new Date("2026-10-06T09:00:00Z"))?.at.toISOString(), "2026-10-06T12:37:00.000Z");
  // Donnerstag abends -> nächster Dienstag
  assert.equal(nextSendStart(new Date("2026-10-08T18:00:00Z"))?.at.toISOString(), "2026-10-13T06:37:00.000Z");
  // nach der Zeitumstellung (25.10.): 08:37 MEZ = 07:37 UTC
  assert.equal(nextSendStart(new Date("2026-10-25T12:00:00Z"))?.at.toISOString(), "2026-10-27T07:37:00.000Z");
  assert.equal(nextWorkflowRun({ file: "send.yml", crons: [] }, sun)?.toISOString(), "2026-10-06T06:37:00.000Z");
  assert.equal(nextWorkflowRun({ file: "x.yml", crons: ["17 12 * * *"] }, sun)?.toISOString(), "2026-10-04T12:17:00.000Z");
  const versand = CARDS.find((c) => c.key === "versand")!;
  assert.equal(cardNext(versand, sun).toISOString(), "2026-10-06T06:37:00.000Z");
});

test("letzter fälliger Lauf und Versandtage", () => {
  const mon = new Date("2026-10-12T10:00:00Z");
  assert.equal(isSendDay(mon), false);
  assert.equal(isSendDay(new Date("2026-10-07T10:00:00Z")), true);
  assert.equal(lastSendDue(mon)?.at.toISOString(), "2026-10-08T12:37:00.000Z");      // Do US
  assert.equal(sendDayStart(mon)?.toISOString(), "2026-10-08T06:37:00.000Z");        // Do 08:37
  assert.equal(planText(), "Di–Do · UK/FR 08:37 · US 14:37");
});

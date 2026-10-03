import { test } from "node:test";
import assert from "node:assert/strict";
import { EMPTY_ACTIVITY, flowSeconds, isLive, sampleErrorRate, werkStatus, type Activity } from "./werke-live.ts";
import { DEFAULTS, toggleWerkPaused, werkOn } from "./owner-settings.ts";

const NOW = new Date("2026-10-03T18:00:00Z");
const act = (p: Partial<Activity>): Activity => ({ ...EMPTY_ACTIVITY, now: NOW.toISOString(), ...p });

test("Kunden-Werk: prüft regelmäßig, findet aber keine neuen Käufer -> gelb mit Grund statt „zu alt“", () => {
  const a = act({ last_prospect_at: "2026-10-03T09:37:00Z", last_prospect_checked_at: "2026-10-03T17:05:00Z",
                  last_run: { "kunden-werk": "2026-10-03T17:30:00Z" } });
  const s = werkStatus({ werk: "kunden-werk", a, now: NOW, maxH: 5 });
  assert.equal(s.label, "läuft – Pool erschöpft");
  assert.equal(s.cls, "t-gold");
  assert.match(s.why, /keine neuen Käufer seit 8 h/);
});

test("läuft nur mit echtem Lebenszeichen", () => {
  const beat = { werk: "lead-werk", part: "web-us-3", run_id: "1", started_at: null, beat_at: "2026-10-03T17:57:00Z", processed: 10, green: 2, note: null };
  assert.equal(isLive(act({ heartbeats: [beat] }), "lead-werk", NOW), true);
  assert.equal(isLive(act({ heartbeats: [{ ...beat, beat_at: "2026-10-03T17:40:00Z" }] }), "lead-werk", NOW), false);
  assert.equal(isLive(act({ heartbeats: [{ ...beat, note: "fertig" }] }), "lead-werk", NOW), false);
  assert.equal(werkStatus({ werk: "lead-werk", a: act({ heartbeats: [beat] }), now: NOW, maxH: 4 }).label, "läuft");
});

test("pausiert schlägt alles, steht nach langer Stille", () => {
  const a = act({ last_lead_at: "2026-10-03T17:59:00Z", leads_15m: 4 });
  assert.equal(werkStatus({ werk: "lead-werk", a, now: NOW, maxH: 4, pausedSince: "2026-10-03T16:00:00Z" }).label, "pausiert");
  assert.equal(werkStatus({ werk: "lead-werk", a: act({ last_lead_at: "2026-10-02T18:00:00Z" }), now: NOW, maxH: 4 }).label, "steht");
});

test("Fehlerquote der Stichprobe: über 2 % gelb, über 5 % rot", () => {
  const r = sampleErrorRate([{ country: "US", finished_at: "x", candidates: 100, green: 99, red: 1, reasons: {} },
                             { country: "UK", finished_at: "x", candidates: 100, green: 97, red: 3, reasons: {} },
                             { country: "FR", finished_at: "x", candidates: 100, green: 90, red: 10, reasons: {} }]);
  assert.deepEqual(r.map((x) => x.level), ["gruen", "gelb", "rot"]);
});

test("Werk-Schalter: nur bekannte Werke, Versand/Nachfass über ihre Schalter", () => {
  const p = toggleWerkPaused({}, "lead-werk", "2026-10-03T18:00:00Z");
  assert.deepEqual(p, { "lead-werk": "2026-10-03T18:00:00Z" });
  assert.deepEqual(toggleWerkPaused(p, "lead-werk", "x"), {});
  assert.throws(() => toggleWerkPaused({}, "versand", "x"));
  assert.throws(() => toggleWerkPaused({}, "sperrliste", "x"));
  assert.equal(werkOn({ ...DEFAULTS, send_paused: true }, "versand").on, false);
  assert.equal(werkOn({ ...DEFAULTS, werke_paused: p }, "lead-werk").since, "2026-10-03T18:00:00Z");
});

test("Fließtempo steigt mit der Aktivität", () => {
  assert.equal(flowSeconds(0), null);
  assert.ok((flowSeconds(1000) ?? 99) < (flowSeconds(5) ?? 0));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentTask } from "./agents.ts";
import { abTests, brainNow, foldKey, latestReport, pagesByPage, pct, timeline, upcoming, type Decision, type PageStat } from "./gehirn.ts";

const now = new Date("2026-10-04T10:00:00Z");
const task = (o: Partial<AgentTask>): AgentTask => ({
  id: "t", created_at: "2026-10-04T09:00:00Z", agent: 1, kind: "leads", market: "UK", brief: "Leads holen UK", status: "offen",
  progress: 0, step: null, result: null, numbers: {}, started_at: null, finished_at: null, ...o,
});
const dec = (o: Partial<Decision>): Decision => ({ id: 1, type: "note", subject: "Etwas", status: "done", created_at: "2026-10-03T08:00:00Z", ...o });
const page = (o: Partial<PageStat>): PageStat => ({
  variant_id: "v", page_id: "p", slug: "uk/web-agencies", page_status: "live", variant_key: "A", variant_status: "live",
  traffic_share: 50, views: 0, cta_clicks: 0, sample_requests: 0, purchases: 0, ...o,
});

test("Schlüssel und Quote", () => {
  assert.equal(foldKey("seiten"), "gh:fold:seiten");
  assert.equal(pct(1, 8), "12,5 %");
  assert.equal(pct(3, 0), "–");
});

test("Satz in der Mitte: aus, arbeitet, wartet, zuletzt, bereit", () => {
  const on = { brain_enabled: true };
  assert.equal(brainNow({ settings: {}, tasks: [], decisions: [], now }).mode, "aus");

  const run = brainNow({ settings: on, now, decisions: [], tasks: [
    task({ id: "a", agent: 2, status: "laeuft", step: "Quellen prüfen", progress: 45.4, started_at: "2026-10-04T09:50:00Z" }),
    task({ id: "b", agent: 3, status: "laeuft", started_at: "2026-10-04T09:10:00Z" }),
    task({ id: "c", status: "offen" }),
  ] });
  assert.equal(run.mode, "arbeitet");
  assert.equal(run.sentence, "Agent 2 arbeitet: Quellen prüfen (45 %) · +1 weitere");
  assert.equal(run.queued, 1);
  assert.ok(run.hot);

  const wait = brainNow({ settings: on, now, tasks: [], decisions: [dec({ status: "proposed", subject: "Neue Seite FR" }), dec({ id: 2, status: "proposed", subject: "Alt", created_at: "2026-10-01T08:00:00Z" })] });
  assert.equal(wait.mode, "wartet");
  assert.equal(wait.sentence, "Wartet auf deine Entscheidung: Neue Seite FR · 2 offen");

  const recent = brainNow({ settings: on, now, tasks: [], decisions: [dec({ subject: "Preis getestet", created_at: "2026-10-04T09:30:00Z" })] });
  assert.match(recent.sentence, /^Zuletzt um 11:30: Preis getestet$/);

  const idle = brainNow({ settings: on, now, tasks: [], decisions: [dec({})] });
  assert.equal(idle.mode, "bereit");
  assert.equal(idle.sentence, "Bereit – nächste Agenten-Runde um 12:08");
  assert.ok(!idle.hot);
});

test("Seiten gruppieren und A/B-Tests erkennen", () => {
  const rows = [
    page({ variant_id: "1", variant_key: "A", views: 100, sample_requests: 2 }),
    page({ variant_id: "2", variant_key: "B", views: 100, sample_requests: 5, variant_status: "review" }),
    page({ variant_id: "3", variant_key: "C", variant_status: "retired", views: 500, sample_requests: 50 }),
    page({ variant_id: "4", page_id: "q", slug: "us/web-agencies", variant_key: "A" }),
  ];
  const g = pagesByPage(rows);
  assert.equal(g.length, 2);
  assert.equal(g[0].variants.length, 3);
  assert.equal(g[0].views, 700);
  const ab = abTests(rows);
  assert.equal(ab.length, 1);
  assert.deepEqual(ab[0].variants.map((v) => v.key), ["A", "B"]);
  assert.equal(ab[0].leader, "B");
  // zu wenig Aufrufe: noch kein Vorne
  assert.equal(abTests([page({ variant_key: "A", views: 5, sample_requests: 1 }), page({ variant_id: "x", variant_key: "B", views: 5 })])[0].leader, null);
});

test("Nächste Läufe und Verlauf", () => {
  const up = upcoming([{ file: "a.yml", name: "Lead-Werk", crons: ["23 */3 * * *"] }, { file: "b.yml", name: "kaputt", crons: ["x"] }], now);
  assert.deepEqual(up.map((u) => u.name), ["Agenten-Runde (JARVIS)", "Lead-Werk"]);
  assert.equal(up[0].at.toISOString(), "2026-10-04T10:08:00.000Z");
  assert.equal(up[1].at.toISOString(), "2026-10-04T12:23:00.000Z");

  const tl = timeline(
    [dec({ subject: "D1", created_at: "2026-10-04T08:00:00Z" })],
    [task({ status: "fertig", finished_at: "2026-10-04T09:00:00Z", result: "12 Leads" }), task({ status: "laeuft" })],
  );
  assert.deepEqual(tl.map((e) => e.kind), ["auftrag", "entscheidung"]);
  assert.equal(tl[0].detail, "12 Leads");

  assert.equal(latestReport([dec({ type: "note" })]), null);
  assert.equal(latestReport([dec({ type: "daily_note", subject: "a", created_at: "2026-10-02T06:00:00Z" }), dec({ type: "daily_note", subject: "b", created_at: "2026-10-03T06:00:00Z" })])?.subject, "b");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import type { AgentTask } from "./agents.ts";
import { abTests, brainNow, clockAngle, clockMarks, decisionTone, foldKey, isStale, latestReport, openProposals, pagesByPage, pct, polar, proposalGroups, relBars, satellites, splitShares, upcoming, type Decision, type PageStat } from "./gehirn.ts";

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
  assert.equal(run.line, "A2 · Quellen prüfen · +1");
  assert.equal(run.queued, 1);
  assert.ok(run.hot);

  const wait = brainNow({ settings: on, now, tasks: [], decisions: [dec({ status: "proposed", subject: "Neue Seite FR" }), dec({ id: 2, status: "proposed", subject: "Alt", created_at: "2026-10-01T08:00:00Z" })] });
  assert.equal(wait.mode, "wartet");
  assert.equal(wait.sentence, "Wartet auf deine Entscheidung: Neue Seite FR · 2 offen");
  assert.equal(wait.line, "2 Vorschläge · Neue Seite FR");
  // Vorschläge älter als 7 Tage zählen nicht mehr als offen
  const stale = brainNow({ settings: on, now, tasks: [], decisions: [dec({ status: "proposed", created_at: "2026-09-26T08:00:00Z" })] });
  assert.equal(stale.mode, "bereit");

  const recent = brainNow({ settings: on, now, tasks: [], decisions: [dec({ subject: "Preis getestet", created_at: "2026-10-04T09:30:00Z" })] });
  assert.match(recent.sentence, /^Zuletzt um 11:30: Preis getestet$/);

  const idle = brainNow({ settings: on, now, tasks: [], decisions: [dec({})] });
  assert.equal(idle.mode, "bereit");
  assert.equal(idle.sentence, "Bereit – nächste Agenten-Runde um 12:08");
  assert.equal(idle.line, "Bereit · Runde 12:08");
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

test("Nächste Läufe und Tagesbericht", () => {
  const up = upcoming([{ file: "a.yml", name: "Lead-Werk", crons: ["23 */3 * * *"] }, { file: "b.yml", name: "kaputt", crons: ["x"] }], now);
  assert.deepEqual(up.map((u) => u.name), ["Agenten-Runde (JARVIS)", "Lead-Werk"]);
  assert.equal(up[0].at.toISOString(), "2026-10-04T10:08:00.000Z");
  assert.equal(up[1].at.toISOString(), "2026-10-04T12:23:00.000Z");

  assert.equal(latestReport([dec({ type: "note" })]), null);
  assert.equal(latestReport([dec({ type: "daily_note", subject: "a", created_at: "2026-10-02T06:00:00Z" }), dec({ type: "daily_note", subject: "b", created_at: "2026-10-03T06:00:00Z" })])?.subject, "b");
});

test("Uhr: Winkel in deutscher Zeit, Punkte, Zusammenfassen", () => {
  // 10:00 UTC = 12:00 MESZ → 180°
  assert.equal(clockAngle(now), 180);
  assert.equal(clockAngle(new Date("2026-10-03T22:00:00Z")), 0); // Mitternacht
  assert.equal(clockAngle(new Date("2026-12-01T05:00:00Z")), 90); // 6:00 MEZ
  assert.deepEqual(polar(0, 40), { x: 50, y: 10 });
  assert.deepEqual(polar(90, 40), { x: 90, y: 50 });
  assert.deepEqual(polar(180, 40), { x: 50, y: 90 });
  const marks = clockMarks([
    { name: "B", at: new Date("2026-10-04T10:23:00Z") },
    { name: "A", at: new Date("2026-10-04T10:20:00Z") },
    { name: "C", at: new Date("2026-10-04T10:23:00Z") },
    { name: "D", at: new Date("2026-10-04T12:00:00Z") },
  ], 8);
  assert.equal(marks.length, 2);
  assert.deepEqual(marks[0].names, ["A", "B", "C"]);
  assert.equal(marks[0].time, "12:20");
  assert.equal(marks[0].angle, 185);
  assert.ok(marks[0].next && !marks[1].next);
  assert.equal(marks[1].angle, 210);
});

test("Satelliten: je Agent ein Platz, laufend vor wartend, sonst frei", () => {
  const sats = satellites([
    task({ id: "a", agent: 1, status: "laeuft", progress: 120, step: "Lesen", started_at: "2026-10-04T09:00:00Z" }),
    task({ id: "b", agent: 1, status: "offen" }),
    task({ id: "c", agent: 2, status: "offen", brief: "Quelle IE" }),
    task({ id: "d", agent: 2, status: "offen" }),
    task({ id: "e", agent: 3, status: "fertig" }),
  ], 4);
  assert.equal(sats.length, 4);
  assert.deepEqual(sats.map((s) => s.state), ["laeuft", "wartet", "frei", "frei"]);
  assert.deepEqual(sats.map((s) => s.angle), [45, 135, 225, 315]);
  assert.equal(sats[0].progress, 100);
  assert.equal(sats[0].step, "Lesen");
  assert.equal(sats[0].queued, 1);
  assert.equal(sats[1].brief, "Quelle IE");
  assert.equal(sats[1].queued, 1);
  assert.equal(sats[2].queued, 0);
  // Standard: alle Agenten (A1–A8), gleichmäßig verteilt
  const all = satellites([]);
  assert.equal(all.length, 8);
  assert.deepEqual(all.map((s) => s.angle), [22.5, 67.5, 112.5, 157.5, 202.5, 247.5, 292.5, 337.5]);
  assert.ok(all.every((s) => s.state === "frei"));
});

test("Geteilter Balken und relative Balken", () => {
  assert.deepEqual(splitShares([0.02, 0.05]), [28.6, 71.4]);
  assert.deepEqual(splitShares([0, 0]), [50, 50]);
  assert.deepEqual(splitShares([0, 0.1]), [18, 82]);
  assert.deepEqual(splitShares([0.01, 0.01, 0.08]), [18, 18, 64]);
  assert.deepEqual(splitShares([]), []);
  assert.deepEqual(relBars([1, 4, 0]), [25, 100, 0]);
  assert.deepEqual(relBars([0, 0]), [0, 0]);
});

test("Vorschläge: offen, älter, übrige", () => {
  const ds = [
    dec({ id: 1, status: "proposed", created_at: "2026-10-03T08:00:00Z" }),
    dec({ id: 2, status: "proposed", created_at: "2026-09-20T08:00:00Z" }),
    dec({ id: 3, status: "done", created_at: "2026-10-04T08:00:00Z" }),
    dec({ id: 4, status: "rejected", created_at: "2026-10-02T08:00:00Z" }),
    dec({ id: 5, type: "daily_note", status: "done", created_at: "2026-10-04T05:00:00Z" }),
  ];
  const g = proposalGroups(ds, now, 5);
  assert.deepEqual(g.open.map((d) => d.id), [1]);
  assert.deepEqual(g.old.map((d) => d.id), [2]);
  assert.deepEqual(g.rest.map((d) => d.id), [3, 4]);
  assert.equal(openProposals(ds, now).length, 1);
  assert.ok(isStale(ds[1], now) && !isStale(ds[0], now));
  assert.deepEqual(["proposed", "done", "rejected", "x"].map(decisionTone), ["gold", "green", "grey", "cyan"]);
});

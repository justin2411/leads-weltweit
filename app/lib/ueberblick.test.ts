import { test } from "node:test";
import assert from "node:assert/strict";
import { bar, dayShare, deZeit, heuteWichtig, judgeFlow, leadZiel, stillTip, switchedOff, zeitleiste, type FlowRow, type WichtigInput } from "./ueberblick.ts";

const base: WichtigInput = { brake: null, deliver: null, openReplies: 0, stich: [], bad: [], neck: null };

test("Heute wichtig: nichts los -> leer", () => {
  assert.deepEqual(heuteWichtig(base), []);
});

test("Heute wichtig: höchstens 3, rot vor gelb, Titel ≤ 60", () => {
  const r = heuteWichtig({
    ...base,
    openReplies: 4,
    neck: { id: "antworten", label: "Antworten" },
    deliver: { status: "gelb", gruende: ["Bounce-Quote 7 T 3.9 %"] },
    stich: [{ country: "UK", candidates: 100, green: 94 }, { country: "US", candidates: 100, green: 99 }],
    bad: [{ id: "lead", label: "Lead-Werk" }],
  });
  assert.equal(r.length, 3);
  assert.deepEqual(r.map((x) => x.level), ["rot", "rot", "gelb"]);
  assert.match(r[0].title, /Freigabe UK: 6,0 % Fehler/);
  assert.equal(r[0].href, "/dashboard/jarvis?s=gate&t=check&f=rot");
  assert.match(r[1].title, /Lead-Werk/);
  assert.match(r[2].title, /Zustellbarkeit/);
  for (const x of r) assert.ok(x.title.length <= 60);
});

test("Heute wichtig: Notbremse immer zuerst, offene Antworten führen ins Cockpit", () => {
  const r = heuteWichtig({ ...base, brake: "1 Spam-Beschwerde", openReplies: 1 });
  assert.equal(r[0].title, "Notbremse: Versand steht");
  assert.deepEqual(r[1], { level: "gelb", title: "1 Antwort offen", href: "/dashboard/antworten" });
});

test("Heute wichtig: Zustellbarkeit grün und Stichprobe ≤ 2 % melden nichts", () => {
  assert.deepEqual(heuteWichtig({ ...base, deliver: { status: "gruen", gruende: [] }, stich: [{ country: "FR", candidates: 100, green: 98 }] }), []);
});

test("Balken: Soll bis jetzt entscheidet die Farbe", () => {
  assert.equal(bar("US", 45, 100, 0.5).tone, "green");     // 45 von Soll 50 = 90 %
  assert.equal(bar("US", 30, 100, 0.5).tone, "gold");      // 60 %
  assert.equal(bar("US", 29, 100, 0.5).tone, "red");
  assert.equal(bar("US", 29, 100, 0.5).pct, 29);
  assert.equal(bar("US", 500, 100, 1).pct, 100);
  assert.equal(bar("US", 5, null, 0.5).tone, "grey");
  assert.equal(bar("US", 0, 100, 0).tone, "red");           // Soll mindestens 1
});

test("Lead-Ziel = Ø der Vortage (bis 7), heute zählt nicht", () => {
  const rows = [
    { day: "2026-10-04", country: "US", value: 999 },
    { day: "2026-10-03", country: "US", value: 100 },
    { day: "2026-10-02", country: "US", value: 200 },
    { day: "2026-10-03", country: "UK", value: 7 },
  ];
  assert.equal(leadZiel(rows, "US", "2026-10-04"), 150);
  assert.equal(leadZiel(rows, "UK", "2026-10-04"), 7);
  assert.equal(leadZiel(rows, "FR", "2026-10-04"), null);
});

test("Zeit in deutscher Zeit mit MESZ/MEZ", () => {
  assert.equal(deZeit("2026-10-04T14:00:00Z"), "04.10. 16:00 MESZ");
  assert.equal(deZeit("2026-12-04T14:00:00Z"), "04.12. 15:00 MEZ");
  assert.equal(dayShare(new Date("2026-10-04T10:00:00Z")), 0.5);   // 12:00 MESZ
});

test("Zeitleiste: neueste zuerst, höchstens 20, kurz_* bevorzugt, Grenzen eingehalten", () => {
  const rows = Array.from({ length: 25 }, (_, i) => ({ id: i, created_at: `2026-10-04T${String(i % 24).padStart(2, "0")}:00:00Z`, status: "done",
    subject: "Sitzung 04.10. 12:00 UTC: " + "sehr langer Betreff ".repeat(10), reasoning: "Grund ".repeat(80), kurz_titel: i === 23 ? "Kurz" : null, kurz_grund: null }));
  const z = zeitleiste(rows);
  assert.equal(z.length, 20);
  assert.equal(z[0].titel, "Kurz");
  for (const e of z) { assert.ok(e.titel.length <= 60); assert.ok(e.grund.length <= 160); }
});

// ------------------------------------------------------------- Datenfluss-Alarm (Regeln wie scripts/datenfluss.py)
const T = new Date("2026-10-04T12:00:00Z");
const ago = (h: number) => new Date(T.getTime() - h * 3_600_000).toISOString();
const on = { lead_suche: true, kunden_suche: true, versand_aktiv: true, werke_paused: {}, send_paused: false };

test("Stillstand: ok, gelb (> 3× Intervall), rot (> 6× und ≥ 6 h), keine Basis", () => {
  const rows: FlowRow[] = [
    { station: "leads", last_at: ago(1), active_hours: 168, extra: null },      // Intervall 1 h, Grenze 3 h -> ok
    { station: "kaeufer", last_at: ago(4), active_hours: 168, extra: null },    // 4 h > 3 h -> gelb
    { station: "mails", last_at: ago(7), active_hours: 168, extra: null },      // 7 h ≥ 6 h und ≥ 6× -> rot
    { station: "proben", last_at: null, active_hours: 0, extra: 0 },           // keine Basis
    { station: "antworten", last_at: ago(1), active_hours: 2, extra: null },
  ];
  const r = Object.fromEntries(judgeFlow(rows, T, switchedOff(on, rows)).map((a) => [a.key, a.stufe]));
  assert.deepEqual(r, { leads: "ok", kaeufer: "gelb", mails: "rot", proben: "keine_basis", antworten: "ok" });
});

test("Stillstand: Grenze nie unter 2 h; rot erst ab 6 h", () => {
  const rows: FlowRow[] = [{ station: "leads", last_at: ago(1.9), active_hours: 168, extra: null }, { station: "kaeufer", last_at: ago(5), active_hours: 168, extra: null }];
  const r = judgeFlow(rows, T, new Set());
  assert.equal(r[0].stufe, "ok");
  assert.equal(r[1].stufe, "gelb");
});

test("Stillstand: gewollt aus meldet nie (Pause, Datei-Schalter, Vorrat da, ohne Mails keine Antworten)", () => {
  const rows: FlowRow[] = [
    { station: "leads", last_at: ago(50), active_hours: 168, extra: null },
    { station: "kaeufer", last_at: ago(50), active_hours: 168, extra: null },
    { station: "proben", last_at: ago(50), active_hours: 168, extra: 12 },
    { station: "mails", last_at: ago(50), active_hours: 168, extra: null },
    { station: "antworten", last_at: ago(50), active_hours: 168, extra: null },
  ];
  const off = switchedOff({ ...on, lead_suche: false, werke_paused: { "kunden-werk": "2026-10-04" }, send_paused: true }, rows);
  assert.deepEqual([...off].sort(), ["antworten", "kaeufer", "leads", "mails", "proben"]);
  assert.ok(judgeFlow(rows, T, off).every((a) => a.stufe === "aus"));
});

test("Stillstand: Kachel und Heute-wichtig-Punkt", () => {
  const [a] = judgeFlow([{ station: "mails", last_at: ago(7), active_hours: 168, extra: null }], T, new Set());
  const tip = stillTip(a);
  assert.equal(tip.level, "rot");
  assert.equal(tip.title, "Mails gesendet steht seit 7 h still");
  assert.equal(tip.href, "/dashboard/jarvis?s=versand");
  assert.equal(tip.task.kind, "pruefen");
  assert.ok(tip.text.length <= 160);
  const w = heuteWichtig({ ...base, openReplies: 2, still: [a] });
  assert.equal(w[0].title, "Mails gesendet steht seit 7 h still");
});

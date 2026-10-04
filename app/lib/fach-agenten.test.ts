import { test } from "node:test";
import assert from "node:assert/strict";
import { engpass, karten, normalizeBestand, normalizeKpi, normalizePruef, pruefTage, prueferBild, roleAmpel, roleBrief, seriesKennzahl, toRolle, type Rolle } from "./fach-agenten.ts";
import type { KohorteRow } from "./kohorten.ts";
import type { BrainRoutine } from "./brain-routines.ts";

const R = (x: Partial<Rolle> = {}): Rolle => toRolle({
  slug: "zustellung", name: "Zustell-Agent", gruppe: "qualitaet", typ: "llm", rolle: "Bounces", kennzahl: "Bounce-Quote",
  richtung: "tief", einheit: "quote", gut: 0.02, knapp: 0.05, min_n: 50, takt: "täglich 06:30", werkzeuge: [], grenzen: [],
  auftrag: "Zustell-Agent: prüfen", routine_id: "r1", sort: 60, aktiv: true, ...x,
});
const TODAY = "2026-10-14";

test("roleAmpel: Richtung hoch/tief, grau ohne Basis", () => {
  const tief = R();
  assert.equal(roleAmpel(tief, 0.01, 100), "green");
  assert.equal(roleAmpel(tief, 0.04, 100), "gold");
  assert.equal(roleAmpel(tief, 0.08, 100), "red");
  assert.equal(roleAmpel(tief, 0.01, 10), "grey");
  const hoch = R({ richtung: "hoch", gut: 0.03, knapp: 0.01 });
  assert.equal(roleAmpel(hoch, 0.04, 100), "green");
  assert.equal(roleAmpel(hoch, 0.005, 100), "red");
  assert.equal(roleAmpel(hoch, null, 100), "grey");
});

test("seriesKennzahl: 7 Tage bis heute, Trend gegen Vorwoche, fallend ist bei „tief“ gut", () => {
  const rows = normalizeKpi([
    { rolle: "zustellung", day: "2026-10-03", k: "6", n: "100" },   // Vorwoche 6 %
    { rolle: "zustellung", day: "2026-10-10", k: "1", n: "50" },    // diese Woche 2/100 = 2 %
    { rolle: "zustellung", day: "2026-10-14", k: 1, n: 50 },
    { rolle: "zustellung", day: "kaputt", k: 1, n: 1 },
  ]);
  assert.equal(rows.length, 3);
  const k = seriesKennzahl(R(), rows, TODAY);
  assert.equal(k.wert, 0.02);
  assert.equal(k.text, "2 %");
  assert.equal(k.ampel, "green");
  assert.equal(k.points.length, 7);
  assert.equal(k.points[6], 0.02);
  assert.equal(k.points[0], null);
  assert.equal(k.trend?.dir, "down");
  assert.equal(k.gut, true);
});

test("Engpass: schlechtester reifer Schritt über alle Länder", () => {
  const rows: KohorteRow[] = [
    { week: "2026-W38", country: "US", sent: 100, delivered: 98, replies: 0, positive: 0, samples: 0, customers: 0 },
    { week: "2026-W38", country: "UK", sent: 60, delivered: 59, replies: 1, positive: 0, samples: 0, customers: 0 },
    { week: "2026-W41", country: "US", sent: 40, delivered: 39, replies: 0, positive: 0, samples: 0, customers: 0 },
  ];
  const e = engpass(rows, "2026-10-12", R({ slug: "trichter", richtung: "hoch", kennzahl: "Engpass-Quote" }));
  assert.equal(e.schritt, "antwort");
  assert.equal(e.ampel, "red");
  assert.match(e.label, /Antwort/);
  assert.equal(e.points.at(-1), null); // laufende Woche ohne Wert
  assert.equal(engpass(null, TODAY, R()).ampel, "grey");
});

test("Prüfer: robuste Spalten, heute-Kacheln, ohne Daten null", () => {
  const raw = [
    { day: "2026-10-14", art: "lead", geprueft: 200, bestanden: 190, gehalten: 10, score_avg: 87.5, mehrfach_anteil: 0.4 },
    { tag: "2026-10-13", kind: "leads", checked: 100, passed: 99 },
    { day: "2026-10-14", art: "kaeufer", geprueft: 50, bestanden: 45, mehrfach: 5 },
    { day: "2026-10-14", art: "unbekannt", geprueft: 1 },
  ];
  const p = normalizePruef(raw);
  assert.equal(p.length, 3);
  assert.equal(p[1].gehalten, 1);
  assert.equal(p[2].mehrfach, 0.1);
  const lead = R({ slug: "lead_pruefer", typ: "python", richtung: "hoch", gut: 0.95, knapp: 0.9, min_n: 20 });
  const b = prueferBild(lead, p, TODAY)!;
  assert.equal(b.heute?.geprueft, 200);
  assert.equal(b.heute?.bestanden, 0.95);
  assert.equal(b.heute?.score, 87.5);
  assert.equal(b.ampel, "green");
  assert.equal(prueferBild(lead, null, TODAY), null);
  assert.deepEqual(normalizePruef("x"), []);
});

test("karten: letzter Auftrag, offen, Wirkung, nächster Termin, Prüfer ohne Daten", () => {
  const routine: BrainRoutine = { id: "r1", name: "Zustellung prüfen", aufgabe: "x", uhrzeit: "06:30", tage: "taeglich", wochentage: [], dauer_min: 10,
    aktiv: true, last_run_at: null, last_task_id: null, last_result: null, created_at: "" };
  const cs = karten({
    roles: [R(), R({ slug: "kaeufer_pruefer", typ: "python", sort: 50 }), R({ slug: "alt", aktiv: false })],
    routines: [routine],
    tasks: [
      { id: "a", rolle: "zustellung", agent: 2, status: "fertig", result: "ok", created_at: "2026-10-12T05:00:00Z", finished_at: "2026-10-12T05:20:00Z", wirkung: { bewertung: "wirkt" } },
      { id: "b", rolle: "zustellung", agent: 3, status: "offen", result: null, created_at: "2026-10-14T05:00:00Z", finished_at: null },
    ],
    kpi: [], kohorten: null, pruef: null, today: TODAY, now: new Date("2026-10-14T03:00:00Z"),
  });
  assert.deepEqual(cs.map((c) => c.r.slug), ["kaeufer_pruefer", "zustellung"]);
  const z = cs[1];
  assert.equal(z.letzter?.id, "b");
  assert.equal(z.offen, true);
  assert.equal(z.wirkung, "wirkt");
  assert.equal(z.naechster, "heute 06:30");
  assert.equal(z.kz, null);
  assert.equal(cs[0].kz, null);
  assert.equal(cs[0].naechster, "Dauerlauf");
});

test("roleBrief: gleich der Python-Fassung, ≤ 1000 Zeichen", () => {
  const b = roleBrief({ name: "Test-Agent", auftrag: "Test-Agent: ab.py auswerten." }, 20, "A/B zählen");
  assert.ok(b.startsWith("Fach-Agent Test-Agent (20 min): Test-Agent: ab.py auswerten. Routine: A/B zählen"));
  assert.ok(!roleBrief({ name: "Test-Agent", auftrag: "a b c d e f" }, 20, "Test-Agent: x").includes("Routine:"));
  assert.ok(roleBrief({ name: "X", auftrag: "y".repeat(2000) }, 15, "z".repeat(900)).length <= 1000);
});

test("Dauerprüfung: pruef_kpi.tage nach Zielgruppe/Land, Bestand füllt Ø-Wert und mehrfach", () => {
  const kpi = { tage: [
    { tag: "2026-10-14", art: "lead", segment_id: "S2", country: "US", geprueft: 100, bestanden: 97, gehalten: 3 },
    { tag: "2026-10-14", art: "lead", segment_id: "S12", country: "US", geprueft: 900, bestanden: 1, gehalten: 899 },
    { tag: "2026-10-14", art: "lead", segment_id: "S2", country: "IE", geprueft: 900, bestanden: 1, gehalten: 899 },
  ] };
  const rows = pruefTage(kpi, "S2", ["US", "UK", "FR"]);
  assert.equal(rows.length, 1);
  const best = normalizeBestand([{ art: "lead", geprueft: 200, score_avg: "71.5", mehrfach: 50 }, { art: "x" }]);
  assert.equal(best.length, 1);
  const lead = R({ slug: "lead_pruefer", typ: "python", richtung: "hoch", gut: 0.95, knapp: 0.9, min_n: 20 });
  const b = prueferBild(lead, rows, TODAY, best)!;
  assert.equal(b.heute?.score, 71.5);
  assert.equal(b.heute?.mehrfach, 0.25);
  assert.equal(b.heute?.bestanden, 0.97);
  assert.deepEqual(pruefTage(null, "S2", ["US"]), []);
});

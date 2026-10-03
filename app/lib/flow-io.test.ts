import { test } from "node:test";
import assert from "node:assert/strict";
import type { Flow, FlowEdge, FlowNode, Row } from "./flow.ts";
import {
  agentBrief, csvCell, csvFileName, dedupeRows, describePath, exportColumns, exportRows, isUuid, parseSourceQuery, queryKey, queryOf,
  snapshotOf, toCsv, toRow,
} from "./flow-io.ts";
import { InputError } from "./owner-settings.ts";

// Nur erfundene Zeilen (Repo ist öffentlich).
const row = (id: string, x: Record<string, unknown> = {}) => ({ id, segment: "S2", land: "US", ...x }) as Row;
const E = (id: string, from: string, to: string, port: FlowEdge["port"] = "out"): FlowEdge => ({ id, from, port, to });
const Q: FlowNode = { id: "q", x: 0, y: 0, kind: "quelle", source: "leads", segment: "S2", countries: ["US"], status: ["new"], size: 1000 };
const flow = (nodes: FlowNode[], edges: FlowEdge[]): Flow => ({ v: 1, nodes, edges });

test("Quelle aus dem Browser: geprüft und normalisiert", () => {
  const q = parseSourceQuery({ source: "leads", segment: "S2", countries: ["US", "UK", "US"], status: ["new"], size: "2000", extra: 1 });
  assert.deepEqual(q, { source: "leads", segment: "S2", countries: ["UK", "US"], status: ["new"], size: 2000 });
  assert.equal(parseSourceQuery({ source: "kaeufer", segment: "", size: 1000 }).segment, null);
  assert.deepEqual(parseSourceQuery({ source: "kaeufer", segment: null, size: 5000 }).countries, []);
  for (const bad of [null, "x", { source: "x", size: 1000 }, { source: "leads", size: 3000 }, { source: "leads", size: 1000, segment: "S2; drop" },
    { source: "leads", size: 1000, countries: ["us"] }, { source: "leads", size: 1000, countries: "US" }, { source: "leads", size: 1000, status: ["NEW"] },
    { source: "leads", size: 1000, countries: Array(31).fill("US") }])
    assert.throws(() => parseSourceQuery(bad), InputError, JSON.stringify(bad));
});

test("Schlüssel und Quelle eines Flows", () => {
  const a = parseSourceQuery({ source: "leads", segment: "S2", countries: ["US", "UK"], status: [], size: 1000 });
  const b = parseSourceQuery({ source: "leads", segment: "S2", countries: ["UK", "US"], size: 1000 });
  assert.equal(queryKey(a), queryKey(b));
  assert.notEqual(queryKey(a), queryKey({ ...a, size: 2000 }));
  assert.deepEqual(queryOf(flow([Q], [])), { source: "leads", segment: "S2", countries: ["US"], status: ["new"], size: 1000 });
  assert.equal(queryOf(flow([], [])), null);
});

test("uuid", () => {
  assert.ok(isUuid("1a2b3c4d-0000-4000-8000-000000000000"));
  assert.ok(!isUuid("1a2b3c4d"));
  assert.ok(!isUuid("1a2b3c4d-0000-4000-8000-000000000000' or 1=1"));
  assert.ok(!isUuid(42));
});

test("Seiten vereinen, Zeilen umwandeln", () => {
  assert.deepEqual(dedupeRows([[{ id: 1, a: 1 }, { id: 2 }], [{ id: 1, a: 2 }, { id: 3 }]]), [{ id: 1, a: 1 }, { id: 2 }, { id: 3 }]);
  const r = toRow({ id: 7, a: "x", b: null, c: true, d: 3, e: { y: 1 }, f: Number.NaN }, ["id", "a", "b", "c", "d", "missing"]);
  assert.deepEqual(r, { id: "7", a: "x", b: null, c: true, d: 3, missing: null });
  assert.equal(toRow({ id: 1, e: { y: 1 }, f: Number.NaN }).f, "NaN");
});

test("Kennzahlen beim Anschließen: nur strenger", () => {
  const f = flow([Q, { id: "f", x: 0, y: 0, kind: "filter", mode: "alle", conds: [{ f: "hat_telefon", op: "ja" }] },
    { id: "p", x: 0, y: 0, kind: "pipeline", name: "Telefon" }], [E("e1", "q", "f"), E("e2", "f", "p")]);
  const rows = [row("a", { hat_telefon: true }), row("b", { hat_telefon: false }), row("c", { hat_telefon: true, land: "UK" })];
  // c liegt außerhalb des Geltungsbereichs (UK) → frei
  assert.deepEqual(snapshotOf(f, rows, "t"), { sample: 3, pass: 2, hold: 1, at: "t" });
});

test("Weg zum Agenten und Auftragstext", () => {
  const f = flow([Q, { id: "w", x: 0, y: 0, kind: "weiche", cond: { f: "telefon_art", op: "ist", v: "mobile" } },
    { id: "s", x: 0, y: 0, kind: "statistik", by: "land" }, { id: "f", x: 0, y: 0, kind: "filter", mode: "alle", conds: [{ f: "hat_email", op: "ja" }] },
    { id: "a", x: 0, y: 0, kind: "agent", agent: 2, task: "pruefen" }],
  [E("e1", "q", "w"), E("e2", "w", "s", "ja"), E("e3", "s", "a"), E("e4", "q", "f"), E("e5", "f", "a")]);
  const p = describePath(f, "a");
  assert.equal(p.more, 1);
  assert.equal(p.text, "Leads · S2 · US · neu → Telefon-Art ist Handy: ja");
  const b = agentBrief("Test", f, "a", 1234, 2000);
  assert.equal(b, "Baukasten „Test“: Leads · S2 · US · neu → Telefon-Art ist Handy: ja (+1 weitere Wege) – 1.234 von 2.000 in der Stichprobe");
  const long = agentBrief("x".repeat(60), flow([Q, ...Array.from({ length: 30 }, (_, i): FlowNode => ({ id: `f${i}`, x: 0, y: 0, kind: "filter", mode: "alle",
    conds: [{ f: "firma", op: "enthaelt", v: "y".repeat(150) }] })), { id: "a", x: 0, y: 0, kind: "agent", agent: 1, task: "leads" }],
  [E("e0", "q", "f0"), ...Array.from({ length: 29 }, (_, i) => E(`e${i + 1}`, `f${i}`, `f${i + 1}`)), E("ez", "f29", "a")]), "a", 1, 1);
  assert.ok(long.length <= 1000 && long.includes("…") && long.endsWith("1 von 1 in der Stichprobe"));
  // Kreis bricht nicht die Beschreibung
  assert.doesNotThrow(() => describePath(flow([Q, { id: "f", x: 0, y: 0, kind: "filter", mode: "alle", conds: [] }], [E("e1", "q", "f"), E("e2", "f", "f")]), "f"));
});

test("Export: Ziele bekommen den Eingang, Schritte den Ausgang, Weiche je Teil", () => {
  const f = flow([Q, { id: "w", x: 0, y: 0, kind: "weiche", cond: { f: "hat_email", op: "ja" } }, { id: "x", x: 0, y: 0, kind: "export" },
    { id: "lose", x: 0, y: 0, kind: "export" }], [E("e1", "q", "w"), E("e2", "w", "x", "nein")]);
  const rows = [row("a", { hat_email: true }), row("b", { hat_email: false })];
  assert.deepEqual(exportRows(f, rows, "x")!.map((r) => r.id), ["b"]);
  assert.deepEqual(exportRows(f, rows, "w")!.map((r) => r.id), ["a", "b"]);
  assert.deepEqual(exportRows(f, rows, "w", "ja")!.map((r) => r.id), ["a"]);
  assert.deepEqual(exportRows(f, rows, "lose"), []);
  assert.equal(exportRows(f, rows, "gibtsnicht"), null);
});

test("CSV: Anführungszeichen, Formeln entschärft, BOM, Käufer-Prüfung benannt", () => {
  assert.equal(csvCell(null), "");
  assert.equal(csvCell(true), "ja");
  assert.equal(csvCell(12), "12");
  assert.equal(csvCell('Acme, "Best" Ltd'), '"Acme, ""Best"" Ltd"');
  assert.equal(csvCell("a\nb"), '"a\nb"');
  assert.equal(csvCell(" x"), '" x"');
  assert.equal(csvCell("=HYPERLINK(1)"), "'=HYPERLINK(1)");
  assert.equal(csvCell("@SUM(A1)"), "'@SUM(A1)");
  assert.equal(csvCell("+cmd|' /C calc'!A0"), "'+cmd|' /C calc'!A0");
  assert.equal(csvCell("-2+3+cmd"), "'-2+3+cmd");
  assert.equal(csvCell("+1 (555) 010-0000"), "'+1 (555) 010-0000"); // Excel rechnete sonst
  assert.equal(csvCell("+1-555-123-4567"), "'+1-555-123-4567");
  assert.equal(csvCell("+15551234567"), "'+15551234567");
  assert.equal(csvCell("-2+3"), "'-2+3");
  assert.equal(csvCell("-5"), "'-5");
  assert.equal(csvCell(-5), "-5"); // Zahl aus der DB bleibt
  const rows = [row("k1", { firma: "Ä GmbH", pruefung: "call_only" }), row("k2", { firma: "B", pruefung: "ok" })];
  const csv = toCsv(exportColumns("kaeufer", rows), rows);
  assert.ok(csv.startsWith("﻿Firma,Land,"));
  assert.ok(csv.includes("Ä GmbH,US,S2,,,,,,,,nur Anruf/Brief,"));
  assert.ok(csv.includes("B,US,S2,,,,,,,,mail-fähig,"));
  assert.equal(csv.split("\r\n").length, 4);
});

test("Export-Spalten: Punkte nur wenn vergeben, keine Vorschau-Lücken", () => {
  assert.ok(!exportColumns("leads", [row("a")]).some((c) => c.key === "punkte"));
  assert.equal(exportColumns("leads", [row("a", { punkte: 3 })])[1].key, "punkte");
  for (const k of ["telefon", "email", "website", "adresse", "person", "source_url", "event_date"]) assert.ok(exportColumns("leads", []).some((c) => c.key === k), k);
});

test("Dateiname", () => {
  assert.equal(csvFileName("US Webagenturen: mit Telefon!", "x1", "2026-10-03"), "baukasten-us-webagenturen-mit-telefon-x1-2026-10-03.csv");
  assert.equal(csvFileName("Ärger ö", "n", "2026-10-03"), "baukasten-arger-o-n-2026-10-03.csv");
  assert.equal(csvFileName("„“", "n", "d"), "baukasten-flow-n-d.csv");
});

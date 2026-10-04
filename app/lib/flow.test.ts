import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  FIELDS, OPS, NODE_META, NODE_KINDS, TEMPLATES, PREVIEW_COLS, countBy, describeCond, describeNode, evalCond, fieldDef, fieldsFor,
  inScope, newNode, packRows, parseFlow, pipelineCheck, pipelineNode, problems, reaches, ruleTag, runFlow, runFlowRows, sinkRows, unpackRows,
  type Cond, type Flow, type FlowEdge, type FlowNode, type Row,
} from "./flow.ts";

// Nur erfundene Zeilen (Repo ist öffentlich).
const row = (id: string, x: Record<string, unknown> = {}) => ({ id, ...x }) as Row;
const ev = (c: Cond, x: Record<string, unknown>) => evalCond(c, row("r", x));
const E = (id: string, from: string, to: string, port: FlowEdge["port"] = "out"): FlowEdge => ({ id, from, port, to });
const Q = (over: Partial<Extract<FlowNode, { kind: "quelle" }>> = {}): FlowNode =>
  ({ id: "q", x: 0, y: 0, kind: "quelle", source: "leads", segment: "S2", countries: ["US"], status: ["new"], size: 1000, ...over });
const F = (id: string, conds: Cond[], mode: "alle" | "eine" = "alle"): FlowNode => ({ id, x: 0, y: 0, kind: "filter", mode, conds });
const P: FlowNode = { id: "p", x: 0, y: 0, kind: "pipeline", name: "Regel" };
const flow = (nodes: FlowNode[], edges: FlowEdge[]): Flow => ({ v: 1, nodes, edges });
const errs = (f: Flow) => problems(f).filter((p) => p.level === "error").map((p) => p.msg);
const warns = (f: Flow) => problems(f).filter((p) => p.level === "warn").map((p) => p.msg);

test("Felder und Vergleiche", () => {
  assert.equal(new Set(FIELDS.map((f) => f.key)).size, FIELDS.length);
  assert.equal(fieldDef("status")?.gate, false);
  assert.equal(fieldDef("geprueft")?.gate, false);
  assert.ok(fieldsFor("kaeufer").some((f) => f.key === "pruefung"));
  assert.ok(!fieldsFor("kaeufer").some((f) => f.key === "signal"));
  assert.ok(!fieldsFor("leads").some((f) => f.key === "angeschrieben"));
  for (const f of FIELDS) if (f.type === "enum") assert.ok(f.options?.length, f.key);
  assert.deepEqual(OPS.bool.map((o) => o.op), ["ja", "nein"]);
  // Vorschau-Spalten: nur bekannte Felder, nie rohe Kontaktdaten
  for (const s of ["leads", "kaeufer"] as const) {
    for (const c of PREVIEW_COLS[s]) assert.ok(c === "id" || c === "cid" || fieldsFor(s).some((f) => f.key === c), c);
    for (const raw of ["telefon", "email", "adresse", "website", "person"]) assert.ok(!PREVIEW_COLS[s].includes(raw));
  }
});

test("enum: ist, ist_nicht, in, nicht_in mit fehlenden Werten", () => {
  assert.equal(ev({ f: "land", op: "ist", v: "US" }, { land: "US" }), true);
  assert.equal(ev({ f: "land", op: "ist", v: "US" }, { land: null }), false);
  assert.equal(ev({ f: "land", op: "ist_nicht", v: "US" }, {}), true);
  assert.equal(ev({ f: "land", op: "ist_nicht", v: "US" }, { land: "US" }), false);
  assert.equal(ev({ f: "signal", op: "in", v: ["a", "no_https"] }, { signal: "no_https" }), true);
  assert.equal(ev({ f: "signal", op: "in", v: ["no_https"] }, { signal: "" }), false);
  assert.equal(ev({ f: "signal", op: "in", v: "no_https" }, { signal: "no_https" }), false); // keine Liste → false
  assert.equal(ev({ f: "signal", op: "nicht_in", v: ["no_https"] }, { signal: "  " }), true);
  assert.equal(ev({ f: "signal", op: "nicht_in", v: ["no_https"] }, { signal: "no_https" }), false);
});

test("text: Akzente, Groß/Klein, Leerzeichen, fehlend", () => {
  assert.equal(ev({ f: "firma", op: "enthaelt", v: "MULLER" }, { firma: "Café Müller" }), true);
  assert.equal(ev({ f: "firma", op: "enthaelt", v: "" }, { firma: "x" }), true);
  assert.equal(ev({ f: "firma", op: "enthaelt", v: "x" }, { firma: null }), false);
  assert.equal(ev({ f: "firma", op: "enthaelt_nicht", v: "x" }, { firma: null }), true);
  assert.equal(ev({ f: "ort", op: "ist", v: "zurich" }, { ort: " Zürich " }), true);
  assert.equal(ev({ f: "ort", op: "ist_nicht", v: "zurich" }, { ort: "" }), true);
  assert.equal(ev({ f: "rechtsform", op: "beginnt", v: "sàrl" }, { rechtsform: "SARL x" }), true);
  assert.equal(ev({ f: "rechtsform", op: "beginnt", v: "x" }, {}), false);
  assert.equal(ev({ f: "rolle", op: "vorhanden" }, { rolle: " " }), false);
  assert.equal(ev({ f: "rolle", op: "fehlt" }, {}), true);
});

test("num und bool", () => {
  assert.equal(ev({ f: "alter_tage", op: "lte", v: 30 }, { alter_tage: 30 }), true);
  assert.equal(ev({ f: "alter_tage", op: "gt", v: 30 }, { alter_tage: 30 }), false);
  assert.equal(ev({ f: "alter_tage", op: "lt", v: 1 }, { alter_tage: 0 }), true);
  assert.equal(ev({ f: "alter_tage", op: "gte", v: 0 }, { alter_tage: null }), false);
  assert.equal(ev({ f: "alter_tage", op: "ist", v: 3 }, { alter_tage: 3 }), true);
  assert.equal(ev({ f: "alter_tage", op: "zwischen", v: [1, 3] }, { alter_tage: 3 }), true);
  assert.equal(ev({ f: "alter_tage", op: "zwischen", v: [1, 3] }, { alter_tage: 4 }), false);
  assert.equal(ev({ f: "alter_tage", op: "zwischen", v: 3 }, { alter_tage: 3 }), false);
  assert.equal(ev({ f: "alter_tage", op: "lte", v: "" }, { alter_tage: 0 }), false); // leerer Wert ≠ 0
  assert.equal(ev({ f: "alter_tage", op: "lte", v: ["5"] }, { alter_tage: 0 }), false);
  assert.equal(ev({ f: "alter_tage", op: "lte", v: 5 }, { alter_tage: "abc" }), false);
  assert.equal(ev({ f: "hat_email", op: "ja" }, { hat_email: true }), true);
  assert.equal(ev({ f: "hat_email", op: "ja" }, { hat_email: "true" }), false);
  assert.equal(ev({ f: "hat_email", op: "nein" }, {}), true);
  assert.equal(ev({ f: "unbekannt", op: "ja" }, { unbekannt: true }), false);
  assert.equal(ev({ f: "land", op: "gt", v: 1 }, { land: "US" }), false);
});

test("Gemeinsame Testfälle mit Python (tests/fixtures/flow_cases.json)", () => {
  const fx = JSON.parse(readFileSync(new URL("../../tests/fixtures/flow_cases.json", import.meta.url), "utf8"));
  assert.ok(fx.conds.length >= 40 && fx.flows.length >= 6);
  for (const c of fx.conds) assert.equal(evalCond(c.cond, c.row), c.expect, JSON.stringify(c));
  for (const [i, f] of fx.flows.entries()) {
    const parsed = parseFlow(f.flow);
    assert.ok(parsed.ok, `Flow ${i + 1}`);
    if (!parsed.ok) continue;
    assert.ok(pipelineNode(parsed.flow), `Flow ${i + 1} ohne Pipeline`);
    for (const r of f.rows) assert.equal(pipelineCheck(parsed.flow, r), f.pipeline[r.id], `Flow ${i + 1}, Zeile ${r.id}`);
  }
});

test("Gemeinsame Ablauf-Fälle über eine Menge (runs) mit Python", () => {
  const fx = JSON.parse(readFileSync(new URL("../../tests/fixtures/flow_cases.json", import.meta.url), "utf8"));
  assert.ok(fx.runs.length >= 3);
  const ids = (rs: Row[] | undefined) => (rs ?? []).map((r) => r.id);
  for (const c of fx.runs) {
    const parsed = parseFlow(c.flow);
    assert.ok(parsed.ok, c.name);
    if (!parsed.ok) continue;
    const res = runFlowRows(parsed.flow, c.rows);
    assert.deepEqual(Object.keys(res).sort(), Object.keys(c.expect).sort(), c.name);
    for (const [id, e] of Object.entries(c.expect) as [string, Record<string, unknown>][]) {
      const r = res[id], w = `${c.name} / ${id}`;
      assert.equal(r.connected, e.connected, w);
      assert.deepEqual(ids(r.input), e.in, w);
      assert.deepEqual(ids(r.out), e.out, w);
      if ("ja" in e) { assert.deepEqual(ids(r.ja), e.ja, w); assert.deepEqual(ids(r.nein), e.nein, w); } else assert.equal(r.ja, undefined, w);
      const pts = Object.fromEntries(r.out.filter((x) => "punkte" in x).map((x) => [x.id, x.punkte]));
      assert.deepEqual(pts, e.punkte ?? {}, w);
      assert.deepEqual(r.stats, e.stats, w);
    }
    for (const [kind, exp] of Object.entries(c.sinks) as [string, Record<string, string[]>][]) {
      const got = sinkRows(parsed.flow, c.rows, kind as FlowNode["kind"]);
      assert.deepEqual(Object.fromEntries(Object.entries(got).map(([k, v]) => [k, ids(v)])), exp, `${c.name} / ${kind}`);
    }
  }
});

const ROWS_X: Row[] = [row("a", { land: "US", segment: "S2", hat_telefon: true }), row("b", { land: "US", segment: "S2", hat_telefon: false })];

test("Freigabe, Speicher, Melden: Format, Prüfung, Texte", () => {
  const POOL = "0F0E0D0C-0B0A-4000-8000-000000000001";
  const G: FlowNode = { id: "g", x: 0, y: 0, kind: "freigabe" };
  const S = (over: Record<string, unknown> = {}) => ({ id: "sp", x: 0, y: 0, kind: "speicher", pool_id: POOL, pool_name: "US Beste", ...over }) as FlowNode;
  const M: FlowNode = { id: "m", x: 0, y: 0, kind: "melden" };
  assert.equal(NODE_META.freigabe.color, "#e2c68f");
  assert.equal(NODE_META.freigabe.icon, "schloss");
  assert.deepEqual([NODE_META.speicher.group, NODE_META.melden.group, NODE_META.freigabe.group], ["ziel", "ziel", "schritt"]);
  // Pool-id wird klein geschrieben, Gesamtbestand = null
  const p = parseFlow({ v: 1, nodes: [Q(), G, S(), M], edges: [E("e1", "q", "g"), E("e2", "g", "sp"), E("e3", "g", "m")] });
  assert.ok(p.ok);
  if (p.ok) assert.equal((p.flow.nodes[2] as Extract<FlowNode, { kind: "speicher" }>).pool_id, POOL.toLowerCase());
  assert.ok(parseFlow({ v: 1, nodes: [S({ pool_id: null, pool_name: "Gesamtbestand" })], edges: [] }).ok);
  for (const bad of [{ pool_id: "x" }, { pool_id: 5 }, { pool_id: "'; drop" }, { pool_name: "x".repeat(41) }, { pool_name: null }])
    assert.equal(parseFlow({ v: 1, nodes: [S(bad)], edges: [] }).ok, false, JSON.stringify(bad));
  // Freigabe auf dem Weg zur Pipeline ist erlaubt und lässt alles durch
  const pf = flow([Q(), G, F("f", [{ f: "hat_telefon", op: "ja" }]), P], [E("e1", "q", "g"), E("e2", "g", "f"), E("e3", "f", "p")]);
  assert.deepEqual(errs(pf), []);
  assert.equal(pipelineCheck(pf, ROWS_X[0]), true);
  assert.equal(pipelineCheck(pf, ROWS_X[1]), false);
  // Speicher nur für Leads; Hinweise je Art des Flows
  assert.ok(errs(flow([Q({ source: "kaeufer" }), S()], [E("e1", "q", "sp")])).some((m) => m.includes("Speicher nur für Leads")));
  const fs = flow([Q(), G, S(), M], [E("e1", "q", "g"), E("e2", "g", "sp"), E("e3", "g", "m")]);
  assert.deepEqual(errs(fs), []);
  assert.ok(warns(fs).some((m) => m.includes("Vorschau")));
  assert.ok(warns(fs).some((m) => m.includes("meldet nur")));
  assert.ok(!problems(fs, "agent").some((x) => x.msg.includes("meldet nur") || x.msg.includes("füllt sich nur")));
  assert.ok(problems(flow([Q(), S({ pool_id: null })], [E("e1", "q", "sp")]), "master").some((x) => x.msg.includes("Gesamtbestand")));
  assert.ok(problems(flow([Q(), S()], [E("e1", "q", "sp")]), "master").some((x) => x.msg.includes("läuft trotzdem immer")));
  assert.ok(!problems(fs, "master").some((x) => x.msg.includes("läuft trotzdem immer")));
  assert.ok(errs(flow([Q(), S({ pool_name: " " })], [E("e1", "q", "sp")])).some((m) => m.includes("Speicher-Name")));
  // Ziele haben keinen Ausgang
  assert.ok(errs(flow([Q(), S(), F("f", [])], [E("e1", "q", "sp"), E("e2", "sp", "f")])).some((m) => m.includes("keinen Ausgang")));
  assert.equal(describeNode(G), "Drei-Stufen-Freigabe · läuft immer");
  assert.equal(describeNode(S()), "in „US Beste“");
  assert.equal(describeNode(S({ pool_id: null })), "in „Gesamtbestand“");
  assert.ok(describeNode(M).includes("10"));
});

const ROWS: Row[] = [
  row("a", { cid: "c1", land: "US", segment: "S2", firma: "Alpha", hat_telefon: true, signal: "no_website", erfasst_tage: 3, dringlichkeit: "medium" }),
  row("b", { cid: "c1", land: "US", segment: "S2", firma: "Alpha", hat_telefon: false, signal: "no_website", erfasst_tage: 1, dringlichkeit: "high" }),
  row("c", { cid: "c2", land: "US", segment: "S2", firma: "Bêta", hat_telefon: true, signal: "no_https", erfasst_tage: null, dringlichkeit: null }),
  row("d", { cid: null, land: "UK", segment: "S2", firma: "beta ", hat_telefon: true, signal: null, erfasst_tage: 9, dringlichkeit: "low" }),
];

test("Filter alle/eine, Weiche-Anschlüsse, lose Bausteine", () => {
  const f = flow([Q(), F("f", [{ f: "hat_telefon", op: "ja" }, { f: "land", op: "ist", v: "US" }]),
    F("g", [{ f: "hat_telefon", op: "ja" }, { f: "land", op: "ist", v: "US" }], "eine"),
    { id: "w", x: 0, y: 0, kind: "weiche", cond: { f: "signal", op: "ist", v: "no_website" } },
    { id: "x", x: 0, y: 0, kind: "export" }, { id: "y", x: 0, y: 0, kind: "export" }, F("lose", [])],
  [E("e1", "q", "f"), E("e2", "q", "g"), E("e3", "q", "w"), E("e4", "w", "x", "ja"), E("e5", "w", "y", "nein"), E("e6", "lose", "x")]);
  const r = runFlow(f, ROWS);
  assert.deepEqual([r.q.in, r.q.out], [4, 4]);
  assert.deepEqual(r.f.ids, ["a", "c"]);
  assert.deepEqual(r.g.ids, ["a", "b", "c", "d"]);
  assert.deepEqual(r.w.ports, { ja: 2, nein: 2 });
  assert.deepEqual(r.w.ids, ["a", "b", "c", "d"]);
  assert.deepEqual([r.x.in, r.x.out, r.y.in], [2, 2, 2]);
  assert.deepEqual(r.lose, { connected: false, in: 0, out: 0, ids: [] });
  assert.equal(runFlow(flow([Q(), F("f", [], "eine")], [E("e1", "q", "f")]), ROWS).f.out, 4); // leer → alles
  const w0 = runFlow(flow([Q(), { id: "w", x: 0, y: 0, kind: "weiche", cond: null }], [E("e1", "q", "w")]), ROWS).w;
  assert.deepEqual(w0.ports, { ja: 4, nein: 0 });
});

test("Punkte: Summe, Mindestwert, Zusammenführen mit Maximum", () => {
  const k = (id: string, pts: number, min: number | null = null): FlowNode =>
    ({ id, x: 0, y: 0, kind: "punkte", min, rules: [{ cond: { f: "hat_telefon", op: "ja" }, pts }, { cond: { f: "land", op: "ist", v: "UK" }, pts: 1 }] });
  const f = flow([Q(), k("k1", 2), k("k2", 5), { id: "m", x: 0, y: 0, kind: "punkte", min: 6, rules: [] }, { id: "x", x: 0, y: 0, kind: "export" }],
    [E("e1", "q", "k1"), E("e2", "q", "k2"), E("e3", "k1", "m"), E("e4", "k2", "m"), E("e5", "m", "x")]);
  const rr = runFlowRows(f, ROWS);
  assert.deepEqual(rr.k1.out.map((r) => r.punkte), [2, 0, 2, 3]);
  assert.deepEqual(rr.m.input.map((r) => [r.id, r.punkte]), [["a", 5], ["b", 0], ["c", 5], ["d", 6]]); // Maximum je Zeile
  assert.deepEqual(rr.x.input.map((r) => r.id), ["d"]);
  assert.equal(ROWS[0].punkte, undefined); // Eingabe bleibt unverändert
  // Punkte addieren sich über zwei Bausteine hintereinander
  const g = flow([Q(), k("k1", 2), k("k2", 5, 7)], [E("e1", "q", "k1"), E("e2", "k1", "k2")]);
  assert.deepEqual(runFlowRows(g, ROWS).k2.out.map((r) => [r.id, r.punkte]), [["a", 7], ["c", 7], ["d", 9]]);
});

test("Top: Sortierungen, fehlende Werte zuletzt", () => {
  const top = (sort: "neueste" | "aelteste" | "punkte" | "dringlichkeit", n = 10, rows = ROWS) =>
    runFlow(flow([Q(), { id: "t", x: 0, y: 0, kind: "top", sort, n }], [E("e1", "q", "t")]), rows).t.ids;
  assert.deepEqual(top("neueste"), ["b", "a", "d", "c"]);
  assert.deepEqual(top("aelteste"), ["d", "a", "b", "c"]);
  assert.deepEqual(top("dringlichkeit"), ["b", "a", "d", "c"]);
  assert.deepEqual(top("neueste", 2), ["b", "a"]);
  const pr = [row("a", { punkte: 1 }), row("b", { punkte: null }), row("c", { punkte: 5 }), row("d", { punkte: -2 })];
  assert.deepEqual(top("punkte", 10, pr), ["c", "a", "b", "d"]); // null = 0, stabil
});

test("Dubletten und Statistik", () => {
  const d = (by: "firma_id" | "name") => runFlow(flow([Q(), { id: "d", x: 0, y: 0, kind: "dubletten", by }], [E("e1", "q", "d")]), ROWS).d.ids;
  assert.deepEqual(d("firma_id"), ["a", "c", "d"]); // fehlende cid bleibt
  assert.deepEqual(d("name"), ["a", "c"]); // „Bêta“ = „beta “
  const s = runFlow(flow([Q(), { id: "s", x: 0, y: 0, kind: "statistik", by: "signal" }], [E("e1", "q", "s")]), ROWS).s;
  assert.equal(s.out, 4);
  assert.deepEqual(s.stats, [{ key: "no_website", n: 2 }, { key: "no_https", n: 1 }, { key: "–", n: 1 }]);
  assert.deepEqual(countBy(ROWS, "hat_telefon"), [{ key: "ja", n: 3 }, { key: "nein", n: 1 }]);
  const many = Array.from({ length: 30 }, (_, i) => row(`r${i}`, { ort: `O${i % 15}` }));
  assert.equal(countBy(many, "ort").length, 12);
});

test("Kreise hängen nicht, Bausteine im Kreis bleiben leer", () => {
  const f = flow([Q(), F("a", []), F("b", [])], [E("e1", "q", "a"), E("e2", "a", "b"), E("e3", "b", "a")]);
  const r = runFlow(f, ROWS);
  assert.equal(r.a.connected, true);
  assert.equal(r.a.in, 0);
  assert.ok(errs(f).some((m) => m.includes("Kreis")));
  assert.ok(errs(flow([Q(), F("a", [])], [E("e1", "q", "a"), E("e2", "a", "a")])).some((m) => m.includes("Kreis")));
});

test("Geltungsbereich, reaches, pipelineCheck", () => {
  const f = flow([Q({ countries: ["US", "UK"] }), F("f", [{ f: "hat_telefon", op: "ja" }]), P], [E("e1", "q", "f"), E("e2", "f", "p")]);
  assert.equal(inScope(f, row("x", { segment: "S2", land: "UK" })), true);
  assert.equal(inScope(f, row("x", { segment: "S2", land: "FR" })), false);
  assert.equal(inScope(f, row("x", { segment: "S5", land: "US" })), false);
  assert.equal(inScope(flow([Q({ segment: null, countries: [] })], []), row("x", {})), true);
  assert.equal(inScope(flow([Q({ source: "kaeufer" })], []), row("x", { segment: "S2", land: "US" })), false);
  assert.equal(reaches(f, ROWS[1], "p"), false);
  assert.equal(reaches(f, ROWS[0], "p"), true);
  assert.equal(pipelineCheck(f, ROWS[1]), false);
  assert.equal(pipelineCheck(f, row("x", { segment: "S2", land: "FR", hat_telefon: false })), true);
  assert.equal(pipelineCheck(flow([Q(), F("f", [{ f: "hat_telefon", op: "ja" }])], [E("e1", "q", "f")]), ROWS[1]), true); // ohne Pipeline keine Regel
  // Top/Dubletten wirken je Zeile nicht (sind auf dem Weg zur Pipeline ohnehin verboten)
  const t = flow([Q(), { id: "t", x: 0, y: 0, kind: "top", sort: "neueste", n: 1 }, P], [E("e1", "q", "t"), E("e2", "t", "p")]);
  assert.equal(reaches(t, ROWS[2], "p"), true);
});

test("problems: Fehler", () => {
  const ok = flow([Q(), F("f", [{ f: "hat_telefon", op: "ja" }]), P], [E("e1", "q", "f"), E("e2", "f", "p")]);
  assert.deepEqual(problems(ok), []);
  assert.ok(errs(flow([F("f", [])], [])).includes("Quelle fehlt"));
  assert.ok(errs(flow([Q(), { ...(Q() as object), id: "q2" } as FlowNode], [])).includes("nur eine Quelle erlaubt"));
  assert.ok(errs(flow([Q(), P], [E("e1", "q", "zz")])).includes("Verbindung zu unbekanntem Baustein"));
  assert.ok(errs(flow([Q(), P, F("f", [])], [E("e1", "q", "p"), E("e2", "p", "f")])).some((m) => m.includes("keinen Ausgang")));
  assert.ok(errs(flow([Q(), F("f", [])], [E("e1", "q", "f", "ja")])).includes("falscher Anschluss"));
  assert.ok(errs(flow([Q(), F("f", [])], [E("e1", "q", "f"), E("e2", "f", "q")])).some((m) => m.includes("Quelle führt nichts")));
  assert.ok(errs(flow([Q(), P, { ...P, id: "p2" }], [E("e1", "q", "p"), E("e2", "q", "p2")])).includes("nur ein Pipeline-Baustein erlaubt"));
  assert.ok(errs(flow([Q({ source: "kaeufer" }), P], [E("e1", "q", "p")])).some((m) => m.includes("nicht für Käufer")));
  // Top/Dubletten auf dem Weg zur Pipeline
  const top: FlowNode = { id: "t", x: 0, y: 0, kind: "top", sort: "neueste", n: 10 };
  assert.ok(errs(flow([Q(), top, P], [E("e1", "q", "t"), E("e2", "t", "p")])).some((m) => m.includes("nicht auf dem Weg")));
  assert.deepEqual(errs(flow([Q(), top, { id: "x", x: 0, y: 0, kind: "export" }], [E("e1", "q", "t"), E("e2", "t", "x")])), []);
  const dub: FlowNode = { id: "d", x: 0, y: 0, kind: "dubletten", by: "name" };
  assert.ok(errs(flow([Q(), dub, F("f", []), P], [E("e1", "q", "d"), E("e2", "d", "f"), E("e3", "f", "p")])).some((m) => m.includes("Dubletten")));
  // Status/Freigabe nicht auf dem Weg zur Pipeline, wohl aber daneben
  const st = F("f", [{ f: "status", op: "ist", v: "new" }]);
  assert.ok(errs(flow([Q(), st, P], [E("e1", "q", "f"), E("e2", "f", "p")])).some((m) => m.includes("Status")));
  assert.deepEqual(errs(flow([Q(), st, { id: "x", x: 0, y: 0, kind: "export" }], [E("e1", "q", "f"), E("e2", "f", "x")])), []);
  const gw: FlowNode = { id: "w", x: 0, y: 0, kind: "weiche", cond: { f: "geprueft", op: "ist", v: "released" } };
  assert.ok(errs(flow([Q(), gw, P], [E("e1", "q", "w"), E("e2", "w", "p", "nein")])).some((m) => m.includes("Freigabe")));
  // Feld nicht für die Quelle, falsche Werte, Grenzen
  assert.ok(errs(flow([Q({ source: "kaeufer" }), F("f", [{ f: "signal", op: "ist", v: "x" }])], [E("e1", "q", "f")])).some((m) => m.includes("Käufern")));
  assert.ok(errs(flow([Q(), F("f", [{ f: "alter_tage", op: "lte", v: "30" }])], [])).some((m) => m.includes("Zahl")));
  assert.ok(errs(flow([Q(), F("f", [{ f: "land", op: "in", v: [] }])], [])).some((m) => m.includes("Werte")));
  assert.ok(errs(flow([Q(), F("f", [{ f: "alter_tage", op: "zwischen", v: [1] as unknown as [number, number] }])], [])).some((m) => m.includes("zwei Zahlen")));
  assert.ok(errs(flow([Q(), F("f", [{ f: "hat_telefon", op: "ist", v: "x" }])], [])).some((m) => m.includes("passt nicht")));
  assert.ok(errs(flow([Q(), F("f", [{ f: "gibts", op: "ja" }])], [])).some((m) => m.includes("unbekannt")));
  assert.ok(errs(flow([Q(), F("f", Array.from({ length: 13 }, () => ({ f: "hat_email", op: "ja" }) as Cond))], [])).some((m) => m.includes("12")));
  assert.ok(errs(flow([Q(), { id: "k", x: 0, y: 0, kind: "punkte", min: null, rules: [{ cond: { f: "hat_email", op: "ja" }, pts: 101 }] }], [])).some((m) => m.includes("Punkte")));
  assert.ok(errs(flow([Q(), { id: "k", x: 0, y: 0, kind: "punkte", min: null, rules: [{ cond: { f: "hat_email", op: "ja" }, pts: 1.5 }] }], [])).some((m) => m.includes("Punkte")));
  assert.ok(errs(flow([Q(), { id: "t", x: 0, y: 0, kind: "top", sort: "punkte", n: 0 }], [])).some((m) => m.includes("Anzahl")));
  assert.ok(errs(flow([Q(), { ...P, name: " " }], [])).some((m) => m.includes("Name")));
  assert.ok(errs(flow([Q(), { ...P, name: "x".repeat(61) }], [])).some((m) => m.includes("Name")));
  assert.ok(errs(flow([Q(), { id: "a", x: 0, y: 0, kind: "agent", agent: 5, task: "leads" }], [])).some((m) => m.includes("Agent")));
  assert.ok(errs(flow([Q(), F("f", [{ f: "firma", op: "enthaelt", v: "x".repeat(201) }])], [])).some((m) => m.includes("200")));
  assert.ok(errs(flow([Q(), { id: "s", x: 0, y: 0, kind: "statistik", by: "angeschrieben" }], [])).some((m) => m.includes("Leads")));
  const big = flow([Q(), ...Array.from({ length: 40 }, (_, i) => F(`f${i}`, []))], []);
  assert.ok(errs(big).some((m) => m.includes("40")));
});

test("problems: Warnungen", () => {
  const w = warns(flow([Q(), F("f", []), { id: "w", x: 0, y: 0, kind: "weiche", cond: null }, F("lose", [{ f: "hat_email", op: "ja" }]), P,
    { id: "x", x: 0, y: 0, kind: "export" }], [E("e1", "q", "f"), E("e2", "f", "w"), E("e3", "w", "x", "ja"), E("e4", "lose", "x")]));
  assert.ok(w.includes("Filter ohne Bedingung lässt alles durch"));
  assert.ok(w.some((m) => m.includes("Weiche ohne Bedingung")));
  assert.ok(w.includes("nicht mit der Quelle verbunden"));
  assert.ok(w.includes("Pipeline hat keinen Eingang"));
  assert.ok(!w.some((m) => m.includes("Sackgasse"))); // Weiche hat einen Ausgang
  assert.ok(warns(flow([Q(), F("f", [{ f: "hat_email", op: "ja" }])], [E("e1", "q", "f")])).some((m) => m.includes("Sackgasse")));
  assert.ok(warns(flow([Q()], [])).includes("Quelle ist mit nichts verbunden"));
  assert.ok(warns(flow([Q({ source: "kaeufer" }), { id: "d", x: 0, y: 0, kind: "dubletten", by: "firma_id" }, { id: "x", x: 0, y: 0, kind: "export" }],
    [E("e1", "q", "d"), E("e2", "d", "x")])).some((m) => m.includes("Firmen-ID")));
});

test("parseFlow lehnt Unsinn ab", () => {
  const good = flow([Q(), F("f", [{ f: "alter_tage", op: "zwischen", v: [1, 5] }, { f: "land", op: "in", v: ["US"] }]), P], [E("e1", "q", "f"), E("e2", "f", "p")]);
  const p = parseFlow(JSON.parse(JSON.stringify(good)));
  assert.ok(p.ok);
  if (p.ok) assert.deepEqual(p.flow, good);
  const bad = (x: unknown) => assert.equal(parseFlow(x).ok, false, JSON.stringify(x)?.slice(0, 120));
  bad(null); bad("x"); bad([]); bad({ v: 2, nodes: [], edges: [] }); bad({ v: 1, nodes: {}, edges: [] });
  const g = JSON.parse(JSON.stringify(good));
  const mut = (fn: (x: any) => void) => { const c = structuredClone(g); fn(c); bad(c); };
  mut((x) => { x.nodes[0].id = "Q!"; });
  mut((x) => { x.nodes[1].id = "q"; }); // doppelt
  mut((x) => { x.nodes[0].kind = "senden"; });
  mut((x) => { x.nodes[0].x = Infinity; });
  mut((x) => { x.nodes[0].x = "1"; });
  mut((x) => { x.nodes[0].source = "alles"; });
  mut((x) => { x.nodes[0].size = 999; });
  mut((x) => { x.nodes[0].countries = "US"; });
  mut((x) => { x.nodes[1].mode = "manche"; });
  mut((x) => { x.nodes[1].conds = [{ f: "land", op: "drop table" }]; });
  mut((x) => { x.nodes[1].conds = [{ f: "land", op: "ist", v: { a: 1 } }]; });
  mut((x) => { x.nodes[1].conds = [{ f: "land", op: "ist", v: "x".repeat(201) }]; });
  mut((x) => { x.nodes[1].conds = Array.from({ length: 13 }, () => ({ f: "hat_email", op: "ja" })); });
  mut((x) => { x.nodes[2].name = 5; });
  mut((x) => { x.nodes.push({ id: "a", x: 0, y: 0, kind: "agent", agent: 1, task: "senden" }); });
  mut((x) => { x.nodes.push({ id: "k", x: 0, y: 0, kind: "punkte", min: null, rules: [{ cond: { f: "hat_email", op: "ja" }, pts: NaN }] }); });
  mut((x) => { x.edges[0].port = "seite"; });
  mut((x) => { x.edges.push({ ...x.edges[0] }); }); // Verbindung doppelt
  mut((x) => { x.edges[0].to = "../x"; });
  mut((x) => { x.nodes = Array.from({ length: 41 }, (_, i) => ({ id: `f${i}`, x: 0, y: 0, kind: "export" })); });
  // Position wird begrenzt, Fremdfelder fallen weg, Kanten zu unbekannten Bausteinen meldet erst problems()
  const c = structuredClone(g);
  c.nodes[0].x = 99999; c.nodes[0].boese = "x"; c.edges.push({ id: "e9", from: "f", port: "out", to: "nix" });
  const r = parseFlow(c);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(r.flow.nodes[0].x, 10000);
    assert.equal("boese" in r.flow.nodes[0], false);
    assert.ok(problems(r.flow).some((m) => m.level === "error"));
  }
});

test("newNode, Vorlagen, Texte, ruleTag, packRows", () => {
  for (const k of NODE_KINDS) {
    const n = newNode(k, `n${k.slice(0, 3)}`, 1, 2);
    assert.equal(n.kind, k);
    assert.ok(parseFlow({ v: 1, nodes: [n], edges: [] }).ok, k);
    assert.ok(describeNode(n).length > 0);
    assert.deepEqual(NODE_META[k].ports.length === 0, NODE_META[k].group === "ziel");
  }
  assert.ok(TEMPLATES.length >= 3);
  assert.equal(TEMPLATES[0].label, "US Webagenturen: mit Telefon");
  for (const t of TEMPLATES) {
    assert.ok(parseFlow(JSON.parse(JSON.stringify(t.flow))).ok, t.id);
    assert.deepEqual(errs(t.flow), [], t.id);
    assert.ok(Object.values(runFlow(t.flow, ROWS)).length === t.flow.nodes.length);
  }
  assert.equal(describeCond({ f: "hat_telefon", op: "ja" }), "Telefon vorhanden: ja");
  assert.equal(describeCond({ f: "land", op: "ist", v: "US" }), "Land ist US");
  assert.equal(describeCond({ f: "alter_tage", op: "lte", v: 30 }), "Alter ≤ 30 Tage");
  assert.equal(describeCond({ f: "alter_tage", op: "zwischen", v: [1, 5] }), "Alter 1–5 Tage");
  assert.equal(describeCond({ f: "land", op: "in", v: ["US", "UK"] }), "Land ist US oder UK");
  assert.equal(describeCond({ f: "telefon_art", op: "ist", v: "mobile" }), "Telefon-Art ist Handy");
  assert.equal(describeCond({ f: "firma", op: "enthaelt", v: "web" }), "Firmenname enthält „web“");
  assert.equal(describeNode(Q()), "Leads · S2 · US · neu");
  assert.equal(ruleTag("1A2B3C4D-0000-4000-8000-000000000000"), "s4:regel:1a2b3c4d");
  const pk = packRows([row("a", { land: "US", hat_telefon: true, extra: "weg" }), row("b", {})], ["land", "hat_telefon"]);
  assert.deepEqual(pk.cols, ["id", "land", "hat_telefon"]);
  assert.deepEqual(pk.data, [["a", "US", true], ["b", null, null]]);
  assert.deepEqual(unpackRows(pk), [{ id: "a", land: "US", hat_telefon: true }, { id: "b", land: null, hat_telefon: null }]);
  assert.deepEqual(unpackRows({ cols: null, data: null } as never), []);
});

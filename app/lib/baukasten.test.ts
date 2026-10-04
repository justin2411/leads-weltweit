import { test } from "node:test";
import assert from "node:assert/strict";
import {
  BEREICHE, MASTER_TEMPLATES, blankFlow, checkPoolName, describeTrigger, duplicateNode, hasFreigabe, logicSig, masterStart, meldenPreview,
  parseAgentInput, parseBereich, pendingPool, poolInfos, resolvePools, resultShort, suggestMarket,
} from "./baukasten.ts";
import { GESAMTBESTAND, parseFlow, pipelineCheck, problems, runFlowRows, type Flow, type FlowNode, type Row } from "./flow.ts";

// Nur erfundene Zeilen (Repo ist öffentlich).
const row = (id: string, x: Record<string, unknown> = {}) => ({ id, segment: "S2", land: "US", ...x }) as Row;
const errs = (f: Flow, k: "test" | "master" | "agent" = "master") => problems(f, k).filter((p) => p.level === "error");

test("Bereiche", () => {
  assert.deepEqual(BEREICHE.map((b) => b.id), ["master", "test", "agenten"]);
  assert.equal(parseBereich("master"), "master");
  assert.equal(parseBereich("agenten"), "agenten");
  assert.equal(parseBereich("x"), "test");
  assert.equal(parseBereich(undefined), "test");
});

test("Master-Startgraph: gültig, ohne Fehler, Freigabe gold, alle Leads", () => {
  const f = masterStart();
  assert.ok(parseFlow(f).ok);
  assert.deepEqual(errs(f), []);
  assert.ok(hasFreigabe(f));
  const q = f.nodes.find((n) => n.kind === "quelle");
  assert.ok(q && q.kind === "quelle" && q.source === "leads" && q.segment === null && q.countries.length === 0);
  assert.ok(f.nodes.some((n) => n.kind === "pipeline" && n.name === "Master"));
  assert.ok(f.nodes.some((n) => n.kind === "speicher" && n.pool_id === null && n.pool_name === GESAMTBESTAND));
  // Pipeline Master lässt alles durch (macht die Freigabe nicht strenger)
  assert.ok(pipelineCheck(f, row("a", { land: "FR", segment: "S4" })));
  // jede Erzeugung ist eine eigene Kopie
  masterStart().nodes[0].x = 999;
  assert.equal(masterStart().nodes[0].x, 40);
});

test("Master ohne Freigabe-Baustein: nur Hinweis, Freigabe läuft trotzdem", () => {
  const f = masterStart();
  const g: Flow = { v: 1, nodes: f.nodes.filter((n) => n.kind !== "freigabe"), edges: [{ id: "e1", from: "q", port: "out", to: "p1" }] };
  assert.ok(!hasFreigabe(g));
  assert.deepEqual(errs(g), []);
  assert.ok(problems(g, "master").some((p) => p.level === "warn" && /Freigabe läuft trotzdem immer/.test(p.msg)));
});

test("Master-Vorlagen: alle gültig, Premium filtert Telefon + Person in den Speicher", () => {
  assert.ok(MASTER_TEMPLATES.length >= 3);
  assert.equal(new Set(MASTER_TEMPLATES.map((t) => t.id)).size, MASTER_TEMPLATES.length);
  for (const t of MASTER_TEMPLATES) {
    const f = t.flow();
    assert.ok(parseFlow(f).ok, t.id);
    assert.deepEqual(errs(f), [], t.id);
    assert.ok(hasFreigabe(f), t.id);
  }
  const p = MASTER_TEMPLATES.find((t) => t.id === "premium")!.flow();
  const sp = p.nodes.find((n) => n.kind === "speicher")!;
  assert.equal(pendingPool(sp), "Premium");
  const rows = [row("a", { hat_telefon: true, hat_person: true }), row("b", { hat_telefon: true, hat_person: false }), row("c", {})];
  assert.deepEqual(runFlowRows(p, rows)[sp.id].input.map((r) => r.id), ["a"]);
});

test("resolvePools: Wunschname → vorhandener Speicher", () => {
  const p = MASTER_TEMPLATES.find((t) => t.id === "premium")!.flow();
  const id = "11111111-2222-4333-8444-555555555555";
  const r = resolvePools(p, [{ id, name: "premium" }]);
  const sp = r.nodes.find((n) => n.kind === "speicher");
  assert.ok(sp && sp.kind === "speicher" && sp.pool_id === id && sp.pool_name === "premium");
  assert.equal(pendingPool(sp!), null);
  // ohne Treffer unverändert, Gesamtbestand nie
  assert.deepEqual(resolvePools(p, []), p);
  const s = masterStart();
  assert.deepEqual(resolvePools(s, [{ id, name: GESAMTBESTAND }]), s);
  assert.equal(pendingPool(s.nodes.find((n) => n.kind === "speicher")!), null);
});

test("duplicateNode: Kopie mit neuer id und Titel, Quelle/Pipeline nie", () => {
  const f = masterStart();
  const d = duplicateNode(f, "fg", "fg2");
  assert.ok(d && d.kind === "freigabe" && d.id === "fg2" && d.x === 380 && d.y === 260);
  assert.equal(d!.title, "Drei-Stufen-Freigabe 2");
  assert.equal(duplicateNode(f, "q", "q2"), null);
  assert.equal(duplicateNode(f, "p1", "p2"), null);
  assert.equal(duplicateNode(f, "nix", "n2"), null);
  assert.equal(duplicateNode(f, "fg", "q"), null); // id schon vergeben
  // zweite Kopie zählt weiter
  const g: Flow = { ...f, nodes: [...f.nodes, d!] };
  assert.equal(duplicateNode(g, "fg2", "fg3")!.title, "Drei-Stufen-Freigabe 3");
  // tiefe Kopie: Bedingungen nicht geteilt
  const fl: FlowNode = { id: "f1", x: 0, y: 0, kind: "filter", mode: "alle", conds: [{ f: "hat_telefon", op: "ja" }] };
  const h: Flow = { v: 1, nodes: [fl], edges: [] };
  const c = duplicateNode(h, "f1", "f2")!;
  assert.ok(c.kind === "filter");
  if (c.kind === "filter") { c.conds[0].op = "nein"; assert.equal(fl.conds[0].op, "ja"); }
  assert.equal(c.title, "Filter 2");
  assert.ok(parseFlow({ v: 1, nodes: [fl, c], edges: [] }).ok);
  assert.ok(parseFlow(blankFlow()).ok);
});

test("logicSig: Lage, Titel und Reihenfolge egal, Einstellungen nicht", () => {
  const f = masterStart();
  const moved: Flow = { v: 1, nodes: [...f.nodes].reverse().map((n) => ({ ...n, x: n.x + 100, title: "neu" })),
    edges: [...f.edges].reverse().map((e, i) => ({ ...e, id: `z${i}` })) };
  assert.equal(logicSig(moved), logicSig(f));
  const changed: Flow = { ...f, nodes: f.nodes.map((n) => (n.kind === "pipeline" ? { ...n, name: "Anders" } : n)) };
  assert.notEqual(logicSig(changed), logicSig(f));
  assert.notEqual(logicSig({ ...f, edges: f.edges.slice(1) }), logicSig(f));
});

test("Speicher-Name und Zählung", () => {
  assert.equal(checkPoolName("  Premium   UK "), "Premium UK");
  assert.throws(() => checkPoolName(""), /1 bis 40/);
  assert.throws(() => checkPoolName("x".repeat(41)), /1 bis 40/);
  assert.throws(() => checkPoolName("gesamtbestand"), /gibt es schon/);
  const infos = poolInfos([{ id: "b", name: "Zeta" }, { id: "a", name: "Alpha", color: "#e2c68f" }],
    [{ pool_id: "a", country: "US", n: 3 }, { pool_id: "a", country: "UK", n: "2" }, { pool_id: "a", country: "US", n: 1 }, { pool_id: "x", country: "US", n: 9 }]);
  assert.deepEqual(infos.map((p) => [p.name, p.n]), [["Alpha", 6], ["Zeta", 0]]);
  assert.deepEqual(infos[0].byCountry, { US: 4, UK: 2 });
  assert.equal(infos[0].color, "#e2c68f");
});

test("Melden-Vorschau: Anzahl und bis zu 10 Firmen", () => {
  assert.equal(meldenPreview([], "Agent"), "Agent: nichts Neues.");
  assert.equal(meldenPreview([row("a", { firma: "Acme" })], "A"), "A: 1 Lead – Acme");
  const many = Array.from({ length: 12 }, (_, i) => row(`r${i}`, { firma: `Firma ${i}` }));
  const t = meldenPreview(many, "X");
  assert.match(t, /^X: 12 Leads – Firma 0, /);
  assert.ok(t.includes("Firma 9") && !t.includes("Firma 10"));
  assert.match(t, /\(\+2\)$/);
});

test("Agent-Eingaben prüfen", () => {
  assert.deepEqual(parseAgentInput({ name: " UK Käufer ", trigger: "taeglich", at_hour: "7", ai_brief: "", ai_market: "uk" }),
    { name: "UK Käufer", trigger: "taeglich", at_hour: 7, ai_brief: null, ai_market: "UK" });
  assert.equal(parseAgentInput({ name: "a", trigger: "stuendlich", at_hour: 5 }).at_hour, null);
  assert.throws(() => parseAgentInput({ name: "", trigger: "taeglich", at_hour: 7 }), /Name/);
  assert.throws(() => parseAgentInput({ name: "a", trigger: "jede_minute" }), /Auslöser/);
  assert.throws(() => parseAgentInput({ name: "a", trigger: "taeglich" }), /Uhrzeit/);
  assert.throws(() => parseAgentInput({ name: "a", trigger: "taeglich", at_hour: 24 }), /Uhrzeit/);
  assert.throws(() => parseAgentInput({ name: "a", trigger: "neue_leads", ai_market: "DE" }), /Markt/);
  assert.throws(() => parseAgentInput({ name: "a", trigger: "neue_leads", ai_brief: "x".repeat(1001) }), /1000/);
  assert.equal(parseAgentInput({ name: "a", trigger: "neue_leads", ai_market: "alle" }).ai_market, null);
});

test("Markt-Vorschlag aus der Quelle (UK-Käufer → UK)", () => {
  const f = (countries: string[]): Flow => ({ v: 1, nodes: [{ id: "q", x: 0, y: 0, kind: "quelle", source: "kaeufer", segment: "S2", countries, status: ["ok"], size: 1000 }], edges: [] });
  assert.equal(suggestMarket(f(["UK"])), "UK");
  assert.equal(suggestMarket(f(["UK", "US"])), null);
  assert.equal(suggestMarket(f([])), null);
  assert.equal(suggestMarket(f(["DE"])), null);
  assert.equal(suggestMarket({ v: 1, nodes: [], edges: [] }), null);
});

test("Auslöser und Ergebnis kurz", () => {
  assert.equal(describeTrigger("taeglich", 7), "täglich um 7 Uhr");
  assert.equal(describeTrigger("stuendlich", null), "stündlich");
  assert.equal(describeTrigger("neue_leads", null), "bei neuen Leads");
  assert.equal(resultShort(null), "noch nicht gelaufen");
  assert.equal(resultShort({ error: "kaputt" }), "Fehler: kaputt");
  assert.equal(resultShort({ text: "3 neue" }), "3 neue");
  assert.equal(resultShort({ rows_in: 1200, speicher: 5, ids: ["a"] }), "rein 1.200 · Speicher 5");
  assert.equal(resultShort([]), "–");
});

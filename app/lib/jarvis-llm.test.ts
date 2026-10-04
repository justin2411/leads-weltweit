import { test } from "node:test";
import assert from "node:assert/strict";
import {
  MODELS, MAX_OPUS_ROUNDS, TOOL_DEFS, budgetOf, budgetState, canCall, checkFlowEdit, checkTool, cleanReply, costEur, euro, fallbackHint,
  monthStart, parseRoute, routineReply, toApiMessages, tokensOf, FlowEditError,
} from "./jarvis-llm.ts";
import { TEMPLATES } from "./flow.ts";

const NOW = new Date("2026-10-04T10:10:00Z"); // 12:10 deutsche Zeit
const FLOW = (id: string) => structuredClone(TEMPLATES.find((t) => t.id === id)!.flow);

// ---------------------------------------------------------------- Routing
test("Routing: Weiche zu Opus/Routine, sonst Antwort von Haiku", () => {
  assert.deepEqual(parseRoute('{"route":"opus"}'), { kind: "opus" });
  assert.deepEqual(parseRoute(' {"route": "routine"} '), { kind: "routine" });
  assert.deepEqual(parseRoute('```json\n{"route":"opus"}\n```'), { kind: "opus" });
  assert.deepEqual(parseRoute('{"route":"opus"} weil Daten fehlen'), { kind: "opus" });
  assert.deepEqual(parseRoute(""), { kind: "opus" });
  assert.deepEqual(parseRoute('{"route": kaputt'), { kind: "opus" });
  assert.deepEqual(parseRoute("12 Proben sind bereit."), { kind: "answer", text: "12 Proben sind bereit." });
  // ein Text, der die Weiche nur erwähnt, bleibt Antwort
  assert.equal(parseRoute('Ich würde {"route":"opus"} sagen').kind, "answer");
});

test("Routine-Antwort und Hinweise nennen die deutsche Startzeit", () => {
  assert.equal(routineReply(NOW), "Übernimmt ein Agent, startet um 12:23.");
  assert.equal(fallbackHint("kein_schluessel", NOW), "Sofort-Antwort aus – Schlüssel fehlt, Agent antwortet um 12:23.");
  assert.match(fallbackHint("budget", NOW), /Grenze .* 12:23/);
});

// ---------------------------------------------------------------- Kosten
test("Kosten: Haiku 1/5 $, Opus 4/20 $ je Mio. Tokens, 0,92 €/$", () => {
  assert.equal(costEur("haiku", { input_tokens: 1_000_000, output_tokens: 0 }), 0.92);
  assert.equal(costEur("haiku", { input_tokens: 0, output_tokens: 1_000_000 }), 4.6);
  assert.equal(costEur("opus", { input_tokens: 1_000_000, output_tokens: 1_000_000 }), 22.08);
  assert.equal(costEur("opus", { input_tokens: 2000, output_tokens: 300 }), 0.01288);
  // Zwischenspeicher-Tokens zählen zum vollen Eingabepreis, Unsinn zählt 0
  assert.deepEqual(tokensOf({ input_tokens: 10, cache_read_input_tokens: 5, cache_creation_input_tokens: 5, output_tokens: -3 }), { input: 20, output: 0 });
  assert.equal(costEur("haiku", null), 0);
  assert.equal(MODELS.haiku, "claude-haiku-4-5-20251001");
  assert.equal(MODELS.opus, "claude-opus-5-5");
  assert.equal(MAX_OPUS_ROUNDS, 6);
});

// ---------------------------------------------------------------- Budget
test("Budget: Monatsgrenze vor jedem Aufruf, Standard 30 €, 0 = aus", () => {
  assert.equal(budgetOf(undefined), 30);
  assert.equal(budgetOf("abc"), 30);
  assert.equal(budgetOf(-1), 30);
  assert.equal(budgetOf(0), 0);
  assert.equal(budgetOf(12.5), 12.5);
  assert.equal(canCall(0, 30, "opus"), true);
  assert.equal(canCall(29.95, 30, "opus"), false);
  assert.equal(canCall(29.95, 30, "haiku"), true);
  assert.equal(canCall(30, 30, "haiku"), false);
  assert.equal(canCall(0, 0, "haiku"), false);
  const s = budgetState(1.234, 30);
  assert.equal(s.text, "API diesen Monat: 1,23 € von 30 €");
  assert.equal(s.ok, true);
  assert.equal(s.pct, 4);
  assert.equal(budgetState(31, 30).ok, false);
  assert.equal(budgetState(31, 30).pct, 100);
  assert.equal(euro(7.5), "7,50 €");
});

test("Monatsbeginn in deutscher Zeit (Sommer- und Winterzeit)", () => {
  assert.equal(monthStart(NOW).toISOString(), "2026-09-30T22:00:00.000Z"); // 01.10. 00:00 MESZ
  assert.equal(monthStart(new Date("2026-12-15T12:00:00Z")).toISOString(), "2026-11-30T23:00:00.000Z"); // 01.12. 00:00 MEZ
  // 31.10. 23:30 UTC = 01.11. 00:30 MEZ → November
  assert.equal(monthStart(new Date("2026-10-31T23:30:00Z")).toISOString(), "2026-10-31T23:00:00.000Z");
});

// ---------------------------------------------------------------- Verlauf
test("Verlauf → API-Nachrichten: zusammengefasst, beginnt und endet mit user", () => {
  const h = [
    { role: "jarvis" as const, body: "Hallo" }, { role: "inhaber" as const, body: "A" }, { role: "inhaber" as const, body: "B" },
    { role: "jarvis" as const, body: "C" }, { role: "inhaber" as const, body: "D" },
  ];
  assert.deepEqual(toApiMessages(h), [{ role: "user", content: "A\n\nB" }, { role: "assistant", content: "C" }, { role: "user", content: "D" }]);
  assert.deepEqual(toApiMessages([{ role: "inhaber", body: "x" }, { role: "jarvis", body: "y" }]), []);
  assert.equal(toApiMessages([{ role: "inhaber", body: "x".repeat(5000) }])[0].content.length, 2000);
  assert.equal(cleanReply("  a\n\n\n\nb  "), "a\n\nb");
  assert.ok(cleanReply("x".repeat(9000)).length <= 8000);
});

// ---------------------------------------------------------------- Werkzeuge
test("Werkzeuge: jede Definition hat ein strenges Schema", () => {
  for (const t of TOOL_DEFS) {
    assert.equal(t.input_schema.type, "object", t.name);
    assert.equal(t.input_schema.additionalProperties, false, t.name);
  }
  assert.ok(TOOL_DEFS.some((t) => t.name === "an_routine_uebergeben"));
  assert.ok(!TOOL_DEFS.some((t) => /sql|loesch|delete|versand_start|send/i.test(t.name)));
});

test("Werkzeug-Prüfung: ungültige Eingaben werden abgelehnt", () => {
  assert.equal(checkTool("sql", { q: "drop table" }).ok, false);
  assert.equal(checkTool("kennzahlen", { bereich: "alles" }).ok, false);
  assert.equal(checkTool("kennzahlen", { bereich: "versand" }).ok, true);
  assert.equal(checkTool("bestand_land", { land: "DE" }).ok, false);
  assert.deepEqual(checkTool("bestand_land", { land: "uk" }), { ok: true, input: { name: "bestand_land", land: "UK" } });
  assert.equal(checkTool("freigabe_gruende", { anzahl: 5000 }).ok, false);
  assert.equal(checkTool("flow_lesen", { flow_id: "1; drop" }).ok, false);
  // Regler: nur erlaubte Schlüssel – nie Versand, Länderlimits, API-Grenze
  for (const k of ["send_paused", "send_country_limits", "send_countries_off", "llm_budget_eur", "dismissed_tips", "followup_enabled"]) {
    assert.equal(checkTool("regler_setzen", { schluessel: k, wert: 1 }).ok, false, k);
  }
  assert.equal(checkTool("regler_setzen", { schluessel: "followup_days" }).ok, false);
  assert.equal(checkTool("regler_setzen", { schluessel: "followup_days", wert: 5 }).ok, true);
  // Mail-Werke nur aus
  for (const w of ["versand", "nachfass", "antworten", "kundenlieferung"]) {
    assert.equal(checkTool("werk_schalten", { werk: w, an: true }).ok, false, w);
    assert.equal(checkTool("werk_schalten", { werk: w, an: false }).ok, true, w);
  }
  assert.equal(checkTool("werk_schalten", { werk: "lead-werk", an: "ja" }).ok, false);
  assert.equal(checkTool("werk_schalten", { werk: "unbekannt", an: false }).ok, false);
  // Werk-Start: nie Versand
  assert.equal(checkTool("werk_starten", { werk: "versand" }).ok, false);
  assert.equal(checkTool("werk_starten", { werk: "lead-werk" }).ok, true);
  // Aufträge wie validateTask
  assert.equal(checkTool("auftrag_anlegen", { art: "kunde", text: "abc" }).ok, false);
  assert.equal(checkTool("auftrag_anlegen", { art: "leads", markt: "DE", text: "Leads holen" }).ok, false);
  assert.equal(checkTool("auftrag_anlegen", { agent: 9, art: "leads", text: "Leads holen" }).ok, false);
  assert.equal(checkTool("auftrag_anlegen", { art: "leads", text: "" }).ok, false);
  const a = checkTool("auftrag_anlegen", { art: "leads", markt: "uk", text: "  UK   Leads holen " });
  assert.deepEqual(a, { ok: true, input: { name: "auftrag_anlegen", agent: null, kind: "leads", market: "UK", brief: "UK Leads holen", grund: null } });
  const g = checkTool("auftrag_anlegen", { art: "pruefen", text: "US prüfen", grund: "  Fehlerquote  senken " });
  assert.ok(g.ok && g.input.name === "auftrag_anlegen" && g.input.grund === "Fehlerquote senken");
  assert.equal(checkTool("auftrag_anlegen", { art: "pruefen", text: "US prüfen", grund: "x".repeat(161) }).ok, false);
  // Flow: Format geprüft, Version Pflicht
  const id = "11111111-2222-4333-8444-555555555555";
  assert.equal(checkTool("flow_speichern", { flow_id: id, def: { v: 2 }, version: "x" }).ok, false);
  assert.equal(checkTool("flow_speichern", { flow_id: id, def: FLOW("frisch-30") }).ok, false);
  assert.equal(checkTool("flow_speichern", { flow_id: id, def: FLOW("frisch-30"), version: "2026-10-04T10:00:00Z" }).ok, true);
  assert.equal(checkTool("an_routine_uebergeben", { grund: "x" }).ok, false);
  assert.equal(checkTool("an_routine_uebergeben", { grund: "Website ändern" }).ok, true);
});

test("Flow aus dem Chat: Master und Pipeline-Flows nur als Vorschlag, Regeln wie flow_edit.py", () => {
  assert.deepEqual(checkFlowEdit({ kind: "test", status: "entwurf" }, FLOW("frisch-30")).live, false);
  assert.equal(checkFlowEdit({ kind: "test", status: "aktiv" }, FLOW("frisch-30")).live, true);
  assert.throws(() => checkFlowEdit({ kind: "test", status: "archiv" }, FLOW("frisch-30")), FlowEditError);
  // in der Pipeline: Pipeline-Baustein muss bleiben, nur Leads
  assert.throws(() => checkFlowEdit({ kind: "test", status: "aktiv" }, FLOW("weiche-handy")), /Pipeline-Baustein/);
  assert.throws(() => checkFlowEdit({ kind: "master", status: "aktiv" }, FLOW("kaeufer-frei")), FlowEditError);
});

test("API-Grenze im Dashboard: 0–500 €, höchstens 2 Nachkommastellen", async () => {
  const { validateLlmBudget, DEFAULTS } = await import("./owner-settings.ts");
  assert.equal(DEFAULTS.llm_budget_eur, 30);
  assert.equal(validateLlmBudget("45"), 45);
  assert.equal(validateLlmBudget("12,5"), 12.5);
  assert.equal(validateLlmBudget("0"), 0);
  for (const bad of ["", "-1", "501", "1e3", "abc", "1.234"]) assert.throws(() => validateLlmBudget(bad), bad);
});

// ---------------------------------------------------------------- Modi Assistent | Gehirn
import { GOALS_LINE, KNOWLEDGE_BUDGET, compactFlow, gehirnSystem, haikuSystem, knowledgeBlock, modelPlan, opusSystem, slugify, SLUG_RE } from "./jarvis-llm.ts";

test("Assistent kennt die Ziele in einem Satz und verweist auf das Gehirn; Flow-Wünsche an Opus, nicht an den Agenten", () => {
  const h = haikuSystem("KTX");
  assert.ok(h.includes(GOALS_LINE));
  assert.match(h, /Umsatz maximieren/);
  assert.match(h, /„Gehirn“/);
  assert.match(h, /Baukasten-Flow .* IMMER hierher \(opus\)/);
  assert.ok(h.endsWith("KTX"));
  const o = opusSystem("KTX");
  assert.match(o, /flow_lesen und flow_speichern erledigen – nie an einen Agenten/);
  assert.match(o, /auftrag_anlegen mit agent 3/);
});

test("Gehirn: Ziele, Grenzen, Kontext und Wissen im System-Text, immer Opus", () => {
  const g = gehirnSystem("KPI-KONTEXT", "### Ziele & Grenzen");
  for (const must of ["Modus „Gehirn“", "Umsatz maximieren", "KPIs", "Lead-Qualität", "kein Geld ausgeben", "Sperrliste", "Notbremse", "Drei-Stufen-Freigabe", "nichts löschen", "nie DE/AT/CH/IT/ES/PL/DK", "KPI-KONTEXT", "### Ziele & Grenzen", "wissen_notieren"])
    assert.ok(g.includes(must), must);
  assert.ok(g.indexOf("KPI-KONTEXT") < g.indexOf("### Ziele & Grenzen"));
  assert.match(gehirnSystem("x", ""), /noch keine Notizen/);
  assert.deepEqual(modelPlan("gehirn"), { first: "opus", haikuGate: false });
  assert.deepEqual(modelPlan("assistent"), { first: "haiku", haikuGate: true });
});

test("Wissen: neueste zuerst, auf Budget gekürzt, ältere benannt", () => {
  const D = (slug: string, at: string, n: number) => ({ slug, titel: slug.toUpperCase(), markdown: "x".repeat(n), quelle: "routine", updated_at: at });
  const docs = [D("alt", "2026-10-01T00:00:00Z", 100), D("neu", "2026-10-04T00:00:00Z", 100), D("mitte", "2026-10-02T00:00:00Z", 100)];
  const b = knowledgeBlock(docs);
  assert.ok(b.indexOf("### NEU") < b.indexOf("### MITTE") && b.indexOf("### MITTE") < b.indexOf("### ALT"), b);
  const small = knowledgeBlock([D("neu", "2026-10-04T00:00:00Z", 5000), D("alt", "2026-10-01T00:00:00Z", 5000)], 1000);
  assert.ok(small.length < 1300, String(small.length));
  assert.match(small, /\(gekürzt\)/);
  assert.match(small, /\+1 ältere Notizen nicht geladen – mit wissen_lesen öffnen: alt/);
  assert.ok(knowledgeBlock(Array.from({ length: 200 }, (_, i) => D(`n${i}`, `2026-10-0${1 + (i % 4)}T00:00:00Z`, 1000))).length <= KNOWLEDGE_BUDGET + 2000);
  assert.equal(knowledgeBlock([]), "");
});

test("Werkzeuge: Routinen und Wissen prüfen", () => {
  const id = "11111111-2222-3333-4444-555555555555";
  const a = checkTool("routine_anlegen", { name: "Umsatz", aufgabe: "Umsatz recherchieren", uhrzeit: "14 Uhr", dauer_min: 15 });
  assert.ok(a.ok && a.input.name === "routine_anlegen" && a.input.routine.uhrzeit === "14:00");
  assert.equal(checkTool("routine_anlegen", { name: "Umsatz", aufgabe: "Umsatz recherchieren", uhrzeit: "26:00" }).ok, false);
  assert.equal(checkTool("routine_anlegen", { name: "U", aufgabe: "Umsatz recherchieren", uhrzeit: "14:00" }).ok, false);
  const p = checkTool("routine_aendern", { id, aktiv: false });
  assert.ok(p.ok && p.input.name === "routine_aendern" && p.input.patch.aktiv === false);
  assert.equal(checkTool("routine_aendern", { id }).ok, false); // nichts zu ändern
  assert.equal(checkTool("routine_aendern", { id: "x", aktiv: false }).ok, false);
  assert.equal(checkTool("routine_aendern", { id, dauer_min: 90 }).ok, false);
  assert.equal(checkTool("routine_aendern", { id, aktiv: "nein" }).ok, false);
  const w = checkTool("wissen_notieren", { titel: "Ziele & Grenzen", markdown: "# Ziele" });
  assert.ok(w.ok && w.input.name === "wissen_notieren" && w.input.slug === "ziele-grenzen");
  assert.equal(checkTool("wissen_notieren", { titel: "Ziele", markdown: "" }).ok, false);
  assert.equal(checkTool("wissen_notieren", { titel: "Ziele", markdown: "x", slug: "../etc" }).ok, false);
  assert.equal(checkTool("wissen_lesen", { slug: "ziele-grenzen" }).ok, true);
  assert.equal(checkTool("wissen_lesen", { slug: "Ziele Grenzen" }).ok, false);
  assert.equal(checkTool("routinen_liste", {}).ok, true);
  assert.equal(checkTool("wissen_liste", {}).ok, true);
  // Auftrag an Agent 3 („gib die Aufgabe dem Agenten 3“)
  const t = checkTool("auftrag_anlegen", { agent: 3, art: "pruefen", text: "Stichprobe US prüfen" });
  assert.ok(t.ok && t.input.name === "auftrag_anlegen" && t.input.agent === 3);
  assert.equal(checkTool("auftrag_anlegen", { agent: 9, art: "pruefen", text: "x x x" }).ok, false);
  assert.equal(slugify("Über Öl & Größe"), "ueber-oel-groesse");
  assert.equal(slugify("!"), "notiz-x");
  assert.ok(SLUG_RE.test(slugify("x".repeat(200))));
});

test("Baukasten-Flow kompakt im Kontext (ohne Positionen, mit Bedingungen)", () => {
  const c = compactFlow(FLOW(TEMPLATES[0].id));
  assert.ok(!/"x":/.test(c) && !/"y":/.test(c), c);
  assert.match(c, /"kind":"quelle"/);
  assert.match(c, /→/);
  assert.equal(compactFlow(null), '{"bausteine":[],"kanten":[]}');
});

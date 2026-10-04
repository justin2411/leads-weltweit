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
  assert.equal(routineReply(NOW), "Übernimmt die Routine, startet um 12:23.");
  assert.equal(fallbackHint("kein_schluessel", NOW), "Sofort-Antwort aus – Schlüssel fehlt, Routine antwortet um 12:23.");
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
  assert.deepEqual(a, { ok: true, input: { name: "auftrag_anlegen", agent: null, kind: "leads", market: "UK", brief: "UK Leads holen" } });
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

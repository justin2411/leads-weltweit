import { test } from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import {
  KUNDE_TASK_AGENT, agentEligible, cleanNote, fnv1a32, fullName, goalChips, initials, jarvisLabel, kpiOf, langFor, noteBrief, pickPersona, resumeStatus,
  roleDe, signature, statusLabel, welcomeAgentLine, type PersonaData,
} from "./customer-agents.ts";
import { KINDS } from "./agents.ts";

const read = (p: string) => JSON.parse(readFileSync(new URL(p, import.meta.url), "utf8"));
const DATA = read("./personas.json") as PersonaData;
const CASES = read("../../tests/fixtures/persona_cases.json") as {
  fnv1a32: Record<string, number>; cases: { lang: "en" | "fr"; seed: string; used: string[]; expect: Record<string, string> }[];
};

test("Paket-Regel: Agent ab Pro, individuell ab 50/Woche, Starter nie", () => {
  assert.equal(agentEligible("pro"), true);
  assert.equal(agentEligible("pro", 3), true);
  assert.equal(agentEligible("starter"), false);
  assert.equal(agentEligible("starter", 500), false);
  assert.equal(agentEligible("custom", 50), true);
  assert.equal(agentEligible("custom", "150"), true);
  assert.equal(agentEligible("custom", 49), false);
  assert.equal(agentEligible("custom", undefined), false);
  assert.equal(agentEligible("custom", "abc"), false);
  assert.equal(agentEligible(undefined), false);
  assert.equal(agentEligible("PRO"), false);
});

test("Sprache: nur Frankreich französisch", () => {
  assert.equal(langFor("FR"), "fr");
  assert.equal(langFor("fr "), "fr");
  for (const c of ["UK", "US", "IE", "BE", null]) assert.equal(langFor(c), "en");
});

test("FNV-1a wie Python (gemeinsame Werte)", () => {
  for (const [s, h] of Object.entries(CASES.fnv1a32)) assert.equal(fnv1a32(s), h, s);
});

test("Persona-Auswahl gleich wie Python (tests/fixtures/persona_cases.json)", () => {
  assert.ok(CASES.cases.length >= 10);
  for (const c of CASES.cases) assert.deepEqual(pickPersona(DATA, c.lang, c.seed, c.used), c.expect, `${c.lang} ${c.seed} ${c.used.length}`);
});

test("Persona deterministisch, Groß-/Kleinschreibung des Seeds egal, vergebene Namen werden übersprungen", () => {
  const a = pickPersona(DATA, "en", "ABC-1");
  assert.deepEqual(pickPersona(DATA, "en", "abc-1"), a);
  const b = pickPersona(DATA, "en", "abc-1", [fullName(a)]);
  assert.notEqual(fullName(b), fullName(a));
  assert.equal(pickPersona(DATA, "fr", "x").lang, "fr");
});

test("Namenslisten: genug Namen, Rollen und KI-Signatur je Sprache", () => {
  for (const lang of ["en", "fr"] as const) {
    const P = DATA[lang];
    assert.ok(P.first_names.length * P.last_names.length >= 100);
    assert.ok(P.bios.length >= 2);
    for (const g of ["f", "m"] as const) {
      assert.ok(P.role[g]);
      assert.match(P.signature[g], lang === "fr" ? /\bIA\b/ : /\bAI\b/);
    }
    for (const f of P.first_names) assert.ok(f.g === "f" || f.g === "m");
  }
  const p = pickPersona(DATA, "fr", "s1");
  assert.match(signature(DATA, p), new RegExp(`^${fullName(p)} · interlocut(eur|rice) IA`));
});

const PY = new URL("../../scripts/customer_agents.py", import.meta.url);
test("Eine Persona-Quelle: Backend liest app/lib/personas.json, keine Kopie in scripts/lib", { skip: !existsSync(PY) && "scripts/customer_agents.py fehlt" }, () => {
  assert.equal(existsSync(new URL("../../scripts/lib/personas.json", import.meta.url)), false);
  const py = readFileSync(PY, "utf8");
  assert.match(py, /"app" \/ "lib" \/ "personas\.json"/);
  assert.match(py, /TASK_AGENT = (\d+)/);
  assert.equal(Number(/TASK_AGENT = (\d+)/.exec(py)![1]), KUNDE_TASK_AGENT);
});

test("KI-Hinweis der Begrüßung je Sprache und Geschlecht, mit {owner}", () => {
  for (const lang of ["en", "fr"] as const) for (const g of ["f", "m"] as const) {
    const t = DATA[lang].ai_note[g];
    assert.match(t, /\{owner\}/);
    assert.match(t, lang === "fr" ? /\bIA\b/ : /\bAI\b/);
  }
});

test("Kunden-Aufträge immer an Agent 9 (A1–A4 bleiben dem Inhaber)", () => {
  assert.equal(KUNDE_TASK_AGENT, 9);
});

test("Willkommens-Absatz: ehrlich als KI, keine Preise", () => {
  for (const lang of ["en", "fr"] as const) {
    const p = pickPersona(DATA, lang, "w");
    const t = welcomeAgentLine(p);
    assert.ok(t.includes(fullName(p)));
    assert.match(t, lang === "fr" ? /\(IA\)/ : /AI assistant/);
    assert.match(t, /\b4\b/);
    assert.doesNotMatch(t, /[£$€]|\d{2,}/);
  }
});

test("Willkommens-Absatz in der Sprache der Mail, robust bei unvollständiger Persona", () => {
  const fr = pickPersona(DATA, "fr", "x");
  const en = welcomeAgentLine(fr, "en");
  assert.match(en, /AI assistant/);
  assert.doesNotMatch(en, /Votre|IA\)/);
  const en2 = pickPersona(DATA, "en", "y");
  const f = welcomeAgentLine(en2, "fr");
  assert.match(f, /^Votre interlocut(eur|rice), .*\(IA\)/);
  assert.doesNotMatch(f, /account manager/);
  const broken = { lang: "fr" } as unknown as Parameters<typeof welcomeAgentLine>[0];
  for (const l of ["en", "fr"] as const) assert.doesNotMatch(welcomeAgentLine(broken, l), /undefined|null/);
});

test("Kurzlabels und Stichworte", () => {
  assert.equal(initials({ first_name: "emma", last_name: "carter" }), "EC");
  assert.equal(initials(null), "KA");
  assert.equal(statusLabel("onboarding"), "lernt kennen");
  assert.equal(statusLabel("pausiert"), "pausiert");
  assert.equal(roleDe({ gender: "m" }), "KI-Ansprechpartner");
  assert.equal(jarvisLabel(3), "Kunden-Agenten (3)");
  assert.equal(jarvisLabel(null), "Kunden-Agenten");
  assert.deepEqual(goalChips({ ziele: "10 Neukunden; mehr Umsatz", zielgruppe: ["Handwerker", "handwerker"], signale: "x".repeat(40) }),
    ["10 Neukunden", "mehr Umsatz", "Handwerker", `${"x".repeat(31)}…`]);
  assert.deepEqual(goalChips(null), []);
  assert.equal(goalChips({ ziele: "a,b,c,d,e,f,g" }).length, 5);
  assert.deepEqual(kpiOf({ rueckmeldungen: 2, good_leads: "5", abschluesse: -1 }), { rueckmeldungen: 2, gute_leads: 5, abschluesse: 0 });
  assert.deepEqual(kpiOf(undefined), { rueckmeldungen: 0, gute_leads: 0, abschluesse: 0 });
  assert.equal(resumeStatus({ profile: {} }), "onboarding");
  assert.equal(resumeStatus({ profile: { ziele: "mehr Kunden" } }), "aktiv");
  assert.equal(resumeStatus({ profile: {}, last_contact_at: "2026-10-04T08:00:00Z" }), "aktiv");
});

test("Hinweis an Agent: Länge geprüft, Auftrag mit Agent-ID, höchstens 1000 Zeichen", () => {
  assert.equal(cleanNote("  "), null);
  assert.equal(cleanNote("ab"), null);
  assert.equal(cleanNote("x".repeat(801)), null);
  assert.equal(cleanNote("  mehr   Handwerker  "), "mehr Handwerker");
  const b = noteBrief("11111111-2222-3333-4444-555555555555", "Emma Carter", "Acme Ltd", "mehr\nHandwerker");
  assert.match(b, /^Kunden-Agent 11111111-2222-3333-4444-555555555555 · Emma Carter \(Acme Ltd\) · Hinweis vom Inhaber: mehr Handwerker$/);
  assert.ok(noteBrief("id", "n", "c", "y".repeat(2000)).length <= 1000);
});

test("Aufgaben-Art „kunde“ im JARVIS-Board", () => {
  assert.equal(KINDS.kunde.label, "Kunde");
});

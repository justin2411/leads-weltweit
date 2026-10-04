/**
 * Sofort-Antworten über die Claude-API (Inhaber 04.10.2026: „alle chats sollen direkt antworten“, „bei einfachen
 * antworten nimmt der haiku und bei schwierigen oder wo er direkt auf das system zugreifen muss nimmt er opus“,
 * Monatsgrenze „vorerst 30 € – im Dashboard änderbar“). Reines Modul ohne Server-/React-Abhängigkeiten (testbar):
 * Modelle und Preise, Kostenrechnung, Monatsgrenze, Routing-Entscheidung, Verlauf → API-Nachrichten, System-Texte,
 * Werkzeug-Beschreibungen und die Prüfung jeder Werkzeug-Eingabe (ungültig = abgelehnt, nichts ausgeführt).
 * Ausgeführt wird in lib/jarvis-ask.ts (Ablauf) und lib/jarvis-tools.ts (Werkzeuge, nur feste sichere Pfade).
 */
import { AGENT_COUNT, MARKETS, OWNER_KINDS, TaskError, validateTask, type Kind } from "./agents.ts";
import { parseFlow, problems, type Flow, type FlowKind } from "./flow.ts";
import { nextRunAt, type ChatLink, type ChatMode } from "./jarvis-chat.ts";
import { RoutineError, TAGE, normDays, normTime, validateRoutine, type RoutineInput, type Tage } from "./brain-routines.ts";
import { WERK_SWITCHES, type SettingKey, type WerkKey } from "./owner-settings.ts";
import { START_WORKFLOWS, isStartKey, type StartKey } from "./start-queue.ts";
import { AB_COUNTRIES, AB_STEP_KEYS } from "./ab.ts";

// ------------------------------------------------------------------------------------------- Modelle und Preise
/** Modell-IDs (Konfiguration). Haiku = schnelle einfache Antworten, Opus = Systemzugriff über sichere Werkzeuge. */
export const MODELS = { haiku: "claude-haiku-4-5-20251001", opus: "claude-opus-5-5" } as const;
export type ModelKey = keyof typeof MODELS;
/** US-Dollar je 1 Mio. Tokens (Eingabe / Ausgabe). */
export const PRICES_USD: Record<ModelKey, { in: number; out: number }> = { haiku: { in: 1, out: 5 }, opus: { in: 4, out: 20 } };
/** Fester Umrechnungsfaktor USD → EUR. */
export const USD_EUR = 0.92;
/** Standard-Monatsgrenze in Euro (owner_settings.llm_budget_eur). */
export const DEFAULT_BUDGET_EUR = 30;
/** Höchstens so viele Opus-Runden (Werkzeug-Aufrufe) je Nachricht. */
export const MAX_OPUS_ROUNDS = 6;
/** Rücklage je Aufruf: ein Aufruf startet nur, wenn bisherige Kosten + Rücklage ≤ Grenze. */
export const RESERVE_EUR: Record<ModelKey, number> = { haiku: 0.01, opus: 0.1 };

export type Usage = {
  input_tokens?: number | null; output_tokens?: number | null;
  cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null;
};

const nn = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x > 0 ? Math.round(x) : 0);

/** Tokens eines Aufrufs (Zwischenspeicher-Tokens zählen vorsichtshalber zum vollen Eingabepreis). */
export function tokensOf(u: Usage | null | undefined): { input: number; output: number } {
  return { input: nn(u?.input_tokens) + nn(u?.cache_creation_input_tokens) + nn(u?.cache_read_input_tokens), output: nn(u?.output_tokens) };
}

/** Kosten eines Aufrufs in Euro (6 Nachkommastellen). */
export function costEur(model: ModelKey, u: Usage | null | undefined): number {
  const t = tokensOf(u);
  const p = PRICES_USD[model];
  const usd = (t.input * p.in + t.output * p.out) / 1_000_000;
  return Math.round(usd * USD_EUR * 1e6) / 1e6;
}

// ------------------------------------------------------------------------------------------- Monatsgrenze
const TZ = "Europe/Berlin";
const ymd = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(d);

/** Beginn des laufenden Monats in deutscher Zeit (1. des Monats, 00:00 Europe/Berlin) als Date. */
export function monthStart(now: Date): Date {
  const [y, m] = ymd(now).slice(0, 7).split("-").map(Number);
  const want = `${y}-${String(m).padStart(2, "0")}-01 00:00`;
  for (const h of [-1, -2, 0]) {
    const c = new Date(Date.UTC(y, m - 1, 1, 0, 0) + h * 3_600_000);
    if (ymd(c) === want) return c;
  }
  return new Date(Date.UTC(y, m - 1, 1) - 3_600_000);
}

/** „1,23 €“; ganze Beträge ohne Nachkommastellen („30 €“). */
export function euro(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return `${Number.isInteger(v) ? String(v) : v.toFixed(2).replace(".", ",")} €`;
}

/** Grenze aus owner_settings: ungültig → Standard; 0 = Sofort-Antworten aus. */
export function budgetOf(raw: unknown): number {
  const n = typeof raw === "number" ? raw : Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 500 ? n : DEFAULT_BUDGET_EUR;
}

export type BudgetState = { spent: number; budget: number; left: number; pct: number; ok: boolean; text: string };

/** Stand des Monats: „API diesen Monat: 1,23 € von 30 €“. ok = es darf noch ein Aufruf starten (Haiku-Rücklage). */
export function budgetState(spent: number, budgetRaw: unknown): BudgetState {
  const budget = budgetOf(budgetRaw);
  const s = Math.max(0, Number.isFinite(spent) ? spent : 0);
  const shown = Math.round(s * 100) / 100;
  return {
    spent: s, budget, left: Math.max(0, budget - s), pct: budget ? Math.min(100, Math.round((s / budget) * 100)) : 100,
    ok: canCall(s, budget, "haiku"),
    text: `API diesen Monat: ${shown.toFixed(2).replace(".", ",")} € von ${euro(budget)}`,
  };
}

/** Darf ein Aufruf dieses Modells noch starten? Grenze > 0 und bisher + Rücklage ≤ Grenze. */
export function canCall(spent: number, budget: number, model: ModelKey): boolean {
  return budget > 0 && spent + RESERVE_EUR[model] <= budget + 1e-9;
}

// ------------------------------------------------------------------------------------------- Routing
export type Route = { kind: "answer"; text: string } | { kind: "opus" } | { kind: "routine" };

/**
 * Antwort von Haiku auswerten: nur {"route":"opus"} bzw. {"route":"routine"} (auch in ```json … ```) → weiterleiten;
 * leer → Opus; sonst ist der Text die Antwort. Eine Antwort, die mit der Weiche beginnt, gilt als Weiche.
 */
export function parseRoute(text: unknown): Route {
  const t = String(text ?? "").trim();
  if (!t) return { kind: "opus" };
  const m = /^(?:```(?:json)?\s*)?\{\s*"route"\s*:\s*"(opus|routine)"\s*\}/i.exec(t);
  if (m) return { kind: m[1].toLowerCase() === "routine" ? "routine" : "opus" };
  if (/^\{\s*"route"/.test(t)) return { kind: "opus" }; // kaputtes JSON → sicher zu Opus
  return { kind: "answer", text: t };
}

/** Kurze ehrliche Antwort, wenn ein Agent übernimmt (Code, Website, neue Funktionen …; Inhaber 04.10.2026: „sag zukünftig immer agent dazu“). */
export const routineReply = (now: Date) => `Übernimmt ein Agent, startet um ${nextRunAt(now)}.`;

/** Hinweis, wenn keine Sofort-Antwort möglich ist (Nachricht bleibt für die Routine offen). */
export function fallbackHint(reason: "kein_schluessel" | "budget" | "fehler" | "zeit", now: Date): string {
  const at = nextRunAt(now);
  if (reason === "kein_schluessel") return `Sofort-Antwort aus – Schlüssel fehlt, Agent antwortet um ${at}.`;
  if (reason === "budget") return `API-Grenze für diesen Monat erreicht – ein Agent antwortet um ${at}.`;
  if (reason === "zeit") return `Dauert länger – ein Agent übernimmt um ${at}.`;
  return `Sofort-Antwort gerade nicht möglich – ein Agent antwortet um ${at}.`;
}

// ------------------------------------------------------------------------------------------- Verlauf
export type HistoryMsg = { role: "inhaber" | "jarvis"; body: string };
export type ApiMsg = { role: "user" | "assistant"; content: string };
const BODY_CAP = 2000;

/** Letzte `n` Nachrichten → API-Nachrichten: Inhaber = user, JARVIS = assistant, gleiche Rollen zusammengefasst,
 *  beginnt und endet mit user (sonst leer). Jede Nachricht höchstens 2000 Zeichen. */
export function toApiMessages(history: HistoryMsg[], n = 10): ApiMsg[] {
  const out: ApiMsg[] = [];
  for (const m of history.slice(-n)) {
    const role = m.role === "jarvis" ? "assistant" : "user";
    const body = String(m.body ?? "").trim().slice(0, BODY_CAP);
    if (!body) continue;
    const last = out[out.length - 1];
    if (last && last.role === role) last.content = `${last.content}\n\n${body}`;
    else out.push({ role, content: body });
  }
  while (out.length && out[0].role !== "user") out.shift();
  if (!out.length || out[out.length - 1].role !== "user") return [];
  return out;
}

// ------------------------------------------------------------------------------------------- System-Texte
/** Ziele des Systems in einem Satz (CLAUDE.md „JARVIS ist der Kopf“, docs/JARVIS.md). */
export const GOALS_LINE = "Ziele von JARVIS: 1. Umsatz maximieren (zahlende Kunden), 2. KPIs stetig verbessern (Antworten, Proben, Kunden, Zustellrate), 3. Lead-Qualität steigern (Freigabe-Fehlerquote, Vollständigkeit).";

const STYLE = [
  "Du schreibst mit dem Inhaber Justin. Immer Deutsch, du-Form, einfache Worte.",
  "Uhrzeiten immer in deutscher Zeit (Europe/Berlin), nie UTC.",
  "Nur echte Zahlen aus dem Kontext oder aus Werkzeugen – nie erfinden, nie schönen. Unbekannt = ehrlich sagen.",
  "Nie: Mails/Versand auslösen oder einschalten, Sperrliste, Drei-Stufen-Freigabe, Notbremse oder Abmeldung ändern oder lockern, Daten löschen, Geld ausgeben, Preise oder Beträge in Kundenmails.",
];

const RULES = [
  "Du bist JARVIS im Modus „Assistent“: Teil von JARVIS, dem Kopf von Signalwerk (B2B-Leads mit Anlass, Käufer: Webagenturen in US, UK, FR). Du hilfst bei Bausteinen und Themen im Dashboard (Baukasten, Website, Seiten, Werke, Agenten, Regler).",
  GOALS_LINE,
  "Fragt der Inhaber nach deinem Auftrag, deinen Zielen oder nach Strategie: nenne die Ziele in einem Satz und sag, dass er für Strategie, Ziele und gelerntes Wissen oben im Chat auf „Gehirn“ schalten kann.",
  ...STYLE,
  "Sehr kurz (Inhaber: „wenig Text überall“): höchstens 3 Sätze, am besten ein kurzer Titel und 1 Satz. Details nur, wenn er nachfragt. Kein Markdown außer höchstens 3 kurzen Listenpunkten.",
].join("\n");

/** System-Text für Haiku (Weiche + einfache Antworten, Modus Assistent). */
export function haikuSystem(context: string): string {
  return `${RULES}

Entscheide bei jeder Nachricht:
(a) Einfache Frage, die du sicher aus dem KONTEXT unten beantworten kannst, Frage nach deinem Auftrag, oder Gruß/Dank → direkt kurz antworten.
(b) Braucht Zahlen, die nicht im Kontext stehen, eine Änderung (Regler, Werk an/aus, Auftrag an einen Agenten, Baukasten-Flow, Werk starten, Gehirn-Routine anlegen/ändern, Wissen notieren) oder gründliches Nachdenken → antworte NUR mit {"route":"opus"}
    Jeder Wunsch zum Baukasten-Flow (Bausteine, Filter, Qualitätsfilter, Bedingungen, Weichen einbauen oder ändern) gehört IMMER hierher (opus), nie zu (c).
(c) Nur echte Code-, Website- oder Seitenänderung, neue Funktion im Programm, neue Quelle, Merge oder Migration → antworte NUR mit {"route":"routine"} (ein Agent übernimmt)
Im Zweifel {"route":"opus"}.

KONTEXT (jetzt):
${context}`;
}

const TOOLS_HINT = `Du hast Werkzeuge: lesende Abfragen und sichere Änderungen (Regler, Werk an/aus, Auftrag an Agent 1–8, Baukasten-Flow speichern, Werk-Start, Gehirn-Routinen anlegen/ändern/pausieren, Wissen notieren). Nutze sie statt zu raten.
„Gib das Agent 3“ → auftrag_anlegen mit agent 3. „Jeden Tag um 14 Uhr …“ → routine_anlegen (Uhrzeit deutsche Zeit).
„Teste einen anderen Betreff/Titel …“ → ab_test (anlegen, dann starten); Quoten und Engpass → ab_lesen.
Baukasten-Flow ändern (Bausteine, Filter, Bedingungen): selbst mit flow_lesen und flow_speichern erledigen – nie an einen Agenten geben.
Code, Website, Seiten, neue Funktionen, neue Quellen, Merges, Migrationen oder alles, was kein Werkzeug kann: rufe an_routine_uebergeben auf (ein Agent macht das im nächsten Lauf).
Lehnt ein Werkzeug ab, sag den Grund kurz. Nach einer Änderung: was geändert wurde, in einem Satz.`;

/** System-Text für Opus im Modus Assistent (Werkzeuge). */
export function opusSystem(context: string): string {
  return `${RULES}

${TOOLS_HINT}

KONTEXT (jetzt):
${context}`;
}

/** System-Text im Modus Gehirn (immer Opus): JARVIS als Kopf mit Zielen, Grenzen, KPIs und dem gesamten Gehirn-Wissen. */
export function gehirnSystem(context: string, knowledge: string): string {
  return `Du bist JARVIS im Modus „Gehirn“: der Kopf von Signalwerk (B2B-Leads mit Anlass, Käufer: Webagenturen in US, UK, FR). Du führst Lead-Werk, Kunden-Werk, Proben-Vorrat, Versand, Agenten A1–A8, Gehirn-Routinen und Quellen-Scout wie ein Geschäftsführer – selbstständig, ohne nachzufragen, innerhalb der Grenzen.
${GOALS_LINE}
Du denkst selbst: Was ist gerade der Engpass? Welcher Hebel bringt am meisten Umsatz? Was hast du schon gelernt (WISSEN unten)? Dann handelst du mit den Werkzeugen (Agenten beauftragen, Regler, Werke, Routinen, Wissen notieren) oder übergibst Code-Arbeit mit an_routine_uebergeben an einen Agenten. Neue Erkenntnisse aus dem Gespräch notierst du mit wissen_notieren.
Du nutzt die Agenten A1–A8 selbst für deine Ziele: siehst du einen Hebel, beauftragst du einen freien Agenten mit auftrag_anlegen und grund (≤ 160 Zeichen, Ziel-Bezug; nur Fokus-Märkte US/UK/FR, höchstens 3 je Stunde). Ergebnisse fertiger Aufträge (Kontext „Letzte Aufträge“) wertest du aus und notierst Gelerntes. Aufträge auf Wunsch des Inhabers ohne grund.
A/B je Schritt: mit ab_lesen siehst du den Trichter (Quote je Station, Engpass) und alle Tests. Engpass zuerst: für den Schritt mit dem größten Abfall legst du mit ab_test einen Test an und startest ihn (eine Sache pro Test, A = heutiger Stand, Texte in der Landessprache, ohne Garantien/Preise/Zahlen außer 10; nur Webagenturen US/UK/FR; höchstens 1 laufender Test je Schritt und Land). Gewinner übernimmt die Auswertung selbst (≥ 95 % Sicherheit und Mindestmenge).
Selbst umsetzen, wenn es die Ziele voranbringt, nichts kostet, in den Grenzen bleibt und rückgängig zu machen ist. Fragen nur bei Geld, Rechtsfragen oder echter Unsicherheit.
Grenzen (CLAUDE.md, gelten immer): kein Geld ausgeben; Kaltmails nur in erlaubte Länder (nie DE/AT/CH/IT/ES/PL/DK, nie über Resend); Abmeldelink, Sperrliste, Notbremse, Spam-Stopp und Drei-Stufen-Freigabe nie lockern oder umgehen; keine erfundenen Zahlen, Garantien oder Dringlichkeit; Probe immer genau 10 Firmen; nichts löschen; keine Lead-Daten ins öffentliche Repo.
${STYLE.join("\n")}
Kurz und klar (Inhaber: „wenig Text überall“): höchstens 6 Sätze. Gern im Format „Aufgefallen: … · Nächster Schritt: … · Brauche: …“ (Brauche nur, wenn nötig). Kein langes Markdown.

${TOOLS_HINT}

KONTEXT (jetzt):
${context}

WISSEN DES GEHIRNS (neueste zuerst):
${knowledge || "noch keine Notizen"}`;
}

/** Wissens-Dokument (signalwerk.brain_knowledge) für den Kontext. */
export type KnowledgeDoc = { slug: string; titel: string; markdown: string; quelle: string; updated_at: string };
/** Wissen für den Gehirn-Modus: ca. 8.000 Tokens. */
export const KNOWLEDGE_BUDGET = 30_000;

/** Gesamtes Wissen, neueste zuerst, auf `max` Zeichen gekürzt (je Dokument Kopfzeile + Text; ältere ggf. nur benannt). */
export function knowledgeBlock(docs: KnowledgeDoc[], max = KNOWLEDGE_BUDGET): string {
  const sorted = [...docs].sort((a, b) => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0));
  const parts: string[] = [];
  let left = max;
  const skipped: string[] = [];
  for (const d of sorted) {
    const head = `### ${d.titel} (${d.slug}, ${String(d.updated_at).slice(0, 10)}, ${d.quelle})\n`;
    if (left < head.length + 80) { skipped.push(d.slug); continue; }
    const body = d.markdown.trim();
    const room = left - head.length;
    const text = body.length > room ? `${body.slice(0, room - 20)} … (gekürzt)` : body;
    parts.push(head + text);
    left -= head.length + text.length + 2;
  }
  if (skipped.length) parts.push(`(+${skipped.length} ältere Notizen nicht geladen – mit wissen_lesen öffnen: ${skipped.slice(0, 20).join(", ")})`);
  return parts.join("\n\n");
}

/** Welches Modell und welcher System-Text? Gehirn → immer Opus; Assistent → Haiku-Weiche, dann ggf. Opus. */
export function modelPlan(mode: ChatMode): { first: ModelKey; haikuGate: boolean } {
  return mode === "gehirn" ? { first: "opus", haikuGate: false } : { first: "haiku", haikuGate: true };
}

// ------------------------------------------------------------------------------------------- Werkzeuge
export const BEREICHE = ["versand", "proben", "freigabe", "kunden", "antworten", "bestand", "werke", "engpass", "api"] as const;
export type Bereich = (typeof BEREICHE)[number];
/** Regler-Schlüssel, die JARVIS über die API setzen darf (gleiche Prüfung wie der Regler). Nie: Versand, Nachfass an,
 *  Länderlimits, API-Grenze (= Geld des Inhabers), ausgeblendete Hinweise. */
export const TOOL_SETTING_KEYS = ["slot_plan", "slot_autopilot", "sample_targets", "sample_max_age_hours", "followup_days", "buyer_countries_off"] as const satisfies readonly SettingKey[];
export type ToolSettingKey = (typeof TOOL_SETTING_KEYS)[number];
/** Werke, die Mails schicken: JARVIS darf sie nur ausschalten, nie einschalten. */
export const MAIL_WERKE: readonly WerkKey[] = ["versand", "nachfass", "antworten", "kundenlieferung"];
export const ROUTINE_TOOL = "an_routine_uebergeben";

type Schema = { type: "object"; properties: Record<string, unknown>; required?: string[]; additionalProperties: false };
export type ToolDef = { name: string; description: string; input_schema: Schema };
const obj = (properties: Record<string, unknown>, required: string[] = []): Schema => ({ type: "object", properties, required, additionalProperties: false });
const uuidProp = { type: "string", description: "UUID" };

export const TOOL_DEFS: ToolDef[] = [
  { name: "kennzahlen", description: "Aktuelle Kennzahlen eines Bereichs (nur Zahlen): versand (heute, Kapazität, nächster Lauf, Notbremse), proben (bereit/Soll je Seite), freigabe (24 h freigegeben/durchgefallen), kunden (Abos, Umsatz), antworten (offen, 7 Tage), bestand (Leads/Käufer je Land), werke (an/aus, Plätze), engpass (letzte Engpass-Meldungen), api (Kosten diesen Monat).",
    input_schema: obj({ bereich: { type: "string", enum: [...BEREICHE] } }, ["bereich"]) },
  { name: "postfaecher", description: "Versand-Postfächer: heute gesendet, Tagesgrenze, 7 Tage, gesamt.", input_schema: obj({}) },
  { name: "bestand_land", description: "Leads (neu, freigegeben, zurückgehalten …) und mail-fähige Käufer eines Landes, dazu Zuwachs 24 h.",
    input_schema: obj({ land: { type: "string", enum: [...MARKETS] } }, ["land"]) },
  { name: "freigabe_gruende", description: "Häufigste Gründe, aus denen Leads in der Drei-Stufen-Freigabe durchfallen (letzte Prüfungen).",
    input_schema: obj({ anzahl: { type: "integer", minimum: 20, maximum: 500, description: "wie viele letzte Prüfungen (Standard 200)" } }) },
  { name: "auftraege", description: "Letzte Aufträge der Agenten A1–A8 (Status, Art, Markt, Ergebnis).", input_schema: obj({}) },
  { name: "flows_liste", description: "Baukasten-Flows: id, Name, Art (test/master/agent), Status, Anzahl Bausteine.", input_schema: obj({}) },
  { name: "flow_lesen", description: "Ein Baukasten-Flow mit Definition (def), Stand (updated_at) und offenem Vorschlag.", input_schema: obj({ flow_id: uuidProp }, ["flow_id"]) },
  { name: "einstellungen", description: "Aktuelle Regler-Einstellungen (Plätze je Linie, Autopilot, Proben-Soll, Nachfass-Tage, Käufer-Länder aus, Werke pausiert) mit Grenzen.", input_schema: obj({}) },
  { name: "regler_setzen", description: `Einen Regler setzen – gleiche Prüfung wie im Dashboard. Erlaubt: ${TOOL_SETTING_KEYS.join(", ")}. Wert im Format von „einstellungen“ (ganzer Wert des Schlüssels).`,
    input_schema: obj({ schluessel: { type: "string", enum: [...TOOL_SETTING_KEYS] }, wert: { description: "neuer Wert (Zahl, Liste oder Objekt)" } }, ["schluessel", "wert"]) },
  { name: "werk_schalten", description: "Ein Werk an- oder ausschalten. Werke, die Mails schicken (versand, nachfass, antworten, kundenlieferung), nur AUS.",
    input_schema: obj({ werk: { type: "string", enum: Object.keys(WERK_SWITCHES) }, an: { type: "boolean" } }, ["werk", "an"]) },
  { name: "auftrag_anlegen", description: `Auftrag an einen Agenten (1–${AGENT_COUNT}; ohne Angabe der erste freie). Arten: leads, kaeufer, quelle, pruefen, frage. Für größere Arbeiten an Daten/Werken. Im Gehirn-Modus: eigener Auftrag für deine Ziele → grund angeben (≤ 160 Zeichen, Ziel-Bezug; nur freie Agenten, Märkte US/UK/FR, höchstens 3 je Stunde); auf Wunsch des Inhabers ohne grund.`,
    input_schema: obj({ agent: { type: "integer", minimum: 1, maximum: AGENT_COUNT }, art: { type: "string", enum: [...OWNER_KINDS] }, markt: { type: "string", enum: [...MARKETS] }, text: { type: "string", minLength: 3, maxLength: 1000 },
      grund: { type: "string", maxLength: 160, description: "nur bei eigenem Auftrag des Gehirns: warum (Ziel-Bezug)" } }, ["art", "text"]) },
  { name: "flow_speichern", description: "Baukasten-Flow speichern (Format wie flow_lesen.def: {v:1,nodes,edges}). Test-/Agenten-Flows direkt; Master-Pipeline und Flows in der Pipeline nur als Vorschlag (Inhaber klickt „Übernehmen“). Bestehende Bausteine behalten, neue rechts daneben. version = updated_at aus flow_lesen.",
    input_schema: obj({ flow_id: uuidProp, def: { type: "object" }, notiz: { type: "string", maxLength: 300 }, version: { type: "string" } }, ["flow_id", "def", "version"]) },
  { name: "werk_starten", description: "Ein Werk jetzt starten (nie Versand): lead-werk, kunden-werk, proben-vorrat, freigabe-stichprobe.",
    input_schema: obj({ werk: { type: "string", enum: Object.keys(START_WORKFLOWS) } }, ["werk"]) },
  { name: "routinen_liste", description: "Gehirn-Routinen (id, Name, Uhrzeit deutsche Zeit, Tage, Dauer, aktiv, letzter Lauf, Ergebnis).", input_schema: obj({}) },
  { name: "routine_anlegen", description: "Neue Gehirn-Routine: zur Uhrzeit (deutsche Zeit, HH:MM) an den Tagen bekommt ein freier Agent den Auftrag (Dauer 5–60 min); das Ergebnis landet als Wissen. Tage: taeglich, werktags oder wochentage (dann wochentage 1=Mo … 7=So).",
    input_schema: obj({ name: { type: "string", minLength: 2, maxLength: 60 }, aufgabe: { type: "string", minLength: 5, maxLength: 1000 }, uhrzeit: { type: "string", description: "HH:MM deutsche Zeit" },
      tage: { type: "string", enum: [...TAGE] }, wochentage: { type: "array", items: { type: "integer", minimum: 1, maximum: 7 } }, dauer_min: { type: "integer", minimum: 5, maximum: 60 } }, ["name", "aufgabe", "uhrzeit"]) },
  { name: "routine_aendern", description: "Gehirn-Routine ändern oder pausieren (aktiv false) bzw. fortsetzen (aktiv true). Nur angegebene Felder ändern sich. Löschen gibt es nicht.",
    input_schema: obj({ id: uuidProp, name: { type: "string" }, aufgabe: { type: "string" }, uhrzeit: { type: "string" }, tage: { type: "string", enum: [...TAGE] },
      wochentage: { type: "array", items: { type: "integer", minimum: 1, maximum: 7 } }, dauer_min: { type: "integer", minimum: 5, maximum: 60 }, aktiv: { type: "boolean" } }, ["id"]) },
  { name: "wissen_liste", description: "Wissens-Notizen des Gehirns (slug, Titel, Quelle, Stand).", input_schema: obj({}) },
  { name: "wissen_lesen", description: "Eine Wissens-Notiz ganz lesen (Markdown).", input_schema: obj({ slug: { type: "string" } }, ["slug"]) },
  { name: "wissen_notieren", description: "Erkenntnis als Wissen speichern (Markdown, kurz, mit Zahlen und Quellen). Gleicher slug = Notiz ergänzen/ersetzen (alte Fassung bleibt als Version).",
    input_schema: obj({ titel: { type: "string", minLength: 2, maxLength: 120 }, markdown: { type: "string", minLength: 1, maxLength: 20000 }, slug: { type: "string", description: "a-z, 0-9, Bindestrich (optional)" } }, ["titel", "markdown"]) },
  { name: "ab_lesen", description: "A/B je Schritt: Trichter der letzten 30 Tage (Quote je Station, Engpass = größter Abfall gegenüber Richtwert) und Tests (Entwurf, laufend, beendet) mit n, Quote und Sicherheit je Variante.", input_schema: obj({}) },
  { name: "ab_test", description: `A/B-Test je Schritt anlegen, starten oder stoppen (nur Webagenturen US/UK/FR). Schritte: ${AB_STEP_KEYS.join(", ")}. Elemente: mail_betreff betreff; mail_einstieg einstieg|frage ({firma} = Firmenname); mail_zeit fenster (frueh|spaet); nachfass tage (3–10)|frage; antwort faq_frage; landing headline|subheadline|cta_label; probe_mail tipp|schluss; probe_nachfrage tage (2–7)|frage; tarif titel|lede; checkout hinweis. Genau EIN Element, B = neuer Wert (A leer = heutiger Stand). Texte in der Sprache des Landes (FR Französisch), ohne Garantien, Druck, Preise oder Zahlen außer 10; Fragen enden mit „?“. Nie Preise, Freigabe, Sperrliste, Abmeldung, Notbremse oder Länderregeln.`,
    input_schema: obj({ aktion: { type: "string", enum: ["anlegen", "starten", "beenden"] }, schritt: { type: "string", enum: [...AB_STEP_KEYS] },
      land: { type: "string", enum: [...AB_COUNTRIES] }, element: { type: "string" }, wert_b: { description: "Variante B (Text, Zahl oder Wahl)" },
      wert_a: { description: "nur wenn A ausdrücklich ein Wert sein soll (sonst heutiger Stand)" }, hypothese: { type: "string", maxLength: 160 },
      id: uuidProp, grund: { type: "string", maxLength: 160 } }, ["aktion"]) },
  { name: ROUTINE_TOOL, description: "Aufgabe an einen Agenten geben (Code, Website, neue Funktion, neue Quelle, Merge, Migration oder alles ohne passendes Werkzeug). Nie für Baukasten-Flows (dafür flow_lesen/flow_speichern). Die Nachricht bleibt offen, der Agent startet beim nächsten Lauf.",
    input_schema: obj({ grund: { type: "string", minLength: 3, maxLength: 300 } }, ["grund"]) },
];
export const TOOL_NAMES = TOOL_DEFS.map((t) => t.name);

export type ToolInput =
  | { name: "kennzahlen"; bereich: Bereich }
  | { name: "postfaecher" | "auftraege" | "flows_liste" | "einstellungen" }
  | { name: "bestand_land"; land: string }
  | { name: "freigabe_gruende"; anzahl: number }
  | { name: "flow_lesen"; flow_id: string }
  | { name: "regler_setzen"; schluessel: ToolSettingKey; wert: unknown }
  | { name: "werk_schalten"; werk: WerkKey; an: boolean }
  | { name: "auftrag_anlegen"; agent: number | null; kind: Kind; market: string | null; brief: string; grund: string | null }
  | { name: "flow_speichern"; flow_id: string; def: Flow; notiz: string; version: string }
  | { name: "werk_starten"; werk: StartKey }
  | { name: "routinen_liste" | "wissen_liste" }
  | { name: "routine_anlegen"; routine: RoutineInput }
  | { name: "routine_aendern"; id: string; patch: Partial<RoutineInput> & { aktiv?: boolean } }
  | { name: "wissen_lesen"; slug: string }
  | { name: "wissen_notieren"; titel: string; markdown: string; slug: string }
  | { name: "an_routine_uebergeben"; grund: string }
  | { name: "ab_lesen" }
  | { name: "ab_test"; aktion: "anlegen"; step: string; country: string; element: string; b: unknown; a: unknown; hypothese: string }
  | { name: "ab_test"; aktion: "starten"; id: string }
  | { name: "ab_test"; aktion: "beenden"; id: string; grund: string };

export type Checked = { ok: true; input: ToolInput } | { ok: false; error: string };
/** Slug einer Wissens-Notiz (wie die Datenbank-Prüfung). */
export const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,79}$/;
/** „Ziele & Grenzen“ → „ziele-grenzen“ (Umlaute ausgeschrieben). */
export function slugify(t: string): string {
  const s = String(t ?? "").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
  return s.length >= 2 ? s : `notiz-${s || "x"}`;
}
/** Aktions-Chip unter einer Antwort (Inhaber: „das dashboard soll es auch zeigen“): kurzer Text + Link. */
export type ActionChip = ChatLink;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** Werkzeug-Eingabe prüfen (vom Modell – nie vertrauen). Unbekanntes Werkzeug, fehlende/ungültige Felder → abgelehnt. */
export function checkTool(name: unknown, input: unknown): Checked {
  const bad = (error: string): Checked => ({ ok: false, error });
  if (typeof name !== "string" || !TOOL_NAMES.includes(name)) return bad("unbekanntes Werkzeug");
  const x = isObj(input) ? input : {};
  switch (name) {
    case "kennzahlen":
      return (BEREICHE as readonly string[]).includes(String(x.bereich)) ? { ok: true, input: { name, bereich: x.bereich as Bereich } } : bad("Bereich unbekannt");
    case "postfaecher": case "auftraege": case "flows_liste": case "einstellungen":
      return { ok: true, input: { name } };
    case "bestand_land": {
      const land = String(x.land ?? "").toUpperCase();
      return (MARKETS as readonly string[]).includes(land) ? { ok: true, input: { name, land } } : bad("Land unbekannt");
    }
    case "freigabe_gruende": {
      const n = x.anzahl === undefined ? 200 : Number(x.anzahl);
      return Number.isInteger(n) && n >= 20 && n <= 500 ? { ok: true, input: { name, anzahl: n } } : bad("anzahl: 20–500");
    }
    case "flow_lesen":
      return typeof x.flow_id === "string" && UUID_RE.test(x.flow_id) ? { ok: true, input: { name, flow_id: x.flow_id.toLowerCase() } } : bad("flow_id ungültig");
    case "regler_setzen": {
      const k = String(x.schluessel ?? "");
      if (!(TOOL_SETTING_KEYS as readonly string[]).includes(k)) return bad("dieser Regler ist für JARVIS gesperrt");
      if (!("wert" in x) || x.wert === null || x.wert === undefined) return bad("wert fehlt");
      return { ok: true, input: { name, schluessel: k as ToolSettingKey, wert: x.wert } };
    }
    case "werk_schalten": {
      const w = String(x.werk ?? "");
      if (!(w in WERK_SWITCHES)) return bad("Werk unbekannt");
      if (typeof x.an !== "boolean") return bad("an: true oder false");
      if (x.an && MAIL_WERKE.includes(w as WerkKey)) return bad("Werke, die Mails schicken, schaltet nur der Inhaber ein");
      return { ok: true, input: { name, werk: w as WerkKey, an: x.an } };
    }
    case "auftrag_anlegen": {
      const agent = x.agent === undefined || x.agent === null ? null : Number(x.agent);
      try {
        const t = validateTask({ agent: agent ?? 1, kind: x.art, market: x.markt ?? "", brief: x.text });
        if (!String(x.text ?? "").trim()) return bad("Auftrag: Text fehlt");
        const grund = String(x.grund ?? "").replace(/\s+/g, " ").trim();
        if (grund.length > 160) return bad("grund: höchstens 160 Zeichen");
        return { ok: true, input: { name, agent: agent === null ? null : t.agent, kind: t.kind, market: t.market, brief: t.brief, grund: grund || null } };
      } catch (e) {
        return bad(e instanceof TaskError ? e.message : "Auftrag ungültig");
      }
    }
    case "flow_speichern": {
      if (typeof x.flow_id !== "string" || !UUID_RE.test(x.flow_id)) return bad("flow_id ungültig");
      if (typeof x.version !== "string" || !x.version.trim() || x.version.length > 64) return bad("version (updated_at aus flow_lesen) fehlt");
      const p = parseFlow(x.def);
      if (!p.ok) return bad(`Flow ungültig: ${p.errors.slice(0, 5).join(" · ")}`);
      const notiz = String(x.notiz ?? "").replace(/\s+/g, " ").trim().slice(0, 300);
      return { ok: true, input: { name, flow_id: x.flow_id.toLowerCase(), def: p.flow, notiz, version: x.version.trim() } };
    }
    case "werk_starten":
      return isStartKey(x.werk) ? { ok: true, input: { name, werk: x.werk } } : bad("dieses Werk lässt sich nicht starten (Versand nie)");
    case "routinen_liste": case "wissen_liste":
      return { ok: true, input: { name } };
    case "routine_anlegen":
      try {
        return { ok: true, input: { name, routine: validateRoutine(x) } };
      } catch (e) {
        return bad(e instanceof RoutineError ? e.message : "Routine ungültig");
      }
    case "routine_aendern": {
      if (typeof x.id !== "string" || !UUID_RE.test(x.id)) return bad("id ungültig");
      const patch: Partial<RoutineInput> & { aktiv?: boolean } = {};
      const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
      if (x.name !== undefined) { const v = clean(x.name); if (v.length < 2 || v.length > 60) return bad("Name: 2–60 Zeichen"); patch.name = v; }
      if (x.aufgabe !== undefined) { const v = clean(x.aufgabe); if (v.length < 5 || v.length > 1000) return bad("Aufgabe: 5–1000 Zeichen"); patch.aufgabe = v; }
      if (x.uhrzeit !== undefined) { const v = normTime(x.uhrzeit); if (!v) return bad("Uhrzeit: HH:MM (deutsche Zeit)"); patch.uhrzeit = v; }
      if (x.tage !== undefined) { if (!(TAGE as readonly string[]).includes(String(x.tage))) return bad("Tage unbekannt"); patch.tage = x.tage as Tage; }
      if (x.wochentage !== undefined) patch.wochentage = normDays(x.wochentage);
      if (x.dauer_min !== undefined) { const d = Number(x.dauer_min); if (!Number.isInteger(d) || d < 5 || d > 60) return bad("Dauer: 5–60 Minuten"); patch.dauer_min = d; }
      if (x.aktiv !== undefined) { if (typeof x.aktiv !== "boolean") return bad("aktiv: true oder false"); patch.aktiv = x.aktiv; }
      if (!Object.keys(patch).length) return bad("nichts zu ändern");
      return { ok: true, input: { name, id: x.id.toLowerCase(), patch } };
    }
    case "wissen_lesen": {
      const slug = String(x.slug ?? "").trim().toLowerCase();
      return SLUG_RE.test(slug) ? { ok: true, input: { name, slug } } : bad("slug ungültig");
    }
    case "wissen_notieren": {
      const titel = String(x.titel ?? "").replace(/\s+/g, " ").trim();
      if (titel.length < 2 || titel.length > 120) return bad("Titel: 2–120 Zeichen");
      const markdown = String(x.markdown ?? "").replace(/\r\n?/g, "\n").trim();
      if (!markdown || markdown.length > 20000) return bad("Text: 1–20000 Zeichen");
      const slug = x.slug === undefined || x.slug === null || x.slug === "" ? slugify(titel) : String(x.slug).trim().toLowerCase();
      if (!SLUG_RE.test(slug)) return bad("slug: a-z, 0-9, Bindestrich (2–80)");
      return { ok: true, input: { name, titel, markdown, slug } };
    }
    case "ab_lesen":
      return { ok: true, input: { name } };
    case "ab_test": {
      // Nur die Form hier; Inhalt (Freigabe-Liste, Element, Texte, ein laufender Test) prüft lib/ab-actions.ts
      const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
      if (x.aktion === "anlegen") {
        const step = clean(x.schritt), country = clean(x.land).toUpperCase(), element = clean(x.element).toLowerCase();
        if (!(AB_STEP_KEYS as readonly string[]).includes(step)) return bad("schritt unbekannt");
        if (!(AB_COUNTRIES as readonly string[]).includes(country)) return bad("land: nur US, UK oder FR");
        if (!/^[a-z_]{2,30}$/.test(element)) return bad("element fehlt");
        if (x.wert_b === undefined || x.wert_b === null || x.wert_b === "") return bad("wert_b fehlt");
        if (typeof x.wert_b === "object" || (x.wert_a !== undefined && x.wert_a !== null && typeof x.wert_a === "object")) return bad("Werte: Text, Zahl oder Wahl");
        const hypothese = clean(x.hypothese);
        if (hypothese.length < 5 || hypothese.length > 160) return bad("hypothese: 5–160 Zeichen");
        return { ok: true, input: { name, aktion: "anlegen", step, country, element, b: x.wert_b, a: x.wert_a ?? null, hypothese } };
      }
      if (x.aktion === "starten" || x.aktion === "beenden") {
        if (typeof x.id !== "string" || !UUID_RE.test(x.id)) return bad("id ungültig");
        if (x.aktion === "starten") return { ok: true, input: { name, aktion: "starten", id: x.id.toLowerCase() } };
        const grund = clean(x.grund);
        if (grund.length < 3 || grund.length > 160) return bad("grund: 3–160 Zeichen");
        return { ok: true, input: { name, aktion: "beenden", id: x.id.toLowerCase(), grund } };
      }
      return bad("aktion: anlegen, starten oder beenden");
    }
    case "an_routine_uebergeben": {
      const g = String(x.grund ?? "").replace(/\s+/g, " ").trim();
      return g.length >= 3 && g.length <= 300 ? { ok: true, input: { name, grund: g } } : bad("grund: 3–300 Zeichen");
    }
  }
  return bad("unbekanntes Werkzeug");
}

/**
 * Flow-Änderung aus dem Chat prüfen – wie scripts/flow_edit.py check (Baukasten-Regeln). Gilt der Flow schon für neue
 * Leads (Master-Pipeline oder Test-Flow im Status „aktiv“), wird nur ein Vorschlag gespeichert (live = true).
 */
export function checkFlowEdit(row: { kind: FlowKind; status: string }, flow: Flow): { live: boolean; warns: string[] } {
  if (row.status === "archiv") throw new FlowEditError("Flow ist archiviert");
  const probs = problems(flow, row.kind);
  const errs = probs.filter((p) => p.level === "error").map((p) => p.msg);
  if (errs.length) throw new FlowEditError(`erst Fehler beheben: ${errs.slice(0, 5).join(" · ")}`);
  const q = flow.nodes.find((n) => n.kind === "quelle");
  const src = q && q.kind === "quelle" ? q.source : null;
  if (row.kind === "master" && src !== "leads") throw new FlowEditError("Master-Pipeline gilt nur für Leads");
  if (row.kind === "test" && row.status === "aktiv") {
    if (!flow.nodes.some((n) => n.kind === "pipeline")) throw new FlowEditError("läuft in der Pipeline – Pipeline-Baustein muss bleiben");
    if (src !== "leads") throw new FlowEditError("Pipeline gilt nur für Leads");
  }
  return { live: row.kind === "master" || row.status === "aktiv", warns: probs.filter((p) => p.level === "warn").map((p) => p.msg) };
}
export class FlowEditError extends Error {}

/** Werkzeug-Ergebnis als Text für die API (höchstens 6000 Zeichen, damit der Kontext klein bleibt). */
export function toolText(x: unknown): string {
  const s = typeof x === "string" ? x : JSON.stringify(x);
  return s.length > 6000 ? `${s.slice(0, 6000)} … (gekürzt)` : s;
}

/** Flow kompakt für den Kontext: Bausteine ohne Position (id, Art, Einstellungen, Bedingungen) und Kanten, ≤ 3000 Zeichen. */
export function compactFlow(def: unknown): string {
  const d = (def && typeof def === "object" ? def : {}) as { nodes?: Record<string, unknown>[]; edges?: Record<string, unknown>[] };
  const nodes = (d.nodes ?? []).slice(0, 40).map((n) => Object.fromEntries(Object.entries(n).filter(([k]) => k !== "x" && k !== "y")));
  const edges = (d.edges ?? []).slice(0, 60).map((e) => `${e.from ?? e.source ?? "?"}→${e.to ?? e.target ?? "?"}${e.port && e.port !== "out" ? `(${e.port})` : ""}`);
  const s = JSON.stringify({ bausteine: nodes, kanten: edges });
  return s.length > 3000 ? `${s.slice(0, 3000)} … (gekürzt – flow_lesen)` : s;
}

/** Antworttext säubern: Ränder weg, höchstens 8000 Zeichen (Grenze von jarvis_messages.body). */
export function cleanReply(t: unknown): string {
  const s = String(t ?? "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s.length > 7900 ? `${s.slice(0, 7900)} …` : s;
}

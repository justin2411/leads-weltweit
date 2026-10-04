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
import { nextRunAt } from "./jarvis-chat.ts";
import { WERK_SWITCHES, type SettingKey, type WerkKey } from "./owner-settings.ts";
import { START_WORKFLOWS, isStartKey, type StartKey } from "./start-queue.ts";

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

/** Kurze ehrliche Antwort, wenn die Routine übernimmt (Code, Website, neue Funktionen …). */
export const routineReply = (now: Date) => `Übernimmt die Routine, startet um ${nextRunAt(now)}.`;

/** Hinweis, wenn keine Sofort-Antwort möglich ist (Nachricht bleibt für die Routine offen). */
export function fallbackHint(reason: "kein_schluessel" | "budget" | "fehler" | "zeit", now: Date): string {
  const at = nextRunAt(now);
  if (reason === "kein_schluessel") return `Sofort-Antwort aus – Schlüssel fehlt, Routine antwortet um ${at}.`;
  if (reason === "budget") return `API-Grenze für diesen Monat erreicht – die Routine antwortet um ${at}.`;
  if (reason === "zeit") return `Dauert länger – die Routine übernimmt um ${at}.`;
  return `Sofort-Antwort gerade nicht möglich – die Routine antwortet um ${at}.`;
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
const RULES = [
  "Du bist JARVIS, der Assistent im Dashboard von Signalwerk (B2B-Leads mit Anlass, Käufer: Webagenturen in US, UK, FR).",
  "Du schreibst mit dem Inhaber Justin. Immer Deutsch, du-Form, einfache Worte.",
  "Sehr kurz (Inhaber: „wenig Text überall“): höchstens 3 Sätze, am besten ein kurzer Titel und 1 Satz. Details nur, wenn er nachfragt. Kein Markdown außer höchstens 3 kurzen Listenpunkten.",
  "Uhrzeiten immer in deutscher Zeit (Europe/Berlin), nie UTC.",
  "Nur echte Zahlen aus dem Kontext oder aus Werkzeugen – nie erfinden, nie schönen. Unbekannt = ehrlich sagen.",
  "Nie: Mails/Versand auslösen oder einschalten, Sperrliste, Drei-Stufen-Freigabe, Notbremse oder Abmeldung ändern, Daten löschen, Geld ausgeben, Preise oder Beträge in Kundenmails.",
].join("\n");

/** System-Text für Haiku (Weiche + einfache Antworten). */
export function haikuSystem(context: string): string {
  return `${RULES}

Entscheide bei jeder Nachricht:
(a) Einfache Frage, die du sicher aus dem KONTEXT unten beantworten kannst, oder Gruß/Dank → direkt kurz antworten.
(b) Braucht Zahlen, die nicht im Kontext stehen, eine Änderung (Regler, Werk an/aus, Auftrag an einen Agenten, Baukasten-Flow, Werk starten) oder gründliches Nachdenken → antworte NUR mit {"route":"opus"}
(c) Wunsch nach Code-, Website- oder Seitenänderung, neuer Funktion, neuer Quelle, Merge oder Migration → antworte NUR mit {"route":"routine"}
Im Zweifel {"route":"opus"}.

KONTEXT (jetzt):
${context}`;
}

/** System-Text für Opus (Werkzeuge). */
export function opusSystem(context: string): string {
  return `${RULES}

Du hast Werkzeuge: lesende Abfragen und wenige sichere Änderungen (Regler, Werk an/aus, Auftrag an Agent 1–8, Baukasten-Flow speichern, Werk-Start). Nutze sie statt zu raten.
Code, Website, Seiten, neue Funktionen, neue Quellen, Merges, Migrationen oder alles, was kein Werkzeug kann: rufe an_routine_uebergeben auf (die Routine macht das).
Lehnt ein Werkzeug ab, sag den Grund kurz. Nach einer Änderung: was geändert wurde, in einem Satz.

KONTEXT (jetzt):
${context}`;
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
  { name: "auftrag_anlegen", description: `Auftrag an einen Agenten (1–${AGENT_COUNT}; ohne Angabe der erste freie). Arten: leads, kaeufer, quelle, pruefen, frage. Für größere Arbeiten an Daten/Werken.`,
    input_schema: obj({ agent: { type: "integer", minimum: 1, maximum: AGENT_COUNT }, art: { type: "string", enum: [...OWNER_KINDS] }, markt: { type: "string", enum: [...MARKETS] }, text: { type: "string", minLength: 3, maxLength: 1000 } }, ["art", "text"]) },
  { name: "flow_speichern", description: "Baukasten-Flow speichern (Format wie flow_lesen.def: {v:1,nodes,edges}). Test-/Agenten-Flows direkt; Master-Pipeline und Flows in der Pipeline nur als Vorschlag (Inhaber klickt „Übernehmen“). Bestehende Bausteine behalten, neue rechts daneben. version = updated_at aus flow_lesen.",
    input_schema: obj({ flow_id: uuidProp, def: { type: "object" }, notiz: { type: "string", maxLength: 300 }, version: { type: "string" } }, ["flow_id", "def", "version"]) },
  { name: "werk_starten", description: "Ein Werk jetzt starten (nie Versand): lead-werk, kunden-werk, proben-vorrat, freigabe-stichprobe.",
    input_schema: obj({ werk: { type: "string", enum: Object.keys(START_WORKFLOWS) } }, ["werk"]) },
  { name: ROUTINE_TOOL, description: "Aufgabe an die JARVIS-Routine geben (Code, Website, neue Funktion, neue Quelle, Merge, Migration oder alles ohne passendes Werkzeug). Die Nachricht bleibt offen, die Routine startet beim nächsten Lauf.",
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
  | { name: "auftrag_anlegen"; agent: number | null; kind: Kind; market: string | null; brief: string }
  | { name: "flow_speichern"; flow_id: string; def: Flow; notiz: string; version: string }
  | { name: "werk_starten"; werk: StartKey }
  | { name: "an_routine_uebergeben"; grund: string };

export type Checked = { ok: true; input: ToolInput } | { ok: false; error: string };
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
        return { ok: true, input: { name, agent: agent === null ? null : t.agent, kind: t.kind, market: t.market, brief: t.brief } };
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

/** Antworttext säubern: Ränder weg, höchstens 8000 Zeichen (Grenze von jarvis_messages.body). */
export function cleanReply(t: unknown): string {
  const s = String(t ?? "").replace(/\r\n?/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
  return s.length > 7900 ? `${s.slice(0, 7900)} …` : s;
}

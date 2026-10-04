/**
 * Agenten (Inhaber 03.10.2026: „einzelne agenten nutzen … ich beauftrage agent 1 neue leads zu holen für den markt“).
 * Reine Funktionen: Arten, Märkte, Prüfung eines Auftrags. Ausgeführt werden Aufträge von der stündlichen
 * Claude-Sitzung „Agenten“ (docs/AGENTEN.md) – immer innerhalb von CLAUDE.md (kein Versand, keine Kosten,
 * keine Regeln aufweichen).
 */
import type { IconName } from "../app/icons";

/** Agenten des Inhabers A1–A8 (Inhaber 04.10.2026: „nicht nur 4 freie agenten … sondern 8“); 9 = Kunden-Agenten. */
export const AGENT_COUNT = 8;
/** icon = Name eines Linien-Icons (app/icons.tsx), gerendert mit <Icon name=…/> – keine Emojis/Glyphen. */
export const KINDS = {
  leads: { label: "Leads holen", icon: "lead-werk", hint: "mehr Leads für einen Markt" },
  kaeufer: { label: "Käufer finden", icon: "kaeufer", hint: "mehr mail-fähige Webagenturen" },
  quelle: { label: "Neue Quelle", icon: "neu", hint: "neue kostenlose Quelle suchen und testen" },
  pruefen: { label: "Prüfen", icon: "tagescheck", hint: "Stichprobe/Qualität kontrollieren" },
  frage: { label: "Frage", icon: "frage", hint: "Auswertung oder Antwort" },
  // Kunden-Agenten (Inhaber 04.10.2026, docs/KUNDEN-AGENTEN.md): Kundenantworten und Inhaber-Hinweise an einen
  // Kunden-Agenten. Entstehen nur über Kunden-Agenten (Dashboard/antworten.yml), nicht über das Auftragsformular.
  kunde: { label: "Kunde", icon: "ansprechpartner", hint: "Kunden-Agent: Ziele aufnehmen, Antwort schreiben" },
  // Website-Agenten (Inhaber 04.10.2026, /dashboard/website): entstehen nur über scripts/website_agents.py faellig
  website: { label: "Website", icon: "website", hint: "Website-Agent: Seite prüfen und sauber halten" },
} as const satisfies Record<string, { label: string; icon: IconName; hint: string }>;
export type Kind = keyof typeof KINDS;
/** Arten, die der Inhaber im Auftragsformular, im Chat und im Baukasten wählt („kunde“ nur über Kunden-Agenten,
 *  „website“ nur über Website-Agenten). */
export const OWNER_KINDS = (Object.keys(KINDS) as Kind[]).filter((k) => k !== "kunde" && k !== "website");
export const MARKETS = ["US", "UK", "FR", "IE", "NL", "BE", "SE"] as const;

export type AgentTask = {
  id: string; created_at: string; agent: number; kind: Kind; market: string | null; brief: string;
  status: "offen" | "laeuft" | "fertig" | "fehler" | "abgebrochen"; progress: number; step: string | null; result: string | null;
  numbers: Record<string, number>; started_at: string | null; finished_at: string | null; created_by?: string | null;
};
/** Absender von Chat-Aufträgen (JARVIS-Chat) – die Agenten-Runde bearbeitet sie zuerst (docs/AGENTEN.md). */
export const CHAT_BY = "JARVIS-Chat";

export class TaskError extends Error {}

/** Auftrag aus dem Formular prüfen: Agent 1–8, bekannte Art, Markt optional aus der Liste, Text 3–1000 Zeichen. */
export function validateTask(f: { agent?: unknown; kind?: unknown; market?: unknown; brief?: unknown }) {
  const agent = Number(f.agent);
  if (!Number.isInteger(agent) || agent < 1 || agent > AGENT_COUNT) throw new TaskError("Agent wählen");
  const kind = String(f.kind ?? "") as Kind;
  if (!(OWNER_KINDS as readonly string[]).includes(kind)) throw new TaskError("Art wählen");
  const m = String(f.market ?? "").trim().toUpperCase();
  const market = m === "" || m === "ALLE" ? null : m;
  if (market && !(MARKETS as readonly string[]).includes(market)) throw new TaskError("Markt unbekannt");
  const brief = String(f.brief ?? "").trim().replace(/\s+/g, " ") || `${KINDS[kind].label}${market ? ` ${market}` : ""}`;
  if (brief.length < 3 || brief.length > 1000) throw new TaskError("Auftrag: 3–1000 Zeichen");
  return { agent, kind, market, brief };
}

/** Aktueller Zustand je Agent: laufender Auftrag, sonst nächster offener, sonst zuletzt fertiger. */
export function agentBoard(tasks: AgentTask[]) {
  return Array.from({ length: AGENT_COUNT }, (_, i) => {
    const mine = tasks.filter((t) => t.agent === i + 1);
    const run = mine.find((t) => t.status === "laeuft");
    const open = mine.filter((t) => t.status === "offen").sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const done = mine.filter((t) => t.status === "fertig" || t.status === "fehler").sort((a, b) => ((a.finished_at ?? "") < (b.finished_at ?? "") ? 1 : -1));
    return { n: i + 1, current: run ?? open[0] ?? done[0] ?? null, queued: open.length - (run ? 0 : open.length ? 1 : 0), done: done.length };
  });
}

// ------------------------------------------------------------------------------------------- Schlau vorbelegen
// Inhaber 04.10.2026: „wenn ich den auftrag einem agenten gebe, er soll uk käufer finden warum ist dann unten markt nicht
// direkt UK ausgewählt? … jarvis soll schlau sein und mir die arbeit so einfach wie möglich machen“.

/** Ländernamen und Kürzel je Markt. Kürzel nur in Großbuchstaben („us“, „be“, „se“ sind normale Wörter) – außer „uk“/„gb“ (kein normales Wort, Inhaber schreibt „uk käufer finden“). */
const MARKET_NAMES: Record<string, { code: RegExp; words: RegExp }> = {
  US: { code: /US|USA/, words: /usa|amerika|vereinigten? staaten|united states|vereinigte staaten/ },
  UK: { code: /UK|GB/, words: /uk|gb|england|gro(?:ß|ss)britannien|britain|united kingdom|vereinigte[ns]? königreich|schottland|wales/ },
  FR: { code: /FR/, words: /frankreich|france|französisch/ },
  IE: { code: /IE/, words: /irland|ireland|irisch/ },
  NL: { code: /NL/, words: /niederlande|holland|netherlands|niederländisch/ },
  BE: { code: /BE/, words: /belgien|belgium|belgisch/ },
  SE: { code: /SE/, words: /schweden|sweden|schwedisch/ },
};
const edge = (r: RegExp, flags: string) => new RegExp(`(?<![\\p{L}\\d])(?:${r.source})(?![\\p{L}\\d])`, `${flags}u`);
const MARKET_RX = Object.entries(MARKET_NAMES).map(([m, x]) => ({ m, code: edge(x.code, ""), words: edge(x.words, "i") }));

/** Fragen: W-Wort am Anfang, oder „?“ am Ende ohne Bitte („Kannst du … finden?“ ist ein Auftrag). */
const QUESTION = /^(warum|wieso|weshalb|wie|was|wann|wo|wohin|woher|welche[rsmn]?|wer|wieviele?|why|how|what|which|when|where)(?![\p{L}])/iu;
const REQUEST = /^(kannst|könntest|kann|würdest|bitte|mach|hol|such|finde|prüf|starte?|gib)/i;
/** Art aus Schlagworten, in dieser Reihenfolge (erstes Treffer-Wort gewinnt). */
const KIND_WORDS: [Kind, RegExp][] = [
  ["kaeufer", /käufer|kaeufer|kunden finden|neue kunden|buyers?|prospects?/i],
  ["quelle", /quelle|datenquelle|register|source/i],
  ["pruefen", /prüf|pruef|kontroll|stichprobe|check|fehler/i],
  ["leads", /leads?\b|firmen ohne website/i],
  ["kaeufer", /agenturen|agentur|agenc/i], // „Leads für Webagenturen“ bleibt Leads (oben)
];

/**
 * Art und Markt aus Freitext erkennen (reine Funktion): „UK Käufer finden“ → kaeufer · UK, „Warum keine Antworten in
 * Frankreich?“ → frage · FR. Unbekanntes bleibt null; mehrere Märkte → der zuerst genannte.
 */
export function inferTask(text: string): { kind: Kind | null; market: string | null } {
  const t = String(text ?? "").trim();
  let market: string | null = null, at = Infinity;
  for (const { m, code, words } of MARKET_RX) {
    for (const rx of [code, words]) {
      const i = t.search(rx);
      if (i >= 0 && i < at) { at = i; market = m; }
    }
  }
  let kind: Kind | null = null;
  if (QUESTION.test(t) || (/\?\s*$/.test(t) && !REQUEST.test(t))) kind = "frage";
  else for (const [k, rx] of KIND_WORDS) if (rx.test(t)) { kind = k; break; }
  return { kind, market };
}

const isKind = (k: unknown): k is Kind => typeof k === "string" && (OWNER_KINDS as string[]).includes(k);
const isMarket = (m: unknown): m is string => typeof m === "string" && (MARKETS as readonly string[]).includes(m.toUpperCase());

/**
 * Vorbelegung des Auftragsformulars: 1. ausdrücklich übergeben (Hinweis „an Agent geben“: k, m, b), 2. aus dessen Text
 * erkannt, 3. laufender/offener/letzter Auftrag dieses Agenten (bei „Neuer Auftrag“: der neueste überhaupt), Markt
 * notfalls aus dessen Text, 4. Standard (Leads holen, alle Märkte).
 */
export function formDefaults(o: { tasks: AgentTask[]; agent: number | null; kind?: unknown; market?: unknown; brief?: unknown }) {
  const brief = typeof o.brief === "string" ? o.brief.slice(0, 1000) : "";
  const said = inferTask(brief);
  const latest = [...o.tasks].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null;
  const prev = o.agent ? agentBoard(o.tasks)[o.agent - 1]?.current ?? null : latest;
  const prevSaid = prev ? inferTask(prev.brief) : { kind: null, market: null };
  const kind: Kind = isKind(o.kind) ? o.kind : said.kind ?? prev?.kind ?? "leads";
  const market = isMarket(o.market) ? (o.market as string).toUpperCase() : said.market ?? prev?.market ?? prevSaid.market ?? null;
  return { agent: o.agent ?? freeAgent(o.tasks), kind, market, brief };
}

/** Minuten der JARVIS-Runden (Inhaber 04.10.2026: viermal pro Stunde, :08, :23, :38, :53 deutsche Zeit). */
export const AGENT_MINUTES = [8, 23, 38, 53];

/** Minute-Stunde in Europe/Berlin (MEZ/MESZ) – über Intl, damit Sommer-/Winterzeit stimmt. */
function berlinParts(d: Date): { h: number; m: number } {
  const p = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  return { h: Number(p.find((x) => x.type === "hour")?.value), m: Number(p.find((x) => x.type === "minute")?.value) };
}

/**
 * Nächster Start der JARVIS-Runde nach `now` (streng später): die nächste volle Minute, deren Berliner Minute in
 * AGENT_MINUTES liegt. Für „startet um HH:MM“ statt „wartet“ (Agenten-Leiste, Auftragsfenster, Status).
 */
export function nextAgentRun(now: Date): Date {
  const t = Math.floor(now.getTime() / 60_000) * 60_000 + 60_000; // nächste volle Minute
  for (let i = 0; i < 24 * 60; i++) {
    const d = new Date(t + i * 60_000);
    if (AGENT_MINUTES.includes(berlinParts(d).m)) return d;
  }
  return new Date(t);
}
/** @deprecated Name vor 04.10.2026 – gleich nextAgentRun. */
export const nextAgentRound = nextAgentRun;

/** „startet um 09:53“-Uhrzeit (deutsche Zeit) der nächsten Runde. */
export function agentStartLabel(now: Date): string {
  const { h, m } = berlinParts(nextAgentRun(now));
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Erster Agent ohne laufenden oder offenen Auftrag, sonst Agent 1. */
export function freeAgent(tasks: AgentTask[]): number {
  for (let n = 1; n <= AGENT_COUNT; n++) if (!tasks.some((t) => t.agent === n && (t.status === "offen" || t.status === "laeuft"))) return n;
  return 1;
}

/** Chat-Nachricht → fertiger Auftrag (für validateTask): Art/Markt erkannt, sonst „Frage“ (nur auswerten, nichts ändern). */
export function chatTask(text: unknown, tasks: AgentTask[]) {
  const brief = String(text ?? "").trim().replace(/\s+/g, " ");
  const { kind, market } = inferTask(brief);
  return { agent: freeAgent(tasks), kind: kind ?? "frage", market, brief };
}

export type ChatLine = { id: string; at: string; text: string; kind: Kind; market: string | null; status: AgentTask["status"]; reply: string; agent: number };

/** Gesprächsverlauf der letzten Chat-Aufträge (älteste oben): Frage des Inhabers und JARVIS-Antwort aus Status/Ergebnis. */
export function chatThread(tasks: AgentTask[], n = 6, startAt?: string): ChatLine[] {
  return tasks.filter((t) => t.created_by === CHAT_BY).sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, n).reverse().map((t) => ({
    id: t.id, at: t.created_at, text: t.brief, kind: t.kind, market: t.market, status: t.status, agent: t.agent,
    reply: t.status === "offen" ? `Notiert für Agent ${t.agent} – ${startAt ? `startet um ${startAt}` : "Antwort mit der nächsten Agenten-Runde"}.`
      : t.status === "laeuft" ? `Agent ${t.agent} arbeitet daran (${t.progress} %)${t.step ? ` · ${t.step}` : ""}.`
      : t.status === "abgebrochen" ? "Zurückgezogen."
      : t.result?.trim() || (t.status === "fehler" ? "Konnte ich nicht erledigen." : "Erledigt."),
  }));
}

/**
 * Paket „Website“ im Dashboard (Inhaber 04.10.2026: „die website als themenfeld mit aufzunehmen … agenten erstellen …,
 * die anpassungen an der website übernehmen und schauen das man dort auch immer alles sauber macht … chatfeld, dass ich
 * änderungswünsche direkt dort posten kann“). Reine Funktionen ohne Server-/React-Abhängigkeiten:
 *  - Website-Gesundheit: Bereiche, Ampel je Bereich, Gesamtwert, Funde je Bereich (Daten: signalwerk.website_checks,
 *    geschrieben von scripts/website_check.py)
 *  - Website-Agenten: Vorlagen, Eingabeprüfung, Fälligkeit (gleiche Regeln wie scripts/website_agents.py)
 */
import type { IconName } from "../app/icons";

// ------------------------------------------------------------------------------------------------- Gesundheit
export const AREAS = [
  { key: "erreichbar", label: "Erreichbarkeit", short: "Online", icon: "land" },
  { key: "fehler", label: "Fehler & 404", short: "Fehler", icon: "link-kaputt" },
  { key: "tempo", label: "Tempo", short: "Tempo", icon: "tempo" },
  { key: "handy", label: "Handy", short: "Handy", icon: "handy" },
  { key: "recht", label: "Rechtstexte", short: "Recht", icon: "recht" },
  { key: "formulare", label: "Probe-Formular", short: "Formular", icon: "formular" },
  { key: "texte", label: "Texte", short: "Texte", icon: "text" },
] as const satisfies readonly { key: string; label: string; short: string; icon: IconName }[];
export type AreaKey = (typeof AREAS)[number]["key"];
export type Level = "rot" | "gelb" | "info";
export type Tone = "gruen" | "gelb" | "rot" | "leer";
/** Lösungsvorschlag aus scripts/website_check.py `suggest`: eine Zeile, alter/neuer Text, auto = JARVIS darf allein. */
export type Suggestion = { text: string; alt?: string; neu?: string; auto: boolean };
export type Finding = { bereich: AreaKey; stufe: Level; text: string; pfad?: string; key: string; vorschlag?: Suggestion };
export type SiteCheck = { at: string; site: string; scores: Partial<Record<AreaKey, number | null>>; funde: Finding[]; seiten: number };

const AREA_KEYS = AREAS.map((a) => a.key) as AreaKey[];
const isArea = (x: unknown): x is AreaKey => typeof x === "string" && (AREA_KEYS as string[]).includes(x);
const LEVEL_ORDER: Record<Level, number> = { rot: 0, gelb: 1, info: 2 };

/** Datenbank-Zeile → Check (unbekannte Werte werden sicher gemacht, Punkte 0–100 oder null). */
export function toCheck(x: Record<string, unknown> | null | undefined): SiteCheck | null {
  if (!x) return null;
  const raw = (x.scores && typeof x.scores === "object" ? x.scores : {}) as Record<string, unknown>;
  const scores: SiteCheck["scores"] = {};
  for (const k of AREA_KEYS) {
    const v = raw[k];
    scores[k] = typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(100, Math.round(v))) : null;
  }
  const funde: Finding[] = [];
  for (const f of Array.isArray(x.funde) ? x.funde : []) {
    if (!f || typeof f !== "object") continue;
    const r = f as Record<string, unknown>;
    if (!isArea(r.bereich)) continue;
    const stufe: Level = r.stufe === "rot" || r.stufe === "gelb" ? r.stufe : "info";
    const text = String(r.text ?? "").trim().slice(0, 160);
    if (!text) continue;
    const pfad = typeof r.pfad === "string" && r.pfad.startsWith("/") ? r.pfad.slice(0, 200) : undefined;
    const key = isFindingKey(r.key) ? r.key : findingKey(r.bereich, text, pfad);
    const vorschlag = toSuggestion(r.vorschlag);
    const out: Finding = { bereich: r.bereich, stufe, text, key };
    if (pfad) out.pfad = pfad;
    if (vorschlag) out.vorschlag = vorschlag;
    funde.push(out);
  }
  return { at: String(x.at ?? ""), site: String(x.site ?? ""), scores, funde, seiten: Number(x.seiten) || 0 };
}

const KEY_RE = /^[a-z]+:[a-z0-9_]+:(\/[^\s]{0,199})?$/;
/** Fund-Schlüssel wie scripts/website_check.py `finding_key` (Bereich:Art:Pfad). */
export const isFindingKey = (x: unknown): x is string => typeof x === "string" && x.length <= 240 && KEY_RE.test(x);

/** Ersatz-Schlüssel für ältere Checks ohne `key`: Art aus dem Text ohne Zahlen. */
export function findingKey(bereich: AreaKey, text: string, pfad?: string): string {
  const art = text.toLowerCase().replace(/[(:„].*$/, "").normalize("NFKD").replace(/[^a-z]+/g, "_").replace(/^_|_$/g, "").slice(0, 30) || "allgemein";
  return `${bereich}:${art}:${pfad ?? ""}`;
}

function toSuggestion(x: unknown): Suggestion | undefined {
  if (!x || typeof x !== "object") return undefined;
  const r = x as Record<string, unknown>;
  const clip = (v: unknown, n: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, n) : "");
  const text = clip(r.text, 120);
  if (!text) return undefined;
  const out: Suggestion = { text, auto: r.auto === true };
  const alt = clip(r.alt, 160), neu = clip(r.neu, 160);
  if (alt) out.alt = alt;
  if (neu) out.neu = neu;
  return out;
}

/** Ampel aus Punkten: ab 90 grün, ab 70 gelb, darunter rot; ein roter Fund macht den Bereich immer rot. */
export function toneOf(score: number | null | undefined, hasRed = false): Tone {
  if (score === null || score === undefined) return "leer";
  if (hasRed || score < 70) return "rot";
  return score >= 90 ? "gruen" : "gelb";
}

export function areaTone(c: SiteCheck | null, area: AreaKey): Tone {
  if (!c) return "leer";
  return toneOf(c.scores[area], c.funde.some((f) => f.bereich === area && f.stufe === "rot"));
}

/** Gesamtwert: Mittel der geprüften Bereiche (gerundet), nichts geprüft → null. */
export function totalScore(c: SiteCheck | null): number | null {
  if (!c) return null;
  const v = AREA_KEYS.map((k) => c.scores[k]).filter((x): x is number => typeof x === "number");
  return v.length ? Math.round(v.reduce((a, b) => a + b, 0) / v.length) : null;
}

/** Funde eines Bereichs: rot zuerst, dann gelb, dann Hinweise; höchstens `max`. */
export function findingsFor(c: SiteCheck | null, area: AreaKey, max = 8): Finding[] {
  if (!c) return [];
  return c.funde.filter((f) => f.bereich === area).sort((a, b) => LEVEL_ORDER[a.stufe] - LEVEL_ORDER[b.stufe]).slice(0, max);
}

/** Zähler für die Kopfzeile: rote und gelbe Funde. */
export function countLevels(c: SiteCheck | null): { rot: number; gelb: number } {
  const f = c?.funde ?? [];
  return { rot: f.filter((x) => x.stufe === "rot").length, gelb: f.filter((x) => x.stufe === "gelb").length };
}

/** Kreisbogen für den Ring: Umfang und Strich-Versatz für einen Wert 0–100 (leer = voller Versatz). */
export function ringDash(score: number | null | undefined, r: number): { c: number; off: number } {
  const c = 2 * Math.PI * r;
  const v = typeof score === "number" ? Math.max(0, Math.min(100, score)) : 0;
  return { c: Math.round(c * 100) / 100, off: Math.round(c * (1 - v / 100) * 100) / 100 };
}

// ------------------------------------------------------------------------------------------------- Agenten
export type Rhythmus = "taeglich" | "woechentlich" | "einmal";
export const RHYTHMUS: Record<Rhythmus, string> = { taeglich: "täglich", woechentlich: "wöchentlich", einmal: "einmal" };
export type WebsiteAgent = {
  id: string; name: string; aufgabe: string; rhythmus: Rhythmus; aktiv: boolean; last_run_at: string | null;
  last_task_id: string | null; last_result: string | null; created_at: string;
};
export type TaskStatus = "offen" | "laeuft" | "fertig" | "fehler" | "abgebrochen";

/** Vorlagen für „Agent anlegen“ (ein Klick füllt Name, Aufgabe, Rhythmus). */
export const TEMPLATES: { name: string; aufgabe: string; rhythmus: Rhythmus; icon: IconName }[] = [
  { name: "Fehler & Links", aufgabe: "Kaputte Links, 404 und Fehlerseiten finden und reparieren.", rhythmus: "taeglich", icon: "link-kaputt" },
  { name: "Tempo & Handy", aufgabe: "Ladezeit und Handy-Ansicht prüfen und langsame Seiten schneller machen.", rhythmus: "woechentlich", icon: "tempo" },
  { name: "Rechtstexte aktuell", aufgabe: "Impressum, Datenschutz und AGB auf Platzhalter und Lücken prüfen, nur melden.", rhythmus: "woechentlich", icon: "recht" },
  { name: "Texte kurz & sauber", aufgabe: "Überschriften und Texte kürzen, ohne Satzzeichen in Überschriften und ohne Gedankenstriche.", rhythmus: "woechentlich", icon: "text" },
  { name: "Landingpages prüfen", aufgabe: "Alle Live-Landingpages auf Probe-Formular, Titel und Beschreibung prüfen.", rhythmus: "taeglich", icon: "formular" },
];

export const NAME_MIN = 2, NAME_MAX = 40, TASK_MIN = 5, TASK_MAX = 240;
export class WebsiteInputError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isAgentId = (x: unknown): x is string => typeof x === "string" && UUID_RE.test(x);

/** Formular „Agent anlegen“ prüfen: Name 2–40, Aufgabe eine Zeile 5–240 Zeichen, Rhythmus aus der Liste. */
export function validateAgent(f: { name?: unknown; aufgabe?: unknown; rhythmus?: unknown }): { name: string; aufgabe: string; rhythmus: Rhythmus } {
  const name = String(f.name ?? "").replace(/\s+/g, " ").trim();
  if (name.length < NAME_MIN || name.length > NAME_MAX) throw new WebsiteInputError(`Name: ${NAME_MIN} bis ${NAME_MAX} Zeichen`);
  const aufgabe = String(f.aufgabe ?? "").replace(/\s+/g, " ").trim();
  if (aufgabe.length < TASK_MIN || aufgabe.length > TASK_MAX) throw new WebsiteInputError(`Aufgabe: ${TASK_MIN} bis ${TASK_MAX} Zeichen`);
  const r = String(f.rhythmus ?? "");
  if (!(r in RHYTHMUS)) throw new WebsiteInputError("Rhythmus wählen");
  return { name, aufgabe, rhythmus: r as Rhythmus };
}

/** Datenbank-Zeile → Agent. */
export function toAgent(x: Record<string, unknown>): WebsiteAgent {
  const r = String(x.rhythmus ?? "");
  return {
    id: String(x.id), name: String(x.name ?? "") || "Agent", aufgabe: String(x.aufgabe ?? ""),
    rhythmus: (r in RHYTHMUS ? r : "woechentlich") as Rhythmus, aktiv: x.aktiv !== false,
    last_run_at: (x.last_run_at as string | null) ?? null, last_task_id: (x.last_task_id as string | null) ?? null,
    last_result: (x.last_result as string | null) ?? null, created_at: String(x.created_at ?? ""),
  };
}

const HOUR = 3_600_000;
const INTERVAL: Partial<Record<Rhythmus, number>> = { taeglich: 24 * HOUR, woechentlich: 7 * 24 * HOUR };
const SLACK = HOUR;

/** Fällig? Gleiche Regeln wie scripts/website_agents.py `due`. */
export function isDue(a: Pick<WebsiteAgent, "aktiv" | "rhythmus" | "last_run_at" | "last_task_id">, now: Date, taskStatus?: TaskStatus | null): boolean {
  if (!a.aktiv) return false;
  if (taskStatus === "offen" || taskStatus === "laeuft") return false;
  const last = a.last_run_at ? new Date(a.last_run_at).getTime() : null;
  if (a.rhythmus === "einmal") return last === null && !a.last_task_id;
  const iv = INTERVAL[a.rhythmus];
  if (!iv) return false;
  return last === null || Number.isNaN(last) || now.getTime() - last >= iv - SLACK;
}

/** Nächster Auftrag (frühestens) – null bei „einmal“ (schon gelaufen) oder ausgeschaltet. */
export function nextDue(a: Pick<WebsiteAgent, "aktiv" | "rhythmus" | "last_run_at" | "last_task_id">): Date | null {
  if (!a.aktiv) return null;
  const iv = INTERVAL[a.rhythmus];
  if (!iv) return null;
  if (!a.last_run_at) return null;
  const t = new Date(a.last_run_at).getTime();
  return Number.isNaN(t) ? null : new Date(t + iv - SLACK);
}

const TZ = "Europe/Berlin";
const hm = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
const dayKey = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);

/** Zeit kurz in deutscher Zeit: heute „14:05“, morgen „morgen 06:20“, sonst „Mo 06:20“ bzw. „03.10. 14:05“. */
export function shortTime(d: Date, now: Date): string {
  if (dayKey(d) === dayKey(now)) return hm(d);
  if (dayKey(d) === dayKey(new Date(now.getTime() + 24 * HOUR))) return `morgen ${hm(d)}`;
  const diff = d.getTime() - now.getTime();
  if (diff > 0 && diff < 6 * 24 * HOUR) return `${new Intl.DateTimeFormat("de-DE", { timeZone: TZ, weekday: "short" }).format(d).replace(".", "")} ${hm(d)}`;
  return `${new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d)} ${hm(d)}`;
}

/** Zustand eines Agenten für die Karte. startAt = nächste Agenten-Runde („HH:MM“). */
export function agentState(a: WebsiteAgent, task: { status: TaskStatus } | null, now: Date, startAt: string): { text: string; tone: "aus" | "wait" | "work" | "ok" | "bad" } {
  if (!a.aktiv) return { text: "aus", tone: "aus" };
  if (task?.status === "laeuft") return { text: "in Arbeit", tone: "work" };
  if (task?.status === "offen") return { text: `startet um ${startAt}`, tone: "wait" };
  if (isDue(a, now, task?.status ?? null)) return { text: "wird beauftragt", tone: "wait" };
  const n = nextDue(a);
  if (n) return { text: `nächster Lauf ${shortTime(n, now)}`, tone: task?.status === "fehler" ? "bad" : "ok" };
  return { text: "erledigt", tone: task?.status === "fehler" ? "bad" : "ok" };
}

/** Feste Sitzung des Chatfelds „Änderungswunsch“ (jarvis_sessions kind 'website'). */
export const WEBSITE_SESSION_TITLE = "Website";

// ------------------------------------------------------------------------------------------------- Funde beheben
/**
 * Funde direkt beheben (Inhaber 04.10.2026: „direkt anpassungen machen … mit lösungsvorschlägen, jarvis soll das aber
 * eigentlich alles selber machen und entscheiden“): Knopf „Beheben“ = Auftrag (agent_tasks kind 'website') + Eintrag in
 * website_fixes; „Ignorieren“ blendet einen Fund 30 Tage aus (owner_settings.website_ignored, nichts gelöscht).
 * Auto-Fix (owner_settings.website_autofix) macht dasselbe selbst: scripts/website_agents.py autofix.
 */
export const IGNORE_DAYS = 30;
export const IGNORE_MAX = 200;
export type FixQuelle = "inhaber" | "auto";
export type WebsiteFix = { id: string; created_at: string; task_id: string | null; pfad: string | null; keys: string[]; quelle: FixQuelle; behoben_at: string | null };
export type FixView = { text: string; tone: "wait" | "work" | "ok" | "bad"; canFix: boolean };

const LEGAL_PATHS = ["/impressum", "/datenschutz", "/agb", "/privacy", "/terms", "/mentions-legales", "/confidentialite", "/cgv"];
/** Rechtstexte nie per Knopf/Auto-Fix (nur der Inhaber mit genauer Vorgabe im Chat). */
export const isLegalFinding = (f: Pick<Finding, "bereich" | "pfad">) => f.bereich === "recht" || LEGAL_PATHS.includes(f.pfad ?? "");
export const canFixFinding = (f: Finding) => !isLegalFinding(f);

export function toFix(x: Record<string, unknown>): WebsiteFix {
  return {
    id: String(x.id), created_at: String(x.created_at ?? ""), task_id: (x.task_id as string | null) ?? null,
    pfad: typeof x.pfad === "string" ? x.pfad : null, keys: Array.isArray(x.keys) ? x.keys.filter(isFindingKey) : [],
    quelle: x.quelle === "auto" ? "auto" : "inhaber", behoben_at: (x.behoben_at as string | null) ?? null,
  };
}

/** Ist der Fund (noch) ausgeblendet? */
export function isIgnored(key: string, ignored: Record<string, string> | null | undefined, now: Date): boolean {
  const until = ignored?.[key];
  const t = until ? new Date(until).getTime() : NaN;
  return Number.isFinite(t) && t > now.getTime();
}

/** Neuer Wert von website_ignored: Fund 30 Tage ausblenden, abgelaufene Einträge fallen weg, höchstens 200. */
export function addIgnore(cur: Record<string, string> | null | undefined, key: string, now: Date): Record<string, string> {
  if (!isFindingKey(key)) throw new WebsiteInputError("Fund unbekannt");
  const next: Record<string, string> = {};
  for (const [k, v] of Object.entries(cur ?? {})) if (isIgnored(k, cur, now) && isFindingKey(k)) next[k] = v;
  next[key] = new Date(now.getTime() + IGNORE_DAYS * 24 * HOUR).toISOString();
  const keys = Object.keys(next).sort((a, b) => next[a].localeCompare(next[b]));
  return Object.fromEntries(keys.slice(-IGNORE_MAX).map((k) => [k, next[k]]));
}

/** Sichtbare Funde (ohne ausgeblendete) und Zahl der ausgeblendeten. */
export function visibleFindings(list: Finding[], ignored: Record<string, string> | null | undefined, now: Date): { shown: Finding[]; hidden: number } {
  const shown = list.filter((f) => !isIgnored(f.key, ignored, now));
  return { shown, hidden: list.length - shown.length };
}

/** Eine Zeile Vorschlag: neuer Text in Anführungszeichen, sonst was zu tun ist. */
export function suggestionLine(f: Finding): string {
  const v = f.vorschlag;
  if (!v) return isLegalFinding(f) ? "Nur der Inhaber ändert Rechtstexte" : "Ursache prüfen und beheben";
  return v.neu ? `„${v.neu}“` : v.text;
}

/** Zustand eines Funds aus dem letzten Fix-Auftrag. null = noch nichts beauftragt. checkAt = Zeit des angezeigten Checks. */
export function fixState(f: Finding, fixes: WebsiteFix[], tasks: Record<string, { status: TaskStatus }>, checkAt: string, startAt: string): FixView | null {
  const fix = fixes.filter((x) => x.keys.includes(f.key)).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!fix) return null;
  const st = fix.task_id ? tasks[fix.task_id]?.status ?? "offen" : "offen";
  if (st === "offen") return { text: `JARVIS behebt · startet um ${startAt}`, tone: "wait", canFix: false };
  if (st === "laeuft") return { text: "in Arbeit", tone: "work", canFix: false };
  if (st === "fertig") {
    const newer = new Date(fix.created_at).getTime() > new Date(checkAt).getTime();
    return newer ? { text: "erledigt · Check folgt", tone: "ok", canFix: false } : { text: "noch da · erneut beheben", tone: "bad", canFix: canFixFinding(f) };
  }
  return { text: st === "fehler" ? "Fehler · erneut beheben" : "abgebrochen", tone: "bad", canFix: canFixFinding(f) };
}

/** Behobene Fixes eines Bereichs in den letzten `days` Tagen (neueste zuerst). */
export function recentlyFixed(fixes: WebsiteFix[], area: AreaKey, now: Date, days = 3): WebsiteFix[] {
  const from = now.getTime() - days * 24 * HOUR;
  return fixes.filter((x) => x.behoben_at && new Date(x.behoben_at).getTime() >= from && x.keys.some((k) => k.startsWith(`${area}:`)))
    .sort((a, b) => String(b.behoben_at).localeCompare(String(a.behoben_at)));
}

const FIX_RULES = "Vorschlag umsetzen oder besser formulieren (Bedeutung gleich, landesweit, FR korrekt). Texte im Repo als PR, "
  + "Landingpage-Texte per UPDATE page_variants (alten Wert vorher in decisions). Nie Rechtstexte oder Preise, "
  + "kein Versand, keine Kosten. Danach website-check.yml starten.";

/** Auftragstext wie scripts/website_agents.py `fix_brief` (≤ 1000 Zeichen). */
export function fixBrief(pfad: string | null | undefined, funde: Finding[], byOwner = false): string {
  const head = `Website-Fix ${pfad || "Website"}${byOwner ? " (Inhaber)" : ""}: `;
  let body = funde.map((f) => `${f.text} → ${f.vorschlag?.neu ? `„${f.vorschlag.neu}“` : f.vorschlag?.text || "beheben"}`).join("; ");
  const room = 1000 - head.length - FIX_RULES.length - 3;
  if (body.length > room) body = body.slice(0, Math.max(0, room - 1)).trimEnd() + "…";
  return `${head}${body} | ${FIX_RULES}`;
}

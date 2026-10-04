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
export type Finding = { bereich: AreaKey; stufe: Level; text: string; pfad?: string };
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
    funde.push(pfad ? { bereich: r.bereich, stufe, text, pfad } : { bereich: r.bereich, stufe, text });
  }
  return { at: String(x.at ?? ""), site: String(x.site ?? ""), scores, funde, seiten: Number(x.seiten) || 0 };
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

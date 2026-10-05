/**
 * Gehirn-Seite „Aufbau“ (Inhaber 05.10.2026: „gehirn ist oben … darunter sind die agenten … dann werke … wann beim
 * gehirn automatisierungen beginnen, wenig texte schöne grafiken und animationen“). Reine Logik ohne React/Datenbank:
 * Cron (UTC) → Läufe in deutscher Zeit, Zeitplan aus lib/routinen.json (Claude-Routinen) + .github/workflows
 * (ops-config.json zeitplan), Agenten-Status und kurze Auftragszeilen. Getestet in gehirn-aufbau.test.ts.
 */
import { nextCron } from "./dashboard-logic.ts";
import ROUTINEN from "./routinen.json" with { type: "json" };

const MIN = 60_000;
const TAG = 24 * 60 * MIN;

// ------------------------------------------------------------------------------------------------- Zeit (Berlin)
const HM = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" });

/** „10:17“ in deutscher Zeit. */
export const hm = (d: Date) => HM.format(d);

/** Minuten seit Mitternacht in deutscher Zeit (0–1439) – Lage auf der 24-h-Leiste. */
export function berlinMinute(d: Date): number {
  const p = HM.formatToParts(d);
  const get = (t: string) => Number(p.find((x) => x.type === t)?.value ?? 0);
  return (get("hour") % 24) * 60 + get("minute");
}

/** Nächster Lauf über mehrere Crons (UTC) nach `now`; null = keiner. */
export function naechster(crons: string[], now: Date): Date | null {
  let best: Date | null = null;
  for (const c of crons) {
    const t = nextCron(c, now);
    if (t && (!best || t < best)) best = t;
  }
  return best;
}

/** Alle Läufe der nächsten `stunden` (Standard 24 h), früheste zuerst, höchstens `max`. */
export function laeufe(crons: string[], now: Date, stunden = 24, max = 300): Date[] {
  const bis = now.getTime() + stunden * 60 * MIN;
  const out: Date[] = [];
  for (const c of crons) {
    let t = nextCron(c, now);
    while (t && t.getTime() <= bis && out.length < max) {
      out.push(t);
      t = nextCron(c, t);
    }
  }
  return out.sort((a, b) => a.getTime() - b.getTime()).filter((d, i, xs) => i === 0 || d.getTime() !== xs[i - 1].getTime());
}

/** Countdown kurz: „jetzt“, „in 7 min“, „in 1:05 h“. */
export function countdown(ms: number): string {
  if (!Number.isFinite(ms) || ms < 30_000) return "jetzt";
  const m = Math.round(ms / MIN);
  if (m < 60) return `in ${m} min`;
  return `in ${Math.floor(m / 60)}:${String(m % 60).padStart(2, "0")} h`;
}

/** Takt in Worten aus der Zahl der Läufe je Tag: „alle 10 min“, „stündlich“, „alle 2 h“, „1× täglich“, „wöchentlich“. */
export function taktWort(proTag: number): string {
  if (proTag <= 0) return "wöchentlich";
  if (proTag >= 48) return `alle ${Math.round(1440 / proTag)} min`;
  if (proTag >= 23) return proTag >= 30 ? `${proTag}× täglich` : "stündlich";
  if (proTag >= 2) return Number.isInteger(24 / proTag) ? `alle ${24 / proTag} h` : `${proTag}× täglich`;
  return "1× täglich";
}

// ------------------------------------------------------------------------------------------------- Zeitplan
export type Art = "routine" | "werk";
export type Termin = {
  key: string; name: string; art: Art; icon: string; crons: string[];
  /** nächster Lauf (ISO) oder null */
  next: string | null;
  /** Lage der Läufe der nächsten 24 h auf der Leiste (Minute des Tages, deutsche Zeit) */
  marken: number[];
  proTag: number; takt: string;
};

type Routine = { key: string; name: string; icon: string; crons: string[] };
export const ROUTINEN_LISTE: Routine[] = (ROUTINEN as unknown as { routinen: Routine[] }).routinen;

/** Wichtige Workflows für die Zeitleiste (Reihenfolge = Anzeige); alle übrigen mit Cron stehen unter „weitere“. */
export const WICHTIG: [file: string, name: string, icon: string][] = [
  ["lead-werk.yml", "Lead-Werk", "lead-werk"],
  ["kunden-werk.yml", "Kunden-Werk", "kunden-werk"],
  ["pruefer-werk.yml", "Prüfer-Werk", "freigabe"],
  ["kontakt-werk.yml", "Kontakt-Werk", "kontakte"],
  ["proben-vorrat.yml", "Proben-Vorrat", "proben"],
  ["send.yml", "Versand", "versand"],
  ["antworten.yml", "Antworten", "antworten"],
  ["wachhund.yml", "Wachhund", "puls"],
  ["dauerpruefung.yml", "Dauerprüfung", "filter"],
  ["freigabe-stichprobe.yml", "Freigabe-Stichprobe", "freigabe"],
  ["agenten-werk.yml", "Agenten-Werk", "agent"],
  ["tagescheck.yml", "Tagescheck", "tagescheck"],
  ["kundenlieferung.yml", "Kundenlieferung", "lieferung"],
];

const nameAusDatei = (f: string) => f.replace(/\.ya?ml$/, "").split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("-");

function termin(key: string, name: string, art: Art, icon: string, crons: string[], now: Date): Termin {
  const xs = laeufe(crons, now, 24);
  const wk = xs.length ? xs : laeufe(crons, now, 24 * 7, 20);
  return {
    key, name, art, icon, crons, next: naechster(crons, now)?.toISOString() ?? null,
    marken: [...new Set(xs.map(berlinMinute))].sort((a, b) => a - b), proTag: xs.length, takt: xs.length ? taktWort(xs.length) : wk.length ? "wöchentlich" : "–",
  };
}

/** Zeitplan: Claude-Routinen + wichtige Workflows (haupt) und übrige Workflows mit Cron (weitere). */
export function zeitplan(workflows: { file: string; crons: string[] }[], now: Date): { haupt: Termin[]; weitere: Termin[] } {
  const byFile = new Map(workflows.map((w) => [w.file, w.crons]));
  const haupt: Termin[] = [
    ...ROUTINEN_LISTE.map((r) => termin(`r:${r.key}`, r.name, "routine", r.icon, r.crons, now)),
    ...WICHTIG.filter(([f]) => (byFile.get(f) ?? []).length).map(([f, name, icon]) => termin(`w:${f}`, name, "werk", icon, byFile.get(f)!, now)),
  ];
  const weitere = workflows.filter((w) => w.crons.length && !WICHTIG.some(([f]) => f === w.file))
    .map((w) => termin(`w:${w.file}`, nameAusDatei(w.file), "werk", "werk", w.crons, now));
  return { haupt, weitere };
}

/** Die nächsten n Starts über alle Termine (für „Als Nächstes“ + Countdown). */
export function alsNaechstes(ts: Termin[], n = 5): Termin[] {
  return ts.filter((t) => t.next).sort((a, b) => Date.parse(a.next!) - Date.parse(b.next!)).slice(0, n);
}

// ------------------------------------------------------------------------------------------------- Agenten
export type AStatus = "arbeitet" | "wartet" | "aus";
export type ATask = {
  id: string; agent: number | null; rolle: string | null; kind: string; brief: string; status: string; step: string | null; result: string | null;
  created_by: string | null; created_at: string; finished_at: string | null;
};

/** arbeitet = ein Auftrag läuft · wartet = an, nichts läuft · aus = abgeschaltet. */
export function agentStatus(tasks: Pick<ATask, "status">[], an = true): AStatus {
  if (tasks.some((t) => t.status === "laeuft")) return "arbeitet";
  return an ? "wartet" : "aus";
}

/** Erste n Wörter (Standard 6) ohne Satzzeichen-Rest, mit „…“ wenn gekürzt. */
export function kurzAuftrag(text: string | null | undefined, n = 6): string {
  const w = String(text ?? "").replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  if (!w.length) return "";
  return w.length > n ? `${w.slice(0, n).join(" ").replace(/[,;:.–-]+$/, "")} …` : w.join(" ");
}

/** Aufträge erledigt in den letzten 7 Tagen. */
export function erledigt7(tasks: Pick<ATask, "status" | "finished_at" | "created_at">[], now: Date): number {
  return tasks.filter((t) => t.status === "fertig" && now.getTime() - Date.parse(t.finished_at ?? t.created_at) <= 7 * TAG).length;
}

/** Aktueller Auftrag: laufend, sonst offen (älteste zuerst); null = nichts. */
export function aktuell<T extends Pick<ATask, "status" | "created_at">>(tasks: T[]): T | null {
  const by = (s: string) => tasks.filter((t) => t.status === s).sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null;
  return by("laeuft") ?? by("offen");
}

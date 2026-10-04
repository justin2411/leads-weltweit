/**
 * Bereichs-Office (/dashboard/firma/[bereich], Inhaber 04.10.2026: „bei einem klick auf z.b. qualitätsmanagement komme
 * ich dann darein ins office der agenten die in diesem bereich arbeiten“). Je Mitglied des Bereichs ein Arbeitsplatz mit
 * Status (arbeitet/wartet/fertig) aus agent_tasks, agent_roles, brain_routines, website_agents und Werk-Lebenszeichen.
 * Reine Funktionen; fehlt eine Quelle, ist der Status „–“ (nie erfunden).
 */
import type { Ampel } from "./ampel.ts";
import { fortschritt } from "./zentrale/ziele.ts";
import type { Bereich, BereichBild, Mitglied } from "./firma.ts";

export type PlatzStatus = "arbeitet" | "wartet" | "fertig" | "fehler" | "aus" | "–";
export type TaskLite = {
  id: string; created_at: string; agent: number; brief: string; status: string; result: string | null; step: string | null;
  finished_at: string | null; rolle?: string | null; routine_id?: string | null; grund?: string | null; kind?: string | null;
};
export type RolleLite = { slug: string; name: string; aktiv: boolean | null; department: string | null; takt: string | null };
export type RoutineLite = { id: string; name: string; aktiv: boolean | null; last_run_at: string | null; last_task_id: string | null; last_result: string | null };
export type WebAgentLite = RoutineLite;
export type Zeile = { id: string; text: string; ergebnis: string; status: PlatzStatus; at: string | null };
export type Platz = {
  key: string; art: Mitglied["art"]; ref: string; name: string; takt: string; icon: string; status: PlatzStatus; ampel: Ampel;
  zeilen: Zeile[]; zuletzt: string | null; leitung: boolean;
};

export const STATUS_AMPEL: Record<PlatzStatus, Ampel> = { arbeitet: "green", wartet: "gold", fertig: "green", fehler: "red", aus: "grey", "–": "grey" };
const ICON: Record<Mitglied["art"], string> = { rolle: "agent", routine: "gehirn", workflow: "werk", website: "website", agent: "jarvis" };
/** Workflow-Datei → Werk mit Lebenszeichen (lib/werke-live.ts). */
export const WERK_VON: Record<string, string> = {
  "lead-werk.yml": "lead-werk", "kunden-werk.yml": "kunden-werk", "proben-vorrat.yml": "proben-vorrat", "send.yml": "versand",
  "antworten.yml": "antworten", "freigabe-stichprobe.yml": "freigabe",
};

export const kurz = (t: string | null | undefined, max: number) => {
  const s = String(t ?? "").replace(/\s+/g, " ").trim();
  return s.length <= max ? s : `${s.slice(0, max - 1).trimEnd()}…`;
};

/** Auftrag → Status eines Arbeitsplatzes. */
export function taskStatus(s: string): PlatzStatus {
  return s === "laeuft" ? "arbeitet" : s === "offen" ? "wartet" : s === "fertig" ? "fertig" : s === "fehler" ? "fehler" : "–";
}

/** Gesamtstatus aus Aufträgen: läuft einer → arbeitet, wartet einer → wartet, sonst der jüngste fertige/fehlerhafte. */
export function statusAus(tasks: TaskLite[]): PlatzStatus | null {
  if (tasks.some((t) => t.status === "laeuft")) return "arbeitet";
  if (tasks.some((t) => t.status === "offen")) return "wartet";
  const done = tasks.filter((t) => t.status === "fertig" || t.status === "fehler")
    .sort((a, b) => (b.finished_at ?? b.created_at).localeCompare(a.finished_at ?? a.created_at))[0];
  return done ? taskStatus(done.status) : null;
}

/** Aufträge, die über „Auftrag geben“ an den ganzen Bereich gingen (Präfix im Auftragstext). */
export const bereichPrefix = (name: string) => `Bereich ${name}:`;

/** „1-8“ oder „9“ → Agenten-Nummern. */
export function agentNummern(ref: string): number[] {
  const m = /^(\d+)(?:\s*[-–]\s*(\d+))?$/.exec(ref.trim());
  if (!m) return [];
  const a = Number(m[1]), b = Number(m[2] ?? m[1]);
  if (!(a >= 1 && b >= a && b <= 20)) return [];
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

function zeilenAus(tasks: TaskLite[], n = 5): Zeile[] {
  return [...tasks].sort((a, b) => b.created_at.localeCompare(a.created_at)).slice(0, n).map((t) => ({
    id: t.id, text: kurz(t.brief, 60), status: taskStatus(t.status), at: t.finished_at ?? t.created_at,
    ergebnis: kurz(t.result ?? t.step ?? (t.status === "offen" ? "startet bald" : t.status === "laeuft" ? "arbeitet" : t.status === "abgebrochen" ? "zurückgezogen" : ""), 90),
  }));
}

/**
 * Arbeitsplätze eines Bereichs: Mitglieder aus departments + Fach-Agenten mit agent_roles.department = Bereich.
 * Quellen null = nicht lesbar → Status „–“.
 */
export function plaetze(b: Bereich, q: {
  roles: RolleLite[] | null; routines: RoutineLite[] | null; web: WebAgentLite[] | null; tasks: TaskLite[] | null; werkLive: Record<string, boolean> | null;
}): Platz[] {
  const mitglieder: Mitglied[] = [...b.mitglieder];
  for (const r of q.roles ?? []) {
    if (r.department === b.slug && !mitglieder.some((m) => m.art === "rolle" && m.ref === r.slug)) mitglieder.push({ art: "rolle", ref: r.slug, name: kurz(r.name, 40), takt: r.takt ?? "" });
  }
  const tasks = q.tasks;
  const seen = new Set<string>();
  return mitglieder.flatMap((m): Platz[] => {
    const key = `${m.art}-${m.ref || m.name}`.toLowerCase().replace(/[^a-z0-9äöüß_-]+/g, "-").slice(0, 60);
    if (seen.has(key)) return [];
    seen.add(key);
    let mine: TaskLite[] | null = null, aktiv: boolean | null = null, zuletzt: string | null = null, extra: Zeile[] = [];
    let werk: PlatzStatus | null = null;
    if (m.art === "rolle") {
      const r = q.roles?.find((x) => x.slug === m.ref);
      aktiv = r ? r.aktiv !== false : null;
      mine = tasks ? tasks.filter((t) => t.rolle === m.ref || (b.leitung_rolle === m.ref && t.brief.startsWith(bereichPrefix(b.name)))) : null;
    } else if (m.art === "routine" || m.art === "website") {
      const r = (m.art === "routine" ? q.routines : q.web)?.find((x) => x.name === m.ref) ?? null;
      aktiv = r ? r.aktiv !== false : null;
      zuletzt = r?.last_run_at ?? null;
      mine = tasks && r ? tasks.filter((t) => (m.art === "routine" && t.routine_id === r.id) || t.id === r.last_task_id) : tasks && (q.routines || q.web) ? [] : null;
      if (r?.last_result && !(mine ?? []).some((t) => t.id === r.last_task_id))
        extra = [{ id: `${r.id}-last`, text: "letzter Lauf", ergebnis: kurz(r.last_result, 90), status: "fertig", at: r.last_run_at }];
    } else if (m.art === "agent") {
      const nums = agentNummern(m.ref);
      mine = tasks && nums.length ? tasks.filter((t) => nums.includes(t.agent)) : null;
    } else if (m.art === "workflow") {
      const w = WERK_VON[m.ref];
      if (w && q.werkLive && w in q.werkLive) werk = q.werkLive[w] ? "arbeitet" : "wartet";
    }
    const vonTasks = mine ? statusAus(mine) : null;
    const status: PlatzStatus = aktiv === false ? "aus" : vonTasks ?? werk ?? (mine && (aktiv || m.art === "agent") ? "wartet" : "–");
    const zeilen = [...(mine ? zeilenAus(mine) : []), ...extra].slice(0, 5);
    const last = mine?.map((t) => t.finished_at ?? t.created_at).sort().at(-1) ?? null;
    return [{
      key, art: m.art, ref: m.ref, name: m.name, takt: m.takt, icon: ICON[m.art], status, ampel: STATUS_AMPEL[status], zeilen,
      zuletzt: [zuletzt, last].filter((x): x is string => !!x).sort().at(-1) ?? null,
      leitung: (b.leitung_rolle !== null && m.art === "rolle" && m.ref === b.leitung_rolle) || (b.leitung_rolle === null && m.name === b.leitung_name),
    }];
  }).sort((a, b) => Number(b.leitung) - Number(a.leitung));
}

/** Fortschritt zum Ziel 0–1 (für den Ring); ohne Soll oder Ist null. */
export function zielProzent(x: Pick<BereichBild, "ziel" | "ziel_richtung">): number | null {
  if (x.ziel.soll === null || x.ziel.ist === null) return null;
  return fortschritt({ soll: x.ziel.soll, richtung: x.ziel_richtung }, x.ziel.ist);
}

/** Eine Zahl für die Bereichs-Kachel: Ist-Wert des Ziels ohne „/ Soll“. */
export function kachelWert(x: Pick<BereichBild, "ziel">): string {
  const t = x.ziel.text.split(" / ")[0].trim();
  return t || "–";
}

/** Passende Unterseiten je Bereich (die bisherigen Abteilungs-Seiten), damit im Office alles erreichbar ist. */
export const SEITEN: Record<string, { label: string; href: string; icon: string }[]> = {
  vertrieb: [{ label: "Vertrieb", href: "/dashboard/vertrieb", icon: "versand" }, { label: "Versand", href: "/dashboard/versand", icon: "mail" }],
  marketing: [{ label: "Website", href: "/dashboard/website", icon: "website" }, { label: "Besucher", href: "/dashboard/website/auswertung", icon: "statistik" }],
  produktion: [{ label: "Werke", href: "/dashboard/werke", icon: "lead-werk" }, { label: "Bestand", href: "/dashboard/bestand", icon: "bestand" }, { label: "Speicher", href: "/dashboard/speicher", icon: "speicher" }],
  qualitaet: [{ label: "Freigabe", href: "/dashboard/jarvis?s=gate#agenten", icon: "freigabe" }, { label: "Proben", href: "/dashboard/proben", icon: "proben" }],
  kundenservice: [{ label: "Antworten", href: "/dashboard/antworten", icon: "antworten" }, { label: "Kunden", href: "/dashboard/kunden", icon: "kunden" }, { label: "Kunden-Agenten", href: "/dashboard/kunden-agenten", icon: "ansprechpartner" }],
  finanzen: [{ label: "Finanzen", href: "/dashboard/finanzen", icon: "trend-hoch" }, { label: "Ziele", href: "/dashboard/ziele", icon: "top" }],
  recht: [{ label: "Recht", href: "/dashboard/recht", icon: "recht" }, { label: "Protokoll", href: "/dashboard/protokoll", icon: "dokument" }],
  strategie: [{ label: "Gehirn", href: "/dashboard/gehirn", icon: "gehirn" }, { label: "Betrieb", href: "/dashboard/betrieb", icon: "einstellungen" }, { label: "Ziele", href: "/dashboard/ziele", icon: "top" }],
};

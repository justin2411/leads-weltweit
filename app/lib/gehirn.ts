/**
 * Gehirn-Seite (Inhaber 04.10.2026: „großes gehirn in die mitte wo ich die aktuellen abläufe auch sehe und woran er
 * gerade arbeitet … auf und zu klappbar … merken was ich ausklappe“). Reine Funktionen (ohne React/Datenbank), damit
 * Satz, Knoten und Abläufe getestet werden können.
 */
import { AGENT_COUNT, nextAgentRound, type AgentTask } from "./agents.ts";
import { berlin, nextRun } from "./dashboard-logic.ts";
import { kurzTitel } from "./kurz.ts";

export type BrainSettings = {
  brain_enabled?: boolean | null; auto_publish_pages?: boolean | null; auto_merge_content?: boolean | null;
  legal_ready?: boolean | null; max_new_pages_per_week?: number | null; pricing?: unknown;
};
/** kurz_titel / kurz_grund: optionale Spalten (eigener PR) – fehlen sie, kürzt lib/kurz.ts den Volltext. */
export type Decision = {
  id: number | string; type: string; subject: string; reasoning?: string | null; action?: string | null; status: string; created_at: string;
  kurz_titel?: string | null; kurz_grund?: string | null;
};
export type PageStat = {
  variant_id: string; page_id: string; slug: string; page_status: string; variant_key: string; variant_status: string;
  traffic_share: number; views: number; cta_clicks: number; sample_requests: number; checkouts?: number; purchases: number;
};
export type Workflow = { file: string; name: string; crons: string[] };

/** Schlüssel im Browser je Abschnitt (localStorage). */
export const foldKey = (id: string) => `gh:fold:${id}`;

export const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1).replace(".", ",")} %` : "–");

const MIN = 60_000;
const short = (s: string, n = 90) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

// ------------------------------------------------------------------------------------------- Zustand / Satz
export type BrainMode = "aus" | "arbeitet" | "wartet" | "bereit";
export type BrainNow = { mode: BrainMode; label: string; sentence: string; line: string; hot: boolean; running: AgentTask[]; queued: number };

/** Vorschläge älter als 7 Tage gelten nicht mehr als offen (gedimmt unter „älter“). */
export const FRESH_DAYS = 7;
export const isStale = (d: Pick<Decision, "created_at">, now: Date) => now.getTime() - Date.parse(d.created_at) > FRESH_DAYS * 24 * 60 * MIN;
/** Offene Vorschläge = status proposed und höchstens 7 Tage alt. */
export const openProposals = (ds: Decision[], now: Date) => ds.filter((d) => d.status === "proposed" && !isStale(d, now));

/**
 * Was das Gehirn gerade tut, als ein Satz für die Mitte:
 * aus → nur beobachten; laufende Aufträge → Agent + Schritt + Fortschritt; offene Vorschläge → wartet auf den Inhaber;
 * Entscheidung der letzten 90 min → „Zuletzt: …“; sonst bereit bis zur nächsten Agenten-Runde.
 * `line` ist dieselbe Aussage als eine kurze Zeile für unter dem Gehirn (Inhaber: „wenig text“).
 */
export function brainNow(o: { settings: BrainSettings; tasks: AgentTask[]; decisions: Decision[]; now: Date }): BrainNow {
  const running = o.tasks.filter((t) => t.status === "laeuft").sort((a, b) => ((a.started_at ?? a.created_at) < (b.started_at ?? b.created_at) ? 1 : -1));
  const queued = o.tasks.filter((t) => t.status === "offen").length;
  const latest = [...o.decisions].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  const fresh = latest && o.now.getTime() - Date.parse(latest.created_at) < 90 * MIN;
  const proposed = openProposals(o.decisions, o.now);
  const base = { running, queued };
  if (!o.settings.brain_enabled) {
    return { ...base, mode: "aus", label: "aus", hot: false, sentence: "Gehirn ist aus – es beobachtet nur und ändert nichts.", line: "Aus · beobachtet nur" };
  }
  if (running.length) {
    const t = running[0];
    const what = short(t.step?.trim() || t.brief);
    const more = running.length > 1 ? ` · +${running.length - 1} weitere` : "";
    return { ...base, mode: "arbeitet", label: "arbeitet", hot: true, sentence: `Agent ${t.agent} arbeitet: ${what} (${Math.round(t.progress ?? 0)} %)${more}`,
      line: `A${t.agent} · ${short(t.step?.trim() || t.brief, 60)}${running.length > 1 ? ` · +${running.length - 1}` : ""}` };
  }
  if (proposed.length) {
    const d = [...proposed].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    const more = proposed.length > 1 ? ` · ${proposed.length} offen` : "";
    return { ...base, mode: "wartet", label: "wartet auf dich", hot: !!fresh, sentence: `Wartet auf deine Entscheidung: ${short(d.subject)}${more}`,
      line: `${proposed.length} ${proposed.length === 1 ? "Vorschlag" : "Vorschläge"} · ${kurzTitel(d.subject, 48)}` };
  }
  if (latest && fresh) {
    return { ...base, mode: "bereit", label: "aktiv", hot: true, sentence: `Zuletzt um ${berlin(latest.created_at, false)}: ${short(latest.subject)}`,
      line: `${berlin(latest.created_at, false)} · ${kurzTitel(latest.subject, 48)}` };
  }
  const next = berlin(nextAgentRound(o.now), false);
  return { ...base, mode: "bereit", label: "bereit", hot: false, line: queued ? `${queued} warten · Runde ${next}` : `Bereit · Runde ${next}`, sentence: queued ? `${queued} Auftrag${queued === 1 ? "" : "e"} in der Warteschlange – nächste Agenten-Runde um ${next}` : `Bereit – nächste Agenten-Runde um ${next}` };
}

// ------------------------------------------------------------------------------------------- Seiten / A/B-Tests
export type PageGroup = { page_id: string; slug: string; page_status: string; variants: PageStat[]; views: number; samples: number };

/** Varianten je Seite (Reihenfolge wie geliefert, d. h. nach slug, variant_key). */
export function pagesByPage(rows: PageStat[]): PageGroup[] {
  const out = new Map<string, PageGroup>();
  for (const r of rows) {
    const g = out.get(r.page_id) ?? { page_id: r.page_id, slug: r.slug, page_status: r.page_status, variants: [], views: 0, samples: 0 };
    g.variants.push(r);
    g.views += Number(r.views) || 0;
    g.samples += Number(r.sample_requests) || 0;
    out.set(r.page_id, g);
  }
  return [...out.values()];
}

export type AbTest = { slug: string; variants: { key: string; status: string; share: number; views: number; samples: number; rate: number }[]; leader: string | null };

/** Laufende A/B-Tests: Seiten mit mindestens zwei nicht stillgelegten Varianten; vorn liegt die beste Proben-Quote (ab 20 Aufrufen). */
export function abTests(rows: PageStat[]): AbTest[] {
  return pagesByPage(rows)
    .map((g) => {
      const vs = g.variants.filter((v) => v.variant_status !== "retired").map((v) => {
        const views = Number(v.views) || 0, samples = Number(v.sample_requests) || 0;
        return { key: v.variant_key, status: v.variant_status, share: Number(v.traffic_share) || 0, views, samples, rate: views > 0 ? samples / views : 0 };
      });
      const ranked = vs.filter((v) => v.views >= 20).sort((a, b) => b.rate - a.rate);
      const leader = ranked.length >= 2 && ranked[0].rate > ranked[1].rate ? ranked[0].key : null;
      return { slug: g.slug, variants: vs, leader };
    })
    .filter((t) => t.variants.length >= 2);
}

// ------------------------------------------------------------------------------------------- Abläufe
export type Upcoming = { name: string; at: Date };

/** Nächste geplante Läufe (Workflows aus ops-config + Agenten-Runde), früheste zuerst. */
export function upcoming(workflows: Workflow[], now: Date, n = 6): Upcoming[] {
  const list: Upcoming[] = [{ name: "Agenten-Runde (JARVIS)", at: nextAgentRound(now) }];
  for (const w of workflows) {
    const at = nextRun(w.crons ?? [], now);
    if (at) list.push({ name: w.name, at });
  }
  return list.sort((a, b) => a.at.getTime() - b.at.getTime()).slice(0, n);
}

/** Tagesnotiz oder Wochenbericht (neueste). */
export function latestReport(decisions: Decision[]): Decision | null {
  return [...decisions].filter((d) => d.type === "daily_note" || d.type === "weekly_report").sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null;
}

// ------------------------------------------------------------------------------------------- Grafik (Uhr, Satelliten, Balken)
/** Stunde und Minute in deutscher Zeit. */
export function berlinHM(d: Date): { h: number; m: number } {
  const parts = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  return { h: get("hour") % 24, m: get("minute") };
}

/** Winkel auf dem 24-Stunden-Zifferblatt (deutsche Zeit): 0:00 oben = 0°, 6:00 rechts = 90°, im Uhrzeigersinn. */
export function clockAngle(d: Date): number {
  const { h, m } = berlinHM(d);
  return ((h * 60 + m) / 1440) * 360;
}

/** Punkt auf einem Kreis (Mitte 50/50, Radius in Prozent der Bühne), 0° oben, im Uhrzeigersinn – als Prozent für CSS. */
export function polar(deg: number, r: number): { x: number; y: number } {
  const a = ((deg - 90) * Math.PI) / 180;
  const round = (v: number) => Math.round(v * 100) / 100;
  return { x: round(50 + r * Math.cos(a)), y: round(50 + r * Math.sin(a)) };
}

export type ClockMark = { angle: number; time: string; names: string[]; at: string; next: boolean };

/** Nächste Läufe als Punkte auf dem Zifferblatt; Läufe innerhalb von mergeMin Minuten teilen sich einen Punkt. */
export function clockMarks(runs: Upcoming[], mergeMin = 20): ClockMark[] {
  const sorted = [...runs].sort((a, b) => a.at.getTime() - b.at.getTime());
  const out: (ClockMark & { t: number })[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.at.getTime() - last.t <= mergeMin * MIN) {
      last.names.push(r.name);
      continue;
    }
    out.push({ angle: Math.round(clockAngle(r.at) * 10) / 10, time: berlin(r.at, false), names: [r.name], at: r.at.toISOString(), next: out.length === 0, t: r.at.getTime() });
  }
  return out.map(({ t: _t, ...m }) => m);
}

export type SatState = "laeuft" | "wartet" | "frei";
export type Satellite = { agent: number; angle: number; state: SatState; progress: number; brief: string | null; step: string | null; since: string | null; queued: number };

/**
 * Agenten als Satelliten um das Gehirn: je Agent ein Platz, gleichmäßig verteilt (A1 oben rechts, dann im Uhrzeigersinn).
 * Läuft ein Auftrag, zeigt der Satellit ihn (Fortschritt), sonst den ältesten wartenden (gedimmt), sonst „frei“.
 */
export function satellites(tasks: AgentTask[], n = AGENT_COUNT): Satellite[] {
  const byAge = [...tasks].sort((a, b) => ((a.started_at ?? a.created_at) < (b.started_at ?? b.created_at) ? -1 : 1));
  return Array.from({ length: n }, (_, i) => {
    const agent = i + 1;
    const mine = byAge.filter((t) => t.agent === agent);
    const run = [...mine].reverse().find((t) => t.status === "laeuft");
    const waiting = mine.filter((t) => t.status === "offen");
    const t = run ?? waiting[0];
    const state: SatState = run ? "laeuft" : t ? "wartet" : "frei";
    return {
      agent, angle: 180 / n + (360 / n) * i, state,
      progress: run ? Math.max(0, Math.min(100, Math.round(run.progress ?? 0))) : 0,
      brief: t?.brief ?? null, step: run?.step ?? null, since: run?.started_at ?? null,
      queued: Math.max(0, waiting.length - (run ? 0 : 1)),
    };
  });
}

/** Breiten eines geteilten Balkens (Summe 100) nach Quote; jede Seite mindestens min %, ohne Daten gleich verteilt. */
export function splitShares(rates: number[], min = 18): number[] {
  if (!rates.length) return [];
  const sum = rates.reduce((a, r) => a + Math.max(0, r), 0);
  const raw = sum > 0 ? rates.map((r) => (100 * Math.max(0, r)) / sum) : rates.map(() => 100 / rates.length);
  const floor = Math.min(min, 100 / rates.length);
  const low = raw.map((w) => w < floor);
  const lowSum = low.filter(Boolean).length * floor;
  const restRaw = raw.reduce((a, w, i) => a + (low[i] ? 0 : w), 0);
  const out = raw.map((w, i) => (low[i] ? floor : restRaw > 0 ? (w * (100 - lowSum)) / restRaw : (100 - lowSum) / (rates.length - low.filter(Boolean).length)));
  return out.map((w) => Math.round(w * 10) / 10);
}

/** Balkenlängen relativ zum Größten (0–100). */
export const relBars = (vals: number[]) => {
  const max = Math.max(0, ...vals);
  return vals.map((v) => (max > 0 ? Math.round((1000 * Math.max(0, v)) / max) / 10 : 0));
};

// ------------------------------------------------------------------------------------------- Vorschläge
export type Tone = "gold" | "green" | "grey" | "red" | "cyan";
export const decisionTone = (status: string): Tone =>
  status === "proposed" ? "gold" : status === "done" ? "green" : status === "rejected" ? "grey" : status === "fehler" ? "red" : "cyan";

/** Vorschläge gruppiert: offen (≤ 7 Tage, oben mit ✓/✗), älter (gedimmt), übrige (erledigt/abgelehnt, neueste zuerst). */
export function proposalGroups(ds: Decision[], now: Date, skip?: Decision["id"] | null) {
  const newest = [...ds].filter((d) => d.id !== skip).sort((a, b) => (a.created_at < b.created_at ? 1 : -1));
  return {
    open: newest.filter((d) => d.status === "proposed" && !isStale(d, now)),
    old: newest.filter((d) => d.status === "proposed" && isStale(d, now)),
    rest: newest.filter((d) => d.status !== "proposed"),
  };
}

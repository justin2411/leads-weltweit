/**
 * Gehirn-Seite (Inhaber 04.10.2026: „großes gehirn in die mitte wo ich die aktuellen abläufe auch sehe und woran er
 * gerade arbeitet … auf und zu klappbar … merken was ich ausklappe“). Reine Funktionen (ohne React/Datenbank), damit
 * Satz, Knoten und Abläufe getestet werden können.
 */
import { nextAgentRound, type AgentTask } from "./agents.ts";
import { berlin, nextRun } from "./dashboard-logic.ts";

export type BrainSettings = {
  brain_enabled?: boolean | null; auto_publish_pages?: boolean | null; auto_merge_content?: boolean | null;
  legal_ready?: boolean | null; max_new_pages_per_week?: number | null; pricing?: unknown;
};
export type Decision = { id: number | string; type: string; subject: string; reasoning?: string | null; action?: string | null; status: string; created_at: string };
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
export type BrainNow = { mode: BrainMode; label: string; sentence: string; hot: boolean; running: AgentTask[]; queued: number };

/**
 * Was das Gehirn gerade tut, als ein Satz für die Mitte:
 * aus → nur beobachten; laufende Aufträge → Agent + Schritt + Fortschritt; offene Vorschläge → wartet auf den Inhaber;
 * Entscheidung der letzten 90 min → „Zuletzt: …“; sonst bereit bis zur nächsten Agenten-Runde.
 */
export function brainNow(o: { settings: BrainSettings; tasks: AgentTask[]; decisions: Decision[]; now: Date }): BrainNow {
  const running = o.tasks.filter((t) => t.status === "laeuft").sort((a, b) => ((a.started_at ?? a.created_at) < (b.started_at ?? b.created_at) ? 1 : -1));
  const queued = o.tasks.filter((t) => t.status === "offen").length;
  const latest = [...o.decisions].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
  const fresh = latest && o.now.getTime() - Date.parse(latest.created_at) < 90 * MIN;
  const proposed = o.decisions.filter((d) => d.status === "proposed");
  const base = { running, queued };
  if (!o.settings.brain_enabled) {
    return { ...base, mode: "aus", label: "aus", hot: false, sentence: "Gehirn ist aus – es beobachtet nur und ändert nichts." };
  }
  if (running.length) {
    const t = running[0];
    const what = short(t.step?.trim() || t.brief);
    const more = running.length > 1 ? ` · +${running.length - 1} weitere` : "";
    return { ...base, mode: "arbeitet", label: "arbeitet", hot: true, sentence: `Agent ${t.agent} arbeitet: ${what} (${Math.round(t.progress ?? 0)} %)${more}` };
  }
  if (proposed.length) {
    const d = [...proposed].sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];
    const more = proposed.length > 1 ? ` · ${proposed.length} offen` : "";
    return { ...base, mode: "wartet", label: "wartet auf dich", hot: !!fresh, sentence: `Wartet auf deine Entscheidung: ${short(d.subject)}${more}` };
  }
  if (latest && fresh) {
    return { ...base, mode: "bereit", label: "aktiv", hot: true, sentence: `Zuletzt um ${berlin(latest.created_at, false)}: ${short(latest.subject)}` };
  }
  const next = berlin(nextAgentRound(o.now), false);
  return { ...base, mode: "bereit", label: "bereit", hot: false, sentence: queued ? `${queued} Auftrag${queued === 1 ? "" : "e"} in der Warteschlange – nächste Agenten-Runde um ${next}` : `Bereit – nächste Agenten-Runde um ${next}` };
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

export type Event = { at: string; kind: "entscheidung" | "auftrag"; title: string; status: string; detail: string | null };

/** Verlauf: Entscheidungen des Gehirns und fertige/fehlerhafte Aufträge gemischt, neueste zuerst. */
export function timeline(decisions: Decision[], tasks: AgentTask[], n = 10): Event[] {
  const ev: Event[] = [
    ...decisions.map((d) => ({ at: d.created_at, kind: "entscheidung" as const, title: d.subject, status: d.status, detail: d.type })),
    ...tasks.filter((t) => (t.status === "fertig" || t.status === "fehler") && t.finished_at)
      .map((t) => ({ at: t.finished_at as string, kind: "auftrag" as const, title: `Agent ${t.agent}: ${t.brief}`, status: t.status, detail: t.result ? short(t.result, 140) : null })),
  ];
  return ev.sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, n);
}

/** Tagesnotiz oder Wochenbericht (neueste). */
export function latestReport(decisions: Decision[]): Decision | null {
  return [...decisions].filter((d) => d.type === "daily_note" || d.type === "weekly_report").sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0] ?? null;
}

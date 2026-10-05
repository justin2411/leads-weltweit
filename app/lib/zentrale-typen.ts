/**
 * Gemeinsame Typen der JARVIS-Zentrale: GET /api/jarvis/zentrale (Server) und useZentrale (Browser).
 * schnell = signalwerk.zentrale_schnell() alle 10 s; langsam = dashboard_cache 'zentrale' (zentrale_langsam(),
 * Wachhund alle 15 min) + Spiegel der Notbremse aus dashboard_live, alle 60 s. Fehlt ein Teil: null → „Stand …“.
 */
import type { BdPunkt } from "./braucht-dich.ts";

export type Beat = { werk: string; last_beat: string | null; plaetze: number; processed_60m: number | null; green_60m: number | null };
export type ZTask = {
  id: string; agent: number | null; rolle: string | null; kind: string; market: string | null; brief: string; status: "offen" | "laeuft" | "fertig" | "fehler" | "abgebrochen";
  progress: number | null; step: string | null; created_by: string | null; created_at: string; started_at: string | null; finished_at: string | null; grund: string | null;
};
export type Handoff = { id: string; created_at: string; regel: string; von: string; an: string; titel: string | null; status: string; market: string | null };
export type Gap = { slug: string; ziel_key: string; ist: number | null; soll: number | null; luecke: number | null; rang: number | null; titel: string | null; grund: string | null; modus: string; updated_at: string };
export type PlanLogRow = { werk: string; at: string; mode: string; bremse: string; plan: Record<string, number>; reasons: Record<string, string> | null };
export type TickerRow = { at: string; art: "decision" | "task" | "start" | "positiv"; titel: string; ref: string };

export type Schnell = {
  now: string;
  beats: Beat[];
  tasks: ZTask[];
  handoffs: Handoff[];
  gaps: Gap[];
  owner: { send_paused?: boolean; werke_paused?: Record<string, string>; followup_enabled?: boolean; slot_plan?: Record<string, number>;
    sample_targets?: Record<string, number>; slot_autopilot?: { on?: boolean } };
  brain_enabled: boolean | null;
  plan_log: PlanLogRow[];
  /** Letztes eigenes Signal des Quellen-Scouts (Entscheidung/Auftrag/Start mit „Scout“); null = keine Messung. */
  scout_last?: string | null;
  msg: { sent_60m: number; sent_24h: number; sent_heute: number; last_sent_at: string | null; blocked_60m: number; freigegeben?: number };
  ev24: Record<string, number>;
  replies: { offen: number; heiss: number };
  acks: Record<string, string>;
  starts: { id: string; created_at: string; workflow: string; status: string; started_at: string | null }[];
  subs: { aktiv: number; neueste: string | null };
  held_60m: number;
  ticker: TickerRow[];
};

export type RunAgg = { processed_60m: number; green_60m: number; processed_24h: number; green_24h: number; red_24h: number; last: string | null };
export type KpiPunkt = { day: string; metric: string; value: number; updated_at: string };
export type Goal = { key: string; titel: string; einheit: string; soll: number; richtung: string; sort: number; quelle: string | null; updated_at: string | null };
export type Lage = { mrr?: number; kunden?: number; mails_24h?: number; antworten_7d?: number; positiv_7d?: number; proben_7d?: number; gruen_7d?: number;
  bestanden?: number; bestanden_n?: number; spam_30d?: number; heiss_offen?: number; vorrat?: number; vorrat_land?: Record<string, number> };
export type LernEintrag = { at: string | null; titel: string; grund?: string | null; vertrauen?: number };

export type LangsamDb = {
  at: string;
  lage: Lage | null;
  runs: Record<string, RunAgg>;
  tank: Record<string, number>;
  tank_24h: number;
  kpi: KpiPunkt[];
  goals: Goal[];
  deliv: { day: string; at: string; status: string; gruende: string[] | null } | null;
  lern: { messen: number; lehre: number; erwartungen: number; eval: { created_at: string; faelle: number; richtig: number; score: number } | null;
    last_decision: string | null; messen_liste: LernEintrag[]; lehre_liste: LernEintrag[] };
  storage: { db_bytes: number | null; at: string } | null;
  llm_heute: number;
  sperre: { gesamt: number; neu_24h: number };
  cache_wachhund: string | null;
  /** Zusatz für KPI-Leiste und Werke-Karte (zentrale_extra(), Migration 20261005160000); fehlt bei altem Cache → null */
  extra?: Extra | null;
};

/** Zahlen je Zeitraum (7/30 Tage) für die KPI-Leiste. */
export type ExtraPeriode = { sent: number; bounced: number; complained: number; antworten: number; positiv: number; proben: number };
export type Extra = {
  at: string;
  /** lieferbare Premium-Leads S2 × US/UK/FR */
  premium: number;
  premium_land: Record<string, number>;
  radar_24h: number;
  bewertet_24h: number;
  premium_24h: number;
  feedback: { n_7d: number; gut_7d?: number; schlecht_7d?: number; won_30d?: number; links_7d: number; letzte: string | null };
  p: Partial<Record<"1" | "7" | "30", ExtraPeriode>>;
};

/** Notbremse genau wie deliverability.emergency_stop (App-Spiegel lib/dashboard-logic brake). */
export type Bremse = { stop: string | null; sent: number; bounced: number; complained: number; rate: number };

export type Langsam = LangsamDb & {
  /** Stand des Zwischenspeichers (updated_at); älter als 20 min → Oberfläche zeigt „Stand …“ */
  stand: string;
  bremse: Bremse | null;
  /** Versand-Kapazität heute (Postfächer) und Tagesziel */
  kap: number | null;
  /** MRR in Landeswährung, nur echte Abos (ohne Testkunden) */
  mrr: number | null;
  kunden: number | null;
  /** Proben-Soll je Land (S2) */
  tank_soll: Record<string, number>;
  /** Punkte „Braucht dich“ (Ja/Nein/Später im Seitenfenster „du“) */
  bd: BdPunkt[];
};

export type ZentraleDaten = { schnell: Schnell | null; langsam: Langsam | null; abruf: string };

import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/supabase";
import { boxHealth, type BoxHealth, type Days, type Live, type OpsConfig, type RawStock, type RunInfo, type Stock } from "@/lib/dashboard-logic";
import type { DailyRow } from "@/lib/dashboard-periods";
import { merge, type OwnerSettings } from "@/lib/owner-settings";
import { EMPTY_ACTIVITY, type Activity } from "@/lib/werke-live";
import opsConfig from "@/lib/ops-config.json";

/**
 * Daten des Inhaber-Dashboards. Aggregation in der Datenbank (Funktionen aus Migration 20261003180000):
 * - dashboard_live:      bei jedem Aufruf (~0,3 s)
 * - dashboard_stock:     Leads/Käufer je Zielgruppe × Land (~2 s), 10 min zwischengespeichert – schont das Disk-IO-Budget
 * - dashboard_raw_stock: Rohbestand (Firmen ohne Lead, ~4 s), 1 h zwischengespeichert
 * Alles nur serverseitig mit dem Service-Schlüssel; der Zwischenspeicher enthält nur Zählungen.
 */
export const CONFIG = opsConfig as OpsConfig;

async function rpc<T>(fn: string, args: Record<string, unknown> = {}, timeoutMs = 10_000): Promise<T> {
  const { data, error } = await db().rpc(fn, args).abortSignal(AbortSignal.timeout(timeoutMs));
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export async function loadLive(): Promise<Live> {
  // Notbremse-Fenster wie deliverability.window_start: letzte 30 Tage, aber nicht vor notbremse_ab
  const start = Math.max(Date.now() - 30 * 86_400_000, CONFIG.versand.notbremse_ab ? Date.parse(CONFIG.versand.notbremse_ab) : 0);
  const [live, blocked] = await Promise.all([
    rpc<Live>("dashboard_live", { p_window_start: new Date(start).toISOString() }),
    db().from("messages").select("id", { count: "exact", head: true }).eq("status", "draft").neq("check_errors", "{}")
      .abortSignal(AbortSignal.timeout(5000)),
  ]);
  return { ...live, drafts_blocked: blocked.count ?? 0 };
}

/** Tageswerte für die Grafiken (gesendete Mails je Tag und Land, 14 Tage). */
export async function loadDays(n = 14): Promise<Days> {
  return rpc<Days>("dashboard_days", { p_days: n }, 8000);
}

export const loadStock = unstable_cache(async () => rpc<Stock>("dashboard_stock", {}, 40_000), ["dashboard-stock-v1"], {
  revalidate: 600,
  tags: ["dashboard-stock"],
});

export const loadRawStock = unstable_cache(async () => rpc<RawStock>("dashboard_raw_stock", {}, 70_000), ["dashboard-raw-stock-v1"], {
  revalidate: 3600,
  tags: ["dashboard-stock"],
});

/**
 * Letzte GitHub-Läufe der Werke – nur wenn in Vercel ein Token mit Leserecht auf Actions gesetzt ist
 * (GH_DISPATCH_TOKEN, docs/EINRICHTUNG.md). Ohne Token: null (Dashboard leitet die Läufe aus der Datenbank ab).
 */
export const loadRuns = unstable_cache(
  async (): Promise<RunInfo[] | null> => {
    const token = process.env.GH_DISPATCH_TOKEN?.trim();
    if (!token) return null;
    const repo = process.env.GH_REPO?.trim() || "justin2411/leads-weltweit";
    const out: RunInfo[] = [];
    await Promise.all(
      CONFIG.workflows.map(async (w) => {
        try {
          const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${w.file}/runs?per_page=1&branch=main`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
            signal: AbortSignal.timeout(4000),
            cache: "no-store",
          });
          if (!r.ok) return;
          const run = (await r.json()).workflow_runs?.[0];
          if (run) out.push({ file: w.file, name: w.name, status: run.status, conclusion: run.conclusion, updated_at: run.updated_at, url: run.html_url });
        } catch {
          /* ein Workflow ohne Antwort verhindert die Seite nicht */
        }
      }),
    );
    return out;
  },
  ["dashboard-runs-v1"],
  { revalidate: 300 },
);

/** Zielgruppe des Dashboards (Inhaber 03.10.2026: „nur webagencies bitte reinnehmen“). */
export const SEGMENT = (CONFIG.fokus[0] ?? "S2/US").split("/")[0];
export const COUNTRIES = CONFIG.fokus.filter((k) => k.startsWith(`${SEGMENT}/`)).map((k) => k.split("/")[1]);

/** Tageswerte (deutsche Zeit) der Zielgruppe zwischen from und to: Mails, Bounces, Antworten, Proben, Kunden. */
export async function loadDaily(from: string, to: string): Promise<DailyRow[]> {
  return rpc<DailyRow[]>("dashboard_daily", { p_segment: SEGMENT, p_from: from, p_to: to }, 10_000);
}

export type ContactCard = { id: string; stage: "contacted" | "replied" | "sample" | "out"; country: string; company: string; domain: string; first_sent: string; last_at: string; positive: boolean };
export type Contacts = { counts: { stage: string; country: string; n: number }[]; cards: ContactCard[] };

/** Angeschriebene Firmen der Zielgruppe mit ihrer weitesten Stufe (Anzahl je Stufe/Land + neueste Karten). */
export async function loadContacts(perStage = 30, from: string | null = null, to: string | null = null): Promise<Contacts> {
  return rpc<Contacts>("dashboard_contacts", { p_segment: SEGMENT, p_per_stage: perStage, p_from: from, p_to: to }, 10_000);
}

export type ListRow = { prospect_id: string | null; company: string; domain: string | null; country: string | null; at: string; status: string; text: string | null };

/** Firmen zu einer Kennzahl im Zeitraum (Drill-down): Mails, Bounces, Antworten, Proben, Kunden. */
export async function loadList(metric: string, from: string, to: string, country: string | null, limit = 200) {
  return rpc<{ total: number; rows: ListRow[] }>("dashboard_list", { p_segment: SEGMENT, p_metric: metric, p_from: from, p_to: to, p_country: country, p_limit: limit }, 10_000);
}

/** Einstellungen des Inhabers (signalwerk.owner_settings); fehlt die Tabelle: Standardwerte. */
export async function loadOwnerSettings(): Promise<OwnerSettings> {
  try {
    const { data, error } = await db().from("owner_settings").select("key, value").abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error(error.message);
    return merge(data ?? []);
  } catch {
    return merge([]);
  }
}

export async function loadOwnerLog(limit = 8) {
  const { data } = await db().from("owner_log").select("action, target, new_value, created_at").order("created_at", { ascending: false }).limit(limit);
  return (data ?? []) as { action: string; target: string | null; new_value: unknown; created_at: string }[];
}

export const canDispatch = () => !!process.env.GH_DISPATCH_TOKEN?.trim();

/** Verlauf einer Firma: Stammdaten, Mails, Ereignisse, Website-Proben, Kunde. */
export async function loadCompany(id: string) {
  const sb = db();
  const { data: p, error } = await sb.from("prospects")
    .select("id, company_name, legal_form, country, website, domain, email, segment_id, check_status, specialization, source_url, created_at")
    .eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!p) return null;
  const { data: msgs } = await sb.from("messages")
    .select("id, kind, status, subject, sent_at, created_at, sent_from, to_email, experiments(segment_id, country)")
    .eq("prospect_id", id).order("created_at");
  const ids = (msgs ?? []).map((m: any) => m.id);
  const [ev, web, cust, notes, sup] = await Promise.all([
    ids.length ? sb.from("email_events").select("id, type, note, occurred_at, message_id").in("message_id", ids).order("occurred_at") : Promise.resolve({ data: [] as any[] }),
    sb.from("sample_requests").select("id, status, created_at, sent_at, email").ilike("email", `%@${p.domain}`),
    sb.from("customers").select("id, status, created_at, company_name").eq("prospect_id", id),
    sb.from("owner_notes").select("note, created_at").eq("prospect_id", id).order("created_at", { ascending: false }).limit(20),
    sb.from("suppression").select("reason, created_at").eq("kind", "domain").eq("value", String(p.domain ?? "").toLowerCase()).limit(1),
  ]);
  return { prospect: p, messages: msgs ?? [], events: ev.data ?? [], web: web.data ?? [], customers: cust.data ?? [],
    notes: (notes.data ?? []) as { note: string; created_at: string }[], suppressed: (sup.data ?? [])[0] ?? null };
}

export type Production = {
  leads: { day: string; country: string; source: string; n: number }[];
  prospects: { day: string; country: string; status: string; n: number }[];
  buyer_reasons: { status: string; reason: string; n: number }[];
  runs: { werk: string; segment_id: string | null; country: string | null; candidates: number; processed: number; green: number; yellow: number; red: number; parts: number; last_at: string }[];
  run_reasons: { werk: string; country: string | null; reason: string; n: number }[];
  /** Zähler je Prüfstufe (run_stats.extra.stufen), z. B. Lead-Werk „befund“, Freigabe „stufe1“ */
  run_stages?: { werk: string; country: string | null; teil: string; stage: string; n: number }[];
  /** Käufer, die eine Nachprüfung im Zeitraum auf mail-fähig gehoben hat */
  prospects_rechecked?: { day: string; country: string; n: number }[];
  last_run: Record<string, string>;
};

/** Live-Zustand der Werke (Lebenszeichen, letzte Aktivität), ~50 ms, 20 s zwischengespeichert. */
// Fehler werden NICHT zwischengespeichert (sonst zeigte das Dashboard bis zu 20 s „keine Daten“ nach einem Aussetzer)
const activityCached = unstable_cache(
  async (): Promise<Activity> => ({ ...EMPTY_ACTIVITY, ...(await rpc<Activity>("dashboard_activity", {}, 8000)) }),
  ["dashboard-activity-v2"],
  { revalidate: 20 },
);
export async function loadActivity(): Promise<Activity> {
  try {
    return await activityCached();
  } catch {
    return { ...EMPTY_ACTIVITY, now: new Date().toISOString() };
  }
}

/** Produktion der Werke im Zeitraum (Leads/Käufer je Tag, Land, Quelle/Status, Prüfgründe, Zähler je Lauf).
 *  Zwischengespeichert: laufender Zeitraum 10 min, abgeschlossene Zeiträume 1 h (große Zählung, schont die DB). */
export function loadProduction(from: string, to: string, today: string): Promise<Production> {
  const fn = unstable_cache(
    () => rpc<Production>("dashboard_production", { p_segment: SEGMENT, p_from: from, p_to: to }, 30_000),
    ["dashboard-production-v3", SEGMENT, from, to],
    { revalidate: to >= today ? 600 : 3600 },
  );
  return fn();
}

/** Zähler je Lauf und Teil der letzten Stunden (Leitstand: Ertrag je Linie, Auslastung). Kleine Tabelle, 60 s zwischengespeichert. */
const runRowsCached = unstable_cache(
  async (hours: number = 24): Promise<import("@/lib/leitstand").RunRow[]> => {
    {
      const since = new Date(Date.now() - hours * 3_600_000).toISOString();
      const { data, error } = await db().from("run_stats")
        .select("werk, part, run_id, country, started_at, finished_at, candidates, processed, green, yellow, red")
        .in("werk", ["lead-werk", "kunden-werk"]).gte("finished_at", since).order("finished_at", { ascending: false }).limit(5000)
        .abortSignal(AbortSignal.timeout(6000));
      if (error) throw new Error(error.message);
      return (data ?? []) as import("@/lib/leitstand").RunRow[];
    }
  },
  ["dashboard-run-rows-v2"],
  { revalidate: 60 },
);
export async function loadRunRows(hours = 24) {
  try {
    return await runRowsCached(hours);
  } catch {
    return [];
  }
}

export type GateCheck = { result: "released" | "failed"; failed_stage: number | null; reasons: string[]; context: string | null; checked_at: string;
  leads: { segment_id: string | null; country: string; signal_type: string; event_summary: string; watch_companies: { name: string } | null } | null };
/** Letzte Ergebnisse der Drei-Stufen-Freigabe (Prüfen-Reiter in JARVIS): je Lead Ergebnis, Stufe, Gründe. */
export async function loadGateChecks(limit = 12, failedOnly = false): Promise<GateCheck[]> {
  try {
    let q = db().from("lead_checks").select("result, failed_stage, reasons, context, checked_at, leads(segment_id, country, signal_type, event_summary, watch_companies(name))")
      .order("checked_at", { ascending: false }).limit(limit);
    if (failedOnly) q = q.eq("result", "failed");
    const { data, error } = await q.abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as GateCheck[];
  } catch {
    return [];
  }
}

export type SentMail = { sent_at: string; subject: string | null; kind: string; prospects: { id: string; company_name: string; country: string } | null };
/** Zuletzt gesendete Mails (Prüfen-Reiter Versand, Live-Ticker). */
export async function loadRecentSent(limit = 10): Promise<SentMail[]> {
  try {
    const { data, error } = await db().from("messages").select("sent_at, subject, kind, prospects(id, company_name, country)")
      .eq("status", "sent").order("sent_at", { ascending: false }).limit(limit).abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error(error.message);
    return (data ?? []) as unknown as SentMail[];
  } catch {
    return [];
  }
}

/** Gesendete Mails und Bounces/Beschwerden der letzten Tage je Postfach (für boxHealth); Fehler -> null. */
export async function loadBoxHealth(days = 14): Promise<BoxHealth[] | null> {
  try {
    const since = new Date(Date.now() - days * 86_400_000).toISOString();
    const sb = db();
    const [m, e] = await Promise.all([
      sb.from("messages").select("id, sent_from").eq("status", "sent").gte("sent_at", since).limit(20000).abortSignal(AbortSignal.timeout(5000)),
      sb.from("email_events").select("message_id, type, payload, messages(to_email)").in("type", ["bounced", "complained"])
        .gte("created_at", since).limit(5000).abortSignal(AbortSignal.timeout(5000)),
    ]);
    if (m.error || e.error) throw new Error((m.error ?? e.error)!.message);
    const events = ((e.data ?? []) as any[]).map((x) => ({
      message_id: x.message_id, type: x.type, bounce_type: x.payload?.bounce?.type ?? null,
      to_email: (Array.isArray(x.messages) ? x.messages[0] : x.messages)?.to_email ?? null,
    }));
    return boxHealth((m.data ?? []) as { id: string; sent_from: string | null }[], events);
  } catch {
    return null;
  }
}

/** Agenten-Aufträge (neueste 40). */
export async function loadAgentTasks(): Promise<import("@/lib/agents").AgentTask[]> {
  try {
    const { data, error } = await db().from("agent_tasks").select("*").order("created_at", { ascending: false }).limit(40).abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error(error.message);
    return (data ?? []) as import("@/lib/agents").AgentTask[];
  } catch {
    return [];
  }
}

/** Gestartete Belegung je Werk (werk_plan_log, geschrieben vom Plan-Job: Autopilot/Inhaber/Standard, Speicher-Bremse). */
export type PlanLog = { werk: "lead-werk" | "kunden-werk"; at: string; mode: "autopilot" | "inhaber" | "standard"; bremse: "aus" | "hinweis" | "drossel" | "ohne-rohbestand";
  db_bytes: number | null; plan: Record<string, number>; reasons: Record<string, string> };
export async function loadPlanLog(): Promise<Partial<Record<PlanLog["werk"], PlanLog>>> {
  try {
    const { data, error } = await db().from("werk_plan_log").select("werk, at, mode, bremse, db_bytes, plan, reasons")
      .order("at", { ascending: false }).limit(12).abortSignal(AbortSignal.timeout(4000));
    if (error) throw new Error(error.message);
    const out: Partial<Record<PlanLog["werk"], PlanLog>> = {};
    for (const r of (data ?? []) as PlanLog[]) if (!out[r.werk]) out[r.werk] = r;
    return out;
  } catch {
    return {};
  }
}

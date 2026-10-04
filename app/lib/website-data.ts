import "server-only";
import { db } from "@/lib/supabase";
import { toMessage, toSession, type ChatMessage, type ChatSession } from "@/lib/jarvis-chat";
import { WEBSITE_SESSION_TITLE, toAgent, toCheck, type SiteCheck, type TaskStatus, type WebsiteAgent } from "@/lib/website";

/**
 * Daten des Themenfelds „Website“ (Migration 20261004170000): letzter Website-Check und Verlauf, Website-Agenten mit
 * ihrem letzten Auftrag (agent_tasks), Chatfeld „Änderungswunsch“ (jarvis_sessions kind 'website', genau eine offene).
 * Nur serverseitig mit dem Service-Schlüssel. Fehlt eine Tabelle noch, liefert der Loader leere Teile mit Hinweis.
 */
const T = () => AbortSignal.timeout(6000);
const SESSION_COLS = "id, title, kind, flow_id, created_at, updated_at, read_at, archived";
const AGENT_COLS = "id, name, aufgabe, rhythmus, aktiv, last_run_at, last_task_id, last_result, created_at";
const missing = (code?: string) => code === "42P01" || code === "PGRST205" || code === "42703" || code === "23514";

export type AgentTaskLite = { id: string; status: TaskStatus; agent: number; progress: number; step: string | null };
export type WebsiteData = {
  check: SiteCheck | null; history: { at: string; total: number | null }[]; agents: WebsiteAgent[];
  tasks: Record<string, AgentTaskLite>; missing: boolean; error: string | null;
};

export async function loadWebsite(): Promise<WebsiteData> {
  const out: WebsiteData = { check: null, history: [], agents: [], tasks: {}, missing: false, error: null };
  const [c, a] = await Promise.all([
    db().from("website_checks").select("at, site, scores, funde, seiten").order("at", { ascending: false }).limit(14).abortSignal(T()),
    db().from("website_agents").select(AGENT_COLS).order("created_at", { ascending: true }).limit(60).abortSignal(T()),
  ]);
  for (const r of [c, a]) {
    if (r.error) {
      if (missing(r.error.code)) out.missing = true;
      else out.error = r.error.message;
    }
  }
  const rows = (c.data ?? []) as Record<string, unknown>[];
  out.check = toCheck(rows[0]);
  out.history = rows.map((r) => toCheck(r)).filter((x): x is SiteCheck => !!x).reverse().map((x) => {
    const v = Object.values(x.scores).filter((s): s is number => typeof s === "number");
    return { at: x.at, total: v.length ? Math.round(v.reduce((p, q) => p + q, 0) / v.length) : null };
  });
  out.agents = ((a.data ?? []) as Record<string, unknown>[]).map(toAgent);
  const ids = out.agents.map((x) => x.last_task_id).filter((x): x is string => !!x);
  if (ids.length) {
    const t = await db().from("agent_tasks").select("id, status, agent, progress, step").in("id", ids).abortSignal(T());
    for (const r of t.data ?? []) out.tasks[String(r.id)] = { id: String(r.id), status: r.status as TaskStatus, agent: Number(r.agent), progress: Number(r.progress) || 0, step: (r.step as string | null) ?? null };
  }
  return out;
}

/** Offene Website-Sitzung (genau eine); `create` legt sie an, wenn sie fehlt. */
export async function websiteSession(create: boolean): Promise<ChatSession | null> {
  const find = async () => {
    const { data, error } = await db().from("jarvis_sessions").select(SESSION_COLS).eq("kind", "website").eq("archived", false)
      .order("created_at", { ascending: false }).limit(1).abortSignal(T());
    if (error) throw Object.assign(new Error(`jarvis_sessions: ${error.message}`), { code: error.code });
    return data?.length ? toSession(data[0] as Record<string, unknown>) : null;
  };
  const cur = await find();
  if (cur || !create) return cur;
  const ins = await db().from("jarvis_sessions").insert({ title: WEBSITE_SESSION_TITLE, kind: "website" }).select(SESSION_COLS).maybeSingle();
  if (ins.error?.code === "23505") return find(); // parallel angelegt
  if (ins.error) throw Object.assign(new Error(`jarvis_sessions: ${ins.error.message}`), { code: ins.error.code });
  return ins.data ? toSession(ins.data as Record<string, unknown>) : null;
}

/** Verlauf der Website-Sitzung (älteste zuerst). */
export async function websiteMessages(sessionId: string, limit = 60): Promise<ChatMessage[]> {
  const { data, error } = await db().from("jarvis_messages").select("id, session_id, created_at, role, body, status, links")
    .eq("session_id", sessionId).order("created_at", { ascending: false }).limit(limit).abortSignal(T());
  if (error) throw new Error(`jarvis_messages: ${error.message}`);
  return (data ?? []).map((x) => toMessage(x as Record<string, unknown>)).reverse();
}

export const isMissingTable = (e: unknown) => missing((e as { code?: string })?.code);

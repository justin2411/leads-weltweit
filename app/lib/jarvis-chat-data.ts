import "server-only";
import { db } from "@/lib/supabase";
import { BERICHT_TITLE, flowSessionTitle, toMessage, toSession, type ChatMessage, type ChatSession } from "@/lib/jarvis-chat";

/**
 * Daten des JARVIS-Chats (Tabellen jarvis_sessions / jarvis_messages, Migration 20261004130000). Nur serverseitig mit
 * dem Service-Schlüssel. Fehlt die Tabelle noch (Migration nicht angewandt), werfen die Loader ChatMissing – die Seiten
 * zeigen dann einen Hinweis bzw. die Startseite den bisherigen Chat über Agenten-Aufträge.
 */
export class ChatMissing extends Error {}

const SESSION_COLS = "id, title, kind, flow_id, created_at, updated_at, read_at, archived";
const MSG_COLS = "id, session_id, created_at, role, body, status, links";
const T = () => AbortSignal.timeout(6000);

function fail(what: string, e: { message: string; code?: string }): never {
  // 42P01 = Tabelle fehlt, PGRST205 = PostgREST kennt sie nicht, 42703 = Spalte fehlt
  if (e.code === "42P01" || e.code === "PGRST205" || e.code === "42703") throw new ChatMissing(`${what}: ${e.message}`);
  throw new Error(`${what}: ${e.message}`);
}

/** Alle Sitzungen (ohne Baukasten) mit letzter Nachricht, letzter JARVIS-Antwort und offenen Nachrichten. */
export async function loadSessions(archived = false): Promise<ChatSession[]> {
  const s = await db().from("jarvis_sessions").select(SESSION_COLS).neq("kind", "baukasten").eq("archived", archived)
    .order("updated_at", { ascending: false }).limit(100).abortSignal(T());
  if (s.error) fail("jarvis_sessions", s.error);
  const list = (s.data ?? []).map((x) => toSession(x as Record<string, unknown>));
  if (!archived && !list.some((x) => x.kind === "bericht")) {
    // feste Sitzung fehlt (z. B. Migration ohne Startzeile) – anlegen; Doppel verhindert der eindeutige Index
    const ins = await db().from("jarvis_sessions").insert({ title: BERICHT_TITLE, kind: "bericht" }).select(SESSION_COLS).maybeSingle();
    if (!ins.error && ins.data) list.push(toSession(ins.data as Record<string, unknown>));
  }
  if (!list.length) return list;
  const ids = list.map((x) => x.id);
  const [last, open] = await Promise.all([
    db().from("jarvis_messages").select("session_id, created_at, role").in("session_id", ids).order("created_at", { ascending: false })
      .limit(500).abortSignal(T()),
    db().from("jarvis_messages").select("session_id").in("session_id", ids).in("status", ["offen", "in_arbeit"]).limit(500).abortSignal(T()),
  ]);
  if (last.error) fail("jarvis_messages", last.error);
  const lastAt = new Map<string, string>(), lastJ = new Map<string, string>(), openN = new Map<string, number>();
  for (const m of last.data ?? []) {
    const sid = String(m.session_id), at = String(m.created_at);
    if (!lastAt.has(sid)) lastAt.set(sid, at);
    if (m.role === "jarvis" && !lastJ.has(sid)) lastJ.set(sid, at);
  }
  for (const m of open.data ?? []) openN.set(String(m.session_id), (openN.get(String(m.session_id)) ?? 0) + 1);
  return list.map((x) => ({ ...x, last_at: lastAt.get(x.id) ?? null, last_jarvis_at: lastJ.get(x.id) ?? null, open: openN.get(x.id) ?? 0 }));
}

/** Eine Sitzung (auch archiviert, auch Baukasten); unbekannt → null. */
export async function loadSession(id: string): Promise<ChatSession | null> {
  const { data, error } = await db().from("jarvis_sessions").select(SESSION_COLS).eq("id", id).abortSignal(T()).maybeSingle();
  if (error) fail("jarvis_sessions", error);
  return data ? toSession(data as Record<string, unknown>) : null;
}

/** Verlauf einer Sitzung, älteste zuerst (die letzten `limit`). */
export async function loadMessages(sessionId: string, limit = 200): Promise<ChatMessage[]> {
  const { data, error } = await db().from("jarvis_messages").select(MSG_COLS).eq("session_id", sessionId)
    .order("created_at", { ascending: false }).limit(limit).abortSignal(T());
  if (error) fail("jarvis_messages", error);
  return (data ?? []).map((x) => toMessage(x as Record<string, unknown>)).reverse();
}

/** Gelesen markieren (Punkt bei Neuem verschwindet). Fehler sind egal. */
export async function markRead(id: string): Promise<void> {
  const { error } = await db().from("jarvis_sessions").update({ read_at: new Date().toISOString() }).eq("id", id);
  if (error) console.error("jarvis_sessions read_at:", error.message);
}

/** Offene Baukasten-Sitzung eines Flows (eine je Flow); `create` legt sie an, wenn sie fehlt. */
export async function flowSession(flowId: string, flowName: string, create: boolean): Promise<ChatSession | null> {
  const find = async () => {
    const { data, error } = await db().from("jarvis_sessions").select(SESSION_COLS).eq("kind", "baukasten").eq("flow_id", flowId)
      .eq("archived", false).order("created_at", { ascending: false }).limit(1).abortSignal(T());
    if (error) fail("jarvis_sessions", error);
    return data?.length ? toSession(data[0] as Record<string, unknown>) : null;
  };
  const cur = await find();
  if (cur || !create) return cur;
  const ins = await db().from("jarvis_sessions").insert({ title: flowSessionTitle(flowName), kind: "baukasten", flow_id: flowId })
    .select(SESSION_COLS).maybeSingle();
  if (ins.error?.code === "23505") return find(); // parallel angelegt
  if (ins.error) fail("jarvis_sessions", ins.error);
  return ins.data ? toSession(ins.data as Record<string, unknown>) : null;
}

/** Stand eines Flows für das Live-Nachladen im Baukasten (updated_at, Definition, Vorschlag aus dem Chat). */
export async function flowLiveState(flowId: string): Promise<{ updated_at: string; name: string; def: unknown; pending_def: unknown; pending_note: string | null } | null> {
  const { data, error } = await db().from("flows").select("updated_at, name, def").eq("id", flowId).abortSignal(T()).maybeSingle();
  if (error) throw new Error(`flows: ${error.message}`);
  if (!data) return null;
  let pending: { pending_def?: unknown; pending_note?: string | null } = {};
  const p = await db().from("flows").select("pending_def, pending_note").eq("id", flowId).abortSignal(T()).maybeSingle();
  if (!p.error && p.data) pending = p.data; // Spalten erst ab Migration 20261004130000
  return { updated_at: String(data.updated_at), name: String(data.name ?? ""), def: data.def, pending_def: pending.pending_def ?? null, pending_note: pending.pending_note ?? null };
}

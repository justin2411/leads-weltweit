"use server";

/**
 * Aktionen des JARVIS-Chats (Inhaber 04.10.2026: „eigenen chat mit unterschiedlichen sitzungen … wie mit claude“).
 * Jede Aktion: Sitzung prüfen (requireOwner, sonst 404), Eingabe serverseitig prüfen (lib/jarvis-chat.ts), schreiben,
 * protokollieren (owner_log). Nichts wird gelöscht: „Archivieren“ legt eine Sitzung ab. Beantwortet werden die
 * Nachrichten von der JARVIS-Routine (scripts/jarvis_chat.py, viermal pro Stunde) – hier wird nichts ausgeführt.
 */
import { revalidatePath } from "next/cache";
import { zentraleNeuRechnen } from "@/lib/zentrale-refresh-server";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { ChatInputError, checkBody, checkTitle, isChatMode, isSessionId, titleFrom, type ChatMessage, type ChatSession } from "@/lib/jarvis-chat";
import { loadMessages, loadSession } from "@/lib/jarvis-chat-data";
import { InputError, validateLlmBudget } from "@/lib/owner-settings";
import { requireOwner } from "../../actions";

const BY = "Inhaber Dashboard";
export type ChatResult<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

async function log(action: string, target: string | null, newValue: unknown) {
  await db().from("owner_log").insert({ action, target, old_value: null, new_value: newValue ?? null, created_by: BY });
}

async function guard<T extends object>(what: string, fn: () => Promise<T>): Promise<ChatResult<T>> {
  await requireOwner();
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof ChatInputError) return { ok: false, error: e.message };
    const ref = Math.random().toString(36).slice(2, 8);
    console.error(`jarvis-chat ${what} [${ref}]:`, e);
    return { ok: false, error: `${what} fehlgeschlagen – bitte gleich noch einmal (Fehler ${ref})` };
  }
}

async function newSession(title: string): Promise<string> {
  const { data, error } = await db().from("jarvis_sessions").insert({ title, kind: "chat" }).select("id").single();
  if (error) throw new Error(error.message);
  await log("jarvis:session", String(data.id), { title });
  return String(data.id);
}

/** Nachricht senden: in die Sitzung `sessionId` (Chat oder Tagesbericht), ohne Sitzung → neue mit Titel aus dem Text. */
async function send(sessionId: unknown, text: unknown): Promise<string> {
  const body = checkBody(text);
  let sid: string;
  if (sessionId === null || sessionId === undefined || sessionId === "") sid = await newSession(titleFrom(body));
  else {
    if (!isSessionId(sessionId)) throw new ChatInputError("Sitzung unbekannt");
    const s = await loadSession(sessionId);
    if (!s || s.kind === "baukasten" || s.kind === "website") throw new ChatInputError("Sitzung unbekannt");
    if (s.archived) throw new ChatInputError("Sitzung ist archiviert – neue Sitzung starten");
    sid = s.id;
  }
  const { error } = await db().from("jarvis_messages").insert({ session_id: sid, role: "inhaber", body, status: "offen" });
  if (error) throw new Error(error.message);
  await log("jarvis:message", sid, { chars: body.length });
  return sid;
}

export async function sendChat(sessionId: string | null, text: string): Promise<ChatResult<{ sessionId: string }>> {
  return guard("Senden", async () => ({ sessionId: await send(sessionId, text) }));
}

/** Feste Sitzungen (Gehirn, Tagesbericht) lassen sich weder umbenennen noch archivieren – ausdrücklich ablehnen. */
async function assertOwnChat(id: string) {
  const s = await loadSession(id.toLowerCase());
  if (!s) throw new ChatInputError("Sitzung unbekannt");
  if (s.kind === "gehirn") throw new ChatInputError("Der Gehirn-Chat bleibt immer");
  if (s.kind !== "chat") throw new ChatInputError("nur eigene Sitzungen lassen sich ändern");
}

export async function renameChatSession(id: string, title: string): Promise<ChatResult> {
  return guard("Umbenennen", async () => {
    const t = checkTitle(title);
    if (!isSessionId(id)) throw new ChatInputError("Sitzung unbekannt");
    await assertOwnChat(id);
    const { data, error } = await db().from("jarvis_sessions").update({ title: t }).eq("id", id).eq("kind", "chat").select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new ChatInputError("nur eigene Sitzungen lassen sich umbenennen");
    await log("jarvis:rename", id, { title: t });
    return {};
  });
}

/** Archivieren (nicht löschen). Der Tagesbericht bleibt immer. */
export async function archiveChatSession(id: string): Promise<ChatResult> {
  return guard("Archivieren", async () => {
    if (!isSessionId(id)) throw new ChatInputError("Sitzung unbekannt");
    await assertOwnChat(id);
    const { data, error } = await db().from("jarvis_sessions").update({ archived: true }).eq("id", id).eq("kind", "chat").select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new ChatInputError("Tagesbericht bleibt immer");
    await log("jarvis:archive", id, null);
    return {};
  });
}

/** Schalter „Assistent | Gehirn“ je Sitzung (die Gehirn-Sitzung bleibt immer Gehirn). */
export async function setChatMode(id: string, mode: string): Promise<ChatResult> {
  return guard("Umschalten", async () => {
    if (!isSessionId(id)) throw new ChatInputError("Sitzung unbekannt");
    if (!isChatMode(mode)) throw new ChatInputError("Modus unbekannt");
    const s = await loadSession(id.toLowerCase());
    if (!s || s.archived) throw new ChatInputError("Sitzung unbekannt");
    if (s.kind === "gehirn") { if (mode !== "gehirn") throw new ChatInputError("Der Gehirn-Chat spricht immer mit dem Gehirn"); return {}; }
    if (s.mode === mode) return {};
    const { error } = await db().from("jarvis_sessions").update({ mode }).eq("id", s.id);
    if (error) throw new Error(error.message);
    await log("jarvis:mode", s.id, { mode });
    revalidatePath("/dashboard/jarvis/chat");
    return {};
  });
}

/** Startseite „Schreib JARVIS“ (Formular): in die zuletzt genutzte Sitzung, dann den Chat öffnen. */
export async function sendFromJarvis(f: FormData) {
  await requireOwner();
  const sid = String(f.get("sid") ?? "") || null;
  let target: string;
  try {
    target = await send(sid, f.get("text"));
  } catch (e) {
    const msg = e instanceof ChatInputError ? e.message : "Senden fehlgeschlagen – bitte gleich noch einmal";
    if (!(e instanceof ChatInputError)) console.error("jarvis-chat start:", e);
    redirect(`/dashboard/jarvis?fehler=${encodeURIComponent(msg)}#chat`);
  }
  redirect(`/dashboard/jarvis/chat?s=${target}`);
}

/** Monatsgrenze der Sofort-Antworten (Claude-API) in Euro: 0–500 (0 = aus). Regler in der Chat-Kopfzeile. */
export async function setLlmBudget(raw: string): Promise<ChatResult> {
  await requireOwner();
  try {
    const value = validateLlmBudget(raw);
    const { data: old } = await db().from("owner_settings").select("value").eq("key", "llm_budget_eur").maybeSingle();
    const { error } = await db().from("owner_settings").upsert({ key: "llm_budget_eur", value, updated_at: new Date().toISOString(), updated_by: BY });
    if (error) throw new Error(error.message);
    await db().from("owner_log").insert({ action: "setting:llm_budget_eur", target: null, old_value: old?.value ?? null, new_value: value, created_by: BY });
    zentraleNeuRechnen();
    revalidatePath("/dashboard", "layout");
    return { ok: true };
  } catch (e) {
    if (e instanceof InputError) return { ok: false, error: e.message };
    const ref = Math.random().toString(36).slice(2, 8);
    console.error(`llm-budget [${ref}]:`, e instanceof Error ? e.message.slice(0, 160) : "Fehler");
    return { ok: false, error: `nicht gespeichert (Fehler ${ref})` };
  }
}

/** Verlauf einer Sitzung für die Mini-Chats und das große Chat-Fenster (Vergrößern). */
export async function chatSessionView(id: string): Promise<ChatResult<{ session: ChatSession; messages: ChatMessage[]; now: string }>> {
  return guard("Laden", async () => {
    if (!isSessionId(id)) throw new ChatInputError("Sitzung unbekannt");
    const s = await loadSession(id.toLowerCase());
    if (!s) throw new ChatInputError("Sitzung unbekannt");
    return { session: s, messages: await loadMessages(s.id, 60), now: new Date().toISOString() };
  });
}

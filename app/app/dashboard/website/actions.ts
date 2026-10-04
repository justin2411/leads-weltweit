"use server";

/**
 * Aktionen des Themenfelds „Website“ (Inhaber 04.10.2026). Jede Aktion: requireOwner (sonst 404), Eingabe serverseitig
 * prüfen (lib/website.ts bzw. lib/jarvis-chat.ts), schreiben, protokollieren (owner_log). Nichts wird gelöscht:
 * Website-Agenten werden ausgeschaltet, „Chat leeren“ archiviert die Sitzung. Umgesetzt werden Änderungswünsche und
 * Agenten-Aufträge von der JARVIS-Routine (docs/AGENTEN.md) – hier wird nichts ausgeführt.
 */
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { ChatInputError, checkBody, type ChatMessage } from "@/lib/jarvis-chat";
import { WebsiteInputError, isAgentId, validateAgent } from "@/lib/website";
import { isMissingTable, websiteMessages, websiteSession } from "@/lib/website-data";
import { requireOwner } from "../actions";

const BY = "Inhaber Dashboard";
type R<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string; missing?: boolean };

async function log(action: string, target: string | null, value: unknown) {
  await db().from("owner_log").insert({ action, target, old_value: null, new_value: value ?? null, created_by: BY });
}

async function guard<T extends object>(what: string, fn: () => Promise<T>): Promise<R<T>> {
  await requireOwner();
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof ChatInputError || e instanceof WebsiteInputError) return { ok: false, error: e.message };
    if (isMissingTable(e)) return { ok: false, error: "Website-Bereich wird gerade eingerichtet", missing: true };
    const ref = Math.random().toString(36).slice(2, 8);
    console.error(`website ${what} [${ref}]:`, e);
    return { ok: false, error: `${what} fehlgeschlagen (Fehler ${ref})` };
  }
}

const fail = (e: { message: string; code?: string }) => Object.assign(new Error(e.message), { code: e.code });

/** Website-Agent anlegen (Name, Aufgabe in einem Satz, Rhythmus). Der Wachhund beauftragt ihn, sobald er fällig ist. */
export async function createWebsiteAgent(input: { name: string; aufgabe: string; rhythmus: string }): Promise<R<{ id: string }>> {
  return guard("Anlegen", async () => {
    const a = validateAgent(input);
    const { data, error } = await db().from("website_agents").insert(a).select("id").single();
    if (error) throw fail(error);
    await log("website:agent-neu", String(data.id), a);
    revalidatePath("/dashboard/website");
    return { id: String(data.id) };
  });
}

/** Ein-/Ausschalten (statt Löschen). */
export async function setWebsiteAgentActive(id: string, aktiv: boolean): Promise<R> {
  return guard("Umschalten", async () => {
    if (!isAgentId(id)) throw new WebsiteInputError("Agent unbekannt");
    const { data, error } = await db().from("website_agents").update({ aktiv: aktiv === true }).eq("id", id).select("id");
    if (error) throw fail(error);
    if (!data?.length) throw new WebsiteInputError("Agent unbekannt");
    await log(aktiv ? "website:agent-an" : "website:agent-aus", id, { aktiv: aktiv === true });
    revalidatePath("/dashboard/website");
    return {};
  });
}

export type WebsiteChatState = { sessionId: string | null; messages: ChatMessage[]; now: string };

/** Verlauf des Chatfelds (die Seite fragt alle 20 s). */
export async function websiteChatState(): Promise<R<WebsiteChatState>> {
  return guard("Laden", async () => {
    const s = await websiteSession(false);
    return { sessionId: s?.id ?? null, messages: s ? await websiteMessages(s.id) : [], now: new Date().toISOString() };
  });
}

/** Änderungswunsch an JARVIS (Sitzung wird bei Bedarf angelegt) – gleicher Weg wie der Baukasten-Chat. */
export async function sendWebsiteChat(text: string): Promise<R<{ sessionId: string }>> {
  return guard("Senden", async () => {
    const body = checkBody(text);
    const s = await websiteSession(true);
    if (!s) throw new Error("Sitzung fehlt");
    const { error } = await db().from("jarvis_messages").insert({ session_id: s.id, role: "inhaber", body, status: "offen" });
    if (error) throw fail(error);
    await log("website:chat", s.id, { chars: body.length });
    return { sessionId: s.id };
  });
}

/** „Chat leeren“: Sitzung archivieren (nichts gelöscht), die nächste Nachricht startet eine neue. */
export async function clearWebsiteChat(): Promise<R> {
  return guard("Leeren", async () => {
    const s = await websiteSession(false);
    if (!s) return {};
    const { error } = await db().from("jarvis_sessions").update({ archived: true }).eq("id", s.id).eq("kind", "website");
    if (error) throw fail(error);
    await log("website:chat-leeren", s.id, null);
    return {};
  });
}

"use server";

/**
 * Baukasten-Chat (Inhaber 04.10.2026: „im baukasten egal ob bei master pipeline oder testflows auch text reinschreiben
 * … es soll dann mit meinen worten selber gebaut werden … feedback ob es so übernommen wurde … eigener chat unter dem
 * baukasten, der die änderungen live im baukasten anzeigt … sobald ein punkt fertig ist kann ich den chat wieder löschen
 * … die anpassungen bleiben aber immer bestehen außer ich lösche das element“).
 * Eine offene Sitzung je Flow (jarvis_sessions kind 'baukasten'). Gebaut wird von der JARVIS-Routine mit
 * scripts/flow_edit.py (Test-/Agenten-Flows direkt, Master und angeschlossene Flows nur als Vorschlag). Hier: lesen,
 * Nachricht schreiben, „Chat leeren“ (= Sitzung archivieren, neue leere; der Flow bleibt unverändert).
 */
import { db } from "@/lib/supabase";
import { ChatInputError, checkBody, type ChatMessage } from "@/lib/jarvis-chat";
import { ChatMissing, flowLiveState, flowSession, loadMessages } from "@/lib/jarvis-chat-data";
import { isUuid } from "@/lib/flow-io";
import { loadFlow } from "@/lib/flow-data";
import { requireOwner } from "../actions";

export type FlowChatState = {
  sessionId: string | null; messages: ChatMessage[]; now: string;
  /** Stand des Flows fürs Live-Nachladen: updated_at, Name, gespeicherte Definition, Vorschlag aus dem Chat */
  version: string; name: string; def: unknown; pending: unknown; pendingNote: string | null;
};
type R<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string; missing?: boolean };

async function guard<T extends object>(what: string, fn: () => Promise<T>): Promise<R<T>> {
  await requireOwner();
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof ChatInputError) return { ok: false, error: e.message };
    if (e instanceof ChatMissing) return { ok: false, error: "Chat wird gerade eingerichtet", missing: true };
    const ref = Math.random().toString(36).slice(2, 8);
    console.error(`baukasten-chat ${what} [${ref}]:`, e);
    return { ok: false, error: `${what} fehlgeschlagen (Fehler ${ref})` };
  }
}

async function mustFlow(id: unknown) {
  if (!isUuid(id)) throw new ChatInputError("erst speichern – dann baut JARVIS mit");
  const f = await loadFlow(id);
  if (!f) throw new ChatInputError("Flow unbekannt");
  return f;
}

async function log(action: string, target: string, value: unknown) {
  await db().from("owner_log").insert({ action, target, old_value: null, new_value: value ?? null, created_by: "Inhaber Dashboard" });
}

/** Verlauf und Stand des Flows (Baukasten fragt alle 20 s). */
export async function flowChatState(flowId: string): Promise<R<FlowChatState>> {
  return guard("Laden", async () => {
    if (!isUuid(flowId)) throw new ChatInputError("Flow unbekannt");
    const live = await flowLiveState(flowId);
    if (!live) throw new ChatInputError("Flow unbekannt");
    const s = await flowSession(flowId, live.name, false);
    const messages = s ? await loadMessages(s.id, 60) : [];
    return { sessionId: s?.id ?? null, messages, now: new Date().toISOString(), version: live.updated_at, name: live.name, def: live.def,
      pending: live.pending_def, pendingNote: live.pending_note };
  });
}

/** Nachricht an JARVIS zu diesem Flow (Sitzung wird bei Bedarf angelegt). */
export async function sendFlowChat(flowId: string, text: string): Promise<R<{ sessionId: string }>> {
  return guard("Senden", async () => {
    const body = checkBody(text);
    const f = await mustFlow(flowId);
    if (f.status === "archiv") throw new ChatInputError("Flow ist archiviert");
    const s = await flowSession(f.id, f.name, true);
    if (!s) throw new Error("Sitzung fehlt");
    const { error } = await db().from("jarvis_messages").insert({ session_id: s.id, role: "inhaber", body, status: "offen" });
    if (error) throw new Error(error.message);
    await log("baukasten:chat", f.id, { session: s.id, chars: body.length });
    return { sessionId: s.id };
  });
}

/** „Chat leeren“: Sitzung archivieren (nichts gelöscht), nächste Nachricht startet eine neue. Flow bleibt, wie er ist. */
export async function clearFlowChat(flowId: string): Promise<R> {
  return guard("Leeren", async () => {
    const f = await mustFlow(flowId);
    const s = await flowSession(f.id, f.name, false);
    if (!s) return {};
    const { error } = await db().from("jarvis_sessions").update({ archived: true }).eq("id", s.id).eq("kind", "baukasten");
    if (error) throw new Error(error.message);
    await log("baukasten:chat-leeren", f.id, { session: s.id });
    return {};
  });
}

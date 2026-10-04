import "server-only";
import { hasNew, lastUsed, orderSessions, type ChatMessage, type ChatSession } from "@/lib/jarvis-chat";
import { ChatMissing, loadMessages, loadSessions } from "@/lib/jarvis-chat-data";
import { instantEnabled } from "@/lib/jarvis-ask";
import { loadLlmState } from "@/lib/jarvis-context";

/** „Schreib JARVIS“ auf der Startseite: zuletzt genutzte Sitzung mit den letzten Nachrichten, Gehirn-Chat (ungelesen?). */
export type StartChat = { session: ChatSession | null; messages: ChatMessage[]; sessions: number; gehirnId: string | null; gehirnUnread: number; now: string;
  /** Sitzungen für das große Chat-Fenster (Vergrößern) und ob Sofort-Antworten eingerichtet sind */
  list: ChatSession[]; instant: boolean };

/** null = Chat-Tabellen fehlen noch oder nicht lesbar → Startseite zeigt den bisherigen Chat über Agenten-Aufträge. */
export async function loadStartChat(): Promise<StartChat | null> {
  try {
    const list = await loadSessions(false);
    const session = lastUsed(list);
    const gehirn = orderSessions(list).find((s) => s.kind === "gehirn");
    const messages = session ? (await loadMessages(session.id, 6)) : [];
    const llm = await loadLlmState().catch(() => null);
    const gehirnUnread = gehirn ? (gehirn.unread ?? (hasNew(gehirn) ? 1 : 0)) : 0;
    return { session, messages, sessions: list.filter((s) => s.kind === "chat").length, gehirnId: gehirn?.id ?? null, gehirnUnread, now: new Date().toISOString(),
      list: orderSessions(list).slice(0, 30), instant: instantEnabled() && (llm?.ok ?? true) };
  } catch (e) {
    if (!(e instanceof ChatMissing)) console.error("jarvis start chat:", e);
    return null;
  }
}

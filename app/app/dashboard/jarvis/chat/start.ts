import "server-only";
import { hasNew, lastUsed, orderSessions, type ChatMessage, type ChatSession } from "@/lib/jarvis-chat";
import { ChatMissing, loadMessages, loadSessions } from "@/lib/jarvis-chat-data";
import { instantEnabled } from "@/lib/jarvis-ask";
import { loadLlmState } from "@/lib/jarvis-context";

/** „Schreib JARVIS“ auf der Startseite: zuletzt genutzte Sitzung mit den letzten Nachrichten, Tagesbericht neu? */
export type StartChat = { session: ChatSession | null; messages: ChatMessage[]; sessions: number; berichtId: string | null; berichtNeu: boolean; now: string;
  /** Sitzungen für das große Chat-Fenster (Vergrößern) und ob Sofort-Antworten eingerichtet sind */
  list: ChatSession[]; instant: boolean };

/** null = Chat-Tabellen fehlen noch oder nicht lesbar → Startseite zeigt den bisherigen Chat über Agenten-Aufträge. */
export async function loadStartChat(): Promise<StartChat | null> {
  try {
    const list = await loadSessions(false);
    const session = lastUsed(list);
    const bericht = orderSessions(list).find((s) => s.kind === "bericht");
    const messages = session ? (await loadMessages(session.id, 6)) : [];
    const llm = await loadLlmState().catch(() => null);
    const berichtNeu = !!bericht && hasNew(bericht);
    return { session, messages, sessions: list.filter((s) => s.kind === "chat").length, berichtId: bericht?.id ?? null, berichtNeu, now: new Date().toISOString(),
      list: orderSessions(list).slice(0, 30), instant: instantEnabled() && (llm?.ok ?? true) };
  } catch (e) {
    if (!(e instanceof ChatMissing)) console.error("jarvis start chat:", e);
    return null;
  }
}

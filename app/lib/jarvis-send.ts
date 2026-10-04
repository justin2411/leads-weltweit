/**
 * Eine Sende-Funktion für alle Chat-Oberflächen (JARVIS-Chat, Mini-Chats, Baukasten-Chat, Website-Seite): schickt die
 * Nachricht an POST /api/jarvis/ask und liefert die Sofort-Antwort (oder den Hinweis, dass die Routine übernimmt).
 * Läuft im Browser; der API-Schlüssel bleibt auf dem Server. Nutzung: sendToJarvis({ sessionId, text }) bzw.
 * sendToJarvis({ flowId, text }) für den Baukasten; ohne sessionId entsteht eine neue Chat-Sitzung.
 */
import type { AskResult } from "./jarvis-ask.ts";

export type { AskResult };

export async function sendToJarvis(p: { sessionId?: string | null; flowId?: string | null; text: string; mode?: "assistent" | "gehirn" | null }): Promise<AskResult> {
  try {
    const r = await fetch("/api/jarvis/ask", {
      method: "POST", headers: { "Content-Type": "application/json" }, credentials: "same-origin", cache: "no-store",
      body: JSON.stringify({ session_id: p.sessionId ?? null, flow_id: p.flowId ?? null, text: p.text, mode: p.mode ?? null }),
    });
    if (r.status === 404) return { ok: false, error: "Sitzung abgelaufen – bitte neu anmelden" };
    const j = (await r.json().catch(() => null)) as AskResult | null;
    return j && typeof j === "object" && "ok" in j ? j : { ok: false, error: "Senden fehlgeschlagen – bitte gleich noch einmal" };
  } catch {
    return { ok: false, error: "keine Verbindung – bitte gleich noch einmal" };
  }
}

/** Label an einer Antwort: „Haiku“ / „Opus“ (Routine-Antworten ohne Label). */
export const modelLabel = (m: string | null | undefined) => (m === "haiku" ? "Haiku" : m === "opus" ? "Opus" : null);

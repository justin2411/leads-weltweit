/**
 * JARVIS-Chat mit Sitzungen (Inhaber 04.10.2026: „ich will mit jarvis direkt einen eigenen chat mit unterschiedlichen
 * sitzungen haben … wie mit claude … er soll auch selber jeden tag über einen speziellen chat sagen was er angepasst hat“)
 * und Baukasten-Chat („text reinschreiben … es soll dann mit meinen worten selber gebaut werden … feedback ob es so
 * übernommen wurde“). Reine Funktionen ohne Server-/React-Abhängigkeiten: Prüfung der Eingaben, Status je Nachricht
 * („startet um HH:MM“), Reihenfolge der Sitzungen, Punkt bei Neuem, frühere Chat-Aufträge (agent_tasks) lesbar.
 * Tabellen: signalwerk.jarvis_sessions / jarvis_messages (Migration 20261004140000); beantwortet von der JARVIS-Routine
 * (scripts/jarvis_chat.py, docs/AGENTEN.md).
 */
import { CHAT_BY, nextAgentRound, type AgentTask } from "./agents.ts";

/** website = Sitzung der Seite /dashboard/website (eigene Art, Kontext = letzter Website-Check). */
export type SessionKind = "chat" | "bericht" | "baukasten" | "website";
export type MsgStatus = "offen" | "in_arbeit" | "fertig";
export type ChatLink = { label: string; url: string };
export type ChatSession = {
  id: string; title: string; kind: SessionKind; flow_id: string | null; created_at: string; updated_at: string;
  read_at: string | null; archived: boolean;
  /** Zeit der letzten Nachricht (sonst null), letzte JARVIS-Antwort, offene Inhaber-Nachrichten */
  last_at?: string | null; last_jarvis_at?: string | null; open?: number;
};
export type ChatMessage = {
  id: string; session_id: string; created_at: string; role: "inhaber" | "jarvis"; body: string; status: MsgStatus | null;
  links: ChatLink[];
  /** Sofort-Antwort über die Claude-API: Modell und Kosten in Euro (null = Antwort der Routine) */
  model?: "haiku" | "opus" | null; cost_eur?: number | null;
};

export const BODY_MAX = 8000;
export const TITLE_MAX = 80;
/** Pseudo-Sitzung für die früheren Chat-Aufträge (agent_tasks, created_by „JARVIS-Chat“) – nur lesbar. */
export const LEGACY_ID = "frueher";
export const BERICHT_TITLE = "Tagesbericht";

export class ChatInputError extends Error {}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isSessionId = (x: unknown): x is string => typeof x === "string" && UUID_RE.test(x);

/** Nachricht prüfen: Zeilenumbrüche bleiben, Ränder weg, 1–8000 Zeichen. */
export function checkBody(x: unknown): string {
  const t = String(x ?? "").replace(/\r\n?/g, "\n").replace(/\u0000/g, "").trim();
  if (t.length < 1) throw new ChatInputError("Nachricht fehlt");
  if (t.length > BODY_MAX) throw new ChatInputError(`Nachricht: höchstens ${BODY_MAX} Zeichen`);
  return t;
}

/** Titel einer Sitzung: eine Zeile, 1–80 Zeichen. */
export function checkTitle(x: unknown): string {
  const t = String(x ?? "").replace(/\s+/g, " ").trim();
  if (t.length < 1 || t.length > TITLE_MAX) throw new ChatInputError(`Titel: 1 bis ${TITLE_MAX} Zeichen`);
  return t;
}

/** Titel aus der ersten Nachricht: erste Zeile, höchstens 40 Zeichen (an einer Wortgrenze gekürzt). */
export function titleFrom(text: string): string {
  const line = String(text ?? "").split("\n").map((s) => s.trim()).find(Boolean) ?? "";
  const t = line.replace(/\s+/g, " ");
  if (!t) return "Neue Sitzung";
  if (t.length <= 40) return t;
  const cut = t.slice(0, 40);
  const sp = cut.lastIndexOf(" ");
  return `${(sp > 20 ? cut.slice(0, sp) : cut).replace(/[\s,.;:–-]+$/, "")} …`;
}

/** Nur sichere Links (https oder Dashboard-Pfad), höchstens 10. */
export function safeLinks(x: unknown): ChatLink[] {
  if (!Array.isArray(x)) return [];
  const out: ChatLink[] = [];
  for (const l of x) {
    if (!l || typeof l !== "object") continue;
    const label = String((l as Record<string, unknown>).label ?? "").trim().slice(0, 80);
    const url = String((l as Record<string, unknown>).url ?? "").trim();
    const ok = /^https:\/\/[^\s]+$/.test(url) || (/^\/dashboard(\/|\?|$)/.test(url) && !url.includes("//"));
    if (label && ok && url.length <= 500) out.push({ label, url });
    if (out.length >= 10) break;
  }
  return out;
}

const TZ = "Europe/Berlin";
const hm = (d: Date) => new Intl.DateTimeFormat("de-DE", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(d);
const day = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: TZ }).format(d);

/** Uhrzeit in deutscher Zeit: heute „14:05“, sonst „03.10. 14:05“. */
export function chatTime(ts: string | null | undefined, now: Date): string {
  if (!ts) return "";
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return "";
  if (day(d) === day(now)) return hm(d);
  const dm = new Intl.DateTimeFormat("de-DE", { timeZone: TZ, day: "2-digit", month: "2-digit" }).format(d);
  return `${dm} ${hm(d)}`;
}

/** Nächster Lauf der JARVIS-Routine als „HH:MM“ (deutsche Zeit; Läufe :08, :23, :38, :53). */
export const nextRunAt = (now: Date) => hm(nextAgentRound(now));

/** Status unter einer Inhaber-Nachricht. JARVIS-Nachrichten haben keinen. */
export function statusText(m: Pick<ChatMessage, "role" | "status">, now: Date): { text: string; tone: "wait" | "work" | "done" } | null {
  if (m.role !== "inhaber" || !m.status) return null;
  if (m.status === "offen") return { text: `startet um ${nextRunAt(now)}`, tone: "wait" };
  if (m.status === "in_arbeit") return { text: "in Arbeit", tone: "work" };
  return { text: "erledigt", tone: "done" };
}

/** Kopfzeile einer Sitzung: offen → „startet um …“, in Arbeit, sonst null. */
export function sessionState(messages: Pick<ChatMessage, "role" | "status">[], now: Date): string | null {
  if (messages.some((m) => m.role === "inhaber" && m.status === "in_arbeit")) return "JARVIS arbeitet daran";
  if (messages.some((m) => m.role === "inhaber" && m.status === "offen")) return `startet um ${nextRunAt(now)}`;
  return null;
}

/** Neue JARVIS-Antwort seit dem letzten Lesen? */
export function hasNew(s: Pick<ChatSession, "read_at" | "last_jarvis_at">): boolean {
  if (!s.last_jarvis_at) return false;
  return !s.read_at || s.last_jarvis_at > s.read_at;
}

const lastOf = (s: ChatSession) => s.last_at ?? s.created_at;

/** Liste links: Tagesbericht oben angeheftet, dann Chats nach letzter Nachricht (neueste zuerst). Baukasten-Sitzungen
 *  und archivierte erscheinen nicht (die stehen unter dem Baukasten bzw. im Archiv). */
export function orderSessions(list: ChatSession[]): ChatSession[] {
  const bericht = list.filter((s) => s.kind === "bericht").slice(0, 1);
  const chats = list.filter((s) => s.kind === "chat" && !s.archived).sort((a, b) => (lastOf(a) < lastOf(b) ? 1 : lastOf(a) > lastOf(b) ? -1 : 0));
  return [...bericht, ...chats];
}

/** Zuletzt genutzte Chat-Sitzung (für „Schreib JARVIS“ auf der Startseite), sonst null. */
export function lastUsed(list: ChatSession[]): ChatSession | null {
  return orderSessions(list).find((s) => s.kind === "chat") ?? null;
}

/** Frühere Chat-Aufträge (agent_tasks, created_by „JARVIS-Chat“) als Nachrichten – älteste zuerst, nur lesbar. */
export function legacyMessages(tasks: AgentTask[]): ChatMessage[] {
  const out: ChatMessage[] = [];
  const chat = tasks.filter((t) => t.created_by === CHAT_BY).sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
  for (const t of chat) {
    const st: MsgStatus = t.status === "offen" ? "offen" : t.status === "laeuft" ? "in_arbeit" : "fertig";
    out.push({ id: `${t.id}-q`, session_id: LEGACY_ID, created_at: t.created_at, role: "inhaber", body: t.brief, status: st, links: [] });
    const reply = t.status === "abgebrochen" ? "Zurückgezogen." : t.result?.trim() || (t.status === "fehler" ? "Konnte ich nicht erledigen." : "");
    if (reply && (t.status === "fertig" || t.status === "fehler" || t.status === "abgebrochen"))
      out.push({ id: `${t.id}-a`, session_id: LEGACY_ID, created_at: t.finished_at ?? t.created_at, role: "jarvis", body: reply, status: null, links: [] });
  }
  return out;
}

/** Datenbank-Zeile → Nachricht (unbekannte Werte werden sicher gemacht). */
export function toMessage(x: Record<string, unknown>): ChatMessage {
  const role = x.role === "jarvis" ? "jarvis" : "inhaber";
  const st = x.status === "offen" || x.status === "in_arbeit" || x.status === "fertig" ? x.status : null;
  return {
    id: String(x.id), session_id: String(x.session_id), created_at: String(x.created_at ?? ""), role, body: String(x.body ?? ""),
    status: role === "inhaber" ? st ?? "offen" : null, links: safeLinks(x.links),
    model: x.model === "haiku" || x.model === "opus" ? x.model : null,
    cost_eur: x.cost_eur === null || x.cost_eur === undefined || !Number.isFinite(Number(x.cost_eur)) ? null : Number(x.cost_eur),
  };
}

/** Datenbank-Zeile → Sitzung. */
export function toSession(x: Record<string, unknown>): ChatSession {
  const kind: SessionKind = x.kind === "bericht" || x.kind === "baukasten" || x.kind === "website" ? x.kind : "chat";
  return {
    id: String(x.id), title: String(x.title ?? "") || "Sitzung", kind, flow_id: (x.flow_id as string | null) ?? null,
    created_at: String(x.created_at ?? ""), updated_at: String(x.updated_at ?? ""), read_at: (x.read_at as string | null) ?? null,
    archived: x.archived === true,
  };
}

/** Baukasten-Chat: Titel der Sitzung je Flow. */
export const flowSessionTitle = (name: string) => `Baukasten: ${String(name ?? "").trim() || "Flow"}`.slice(0, TITLE_MAX);

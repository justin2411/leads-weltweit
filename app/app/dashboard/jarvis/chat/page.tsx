import { loadAgentTasks } from "@/lib/dashboard-data";
import { LEGACY_ID, hasNew, isSessionId, lastUsed, legacyMessages, orderSessions, type ChatMessage, type ChatSession } from "@/lib/jarvis-chat";
import { ChatMissing, loadMessages, loadSession, loadSessions, markRead } from "@/lib/jarvis-chat-data";
import { requireOwner } from "../../actions";
import Link from "next/link";
import { Icon } from "@/app/icons";
import { ChatApp } from "./chat-ui";
import { JCHAT_CSS } from "./css";

export const metadata = { title: "JARVIS Chat" };
type SP = Promise<Record<string, string | string[] | undefined>>;

/**
 * JARVIS-Chat mit Sitzungen (Inhaber 04.10.2026: „eigenen chat mit unterschiedlichen sitzungen … wie mit claude …
 * er soll auch selber jeden tag über einen speziellen chat sagen was er angepasst hat“). Links Sitzungen (Tagesbericht
 * oben angeheftet, am Handy als Schublade), rechts der Verlauf mit Eingabe. Beantwortet von der JARVIS-Routine
 * (viermal pro Stunde, scripts/jarvis_chat.py); Aktualisierung alle 30 s über die Auto-Aktualisierung des Dashboards.
 * ?s=<id> Sitzung · ?s=neu leere neue Sitzung · ?s=frueher frühere Chat-Aufträge (nur lesbar) · ?archiv=1 Archiv.
 */
export default async function JarvisChatPage({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const sp = await searchParams;
  const sParam = typeof sp.s === "string" ? sp.s : "";
  const showArchive = sp.archiv === "1";
  const now = new Date();
  const css = <style dangerouslySetInnerHTML={{ __html: JCHAT_CSS }} />;

  let sessions: ChatSession[] = [], archived: ChatSession[] = [];
  try {
    [sessions, archived] = await Promise.all([loadSessions(false), showArchive ? loadSessions(true) : Promise.resolve([])]);
  } catch (e) {
    if (!(e instanceof ChatMissing)) console.error("jarvis chat:", e);
    return (
      <>
        {css}
        <section className="jc-missing" role="status">
          <h1>JARVIS Chat</h1>
          <p>{e instanceof ChatMissing ? "Der Chat wird gerade eingerichtet (Datenbank-Migration 20261004140000)." : "Chat konnte nicht laden – gleich noch einmal."}</p>
          <a href="/dashboard/jarvis#chat">Zurück zu JARVIS</a>
        </section>
      </>
    );
  }
  const tasks = await loadAgentTasks();
  const legacy = legacyMessages(tasks);
  const list = orderSessions(sessions);

  // Gewählte Sitzung: ?s=…, sonst die zuletzt genutzte, sonst neue
  let selected: ChatSession | null = null;
  let messages: ChatMessage[] = [];
  let mode: "session" | "neu" | "legacy" = "session";
  if (sParam === LEGACY_ID && legacy.length) { mode = "legacy"; messages = legacy; }
  else if (sParam === "neu") mode = "neu";
  else {
    const want = isSessionId(sParam) ? sParam.toLowerCase() : null;
    selected = (want && ([...sessions, ...archived].find((s) => s.id === want) ?? (await loadSession(want)))) || lastUsed(sessions) || null;
    if (selected?.kind === "baukasten") selected = null; // Baukasten-Chats stehen unter dem Baukasten
    if (selected) {
      messages = await loadMessages(selected.id);
      const known = sessions.find((s) => s.id === selected!.id);
      if (known && hasNew(known)) await markRead(selected.id);
    } else mode = "neu";
  }

  return (
    <>
      {css}
      <div className="jc-top">
        <nav className="jc-crumbs" aria-label="Pfad"><Link href="/dashboard/jarvis">JARVIS</Link><Icon name="weiter" size={14} /><span aria-current="page">Chat</span></nav>
        <Link href="/dashboard/jarvis" className="jc-back"><Icon name="weiter" size={14} />Zurück</Link>
      </div>
      <ChatApp now={now.toISOString()} sessions={list} archived={showArchive ? archived : null} selected={selected} messages={messages}
        mode={mode} legacyCount={legacy.length} />
    </>
  );
}

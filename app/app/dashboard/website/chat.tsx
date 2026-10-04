"use client";

/**
 * Chatfeld „Änderungswunsch“ (Inhaber 04.10.2026: „chatfeld, dass ich änderungswünsche direkt dort posten kann und diese
 * umgesetzt werden“). Großes, aufklappbares Feld wie der Baukasten-Chat; Verlauf und Eingabe aus dem JARVIS-Chat
 * (Thread/Composer), Status je Nachricht („startet um HH:MM“ / in Arbeit / erledigt, Link zum PR in der Antwort).
 * Eine offene Sitzung (jarvis_sessions kind 'website'), „Chat leeren“ archiviert. Fragt alle 20 s neu (sichtbarer Tab).
 */
import { useCallback, useEffect, useState, useTransition } from "react";
import { sessionState, type ChatMessage } from "@/lib/jarvis-chat";
import { Icon } from "@/app/icons";
import { Composer, Thread } from "../jarvis/chat/chat-ui";
import { clearWebsiteChat, sendWebsiteChat, websiteChatState } from "./actions";

const KEY = "ws-chat-open";
const POLL = 20_000;

export function WebsiteChat({ initial, now: nowIso, missing: missing0 }: { initial: ChatMessage[]; now: string; missing: boolean }) {
  const [open, setOpen] = useState(true);
  const [msgs, setMsgs] = useState<ChatMessage[]>(initial);
  const [now, setNow] = useState(() => new Date(nowIso));
  const [err, setErr] = useState<string | null>(null);
  const [missing, setMissing] = useState(missing0);
  const [busy, start] = useTransition();

  useEffect(() => {
    try { if (localStorage.getItem(KEY) === "zu") setOpen(false); } catch {}
  }, []);
  const toggle = (o: boolean) => {
    setOpen(o);
    try { localStorage.setItem(KEY, o ? "auf" : "zu"); } catch {}
  };

  const load = useCallback(async () => {
    const r = await websiteChatState().catch(() => null);
    if (!r) return;
    if (!r.ok) { setMissing(!!r.missing); if (!r.missing) setErr(r.error); return; }
    setMissing(false);
    setMsgs(r.messages);
    setNow(new Date(r.now));
  }, []);

  useEffect(() => {
    const id = setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL);
    const vis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, [load]);

  const send = async (text: string) => {
    const r = await sendWebsiteChat(text);
    if (r.ok) void load();
    return r.ok ? { ok: true as const } : { ok: false as const, error: r.error };
  };
  const clear = () => {
    if (!window.confirm("Chat leeren? Der Verlauf wird abgelegt, die Website bleibt, wie sie ist.")) return;
    start(async () => {
      const r = await clearWebsiteChat();
      if (!r.ok) { setErr(r.error); return; }
      setErr(null);
      setMsgs([]);
    });
  };

  const state = sessionState(msgs, now);
  return (
    <details className="bk-chat ws-chat" open={open} onToggle={(e) => toggle((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <Icon name="antworten" size={16} /><span>Änderungswunsch</span>
        <em>{state ?? (msgs.length ? `${msgs.length} Nachrichten` : "JARVIS setzt um")}</em>
        <i className="chev" aria-hidden><Icon name="runter" size={14} /></i>
      </summary>
      <div className="bk-chat-in">
        {missing ? (
          <p className="jc-empty">Chat wird gerade eingerichtet.</p>
        ) : (
          <>
            <Thread chatKey="ws" messages={msgs} now={now} compact empty={<span className="ws-chat-empty"><Icon name="website" size={22} />Schreib, was sich an der Website ändern soll.<br />JARVIS baut es und meldet sich mit Link.</span>} />
            {err && <p className="jc-err" role="alert"><Icon name="achtung" size={15} />{err}</p>}
            <Composer chatKey="ws" sessionId={null} now={now} onError={setErr} send={send} placeholder="z. B. „Überschrift auf der UK-Seite kürzer“ (Enter sendet)" />
            <div className="bk-chat-f">
              <span><Icon name="schloss" size={13} />Keine Preise, kein Versand · Rechtstexte nur nach deiner Vorgabe</span>
              {msgs.length > 0 && <button type="button" onClick={clear} disabled={busy}><Icon name="rueckgaengig" size={14} />Chat leeren</button>}
            </div>
          </>
        )}
      </div>
    </details>
  );
}

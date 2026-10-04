"use client";

/**
 * Chat unter der Baukasten-Fläche (Inhaber 04.10.2026: „eigener chat unter dem baukasten, der die änderungen live im
 * baukasten anzeigt … feedback ob es so übernommen wurde … sobald ein punkt fertig ist kann ich den chat wieder
 * löschen“). Einklappbar (Zustand im Browser gemerkt), Verlauf + Eingabe, Status je Nachricht („startet um HH:MM“).
 * Fragt alle 20 s den Stand ab (nur sichtbarer Tab) und meldet ihn dem Editor (onRemote) – der lädt neu, wenn der Chat
 * den Flow geändert hat und keine eigenen ungespeicherten Änderungen da sind, sonst Hinweis „Chat hat geändert“.
 */
import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { parseFlow, type Flow, type FlowKind } from "@/lib/flow";
import { sessionState, type ChatMessage } from "@/lib/jarvis-chat";
import { Icon } from "@/app/icons";
import { Composer, Thread } from "../jarvis/chat/chat-ui";
import { sendToJarvis } from "@/lib/jarvis-send";
import { clearFlowChat, flowChatState } from "./chat-actions";

export type Remote = { version: string; name: string; def: Flow | null; pending: Flow | null; note: string | null };
const KEY = "bk-chat-open";
const POLL = 20_000;

export function FlowChat({ flowId, kind, proposal, stale, onRemote, onReload, instant = true }: {
  flowId: string | null; kind: FlowKind;
  /** Sofort-Antwort eingerichtet (sonst Hinweis: Routine antwortet) */
  instant?: boolean;
  /** Flow gilt schon für neue Leads (Master, angeschlossen): JARVIS baut nur Vorschläge */
  proposal: boolean;
  /** Chat hat geändert, eigene Änderungen ungespeichert → Hinweis mit „neu laden“ */
  stale: boolean; onRemote: (r: Remote) => void; onReload: () => void;
}) {
  const [open, setOpen] = useState(true);
  const [msgs, setMsgs] = useState<ChatMessage[]>([]);
  const [now, setNow] = useState(() => new Date());
  const [err, setErr] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [busy, start] = useTransition();
  const cb = useRef(onRemote);
  cb.current = onRemote;

  useEffect(() => {
    try { if (localStorage.getItem(KEY) === "zu") setOpen(false); } catch {}
  }, []);
  const toggle = (o: boolean) => {
    setOpen(o);
    try { localStorage.setItem(KEY, o ? "auf" : "zu"); } catch {}
  };

  const load = useCallback(async () => {
    if (!flowId) return;
    const r = await flowChatState(flowId).catch(() => null);
    if (!r) return;
    if (!r.ok) { setMissing(!!r.missing); if (!r.missing) setErr(r.error); return; }
    setMissing(false);
    setMsgs(r.messages);
    setNow(new Date(r.now));
    const def = parseFlow(r.def), pend = r.pending ? parseFlow(r.pending) : null;
    cb.current({ version: r.version, name: r.name, def: def.ok ? def.flow : null, pending: pend?.ok ? pend.flow : null, note: r.pendingNote });
  }, [flowId]);

  useEffect(() => {
    if (!flowId) return;
    void load();
    const id = setInterval(() => { if (document.visibilityState === "visible") void load(); }, POLL);
    const vis = () => { if (document.visibilityState === "visible") void load(); };
    document.addEventListener("visibilitychange", vis);
    return () => { clearInterval(id); document.removeEventListener("visibilitychange", vis); };
  }, [flowId, load]);

  // Sofort-Antwort über /api/jarvis/ask (gleiche Sende-Funktion wie alle Chats); danach Verlauf und Flow neu laden
  const send = async (text: string) => {
    if (!flowId) return { ok: false as const, error: "erst speichern" };
    const r = await sendToJarvis({ flowId, text });
    if (!r.ok) return r;
    await load();
    return { ok: true as const, hint: r.fallback?.hint ?? null };
  };
  const clear = () => {
    if (!flowId || !window.confirm("Chat leeren? Der Verlauf wird abgelegt, der Flow bleibt genau so, wie er ist.")) return;
    start(async () => {
      const r = await clearFlowChat(flowId);
      if (!r.ok) { setErr(r.error); return; }
      setErr(null);
      setMsgs([]);
      void load();
    });
  };

  const state = sessionState(msgs, now);
  const where = kind === "master" ? "Master-Pipeline" : kind === "agent" ? "Agent" : "Flow";
  return (
    <details className="bk-chat" open={open} onToggle={(e) => toggle((e.currentTarget as HTMLDetailsElement).open)}>
      <summary>
        <Icon name="jarvis" size={16} /><span>Chat mit JARVIS</span>
        <em>{!flowId ? "nach dem Speichern" : state ?? (msgs.length ? `${msgs.length} Nachrichten` : "baut mit deinen Worten")}</em>
        <i className="chev" aria-hidden><Icon name="runter" size={14} /></i>
      </summary>
      <div className="bk-chat-in">
        {stale && (
          <p className="bk-chat-stale" role="status"><Icon name="achtung" size={15} /><span>Chat hat den {where} geändert – deine Änderungen sind noch nicht gespeichert.</span>
            <button type="button" onClick={onReload}>Neu laden</button></p>
        )}
        {!flowId ? (
          <p className="jc-empty">Erst speichern – dann schreibst du hier, was JARVIS am {where} bauen soll.</p>
        ) : missing ? (
          <p className="jc-empty">Chat wird gerade eingerichtet.</p>
        ) : (
          <>
            <Thread messages={msgs} now={now} compact empty={kind === "master"
              ? "Schreib, was die Master-Pipeline tun soll – JARVIS baut es als Vorschlag, du übernimmst mit einem Klick."
              : "Schreib, was gebaut werden soll, z. B. „nur Leads mit Telefon, dann Top 100“."} />
            {err && <p className="jc-err" role="alert"><Icon name="achtung" size={15} />{err}</p>}
            <Composer sessionId={null} now={now} onError={setErr} send={send} instant={instant} placeholder="Was soll JARVIS hier bauen? (Enter sendet)" />
            <div className="bk-chat-f">
              <span><Icon name="schloss" size={13} />{kind === "master" ? "Master: JARVIS schlägt vor – aktiv erst nach „Übernehmen“."
                : proposal ? "Läuft in der Pipeline: JARVIS schlägt vor – gilt erst nach „Speichern“." : "Gebaute Bausteine bleiben, bis du sie löschst."}</span>
              {msgs.length > 0 && <button type="button" onClick={clear} disabled={busy}><Icon name="rueckgaengig" size={14} />Chat leeren</button>}
            </div>
          </>
        )}
      </div>
    </details>
  );
}

"use client";

/**
 * Mini-Chat mit „Vergrößern“ (Inhaber 04.10.2026: „chat größer machen oder so das ich ihn aufklappen kann“) – für
 * „Schreib JARVIS“ auf der Startseite und alle Themen-Mini-Chats (z. B. Website-Seite). Antwortet sofort über
 * /api/jarvis/ask (lib/jarvis-send.ts, „JARVIS denkt …“), sonst übernimmt die Routine. „Vergrößern“ öffnet den Chat als
 * großes Fenster (Desktop ca. 80 % Breite/Höhe, Handy Vollbild) mit Sitzungsliste; Esc oder X schließt, der Verlauf ist
 * in der Höhe ziehbar, „Ganze Seite“ führt zu /dashboard/jarvis/chat.
 */
import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { chatTime, sessionState, type ChatMessage, type ChatSession } from "@/lib/jarvis-chat";
import { sendToJarvis } from "@/lib/jarvis-send";
import { Icon } from "@/app/icons";
import { Composer, Thread } from "./chat/chat-ui";
import { chatSessionView } from "./chat/actions";

export type MiniChatProps = {
  title: string; icon?: "jarvis" | "statistik" | "start-seite";
  sessionId: string | null; messages: ChatMessage[]; now: string;
  /** Sofort-Antwort eingerichtet (Schlüssel gesetzt, Grenze nicht erreicht) */
  instant: boolean;
  /** Sitzungen für die Liste im großen Fenster (leer = keine Liste) */
  sessions?: ChatSession[];
  /** wie viele Nachrichten klein sichtbar sind */
  show?: number;
  empty?: string; placeholder?: string;
  /** zusätzliche Links unter dem Chat */
  footer?: ReactNode;
  id?: string;
};

export function MiniChat(p: MiniChatProps) {
  const [sid, setSid] = useState<string | null>(p.sessionId);
  const [title, setTitle] = useState(p.title);
  const [msgs, setMsgs] = useState<ChatMessage[]>(p.messages);
  const [now, setNow] = useState(() => new Date(p.now));
  const [err, setErr] = useState<string | null>(null);
  const [big, setBig] = useState(false);

  const reload = useCallback(async (id: string) => {
    const r = await chatSessionView(id).catch(() => null);
    if (!r) return;
    if (!r.ok) { setErr(r.error); return; }
    setSid(r.session.id);
    setTitle(r.session.title);
    setMsgs(r.messages);
    setNow(new Date(r.now));
  }, []);

  // Großes Fenster: ganzen Verlauf laden
  useEffect(() => { if (big && sid) void reload(sid); }, [big, sid, reload]);

  const send = async (text: string) => {
    const r = await sendToJarvis({ sessionId: sid, text });
    if (!r.ok) return r;
    await reload(r.sessionId);
    return { ok: true as const, hint: r.fallback?.hint ?? null };
  };

  const state = sessionState(msgs, now);
  const small = msgs.slice(-(p.show ?? 4));
  const full = sid ? `/dashboard/jarvis/chat?s=${sid}` : "/dashboard/jarvis/chat";
  const body = (compact: boolean) => (
    <>
      <Thread messages={compact ? small : msgs} now={now} compact={compact} empty={p.empty ?? "Aufgabe oder Frage eintippen – JARVIS antwortet sofort."} />
      {err && <p className="jc-err" role="alert"><Icon name="achtung" size={15} />{err}</p>}
      <Composer sessionId={sid} now={now} onError={setErr} send={send} instant={p.instant}
        placeholder={p.placeholder ?? "z. B. „Wie viele Proben sind bereit?“ oder „UK Käufer finden“"} />
    </>
  );

  return (
    <section className="jcard jchat jmc" id={p.id} aria-label={p.title}>
      <header className="jcard-h">
        <h2><Icon name={p.icon ?? "jarvis"} size={18} /> {p.title}</h2>
        <em>{state ?? (sid ? <Link href={full}>{title}</Link> : "neue Sitzung")}</em>
        <button type="button" className="jmc-big" onClick={() => setBig(true)} aria-haspopup="dialog" title="Chat groß öffnen">
          <Icon name="vergroessern" size={15} /><span>Vergrößern</span>
        </button>
      </header>
      {!big && body(true)}
      {p.footer && <p className="lock">{p.footer}</p>}
      {big && (
        <BigChat title={title} sid={sid} sessions={p.sessions ?? []} now={now} fullHref={full} onClose={() => setBig(false)}
          onPick={(id) => { setErr(null); void reload(id); }} onNew={() => { setSid(null); setTitle("Neue Sitzung"); setMsgs([]); }}>
          {body(false)}
        </BigChat>
      )}
    </section>
  );
}

/** Großes Chat-Fenster (Dialog): links Sitzungen, rechts Verlauf + Eingabe. Esc/X schließt, Fokus bleibt im Fenster. */
function BigChat({ title, sid, sessions, now, fullHref, onClose, onPick, onNew, children }: {
  title: string; sid: string | null; sessions: ChatSession[]; now: Date; fullHref: string;
  onClose: () => void; onPick: (id: string) => void; onNew: () => void; children: ReactNode;
}) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    const key = (e: KeyboardEvent) => { if (e.key === "Escape") { e.preventDefault(); onClose(); } };
    document.addEventListener("keydown", key);
    const ov = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    box.current?.querySelector<HTMLTextAreaElement>("textarea")?.focus();
    return () => { document.removeEventListener("keydown", key); document.body.style.overflow = ov; prev?.focus?.(); };
  }, [onClose]);
  return (
    <div className="jmodal" role="presentation" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="jmodal-w" role="dialog" aria-modal="true" aria-label={`JARVIS Chat: ${title}`} ref={box}>
        {sessions.length > 0 && (
          <aside className="jmodal-side" aria-label="Sitzungen">
            <button type="button" className="jc-new" onClick={onNew}><Icon name="neu" size={15} />Neu</button>
            <ul className="jc-list">
              {sessions.map((s) => (
                <li key={s.id}>
                  <a href={`/dashboard/jarvis/chat?s=${s.id}`} className={`${s.id === sid ? "on" : ""}${s.kind === "bericht" ? " pin" : ""}`}
                    onClick={(e) => { e.preventDefault(); onPick(s.id); }} aria-current={s.id === sid ? "true" : undefined}>
                    <i aria-hidden><Icon name={s.kind === "bericht" ? "statistik" : "antwort"} size={15} /></i>
                    <span className="t">{s.title}</span>
                    <time>{chatTime(s.last_at ?? s.created_at, now)}</time>
                  </a>
                </li>
              ))}
            </ul>
          </aside>
        )}
        <section className="jmodal-main">
          <header className="jc-head">
            <h1 title={title}><Icon name="jarvis" size={18} /><span>{title}</span></h1>
            <span className="jc-sp" />
            <Link href={fullHref} className="jmodal-full"><Icon name="pfeil" size={14} />Ganze Seite</Link>
            <button type="button" className="jc-ib" onClick={onClose} aria-label="Schließen (Esc)" title="Schließen (Esc)"><Icon name="schliessen" size={17} /></button>
          </header>
          <div className="jmodal-body">{children}</div>
        </section>
      </div>
    </div>
  );
}

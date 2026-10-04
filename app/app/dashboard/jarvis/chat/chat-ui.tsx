"use client";

/**
 * JARVIS-Chat im Browser: Sitzungsliste (am Handy Schublade), Verlauf, Eingabe (Enter sendet, Shift+Enter neue Zeile).
 * Geschrieben wird nur über die Server-Actions in actions.ts; danach lädt router.refresh() den neuen Stand.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { BODY_MAX, LEGACY_ID, chatTime, hasNew, nextRunAt, sessionState, statusText, type ChatMessage, type ChatSession } from "@/lib/jarvis-chat";
import { Icon } from "@/app/icons";
import { archiveChatSession, renameChatSession, sendChat } from "./actions";

type Mode = "session" | "neu" | "legacy";

export function ChatApp({ now: nowIso, sessions, archived, selected, messages, mode, legacyCount }: {
  now: string; sessions: ChatSession[]; archived: ChatSession[] | null; selected: ChatSession | null; messages: ChatMessage[];
  mode: Mode; legacyCount: number;
}) {
  const router = useRouter();
  const now = new Date(nowIso);
  const [drawer, setDrawer] = useState(false);
  const [busy, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);
  const [renaming, setRenaming] = useState(false);
  const sid = mode === "session" ? selected?.id ?? null : null;
  const title = mode === "legacy" ? "Frühere Aufträge" : mode === "neu" ? "Neue Sitzung" : selected?.title ?? "Sitzung";
  const state = mode === "session" ? sessionState(messages, now) : null;
  const readOnly = mode === "legacy" || !!selected?.archived;

  useEffect(() => { setDrawer(false); setRenaming(false); setErr(null); }, [sid, mode]);

  const go = (href: string) => router.push(href);
  // Neue Sitzung entsteht erst mit der ersten Nachricht (Titel aus dem Text) – kein leerer Eintrag in der Liste
  const newSession = () => go("/dashboard/jarvis/chat?s=neu");
  const archive = () => {
    if (!selected || !window.confirm(`Sitzung „${selected.title}“ archivieren? Sie bleibt im Archiv lesbar, nichts wird gelöscht.`)) return;
    start(async () => {
      const r = await archiveChatSession(selected.id);
      if (!r.ok) { setErr(r.error); return; }
      go("/dashboard/jarvis/chat");
    });
  };
  const rename = (t: string) => start(async () => {
    if (!selected) return;
    const r = await renameChatSession(selected.id, t);
    if (!r.ok) { setErr(r.error); return; }
    setRenaming(false);
    router.refresh();
  });

  return (
    <div className={`jc${drawer ? " jc-drw" : ""}`}>
      <aside className="jc-side" aria-label="Sitzungen">
        <div className="jc-side-h">
          <h2><Icon name="jarvis" size={16} /> Sitzungen</h2>
          <button type="button" className={`jc-new${mode === "neu" ? " on" : ""}`} onClick={newSession}><Icon name="neu" size={15} />Neu</button>
          <button type="button" className="jc-ib jc-only-m" onClick={() => setDrawer(false)} aria-label="Sitzungen schließen"><Icon name="schliessen" size={16} /></button>
        </div>
        <ul className="jc-list">
          {sessions.map((s) => {
            const on = mode === "session" && s.id === sid;
            const dot = !on && hasNew(s);
            return (
              <li key={s.id}>
                <Link href={`/dashboard/jarvis/chat?s=${s.id}`} className={`${on ? "on" : ""}${s.kind === "bericht" ? " pin" : ""}`} aria-current={on ? "page" : undefined}>
                  <i aria-hidden><Icon name={s.kind === "bericht" ? "statistik" : "antwort"} size={15} /></i>
                  <span className="t">{s.title}</span>
                  {(s.open ?? 0) > 0 ? <em className="jc-open" title="offene Nachrichten">{s.open}</em> : null}
                  {dot && <b className="jc-dot" aria-label="neu" />}
                  <time>{s.kind === "bericht" && !s.last_at ? "täglich" : chatTime(s.last_at ?? s.created_at, now)}</time>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="jc-more">
          {legacyCount > 0 && <Link href={`/dashboard/jarvis/chat?s=${LEGACY_ID}`} className={mode === "legacy" ? "on" : ""}><Icon name="uhr" size={14} />Frühere Aufträge ({legacyCount})</Link>}
          <Link href={archived ? "/dashboard/jarvis/chat" : "/dashboard/jarvis/chat?archiv=1"}><Icon name="speicher" size={14} />{archived ? "Archiv ausblenden" : "Archiv"}</Link>
        </div>
        {archived && (
          <ul className="jc-list jc-arch">
            {archived.length ? archived.map((s) => (
              <li key={s.id}><Link href={`/dashboard/jarvis/chat?s=${s.id}&archiv=1`} className={s.id === sid ? "on" : ""}>
                <i aria-hidden><Icon name="speicher" size={14} /></i><span className="t">{s.title}</span><time>{chatTime(s.updated_at, now)}</time></Link></li>
            )) : <li className="jc-none">Archiv ist leer</li>}
          </ul>
        )}
      </aside>
      <div className="jc-shade" onClick={() => setDrawer(false)} aria-hidden />

      <section className="jc-main" aria-label={title}>
        <header className="jc-head">
          <button type="button" className="jc-ib jc-only-m" onClick={() => setDrawer(true)} aria-label="Sitzungen öffnen"><Icon name="menue" size={18} /></button>
          {renaming && selected ? (
            <form className="jc-rename" onSubmit={(e) => { e.preventDefault(); rename(String(new FormData(e.currentTarget).get("t") ?? "")); }}>
              <input name="t" defaultValue={selected.title} maxLength={80} autoFocus aria-label="Titel der Sitzung" />
              <button type="submit" disabled={busy} aria-label="Titel speichern"><Icon name="ok" size={15} /></button>
              <button type="button" onClick={() => setRenaming(false)} aria-label="Abbrechen"><Icon name="schliessen" size={15} /></button>
            </form>
          ) : (
            <h1 title={title}>{selected?.kind === "bericht" ? <Icon name="statistik" size={18} /> : <Icon name="jarvis" size={18} />}<span>{title}</span></h1>
          )}
          {state && <em className="jc-state"><Icon name={state.startsWith("startet") ? "uhr" : "werk"} size={14} />{state}</em>}
          <span className="jc-sp" />
          {selected?.kind === "chat" && !selected.archived && !renaming && (
            <>
              <button type="button" className="jc-ib" onClick={() => setRenaming(true)} aria-label="Umbenennen" title="Umbenennen"><Icon name="einstellungen" size={16} /></button>
              <button type="button" className="jc-ib" onClick={archive} disabled={busy} aria-label="Archivieren" title="Archivieren"><Icon name="speicher" size={16} /></button>
            </>
          )}
        </header>
        {err && <p className="jc-err" role="alert"><Icon name="achtung" size={15} />{err}</p>}
        <Thread messages={messages} now={now} empty={
          mode === "neu" ? "Schreib JARVIS, was er tun oder prüfen soll – er antwortet hier."
            : selected?.kind === "bericht" ? "Hier schreibt JARVIS jeden Morgen, was er angepasst hat."
            : "Noch leer – schreib die erste Nachricht."
        } />
        {readOnly ? (
          <p className="jc-ro"><Icon name="schloss" size={14} />{mode === "legacy" ? "Ältere Chat-Aufträge – nur lesbar. Neue Nachrichten gehen in die Sitzungen." : "Archiviert – nur lesbar."}</p>
        ) : (
          <Composer sessionId={sid} now={now} onError={setErr} />
        )}
      </section>
    </div>
  );
}

/** Verlauf: Inhaber rechts, JARVIS links; Zeiten in deutscher Zeit; Status unter jeder eigenen Nachricht. */
export function Thread({ messages, now, empty, compact = false }: { messages: ChatMessage[]; now: Date; empty: ReactNode; compact?: boolean }) {
  const box = useRef<HTMLOListElement>(null);
  const n = messages.length;
  // nur im Verlauf selbst nach unten scrollen – nie die ganze Seite
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [n]);
  if (!n) return <p className="jc-empty">{empty}</p>;
  return (
    <ol ref={box} className={`jc-log${compact ? " cmp" : ""}`} aria-live="polite">
      {messages.map((m) => {
        const st = statusText(m, now);
        return (
          <li key={m.id} className={m.role === "jarvis" ? "bot" : "me"}>
            <div className="b">
              {m.role === "jarvis" && <b className="who">JARVIS</b>}
              <p>{m.body}</p>
              {m.links.length > 0 && (
                <span className="lk">{m.links.map((l, i) => l.url.startsWith("/")
                  ? <Link key={i} href={l.url}><Icon name="pfeil" size={12} />{l.label}</Link>
                  : <a key={i} href={l.url} target="_blank" rel="noopener noreferrer"><Icon name="pfeil" size={12} />{l.label}</a>)}</span>
              )}
            </div>
            <span className="meta">
              <time dateTime={m.created_at}>{chatTime(m.created_at, now)}</time>
              {st && <em className={`jc-st ${st.tone}`}><Icon name={st.tone === "done" ? "ok" : st.tone === "work" ? "werk" : "uhr"} size={12} />{st.text}</em>}
            </span>
          </li>
        );
      })}
    </ol>
  );
}

/** Eingabe: Enter sendet, Shift+Enter neue Zeile. Ohne Sitzung entsteht beim Senden eine neue (Titel aus dem Text). */
export function Composer({ sessionId, now, onError, send, placeholder }: {
  sessionId: string | null; now: Date; onError: (e: string | null) => void;
  /** eigener Versand (Baukasten-Chat); ohne = JARVIS-Chat */
  send?: (text: string) => Promise<{ ok: true } | { ok: false; error: string }>; placeholder?: string;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [busy, start] = useTransition();
  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    start(async () => {
      if (send) {
        const r = await send(t);
        if (!r.ok) { onError(r.error); return; }
        onError(null);
        setText("");
        return;
      }
      const r = await sendChat(sessionId, t);
      if (!r.ok) { onError(r.error); return; }
      onError(null);
      setText("");
      if (r.sessionId !== sessionId) router.push(`/dashboard/jarvis/chat?s=${r.sessionId}`);
      else router.refresh();
    });
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  };
  return (
    <form className="jc-comp" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} rows={2} maxLength={BODY_MAX} disabled={busy}
        aria-label="Nachricht an JARVIS" placeholder={placeholder ?? "Nachricht an JARVIS … (Enter sendet, Shift+Enter neue Zeile)"} />
      <button type="submit" className="go" disabled={busy || !text.trim()} aria-label="Senden"><Icon name="weiter" size={17} /><span>Senden</span></button>
      <small className="jc-hint"><Icon name="uhr" size={12} />Antwort im nächsten Lauf · startet um {nextRunAt(now)}</small>
    </form>
  );
}

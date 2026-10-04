"use client";

/**
 * JARVIS-Chat im Browser: Sitzungsliste (am Handy Schublade), Verlauf, Eingabe (Enter sendet, Shift+Enter neue Zeile).
 * Geschrieben wird nur über die Server-Actions in actions.ts; danach lädt router.refresh() den neuen Stand.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore, useTransition, type KeyboardEvent, type ReactNode } from "react";
import { BODY_MAX, LEGACY_ID, chatTime, hasNew, modeOf, nextRunAt, sessionState, statusText, type ChatMessage, type ChatMode, type ChatSession } from "@/lib/jarvis-chat";
import { Icon } from "@/app/icons";
import { sendToJarvis, modelLabel } from "@/lib/jarvis-send";
import { archiveChatSession, renameChatSession, setChatMode } from "./actions";
import { ModeSwitch } from "./mode-switch";
import { LlmBudget, type LlmView } from "./budget";

type Mode = "session" | "neu" | "legacy";

export function ChatApp({ now: nowIso, sessions, archived, selected, messages, mode, legacyCount, instant = false, llm = null }: {
  now: string; sessions: ChatSession[]; archived: ChatSession[] | null; selected: ChatSession | null; messages: ChatMessage[];
  mode: Mode; legacyCount: number;
  /** Sofort-Antwort eingerichtet (Schlüssel gesetzt) und Kosten des Monats („API diesen Monat: x,xx € von 30 €“) */
  instant?: boolean; llm?: LlmView | null;
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
  const isGehirn = selected?.kind === "gehirn";
  // Schalter „Assistent | Gehirn“: je Sitzung gespeichert; neue Sitzung übernimmt die Wahl beim ersten Senden
  const [chatMode, setMode] = useState<ChatMode>(modeOf(selected));
  useEffect(() => { setMode(modeOf(selected)); }, [selected]);
  const switchMode = (m: ChatMode) => {
    setMode(m);
    if (!sid) return;
    start(async () => {
      const r = await setChatMode(sid, m);
      if (!r.ok) { setErr(r.error); setMode(modeOf(selected)); return; }
      router.refresh();
    });
  };

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
          <button type="button" className="jc-ib x-btn jc-only-m" onClick={() => setDrawer(false)} aria-label="Sitzungen schließen"><Icon name="schliessen" size={16} /></button>
        </div>
        <ul className="jc-list">
          {sessions.map((s) => {
            const on = mode === "session" && s.id === sid;
            const g = s.kind === "gehirn";
            const unread = !on && g ? s.unread ?? 0 : 0;
            const dot = !on && !unread && hasNew(s);
            return (
              <li key={s.id}>
                <Link href={`/dashboard/jarvis/chat?s=${s.id}`} className={`${on ? "on" : ""}${g ? " pin gold" : ""}${s.mode === "gehirn" && !g ? " mg" : ""}`} aria-current={on ? "page" : undefined}>
                  <i aria-hidden><Icon name={g || s.mode === "gehirn" ? "gehirn" : s.kind === "bericht" ? "statistik" : "antwort"} size={15} /></i>
                  <span className="t">{s.title}</span>
                  {(s.open ?? 0) > 0 ? <em className="jc-open" title="offene Nachrichten">{s.open}</em> : null}
                  {unread > 0 && <b className="jc-unread" aria-label={`${unread} neu`}>{unread}</b>}
                  {dot && <b className="jc-dot" aria-label="neu" />}
                  <time>{g && !s.last_at ? "Updates vom Gehirn" : chatTime(s.last_at ?? s.created_at, now)}</time>
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

      <section className={`jc-main${chatMode === "gehirn" ? " is-g" : ""}`} aria-label={title}>
        <header className="jc-head">
          <button type="button" className="jc-ib jc-only-m" onClick={() => setDrawer(true)} aria-label="Sitzungen öffnen"><Icon name="menue" size={18} /></button>
          {renaming && selected ? (
            <form className="jc-rename" onSubmit={(e) => { e.preventDefault(); rename(String(new FormData(e.currentTarget).get("t") ?? "")); }}>
              <input name="t" defaultValue={selected.title} maxLength={80} autoFocus aria-label="Titel der Sitzung" />
              <button type="submit" disabled={busy} aria-label="Titel speichern"><Icon name="ok" size={15} /></button>
              <button type="button" className="x-btn" onClick={() => setRenaming(false)} aria-label="Abbrechen"><Icon name="schliessen" size={15} /></button>
            </form>
          ) : (
            <h1 title={title}>{isGehirn || chatMode === "gehirn" ? <Icon name="gehirn" size={18} /> : selected?.kind === "bericht" ? <Icon name="statistik" size={18} /> : <Icon name="jarvis" size={18} />}<span>{title}</span></h1>
          )}
          {state && <em className="jc-state"><Icon name={state.startsWith("startet") ? "uhr" : "werk"} size={14} />{state}</em>}
          <span className="jc-sp" />
          <LlmBudget llm={llm} />
          {selected?.kind === "chat" && !selected.archived && !renaming && (
            <>
              <button type="button" className="jc-ib" onClick={() => setRenaming(true)} aria-label="Umbenennen" title="Umbenennen"><Icon name="einstellungen" size={16} /></button>
              <button type="button" className="jc-ib" onClick={archive} disabled={busy} aria-label="Archivieren" title="Archivieren"><Icon name="speicher" size={16} /></button>
            </>
          )}
        </header>
        {mode !== "legacy" && !selected?.archived && (
          <div className="jc-modebar"><ModeSwitch mode={chatMode} onChange={switchMode} locked={isGehirn} busy={busy} /></div>
        )}
        {err && <p className="jc-err" role="alert"><Icon name="achtung" size={15} />{err}</p>}
        <Thread messages={messages} now={now} who={chatMode === "gehirn" ? "GEHIRN" : "JARVIS"} empty={
          isGehirn ? "Hier meldet das Gehirn kurz, was ihm auffällt und was es als Nächstes tut. Schreib ihm direkt."
            : mode === "neu" ? (chatMode === "gehirn" ? "Frag das Gehirn – Ziele, KPIs, Strategie. Es denkt mit und handelt selbst." : "Schreib JARVIS, was er tun oder prüfen soll – er antwortet hier.")
            : selected?.kind === "bericht" ? "Frühere Tagesberichte. Neue stehen im Gehirn-Chat."
            : "Noch leer – schreib die erste Nachricht."
        } />
        {readOnly ? (
          <p className="jc-ro"><Icon name="schloss" size={14} />{mode === "legacy" ? "Ältere Chat-Aufträge – nur lesbar. Neue Nachrichten gehen in die Sitzungen." : "Archiviert – nur lesbar."}</p>
        ) : (
          <Composer sessionId={sid} now={now} onError={setErr} instant={instant && (llm?.ok ?? true)} mode={chatMode} />
        )}
      </section>
    </div>
  );
}

/** Verlauf: Inhaber rechts, JARVIS links; Zeiten in deutscher Zeit; Status unter jeder eigenen Nachricht. */
/**
 * Gerade gesendete Nachricht je Chat (Inhaber 04.10.2026: „fixe es das ich einen flüssigen chat mit ihm haben kann“):
 * der Composer meldet sie, der Verlauf zeigt sie unten an – mit „JARVIS denkt …“ – statt in einem zweiten Kasten über
 * der Eingabe. Sobald eine neue Nachricht im Verlauf steht (letzte ID anders), verschwindet der Platzhalter.
 */
type Pend = { text: string; think: string; base: string | null } | null;
const pendStore = new Map<string, Pend>();
const pendSubs = new Set<() => void>();
function setPend(key: string, p: Pend) { pendStore.set(key, p); pendSubs.forEach((f) => f()); }
function usePend(key: string): Pend {
  return useSyncExternalStore(
    (f) => { pendSubs.add(f); return () => { pendSubs.delete(f); }; },
    () => pendStore.get(key) ?? null,
    () => null,
  );
}

export function Thread({ messages, now, empty, compact = false, chatKey = "chat", who = "JARVIS" }: { messages: ChatMessage[]; now: Date; empty: ReactNode; compact?: boolean; chatKey?: string;
  /** Name über den Antworten (Gehirn-Modus: „GEHIRN“) */
  who?: string }) {
  const box = useRef<HTMLOListElement>(null);
  const n = messages.length;
  const pend = usePend(chatKey);
  const last = messages.at(-1)?.id ?? null;
  lastId.set(chatKey, last);
  // neue Nachricht ist da → Platzhalter weg
  useEffect(() => { if (pend && last !== pend.base) setPend(chatKey, null); }, [last, pend, chatKey]);
  const shown = pend && last === pend.base ? pend : null;
  // nur im Verlauf selbst nach unten scrollen – nie die ganze Seite
  useEffect(() => { const el = box.current; if (el) el.scrollTop = el.scrollHeight; }, [n, shown]);
  if (!n && !shown) return <p className="jc-empty">{empty}</p>;
  return (
    <ol ref={box} className={`jc-log${compact ? " cmp" : ""}`} aria-live="polite">
      {messages.map((m) => {
        const st = statusText(m, now);
        return (
          <li key={m.id} className={m.role === "jarvis" ? "bot" : "me"}>
            <div className="b">
              {m.role === "jarvis" && <b className="who">{who}{modelLabel(m.model) && <em className="jc-model" title="Sofort-Antwort über die Claude-API">{modelLabel(m.model)}</em>}</b>}
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
      {shown && <>
        <li className="me"><div className="b"><p>{shown.text}</p></div></li>
        <li className="bot"><div className="b"><b className="who">{who}</b><p className="jc-think">{shown.think}</p></div></li>
      </>}
    </ol>
  );
}
/** letzte Nachricht je Chat beim letzten Rendern (Basis für den Platzhalter) */
const lastId = new Map<string, string | null>();

/** Eingabe: Enter sendet, Shift+Enter neue Zeile. Ohne Sitzung entsteht beim Senden eine neue (Titel aus dem Text).
 *  Sofort-Antwort über /api/jarvis/ask (lib/jarvis-send.ts): während des Wartens „JARVIS denkt …“, danach lädt der
 *  Verlauf neu. Ohne Schlüssel/bei erreichter Grenze bleibt die Nachricht offen und die Routine antwortet (Hinweis). */
export function Composer({ sessionId, now, onError, send, placeholder, instant = true, onDone, chatKey = "chat", mode = "assistent" }: {
  sessionId: string | null; now: Date; onError: (e: string | null) => void;
  /** eigener Versand (Baukasten-Chat, Mini-Chats); ohne = JARVIS-Chat-Seite */
  send?: (text: string) => Promise<{ ok: true; hint?: string | null } | { ok: false; error: string }>; placeholder?: string;
  /** Sofort-Antwort eingerichtet (ANTHROPIC_API_KEY gesetzt) */
  instant?: boolean;
  /** nach erfolgreichem Senden (eigener Versand) */
  onDone?: () => void;
  /** derselbe Schlüssel wie beim zugehörigen Thread (mehrere Chats auf einer Seite) */
  chatKey?: string;
  /** Schalter „Assistent | Gehirn“ (für neue Sitzungen; bestehende tragen ihn selbst) */
  mode?: ChatMode;
}) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [hint, setHint] = useState<string | null>(null);
  const [busy, start] = useTransition();
  const submit = () => {
    const t = text.trim();
    if (!t || busy) return;
    // sofort im Verlauf zeigen, Eingabe leeren; bei Fehler kommt der Text zurück
    setPend(chatKey, { text: t, think: instant ? (mode === "gehirn" ? "Gehirn denkt …" : "JARVIS denkt …") : "wird gespeichert …", base: lastId.get(chatKey) ?? null });
    setText("");
    setHint(null);
    const fail = (e: string) => { setPend(chatKey, null); setText(t); onError(e); };
    start(async () => {
      try {
        if (send) {
          const r = await send(t);
          if (!r.ok) { fail(r.error); return; }
          onError(null);
          setHint(r.hint ?? null);
          onDone?.();
          return;
        }
        const r = await sendToJarvis({ sessionId, text: t, mode });
        if (!r.ok) { fail(r.error); return; }
        onError(null);
        setHint(r.fallback?.hint ?? null);
        if (r.sessionId !== sessionId) router.push(`/dashboard/jarvis/chat?s=${r.sessionId}`);
        else router.refresh();
      } catch {
        fail("Senden fehlgeschlagen – bitte nochmal.");
      }
    });
    // Sicherheitsnetz: Platzhalter nie länger als 90 s
    setTimeout(() => { if (pendStore.get(chatKey)?.text === t) setPend(chatKey, null); }, 90_000);
  };
  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); submit(); }
  };
  return (
    <form className="jc-comp" onSubmit={(e) => { e.preventDefault(); submit(); }}>
      {hint && <p className="jc-hint2" role="status"><Icon name="uhr" size={13} />{hint}</p>}
      <textarea value={text} onChange={(e) => setText(e.target.value)} onKeyDown={onKey} rows={2} maxLength={BODY_MAX}
        aria-label="Nachricht an JARVIS" placeholder={placeholder ?? (mode === "gehirn" ? "Frag das Gehirn … z. B. „Was ist dein Plan für heute?“" : "Nachricht an JARVIS … (Enter sendet, Shift+Enter neue Zeile)")} />
      <button type="submit" className="go" disabled={busy || !text.trim()} aria-label="Senden"><Icon name="weiter" size={17} /><span>Senden</span></button>
      <small className="jc-hint"><Icon name={instant ? (mode === "gehirn" ? "gehirn" : "jarvis") : "uhr"} size={12} />{instant ? (mode === "gehirn" ? "Gehirn · Opus mit Zielen, KPIs und Wissen" : "Antwort sofort · einfache Fragen Haiku, Systemzugriff Opus") : `Sofort-Antwort aus – Schlüssel fehlt, Agent antwortet um ${nextRunAt(now)}`}</small>
    </form>
  );
}

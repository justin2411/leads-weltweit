/**
 * „JARVIS empfiehlt“ (Inhaber 04.10.2026: „das jarvis mir immer auch sagt was er optimieren würde, was wir besser machen
 * können gerne am anfang … als kurzen knappen text“) und JARVIS-Chat („mit jarvis schreiben … aufgaben per text geben
 * … über mein claude abo“). Server-Komponenten; Empfehlungen aus echten Zahlen (recommend()), Chat als Server Action.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { tipTask, type Rec } from "@/lib/leitstand";
import { KINDS, agentBoard, chatThread, isIdle, type AgentTask, marketLabel } from "@/lib/agents";
import { chatToJarvis } from "../control-actions";
import { Back } from "../v2";
/** Agent mit Zustand (frei/belegt) – früher aus dnd.tsx (Ziehen auf Agenten entfällt, Zentrale 05.10.2026). */
export type AgentPick = { n: number; free: boolean; state: string };
import { TipX } from "./dismiss";
import { tipKey, tipReactKeys } from "@/lib/tips";
import { Icon } from "@/app/icons";
import { MiniChat } from "./mini-chat";
import type { StartChat } from "./chat/start";

const when = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Adresse, die das Agenten-Fenster mit dem Auftrag des Hinweises vorbelegt öffnet (Inhaber bestätigt mit einem Klick). */
export function giveHref(agent: number, t: NonNullable<Rec["task"]>) {
  const q = new URLSearchParams({ a: String(agent), k: t.kind, b: t.brief });
  if (t.market) q.set("m", t.market);
  return `/dashboard/jarvis?${q}`;
}

/** Agenten für das Menü „an A…“ der Chips (frei = kein laufender/offener Auftrag). */
export function agentPicks(tasks: AgentTask[]): AgentPick[] {
  return agentBoard(tasks).map((a) => ({ n: a.n, free: isIdle(a), state: a.current ? `${KINDS[a.current.kind].label} · ${STATE[a.current.status]}` : "frei" }));
}
const STATE: Record<AgentTask["status"], string> = { offen: "startet bald", laeuft: "arbeitet", fertig: "fertig", fehler: "Fehler", abgebrochen: "frei" };

/** 2–3 Optimierungen, je eine Karte: Titel, kurzer Grund, Klick zur Station, „an A…“ (erster freier Agent, vorbelegt) oder
 *  ziehen – jede Karte, auch ohne eigenen Auftrag (tipTask). X = ausblenden (7 Tage, rote Alarme 24 h; lib/tips.ts).
 *  children: weitere Hinweise (Chips) unter den Karten. */
export function Empfiehlt({ recs, href, agent, children }: { recs: Rec[]; href: (r: Rec) => string; agent: number; children?: ReactNode }) {
  if (!recs.length && !children) return null;
  return (
    <section className="jrec" aria-label="JARVIS empfiehlt">
      <h2><Icon name="trend-hoch" size={16} /> JARVIS empfiehlt </h2>
      {recs.length > 0 && <div className="jrec-l">
        {recs.map((r, i, all) => {
          // stabiler Schlüssel statt Index: nach dem X rückt die nächste Empfehlung nicht in den versteckten Knoten
          const key = tipReactKeys(all)[i];
          const task = tipTask(r);
          return (
            <div key={key} className={`jrec-i ${r.level}`}>
                <Link href={href(r)} scroll={false} className="jrec-t" draggable={false}><b>{r.title}</b><span>{r.short}</span></Link>
                <Link href={giveHref(agent, task)} scroll={false} className="jrec-give" draggable={false} title={`als Auftrag „${KINDS[task.kind].label}${task.market ? ` · ${marketLabel(task.market)}` : ""}“ an Agent ${agent} (erster freier)`}>
                  <Icon name="an-agent" size={16} /><span>an A{agent}</span>
                </Link>
                <TipX k={tipKey(r)} level={r.level} title={r.title} />
            </div>
          );
        })}
      </div>}
      {children}
    </section>
  );
}

/** Chat: mit Sitzungen (chat gesetzt) die zuletzt genutzte Sitzung – Senden schreibt dort hinein und öffnet den Chat;
 *  ohne (Tabellen fehlen noch) wie bisher Chat-Aufträge an Agenten. startAt = nächste Runde. */
export function JarvisChat({ tasks, startAt, chat = null }: { tasks: AgentTask[]; startAt?: string; chat?: StartChat | null }) {
  if (chat) return <SessionChat chat={chat} startAt={startAt} />;
  const thread = chatThread(tasks, 6, startAt);
  const waiting = thread.some((x) => x.status === "offen" || x.status === "laeuft");
  const queued = thread.some((x) => x.status === "offen");
  return (
    <section className="jcard jchat" id="chat" aria-label="Schreib JARVIS">
      <header className="jcard-h">
        <h2><Icon name="jarvis" size={18} /> Schreib JARVIS</h2>
        {waiting ? <em>{queued && startAt ? `startet um ${startAt}` : "in Arbeit"}</em> : thread.length ? <em>{thread.length} im Verlauf</em> : null}
      </header>
      {thread.length > 0 ? (
        <ol className="jchat-log">
          {thread.map((x) => (
            <li key={x.id}>
              <p className="me"><span>{x.text}</span><time>{when(x.at)} · {KINDS[x.kind].label}{x.market ? ` · ${marketLabel(x.market)}` : ""}</time></p>
              <p className={`bot st-${x.status}`}><b>JARVIS</b> {x.reply}</p>
            </li>
          ))}
        </ol>
      ) : <p className="jchat-empty">Aufgabe oder Frage eintippen – ein freier Agent übernimmt.</p>}
      <form action={chatToJarvis} className="jchat-f">
        <Back to="/dashboard/jarvis?c=1" />
        <textarea name="text" required minLength={3} maxLength={1000} rows={2} aria-label="Nachricht an JARVIS" placeholder="z. B. „UK Käufer finden“ oder „Warum keine Antworten in FR?“" />
        <button className="go"><Icon name="weiter" size={16} /> Senden</button>
      </form>
      <p className="lock"><Icon name="uhr" size={14} /> Über dein Claude-Abo{startAt ? `, nächste Runde ${startAt}` : ""}. Keine API-Kosten, nie Mails.</p>
    </section>
  );
}

/** „Schreib JARVIS“ mit Sitzungen (Inhaber 04.10.2026: „eigenen chat mit unterschiedlichen sitzungen … wie mit claude“,
 *  „alle chats sollen direkt antworten“, „chat größer machen“): zuletzt genutzte Sitzung als Mini-Chat mit Sofort-Antwort
 *  und „Vergrößern“ (großes Fenster mit Sitzungsliste). */
function SessionChat({ chat }: { chat: StartChat; startAt?: string }) {
  const s = chat.session;
  const href = s ? `/dashboard/jarvis/chat?s=${s.id}` : "/dashboard/jarvis/chat";
  return (
    <MiniChat id="chat" title="Schreib JARVIS" sessionId={s?.id ?? null} messages={chat.messages} now={chat.now} instant={chat.instant} mode={s?.mode}
      sessions={chat.list} footer={(
        <>
          <Link href={href} className="jchat-all"><Icon name="antwort" size={14} /> {chat.sessions > 1 ? `Alle ${chat.sessions} Sitzungen` : "Chat öffnen"}</Link>
          <Link href={chat.gehirnId ? `/dashboard/jarvis/chat?s=${chat.gehirnId}` : "/dashboard/jarvis/chat"} className="jchat-all jchat-gehirn">
            <Icon name="gehirn" size={14} /> Gehirn{chat.gehirnUnread > 0 ? <b className="jc-unread" aria-label={`${chat.gehirnUnread} neu`}>{chat.gehirnUnread}</b> : null}
          </Link>
        </>
      )} />
  );
}

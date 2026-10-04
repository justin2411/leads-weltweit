/**
 * „JARVIS empfiehlt“ (Inhaber 04.10.2026: „das jarvis mir immer auch sagt was er optimieren würde, was wir besser machen
 * können gerne am anfang … als kurzen knappen text“) und JARVIS-Chat („mit jarvis schreiben … aufgaben per text geben
 * … über mein claude abo“). Server-Komponenten; Empfehlungen aus echten Zahlen (recommend()), Chat als Server Action.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { Rec } from "@/lib/leitstand";
import { KINDS, chatThread, type AgentTask } from "@/lib/agents";
import { chatToJarvis } from "../control-actions";
import { Back } from "../v2";
import { DragBox } from "./dnd";
import { TipX } from "./dismiss";
import { tipKey } from "@/lib/tips";
import { Icon } from "@/app/icons";
import { chatTime, statusText } from "@/lib/jarvis-chat";
import { sendFromJarvis } from "./chat/actions";
import type { StartChat } from "./chat/start";

const when = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Adresse, die das Agenten-Fenster mit dem Auftrag des Hinweises vorbelegt öffnet (Inhaber bestätigt mit einem Klick). */
export function giveHref(agent: number, t: NonNullable<Rec["task"]>) {
  const q = new URLSearchParams({ a: String(agent), k: t.kind, b: t.brief });
  if (t.market) q.set("m", t.market);
  return `/dashboard/jarvis?${q}`;
}

/** 2–3 Optimierungen, je eine Karte: Titel, kurzer Grund, Klick zur Station, „an Agent“ (vorbelegt) oder ziehen,
 *  X = ausblenden (7 Tage, rote Alarme 24 h; lib/tips.ts).
 *  children: weitere Hinweise (Chips) unter den Karten. */
export function Empfiehlt({ recs, href, agent, children }: { recs: Rec[]; href: (r: Rec) => string; agent: number; children?: ReactNode }) {
  if (!recs.length && !children) return null;
  return (
    <section className="jrec" aria-label="JARVIS empfiehlt">
      <h2><Icon name="trend-hoch" size={16} /> JARVIS empfiehlt</h2>
      {recs.length > 0 && <div className="jrec-l">
        {recs.map((r, i) => {
          const row = (
            <div key={i} className={`jrec-i ${r.level}`} data-tip={r.task ? undefined : ""}>
              <Link href={href(r)} scroll={false} className="jrec-t"><b>{r.title}</b><span>{r.short}</span></Link>
              {r.task && (
                <Link href={giveHref(agent, r.task)} scroll={false} className="jrec-give" title={`als Auftrag „${KINDS[r.task.kind].label}${r.task.market ? ` · ${r.task.market}` : ""}“ an Agent ${agent} – oder auf A1–A8 ziehen`}>
                  <Icon name="an-agent" size={16} /><span>an A{agent}</span>
                </Link>
              )}
              <TipX k={tipKey(r)} level={r.level} title={r.title} />
            </div>
          );
          return r.task ? <DragBox key={i} task={r.task} title={r.title} tip>{row}</DragBox> : row;
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
              <p className="me"><span>{x.text}</span><time>{when(x.at)} · {KINDS[x.kind].label}{x.market ? ` · ${x.market}` : ""}</time></p>
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

/** „Schreib JARVIS“ mit Sitzungen (Inhaber 04.10.2026: „eigenen chat mit unterschiedlichen sitzungen … wie mit claude“):
 *  letzte Nachrichten der zuletzt genutzten Sitzung, Eingabe schreibt dort hinein und öffnet den Chat. */
function SessionChat({ chat, startAt }: { chat: StartChat; startAt?: string }) {
  const now = new Date(chat.now);
  const s = chat.session;
  const open = chat.messages.some((m) => m.role === "inhaber" && (m.status === "offen" || m.status === "in_arbeit"));
  const href = s ? `/dashboard/jarvis/chat?s=${s.id}` : "/dashboard/jarvis/chat";
  return (
    <section className="jcard jchat" id="chat" aria-label="Schreib JARVIS">
      <header className="jcard-h">
        <h2><Icon name="jarvis" size={18} /> Schreib JARVIS</h2>
        <em>{open && startAt ? `startet um ${startAt}` : s ? <Link href={href}>{s.title}</Link> : "neue Sitzung"}</em>
      </header>
      {chat.messages.length > 0 ? (
        <ol className="jchat-log">
          {chat.messages.map((m) => {
            const st = statusText(m, now);
            return (
              <li key={m.id}>
                {m.role === "inhaber"
                  ? <p className="me"><span>{m.body.length > 240 ? `${m.body.slice(0, 240)} …` : m.body}</span><time>{chatTime(m.created_at, now)}{st ? ` · ${st.text}` : ""}</time></p>
                  : <p className="bot"><b>JARVIS</b> {m.body.length > 320 ? `${m.body.slice(0, 320)} …` : m.body}</p>}
              </li>
            );
          })}
        </ol>
      ) : <p className="jchat-empty">Aufgabe oder Frage eintippen – JARVIS antwortet im Chat.</p>}
      <form action={sendFromJarvis} className="jchat-f">
        {s && <input type="hidden" name="sid" value={s.id} />}
        <textarea name="text" required minLength={1} maxLength={8000} rows={2} aria-label="Nachricht an JARVIS" placeholder="z. B. „UK Käufer finden“ oder „Warum keine Antworten in FR?“" />
        <button className="go"><Icon name="weiter" size={16} /> Senden</button>
      </form>
      <p className="lock">
        <Link href={href} className="jchat-all"><Icon name="antwort" size={14} /> {chat.sessions > 1 ? `Alle ${chat.sessions} Sitzungen` : "Chat öffnen"}</Link>
        <Link href={chat.berichtId ? `/dashboard/jarvis/chat?s=${chat.berichtId}` : "/dashboard/jarvis/chat"} className="jchat-all">
          <Icon name="statistik" size={14} /> Tagesbericht{chat.berichtNeu ? <b className="jc-dot-s" aria-label="neu" /> : null}
        </Link>
      </p>
    </section>
  );
}

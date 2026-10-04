/**
 * „JARVIS empfiehlt“ (Inhaber 04.10.2026: „das jarvis mir immer auch sagt was er optimieren würde, was wir besser machen
 * können gerne am anfang … als kurzen knappen text“) und JARVIS-Chat („mit jarvis schreiben … aufgaben per text geben
 * … über mein claude abo“). Server-Komponenten; Empfehlungen aus echten Zahlen (recommend()), Chat als Server Action.
 */
import Link from "next/link";
import type { Rec } from "@/lib/leitstand";
import { KINDS, chatThread, type AgentTask } from "@/lib/agents";
import { chatToJarvis } from "../control-actions";
import { Back } from "../v2";
import { DragBox } from "./dnd";
import { Icon } from "@/app/icons";

const when = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

/** Adresse, die das Agenten-Fenster mit dem Auftrag des Hinweises vorbelegt öffnet (Inhaber bestätigt mit einem Klick). */
export function giveHref(agent: number, t: NonNullable<Rec["task"]>) {
  const q = new URLSearchParams({ a: String(agent), k: t.kind, b: t.brief });
  if (t.market) q.set("m", t.market);
  return `/dashboard/jarvis?${q}`;
}

/** 2–3 Optimierungen, je eine Zeile: Titel, kurzer Grund, Klick zur Station, „an Agent“ (vorbelegt) oder ziehen. */
export function Empfiehlt({ recs, href, agent }: { recs: Rec[]; href: (r: Rec) => string; agent: number }) {
  if (!recs.length) return null;
  return (
    <section className="jrec" aria-label="JARVIS empfiehlt">
      <h2><Icon name="trend-hoch" size={16} /> JARVIS empfiehlt</h2>
      <div className="jrec-l">
        {recs.map((r, i) => {
          const row = (
            <div key={i} className={`jrec-i ${r.level}`}>
              <Link href={href(r)} scroll={false} className="jrec-t"><b>{r.title}</b><span>{r.short}</span></Link>
              {r.task && (
                <Link href={giveHref(agent, r.task)} scroll={false} className="jrec-give" title={`als Auftrag „${KINDS[r.task.kind].label}${r.task.market ? ` · ${r.task.market}` : ""}“ an Agent ${agent} – oder auf A1–A4 ziehen`}>
                  <Icon name="an-agent" size={16} /><span>an A{agent}</span>
                </Link>
              )}
            </div>
          );
          return r.task ? <DragBox key={i} task={r.task} title={r.title}>{row}</DragBox> : row;
        })}
      </div>
    </section>
  );
}

/** Chat: Eingabe + Verlauf der letzten Chat-Aufträge. Einklappbar; offen, sobald ein Gespräch läuft. */
export function JarvisChat({ tasks, open }: { tasks: AgentTask[]; open: boolean }) {
  const thread = chatThread(tasks);
  const waiting = thread.some((x) => x.status === "offen" || x.status === "laeuft");
  return (
    <details className="jchat" id="chat" open={open || waiting || undefined}>
      <summary><Icon name="jarvis" size={16} /> Schreib JARVIS{waiting ? <em>wartet auf Antwort</em> : thread.length ? <em>{thread.length} im Verlauf</em> : null}</summary>
      {thread.length > 0 && (
        <ol className="jchat-log">
          {thread.map((x) => (
            <li key={x.id}>
              <p className="me"><span>{x.text}</span><time>{when(x.at)} · {KINDS[x.kind].label}{x.market ? ` · ${x.market}` : ""}</time></p>
              <p className={`bot st-${x.status}`}><b>JARVIS</b> {x.reply}</p>
            </li>
          ))}
        </ol>
      )}
      <form action={chatToJarvis} className="jchat-f">
        <Back to="/dashboard/jarvis?c=1" />
        <textarea name="text" required minLength={3} maxLength={1000} rows={2} placeholder="Schreib JARVIS eine Aufgabe oder Frage, z. B. „UK Käufer finden“ oder „Warum keine Antworten in FR?“" />
        <button className="go"><Icon name="weiter" size={16} /> An JARVIS</button>
      </form>
      <p className="lock"><Icon name="uhr" size={14} /> Antwort kommt über dein Claude-Abo mit der nächsten Agenten-Runde (≤ 60 min). Keine API-Kosten. Agenten senden nie Mails und ändern keine Prüfregeln.</p>
    </details>
  );
}

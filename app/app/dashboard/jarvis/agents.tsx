/**
 * Agenten in JARVIS (Inhaber 03.10.2026: „einzelne agenten … ich beauftrage agent 1 neue leads zu holen für den markt“).
 * Vier Agenten als Kugeln: Ring dreht sich, solange einer arbeitet, Bogen zeigt den Fortschritt. Klick öffnet den
 * Agenten (Auftrag, Ergebnis, Verlauf, neuer Auftrag). Server-Komponenten, Formulare als Server Actions.
 */
import Link from "next/link";
import type { CSSProperties } from "react";
import { AGENT_COUNT, KINDS, MARKETS, agentBoard, type AgentTask } from "@/lib/agents";
import { cancelAgentTask, createAgentTask } from "../control-actions";
import { Back } from "../v2";
import { AgentDrop } from "./dnd";

type V = CSSProperties & Record<`--${string}`, string | number>;
const STATUS: Record<AgentTask["status"], string> = { offen: "wartet", laeuft: "arbeitet", fertig: "fertig", fehler: "Fehler", abgebrochen: "zurückgezogen" };
const when = (iso: string | null) => (iso ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso)) : "–");

export function AgentRow({ tasks, active }: { tasks: AgentTask[]; active: string | null }) {
  const board = agentBoard(tasks);
  return (
    <div className="ags">
      {board.map((a) => {
        const c = a.current;
        const st = c?.status ?? "idle";
        return (
          <AgentDrop key={a.n} n={a.n}>
          <Link href={active === String(a.n) ? "/dashboard/jarvis" : `/dashboard/jarvis?a=${a.n}`} scroll={false} className={`ag st-${st} ${active === String(a.n) ? "on" : ""}`}
            style={{ "--p": `${c?.status === "laeuft" ? c.progress : c?.status === "fertig" ? 100 : 0}` } as V}
            title={c ? `Agent ${a.n}: ${KINDS[c.kind].label}${c.market ? ` ${c.market}` : ""} – ${STATUS[c.status]}` : `Agent ${a.n}: frei`}>
            <span className="ag-orb" aria-hidden><i className="ag-ring" /><i className="ag-arc" /><b>A{a.n}</b></span>
            <span className="ag-t">{c ? <>{KINDS[c.kind].icon} {KINDS[c.kind].label}{c.market ? ` · ${c.market}` : ""}</> : "frei"}</span>
            <span className="ag-s">{c ? (c.status === "laeuft" ? `${c.progress} %${c.step ? ` · ${c.step}` : ""}` : STATUS[c.status]) : "bereit"}{a.queued > 0 ? ` · +${a.queued}` : ""}</span>
          </Link>
          </AgentDrop>
        );
      })}
      <Link href={active === "neu" ? "/dashboard/jarvis" : "/dashboard/jarvis?a=neu"} scroll={false} className={`ag ag-new ${active === "neu" ? "on" : ""}`} title="Neuen Auftrag erteilen">
        <span className="ag-orb" aria-hidden><b>+</b></span><span className="ag-t">Auftrag</span><span className="ag-s">erteilen</span>
      </Link>
    </div>
  );
}

function NewTask({ agent, back }: { agent: number | null; back: string }) {
  return (
    <form action={createAgentTask} className="agf">
      <Back to={back} />
      <fieldset><legend>Agent</legend><div className="chips3">
        {Array.from({ length: AGENT_COUNT }, (_, i) => <label key={i}><input type="radio" name="agent" value={i + 1} defaultChecked={(agent ?? 1) === i + 1} /><span>A{i + 1}</span></label>)}
      </div></fieldset>
      <fieldset><legend>Was</legend><div className="chips3">
        {(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((k, i) => <label key={k} title={KINDS[k].hint}><input type="radio" name="kind" value={k} defaultChecked={i === 0} /><span>{KINDS[k].icon} {KINDS[k].label}</span></label>)}
      </div></fieldset>
      <fieldset><legend>Markt</legend><div className="chips3">
        <label><input type="radio" name="market" value="" defaultChecked /><span>alle</span></label>
        {MARKETS.map((m) => <label key={m}><input type="radio" name="market" value={m} /><span>{m}</span></label>)}
      </div></fieldset>
      <input name="brief" maxLength={1000} placeholder="Notiz (optional), z. B. „nur Firmen ohne Website“" />
      <button className="go">Beauftragen</button>
    </form>
  );
}

/** Seitenfenster eines Agenten oder „Neuer Auftrag“. */
export function AgentDrawer({ which, tasks }: { which: string; tasks: AgentTask[] }) {
  const back = `/dashboard/jarvis?a=${which}`;
  if (which === "neu") {
    return (
      <aside className="drw" aria-label="Neuer Auftrag">
        <header><span className="drw-ic" aria-hidden>✦</span><h2>Neuer Auftrag</h2><Link href="/dashboard/jarvis" scroll={false} className="drw-x" aria-label="Schließen">✕</Link></header>
        <div className="drw-body"><NewTask agent={null} back={back} /><p className="lock">🔒 Agenten senden nie Mails, geben kein Geld aus und ändern keine Prüfregeln.</p></div>
      </aside>
    );
  }
  const n = Number(which);
  const mine = tasks.filter((t) => t.agent === n);
  const cur = agentBoard(tasks)[n - 1]?.current ?? null;
  return (
    <aside className="drw" aria-label={`Agent ${n}`}>
      <header><span className="drw-ic" aria-hidden>A{n}</span><h2>Agent {n}</h2><Link href="/dashboard/jarvis" scroll={false} className="drw-x" aria-label="Schließen">✕</Link></header>
      <div className="drw-body">
        {cur && (
          <div className={`agc st-${cur.status}`}>
            <div className="agc-h"><b>{KINDS[cur.kind].icon} {KINDS[cur.kind].label}{cur.market ? ` · ${cur.market}` : ""}</b><em>{STATUS[cur.status]}</em></div>
            {cur.brief && <p className="agc-b">{cur.brief}</p>}
            {(cur.status === "laeuft" || cur.status === "fertig") && <div className="agc-bar"><i style={{ width: `${cur.status === "fertig" ? 100 : cur.progress}%` }} /></div>}
            {cur.step && cur.status === "laeuft" && <p className="agc-step">{cur.step}</p>}
            {Object.keys(cur.numbers ?? {}).length > 0 && <div className="bigs">{Object.entries(cur.numbers).map(([k, v]) => <div key={k}><b>{Number(v).toLocaleString("de-DE")}</b><span>{k}</span></div>)}</div>}
            {cur.result && <p className="agc-r">{cur.result}</p>}
            <span className="agc-t">erteilt {when(cur.created_at)}{cur.finished_at ? ` · fertig ${when(cur.finished_at)}` : ""}</span>
            {cur.status === "offen" && <form action={cancelAgentTask}><Back to={back} /><input type="hidden" name="id" value={cur.id} /><button className="ghost2">zurückziehen</button></form>}
          </div>
        )}
        <NewTask agent={n} back={back} />
        {mine.length > 1 && (
          <ul className="chk">{mine.filter((t) => t.id !== cur?.id).slice(0, 6).map((t) => (
            <li key={t.id} className={t.status === "fehler" ? "bad" : "ok"} title={t.result ?? t.brief}><i aria-hidden>{KINDS[t.kind].icon}</i><b>{KINDS[t.kind].label}{t.market ? ` · ${t.market}` : ""}</b><span>{when(t.created_at)}</span><em>{STATUS[t.status]}{t.result ? ` · ${t.result.slice(0, 60)}` : ""}</em></li>
          ))}</ul>
        )}
      </div>
    </aside>
  );
}

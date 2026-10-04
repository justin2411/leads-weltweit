/**
 * JARVIS-Überblick (Inhaber 04.10.2026): „Heute wichtig“ (eine Zeile, höchstens 3 Punkte), Ziel-vs-Ist je Land
 * (Mails und grüne Leads heute) und die Entscheidungs-Zeitleiste. Reine Server-Darstellung, ohne JavaScript bedienbar
 * (Aufklappen per <details>). Farben fest: grün = ok, gelb = knapp, rot = weit drunter, grau = ohne Ziel.
 */
import Link from "next/link";
import { Icon } from "@/app/icons";
import { Leer } from "../v2";
import type { Bar, Eintrag, Wichtig } from "@/lib/ueberblick";

export function HeuteWichtig({ items }: { items: Wichtig[] }) {
  return (
    <nav className="ub-heute" aria-label="Heute wichtig">
      <span className="ub-heute-l"><Icon name="achtung" size={16} /> Heute wichtig</span>
      {items.length ? items.map((x) => (
        <Link key={x.title} href={x.href} scroll={false} className={`ub-pt t-${x.level}`} title={x.tip}><i aria-hidden />{x.title}</Link>
      )) : <span className="ub-pt t-ok"><i aria-hidden />alles im grünen Bereich</span>}
    </nav>
  );
}

const TONE_TXT = { green: "ok", gold: "knapp", red: "weit drunter", grey: "ohne Ziel" } as const;

function Bars({ title, sub, rows, href }: { title: string; sub: string; rows: Bar[]; href: (c: string) => string }) {
  const n = (v: number) => v.toLocaleString("de-DE");
  return (
    <section className="jcard ub-card" aria-label={title}>
      <div className="jcard-h"><h2>{title}</h2><em>{sub}</em></div>
      <ul className="ub-bars">
        {rows.map((r) => (
          <li key={r.key}>
            <Link href={href(r.key)} scroll={false} className={`ub-bar t-${r.tone}`}
              title={r.ziel ? `${r.key}: ${n(r.ist)} von ${n(r.ziel)} heute · Soll bis jetzt ${n(r.soll ?? 0)} · ${TONE_TXT[r.tone]}` : `${r.key}: ${n(r.ist)} heute · noch kein Ziel`}>
              <span className="ub-c">{r.key}</span>
              <span className="ub-track" aria-hidden><i style={{ width: `${r.ziel ? r.pct : 0}%` }} />{r.soll !== null && r.ziel ? <b style={{ left: `${Math.min(100, (r.soll / r.ziel) * 100)}%` }} /> : null}</span>
              <span className="ub-n">{n(r.ist)}<small>{r.ziel ? ` / ${n(r.ziel)}` : " / –"}</small></span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function ZielIst({ mails, leads, href }: { mails: Bar[]; leads: Bar[] | null; href: { mails: (c: string) => string; leads: (c: string) => string } }) {
  return (
    <div className="ub-ziel">
      <Bars title="Mails heute" sub="Ist / Tagesziel" rows={mails} href={href.mails} />
      {leads ? <Bars title="Grüne Leads heute" sub="Ist / Ø 7 Tage" rows={leads} href={href.leads} />
        : <section className="jcard ub-card"><div className="jcard-h"><h2>Grüne Leads heute</h2></div><p className="jchat-empty">Zahlen nicht lesbar</p></section>}
    </div>
  );
}

const STATUS: Record<string, string> = { done: "umgesetzt", proposed: "offen", rejected: "abgelehnt", applied: "umgesetzt" };

function Row({ e }: { e: Eintrag }) {
  return (
    <li>
      <details className="ub-ev">
        <summary><time dateTime={e.at}>{e.zeit}</time><b>{e.titel}</b>{e.status && <em className={`ub-st s-${e.status}`}>{STATUS[e.status] ?? e.status}</em>}</summary>
        <p>{e.grund || "ohne Begründung"}</p>
      </details>
    </li>
  );
}

export function Zeitleiste({ items }: { items: Eintrag[] | null }) {
  if (!items) return null;
  const first = items.slice(0, 5), more = items.slice(5);
  return (
    <section className="jcard ub-zeit" aria-label="Entscheidungen">
      <div className="jcard-h"><h2><Icon name="uhr" size={16} /> Entscheidungen</h2><em>letzte {items.length}</em></div>
      {items.length ? (
        <>
          <ol className="ub-line">{first.map((e) => <Row key={e.id} e={e} />)}</ol>
          {more.length > 0 && (
            <details className="ub-more">
              <summary>weitere {more.length} zeigen</summary>
              <ol className="ub-line">{more.map((e) => <Row key={e.id} e={e} />)}</ol>
            </details>
          )}
        </>
      ) : <Leer icon="uhr" text="Noch keine Entscheidungen." />}
    </section>
  );
}

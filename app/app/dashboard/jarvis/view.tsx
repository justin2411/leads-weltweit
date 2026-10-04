/**
 * Aufbau der JARVIS-Startseite (Inhaber 04.10.2026: „jarvis vereinfachen … aus 5 metern sehen ob was läuft“, „es wirkt
 * am anfang zu voll“, „die workflows … will ich trotzdem sehen“) – reine Darstellung, Zahlen fertig aus page.tsx.
 * Start: Kopf · 5 Ströme (Puls) · Braucht dich (nur wenn offen) · Firma (8 Bereiche → Office) · Werke & Agenten
 * (A1–A8 + Fluss-Karte mit Seitenfenster) · Chat als schwebender Knopf.
 * ?teil=mehr: Heute wichtig, Kern-Kennzahlen mit Prognose, Ziel vs. Ist, JARVIS empfiehlt, Mini-Chat, Live-Ticker.
 * Team, Kohorten, Optimiert sich selbst, Vorschläge und Freigabe stehen in den Bereichs-Offices (/dashboard/firma/…),
 * Entscheidungen im Protokoll. Karten je Reihe gleich hoch, am Handy eine Spalte ohne seitliches Scrollen.
 */
import type { ReactNode } from "react";
import type { Edge, Station, StationId, TickerItem } from "@/lib/fluss";
import { tipTask, type Rec, type Tip } from "@/lib/leitstand";
import type { AgentTask } from "@/lib/agents";
import { Ampeln, FlowMap, Ticker, type Kpi } from "./flow";
import { AgentRow } from "./agents";
import { LivePoll } from "../live-poll";
import { Empfiehlt, JarvisChat, agentPicks } from "./empfiehlt";
import type { StartChat } from "./chat/start";
import { DragTip } from "./dnd";
import { UndoBar } from "./dismiss";
import { tipKey, tipReactKeys } from "@/lib/tips";
import { Clock, Voice } from "./voice";
import { Icon } from "@/app/icons";
import { JCHAT_CSS, SOFORT_CSS } from "./chat/css";
import type { Bar, Wichtig } from "@/lib/ueberblick";
import { HeuteWichtig, ZielIst } from "./ueberblick";
import { ChatKnopf, FirmaKacheln, KOPF_CSS, Puls, type FirmaKachel } from "./kopf";
import type { Strom } from "@/lib/puls";
import Link from "next/link";
import type { BdPunkt } from "@/lib/braucht-dich";
import { BrauchtDich } from "./braucht-dich";

export type JarvisProps = {
  /** „start“ = Startseite, „mehr“ = Details (Empfehlungen, Kennzahlen, Ticker) */
  teil: "start" | "mehr";
  hello: string; say: string;
  puls: Strom[];
  firma: FirmaKachel[] | null;
  kpis: Kpi[];
  recs: Rec[]; rest: Tip[]; tipHref: (x: { href?: string }) => string; agent: number;
  tasks: AgentTask[]; startAt: string; activeAgent: string | null;
  stations: Station[]; edges: Edge[]; activeStation: StationId | null; stationHref: (id: StationId) => string;
  drawer: ReactNode;
  ticker: TickerItem[];
  customerAgents?: number | null;
  /** JARVIS-Chat mit Sitzungen (zuletzt genutzte); null = Tabellen fehlen noch → bisheriger Chat über Agenten-Aufträge */
  chat?: StartChat | null;
  /** Überblick: Heute wichtig (≤ 3), Ziel-vs-Ist je Land (lib/ueberblick.ts) */
  heute?: Wichtig[];
  ziel?: { mails: Bar[]; leads: Bar[] | null };
  /** „Braucht dich“: offene Punkte nur für den Inhaber (lib/braucht-dich.ts) */
  brauchtDich?: BdPunkt[];
};

export function JarvisView(p: JarvisProps) {
  const css = <style dangerouslySetInnerHTML={{ __html: JCHAT_CSS + SOFORT_CSS + KOPF_CSS }} />;
  const top = (
    <header className="jv-top">
      <span className="jv-logo" aria-hidden><i /><i /><i /></span>
      <div className="jv-hi">
        <h1>JARVIS</h1>
        <Voice lines={[p.hello, p.say]} />
      </div>
      <Clock />
    </header>
  );
  const busy = p.tasks.some((t) => t.status === "offen" || t.status === "laeuft");
  if (p.teil === "mehr") {
    return (
      <div className="jv jv2 jv3">
        {css}
        {top}
        <nav className="jv-back"><Link href="/dashboard/jarvis"><Icon name="start-seite" size={16} /><span>Zur Startseite</span></Link></nav>
        {p.heute && <HeuteWichtig items={p.heute} />}
        <Ampeln items={p.kpis} />
        {p.ziel && <ZielIst mails={p.ziel.mails} leads={p.ziel.leads} href={{ mails: () => "/dashboard/jarvis?s=versand", leads: () => "/dashboard/jarvis?s=lead" }} />}
        <Empfiehlt recs={p.recs} href={p.tipHref} agent={p.agent}>
          {p.rest.length > 0 && (
            <div className="jtips2">
              {p.rest.slice(0, 4).map((x, i, all) => <DragTip key={tipReactKeys(all)[i]} task={tipTask(x)} title={x.title} href={p.tipHref(x)} level={x.level} tip={x.text} dkey={tipKey(x)} agents={agentPicks(p.tasks)} suggest={p.agent} />)}
            </div>
          )}
        </Empfiehlt>
        <UndoBar />
        <div className="jv-agenten"><AgentRow tasks={p.tasks} active={null} startAt={p.startAt} customerAgents={p.customerAgents} /></div>
        <LivePoll active={busy} />
        <JarvisChat tasks={p.tasks} startAt={p.startAt} chat={p.chat ?? null} />
        <Ticker items={p.ticker} />
      </div>
    );
  }
  const neu = p.chat?.gehirnUnread ?? 0;
  return (
    <div className={`jv jv2 jv3 ${p.drawer ? "has-drw" : ""}`}>
      {css}
      {top}
      <Puls items={p.puls} />
      {p.brauchtDich && p.brauchtDich.length > 0 && <BrauchtDich items={p.brauchtDich} />}
      <FirmaKacheln items={p.firma} />
      <section id="agenten" className="jv-werke" aria-label="Werke und Agenten">
        <div className="jv-wh"><h2>Werke & Agenten</h2><Link href="/dashboard/jarvis?teil=mehr" className="fk-org"><Icon name="mehr" size={16} /><span>Details</span></Link></div>
        <div className="jv-agenten"><AgentRow tasks={p.tasks} active={p.activeAgent} startAt={p.startAt} customerAgents={p.customerAgents} /></div>
        <LivePoll active={busy} />
        <div className="jv-stage">
          <FlowMap stations={p.stations} edges={p.edges} active={p.activeAgent ? null : p.activeStation} href={p.stationHref} />
          {p.drawer}
        </div>
      </section>
      <ChatKnopf neu={neu} />
    </div>
  );
}

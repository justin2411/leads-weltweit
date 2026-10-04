/**
 * Aufbau der JARVIS-Startseite (Inhaber 04.10.2026: „optimiere nochmal das design bei jarvis“) – reine Darstellung,
 * alle Zahlen kommen fertig aus page.tsx. Reihenfolge: Kopf (Begrüßung, Uhr) · 4 Kern-Kennzahlen · JARVIS empfiehlt ·
 * Agenten · Fluss-Karte (mit Seitenfenster) · Chat und Freigabe (unten rechts) · Live-Ticker.
 * Raster in 8er-Schritten, Karten je Reihe gleich hoch, am Handy eine Spalte ohne seitliches Scrollen.
 */
import type { ReactNode } from "react";
import type { Edge, Station, StationId, TickerItem } from "@/lib/fluss";
import type { Rec, Tip } from "@/lib/leitstand";
import type { AgentTask } from "@/lib/agents";
import { Ampeln, FlowMap, Ticker, type Kpi } from "./flow";
import { AgentRow } from "./agents";
import { Empfiehlt, JarvisChat } from "./empfiehlt";
import type { StartChat } from "./chat/start";
import { GatePanel, type GateView } from "./freigabe";
import { DragTip } from "./dnd";
import { Clock, Voice } from "./voice";

export type JarvisProps = {
  hello: string; say: string;
  kpis: Kpi[];
  recs: Rec[]; rest: Tip[]; tipHref: (x: { href?: string }) => string; agent: number;
  tasks: AgentTask[]; startAt: string; activeAgent: string | null;
  stations: Station[]; edges: Edge[]; activeStation: StationId | null; stationHref: (id: StationId) => string;
  drawer: ReactNode;
  gate: GateView;
  ticker: TickerItem[];
  customerAgents?: number | null;
  /** JARVIS-Chat mit Sitzungen (zuletzt genutzte); null = Tabellen fehlen noch → bisheriger Chat über Agenten-Aufträge */
  chat?: StartChat | null;
};

export function JarvisView(p: JarvisProps) {
  return (
    <div className={`jv jv2 jv3 ${p.drawer ? "has-drw" : ""}`}>
      <header className="jv-top">
        <span className="jv-logo" aria-hidden><i /><i /><i /></span>
        <div className="jv-hi">
          <h1>JARVIS</h1>
          <Voice lines={[p.hello, p.say]} />
        </div>
        <Clock />
      </header>
      <Ampeln items={p.kpis} />
      <Empfiehlt recs={p.recs} href={p.tipHref} agent={p.agent}>
        {p.rest.length > 0 && (
          <div className="jtips2">
            {p.rest.slice(0, 4).map((x, i) => <DragTip key={i} task={x.task} title={x.title} href={p.tipHref(x)} level={x.level} tip={x.text} />)}
          </div>
        )}
      </Empfiehlt>
      <AgentRow tasks={p.tasks} active={p.activeAgent} startAt={p.startAt} customerAgents={p.customerAgents} />
      <div className="jv-stage">
        <FlowMap stations={p.stations} edges={p.edges} active={p.activeAgent ? null : p.activeStation} href={p.stationHref} />
        {p.drawer}
      </div>
      <div className="jv-duo">
        <JarvisChat tasks={p.tasks} startAt={p.startAt} chat={p.chat ?? null} />
        <GatePanel g={p.gate} />
      </div>
      <Ticker items={p.ticker} />
    </div>
  );
}

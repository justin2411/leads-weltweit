/**
 * Aufbau der JARVIS-Startseite (Inhaber 04.10.2026: „optimiere nochmal das design bei jarvis“) – reine Darstellung,
 * alle Zahlen kommen fertig aus page.tsx. Reihenfolge: Kopf (Begrüßung, Uhr) · Heute wichtig · Braucht dich · 4 Kern-Kennzahlen · Ziel vs. Ist · Abteilungen · JARVIS empfiehlt (X = ausblenden) ·
 * Agenten A1–A8 · Team (Fach-Agenten) · Fluss-Karte (mit Seitenfenster) · Kohorten-Trichter (aufklappbar) · Optimiert sich selbst · Entscheidungen · Chat und Freigabe (unten rechts) · Live-Ticker.
 * Raster in 8er-Schritten, Karten je Reihe gleich hoch, am Handy eine Spalte ohne seitliches Scrollen.
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
import { GatePanel, type GateView } from "./freigabe";
import { DragTip } from "./dnd";
import { UndoBar } from "./dismiss";
import { tipKey, tipReactKeys } from "@/lib/tips";
import { Clock, Voice } from "./voice";
import { Vorschlaege } from "./vorschlaege";
import { JCHAT_CSS, SOFORT_CSS } from "./chat/css";
import type { Proposal } from "@/lib/vorschlaege";
import type { Bar, Eintrag, Wichtig } from "@/lib/ueberblick";
import { HeuteWichtig, ZielIst, Zeitleiste } from "./ueberblick";
import { KOHORTEN_CSS, Kohorten } from "./kohorten";
import { GEHIRN_LERNT_CSS, GehirnLernt, type GehirnLerntData } from "./gehirn-lernt";
import { TEAM_CSS, Team } from "./team";
import type { Karte } from "@/lib/fach-agenten";
import type { KohorteRow } from "@/lib/kohorten";
import type { BdPunkt } from "@/lib/braucht-dich";
import { BrauchtDich } from "./braucht-dich";
import { ABTEILUNGEN_CSS, Abteilungen } from "./abteilungen";
import type { Kachel } from "@/lib/abteilungen";
import { MobileFold } from "../mobile-fold";

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
  /** Vorschläge mit Haken/Kreuz und „JARVIS hat umgesetzt“ (decisions); null = nicht lesbar */
  proposals?: { open: Proposal[]; done: Proposal[] } | null;
  /** Überblick: Heute wichtig (≤ 3), Ziel-vs-Ist je Land, Entscheidungs-Zeitleiste (lib/ueberblick.ts) */
  heute?: Wichtig[];
  ziel?: { mails: Bar[]; leads: Bar[] | null };
  zeit?: Eintrag[] | null;
  /** Kohorten-Trichter je Versandwoche × Land (aufklappbar unter der Fluss-Karte); rows null = nicht lesbar */
  kohorten?: { rows: KohorteRow[] | null; countries: readonly string[]; today: string };
  /** Fach-Agenten („Team“: Gehirn-Testing, Lead-Qualität) – leer/fehlend = Abschnitt aus */
  team?: Karte[] | null;
  /** „Braucht dich“: offene Punkte nur für den Inhaber (lib/braucht-dich.ts) */
  brauchtDich?: BdPunkt[];
  /** Optimiert sich selbst: Score + Trend, letzte 3 automatische Änderungen mit Wirkung, offene Vorschläge (selbstopt.py, brain_meta.py) */
  gehirn?: GehirnLerntData;
  /** Abteilungen: Kachel-Raster als Einstieg in die Unterseiten (lib/abteilungen.ts) */
  abteilungen?: Kachel[];
};

export function JarvisView(p: JarvisProps) {
  // Handy: Kennzahl im eingeklappten Kopf (Entscheidungen offen, Chat-Sitzungen bzw. Aufträge)
  const offen = p.zeit ? p.zeit.filter((e) => e.status === "proposed").length : 0;
  const zeitSum = p.zeit ? (offen ? `${offen} offen` : `${p.zeit.length}`) : undefined;
  const chatSum = p.chat ? (p.chat.gehirnUnread ? `${p.chat.gehirnUnread} neu` : `${p.chat.sessions}`) : `${p.tasks.length}`;
  return (
    <div className={`jv jv2 jv3 ${p.drawer ? "has-drw" : ""}`}>
      <style dangerouslySetInnerHTML={{ __html: JCHAT_CSS + SOFORT_CSS + KOHORTEN_CSS + TEAM_CSS + GEHIRN_LERNT_CSS + ABTEILUNGEN_CSS }} />
      <header className="jv-top">
        <span className="jv-logo" aria-hidden><i /><i /><i /></span>
        <div className="jv-hi">
          <h1>JARVIS</h1>
          <Voice lines={[p.hello, p.say]} />
        </div>
        <Clock />
      </header>
      {p.heute && <HeuteWichtig items={p.heute} />}
      {p.brauchtDich && <BrauchtDich items={p.brauchtDich} />}
      <Ampeln items={p.kpis} />
      {p.ziel && <ZielIst mails={p.ziel.mails} leads={p.ziel.leads} href={{ mails: () => "/dashboard/jarvis?s=versand", leads: () => "/dashboard/jarvis?s=lead" }} />}
      {p.abteilungen && <Abteilungen items={p.abteilungen} />}
      {p.proposals && <Vorschlaege open={p.proposals.open} done={p.proposals.done} />}
      <Empfiehlt recs={p.recs} href={p.tipHref} agent={p.agent}>
        {p.rest.length > 0 && (
          <div className="jtips2">
            {p.rest.slice(0, 4).map((x, i, all) => <DragTip key={tipReactKeys(all)[i]} task={tipTask(x)} title={x.title} href={p.tipHref(x)} level={x.level} tip={x.text} dkey={tipKey(x)} agents={agentPicks(p.tasks)} suggest={p.agent} />)}
          </div>
        )}
      </Empfiehlt>
      <UndoBar />
      <div id="agenten" className="jv-agenten">
        <AgentRow tasks={p.tasks} active={p.activeAgent} startAt={p.startAt} customerAgents={p.customerAgents} />
      </div>
      {p.team && <Team cards={p.team} />}
      <LivePoll active={p.tasks.some((t) => t.status === "offen" || t.status === "laeuft")} />
      <div className="jv-stage">
        <FlowMap stations={p.stations} edges={p.edges} active={p.activeAgent ? null : p.activeStation} href={p.stationHref} />
        {p.drawer}
      </div>
      {p.kohorten && <Kohorten rows={p.kohorten.rows} countries={p.kohorten.countries} today={p.kohorten.today} />}
      {p.gehirn && <GehirnLernt d={p.gehirn} />}
      {p.zeit && <MobileFold id="jv-zeit" title="Entscheidungen" sum={zeitSum}><Zeitleiste items={p.zeit} /></MobileFold>}
      <div className="jv-duo">
        <MobileFold id="jv-chat" title="Chat" sum={chatSum}><JarvisChat tasks={p.tasks} startAt={p.startAt} chat={p.chat ?? null} /></MobileFold>
        <GatePanel g={p.gate} />
      </div>
      <Ticker items={p.ticker} />
    </div>
  );
}

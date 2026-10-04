import { FIELDS, TEMPLATES, parseFlow, type Flow } from "@/lib/flow";
import { loadCustomAgent, loadCustomAgents, loadFlow, loadFlows, loadMasterFlow, loadPools } from "@/lib/flow-data";
import { BEREICHE, MASTER_NAME, masterStart, parseBereich, resolvePools, type Bereich, type PoolInfo } from "@/lib/baukasten";
import { Icon, type IconName } from "@/app/icons";
import { requireOwner } from "../actions";
import { Builder, type BuilderInit, type SavedFlow } from "./builder";
import { AgentList } from "./agents";
import { BAUKASTEN_CSS } from "./css";
import { JCHAT_CSS } from "../jarvis/chat/css";

export const metadata = { title: "Baukasten" };
// Server-Actions (Stichprobe bis 5000 Zeilen in 1000er-Seiten) erben das Zeitlimit der Seite
export const maxDuration = 60;
type SP = Promise<Record<string, string | string[] | undefined>>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SEG_LABEL = Object.fromEntries((FIELDS.find((f) => f.key === "segment")?.options ?? []).map((o) => [o.v, o.label.replace(/^S\d+\s*/, "")]));
const AREA_ICON: Record<Bereich, IconName> = { master: "schloss", test: "baukasten", agenten: "agent" };

/** Neuer Flow aus einer Vorlage, Quelle optional vorbelegt (?land=US&seg=S2&quelle=kaeufer – Links aus dem Speicher). */
function preset(land: string | null, seg: string | null, quelle: string | null, vorlage: string | null): BuilderInit {
  const buyer = quelle === "kaeufer";
  const tpl = TEMPLATES.find((t) => t.id === vorlage) ?? TEMPLATES.find((t) => t.id === (buyer ? "kaeufer-frei" : "us-telefon")) ?? TEMPLATES[0];
  const flow: Flow = structuredClone(tpl.flow);
  if (!land && !seg && !quelle) return { id: null, name: tpl.id === "us-telefon" ? "US Webagenturen" : tpl.label.slice(0, 60), flow, kind: "test" };
  const segment = seg ?? (land ? null : "S2");
  flow.nodes = flow.nodes.map((n) => {
    if (n.kind === "quelle") return { ...n, source: buyer ? "kaeufer" : n.source, status: buyer ? ["ok"] : n.status, countries: land ? [land] : n.countries, segment };
    if (n.kind === "pipeline") return { ...n, name: `${land ?? "Alle"} mit Telefon` };
    return n;
  });
  const what = segment ? SEG_LABEL[segment] ?? segment : "alle Zielgruppen";
  return { id: null, name: `${buyer ? "Käufer " : ""}${land ?? "Alle Länder"} ${what}`.slice(0, 60), flow, kind: "test" };
}

/** Umschalter oben: Master-Pipeline (gold), Test-Flows, Agenten. Echte Links (ungespeicherte Änderungen → Rückfrage). */
function Areas({ on, agents }: { on: Bereich; agents: number | null }) {
  return (
    <nav className="bk-areas" aria-label="Bereiche des Baukastens">
      {BEREICHE.map((b) => (
        <a key={b.id} href={b.id === "test" ? "/dashboard/baukasten" : `/dashboard/baukasten?bereich=${b.id}`}
          className={`bk-area a-${b.id}${on === b.id ? " on" : ""}`} aria-current={on === b.id ? "page" : undefined}>
          <Icon name={AREA_ICON[b.id]} size={15} /><span>{b.label}</span>
          {b.id === "agenten" && agents !== null && agents > 0 && <em>{agents}</em>}
        </a>
      ))}
    </nav>
  );
}

/**
 * Baukasten (Inhaber 03.10.2026: „Ich will Flows per Drag & Drop selber bauen, alles visualisiert … ich sehe die ganze
 * Zeit Daten … nicht nur Filter, auch andere Elemente“; 04.10.2026: Master-Pipeline in Gold, eigene Speicher, eigene
 * Agenten – docs/BAUKASTEN-MASTER.md). Server: Sitzung, gespeicherte Flows, Startzustand je Bereich.
 * Der Editor selbst läuft im Browser (builder.tsx); geschrieben wird nur über die Server Actions in actions.ts.
 */
export default async function Baukasten({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const sp = await searchParams;
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).trim() : "");
  const flowParam = UUID.test(one("flow")) ? one("flow").toLowerCase() : null;
  const agentParam = UUID.test(one("agent")) ? one("agent").toLowerCase() : null;
  let bereich = parseBereich(one("bereich"));
  const land = /^[A-Za-z]{2}$/.test(one("land")) ? one("land").toUpperCase() : null;
  const seg = /^S\d{1,2}$/i.test(one("seg")) ? one("seg").toUpperCase() : null;
  const quelle = one("quelle") === "kaeufer" ? "kaeufer" : null;
  const vorlage = TEMPLATES.some((t) => t.id === one("vorlage")) ? one("vorlage") : null;

  const [rows, opened, pools, agents, master, agentRow] = await Promise.all([
    loadFlows().catch(() => []),
    flowParam ? loadFlow(flowParam).catch(() => null) : Promise.resolve(null),
    loadPools().catch((e) => { console.error("baukasten pools:", e); return [] as PoolInfo[]; }),
    loadCustomAgents().catch((e) => { console.error("baukasten agents:", e); return null; }),
    loadMasterFlow().catch((e) => { console.error("baukasten master:", e); return undefined; }),
    agentParam ? loadCustomAgent(agentParam).catch(() => null) : Promise.resolve(null),
  ]);
  const flows: SavedFlow[] = rows.filter((r) => r.kind === "test").map((r) => ({ id: r.id, name: r.name, status: r.status, updated_at: r.updated_at }));
  const activeAgents = agents ? agents.filter((a) => a.enabled && !a.archived).length : null;
  const css = <style dangerouslySetInnerHTML={{ __html: BAUKASTEN_CSS + JCHAT_CSS }} />;

  if (opened?.kind === "master") bereich = "master";
  if (agentParam) bereich = "agenten";

  // ---------------------------------------------------------------- Agenten-Liste
  if (bereich === "agenten" && !agentParam) {
    return (
      <>
        {css}
        <Areas on="agenten" agents={activeAgents} />
        <AgentList agents={agents} />
      </>
    );
  }

  let notice: string | null = null;
  let initial: BuilderInit;
  let navKey: string;

  if (bereich === "agenten" && agentParam) {
    // ---------------------------------------------------------------- Agent bearbeiten
    const f = agentRow ? await loadFlow(agentRow.flow_id).catch(() => null) : null;
    if (!agentRow || !f?.def) {
      return (
        <>
          {css}
          <Areas on="agenten" agents={activeAgents} />
          <p className="bk-msg bad bk-wide">{agentRow ? `Flow von „${agentRow.name}“ ist unlesbar` : "Agent nicht gefunden"}</p>
          <AgentList agents={agents} />
        </>
      );
    }
    initial = { id: f.id, version: f.updated_at, name: agentRow.name, flow: resolvePools(f.def, pools), kind: "agent",
      agent: { id: agentRow.id, name: agentRow.name, trigger: agentRow.trigger, at_hour: agentRow.at_hour, ai_brief: agentRow.ai_brief,
        ai_market: agentRow.ai_market, enabled: agentRow.enabled, archived: agentRow.archived } };
    navKey = `agent:${agentRow.id}`;
  } else if (bereich === "master") {
    // ---------------------------------------------------------------- Master-Pipeline
    if (master === undefined) notice = "Master-Pipeline nicht geladen – bitte neu laden, bevor du übernimmst";
    if (master?.def) initial = { id: master.id, version: master.updated_at, name: master.name, flow: master.def, kind: "master" };
    else {
      if (master && !master.def) notice = "Gespeicherte Master-Pipeline ist beschädigt – Startgraph geladen (Übernehmen überschreibt sie)";
      initial = { id: master?.id ?? null, version: master?.updated_at ?? null, name: master?.name ?? MASTER_NAME, flow: masterStart(), kind: "master" };
    }
    navKey = `master:${initial.id ?? "neu"}`;
  } else {
    // ---------------------------------------------------------------- Test-Flows (wie bisher)
    initial = preset(land, seg, quelle, vorlage);
    if (flowParam) {
      const def = opened?.def ? parseFlow(opened.def) : null;
      if (opened?.kind === "agent") notice = "Dieser Flow gehört zu einem Agenten – unter Agenten bearbeiten";
      else if (opened && def?.ok) initial = { id: opened.id, version: opened.updated_at, name: opened.name, flow: def.flow, kind: "test" };
      else notice = opened ? `Flow „${opened.name}“ ist beschädigt – Vorlage geladen` : "Flow nicht gefunden – Vorlage geladen";
    }
    navKey = flowParam ? `flow:${flowParam}` : `neu:${land ?? ""}|${seg ?? ""}|${quelle ?? ""}|${vorlage ?? ""}`;
  }

  return (
    <>
      {css}
      <Areas on={bereich} agents={activeAgents} />
      <Builder navKey={navKey} initial={initial} flows={flows} pools={pools} notice={notice} />
    </>
  );
}

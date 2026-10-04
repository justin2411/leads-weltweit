"use client";

/**
 * Baustein-Karten und Verbindungen der Baukasten-Leinwand (React Flow). Zahlen kommen live aus dem Ablauf im Browser
 * (runFlowRows über die Stichprobe) per Kontext – die Karten selbst halten nur ihre Einstellung (data.cfg).
 * Verbindungen: Menge als Beschriftung, wandernde Punkte nach Menge (ohne Bewegung bei prefers-reduced-motion).
 */
import { createContext, memo, useContext, type CSSProperties } from "react";
import { BaseEdge, EdgeLabelRenderer, Handle, Position, getBezierPath, type Edge, type EdgeProps, type Node, type NodeProps } from "@xyflow/react";
import { Icon } from "@/app/icons";
import { NODE_META, describeNode, fieldDef, type FlowNode, type NodeRows, type Port, type Problem } from "@/lib/flow";

export type BkData = { cfg: FlowNode };
export type BkNode = Node<BkData, "bk">;
export type BkEdge = Edge<Record<string, unknown>, "bk">;

/** Live-Zustand für alle Karten: Zeilen je Baustein, Probleme, Laden. */
export type Live = {
  res: Record<string, NodeRows>; probs: Map<string, Problem[]>; loading: boolean; pending: boolean; total: number | null; reduced: boolean;
  pipelineLive: boolean; remove: (id: string) => void; removeEdge: (id: string) => void;
};
export const LiveCtx = createContext<Live | null>(null);

export const fmt = (n: number) => n.toLocaleString("de-DE");
/** Anzeige eines Feldwerts: Options-Label, ja/nein, „–“ für fehlend. */
export function valLabel(key: string, v: string): string {
  if (v === "–" || v === "ja" || v === "nein") return v;
  return fieldDef(key)?.options?.find((o) => o.v === v)?.label ?? v;
}
/** Zeilen, die ein Baustein weitergibt (Ziele: was ankommt). */
export const outRows = (n: FlowNode, r: NodeRows | undefined) => (!r ? [] : NODE_META[n.kind].ports.length ? r.out : r.input);
export const portCount = (r: NodeRows | undefined, port: Port) => (!r?.connected ? null : port === "ja" ? r.ja?.length ?? 0 : port === "nein" ? r.nein?.length ?? 0 : r.out.length);

const VERB: Record<FlowNode["kind"], string> = {
  quelle: "in der Stichprobe", filter: "durch", weiche: "geprüft", punkte: "durch", top: "genommen", dubletten: "einzeln",
  statistik: "gezählt", pipeline: "erreichen die Regel", export: "zum Herunterladen", agent: "für den Agenten",
  freigabe: "durch", speicher: "in den Speicher", melden: "gemeldet",
};

function NodeCard({ id, data, selected }: NodeProps<BkNode>) {
  const live = useContext(LiveCtx);
  if (!live) return null;
  const n = data.cfg;
  const meta = NODE_META[n.kind];
  const r = live.res[id];
  const probs = live.probs.get(id) ?? [];
  const errs = probs.filter((p) => p.level === "error").length, warns = probs.length - errs;
  const sink = meta.ports.length === 0;
  const on = !!r?.connected;
  const inN = r?.input.length ?? 0, outN = outRows(n, r).length;
  const pct = inN ? Math.round((outN / inN) * 100) : null;
  const step = meta.group === "schritt" && n.kind !== "statistik" && n.kind !== "weiche";
  // Erste Stichprobe lädt noch: alle Zahlen schimmern statt „0“ zu zeigen
  const loading = (n.kind === "quelle" && live.loading) || (live.pending && (on || n.kind === "quelle"));
  const pipeLive = n.kind === "pipeline" && live.pipelineLive;
  const cls = ["bkn", `k-${n.kind}`, selected && "sel", !on && n.kind !== "quelle" && "off", errs && "has-e", loading && "load", sink && "sink", pipeLive && "live"]
    .filter(Boolean).join(" ");
  const tip = probs.map((p) => `${p.level === "error" ? "Fehler" : "Hinweis"}: ${p.msg}`).join("\n");
  return (
    <div className={cls} style={{ "--nc": meta.color } as CSSProperties}>
      {meta.input && <Handle type="target" position={Position.Left} id="in" className="in" />}
      <header>
        <span className="bkn-ic" aria-hidden><Icon name={meta.icon} size={16} /></span>
        <span className="bkn-t"><small>{meta.label}</small><b>{n.title || (n.kind === "pipeline" ? n.name : meta.label)}</b></span>
        {probs.length > 0 && (
          <span className="bkn-badges" title={tip}>
            {errs > 0 && <span className="bkn-badge e" aria-label={`${errs} Fehler`}><Icon name="achtung" size={13} /></span>}
            {warns > 0 && <span className="bkn-badge w" aria-label={`${warns} Hinweise`}>{warns}</span>}
          </span>
        )}
        <button type="button" className="bkn-x nodrag" onClick={(e) => { e.stopPropagation(); live.remove(id); }} aria-label="Baustein löschen" title="Löschen (Rücktaste)"><Icon name="schliessen" size={12} /></button>
      </header>
      <p className="bkn-d">{describeNode(n)}</p>
      <div className="bkn-v">
        <b>{loading && live.pending ? "…" : on || n.kind === "quelle" ? fmt(outN) : "–"}</b>
        <span>{on || n.kind === "quelle" ? VERB[n.kind] : "nicht verbunden"}</span>
        {step && on && pct !== null && <em>{pct} %</em>}
      </div>
      {n.kind === "quelle" && (
        <div className="bkn-sub">{loading ? "lädt …" : live.total !== null ? <>von <b>{fmt(live.total)}</b> in der Datenbank</> : "Stichprobe"}</div>
      )}
      {step && on && (
        <>
          <div className="bkn-bar" aria-hidden><i style={{ width: `${pct ?? 0}%` }} /></div>
          <div className="bkn-io"><span>{fmt(inN)} rein</span><span>{fmt(inN - outN)} raus</span></div>
        </>
      )}
      {n.kind === "statistik" && on && r?.stats && r.stats.length > 0 && (
        <ul className="bkn-st">
          {r.stats.slice(0, 5).map((s) => (
            <li key={s.key}><span>{valLabel(n.by, s.key)}</span><i><i style={{ width: `${(s.n / Math.max(1, r.stats![0].n)) * 100}%` }} /></i><b>{fmt(s.n)}</b></li>
          ))}
        </ul>
      )}
      {pipeLive && <span className="bkn-live">läuft in der Pipeline</span>}
      {meta.ports.length === 1 && <Handle type="source" position={Position.Right} id="out" />}
      {n.kind === "weiche" && (
        <div className="bkn-ports">
          {(["ja", "nein"] as const).map((p) => (
            <div key={p} className={`bkn-port ${p}`}>
              <span>{p}</span><b>{on ? fmt(portCount(r, p) ?? 0) : "–"}</b>
              <Handle type="source" position={Position.Right} id={p} className={p} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
export const BkNodeView = memo(NodeCard);

/** Punkte je Verbindung: 1 … 7 nach Größenordnung, schneller bei mehr Menge. */
function dots(n: number) {
  const lg = Math.log10(Math.max(1, n));
  return { count: Math.max(1, Math.min(7, Math.round(1 + lg * 1.6))), dur: Math.max(1.4, 3.6 - lg * 0.55) };
}
const PORT_COLOR: Record<Port, string> = { out: "#5fd4ff", ja: "#3ddc97", nein: "#ff8a5c" };

function EdgeView({ id, source, sourceHandleId, sourceX, sourceY, targetX, targetY, sourcePosition, targetPosition, selected }: EdgeProps<BkEdge>) {
  const live = useContext(LiveCtx);
  const [d, lx, ly] = getBezierPath({ sourceX, sourceY, sourcePosition, targetX, targetY, targetPosition, curvature: 0.35 });
  const port = (sourceHandleId === "ja" || sourceHandleId === "nein" ? sourceHandleId : "out") as Port;
  const n = live ? portCount(live.res[source], port) : null;
  const f = n && live && !live.reduced && !live.pending ? dots(n) : null;
  const ec = PORT_COLOR[port];
  return (
    <g className={`bke ${n || live?.pending ? "" : "bke-zero"}`} style={{ "--ec": ec } as CSSProperties}>
      <path d={d} className="bke-pipe" />
      <BaseEdge id={id} path={d} className="bke-core" interactionWidth={22} />
      {f && Array.from({ length: f.count }, (_, i) => (
        <g key={i}>
          <circle r={6} className="bke-halo"><animateMotion dur={`${f.dur}s`} begin={`${-(i * f.dur) / f.count}s`} repeatCount="indefinite" path={d} /></circle>
          <circle r={3} className="bke-dot"><animateMotion dur={`${f.dur}s`} begin={`${-(i * f.dur) / f.count}s`} repeatCount="indefinite" path={d} /></circle>
        </g>
      ))}
      <EdgeLabelRenderer>
        <div className={`bke-l nodrag nopan ${selected ? "" : "nox"} ${n ? "" : "zero"}`} style={{ transform: `translate(-50%,-50%) translate(${lx}px,${ly}px)`, "--ec": ec } as CSSProperties}
          title={port === "out" ? "Menge auf dieser Verbindung" : `Menge auf „${port}“`}>
          {live?.pending ? "…" : n === null ? "–" : fmt(n)}
          {selected && live && <button type="button" onClick={() => live.removeEdge(id)} aria-label="Verbindung löschen"><Icon name="schliessen" size={11} /></button>}
        </div>
      </EdgeLabelRenderer>
    </g>
  );
}
export const BkEdgeView = memo(EdgeView);

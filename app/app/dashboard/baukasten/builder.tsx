"use client";

/**
 * Baukasten-Editor (Inhaber 03.10.2026: „ich nehme die US Webagentur-Leads, ziehe ein Filter-Symbol dran, stelle ein was
 * durchkommen soll, sehe das Ergebnis, und wenn es mir gefällt, hänge ich es an die große Pipeline“).
 * Links Palette (ziehen oder antippen), Mitte Leinwand (React Flow: verschieben, zoomen, Raster, verbinden, löschen),
 * rechts Prüfer. Die Stichprobe lädt über previewSource (400 ms entprellt); runFlowRows rechnet sofort im Browser.
 * Gespeichert wird nur über „Speichern“ – nie automatisch. Handy: Palette und Prüfer als Blätter von unten.
 */
import "@xyflow/react/dist/base.css";
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, useTransition, type CSSProperties, type DragEvent } from "react";
import { useRouter } from "next/navigation";
import {
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, applyEdgeChanges, applyNodeChanges, useNodesInitialized, useReactFlow,
  type Connection, type EdgeChange, type NodeChange,
} from "@xyflow/react";
import {
  NODE_KINDS, NODE_META, TEMPLATES, inScope, newNode, problems, runFlowRows, unpackRows,
  type Flow, type FlowKind, type FlowNode, type NodeKind, type Port, type Problem, type Row, type Source,
} from "@/lib/flow";
import {
  MASTER_TEMPLATES, blankFlow, describeTrigger, duplicateNode, hasFreigabe, kindLabel, resolvePools, suggestMarket,
  type AgentInput, type PoolInfo,
} from "@/lib/baukasten";
import { activateFlow, archiveFlow, createPool, deactivateFlow, flowToAgent, previewSource, saveAgent, saveFlow, saveMaster } from "./actions";
import { AgentForm, type AgentState } from "./agents";
import { BkEdgeView, BkNodeView, LiveCtx, fmt, outRows, type BkEdge, type BkNode, type Live } from "./nodes";
import { Inspector, type InsCtx } from "./inspector";
import { FlowChat, type Remote } from "./chat";
import { Icon } from "@/app/icons";

export type SavedFlow = { id: string; name: string; status: string; updated_at: string | null };
/** kind = Bereich des Editors; version = updated_at der geladenen Fassung (Master); agent = Einstellungen eines Agenten. */
export type BuilderInit = { id: string | null; name: string; flow: Flow; kind: FlowKind; version?: string | null; agent?: AgentState | null };

const nodeTypes = { bk: BkNodeView };
const edgeTypes = { bk: BkEdgeView };
const DND = "application/x-baustein";
const GRID: [number, number] = [20, 20];
const BLANK_NAV = "neu:|||";
const GROUPS: [string, NodeKind[]][] = [
  ["Quelle", NODE_KINDS.filter((k) => NODE_META[k].group === "quelle")],
  ["Schritte", NODE_KINDS.filter((k) => NODE_META[k].group === "schritt")],
  ["Ziele", NODE_KINDS.filter((k) => NODE_META[k].group === "ziel")],
];

/** Vorlagen etwas weiter auseinander, damit die Mengen auf den Verbindungen Platz haben. */
const spread = (f: Flow): Flow => ({ ...f, nodes: f.nodes.map((n) => ({ ...n, x: Math.round((n.x * 1.05) / 20) * 20, y: Math.round((n.y * 1.1) / 20) * 20 })) });
const toRfNodes = (f: Flow): BkNode[] => f.nodes.map((n) => ({ id: n.id, type: "bk", position: { x: n.x, y: n.y }, data: { cfg: n } }));
const toRfEdges = (f: Flow): BkEdge[] => f.edges.map((e) => ({ id: e.id, source: e.from, sourceHandle: e.port, target: e.to, targetHandle: "in", type: "bk" }));
function fromRf(nodes: BkNode[], edges: BkEdge[]): Flow {
  return {
    v: 1,
    nodes: nodes.map((n) => ({ ...n.data.cfg, x: Math.round(n.position.x), y: Math.round(n.position.y) })),
    edges: edges.map((e) => ({ id: e.id, from: e.source, port: (e.sourceHandle === "ja" || e.sourceHandle === "nein" ? e.sourceHandle : "out") as Port, to: e.target })),
  };
}
const sig = (name: string, f: Flow) => JSON.stringify([name.trim(), f]);
function uid(prefix: string, taken: string[]): string {
  for (;;) {
    const id = `${prefix}${Math.random().toString(36).slice(2, 7)}`;
    if (!taken.includes(id)) return id;
  }
}
const num = (r: unknown, k: string) => {
  const v = r && typeof r === "object" ? (r as Record<string, unknown>)[k] : undefined;
  return typeof v === "number" ? v : null;
};
const errText = (r: unknown, d: string) => {
  const v = r && typeof r === "object" ? (r as Record<string, unknown>).error : undefined;
  return typeof v === "string" && v ? v : d;
};

function useReducedMotion() {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    const f = () => setR(m.matches);
    f();
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return r;
}

/**
 * Hülle: setzt den Editor nur bei echter Navigation neu auf (anderer Flow, Vorlage per Link). Eigene URL-Wechsel nach dem
 * Speichern (?flow=<id>) melden sich über onNav an, damit die 30-s-Aktualisierung nichts Ungespeichertes verwirft.
 * Schlüssel: "flow:<id>" bzw. "neu:<land>|<seg>|<quelle>|<vorlage>" (page.tsx).
 */
export function Builder({ navKey, initial, flows, pools, notice }: { navKey: string; initial: BuilderInit; flows: SavedFlow[]; pools: PoolInfo[]; notice: string | null }) {
  const prep = (i: BuilderInit) => (i.id ? i : { ...i, flow: spread(i.flow) });
  const [st, setSt] = useState(() => ({ prop: navKey, own: null as string | null, gen: 0, initial: prep(initial), notice }));
  if (navKey !== st.prop) {
    if (navKey === st.own) setSt({ ...st, prop: navKey });
    else setSt({ prop: navKey, own: null, gen: st.gen + 1, initial: prep(initial), notice });
  }
  const onNav = useCallback((k: string) => setSt((s) => ({ ...s, own: k })), []);
  return (
    <ReactFlowProvider key={st.gen}>
      <Editor initial={st.initial} flows={flows} pools={pools} onNav={onNav} notice={st.notice} />
    </ReactFlowProvider>
  );
}

type Sample = { rows: Row[]; total: number | null; at: string | null };

function Editor({ initial, flows, pools: poolsIn, onNav, notice }: {
  initial: BuilderInit; flows: SavedFlow[]; pools: PoolInfo[]; onNav: (k: string) => void; notice: string | null;
}) {
  const router = useRouter();
  const kind = initial.kind;
  const master = kind === "master", agentMode = kind === "agent";
  const [pools, setPools] = useState(poolsIn);
  useEffect(() => { setPools((cur) => [...poolsIn, ...cur.filter((p) => !poolsIn.some((q) => q.id === p.id))]); }, [poolsIn]);
  const [version, setVersion] = useState(initial.version ?? null);
  const [agent, setAgent] = useState<AgentState | null>(initial.agent ?? null);
  const [agentForm, setAgentForm] = useState<{ mode: "neu" | "edit"; err: string | null } | null>(null);
  const rf = useReactFlow<BkNode, BkEdge>();
  const [nodes, setNodes] = useState<BkNode[]>(() => toRfNodes(initial.flow));
  const [edges, setEdges] = useState<BkEdge[]>(() => toRfEdges(initial.flow));
  const [name, setName] = useState(initial.name);
  const [flowId, setFlowId] = useState(initial.id);
  const [base, setBase] = useState(() => (initial.id ? sig(initial.name, initial.flow) : ""));
  const [pristine, setPristine] = useState(() => sig(initial.name, initial.flow));
  const [sample, setSample] = useState<Sample>({ rows: [], total: null, at: null });
  const [loading, setLoading] = useState(true);
  const [loadErr, setLoadErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ good: boolean; text: string } | null>(notice ? { good: false, text: notice } : null);
  const [busy, startBusy] = useTransition();
  const [sheet, setSheet] = useState<"pal" | "ins" | null>(null);
  const [showProbs, setShowProbs] = useState(false);
  const [over, setOver] = useState(false);
  const reduced = useReducedMotion();
  const wrap = useRef<HTMLDivElement>(null);
  const nodesRef = useRef(nodes), edgesRef = useRef(edges);
  nodesRef.current = nodes;
  edgesRef.current = edges;

  // ---------------------------------------------------------------- Ablauf live
  const flow = useMemo(() => fromRf(nodes, edges), [nodes, edges]);
  // Nur Einstellungen und Verbindungen zählen für die Rechnung – Verschieben rechnet nicht neu
  const logicKey = useMemo(() => JSON.stringify([flow.nodes.map(({ x: _x, y: _y, ...r }) => r), flow.edges]), [flow]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const logic = useMemo<Flow>(() => flow, [logicKey]);
  const deferred = useDeferredValue(logic);
  const res = useMemo(() => runFlowRows(deferred, sample.rows), [deferred, sample.rows]);
  const probs = useMemo(() => problems(logic, kind), [logic, kind]);
  const probMap = useMemo(() => {
    const m = new Map<string, Problem[]>();
    for (const p of probs) if (p.nodeId) m.set(p.nodeId, [...(m.get(p.nodeId) ?? []), p]);
    return m;
  }, [probs]);
  const errors = probs.filter((p) => p.level === "error").length, warns = probs.length - errors;
  const quelle = logic.nodes.find((n): n is Extract<FlowNode, { kind: "quelle" }> => n.kind === "quelle") ?? null;
  const source: Source = quelle?.source ?? "leads";
  const pipe = logic.nodes.find((n) => n.kind === "pipeline") ?? null;
  const now = sig(name, flow);
  const dirty = now !== base;
  const touched = dirty && now !== pristine;
  const saved = flows.find((f) => f.id === flowId) ?? null;
  // Master: gespeichert = übernommen (aktiv). Test: Status aus der Liste. Agent: nie aktiv.
  const active = master ? !!flowId : !agentMode && saved?.status === "aktiv";
  const noGate = master && !hasFreigabe(logic);

  // Bausteine auf dem Weg zur Pipeline (dort sind nur Freigabe-taugliche Felder erlaubt)
  const toPipe = useMemo(() => {
    const s = new Set<string>();
    if (!pipe) return s;
    const todo = [pipe.id];
    s.add(pipe.id);
    while (todo.length) {
      const id = todo.pop()!;
      for (const e of logic.edges) if (e.to === id && !s.has(e.from)) { s.add(e.from); todo.push(e.from); }
    }
    return s;
  }, [logic, pipe]);

  // Ehrliche Vorschau: wie viele Leads im Geltungsbereich die Regel zurückhalten würde
  const hold = useMemo(() => {
    if (!pipe || quelle?.source !== "leads" || (loading && !sample.rows.length)) return null;
    const reached = new Set((res[pipe.id]?.input ?? []).map((r) => r.id));
    let scope = 0, held = 0;
    for (const r of sample.rows) if (inScope(deferred, r)) { scope++; if (!reached.has(r.id)) held++; }
    return { scope, held };
  }, [pipe, quelle?.source, loading, sample.rows, res, deferred]);

  // ---------------------------------------------------------------- Rückgängig (Strg+Z): Einstellungen und Verbindungen
  const hist = useRef<Flow[]>([]);
  const last = useRef<Flow>(flow);
  const flowRef = useRef(flow);
  flowRef.current = flow;
  const skipHist = useRef(false);
  const [undoN, setUndoN] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => {
      const cur = flowRef.current;
      if (skipHist.current) { skipHist.current = false; last.current = cur; return; }
      if (JSON.stringify(last.current) !== JSON.stringify(cur)) {
        hist.current = [...hist.current.slice(-49), last.current];
        setUndoN(hist.current.length);
      }
      last.current = cur;
    }, 500);
    return () => clearTimeout(t);
  }, [logicKey]);
  const undo = useCallback(() => {
    const prev = hist.current.pop();
    setUndoN(hist.current.length);
    if (!prev) return;
    skipHist.current = true;
    setNodes(toRfNodes(prev));
    setEdges(toRfEdges(prev));
  }, []);
  // Tastatur: Strg+Z rückgängig, Strg+D Baustein duplizieren, Strg+S speichern, Esc Auswahl aufheben (Entf/Rücktaste
  // löscht über React Flow). In Eingabefeldern nur Strg+S.
  const keys = useRef<{ dup: () => void; save: () => void }>({ dup: () => {}, save: () => {} });
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable);
      const mod = e.ctrlKey || e.metaKey, k = e.key.toLowerCase();
      if (mod && k === "s") { e.preventDefault(); keys.current.save(); return; }
      if (typing) return;
      if (mod && k === "z" && !e.shiftKey) { e.preventDefault(); undo(); return; }
      if (mod && k === "d") { e.preventDefault(); keys.current.dup(); return; }
      if (k === "escape") setNodes((ns) => (ns.some((n) => n.selected) ? ns.map((n) => (n.selected ? { ...n, selected: false } : n)) : ns));
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [undo]);

  // ---------------------------------------------------------------- Stichprobe laden (entprellt)
  const qKey = quelle ? JSON.stringify({ source: quelle.source, segment: quelle.segment, countries: quelle.countries, status: quelle.status, size: quelle.size }) : "";
  useEffect(() => {
    if (!qKey) { setLoading(false); return; }
    let stale = false;
    setLoading(true);
    setLoadErr(null);
    const t = setTimeout(async () => {
      try {
        const r = await previewSource(JSON.parse(qKey));
        if (stale) return;
        if (r.ok) setSample({ rows: unpackRows(r.pack), total: r.exact === false ? null : r.total, at: r.at });
        else setLoadErr(errText(r, "Stichprobe nicht geladen"));
      } catch {
        if (!stale) setLoadErr("Stichprobe nicht geladen – Verbindung prüfen");
      } finally {
        if (!stale) setLoading(false);
      }
    }, 400);
    return () => { stale = true; clearTimeout(t); };
  }, [qKey]);

  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), msg.good ? 4000 : 9000);
    return () => clearTimeout(t);
  }, [msg]);
  useEffect(() => {
    if (!touched) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [touched]);

  // Handy: lesbar starten (Quelle und erster Schritt statt des ganzen Flows in Mini-Schrift)
  const inited = useNodesInitialized();
  const didFit = useRef(false);
  useEffect(() => {
    if (!inited || didFit.current) return;
    didFit.current = true;
    if ((wrap.current?.clientWidth ?? 1000) >= 600) return;
    const q = nodesRef.current.find((n) => n.data.cfg.kind === "quelle");
    if (!q) return;
    const h = wrap.current?.clientHeight ?? 500, z = 0.82;
    void rf.setViewport({ x: 18 - q.position.x * z, y: h * 0.42 - (q.position.y + 70) * z, zoom: z });
  }, [inited, rf]);

  // ---------------------------------------------------------------- Leinwand
  const onNodesChange = useCallback((ch: NodeChange<BkNode>[]) => setNodes((ns) => applyNodeChanges(ch, ns)), []);
  const onEdgesChange = useCallback((ch: EdgeChange<BkEdge>[]) => setEdges((es) => applyEdgeChanges(ch, es)), []);
  const isValidConnection = useCallback((c: Connection | BkEdge) => {
    const s = c.source, t = c.target;
    if (!s || !t || s === t) return false;
    const tn = nodesRef.current.find((n) => n.id === t);
    if (!tn || !NODE_META[tn.data.cfg.kind].input) return false;
    // kein Kreis: führt vom Ziel schon ein Weg zurück zur Quelle der neuen Verbindung?
    const seen = new Set([t]), todo = [t];
    while (todo.length) {
      const id = todo.pop()!;
      for (const e of edgesRef.current) if (e.source === id && !seen.has(e.target)) { if (e.target === s) return false; seen.add(e.target); todo.push(e.target); }
    }
    return true;
  }, []);
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    const port = c.sourceHandle === "ja" || c.sourceHandle === "nein" ? c.sourceHandle : "out";
    setEdges((es) => (es.some((e) => e.source === c.source && (e.sourceHandle ?? "out") === port && e.target === c.target) ? es
      : [...es, { id: uid("e", es.map((e) => e.id)), source: c.source, sourceHandle: port, target: c.target, targetHandle: "in", type: "bk" }]));
  }, []);
  const remove = useCallback((id: string) => { void rf.deleteElements({ nodes: [{ id }] }); }, [rf]);
  const removeEdge = useCallback((id: string) => { void rf.deleteElements({ edges: [{ id }] }); }, [rf]);
  const setCfg = useCallback((cfg: FlowNode) => setNodes((ns) => ns.map((n) => (n.id === cfg.id ? { ...n, data: { cfg } } : n))), []);
  const focus = useCallback((id: string) => {
    setNodes((ns) => ns.map((n) => ({ ...n, selected: n.id === id })));
    void rf.fitView({ nodes: [{ id }], duration: 350, maxZoom: 1.1, padding: 0.6 });
  }, [rf]);

  /** Neuer Baustein: an der Abwurfstelle – oder rechts neben dem gewählten, gleich verbunden (antippen am Handy). */
  const addNode = useCallback((kind: NodeKind, at?: { x: number; y: number }) => {
    const ns = nodesRef.current, es = edgesRef.current;
    if (kind === "quelle" && ns.some((n) => n.data.cfg.kind === "quelle")) { setMsg({ good: false, text: "Es gibt schon eine Quelle – nur eine pro Flow." }); return; }
    if (kind === "pipeline" && ns.some((n) => n.data.cfg.kind === "pipeline")) { setMsg({ good: false, text: "Nur ein Pipeline-Baustein pro Flow." }); return; }
    const id = uid(kind.slice(0, 2), ns.map((n) => n.id));
    const sel = ns.find((n) => n.selected);
    let pos = at ?? null;
    let link: BkEdge | null = null;
    // Antippen ohne Auswahl: ans Ende hängen – rechtester Schritt, freie Ausgänge zuerst
    const free = (n: BkNode) => NODE_META[n.data.cfg.kind].ports.some((p) => !es.some((e) => e.source === n.id && (e.sourceHandle ?? "out") === p));
    const from = sel ?? (at ? undefined : ns.filter((n) => NODE_META[n.data.cfg.kind].ports.length)
      .sort((a, b) => Number(free(b)) - Number(free(a)) || b.position.x - a.position.x)[0]);
    if (!pos && from && NODE_META[from.data.cfg.kind].ports.length && NODE_META[kind].input) {
      const ports = NODE_META[from.data.cfg.kind].ports;
      const port = ports.find((p) => !es.some((e) => e.source === from.id && (e.sourceHandle ?? "out") === p)) ?? ports[0];
      const p = { x: from.position.x + 300, y: from.position.y + (ports.length > 1 ? (port === "ja" ? -100 : 100) : 0) };
      // nicht auf einen anderen Baustein legen: unter den überlappenden schieben
      for (let i = 0; i < 40; i++) {
        const hit = ns.find((n) => Math.abs(n.position.x - p.x) < 260 && p.y < n.position.y + (n.measured?.height ?? 170) + 30 && p.y + 190 > n.position.y);
        if (!hit) break;
        p.y = hit.position.y + (hit.measured?.height ?? 170) + 40;
      }
      pos = p;
      link = { id: uid("e", es.map((e) => e.id)), source: from.id, sourceHandle: port, target: id, targetHandle: "in", type: "bk" };
    }
    if (!pos) {
      // frei: rechts neben dem rechtesten Baustein, sonst Mitte der Fläche
      const right = [...ns].sort((a, b) => b.position.x - a.position.x)[0];
      const b = wrap.current?.getBoundingClientRect();
      const c = b ? rf.screenToFlowPosition({ x: b.left + b.width / 2, y: b.top + b.height / 2 }) : { x: 0, y: 0 };
      pos = right ? { x: right.position.x + 300, y: right.position.y } : { x: c.x - 110, y: c.y - 70 };
    }
    const p = { x: Math.round(pos.x / GRID[0]) * GRID[0], y: Math.round(pos.y / GRID[1]) * GRID[1] };
    setNodes((list) => [...list.map((n) => (n.selected ? { ...n, selected: false } : n)), { id, type: "bk", position: p, data: { cfg: newNode(kind, id, p.x, p.y) }, selected: true }]);
    if (link) { const l = link; setEdges((list) => [...list, l]); }
    if (!at) {
      // Handy: neuen Baustein lesbar groß in die Mitte holen; sonst ihn und seinen Vorgänger zeigen
      const narrow = (wrap.current?.clientWidth ?? 1000) < 600;
      const src = link?.source;
      setTimeout(() => {
        if (narrow) void rf.setCenter(p.x + 112, p.y + 80, { zoom: 0.82, duration: 350 });
        else void rf.fitView({ nodes: src ? [{ id }, { id: src }] : [{ id }], duration: 350, maxZoom: 1, padding: src ? 0.4 : 0.6 });
      }, 60);
    }
    setSheet(null);
  }, [rf]);

  /** Baustein kopieren (Strg+D oder Knopf im Prüfer): gleiche Einstellung, neue id, leicht versetzt, gewählt. */
  const dup = useCallback((id: string) => {
    const ns = nodesRef.current;
    const src = ns.find((n) => n.id === id);
    if (!src) return;
    const f = fromRf(ns, edgesRef.current);
    const copy = duplicateNode(f, id, uid(src.data.cfg.kind.slice(0, 2), ns.map((n) => n.id)));
    if (!copy) { setMsg({ good: false, text: src.data.cfg.kind === "quelle" || src.data.cfg.kind === "pipeline" ? "Quelle und Pipeline gibt es nur einmal." : "Nicht mehr Platz für Bausteine." }); return; }
    setNodes((list) => [...list.map((n) => (n.selected ? { ...n, selected: false } : n)), { id: copy.id, type: "bk", position: { x: copy.x, y: copy.y }, data: { cfg: copy }, selected: true }]);
  }, []);

  const onDragOver = (e: DragEvent) => {
    if (!e.dataTransfer.types.includes(DND)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
    if (!over) setOver(true);
  };
  const onDrop = (e: DragEvent) => {
    setOver(false);
    const k = e.dataTransfer.getData(DND) as NodeKind;
    if (!NODE_KINDS.includes(k)) return;
    e.preventDefault();
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY });
    addNode(k, { x: p.x - 120, y: p.y - 40 });
  };

  // ---------------------------------------------------------------- Baukasten-Chat: Live-Nachladen (Inhaber 04.10.2026)
  // Der Chat meldet alle 20 s den Stand des Flows. Hat er sich geändert (JARVIS hat gebaut) und gibt es keine eigenen
  // ungespeicherten Änderungen, wird neu geladen; sonst Hinweis „Chat hat geändert – neu laden“. Vorschläge (Master,
  // angeschlossene Flows) landen als ungespeicherter Stand auf der Fläche – aktiv erst mit „Übernehmen“/„Speichern“.
  const seen = useRef<string | null>(initial.version ?? null);
  const firstPoll = useRef(true);
  const [stale, setStale] = useState<Remote | null>(null);
  const takeRemote = (r: Remote) => {
    const work = r.pending ?? r.def;
    if (!work) return;
    setNodes(toRfNodes(work));
    setEdges(toRfEdges(work));
    setName(r.name);
    setBase(r.def ? sig(r.name, r.def) : "");
    setPristine(sig(r.name, work));
    if (master) setVersion(r.version);
    skipHist.current = true;
    setStale(null);
    setMsg({ good: true, text: r.pending ? `Vorschlag aus dem Chat${r.note ? `: ${r.note}` : ""} – prüfen und ${master ? "übernehmen" : "speichern"}` : "Vom Chat gebaut – neu geladen" });
    setTimeout(() => { void rf.fitView({ padding: 0.2, maxZoom: 1, duration: 300 }); }, 60);
  };
  const onRemote = (r: Remote) => {
    const first = firstPoll.current;
    firstPoll.current = false;
    const changed = r.version !== seen.current;
    seen.current = r.version;
    if (!changed && !(first && r.pending)) return;
    const work = r.pending ?? r.def;
    if (!work) return;
    if (sig(r.name, work) === now) {
      // gleicher Inhalt (z. B. eigenes Speichern): nur Stand übernehmen
      if (master) setVersion(r.version);
      if (r.def && !r.pending) setBase(sig(r.name, r.def));
      setStale(null);
      return;
    }
    if (!r.pending && r.def && sig(r.name, r.def) === base) {
      // eigenes Speichern (gleicher Inhalt wie zuletzt gespeichert), danach weiter bearbeitet: kein Chat-Hinweis
      if (master) setVersion(r.version);
      setStale(null);
      return;
    }
    if (touched) { setStale(r); return; }
    takeRemote(r);
  };
  const reloadRemote = () => {
    if (!stale || !window.confirm("Deine ungespeicherten Änderungen verwerfen und den Stand aus dem Chat laden?")) return;
    takeRemote(stale);
  };

  // ---------------------------------------------------------------- Laden, Speichern, Aktionen
  const replaceAll = (f: Flow, n: string, id: string | null, nav: string, url: string) => {
    setNodes(toRfNodes(f));
    setEdges(toRfEdges(f));
    setName(n);
    setFlowId(id);
    setBase(id ? sig(n, f) : "");
    setPristine(sig(n, f));
    hist.current = [];
    setUndoN(0);
    skipHist.current = true;
    onNav(nav);
    window.history.replaceState(null, "", url);
    setTimeout(() => { void rf.fitView({ padding: 0.2, maxZoom: 1, duration: 300 }); }, 60);
  };
  /** Nur die Fläche ersetzen (Master/Agent: gleiche Zeile, Name bleibt; Strg+Z holt den alten Stand zurück). */
  const loadGraph = (f: Flow) => {
    setNodes(toRfNodes(f));
    setEdges(toRfEdges(f));
    setTimeout(() => { void rf.fitView({ padding: 0.2, maxZoom: 1, duration: 300 }); }, 60);
  };
  const loadTemplate = (tid: string) => {
    if (master) {
      const t = MASTER_TEMPLATES.find((x) => x.id === tid);
      if (!t || !window.confirm(`Vorlage „${t.label}“ laden? Gilt erst nach „Übernehmen“ (Strg+Z holt den alten Stand zurück).`)) return;
      loadGraph(spread(resolvePools(t.flow(), pools)));
      return;
    }
    const t = TEMPLATES.find((x) => x.id === tid);
    if (!t || (touched && !window.confirm("Ungespeicherte Änderungen verwerfen?"))) return;
    if (agentMode) { loadGraph(spread(structuredClone(t.flow))); return; }
    replaceAll(spread(structuredClone(t.flow)), t.label.slice(0, 60), null, BLANK_NAV, "/dashboard/baukasten");
  };
  const blank = () => {
    if (touched && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    if (master || agentMode) { loadGraph(blankFlow()); return; }
    replaceAll(blankFlow(), "Neuer Flow", null, BLANK_NAV, "/dashboard/baukasten");
  };
  const openFlow = (id: string) => {
    if (touched && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    router.push(id ? `/dashboard/baukasten?flow=${encodeURIComponent(id)}` : "/dashboard/baukasten");
  };

  const save = () => {
    const n = name.trim();
    if (!n) { setMsg({ good: false, text: "Name fehlt" }); return; }
    if (master) return saveMasterNow(n);
    if (agentMode) return saveAgentNow(agent ? { ...agent, name: n } : null);
    if (active && errors) { setMsg({ good: false, text: "Läuft in der Pipeline – erst die Fehler beheben" }); return; }
    const def = flow, s = now;
    startBusy(async () => {
      try {
        const r = await saveFlow({ id: flowId ?? undefined, name: n, def });
        if (!r.ok) { setMsg({ good: false, text: errText(r, "Speichern fehlgeschlagen") }); return; }
        setBase(s);
        setPristine(s);
        if (r.id && r.id !== flowId) {
          setFlowId(r.id);
          onNav(`flow:${r.id}`);
          window.history.replaceState(null, "", `/dashboard/baukasten?flow=${encodeURIComponent(r.id)}`);
        }
        setMsg({ good: true, text: active ? "Gespeichert – gilt ab jetzt für neue Leads" : "Gespeichert" });
        router.refresh();
      } catch {
        setMsg({ good: false, text: "Speichern fehlgeschlagen" });
      }
    });
  };
  /** Master: Speichern = sofort aktiv übernehmen (Rückfrage mit Vorschau). */
  const saveMasterNow = (n: string) => {
    if (errors) { setMsg({ good: false, text: `Erst die Fehler beheben (${errors})` }); return; }
    const h = hold && hold.scope ? `\n\nStichprobe: ${fmt(hold.held)} von ${fmt(hold.scope)} würden von der Pipeline zurückgehalten.` : "";
    const g = noGate ? "\n\nOhne Freigabe-Baustein – die Drei-Stufen-Freigabe läuft trotzdem immer." : "";
    if (!window.confirm(`Master-Pipeline übernehmen? Gilt sofort für alle neuen Leads.${h}${g}`)) return;
    const def = flow, s = now;
    startBusy(async () => {
      try {
        const r = await saveMaster({ id: flowId, version, name: n, def });
        if (!r.ok) { setMsg({ good: false, text: errText(r, "Übernehmen fehlgeschlagen") }); return; }
        setBase(s);
        setPristine(s);
        setVersion(r.version);
        if (r.id !== flowId) { setFlowId(r.id); onNav(`master:${r.id}`); }
        setMsg({ good: true, text: `Übernommen – gilt ab jetzt${r.released ? ` · ${fmt(r.released)} Leads neu geprüft` : ""}` });
        router.refresh();
      } catch {
        setMsg({ good: false, text: "Übernehmen fehlgeschlagen" });
      }
    });
  };
  /** Agent speichern: im Agenten-Bereich die Zeile ändern, sonst (Formular „Als Agent“) eine neue anlegen. */
  const saveAgentNow = (a: AgentState | null, asNew = false) => {
    if (!a) { setAgentForm({ mode: "edit", err: null }); return; }
    if (errors) { const t = `Erst die Fehler beheben (${errors})`; setMsg({ good: false, text: t }); setAgentForm((f) => (f ? { ...f, err: t } : f)); return; }
    const def = flow;
    startBusy(async () => {
      try {
        const r = await saveAgent({ id: asNew ? null : a.id, agent: a, def });
        if (!r.ok) { const t = errText(r, "Agent nicht gespeichert"); setMsg({ good: false, text: t }); setAgentForm((f) => (f ? { ...f, err: t } : f)); return; }
        setAgentForm(null);
        if (asNew) { setMsg({ good: true, text: `Agent „${a.name}“ gespeichert · ${describeTrigger(a)}` }); router.refresh(); return; }
        setAgent({ ...a, id: r.id });
        setName(a.name);
        const s = sig(a.name, def);
        setBase(s);
        setPristine(s);
        setMsg({ good: true, text: "Agent gespeichert" });
        router.refresh();
      } catch {
        setMsg({ good: false, text: "Agent nicht gespeichert" });
      }
    });
  };
  const addPool = async (poolName: string): Promise<{ id: string; name: string } | string> => {
    try {
      const r = await createPool(poolName);
      if (!r.ok) return errText(r, "Speicher nicht angelegt");
      setPools((ps) => (ps.some((p) => p.id === r.pool.id) ? ps : [...ps, { id: r.pool.id, name: r.pool.name, color: null, n: 0, byCountry: {} }]));
      setMsg({ good: true, text: r.created ? `Speicher „${r.pool.name}“ angelegt` : `Speicher „${r.pool.name}“ gab es schon – gewählt` });
      return r.pool;
    } catch {
      return "Speicher nicht angelegt – Verbindung prüfen";
    }
  };
  keys.current = { dup: () => { const sel = nodesRef.current.find((n) => n.selected); if (sel) dup(sel.id); }, save: () => { if (!busy && dirty) save(); } };

  const run = (fn: () => Promise<unknown>, ok: (r: unknown) => string, fail: string) => startBusy(async () => {
    try {
      const r = await fn();
      const good = !!(r && typeof r === "object" && (r as { ok?: unknown }).ok);
      setMsg(good ? { good, text: ok(r) } : { good, text: errText(r, fail) });
      if (good) router.refresh();
    } catch {
      setMsg({ good: false, text: fail });
    }
  });
  const pipeName = pipe?.kind === "pipeline" ? pipe.name : "";
  const act = {
    activate: () => {
      if (!flowId) return;
      const h = hold ? `\n\nStichprobe: ${fmt(hold.held)} von ${fmt(hold.scope)} würden zurückgehalten.` : "";
      if (!window.confirm(`„${pipeName}“ an die Pipeline anschließen? Gilt dann für alle neuen Leads dieser Quelle – nur strenger, nie lockerer.${h}`)) return;
      run(() => activateFlow(flowId), () => "Angeschlossen – läuft in der Pipeline", "Anschließen fehlgeschlagen");
    },
    deactivate: () => {
      if (!flowId || !window.confirm(`„${pipeName}“ von der Pipeline lösen? Von ihr zurückgehaltene Leads gehen zurück in die normale Freigabe.`)) return;
      run(() => deactivateFlow(flowId), (r) => {
        const c = num(r, "released") ?? num(r, "count");
        return `Gelöst${c !== null ? ` – ${fmt(c)} Leads zurück in die Freigabe` : ""}`;
      }, "Lösen fehlgeschlagen");
    },
    toAgent: (nodeId: string) => {
      if (!flowId) return;
      run(() => flowToAgent(flowId, nodeId), () => "Auftrag erteilt – siehe JARVIS › Agenten", "Auftrag fehlgeschlagen");
    },
  };
  const archive = () => {
    if (!flowId || !window.confirm(`„${name}“ archivieren?${active ? " Die Regel wird dabei von der Pipeline gelöst." : ""}`)) return;
    const id = flowId;
    startBusy(async () => {
      try {
        const r = await archiveFlow(id);
        if (!r || !(r as { ok?: unknown }).ok) { setMsg({ good: false, text: errText(r, "Archivieren fehlgeschlagen") }); return; }
        replaceAll(spread(structuredClone(TEMPLATES[0].flow)), TEMPLATES[0].label, null, BLANK_NAV, "/dashboard/baukasten");
        setMsg({ good: true, text: "Archiviert" });
        router.refresh();
      } catch {
        setMsg({ good: false, text: "Archivieren fehlgeschlagen" });
      }
    });
  };

  // ---------------------------------------------------------------- Ansicht
  const pending = loading && !sample.rows.length;
  const live = useMemo<Live>(() => ({ res, probs: probMap, loading, pending, total: sample.total, reduced, pipelineLive: active && !dirty, remove, removeEdge }),
    [res, probMap, loading, pending, sample.total, reduced, active, dirty, remove, removeEdge]);
  const selected = nodes.find((n) => n.selected) ?? null;
  const ctx: InsCtx = { flowId, dirty, active, errors, busy, size: quelle?.size ?? 1000, sample: sample.rows.length, total: sample.total, at: sample.at, loading, error: loadErr, hold };
  const nodeProbs = (id: string) => probMap.get(id) ?? [];
  const status = master ? (flowId ? <span className="bk-chip on gold">aktiv</span> : <span className="bk-chip">noch nicht übernommen</span>)
    : agentMode ? (agent?.archived ? <span className="bk-chip aus">Archiv</span> : agent?.enabled === false ? <span className="bk-chip aus">aus</span>
      : <span className="bk-chip on gold">{agent ? describeTrigger(agent) : "Agent"}</span>)
    : active ? <span className="bk-chip on">läuft in der Pipeline</span>
    : saved?.status === "aus" ? <span className="bk-chip aus">aus</span> : <span className="bk-chip">Entwurf</span>;
  const tpls = master ? MASTER_TEMPLATES.map((t) => ({ id: t.id, label: t.label })) : TEMPLATES.map((t) => ({ id: t.id, label: t.label }));
  const newAgent: AgentState = { id: null, name: name.trim().slice(0, 60) || "Mein Agent", trigger: "taeglich", at_hour: 7, at_minute: 0, weekdays: null, every_hours: null, ai_brief: null, ai_market: suggestMarket(logic) };
  const saveLabel = master ? "Übernehmen" : "Speichern";

  return (
    <LiveCtx.Provider value={live}>
      <div className={`bk k-${kind}`}>
        <div className="bk-top">
          <span className="bk-brand"><i aria-hidden><Icon name={master ? "schloss" : agentMode ? "agent" : "baukasten"} size={16} /></i><span>{master ? "Master" : agentMode ? "Agent" : "Baukasten"}</span></span>
          <input className="bk-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label={`Name (${kindLabel(kind)})`} placeholder="Name" />
          {status}
          {dirty ? <span className="bk-dirty">{master ? "nicht übernommen" : "ungespeichert"}</span> : flowId ? <span className="bk-saved">{master ? "übernommen" : "gespeichert"}</span> : null}
          <span className="bk-sp" />
          {kind === "test" && (
            <select className="bk-sel" value={flowId ?? ""} onChange={(e) => openFlow(e.target.value)} aria-label="Gespeicherte Flows">
              <option value="">{`Flows (${flows.length})`}</option>
              {flows.map((f) => <option key={f.id} value={f.id}>{f.status === "aktiv" ? "aktiv · " : ""}{f.name}</option>)}
            </select>
          )}
          <select className="bk-sel" value="" onChange={(e) => (e.target.value === "_neu" ? blank() : loadTemplate(e.target.value))} aria-label="Vorlagen">
            <option value="">Vorlagen</option>
            <option value="_neu">Neu: leer (nur Quelle)</option>
            {tpls.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          {agentMode ? (
            <button type="button" className="bk-btn" onClick={() => setAgentForm({ mode: "edit", err: null })} disabled={busy} title="Name, Auslöser, KI-Auftrag">
              <Icon name="uhr" size={15} />Auslöser
            </button>
          ) : (
            <button type="button" className="bk-btn" onClick={() => setAgentForm({ mode: "neu", err: null })} disabled={busy || errors > 0}
              title={errors ? "Erst Fehler beheben" : "Diesen Flow als eigenen Agenten speichern (läuft dann von selbst)"}>
              <Icon name="agent" size={15} />Als Agent
            </button>
          )}
          {quelle && (
            <span className="bk-seg" role="group" aria-label="Stichprobe" title="Stichprobe: so viele neueste Zeilen werden live durchgerechnet">
              {([1000, 2000, 5000] as const).map((n) => (
                <button key={n} type="button" className={quelle.size === n ? "on" : ""} onClick={() => setCfg({ ...quelle, size: n })}>{fmt(n)}</button>
              ))}
            </span>
          )}
          <span className="bk-prob">
            <button type="button" className="bk-pb" onClick={() => setShowProbs((v) => !v)} aria-expanded={showProbs} title="Prüfung des Flows">
              {errors ? <b className="e">{errors}</b> : null}{warns ? <b className="w">{warns}</b> : null}{!probs.length && <b className="ok"><Icon name="ok" size={13} /></b>}
              <span className="t">{errors ? "Fehler" : warns ? "Hinweise" : "alles gut"}</span>
            </button>
            {showProbs && probs.length > 0 && (
              <div className="bk-pop">
                <ProblemList probs={probs} nodes={logic.nodes} pick={(id) => { focus(id); setShowProbs(false); setSheet("ins"); }} />
              </div>
            )}
          </span>
          <button type="button" className="bk-btn bk-undo" onClick={undo} disabled={!undoN} title="Rückgängig (Strg+Z)" aria-label="Rückgängig"><Icon name="rueckgaengig" size={16} /></button>
          <button type="button" className={`bk-btn ${master ? "gold" : "go"}${dirty ? " dot" : ""}`} onClick={save}
            disabled={busy || (!dirty && !(master && !flowId)) || ((active || master || agentMode) && errors > 0)}
            title={errors && (active || master || agentMode) ? "Erst Fehler beheben" : master ? "Übernehmen = gilt sofort für neue Leads (Strg+S)" : "Speichern (Strg+S, nie automatisch)"}>
            {busy ? "…" : saveLabel}
          </button>
        </div>
        {msg && <div className={`bk-msg ${msg.good ? "good" : "bad"}`} role="status">{msg.text}</div>}
        {noGate && (
          <div className="bk-gate" role="note"><Icon name="schloss" size={16} /><span><b>Drei-Stufen-Freigabe läuft trotzdem immer</b> (feste Regel) – auch ohne Baustein.</span></div>
        )}
        {agentForm && (
          <AgentForm key={agentForm.mode} init={agentForm.mode === "edit" && agent ? { ...agent, name: name.trim() || agent.name } : newAgent}
            title={agentForm.mode === "edit" ? "Agent einstellen" : "Als Agent speichern"} busy={busy} err={agentForm.err}
            close={() => setAgentForm(null)}
            submit={(a: AgentInput) => (agentForm.mode === "edit" ? saveAgentNow({ ...agent, ...a, id: agent?.id ?? null }) : saveAgentNow({ ...a, id: null }, true))} />
        )}

        <div className="bk-main">
          <aside className={`bk-pal${sheet === "pal" ? " open" : ""}`} aria-label="Bausteine">
            <div className="bk-sheet-h"><h4>Baustein hinzufügen</h4><button type="button" className="bk-x x-btn" onClick={() => setSheet(null)} aria-label="Schließen"><Icon name="schliessen" size={14} /></button></div>
            {GROUPS.map(([label, kinds]) => (
              <div key={label}>
                <h4>{label}</h4>
                <ul>
                  {kinds.map((k) => {
                    const m = NODE_META[k];
                    const taken = (k === "quelle" || k === "pipeline") && nodes.some((n) => n.data.cfg.kind === k);
                    return (
                      <li key={k}>
                        <button type="button" className="bk-tile" style={{ "--nc": m.color } as CSSProperties} draggable={!taken} disabled={taken}
                          onDragStart={(e) => { e.dataTransfer.setData(DND, k); e.dataTransfer.effectAllowed = "copy"; }}
                          onClick={() => addNode(k)} title={taken ? "nur einmal pro Flow" : `${m.hint} – ziehen oder antippen`}>
                          <i aria-hidden><Icon name={m.icon} size={16} /></i><b>{m.label}</b><span>{m.hint}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <p title="Antippen hängt den Baustein an den gewählten an – ohne Auswahl ans Ende.">Ziehen oder antippen.</p>
          </aside>

          <div ref={wrap} className={`bk-cv${over ? " over" : ""}`} onDragOver={onDragOver} onDragLeave={() => setOver(false)} onDrop={onDrop}>
            <span className="bk-cn tl" /><span className="bk-cn tr" /><span className="bk-cn bl" /><span className="bk-cn br" />
            <div className="bk-hud">
              {loading ? <span className="ld">Stichprobe lädt …</span>
                : <span><b className="bk-num">{fmt(sample.rows.length)}</b> {source === "leads" ? "Leads" : "Käufer"} in der Stichprobe{sample.at ? ` · ${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(sample.at))}` : ""}</span>}
              {loadErr && <span className="er">{loadErr}</span>}
              {!loading && !loadErr && quelle && !sample.rows.length && <span className="er">keine Zeilen – Quelle weiter fassen (Länder, Status)</span>}
            </div>
            {!nodes.length && <div className="bk-empty">Baustein aus der Palette hierher ziehen<br />oder oben eine Vorlage wählen</div>}
            <ReactFlow<BkNode, BkEdge>
              nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} isValidConnection={isValidConnection}
              onNodeClick={() => setSheet("ins")} onPaneClick={() => setSheet(null)}
              snapToGrid snapGrid={GRID} fitView fitViewOptions={{ padding: 0.05, maxZoom: 1 }} minZoom={0.2} maxZoom={1.8}
              deleteKeyCode={["Backspace", "Delete"]} colorMode="dark" defaultEdgeOptions={{ type: "bk" }}
              connectionRadius={28} elevateNodesOnSelect>
              <Background variant={BackgroundVariant.Dots} gap={GRID[0]} size={1.4} color="rgba(95,212,255,.22)" />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap pannable zoomable position="bottom-right" nodeColor={(n) => NODE_META[(n as BkNode).data.cfg.kind].color} nodeStrokeWidth={0}
                maskColor="rgba(2,6,15,.72)" style={{ width: 150, height: 100 }} className="bk-mm" />
            </ReactFlow>
            <div className="bk-fab">
              <button type="button" className="bk-add" onClick={() => setSheet("pal")}><Icon name="mehr" size={16} />Baustein</button>
              <button type="button" className="bk-btn" onClick={() => setSheet("ins")}>{selected ? <><Icon name="einstellungen" size={15} />Einstellen</> : "Übersicht"}</button>
            </div>
          </div>

          <aside className={`bk-ins${sheet === "ins" ? " open" : ""}`} aria-label={selected ? "Baustein einstellen" : "Übersicht"}>
            {selected ? (
              <Inspector key={selected.id} cfg={selected.data.cfg} rows={res[selected.id]} source={source} pipe={toPipe.has(selected.id)}
                probs={nodeProbs(selected.id)} ctx={ctx} set={setCfg} remove={() => remove(selected.id)} dup={() => dup(selected.id)}
                kind={kind} flowName={name.trim() || "Agent"} pools={pools} addPool={addPool}
                close={() => { setSheet(null); setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n))); }} act={act} />
            ) : (
              <Overview nodes={logic.nodes} res={res} probs={probs} ctx={ctx} source={source} focus={(id) => focus(id)}
                close={() => setSheet(null)} archive={flowId && kind === "test" ? archive : null} kind={kind} />
            )}
          </aside>
          <div className={`bk-shade${sheet ? " open" : ""}`} onClick={() => setSheet(null)} aria-hidden />
        </div>
        <p className="bk-lock"><Icon name="schloss" size={14} /> {master ? "Master: Übernehmen gilt sofort. Die Pipeline macht die Freigabe nur strenger; Speicher füllen sich mit neuen Leads."
          : agentMode ? "Agent: läuft von selbst nach Auslöser. Nie Versand." : "Regeln machen die Freigabe nur strenger."} Versand, Sperrliste und die drei Prüfstufen bleiben immer an.</p>
        <FlowChat flowId={flowId} kind={kind} proposal={master || active} stale={!!stale} onRemote={onRemote} onReload={reloadRemote} />
      </div>
    </LiveCtx.Provider>
  );
}

function ProblemList({ probs, nodes, pick }: { probs: Problem[]; nodes: FlowNode[]; pick: (id: string) => void }) {
  const label = (id?: string) => {
    const n = id ? nodes.find((x) => x.id === id) : null;
    return n ? n.title || NODE_META[n.kind].label : null;
  };
  return (
    <ul className="bk-pl">
      {probs.map((p, i) => (
        <li key={i} className={p.level}>
          <button type="button" onClick={() => p.nodeId && pick(p.nodeId)} disabled={!p.nodeId}>
            <i />{label(p.nodeId) ? <span><em>{label(p.nodeId)}:</em> {p.msg}</span> : p.msg}
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Ohne gewählten Baustein: Stichprobe, Bausteine mit Zahlen, Prüfung, kurze Anleitung. */
function Overview({ nodes, res, probs, ctx, source, focus, close, archive, kind }: {
  nodes: FlowNode[]; res: ReturnType<typeof runFlowRows>; probs: Problem[]; ctx: InsCtx; source: Source; focus: (id: string) => void; close: () => void;
  archive: (() => void) | null; kind: FlowKind;
}) {
  const t = ctx.at ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(ctx.at)) : "–";
  return (
    <>
      <div className="bk-sheet-h"><h4>Übersicht</h4><button type="button" className="bk-x x-btn" onClick={close} aria-label="Schließen"><Icon name="schliessen" size={14} /></button></div>
      <div className="bk-bigs" style={{ "--nc": "#5fd4ff" } as CSSProperties}>
        <div className="hi"><b>{ctx.loading ? "…" : fmt(ctx.sample)}</b><span>Stichprobe</span></div>
        <div><b>{ctx.total === null ? "–" : fmt(ctx.total)}</b><span>{source === "leads" ? "Leads" : "Käufer"} gesamt</span></div>
        <div><b>{ctx.loading ? "…" : t}</b><span>Stand</span></div>
      </div>
      <section className="bk-sec">
        <h4>Bausteine</h4>
        {!nodes.length && <p className="bk-hint">Noch leer – Quelle aus der Palette ziehen oder eine Vorlage wählen.</p>}
        <ul className="bk-ov">
          {nodes.map((n) => {
            const m = NODE_META[n.kind];
            const r = res[n.id];
            return (
              <li key={n.id}>
                <button type="button" onClick={() => focus(n.id)} style={{ "--nc": m.color } as CSSProperties}>
                  <i aria-hidden><Icon name={m.icon} size={16} /></i><span>{n.title || (n.kind === "pipeline" ? n.name : m.label)}</span>
                  <b>{r?.connected || n.kind === "quelle" ? fmt(outRows(n, r).length) : "–"}</b>
                </button>
              </li>
            );
          })}
        </ul>
      </section>
      {probs.length > 0 && (
        <section className="bk-sec"><h4>Prüfung</h4><ProblemList probs={probs} nodes={nodes} pick={focus} /></section>
      )}
      <section className="bk-sec">
        <h4>So geht’s</h4>
        <ul className="bk-howto">
          <li><i aria-hidden><Icon name="ziehen" size={16} /></i>Baustein aus der Palette auf die Fläche ziehen</li>
          <li><i aria-hidden><Icon name="verbinden" size={16} /></i>Vom rechten Punkt zum linken Punkt ziehen = verbinden</li>
          <li><i aria-hidden><Icon name="antippen" size={16} /></i>Baustein antippen = einstellen, Zahlen sofort sehen</li>
          <li><i aria-hidden><Icon name="ruecktaste" size={16} /></i><span>Entf oder <Icon name="schliessen" size={13} title="Kreuz" /> = löschen · Strg+D = kopieren · Strg+Z = zurück</span></li>
          {kind === "master" ? <li><i aria-hidden><Icon name="speicher" size={16} /></i>Speicher-Baustein = eigener Speicher für Proben und Lieferungen</li>
            : kind === "agent" ? <li><i aria-hidden><Icon name="melden" size={16} /></i>Melden-Baustein = kurze Nachricht an dich bei jedem Lauf</li>
            : <li><i aria-hidden><Icon name="pipeline" size={16} /></i>Gefällt’s? Pipeline-Baustein anhängen und anschließen – oder „Als Agent“</li>}
        </ul>
      </section>
      {archive && <button type="button" className="bk-btn red" onClick={archive} disabled={ctx.busy} style={{ justifySelf: "start" }}>Archivieren</button>}
    </>
  );
}

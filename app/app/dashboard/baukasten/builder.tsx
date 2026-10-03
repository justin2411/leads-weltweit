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
  Background, BackgroundVariant, Controls, MiniMap, ReactFlow, ReactFlowProvider, applyEdgeChanges, applyNodeChanges, useReactFlow,
  type Connection, type EdgeChange, type NodeChange,
} from "@xyflow/react";
import {
  NODE_KINDS, NODE_META, TEMPLATES, inScope, newNode, problems, runFlowRows, unpackRows,
  type Flow, type FlowNode, type NodeKind, type Port, type Problem, type Row, type Source,
} from "@/lib/flow";
import { activateFlow, archiveFlow, deactivateFlow, flowToAgent, previewSource, saveFlow } from "./actions";
import { BkEdgeView, BkNodeView, LiveCtx, fmt, outRows, type BkEdge, type BkNode, type Live } from "./nodes";
import { Inspector, type InsCtx } from "./inspector";

export type SavedFlow = { id: string; name: string; status: string; updated_at: string | null };
export type BuilderInit = { id: string | null; name: string; flow: Flow };

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
export function Builder({ navKey, initial, flows, notice }: { navKey: string; initial: BuilderInit; flows: SavedFlow[]; notice: string | null }) {
  const [st, setSt] = useState({ prop: navKey, own: null as string | null, gen: 0, initial, notice });
  if (navKey !== st.prop) {
    if (navKey === st.own) setSt({ ...st, prop: navKey });
    else setSt({ prop: navKey, own: null, gen: st.gen + 1, initial, notice });
  }
  const onNav = useCallback((k: string) => setSt((s) => ({ ...s, own: k })), []);
  return (
    <ReactFlowProvider key={st.gen}>
      <Editor initial={st.initial} flows={flows} onNav={onNav} notice={st.notice} />
    </ReactFlowProvider>
  );
}

type Sample = { rows: Row[]; total: number | null; at: string | null };

function Editor({ initial, flows, onNav, notice }: { initial: BuilderInit; flows: SavedFlow[]; onNav: (k: string) => void; notice: string | null }) {
  const router = useRouter();
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
  const probs = useMemo(() => problems(logic), [logic]);
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
  const active = saved?.status === "aktiv";

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
    if (!pos && sel && NODE_META[sel.data.cfg.kind].ports.length && NODE_META[kind].input) {
      const ports = NODE_META[sel.data.cfg.kind].ports;
      const port = ports.find((p) => !es.some((e) => e.source === sel.id && (e.sourceHandle ?? "out") === p)) ?? ports[0];
      let p = { x: sel.position.x + 320, y: sel.position.y + (ports.length > 1 ? (port === "ja" ? -100 : 100) : 0) };
      while (ns.some((n) => Math.abs(n.position.x - p.x) < 220 && Math.abs(n.position.y - p.y) < 130)) p = { x: p.x, y: p.y + 150 };
      pos = p;
      link = { id: uid("e", es.map((e) => e.id)), source: sel.id, sourceHandle: port, target: id, targetHandle: "in", type: "bk" };
    }
    if (!pos) {
      const b = wrap.current?.getBoundingClientRect();
      const c = b ? rf.screenToFlowPosition({ x: b.left + b.width / 2, y: b.top + b.height / 2 }) : { x: 0, y: 0 };
      pos = { x: c.x - 120, y: c.y - 70 };
    }
    const p = { x: Math.round(pos.x / GRID[0]) * GRID[0], y: Math.round(pos.y / GRID[1]) * GRID[1] };
    setNodes((list) => [...list.map((n) => (n.selected ? { ...n, selected: false } : n)), { id, type: "bk", position: p, data: { cfg: newNode(kind, id, p.x, p.y) }, selected: true }]);
    if (link) {
      const l = link;
      setEdges((list) => [...list, l]);
      setTimeout(() => { void rf.fitView({ nodes: [{ id }, { id: l.source }], duration: 350, maxZoom: 1, padding: 0.4 }); }, 60);
    }
    setSheet(null);
  }, [rf]);

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

  // ---------------------------------------------------------------- Laden, Speichern, Aktionen
  const replaceAll = (f: Flow, n: string, id: string | null, nav: string, url: string) => {
    setNodes(toRfNodes(f));
    setEdges(toRfEdges(f));
    setName(n);
    setFlowId(id);
    setBase(id ? sig(n, f) : "");
    setPristine(sig(n, f));
    onNav(nav);
    window.history.replaceState(null, "", url);
    setTimeout(() => { void rf.fitView({ padding: 0.2, maxZoom: 1, duration: 300 }); }, 60);
  };
  const loadTemplate = (tid: string) => {
    const t = TEMPLATES.find((x) => x.id === tid);
    if (!t || (touched && !window.confirm("Ungespeicherte Änderungen verwerfen?"))) return;
    replaceAll(structuredClone(t.flow), t.label.slice(0, 60), null, BLANK_NAV, "/dashboard/baukasten");
  };
  const blank = () => {
    if (touched && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    replaceAll({ v: 1, nodes: [newNode("quelle", "q", 40, 160)], edges: [] }, "Neuer Flow", null, BLANK_NAV, "/dashboard/baukasten");
  };
  const openFlow = (id: string) => {
    if (touched && !window.confirm("Ungespeicherte Änderungen verwerfen?")) return;
    router.push(id ? `/dashboard/baukasten?flow=${encodeURIComponent(id)}` : "/dashboard/baukasten");
  };

  const save = () => {
    const n = name.trim();
    if (!n) { setMsg({ good: false, text: "Name fehlt" }); return; }
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
        replaceAll(structuredClone(TEMPLATES[0].flow), TEMPLATES[0].label, null, BLANK_NAV, "/dashboard/baukasten");
        setMsg({ good: true, text: "Archiviert" });
        router.refresh();
      } catch {
        setMsg({ good: false, text: "Archivieren fehlgeschlagen" });
      }
    });
  };

  // ---------------------------------------------------------------- Ansicht
  const live = useMemo<Live>(() => ({ res, probs: probMap, loading, total: sample.total, reduced, pipelineLive: active && !dirty, remove, removeEdge }),
    [res, probMap, loading, sample.total, reduced, active, dirty, remove, removeEdge]);
  const selected = nodes.find((n) => n.selected) ?? null;
  const ctx: InsCtx = { flowId, dirty, active, errors, busy, size: quelle?.size ?? 1000, sample: sample.rows.length, total: sample.total, at: sample.at, loading, error: loadErr, hold };
  const nodeProbs = (id: string) => probMap.get(id) ?? [];
  const status = active ? <span className="bk-chip on">läuft in der Pipeline</span>
    : saved?.status === "aus" ? <span className="bk-chip aus">aus</span> : <span className="bk-chip">Entwurf</span>;

  return (
    <LiveCtx.Provider value={live}>
      <div className="bk">
        <div className="bk-top">
          <span className="bk-brand"><i aria-hidden>⧉</i><span>Baukasten</span></span>
          <input className="bk-name" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} aria-label="Name des Flows" placeholder="Name des Flows" />
          {status}
          {dirty ? <span className="bk-dirty">ungespeichert</span> : flowId ? <span className="bk-saved">gespeichert</span> : null}
          <span className="bk-sp" />
          <select className="bk-sel" value={flowId ?? ""} onChange={(e) => openFlow(e.target.value)} aria-label="Gespeicherte Flows">
            <option value="">{flows.length ? `Gespeichert (${flows.length}) …` : "Noch keine gespeichert"}</option>
            {flows.map((f) => <option key={f.id} value={f.id}>{f.status === "aktiv" ? "⇶ " : ""}{f.name}</option>)}
          </select>
          <select className="bk-sel" value="" onChange={(e) => (e.target.value === "_neu" ? blank() : loadTemplate(e.target.value))} aria-label="Vorlagen">
            <option value="">Vorlagen …</option>
            <option value="_neu">＋ Leer (nur Quelle)</option>
            {TEMPLATES.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
          {quelle && (
            <span className="bk-seg" role="group" aria-label="Stichprobe">
              <em>Stichprobe</em>
              {([1000, 2000, 5000] as const).map((n) => (
                <button key={n} type="button" className={quelle.size === n ? "on" : ""} onClick={() => setCfg({ ...quelle, size: n })}>{fmt(n)}</button>
              ))}
            </span>
          )}
          <span className="bk-prob">
            <button type="button" className="bk-pb" onClick={() => setShowProbs((v) => !v)} aria-expanded={showProbs} title="Prüfung des Flows">
              {errors ? <b className="e">{errors}</b> : null}{warns ? <b className="w">{warns}</b> : null}{!probs.length && <b className="ok">✓</b>}
              {errors ? "Fehler" : warns ? "Hinweise" : "alles gut"}
            </button>
            {showProbs && probs.length > 0 && (
              <div className="bk-pop">
                <ProblemList probs={probs} nodes={logic.nodes} pick={(id) => { focus(id); setShowProbs(false); setSheet("ins"); }} />
              </div>
            )}
          </span>
          <button type="button" className={`bk-btn go${dirty ? " dot" : ""}`} onClick={save} disabled={busy || !dirty || (active && errors > 0)}
            title={active && errors ? "Läuft in der Pipeline – erst Fehler beheben" : "Speichern (nie automatisch)"}>
            {busy ? "…" : "Speichern"}
          </button>
        </div>
        {msg && <div className={`bk-msg ${msg.good ? "good" : "bad"}`} role="status">{msg.text}</div>}

        <div className={`bk-main${selected ? "" : " noin"}`}>
          <aside className={`bk-pal${sheet === "pal" ? " open" : ""}`} aria-label="Bausteine">
            <div className="bk-sheet-h"><h4>Baustein hinzufügen</h4><button type="button" className="bk-x" onClick={() => setSheet(null)} aria-label="Schließen">✕</button></div>
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
                          <i aria-hidden>{m.icon}</i><b>{m.label}</b><span>{m.hint}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
            <p>Ziehen oder antippen. Antippen hängt den Baustein direkt an den gewählten an.</p>
          </aside>

          <div ref={wrap} className={`bk-cv${over ? " over" : ""}`} onDragOver={onDragOver} onDragLeave={() => setOver(false)} onDrop={onDrop}>
            <span className="bk-cn tl" /><span className="bk-cn tr" /><span className="bk-cn bl" /><span className="bk-cn br" />
            <div className="bk-hud">
              {loading ? <span className="ld">Stichprobe lädt …</span>
                : <span><b className="bk-num">{fmt(sample.rows.length)}</b> {source === "leads" ? "Leads" : "Käufer"} in der Stichprobe{sample.at ? ` · ${new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(sample.at))}` : ""}</span>}
              {loadErr && <span className="er">{loadErr}</span>}
            </div>
            {!nodes.length && <div className="bk-empty">Baustein aus der Palette hierher ziehen</div>}
            <ReactFlow<BkNode, BkEdge>
              nodes={nodes} edges={edges} nodeTypes={nodeTypes} edgeTypes={edgeTypes}
              onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect} isValidConnection={isValidConnection}
              onNodeClick={() => setSheet("ins")} onPaneClick={() => setSheet(null)}
              snapToGrid snapGrid={GRID} fitView fitViewOptions={{ padding: 0.2, maxZoom: 1 }} minZoom={0.2} maxZoom={1.8}
              deleteKeyCode={["Backspace", "Delete"]} colorMode="dark" defaultEdgeOptions={{ type: "bk" }}
              connectionRadius={28} elevateNodesOnSelect>
              <Background variant={BackgroundVariant.Dots} gap={GRID[0]} size={1.4} color="rgba(95,212,255,.22)" />
              <Controls showInteractive={false} position="bottom-left" />
              <MiniMap pannable zoomable position="bottom-right" nodeColor={(n) => NODE_META[(n as BkNode).data.cfg.kind].color} nodeStrokeWidth={0}
                maskColor="rgba(2,6,15,.72)" style={{ width: 150, height: 100 }} className="bk-mm" />
            </ReactFlow>
            <button type="button" className="bk-add" onClick={() => setSheet("pal")}>＋ Baustein</button>
            <button type="button" className="bk-btn bk-insbtn" onClick={() => setSheet("ins")}>{selected ? "Einstellen" : "Übersicht"}</button>
          </div>

          <aside className={`bk-ins${sheet === "ins" ? " open" : ""}`} aria-label={selected ? "Baustein einstellen" : "Übersicht"}>
            {selected ? (
              <Inspector key={selected.id} cfg={selected.data.cfg} rows={res[selected.id]} source={source} pipe={toPipe.has(selected.id)}
                probs={nodeProbs(selected.id)} ctx={ctx} set={setCfg} remove={() => remove(selected.id)}
                close={() => { setSheet(null); setNodes((ns) => ns.map((n) => (n.selected ? { ...n, selected: false } : n))); }} act={act} />
            ) : (
              <Overview nodes={logic.nodes} res={res} probs={probs} ctx={ctx} source={source} focus={(id) => focus(id)}
                close={() => setSheet(null)} archive={flowId ? archive : null} />
            )}
          </aside>
          <div className={`bk-shade${sheet ? " open" : ""}`} onClick={() => setSheet(null)} aria-hidden />
        </div>
        <p className="bk-lock">🔒 Regeln machen die Freigabe nur strenger. Versand, Sperrliste und die drei Prüfstufen bleiben immer an.</p>
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
function Overview({ nodes, res, probs, ctx, source, focus, close, archive }: {
  nodes: FlowNode[]; res: ReturnType<typeof runFlowRows>; probs: Problem[]; ctx: InsCtx; source: Source; focus: (id: string) => void; close: () => void; archive: (() => void) | null;
}) {
  const t = ctx.at ? new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(ctx.at)) : "–";
  return (
    <>
      <div className="bk-sheet-h"><h4>Übersicht</h4><button type="button" className="bk-x" onClick={close} aria-label="Schließen">✕</button></div>
      <div className="bk-bigs" style={{ "--nc": "#5fd4ff" } as CSSProperties}>
        <div className="hi"><b>{ctx.loading ? "…" : fmt(ctx.sample)}</b><span>Stichprobe</span></div>
        <div><b>{ctx.total === null ? "–" : fmt(ctx.total)}</b><span>{source === "leads" ? "Leads" : "Käufer"} gesamt</span></div>
        <div><b>{ctx.loading ? "…" : t}</b><span>Stand</span></div>
      </div>
      <section className="bk-sec">
        <h4>Bausteine</h4>
        <ul className="bk-ov">
          {nodes.map((n) => {
            const m = NODE_META[n.kind];
            const r = res[n.id];
            return (
              <li key={n.id}>
                <button type="button" onClick={() => focus(n.id)} style={{ "--nc": m.color } as CSSProperties}>
                  <i aria-hidden>{m.icon}</i><span>{n.title || (n.kind === "pipeline" ? n.name : m.label)}</span>
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
          <li><i>⇢</i>Baustein aus der Palette auf die Fläche ziehen</li>
          <li><i>◉</i>Vom rechten Punkt zum linken Punkt ziehen = verbinden</li>
          <li><i>⚙</i>Baustein antippen = einstellen, Zahlen sofort sehen</li>
          <li><i>⌫</i>Rücktaste oder ✕ = löschen</li>
          <li><i>⇶</i>Gefällt’s? Pipeline-Baustein anhängen und anschließen</li>
        </ul>
      </section>
      {archive && <button type="button" className="bk-btn red" onClick={archive} disabled={ctx.busy} style={{ justifySelf: "start" }}>Archivieren</button>}
    </>
  );
}

"use client";

/**
 * Seiten-Flow als Karte (Stil der JARVIS-Fluss-Karte, aber Vierecke = Seiten). Nur Anzeige: Anordnen per Ziehen
 * (Pointer-Events, Maus und Touch – kein HTML5-draggable), Vertauschen (auf eine andere Seite ziehen), Einfügen,
 * Ersetzen, aus der Anzeige nehmen, Zurücksetzen; „Speichern“ legt nur die Anordnung ab (saveWebsiteFlow).
 * Die echte Website ändert sich dabei nie. Leitungen werden aus den echten Positionen der Kacheln gemessen.
 */
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useTransition, type PointerEvent as RPE } from "react";
import { Icon } from "@/app/icons";
import {
  FlowInputError, KIND_ICON, edgesOf, freeTile, hrefOf, insertNode, moveNode, removeNode, replaceNode, sameFlow, sideNodes,
  stageLabel, stagesOf, swapNodes, type CatalogPage, type FlowNode, type Target,
} from "@/lib/website-flow";
import { saveWebsiteFlow } from "./actions";

export type Counts = Record<string, { n: number; label: string }>;
type Props = {
  segment: string; defaults: FlowNode[]; initial: FlowNode[]; isSaved: boolean; savedAt: string | null;
  catalog: CatalogPage[]; counts: Counts; site: string; days: number;
};
type Wire = { key: string; d: string; side: boolean };
type Picker = { mode: "insert" } | { mode: "replace"; id: string };

const nf = (n: number) => n.toLocaleString("de-DE");
const berlin = (iso: string) =>
  new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

function targetOf(v: string): Target | { swap: string } | null {
  if (v.startsWith("node:")) return { swap: v.slice(5) };
  if (v.startsWith("stage:")) return { kind: "stage", stage: Number(v.slice(6)) };
  if (v.startsWith("new:")) return { kind: "newStage", at: Number(v.slice(4)) };
  if (v === "side") return { kind: "side" };
  return null;
}

export function FlowBoard({ segment, defaults, initial, isSaved, savedAt: savedAt0, catalog, counts, site, days }: Props) {
  const [nodes, setNodes] = useState<FlowNode[]>(initial);
  const [saved, setSaved] = useState<FlowNode[]>(initial);
  const [savedAt, setSavedAt] = useState<string | null>(isSaved ? savedAt0 : null);
  const [edit, setEdit] = useState(false);
  const [picker, setPicker] = useState<Picker | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "err"; text: string } | null>(null);
  const [pending, start] = useTransition();
  const dirty = !sameFlow(nodes, saved);
  const isDefault = sameFlow(nodes, defaults);

  const stages = useMemo(() => stagesOf(nodes), [nodes]);
  const side = useMemo(() => sideNodes(nodes), [nodes]);
  const edges = useMemo(() => edgesOf(nodes), [nodes]);

  // ------------------------------------------------------------------ Leitungen messen
  const board = useRef<HTMLDivElement>(null);
  const boxes = useRef(new Map<string, HTMLElement>());
  const setBox = useCallback((id: string) => (el: HTMLElement | null) => { if (el) boxes.current.set(id, el); else boxes.current.delete(id); }, []);
  const [wires, setWires] = useState<{ w: number; h: number; list: Wire[] }>({ w: 0, h: 0, list: [] });
  const measure = useCallback(() => {
    const b = board.current;
    if (!b) return;
    const B = b.getBoundingClientRect();
    const list: Wire[] = [];
    // Nebenzweig-Leitungen nur auf breiten Bildschirmen und nicht beim Anordnen (sonst kreuzen sie den ganzen Fluss)
    const narrow = typeof window !== "undefined" && window.matchMedia?.("(max-width:720px)").matches;
    for (const e of edges) {
      if (e.side && (narrow || edit)) continue;
      const s = boxes.current.get(e.from)?.getBoundingClientRect(), t = boxes.current.get(e.to)?.getBoundingClientRect();
      if (!s || !t) continue;
      let d: string;
      if (!e.side && t.left >= s.right - 1) {
        const x1 = s.right - B.left, y1 = s.top + s.height / 2 - B.top, x2 = t.left - B.left, y2 = t.top + t.height / 2 - B.top, dx = (x2 - x1) / 2;
        d = `M${x1.toFixed(1)} ${y1.toFixed(1)} C${(x1 + dx).toFixed(1)} ${y1.toFixed(1)},${(x2 - dx).toFixed(1)} ${y2.toFixed(1)},${x2.toFixed(1)} ${y2.toFixed(1)}`;
      } else {
        const x1 = s.left + s.width / 2 - B.left, y1 = s.bottom - B.top, x2 = t.left + t.width / 2 - B.left, y2 = t.top - B.top, dy = Math.max(12, (y2 - y1) / 2);
        d = `M${x1.toFixed(1)} ${y1.toFixed(1)} C${x1.toFixed(1)} ${(y1 + dy).toFixed(1)},${x2.toFixed(1)} ${(y2 - dy).toFixed(1)},${x2.toFixed(1)} ${y2.toFixed(1)}`;
      }
      list.push({ key: `${e.from}>${e.to}`, d, side: !!e.side });
    }
    setWires({ w: B.width, h: B.height, list });
  }, [edges, edit]);
  useLayoutEffect(() => { measure(); }, [measure, picker]);
  useEffect(() => {
    const b = board.current;
    if (!b || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => measure());
    ro.observe(b);
    document.fonts?.ready.then(() => measure()).catch(() => {});
    return () => ro.disconnect();
  }, [measure]);

  // Ungespeichert verlassen: kurz nachfragen
  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  const change = (fn: (l: FlowNode[]) => FlowNode[]) => {
    try {
      setNodes(fn(nodes));
      setMsg(null);
    } catch (e) {
      setMsg({ tone: "err", text: e instanceof FlowInputError ? e.message : "Nicht möglich" });
    }
  };

  // ------------------------------------------------------------------ Ziehen (Pointer-Events)
  const drag = useRef<{ id: string; sx: number; sy: number; on: boolean } | null>(null);
  const [ghost, setGhost] = useState<{ id: string; title: string; x: number; y: number } | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const hit = (x: number, y: number, id: string) => {
    const z = (document.elementFromPoint(x, y) as HTMLElement | null)?.closest<HTMLElement>("[data-drop]");
    const v = z?.dataset.drop ?? null;
    return v && v !== `node:${id}` && board.current?.contains(z!) ? v : null;
  };
  const down = (e: RPE<HTMLButtonElement>, n: FlowNode) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    e.preventDefault();
    try { e.currentTarget.setPointerCapture(e.pointerId); } catch { /* ältere Browser */ }
    drag.current = { id: n.id, sx: e.clientX, sy: e.clientY, on: false };
  };
  const move = (e: RPE<HTMLButtonElement>, n: FlowNode) => {
    const d = drag.current;
    if (!d) return;
    if (!d.on && Math.hypot(e.clientX - d.sx, e.clientY - d.sy) < 5) return;
    d.on = true;
    setGhost({ id: d.id, title: n.title, x: e.clientX, y: e.clientY });
    setOver(hit(e.clientX, e.clientY, d.id));
    if (e.clientY < 70) window.scrollBy(0, -14);
    else if (e.clientY > window.innerHeight - 70) window.scrollBy(0, 14);
  };
  const end = (e: RPE<HTMLButtonElement>, cancel = false) => {
    const d = drag.current;
    drag.current = null;
    setGhost(null);
    setOver(null);
    if (!d?.on || cancel) return;
    const v = hit(e.clientX, e.clientY, d.id);
    const t = v ? targetOf(v) : null;
    if (!t) return;
    change((l) => ("swap" in t ? swapNodes(l, d.id, t.swap) : moveNode(l, d.id, t)));
  };

  const save = () => start(async () => {
    const r = await saveWebsiteFlow(segment, nodes);
    if (r.ok) { setSaved(nodes); setSavedAt(r.at); setMsg({ tone: "ok", text: "Gespeichert" }); }
    else setMsg({ tone: "err", text: r.error });
  });

  const box = (n: FlowNode) => {
    const href = hrefOf(n, site);
    const c = counts[n.id];
    const inner = (
      <>
        <span className="wf-top">
          <span className="wf-ic" aria-hidden><Icon name={KIND_ICON[n.kind]} size={16} /></span>
          {n.country && <em className="wf-cc">{n.country}</em>}
        </span>
        <b className="wf-t">{n.title}</b>
        <span className="wf-p">{n.path || "extern"}</span>
        {c && c.n > 0 && <span className="wf-n" title={`${c.label}, letzte ${days} Tage`}><b>{nf(c.n)}</b> {c.label}</span>}
      </>
    );
    return (
      <div key={n.id} ref={setBox(n.id)} data-drop={`node:${n.id}`}
        className={`wf-node k-${n.kind}${over === `node:${n.id}` ? " over" : ""}${ghost?.id === n.id ? " lift" : ""}`}>
        {href
          ? <a className="wf-in" href={href} target="_blank" rel="noopener noreferrer" title={`${n.title} öffnen`}>{inner}</a>
          : <div className="wf-in" title="Externe Seite (Stripe), kein direkter Link">{inner}</div>}
        {edit && (
          <span className="wf-tools">
            <button type="button" className="wf-ib wf-grip" aria-label={`${n.title} ziehen`} title="Ziehen: verschieben oder auf eine Seite legen zum Tauschen"
              onPointerDown={(e) => down(e, n)} onPointerMove={(e) => move(e, n)} onPointerUp={(e) => end(e)} onPointerCancel={(e) => end(e, true)}
              onLostPointerCapture={() => { if (drag.current) { drag.current = null; setGhost(null); setOver(null); } }}>
              <Icon name="griff" size={16} />
            </button>
            <button type="button" className="wf-ib" aria-label={`${n.title} ersetzen`} title="Ersetzen" onClick={() => setPicker({ mode: "replace", id: n.id })}>
              <Icon name="wiederholen" size={15} />
            </button>
            <button type="button" className="wf-ib wf-x" aria-label={`${n.title} aus der Anzeige nehmen`} title="Aus der Anzeige nehmen" onClick={() => change((l) => removeNode(l, n.id))}>
              <Icon name="schliessen" size={16} />
            </button>
          </span>
        )}
      </div>
    );
  };
  const slot = (drop: string, label = "hier ablegen") =>
    <div className={`wf-slot${over === drop ? " over" : ""}`} data-drop={drop}>{label}</div>;

  return (
    <div className={`wf-wrap${edit ? " editing" : ""}${ghost ? " dragging" : ""}`}>
      <div className="wf-bar">
        <p className="wf-note"><Icon name="schloss" size={15} />Nur Ansicht – ändert nichts an der Website</p>
        <div className="wf-acts">
          <button type="button" className={edit ? "on" : undefined} aria-pressed={edit} onClick={() => setEdit((x) => !x)}>
            <Icon name={edit ? "ok" : "ziehen"} size={15} />{edit ? "Fertig" : "Anordnen"}
          </button>
          <button type="button" onClick={() => { setEdit(true); setPicker({ mode: "insert" }); }}><Icon name="mehr" size={15} />Einfügen</button>
          <button type="button" disabled={isDefault} onClick={() => change(() => defaults)}><Icon name="rueckgaengig" size={15} />Zurücksetzen</button>
          <button type="button" className="wf-save" disabled={!dirty || pending} onClick={save}><Icon name="ok" size={15} />{pending ? "Speichert …" : "Speichern"}</button>
        </div>
      </div>
      <p className={`wf-state${msg ? ` t-${msg.tone}` : dirty ? " t-dirty" : ""}`} role="status">
        {msg ? msg.text : dirty ? "Nicht gespeichert" : savedAt ? `Eigene Anordnung · ${berlin(savedAt)}` : "Standard"}
        {edit && !msg && <span> · Griff ziehen: verschieben, auf Seite: tauschen</span>}
      </p>

      <div className="wf-board" ref={board}>
        <svg className="wf-svg" width={wires.w} height={wires.h} viewBox={`0 0 ${wires.w || 1} ${wires.h || 1}`} aria-hidden>
          <defs>
            <filter id="wf-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
          </defs>
          {wires.list.map((w) => (
            <g key={w.key + w.d} className={`wf-edge${w.side ? " side" : ""}`}>
              <path d={w.d} className="wf-pipe" />
              <path d={w.d} className="wf-core" />
              {!w.side && [0, 1].map((i) => (
                <circle key={i} r={3.5} className="wf-dot" filter="url(#wf-glow)">
                  <animateMotion dur="3.2s" begin={`${-i * 1.6}s`} repeatCount="indefinite" path={w.d} />
                </circle>
              ))}
            </g>
          ))}
        </svg>

        <div className="wf-main" style={{ ["--n" as string]: stages.length + (edit ? 1 : 0) }}>
          {stages.map((st, i) => (
            <div key={i} className="wf-stage">
              <span className="wf-sl"><i>{i + 1}</i>{stageLabel(st, i)}</span>
              <div className={`wf-col${over === `stage:${i}` ? " over" : ""}`} data-drop={`stage:${i}`}>
                {st.map(box)}
                {edit && slot(`stage:${i}`)}
              </div>
            </div>
          ))}
          {edit && (
            <div className="wf-stage wf-new">
              <span className="wf-sl"><i>+</i>Neue Stufe</span>
              <div className="wf-col">{slot(`new:${stages.length}`, "hier ablegen")}</div>
            </div>
          )}
          {!stages.length && !edit && <p className="wf-empty">Keine Seiten im Flow – „Zurücksetzen“ oder „Einfügen“.</p>}
        </div>

        {(side.length > 0 || edit) && (
          <div className="wf-side">
            <span className="wf-sl"><i><Icon name="recht" size={13} /></i>Nebenzweig</span>
            <div className={`wf-row${over === "side" ? " over" : ""}`} data-drop="side">
              {side.map(box)}
              {edit && slot("side")}
            </div>
          </div>
        )}
      </div>

      {ghost && (
        <div className="wf-ghost" style={{ left: ghost.x, top: ghost.y }} aria-hidden>
          <Icon name="ziehen" size={14} />{ghost.title}
        </div>
      )}

      {picker && (
        <PickPanel picker={picker} nodes={nodes} stages={stages.map((s, i) => `${i + 1} · ${stageLabel(s, i)}`)} catalog={catalog}
          onClose={() => setPicker(null)}
          onPick={(page, where) => {
            try {
              const next = picker.mode === "replace" ? replaceNode(nodes, picker.id, page) : insertNode(nodes, page, where!);
              setNodes(next);
              setMsg(null);
              setPicker(null);
              return null;
            } catch (e) {
              return e instanceof FlowInputError ? e.message : "Nicht möglich";
            }
          }} />
      )}
    </div>
  );
}

/** Auswahl: Seite aus der Liste aller vorhandenen Seiten oder freie Kachel (nur beim Einfügen). */
function PickPanel({ picker, nodes, stages, catalog, onClose, onPick }: {
  picker: Picker; nodes: FlowNode[]; stages: string[]; catalog: CatalogPage[];
  onClose: () => void; onPick: (p: CatalogPage, where: Target | null) => string | null;
}) {
  const [q, setQ] = useState("");
  const [where, setWhere] = useState("new");
  const [title, setTitle] = useState("");
  const [path, setPath] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const used = new Set(nodes.map((n) => n.id));
  const needle = q.trim().toLowerCase();
  const list = catalog.filter((p) => !used.has(p.id) && (!needle || `${p.title} ${p.path} ${p.country}`.toLowerCase().includes(needle)));
  const target = (): Target => (where === "side" ? { kind: "side" } : where === "new" ? { kind: "newStage", at: stages.length } : { kind: "stage", stage: Number(where) });
  const replacing = picker.mode === "replace" ? nodes.find((n) => n.id === picker.id) : null;
  useEffect(() => {
    const k = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);

  return (
    <div className="wf-pick" role="dialog" aria-modal="true" aria-label={replacing ? "Seite ersetzen" : "Seite einfügen"} onPointerDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="wf-pbox">
        <header>
          <h2>{replacing ? `${replacing.title} ersetzen` : "Seite einfügen"}</h2>
          <button type="button" className="wf-x" aria-label="Schließen" onClick={onClose}><Icon name="schliessen" size={18} /></button>
        </header>
        {!replacing && (
          <label className="wf-where">
            <span>Wohin</span>
            <select value={where} onChange={(e) => setWhere(e.target.value)}>
              {stages.map((s, i) => <option key={i} value={String(i)}>Stufe {s}</option>)}
              <option value="new">Neue Stufe am Ende</option>
              <option value="side">Nebenzweig</option>
            </select>
          </label>
        )}
        <input type="search" className="wf-q" placeholder="Seite suchen" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Seite suchen" />
        <ul className="wf-list">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" onClick={() => setErr(onPick(p, replacing ? null : target()))}>
                <span className="wf-ic" aria-hidden><Icon name={KIND_ICON[p.kind]} size={15} /></span>
                <b>{p.title}</b><span className="wf-lp">{p.path || "extern"}</span>{p.country ? <em className="wf-cc">{p.country}</em> : <i />}
              </button>
            </li>
          ))}
          {!list.length && <li className="wf-none">Keine weitere Seite</li>}
        </ul>
        {!replacing && (
          <form className="wf-free" onSubmit={(e) => {
            e.preventDefault();
            try { setErr(onPick(freeTile(title, path), target())); } catch (x) { setErr(x instanceof FlowInputError ? x.message : "Nicht möglich"); }
          }}>
            <b>Freie Kachel</b>
            <input placeholder="Titel" maxLength={40} value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Titel" />
            <input placeholder="/pfad oder https://…" maxLength={200} value={path} onChange={(e) => setPath(e.target.value)} aria-label="Pfad" />
            <button type="submit"><Icon name="mehr" size={15} />Einfügen</button>
          </form>
        )}
        {err && <p className="wf-perr" role="alert"><Icon name="achtung" size={15} />{err}</p>}
      </div>
    </div>
  );
}

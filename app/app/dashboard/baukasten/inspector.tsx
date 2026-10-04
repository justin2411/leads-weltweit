"use client";

/**
 * Prüfer-Fenster des Baukastens: Einstellung des gewählten Bausteins, Live-Zahlen (rein, raus, %), 8 Beispielzeilen und
 * Aufschlüsselung nach einem Feld. Alles rechnet sofort im Browser auf der Stichprobe. Schreibende Aktionen (Pipeline,
 * Agent) gehen nur über ausdrückliche Knöpfe und nur für gespeicherte Flows ohne offene Änderungen.
 */
import { useMemo, useState, type CSSProperties } from "react";
import { KINDS, OWNER_KINDS } from "@/lib/agents";
import {
  FIELDS, GESAMTBESTAND, LIMITS, NODE_META, OPS, SORT_LABELS, countBy, evalCond, condProblem, fieldDef, fieldsFor,
  type Cond, type FieldType, type FlowKind, type FlowNode, type NodeRows, type Op, type Problem, type Row, type Source, type TopSort, type AgentTaskKind,
} from "@/lib/flow";
import { meldenPreview, pendingPool, type PoolInfo } from "@/lib/baukasten";
import { fmt, outRows, valLabel } from "./nodes";
import { Icon, type IconName } from "@/app/icons";

export type InsCtx = {
  flowId: string | null; dirty: boolean; active: boolean; errors: number; busy: boolean;
  size: number; sample: number; total: number | null; at: string | null; loading: boolean; error: string | null;
  hold: { scope: number; held: number } | null;
};
type Act = { activate: () => void; deactivate: () => void; toAgent: (nodeId: string) => void };

const SEG_OPTS = FIELDS.find((f) => f.key === "segment")?.options ?? [];
const LAND_OPTS = FIELDS.find((f) => f.key === "land")?.options ?? [];
const GROUPS: [FieldType, string][] = [["bool", "Vorhanden?"], ["enum", "Auswahl"], ["num", "Zahl"], ["text", "Text"]];
const berlinHM = (iso: string | null) => {
  if (!iso) return "–";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "–" : new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(d);
};
const pctOf = (a: number, b: number) => (b ? `${Math.round((a / b) * 100)} %` : "–");

/** Neue Bedingung mit sinnvollem Startwert für das Feld. */
export function defaultCond(f: string): Cond {
  const t = fieldDef(f)?.type ?? "bool";
  if (t === "bool") return { f, op: "ja" };
  if (t === "enum") return { f, op: "in", v: [] };
  if (t === "text") return { f, op: "enthaelt", v: "" };
  return f === "punkte" ? { f, op: "gte", v: 5 } : { f, op: "lte", v: 30 };
}

/** Wert beim Wechsel des Vergleichs mitnehmen, soweit er passt. */
function withOp(c: Cond, op: Op): Cond {
  const t = fieldDef(c.f)?.type ?? "bool";
  const ar = OPS[t].find((o) => o.op === op)?.arity ?? 0;
  const v = c.v;
  const first = Array.isArray(v) ? v[0] : v;
  if (ar === 0) return { f: c.f, op };
  if (ar === "list") return { f: c.f, op, v: Array.isArray(v) ? v.map(String).filter(Boolean) : first !== undefined && first !== "" ? [String(first)] : [] };
  if (ar === 2) { const a = typeof first === "number" ? first : 0; return { f: c.f, op, v: [a, Array.isArray(v) && typeof v[1] === "number" ? v[1] : a + 30] }; }
  if (t === "num") return { f: c.f, op, v: typeof first === "number" ? first : Number(first) || 0 };
  return { f: c.f, op, v: first === undefined ? "" : String(first) };
}

function numIn(s: string): number | undefined {
  if (s.trim() === "") return undefined;
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
}

/** Eine Bedingung: Feld · Vergleich · Wert, daneben wie viele der Eingangszeilen sie erfüllen. */
export function CondEdit({ c, source, input, pipe, onChange, onRemove, extra }: {
  c: Cond; source: Source; input: Row[]; pipe: boolean; onChange: (c: Cond) => void; onRemove?: () => void; extra?: React.ReactNode;
}) {
  const def = fieldDef(c.f);
  const type = def?.type ?? "bool";
  const hits = useMemo(() => input.reduce((s, r) => s + (evalCond(c, r) ? 1 : 0), 0), [c, input]);
  const prob = condProblem(c, source) ?? (def && !def.gate && pipe ? `„${def.label}“ darf nicht auf dem Weg zur Pipeline stehen` : null);
  const ar = OPS[type].find((o) => o.op === c.op)?.arity ?? 0;
  const seen = useMemo(() => (type === "enum" ? countBy(input, c.f, 40) : []), [type, input, c.f]);
  const chips = useMemo(() => {
    if (type !== "enum") return [];
    const cnt = new Map(seen.map((s) => [s.key, s.n]));
    const list = (def?.options ?? []).map((o) => ({ v: o.v, label: o.label, n: cnt.get(o.v) ?? 0 }));
    for (const s of seen) if (s.key !== "–" && !list.some((o) => o.v === s.key)) list.push({ v: s.key, label: s.key, n: s.n });
    // Häufige zuerst (gewählte bleiben sichtbar), leere gedimmt am Ende
    return list.sort((a, b) => b.n - a.n).slice(0, 40);
  }, [type, seen, def]);
  const sel = new Set(Array.isArray(c.v) ? c.v.map(String) : c.v !== undefined ? [String(c.v)] : []);
  return (
    <div className={`bk-cond${prob ? " bad" : ""}`}>
      <div className="bk-cond-h">
        <select value={c.f} onChange={(e) => onChange(defaultCond(e.target.value))} aria-label="Feld">
          {!def && <option value={c.f}>{c.f} (unbekannt)</option>}
          {GROUPS.map(([t, label]) => (
            <optgroup key={t} label={label}>
              {fieldsFor(source).filter((f) => f.type === t).map((f) => (
                <option key={f.key} value={f.key} disabled={pipe && !f.gate && f.key !== c.f}>{f.label}{!f.gate ? " · nur Auswertung" : ""}</option>
              ))}
            </optgroup>
          ))}
        </select>
        <span className="bk-hit" title="so viele der ankommenden erfüllen diese Bedingung"><Icon name="ok" size={13} /> {fmt(hits)}</span>
        {onRemove && <button type="button" className="bk-x" onClick={onRemove} aria-label="Bedingung entfernen"><Icon name="schliessen" size={13} /></button>}
      </div>
      {type === "bool" ? (
        <div className="bk-chips">
          {(["ja", "nein"] as const).map((o) => (
            <button key={o} type="button" className={`bk-c ${o}${c.op === o ? " on" : ""}`} onClick={() => onChange({ f: c.f, op: o })}>{o}</button>
          ))}
        </div>
      ) : (
        <>
          <select value={c.op} onChange={(e) => onChange(withOp(c, e.target.value as Op))} aria-label="Vergleich" className="bk-in">
            {OPS[type].map((o) => <option key={o.op} value={o.op}>{o.label}</option>)}
          </select>
          {type === "enum" && ar !== 0 && (
            <div className="bk-chips">
              {chips.map((o) => (
                <button key={o.v} type="button" className={`bk-c${sel.has(o.v) ? " on" : ""}${o.n ? "" : " z"}`} aria-pressed={sel.has(o.v)}
                  onClick={() => {
                    if (ar === "list") {
                      const next = new Set(sel);
                      if (next.has(o.v)) next.delete(o.v); else next.add(o.v);
                      onChange({ ...c, v: [...next].slice(0, LIMITS.list) });
                    } else onChange({ ...c, v: o.v });
                  }}>
                  {o.label}<em>{fmt(o.n)}</em>
                </button>
              ))}
            </div>
          )}
          {type === "text" && ar === 1 && (
            <input className="bk-in" value={typeof c.v === "string" ? c.v : ""} maxLength={LIMITS.str} placeholder="Text …"
              onChange={(e) => onChange({ ...c, v: e.target.value })} />
          )}
          {type === "num" && ar === 1 && (
            <div className="bk-row">
              <input className="bk-in" type="number" inputMode="decimal" value={typeof c.v === "number" ? c.v : ""}
                onChange={(e) => { const v = numIn(e.target.value); onChange(v === undefined ? { f: c.f, op: c.op } : { ...c, v }); }} />
              {def?.unit && <span className="bk-hint">{def.unit}</span>}
            </div>
          )}
          {type === "num" && ar === 2 && (
            <div className="bk-row">
              {[0, 1].map((i) => {
                const pair = Array.isArray(c.v) && c.v.length === 2 ? (c.v as [number, number]) : [0, 0];
                return (
                  <input key={i} className="bk-in" type="number" inputMode="decimal" value={typeof pair[i] === "number" ? pair[i] : ""} aria-label={i ? "bis" : "von"}
                    onChange={(e) => { const p: [number, number] = [Number(pair[0]) || 0, Number(pair[1]) || 0]; p[i] = numIn(e.target.value) ?? 0; onChange({ ...c, v: p }); }} />
                );
              })}
              {def?.unit && <span className="bk-hint">{def.unit}</span>}
            </div>
          )}
        </>
      )}
      {extra}
      {prob && <p className="bk-err">{prob}</p>}
    </div>
  );
}

function Chips<T extends string | number>({ opts, on, pick }: { opts: { v: T; label: string; n?: number }[]; on: (v: T) => boolean; pick: (v: T) => void }) {
  return (
    <div className="bk-chips">
      {opts.map((o) => (
        <button key={String(o.v)} type="button" className={`bk-c${on(o.v) ? " on" : ""}`} onClick={() => pick(o.v)} aria-pressed={on(o.v)}>
          {o.label}{o.n !== undefined && <em>{fmt(o.n)}</em>}
        </button>
      ))}
    </div>
  );
}
const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

/** Beispielzeilen (höchstens 8) mit den wichtigsten Merkmalen. */
function Rows({ rows, source }: { rows: Row[]; source: Source }) {
  if (!rows.length) return <ul className="bk-rows"><li className="none">keine Zeilen</li></ul>;
  const flag = (x: unknown, icon: IconName, title: string) => <i className={x === true ? "y" : ""} title={`${title}: ${x === true ? "ja" : "nein"}`}><Icon name={icon} size={13} /></i>;
  return (
    <ul className="bk-rows">
      {rows.slice(0, 8).map((r) => {
        const bits = source === "leads"
          ? [r.ort, r.land, r.signal ? valLabel("signal", String(r.signal)) : null, typeof r.alter_tage === "number" ? `${r.alter_tage} T` : null]
          : [r.region, r.land, r.pruefung ? valLabel("pruefung", String(r.pruefung)) : null, r.angeschrieben === true ? "angeschrieben" : null];
        return (
          <li key={r.id}>
            <b>{String(r.firma ?? "–")}</b>
            <span>{bits.filter((b) => b !== null && b !== undefined && b !== "").join(" · ")}{typeof r.punkte === "number" && <> · <Icon name="stern" size={12} title="Punkte" /> {r.punkte}</>}</span>
            <em>{flag(r.hat_telefon, "telefon", "Telefon")}{flag(r.hat_email, "mail", "E-Mail")}{flag(r.hat_website, "land", "Website")}{source === "leads" && flag(r.hat_person, "kunde", "Ansprechperson")}</em>
          </li>
        );
      })}
    </ul>
  );
}

/** Aufschlüsselung nach einem wählbaren Feld (Balken mit Anzahl und Anteil). */
function Breakdown({ rows, source, initial }: { rows: Row[]; source: Source; initial: string }) {
  const [by, setBy] = useState(initial);
  const key = fieldDef(by)?.sources.includes(source) ? by : "land";
  const stats = useMemo(() => countBy(rows, key, 10), [rows, key]);
  const max = Math.max(1, ...stats.map((s) => s.n));
  return (
    <section className="bk-sec">
      <header>
        <h4>Aufschlüsselung</h4>
        <select className="bk-sel" value={key} onChange={(e) => setBy(e.target.value)} aria-label="Feld für die Aufschlüsselung">
          {fieldsFor(source).filter((f) => f.type !== "text" || ["quelle", "rechtsform", "ort", "region", "branche", "rolle"].includes(f.key)).map((f) => (
            <option key={f.key} value={f.key}>{f.label}</option>
          ))}
        </select>
      </header>
      {stats.length ? (
        <ul className="bk-bars">
          {stats.map((s) => (
            <li key={s.key}>
              <span title={valLabel(key, s.key)}>{valLabel(key, s.key)}</span>
              <i><i style={{ width: `${(s.n / max) * 100}%` }} /></i>
              <b>{fmt(s.n)}<small>{pctOf(s.n, rows.length)}</small></b>
            </li>
          ))}
        </ul>
      ) : <p className="bk-hint">keine Zeilen</p>}
    </section>
  );
}

function breakdownField(n: FlowNode): string {
  switch (n.kind) {
    case "statistik": return n.by;
    case "weiche": return n.cond?.f ?? "land";
    case "filter": return n.conds[0]?.f ?? "signal";
    case "punkte": return "punkte";
    case "quelle": return n.source === "leads" ? "signal" : "pruefung";
    default: return "land";
  }
}

/** Speicher wählen (mit Anzahl) oder neu anlegen. Gesamtbestand = kein eigener Speicher (alle Leads). */
function PoolPick({ cfg, pools, addPool, set, source }: {
  cfg: Extract<FlowNode, { kind: "speicher" }>; pools: PoolInfo[]; source: Source;
  addPool: (name: string) => Promise<{ id: string; name: string } | string>; set: (n: FlowNode) => void;
}) {
  const want = pendingPool(cfg);
  const [nm, setNm] = useState(want ?? "");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const create = async () => {
    setBusy(true);
    setErr(null);
    const r = await addPool(nm);
    setBusy(false);
    if (typeof r === "string") setErr(r);
    else { set({ ...cfg, pool_id: r.id, pool_name: r.name }); setNm(""); }
  };
  const top = (p: PoolInfo) => Object.entries(p.byCountry).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k, n]) => `${k} ${fmt(n)}`).join(" · ");
  return (
    <>
      <ul className="bk-pools">
        <li>
          <button type="button" className={cfg.pool_id === null && !want ? "on" : ""} onClick={() => set({ ...cfg, pool_id: null, pool_name: GESAMTBESTAND })} aria-pressed={cfg.pool_id === null && !want}>
            <Icon name="bestand" size={15} /><span><b>{GESAMTBESTAND}</b><small>alle Leads – kein eigener Speicher</small></span>
          </button>
        </li>
        {pools.map((p) => (
          <li key={p.id}>
            <button type="button" className={cfg.pool_id === p.id ? "on" : ""} onClick={() => set({ ...cfg, pool_id: p.id, pool_name: p.name })} aria-pressed={cfg.pool_id === p.id}>
              <Icon name="speicher" size={15} /><span><b>{p.name}</b><small>{p.n ? top(p) : "noch leer"}</small></span><em>{fmt(p.n)}</em>
            </button>
          </li>
        ))}
      </ul>
      {!pools.length && <p className="bk-hint">Noch keine eigenen Speicher – unten einen anlegen.</p>}
      {want && <p className="bk-err">„{want}“ gibt es noch nicht – anlegen oder anderen wählen.</p>}
      <div className="bk-row">
        <input className="bk-in" value={nm} maxLength={LIMITS.pool} placeholder="Neuer Speicher, z. B. Premium" onChange={(e) => setNm(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && nm.trim() && !busy) void create(); }} aria-label="Name des neuen Speichers" />
        <button type="button" className="bk-btn gold" disabled={!nm.trim() || busy} onClick={() => void create()}><Icon name="mehr" size={14} />{busy ? "…" : "Anlegen"}</button>
      </div>
      {err && <p className="bk-err">{err}</p>}
      {source === "kaeufer" && <p className="bk-err">Speicher nur für Leads – Quelle auf „Leads“ stellen.</p>}
    </>
  );
}

export function Inspector({ cfg, rows, source, pipe, probs, ctx, set, remove, close, act, dup, kind, flowName, pools, addPool }: {
  cfg: FlowNode; rows: NodeRows | undefined; source: Source; pipe: boolean; probs: Problem[]; ctx: InsCtx;
  set: (n: FlowNode) => void; remove: () => void; close: () => void; act: Act; dup: () => void;
  kind: FlowKind; flowName: string; pools: PoolInfo[]; addPool: (name: string) => Promise<{ id: string; name: string } | string>;
}) {
  const meta = NODE_META[cfg.kind];
  const [port, setPort] = useState<"ja" | "nein">("ja");
  const input = rows?.input ?? [];
  const out = cfg.kind === "weiche" ? (port === "ja" ? rows?.ja ?? [] : rows?.nein ?? []) : outRows(cfg, rows);
  const on = !!rows?.connected;
  const sink = meta.ports.length === 0;
  const saved = !!ctx.flowId && !ctx.dirty;
  const [exportSize, setExportSize] = useState(ctx.size);

  const bigs: [string, string, boolean?][] = cfg.kind === "quelle"
    ? [[fmt(input.length), "Stichprobe", true], [ctx.total === null ? "–" : fmt(ctx.total), "Datenbank"], [ctx.loading ? "…" : berlinHM(ctx.at), "Stand"]]
    : cfg.kind === "weiche"
      ? [[fmt(rows?.ja?.length ?? 0), "ja", true], [fmt(rows?.nein?.length ?? 0), "nein"], [pctOf(rows?.ja?.length ?? 0, input.length), "ja-Anteil"]]
      : sink
        ? [[fmt(input.length), "kommen an", true], [pctOf(input.length, ctx.sample), "der Stichprobe"], [on ? "verbunden" : "offen", "Eingang"]]
        : [[fmt(input.length), "rein"], [fmt(out.length), cfg.kind === "statistik" ? "weiter" : "durch", true], [pctOf(out.length, input.length), "Quote"]];

  const sec = (title: string, body: React.ReactNode, right?: React.ReactNode) => (
    <section className="bk-sec"><header><h4>{title}</h4>{right}</header>{body}</section>
  );

  let form: React.ReactNode = null;
  switch (cfg.kind) {
    case "quelle": {
      const stOpts = (fieldDef(cfg.source === "leads" ? "status" : "pruefung")?.options ?? []);
      form = (
        <>
          {sec("Was", <Chips opts={[{ v: "leads" as Source, label: "Leads (Ware)" }, { v: "kaeufer" as Source, label: "Käufer (Webagenturen)" }]} on={(v) => cfg.source === v}
            pick={(v) => v !== cfg.source && set({ ...cfg, source: v, status: v === "leads" ? ["new"] : ["ok"] })} />)}
          {sec("Zielgruppe", <Chips opts={[{ v: "", label: "alle" }, ...SEG_OPTS]} on={(v) => (cfg.segment ?? "") === v} pick={(v) => set({ ...cfg, segment: v || null })} />)}
          {sec("Länder", <Chips opts={[{ v: "", label: "alle" }, ...LAND_OPTS]} on={(v) => (v === "" ? cfg.countries.length === 0 : cfg.countries.includes(v))}
            pick={(v) => set({ ...cfg, countries: v === "" ? [] : toggle(cfg.countries, v) })} />)}
          {sec(cfg.source === "leads" ? "Status" : "Prüfung", <Chips opts={[{ v: "", label: "alle" }, ...stOpts]} on={(v) => (v === "" ? cfg.status.length === 0 : cfg.status.includes(v))}
            pick={(v) => set({ ...cfg, status: v === "" ? [] : toggle(cfg.status, v) })} />)}
          {cfg.source === "kaeufer" && <p className="bk-hint">Als Käufer zählen nur „mail-fähig“ (Prüfung ok). „nur Anruf/Brief“ getrennt.</p>}
          {sec("Stichprobe", <Chips opts={[1000, 2000, 5000].map((n) => ({ v: n, label: fmt(n) }))} on={(v) => cfg.size === v}
            pick={(v) => set({ ...cfg, size: v as 1000 | 2000 | 5000 })} />)}
          {ctx.error && <p className="bk-err">{ctx.error}</p>}
          <p className="bk-hint">Neueste zuerst. Die Zahlen aller Bausteine rechnen auf dieser Stichprobe.</p>
        </>
      );
      break;
    }
    case "filter":
      form = sec("Bedingungen", (
        <>
          <div className="bk-andor">
            <Chips opts={[{ v: "alle" as const, label: "alle müssen passen" }, { v: "eine" as const, label: "eine reicht" }]} on={(v) => cfg.mode === v} pick={(v) => set({ ...cfg, mode: v })} />
          </div>
          {cfg.conds.map((c, i) => (
            <CondEdit key={i} c={c} source={source} input={input} pipe={pipe}
              onChange={(nc) => set({ ...cfg, conds: cfg.conds.map((x, j) => (j === i ? nc : x)) })}
              onRemove={() => set({ ...cfg, conds: cfg.conds.filter((_, j) => j !== i) })} />
          ))}
          {cfg.conds.length < LIMITS.conds && (
            <button type="button" className="bk-addc" onClick={() => set({ ...cfg, conds: [...cfg.conds, defaultCond(source === "leads" ? "hat_email" : "hat_email")] })}>+ Bedingung</button>
          )}
        </>
      ));
      break;
    case "weiche":
      form = sec("Frage", cfg.cond ? (
        <CondEdit c={cfg.cond} source={source} input={input} pipe={pipe} onChange={(c) => set({ ...cfg, cond: c })} onRemove={() => set({ ...cfg, cond: null })} />
      ) : <button type="button" className="bk-addc" onClick={() => set({ ...cfg, cond: defaultCond("hat_email") })}>+ Bedingung</button>);
      break;
    case "punkte":
      form = (
        <>
          {sec("Regeln", (
            <>
              {cfg.rules.map((r, i) => (
                <CondEdit key={i} c={r.cond} source={source} input={input} pipe={pipe}
                  onChange={(c) => set({ ...cfg, rules: cfg.rules.map((x, j) => (j === i ? { ...x, cond: c } : x)) })}
                  onRemove={() => set({ ...cfg, rules: cfg.rules.filter((_, j) => j !== i) })}
                  extra={(
                    <label className="bk-pts"><span className="bk-hint">Punkte, wenn erfüllt</span>
                      <input type="number" step={1} min={-LIMITS.pts} max={LIMITS.pts} value={r.pts}
                        onChange={(e) => { const v = Math.round(numIn(e.target.value) ?? 0); set({ ...cfg, rules: cfg.rules.map((x, j) => (j === i ? { ...x, pts: v } : x)) }); }} />
                    </label>
                  )} />
              ))}
              {cfg.rules.length < LIMITS.rules && (
                <button type="button" className="bk-addc" onClick={() => set({ ...cfg, rules: [...cfg.rules, { cond: defaultCond("hat_email"), pts: 1 }] })}>+ Regel</button>
              )}
            </>
          ))}
          {sec("Mindestwert", (
            <div className="bk-row">
              <input className="bk-in" type="number" step={1} placeholder="ohne – alle kommen durch" value={cfg.min ?? ""}
                onChange={(e) => { const v = numIn(e.target.value); set({ ...cfg, min: v === undefined ? null : Math.round(v) }); }} />
              <span className="bk-hint">Punkte</span>
            </div>
          ))}
        </>
      );
      break;
    case "top":
      form = (
        <>
          {sec("Sortierung", <Chips opts={(Object.keys(SORT_LABELS) as TopSort[]).map((k) => ({ v: k, label: SORT_LABELS[k] }))} on={(v) => cfg.sort === v} pick={(v) => set({ ...cfg, sort: v })} />)}
          {sec("Anzahl", (
            <>
              <Chips opts={[10, 50, 100, 500, 1000].map((n) => ({ v: n, label: fmt(n) }))} on={(v) => cfg.n === v} pick={(v) => set({ ...cfg, n: v })} />
              <input className="bk-in" type="number" min={1} max={LIMITS.n} step={1} value={cfg.n} aria-label="Anzahl"
                onChange={(e) => set({ ...cfg, n: Math.round(numIn(e.target.value) ?? 1) })} />
            </>
          ))}
          {pipe && <p className="bk-err">Top entscheidet nach der ganzen Menge – nicht auf dem Weg zur Pipeline.</p>}
        </>
      );
      break;
    case "dubletten":
      form = sec("Gleich ist", <Chips opts={[{ v: "firma_id" as const, label: "gleiche Firma" }, { v: "name" as const, label: "gleicher Firmenname" }]} on={(v) => cfg.by === v} pick={(v) => set({ ...cfg, by: v })} />);
      break;
    case "statistik":
      form = sec("Zählen nach", (
        <select className="bk-in" value={cfg.by} onChange={(e) => set({ ...cfg, by: e.target.value })}>
          {fieldsFor(source).map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
        </select>
      ));
      break;
    case "pipeline": {
      const h = ctx.hold;
      const share = h && h.scope ? Math.round((h.held / h.scope) * 100) : 0;
      form = (
        <>
          {sec("Name der Regel", <input className="bk-in" value={cfg.name} maxLength={LIMITS.name} onChange={(e) => set({ ...cfg, name: e.target.value })} />)}
          <div className={`bk-act${share >= 50 ? " warn" : ""}`}>
            {source !== "leads" ? <p>Die Pipeline gilt nur für Leads – Quelle auf „Leads“ stellen.</p> : h ? (
              <>
                <p>Von <b>{fmt(h.scope)}</b> in der Stichprobe würden <b>{fmt(h.held)}</b> zurückgehalten (<b>{share} %</b>).</p>
                <div className="bk-meter" aria-hidden><i style={{ width: `${share}%` }} /></div>
                {!on && <p>Noch nichts angeschlossen – dann würde alles im Geltungsbereich zurückgehalten.</p>}
              </>
            ) : <p>Stichprobe lädt …</p>}
            {kind === "master" ? (
              <p>Master: „Übernehmen“ oben gilt sofort für alle neuen Leads dieser Quelle.</p>
            ) : kind === "agent" ? (
              <p>Im Agenten ohne Wirkung – Regeln für alle Leads gehören in die Master-Pipeline.</p>
            ) : ctx.active ? (
              <>
                <p>Läuft in der Pipeline: gilt für alle neuen Leads dieser Quelle.</p>
                <button type="button" className="bk-btn red" disabled={ctx.busy} onClick={act.deactivate}>Von der Pipeline lösen</button>
              </>
            ) : (
              <button type="button" className="bk-btn green" disabled={ctx.busy || !saved || ctx.errors > 0 || source !== "leads"} onClick={act.activate}><Icon name="pipeline" size={15} />An Pipeline anschließen</button>
            )}
            {!saved && kind === "test" && <p className="bk-hint">Erst speichern – angeschlossen wird die gespeicherte Fassung.</p>}
            {ctx.errors > 0 && <p className="bk-err">Erst die Fehler beheben ({ctx.errors}).</p>}
          </div>
          <p className="bk-lock"><Icon name="schloss" size={14} /> Regeln machen die Freigabe nur strenger. Zurückgehaltene Leads kommen beim Lösen zurück.</p>
        </>
      );
      break;
    }
    case "export": {
      const href = ctx.flowId ? `/dashboard/baukasten/export?flow=${encodeURIComponent(ctx.flowId)}&node=${encodeURIComponent(cfg.id)}&size=${exportSize}` : null;
      form = (
        <>
          {sec("Menge", <Chips opts={[1000, 2000, 5000].map((n) => ({ v: n, label: `bis ${fmt(n)}` }))} on={(v) => exportSize === v} pick={setExportSize} />)}
          {saved && href ? <a className="bk-btn go" href={href} download><Icon name="export" size={15} />CSV herunterladen</a> : <button type="button" className="bk-btn go" disabled><Icon name="export" size={15} />CSV herunterladen</button>}
          <p className="bk-hint">{saved ? "Mit allen Kontaktdaten, frisch aus der Datenbank." : "Erst speichern – heruntergeladen wird die gespeicherte Fassung."}</p>
        </>
      );
      break;
    }
    case "freigabe":
      form = (
        <div className="bk-act gold">
          <p><Icon name="schloss" size={14} /> <b>Drei-Stufen-Freigabe</b>: Trigger echt, Daten vollständig, auslieferbar.</p>
          <p>Läuft vor jeder Probe und Lieferung immer – auch wenn dieser Baustein fehlt. Hier nur die Markierung im Ablauf.</p>
        </div>
      );
      break;
    case "speicher":
      form = (
        <>
          {sec("Speicher", <PoolPick key={cfg.id} cfg={cfg} pools={pools} addPool={addPool} set={set} source={source} />)}
          <p className="bk-hint">{kind === "master" ? "Neue Leads, die hier ankommen, kommen in diesen Speicher." : kind === "agent" ? "Bei jedem Lauf kommen die Treffer in diesen Speicher." : "Im Test-Flow nur Vorschau – wirksam in Master oder Agent."}</p>
        </>
      );
      break;
    case "melden":
      form = (
        <>
          {sec("Vorschau", <p className="bk-quote">{meldenPreview(input, flowName)}</p>)}
          <p className="bk-hint">{kind === "agent" ? "Kommt bei jedem Lauf per Mail und aufs Handy – nur an dich." : "Nur in einem Agenten wirksam – hier Vorschau."}</p>
        </>
      );
      break;
    case "agent":
      form = (
        <>
          {sec("Agent", <Chips opts={[1, 2, 3, 4].map((n) => ({ v: n, label: `A${n}` }))} on={(v) => cfg.agent === v} pick={(v) => set({ ...cfg, agent: v })} />)}
          {sec("Auftrag", <Chips opts={(OWNER_KINDS as AgentTaskKind[]).map((k) => ({ v: k, label: KINDS[k].label }))} on={(v) => cfg.task === v} pick={(v) => set({ ...cfg, task: v })} />)}
          <button type="button" className="bk-btn gold" disabled={ctx.busy || !saved || !on} onClick={() => act.toAgent(cfg.id)}><Icon name="an-agent" size={15} />Auftrag erteilen</button>
          <p className="bk-hint">{!saved ? "Erst speichern." : !on ? "Erst einen Eingang verbinden." : `Agent ${cfg.agent} bekommt den Weg und ${fmt(input.length)} Treffer als Auftrag.`}</p>
        </>
      );
      break;
  }

  return (
    <>
      <header style={{ "--nc": meta.color } as CSSProperties}>
        <span className="bkn-ic" aria-hidden><Icon name={meta.icon} size={16} /></span>
        <div>
          <small>{meta.label}</small>
          <input value={cfg.title ?? ""} maxLength={LIMITS.title} placeholder={cfg.kind === "pipeline" ? cfg.name : meta.label} aria-label="Name des Bausteins"
            onChange={(e) => set({ ...cfg, title: e.target.value || undefined })} />
        </div>
        {cfg.kind !== "quelle" && cfg.kind !== "pipeline" && (
          <button type="button" className="bk-x" onClick={dup} aria-label="Baustein kopieren" title="Kopieren (Strg+D)"><Icon name="kopieren" size={14} /></button>
        )}
        <button type="button" className="bk-x bk-del" onClick={remove} aria-label="Baustein löschen" title="Löschen (Entf)"><Icon name="loeschen" size={14} /></button>
        <button type="button" className="bk-x" onClick={close} aria-label="Schließen"><Icon name="schliessen" size={14} /></button>
      </header>
      <div className="bk-bigs" style={{ "--nc": meta.color } as CSSProperties}>
        {bigs.map(([v, l, hi]) => <div key={l} className={hi ? "hi" : undefined}><b>{v}</b><span>{l}</span></div>)}
      </div>
      {probs.length > 0 && (
        <ul className="bk-pl">
          {probs.map((p, i) => <li key={i} className={p.level}><button type="button" tabIndex={-1}><i />{p.msg}</button></li>)}
        </ul>
      )}
      <div style={{ "--nc": meta.color, display: "grid", gridTemplateColumns: "minmax(0,1fr)", gap: 14 } as CSSProperties}>{form}</div>
      <section className="bk-sec">
        <header>
          <h4>Beispiele</h4>
          {cfg.kind === "weiche" && (
            <span className="bk-tabs"><Chips opts={[{ v: "ja" as const, label: "ja" }, { v: "nein" as const, label: "nein" }]} on={(v) => port === v} pick={setPort} /></span>
          )}
        </header>
        <Rows rows={out} source={source} />
      </section>
      <div style={{ "--nc": meta.color } as CSSProperties}><Breakdown key={cfg.id} rows={out} source={source} initial={breakdownField(cfg)} /></div>
    </>
  );
}

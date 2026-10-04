"use client";

/**
 * Eigene Speicher (Inhaber 04.10.2026: „andere speicher selber anlegen und entscheiden welcher speicher genutzt wird um
 * die kunden zu bedienen“). Speicher anlegen/umbenennen/Farbe sofort per Knopf (nie löschen); wer aus welchem Speicher
 * bedient wird, erst als Entwurf – gespeichert nur über „Übernehmen“ in der Leiste unten (wie die Regler).
 */
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type CSSProperties } from "react";
import {
  ALL_POOL, changeText, effectivePool, poolChanges, routeKey, type Pool, type PoolDraft,
} from "@/lib/pools";
import { fmtBerlin } from "@/lib/start-queue";
import { Icon } from "@/app/icons";
import { applyPools, createPool, updatePool } from "./actions";

export type PoolView = Pool & { total: number; byCountry: [string, number][] };
export type SubView = { id: string; company: string; country: string; segment: string; pkg: string | null; test: boolean; paused: boolean };
type Toast = { ok: boolean; text: string } | null;

const nf = (n: number) => n.toLocaleString("de-DE");
const dot = (c: string | null) => ({ "--c": c ?? "#8ba6c9" }) as CSSProperties;

function PoolForm({ init, label, onSave, onCancel, busy }: {
  init: { name: string; color: string }; label: string; busy: boolean;
  onSave: (name: string, color: string) => void; onCancel?: () => void;
}) {
  const [name, setName] = useState(init.name);
  const [color, setColor] = useState(init.color);
  return (
    <form className="pl-form" onSubmit={(e) => { e.preventDefault(); onSave(name, color); }}>
      <input type="color" value={color} onChange={(e) => setColor(e.target.value)} aria-label="Farbe" title="Farbe" />
      <input type="text" value={name} maxLength={40} required placeholder="Name, z. B. Top US" aria-label="Name" onChange={(e) => setName(e.target.value)} />
      <div className="pl-fbtn">
        <button type="submit" className="pri" disabled={busy || !name.trim()}>{label}</button>
        {onCancel && <button type="button" onClick={onCancel} disabled={busy}>Abbrechen</button>}
      </div>
    </form>
  );
}

export function Pools({ pools, rows, saved, subs, subRoute, error, newColor }: {
  pools: PoolView[]; rows: { id: string; name: string; countries: string[] }[]; saved: PoolDraft; subs: SubView[];
  /** Land + Zielgruppe je Abo für „wie Zielgruppe/Land“ */
  subRoute: Record<string, { segment_id: string; country: string | null }>;
  error: string | null; newColor: string;
}) {
  const router = useRouter();
  const savedKey = JSON.stringify(saved);
  const [draft, setDraft] = useState<PoolDraft>(saved);
  const prev = useRef(savedKey);
  const [edit, setEdit] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [busy, startT] = useTransition();
  const root = useRef<HTMLDivElement>(null);

  // neuer gespeicherter Stand: unveränderten Entwurf mitziehen, eigene Änderungen behalten
  useEffect(() => {
    if (prev.current === savedKey) return;
    setDraft((d) => (JSON.stringify(d) === prev.current ? saved : d));
    prev.current = savedKey;
  }, [savedKey, saved]);

  const changes = useMemo(() => poolChanges(saved, draft), [saved, draft]);
  const ownRoutes = Object.values(draft.routes).filter((v) => v && v !== ALL_POOL).length;
  const pending = changes.length > 0;
  const name = useMemo(() => {
    const m = new Map(pools.map((p) => [p.id, p.name]));
    return (id: string | null) => (id ? m.get(id) ?? "?" : "Gesamtbestand");
  }, [pools]);
  const subName = (id: string) => subs.find((s) => s.id === id)?.company ?? "Abo";
  const locked = !!error || busy;

  // ungespeicherte Zuordnung: vor dem Verlassen nachfragen
  useEffect(() => {
    if (!pending) return;
    const onBefore = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", onBefore);
    return () => window.removeEventListener("beforeunload", onBefore);
  }, [pending]);

  // Leiste über der Handy-Navigation
  useEffect(() => {
    const fit = () => {
      const nav = document.querySelector<HTMLElement>(".bnav");
      root.current?.style.setProperty("--bnav", `${nav && getComputedStyle(nav).display !== "none" ? nav.offsetHeight : 0}px`);
    };
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, [pending]);

  useEffect(() => {
    if (!toast?.ok) return;
    const t = setTimeout(() => setToast(null), 8000);
    return () => clearTimeout(t);
  }, [toast]);

  const run = (p: Promise<{ ok: true; at: string; n: number } | { ok: false; error: string }>, okText: (at: string) => string, after?: () => void) =>
    startT(async () => {
      const r = await p;
      setToast(r.ok ? { ok: true, text: okText(r.at) } : { ok: false, text: r.error });
      if (r.ok) { after?.(); router.refresh(); }
    });

  const setRoute = (k: string, v: string) => setDraft((d) => ({ ...d, routes: { ...d.routes, [k]: v } }));
  const setSub = (id: string, v: string) => setDraft((d) => ({ ...d, subs: { ...d.subs, [id]: v } }));
  const opts = pools.map((p) => <option key={p.id} value={p.id}>{p.name}</option>);

  return (
    <div className={`pl${pending ? " has-bar" : ""}`} ref={root}>
      <section className="sp-card pl-card" aria-label="Eigene Speicher">
        <div className="sp-h"><h2>Eigene Speicher</h2><span className="sp-big">{pools.length}</span><span className="sp-note">nie gelöscht · Freigabe gilt immer</span></div>
        {error && <p className="pl-err" role="alert">Speicher gerade nicht lesbar – Ändern gesperrt</p>}
        <div className="pl-pools">
          <div className="pl-pool all" title="ohne eigenen Speicher: alle freigegebenen Leads">
            <div className="pl-ph"><i style={dot("#5fd4ff")} aria-hidden /><b>Gesamtbestand</b><Icon name="schloss" size={14} title="fest" /></div>
            <span className="pl-sub">alle freigegebenen Leads</span>
            <span className="pl-foot">Standard</span>
          </div>
          {pools.map((p) => (
            <div key={p.id} className="pl-pool" style={dot(p.color)}>
              {edit === p.id ? (
                <PoolForm init={{ name: p.name, color: p.color ?? newColor }} label="Speichern" busy={busy}
                  onCancel={() => setEdit(null)} onSave={(n, c) => run(updatePool(p.id, n, c), (at) => `Gespeichert ${fmtBerlin(at)}`, () => setEdit(null))} />
              ) : (<>
                <div className="pl-ph"><i aria-hidden /><b title={p.name}>{p.name}</b>
                  <button type="button" className="pl-ed" onClick={() => setEdit(p.id)} disabled={locked} aria-label={`${p.name} umbenennen`} title="Name/Farbe"><Icon name="einstellungen" size={15} /></button>
                </div>
                <span className="pl-n">{nf(p.total)} <small>Leads</small></span>
                <span className="pl-cs">{p.byCountry.length ? p.byCountry.slice(0, 8).map(([c, n]) => <span key={c}><b>{c}</b> {nf(n)}</span>) : <em>noch leer</em>}</span>
              </>)}
            </div>
          ))}
          <div className="pl-pool add">
            {edit === "neu" ? (
              <PoolForm init={{ name: "", color: newColor }} label="Anlegen" busy={busy} onCancel={() => setEdit(null)}
                onSave={(n, c) => run(createPool(n, c), (at) => `Angelegt ${fmtBerlin(at)}`, () => setEdit(null))} />
            ) : (
              <button type="button" className="pl-new" onClick={() => setEdit("neu")} disabled={locked}><Icon name="neu" size={18} />Neuer Speicher</button>
            )}
          </div>
        </div>
      </section>

      {/* Inhaber 04.10.2026: lange Abschnitte ein- und ausklappbar – zu, solange alles auf Gesamtbestand steht */}
      <details className="sp-card pl-card pl-fold" aria-label="Bedienen aus"
        open={ownRoutes > 0 || changes.some((c) => c.kind === "route") || undefined}>
        <summary className="sp-h"><h2>Bedienen aus</h2><span className="sp-note">Proben und Lieferungen je Zielgruppe und Land · {ownRoutes ? `${ownRoutes} eigene` : "alles Gesamtbestand"}</span></summary>
        {!rows.length ? <p className="sp-none">Keine Zielgruppe mit Mail-Ländern.</p> : (
          <div className="pl-matrix">
            {rows.map((r) => (
              <div key={r.id} className="pl-seg">
                <div className="pl-sh"><b>{r.id}</b><span>{r.name}</span></div>
                <div className="pl-cells">
                  {r.countries.map((c) => {
                    const k = routeKey(r.id, c), v = draft.routes[k] ?? ALL_POOL;
                    const chg = (saved.routes[k] ?? ALL_POOL) !== v;
                    const col = pools.find((p) => p.id === v)?.color ?? null;
                    return (
                      <label key={c} className={`pl-cell${chg ? " chg" : ""}${v ? " own" : ""}`} style={dot(col)}>
                        <span>{c}</span>
                        <select value={v} disabled={locked} onChange={(e) => setRoute(k, e.target.value)} aria-label={`${r.id} ${c}: bedienen aus`}>
                          <option value={ALL_POOL}>Gesamtbestand</option>{opts}
                        </select>
                      </label>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </details>

      <details className="sp-card pl-card pl-fold" aria-label="Je Kunde" open={changes.some((c) => c.kind === "sub") || undefined}>
        <summary className="sp-h"><h2>Je Kunde</h2><span className="sp-note">übersteuert Zielgruppe und Land · {subs.length} Abos</span></summary>
        {!subs.length ? <p className="sp-none">Noch keine Abos.</p> : (
          <div className="pl-subs">
            {subs.map((s) => {
              const v = draft.subs[s.id] ?? ALL_POOL, chg = (saved.subs[s.id] ?? ALL_POOL) !== v;
              const via = effectivePool({ ...subRoute[s.id], pool_id: null }, draft.routes);
              return (
                <label key={s.id} className={`pl-subr${chg ? " chg" : ""}`}>
                  <span className="pl-co"><b title={s.company}>{s.company}</b>
                    <small>{s.country} · {s.segment}{s.pkg ? ` · ${s.pkg}` : ""}{s.paused ? " · pausiert" : ""}</small>
                    {s.test && <em className="pl-test">Testkauf</em>}
                  </span>
                  <select value={v} disabled={locked} onChange={(e) => setSub(s.id, e.target.value)} aria-label={`${s.company}: bedienen aus`}>
                    <option value={ALL_POOL}>wie {s.segment} {s.country} ({name(via.pool_id)})</option>{opts}
                  </select>
                </label>
              );
            })}
          </div>
        )}
      </details>

      {pending && (
        <div className="pl-bar" role="region" aria-label="Änderungen übernehmen">
          <div className="in">
            <span className="pl-bn"><b>{changes.length}</b>{changes.length === 1 ? "Änderung" : "Änderungen"}</span>
            <span className="pl-list" title={changes.map((c) => changeText(c, name, subName)).join("\n")}>{changes.map((c) => changeText(c, name, subName)).join(" · ")}</span>
            <button type="button" className="pl-x" onClick={() => setDraft(saved)} disabled={busy}>Verwerfen</button>
            <button type="button" className="pri" onClick={() => run(applyPools(changes), (at) => `Übernommen ${fmtBerlin(at)}`)} disabled={locked}>{busy ? "…" : "Übernehmen"}</button>
          </div>
        </div>
      )}

      {toast && (
        <div className={`pl-toast${toast.ok ? "" : " bad"}`} role="status" aria-live="polite">
          <Icon name={toast.ok ? "ok" : "fehler"} size={18} /><span>{toast.text}</span>
          <button type="button" onClick={() => setToast(null)} aria-label="schließen"><Icon name="schliessen" size={16} /></button>
        </div>
      )}
    </div>
  );
}

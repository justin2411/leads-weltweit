/**
 * HUD-Instrumente des Leitstands (Inhaber 03.10.2026: „futuristisch … wie bei tony stark“). Reine Server-Komponenten,
 * SVG + CSS-Animationen (bewegen sich nur, wo wirklich etwas läuft; prefers-reduced-motion: still).
 */
import type { CSSProperties, ReactNode } from "react";
import type { Bay } from "@/lib/leitstand";

type V = CSSProperties & Record<`--${string}`, string | number>;

/** Farbe je Linie (validiert gegen den dunklen Grund, je Linie unterscheidbar). */
export const LANE_COLOR: Record<string, string> = {
  "web-us": "#5fd4ff", "web-uk": "#b79bff", "web-fr": "#3ddc97", "web-north": "#4f8dff", "s2-us": "#ffb547",
  "s1-us-lca": "#ff7ab6", "s1-uk-tender": "#ff9d5c", kunden: "#e2c68f",
};
export const laneColor = (id: string | null | undefined) => (id && LANE_COLOR[id]) || "#8aa4c8";

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const pt = (r: number, deg: number) => [200 + r * Math.cos(rad(deg)), 200 + r * Math.sin(rad(deg))].map((x) => x.toFixed(2));
function seg(r1: number, r2: number, a0: number, a1: number) {
  const large = a1 - a0 > 180 ? 1 : 0;
  const [x1, y1] = pt(r2, a0), [x2, y2] = pt(r2, a1), [x3, y3] = pt(r1, a1), [x4, y4] = pt(r1, a0);
  return `M${x1} ${y1}A${r2} ${r2} 0 ${large} 1 ${x2} ${y2}L${x3} ${y3}A${r1} ${r1} 0 ${large} 0 ${x4} ${y4}Z`;
}
function arc(r: number, a0: number, a1: number) {
  const [x1, y1] = pt(r, a0), [x2, y2] = pt(r, a1);
  return `M${x1} ${y1}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x2} ${y2}`;
}

/** Reaktor: 40 Plätze als Ring (laufend leuchtet in Linienfarbe, eingeplant als Umriss, frei dunkel, reserviert grau). */
export function Reactor({ bays, running, util, center, sub }: { bays: Bay[]; running: number; util: number; center: string; sub: string }) {
  const n = bays.length, step = 360 / n, gap = 1.4;
  return (
    <div className={`reactor ${running ? "hot" : ""}`}>
      <svg viewBox="0 0 400 400" role="img" aria-label={`${running} von ${n} Plätzen laufen gerade`}>
        <defs>
          <radialGradient id="rc-core"><stop offset="0" stopColor="#5fd4ff" stopOpacity=".55" /><stop offset=".55" stopColor="#1b4d7a" stopOpacity=".18" /><stop offset="1" stopColor="#030812" stopOpacity="0" /></radialGradient>
          <filter id="rc-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="3.2" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <circle cx="200" cy="200" r="196" className="rc-halo" />
        <g className="rc-ticks">{Array.from({ length: 120 }, (_, i) => {
          const [x1, y1] = pt(188, i * 3), [x2, y2] = pt(i % 10 === 0 ? 178 : 183, i * 3);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={i % 10 === 0 ? "maj" : ""} />;
        })}</g>
        <g>{bays.map((b, i) => (
          <path key={b.n} d={seg(146, 170, i * step + gap / 2, (i + 1) * step - gap / 2)} className={`rc-slot ${b.state}`}
            style={{ "--c": b.state === "run" || b.state === "plan" ? laneColor(b.lane) : b.state === "other" ? "#e2c68f" : undefined, "--i": i } as V}
            filter={b.state === "run" || b.state === "other" ? "url(#rc-glow)" : undefined}>
            <title>{`Platz ${b.n}: ${b.state === "run" ? `läuft – ${b.part} (${b.processed} geprüft, ${b.green} grün${b.runMin !== null ? `, seit ${b.runMin} min` : ""})` : b.state === "plan" ? `eingeplant für ${b.lane}, gerade leer` : b.state === "other" ? `${b.werk} läuft` : b.state === "reserve" ? "reserviert (Versand, Tagescheck, Wachhund)" : "frei"}`}</title>
          </path>
        ))}</g>
        <circle cx="200" cy="200" r="134" className="rc-dash" />
        <path d={arc(118, 0, 359.9)} className="rc-track" />
        <path d={arc(118, 0, Math.max(0.5, Math.min(359.9, util * 360)))} className="rc-util" />
        <circle cx="200" cy="200" r="104" fill="url(#rc-core)" className="rc-core" />
        <g className="rc-spin">{[0, 120, 240].map((a) => <path key={a} d={arc(92, a, a + 70)} className="rc-blade" />)}</g>
      </svg>
      <div className="rc-center">
        <b>{center}</b>
        <span>{sub}</span>
      </div>
    </div>
  );
}

/** Halbkreis-Anzeige mit Wert, Ziel und Beschriftung. */
export function Gauge({ value, max, label, unit, tone = "cyan", tip, sub }: { value: number; max: number; label: string; unit?: string; tone?: "cyan" | "gold" | "green" | "amber" | "red"; tip?: string; sub?: ReactNode }) {
  const f = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
  const a0 = -120, a1 = 120;
  return (
    <div className={`gauge gc-${tone}`} title={tip}>
      <svg viewBox="0 0 400 260" aria-hidden>
        <path d={arc(170, a0, a1)} className="g-track" transform="translate(0,40)" />
        <path d={arc(170, a0, a0 + Math.max(0.5, f * (a1 - a0)))} className="g-val" transform="translate(0,40)" />
        {Array.from({ length: 13 }, (_, i) => { const [x1, y1] = pt(150, a0 + i * 20), [x2, y2] = pt(140, a0 + i * 20); return <line key={i} x1={x1} y1={Number(y1) + 40} x2={x2} y2={Number(y2) + 40} className="g-tick" />; })}
      </svg>
      <div className="g-read"><b>{value.toLocaleString("de-DE")}{unit && <small>{unit}</small>}</b><span>{label}</span>{sub && <em>{sub}</em>}</div>
    </div>
  );
}

/** Werkhalle: jeder Platz als Kachel (Nummer, Linie, Teil, Zähler, Laufzeit). */
export function Bays({ bays, labels }: { bays: Bay[]; labels: Record<string, string> }) {
  return (
    <ol className="bays" aria-label="Plätze">
      {bays.map((b) => {
        const c = b.state === "other" ? "#e2c68f" : laneColor(b.lane);
        const pct = b.runMin !== null ? Math.min(100, (b.runMin / 75) * 100) : 0;
        const tip = b.state === "run" ? `Platz ${b.n} · ${labels[b.lane ?? ""] ?? b.lane} · ${b.part} · ${b.processed.toLocaleString("de-DE")} geprüft, ${b.green.toLocaleString("de-DE")} grün · läuft seit ${b.runMin ?? "?"} min (Zeitfenster 75 min)`
          : b.state === "plan" ? `Platz ${b.n} · eingeplant für ${labels[b.lane ?? ""] ?? b.lane} · gerade leer (wartet auf den nächsten Start)`
          : b.state === "other" ? `Platz ${b.n} · ${b.werk} läuft (${b.part})` : b.state === "reserve" ? `Platz ${b.n} · reserviert für Versand, Tagescheck, Wachhund` : `Platz ${b.n} · frei – im Steuerpult einer Linie zuweisen`;
        return (
          <li key={b.n} className={`bay ${b.state}`} style={{ "--c": c, "--p": `${pct}%` } as V} title={tip}>
            <span className="bn">{String(b.n).padStart(2, "0")}</span>
            <span className="bl">{b.state === "run" || b.state === "plan" ? (labels[`short:${b.lane}`] ?? b.lane) : b.state === "other" ? (b.werk ?? "").toUpperCase() : b.state === "reserve" ? "RESERVE" : "FREI"}</span>
            {b.state === "run" && <span className="bv"><b>{b.green.toLocaleString("de-DE")}</b> grün<i>{b.processed.toLocaleString("de-DE")} geprüft</i></span>}
            {b.state === "run" && <span className="bp" aria-hidden />}
          </li>
        );
      })}
    </ol>
  );
}

/** Belegte Plätze über 24 h (Mittel je 30 min) mit Grenzlinie (verfügbar) und Uhrzeiten (deutsche Zeit). */
export function UtilChart({ buckets, total, cap }: { buckets: { from: string; slots: number; counted?: boolean }[]; total: number; cap: number }) {
  const W = 960, H = 170, pad = 26, bw = (W - pad) / buckets.length;
  const y = (v: number) => H - 22 - (v / total) * (H - 34);
  const hh = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="uchart" role="img" aria-label="Belegte Plätze in den letzten 24 Stunden">
      {[0, 10, 20, 30, 40].map((v) => <g key={v}><line x1={pad} x2={W} y1={y(v)} y2={y(v)} className="u-grid" /><text x={0} y={y(v) + 4} className="u-ax">{v}</text></g>)}
      <line x1={pad} x2={W} y1={y(cap)} y2={y(cap)} className="u-cap" />
      <text x={W - 4} y={y(cap) - 5} className="u-ax end">{cap} Plätze für Werke</text>
      {buckets.map((b, i) => (
        <rect key={b.from} x={pad + i * bw + 1} y={b.counted === false ? H - 25 : y(b.slots)} width={Math.max(1, bw - 2)} height={b.counted === false ? 3 : Math.max(0, H - 22 - y(b.slots))} rx="1.5" className={`u-bar ${b.counted === false ? "nodata" : b.slots >= cap * 0.75 ? "hi" : b.slots > 0 ? "" : "zero"}`}>
          <title>{b.counted === false ? `${hh(b.from)}: noch nicht gezählt` : `${hh(b.from)}: im Mittel ${b.slots.toLocaleString("de-DE")} Plätze belegt`}</title>
        </rect>
      ))}
      {buckets.map((b, i) => (i % 8 === 0 ? <text key={`t${i}`} x={pad + i * bw} y={H - 4} className="u-ax">{hh(b.from)}</text> : null))}
    </svg>
  );
}

/** Rahmen eines HUD-Panels mit Eckwinkeln und Titelzeile. */
export function Panel({ title, code, right, children, className = "", id }: { title: string; code?: string; right?: ReactNode; children: ReactNode; className?: string; id?: string }) {
  return (
    <section className={`hp ${className}`} id={id}>
      <i className="cn tl" /><i className="cn tr" /><i className="cn bl" /><i className="cn br" />
      <header><span className="hp-t">{code && <em>{code}</em>}{title}</span>{right}</header>
      {children}
    </section>
  );
}

/**
 * Fluss-Karte und Seitenfenster (Inhaber 03.10.2026: „was läuft und was wohin läuft … grafiken die anklickbar sind“).
 * Server-Komponenten: SVG-Leitungen mit wandernden Punkten (SMIL, nur bei echtem Durchsatz), Stationen als Links
 * (?s=station öffnet das Seitenfenster). Ohne JavaScript voll bedienbar; reduzierte Bewegung: keine Punkte.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { ASPECT, POS, VIEW, WEB_STATIONS, edgePath, flow, type Edge, type Station, type StationId, type TickerItem } from "@/lib/fluss";
import type { TipTask } from "@/lib/leitstand";
import { WEB_INFO } from "@/lib/website-stats";
import { DragBox } from "./dnd";
import { AutoBadge } from "./auto-badge";
import { SPARK_CSS, StationSpark, sparkText } from "./spark";
import { Icon, type IconName } from "@/app/icons";

// ab 10 Tsd. ohne Nachkomma („14 Tsd./h“): kürzer, damit die Menge zwischen die Kreise passt
const fmtRate = (n: number) => (n >= 1000 ? `${(n / 1000).toLocaleString("de-DE", { maximumFractionDigits: n >= 10_000 ? 0 : 1 })} Tsd./h` : `${n.toLocaleString("de-DE")}/h`);

function Map({ layout, stations, edges, active, href }: { layout: "wide" | "tall"; stations: Station[]; edges: Edge[]; active: StationId | null; href: (id: StationId) => string }) {
  const [W, H] = VIEW[layout];
  const by = Object.fromEntries(stations.map((s) => [s.id, s])) as Record<StationId, Station>;
  return (
    <div className={`fl-map fl-${layout}`} style={{ aspectRatio: `${ASPECT[layout]}` }}>
      <svg viewBox={`0 0 ${W} ${H}`} className="fl-svg" aria-hidden>
        <defs>
          <filter id={`fl-glow-${layout}`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.5" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        {edges.map((e) => {
          const d = edgePath(layout, e.from, e.to);
          const f = flow(e.perHour);
          const jam = by[e.to]?.neck;
          const [x1, y1] = POS[layout][e.from], [x2, y2] = POS[layout][e.to];
          const mx = ((x1 + x2) / 200) * W, my = ((y1 + y2) / 200) * H;
          // Menge auf jeder Leitung (Inhaber 03.10.2026: „auf dem strich die menge … z.b. 232/h“): mittig auf der Leitung
          // (Mitte der Kurve = Mitte zwischen den Kreisen), dunkel freigestellt, damit sie keinen Kreis berührt
          return (
            <g key={`${e.from}-${e.to}`} className={`fl-edge ${f ? "on" : "off"} ${jam ? "jam" : ""}`}>
              <path d={d} className="fl-pipe" />
              <path d={d} className="fl-core" />
              {f && Array.from({ length: f.dots }, (_, i) => (
                <circle key={i} r={layout === "wide" ? 4.5 : 4} className="fl-dot" filter={`url(#fl-glow-${layout})`}>
                  <animateMotion dur={`${f.dur}s`} begin={`${-(i * f.dur) / f.dots}s`} repeatCount="indefinite" path={d} />
                </circle>
              ))}
              <text x={mx} y={my} dominantBaseline="central" className={`fl-rate fl-rate-on${e.perHour > 0 ? "" : " zero"}`}>{fmtRate(Math.max(0, e.perHour || 0))}</text>
              <title>{`${e.label}: ${e.perHour ? `${e.perHour.toLocaleString("de-DE")} in der letzten Stunde` : "gerade kein Durchfluss"}`}</title>
            </g>
          );
        })}
      </svg>
      {stations.map((s) => {
        const [x, y] = POS[layout][s.id];
        return (
          <Link key={s.id} href={href(s.id)} scroll={false} className={`fl-st ${s.state} ${s.badge?.on ? "go" : ""} ${s.neck ? "neck" : ""} ${active === s.id ? "on" : ""} ${s.id === "kunden" ? "goal" : ""} ${WEB_STATIONS.includes(s.id) ? "web" : ""}`}
            style={{ left: `${x}%`, top: `${y}%` }} title={s.tip} aria-label={`${s.label}: ${s.value}${s.unit ?? ""} – ${s.sub}${s.spark && sparkText(s.spark) ? ` · ${sparkText(s.spark)}` : ""}`}>
            <span className="fl-ring" aria-hidden><i /><i /></span>
            <b className="fl-v">{s.value}{s.unit && <small>{s.unit}</small>}</b>
            {s.spark && <StationSpark s={s.spark} />}
            <span className="fl-l">{s.label}</span>
            <span className="fl-s">{s.sub}</span>
            {s.neck && <em className="fl-neck">Engpass</em>}
          </Link>
        );
      })}
      {/* Autopilot-Abzeichen neben (nicht im) Kreis-Link: eigener Schalter, öffnet nie das Seitenfenster */}
      {stations.filter((s) => s.auto !== undefined).map((s) => (
        <AutoBadge key={`auto-${s.id}`} on={!!s.auto} x={POS[layout][s.id][0]} y={POS[layout][s.id][1]} label={s.label} />
      ))}
      {/* Zustands-Abzeichen (Versand rund um die Uhr, Inhaber 04.10.2026): grün „24/7“ = an, rot „aus“; kein Schalter */}
      {stations.filter((s) => s.badge).map((s) => (
        <span key={`badge-${s.id}`} className={`fl-auto fl-badge${s.badge!.on ? " on" : " off"}`} title={s.badge!.tip} aria-hidden
          style={{ left: `${POS[layout][s.id][0]}%`, top: `${POS[layout][s.id][1]}%` }}>{s.badge!.text}</span>
      ))}
    </div>
  );
}

export function FlowMap(p: { stations: Station[]; edges: Edge[]; active: StationId | null; href: (id: StationId) => string }) {
  return (
    <div className="fl">
      <style dangerouslySetInnerHTML={{ __html: SPARK_CSS }} />
      <div className="fl-lanes"><span aria-hidden>Ware · Leads</span><span aria-hidden>Käufer · Webagenturen</span>
        <span><span aria-hidden>Website · Besucher</span><i className="fl-info" title={WEB_INFO} aria-label={`Website: ${WEB_INFO}`} tabIndex={0}><Icon name="info" size={13} /></i></span></div>
      <p className="fl-info-m"><Icon name="info" size={13} /> Website: {WEB_INFO}</p>
      <Map layout="wide" {...p} />
      <Map layout="tall" {...p} />
    </div>
  );
}

/** Kern-Kennzahlen oben: 4 Kacheln (Icon, Wert, Name, kurzer Zusatz), Klick öffnet die Station. */
export type Kpi = { label: string; value: string; sub: string; tone: "green" | "gold" | "red" | "cyan" | "grey"; href: string; icon?: IconName; task?: TipTask };
export function Ampeln({ items }: { items: Kpi[] }) {
  return (
    <div className="amps4">
      {items.map((a) => {
        const tile = (
          <Link key={a.label} href={a.href} scroll={false} className={`amp4 t-${a.tone}${a.task ? " jt-drag" : ""}`}>
            {a.icon ? <span className="amp4-ic" aria-hidden><Icon name={a.icon} size={20} /></span> : <i className="amp4-led" aria-hidden />}
            <span className="amp4-tx"><span className="amp4-l">{a.label}</span><b>{a.value}</b><em>{a.sub}</em></span>
          </Link>
        );
        return a.task ? <DragBox key={a.label} task={a.task} title={`${a.label}: ${a.value}`}>{tile}</DragBox> : tile;
      })}
    </div>
  );
}

/** Seitenfenster einer Station mit drei Reitern: Info · Einstellen · Prüfen. */
export function Drawer({ title, icon, tab, base, close, tabs, children, state }: {
  title: string; icon: IconName; tab: "info" | "set" | "check"; base: string; close: string; tabs: { set: boolean; check: boolean }; children: ReactNode; state: string;
}) {
  const t = (k: "info" | "set" | "check", label: string, sym: IconName, on = true) => on && (
    <Link key={k} href={`${base}&t=${k}`} scroll={false} className={tab === k ? "on" : ""} aria-current={tab === k ? "page" : undefined}><Icon name={sym} size={16} />{label}</Link>
  );
  return (
    <aside className={`drw st-${state}`} aria-label={title}>
      <header>
        <span className="drw-ic" aria-hidden><Icon name={icon} size={20} /></span><h2>{title}</h2>
        <Link href={close} scroll={false} className="drw-x x-btn" aria-label="Schließen"><Icon name="schliessen" size={16} /></Link>
      </header>
      <nav className="drw-tabs" style={{ gridTemplateColumns: `repeat(${1 + Number(tabs.set) + Number(tabs.check)},minmax(0,1fr))` }}>
        {[t("info", "Info", "info"), t("set", "Einstellen", "einstellungen", tabs.set), t("check", "Prüfen", "ok", tabs.check)]}</nav>
      <div className="drw-body">{children}</div>
    </aside>
  );
}

/** Live-Ticker unten: was zuletzt passiert ist (läuft als Band durch, Hover hält an). */
export function Ticker({ items }: { items: TickerItem[] }) {
  if (!items.length) return null;
  const hh = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
  const row = items.map((x, i) => (
    <span key={i} className={`tk t-${x.tone}`}>
      <time>{hh(x.at)}</time><i aria-hidden><Icon name={x.icon} size={16} /></i>{x.href ? <Link href={x.href}>{x.text}</Link> : x.text}
    </span>
  ));
  return (
    <div className="tick" aria-label="Zuletzt passiert">
      <span className="tick-l"><i aria-hidden />Live</span>
      <div className="tick-v"><div className="tick-t">{row}<span aria-hidden className="tick-dup">{row}</span></div></div>
    </div>
  );
}

/** Kleine Balkenreihe (z. B. je Land, je Linie) – jede Zeile anklickbar. */
export function MiniBars({ rows, unit = "" }: { rows: { key: string; label: string; n: number; color?: string; href?: string; tip?: string }[]; unit?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="mbars">
      {rows.map((r) => {
        const inner = (<><span className="mb-l">{r.label}</span><span className="mb-b"><i style={{ width: `${(r.n / max) * 100}%`, background: r.color }} /></span><b>{r.n.toLocaleString("de-DE")}{unit}</b></>);
        return <li key={r.key} title={r.tip}>{r.href ? <Link href={r.href} scroll={false}>{inner}</Link> : <div>{inner}</div>}</li>;
      })}
    </ul>
  );
}

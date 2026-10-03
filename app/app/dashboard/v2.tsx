/**
 * Bausteine des Dashboards v2 (Inhaber 03.10.2026: „ganz wenig text und grafiken … am anfang überall die wichtigsten
 * KPIs und dann tiefer reingehen“). Reines SVG/HTML auf dem Server, Tooltips über title.
 * Farben: Länder = COUNTRY_COLOR (mit dataviz/validate_palette.js geprüft, alle Paare), Status nur mit Symbol + Wort,
 * Text immer in Textfarben, Säulen ≤ 24 px mit 4 px runden Enden und 2 px Lücken, Raster als Haarlinie.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import { COUNTRY_COLOR, OTHER_COLOR, compact, type Alert } from "@/lib/dashboard-logic";
import { delta } from "@/lib/dashboard-periods";

export function Crumbs({ items }: { items: [string, string][] }) {
  return (
    <nav className="crumbs" aria-label="Pfad">
      {items.map(([l, h], i) => (
        <span key={i}>{i > 0 && <b aria-hidden> › </b>}{h ? <Link href={h}>{l}</Link> : <span aria-current="page">{l}</span>}</span>
      ))}
    </nav>
  );
}

const ICON = { rot: "✕", gelb: "!", gruen: "✓" } as const;

export function AmpelRow({ alerts }: { alerts: Alert[] }) {
  if (!alerts.length) return <div className="amp"><span className="amp-i gruen" title="Keine Engpässe erkannt"><b>{ICON.gruen}</b>Alles läuft</span></div>;
  return (
    <div className="amp">
      {alerts.map((a, i) => (
        <span key={i} className={`amp-i ${a.level}`} title={[a.title, a.detail].filter(Boolean).join(" – ")}>
          <b aria-label={a.level === "rot" ? "Engpass" : "Achtung"}>{ICON[a.level]}</b>{a.short ?? a.title}
        </span>
      ))}
    </div>
  );
}

/** Umschalter als Chips (Links mit Suchparametern; andere Parameter bleiben erhalten). */
export function Chips({ base, param, value, options, params, dots }: {
  base: string; param: string; value: string | null; options: [string | null, string][]; params: Record<string, string | undefined>; dots?: boolean;
}) {
  const href = (v: string | null) => {
    const q = new URLSearchParams();
    for (const [k, x] of Object.entries(params)) if (x && k !== param) q.set(k, x);
    if (v) q.set(param, v);
    return q.toString() ? `${base}?${q}` : base;
  };
  return (
    <nav className="chips" aria-label={param}>
      {options.map(([v, l]) => (
        <Link key={l} href={href(v)} className={value === v ? "on" : ""}>
          {dots && v && <i style={{ background: COUNTRY_COLOR[v] ?? OTHER_COLOR }} />}{l}
        </Link>
      ))}
    </nav>
  );
}

export const COUNTRY_OPTS: [string | null, string][] = [[null, "Alle"], ["US", "US"], ["UK", "UK"], ["FR", "FR"]];

/** Kachel mit großer Zahl, Label und Veränderung zum Vorzeitraum. */
export function Kpi({ value, label, cur, prev, tip, goodDown, href }: {
  value: string; label: string; cur?: number; prev?: number; tip?: string; goodDown?: boolean; href?: string;
}) {
  const d = cur !== undefined && prev !== undefined ? delta(cur, prev) : null;
  const good = d && d.dir !== "flat" ? (d.dir === "up") !== !!goodDown : null;
  const body = (
    <>
      <span className="kv">{value}</span>
      <span className="kl">{label}</span>
      {d && <span className={`kd ${good === null ? "" : good ? "up" : "down"}`} title={`Vorzeitraum: ${prev}`}>{d.text}</span>}
      {href && <span className="kgo" aria-hidden>›</span>}
    </>
  );
  return href ? <Link href={href} className="kpi2 link" title={tip ? `${tip} · Klick: Firmen ansehen` : "Klick: Firmen ansehen"}>{body}</Link> : <div className="kpi2" title={tip}>{body}</div>;
}

export function Tile({ title, href, children, wide, tip }: { title: string; href?: string; children: ReactNode; wide?: boolean; tip?: string }) {
  return (
    <section className={`card tile ${wide ? "wide" : ""}`}>
      <header className="th">
        <span title={tip}>{title}</span>
        {href && <Link href={href} className="more" aria-label={`${title} – Details`}>Details ›</Link>}
      </header>
      {children}
    </section>
  );
}

// ---------------------------------------------------------------------------------------------- Säulen
export { Columns, Legend, type Series } from "./columns";
import type { Series } from "./columns";
export const countrySeries = (cs: string[]): Series[] => cs.map((c) => ({ key: c, label: c, color: COUNTRY_COLOR[c] ?? OTHER_COLOR }));
/** Kennzahlen-Farben für das kombinierte Diagramm (validiert, Reihenfolge = Ablauf). */
export const METRIC_SERIES: Series[] = [
  { key: "sent", label: "Mails", color: "#3560a8" }, { key: "replies", label: "Antworten", color: "#c9973a" },
  { key: "positive", label: "Positiv", color: "#2a9d8f" }, { key: "samples_sent", label: "Proben", color: "#6a51a3" },
  { key: "customers", label: "Kunden", color: "#d0603f" },
];

/** Füllstand (Ist/Soll) mit Statusfarbe + Symbol. */
export function Fill({ label, ready, target, tip }: { label: string; ready: number; target: number; tip?: string }) {
  const share = target ? Math.min(1, ready / target) : 0;
  const lvl = ready === 0 ? "rot" : share < 0.5 ? "gelb" : "ok";
  return (
    <div className="fill" title={tip}>
      <span className="fk">{label}</span>
      <span className="ft"><i className={lvl} style={{ width: `${Math.max(share * 100, ready ? 4 : 0)}%` }} /></span>
      <span className="fv">{lvl === "rot" && <b className="st rot" aria-label="leer">✕</b>}{ready}/{target}</span>
    </div>
  );
}

/** Kompakte waagerechte Balken je Land (eigene Skala je Gruppe), Wert am Ende. */
export function Bars({ title, rows, tip }: { title?: string; rows: { key: string; n: number; tip?: string }[]; tip?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="bars" title={tip}>
      {title && <div className="bt">{title}</div>}
      {rows.map((r) => (
        <div key={r.key} className="bar" title={r.tip ?? `${r.key}: ${r.n.toLocaleString("de-DE")}`}>
          <span className="bk">{r.key}</span>
          <span className="bb"><i style={{ width: `${Math.max(1, (100 * r.n) / max)}%`, background: COUNTRY_COLOR[r.key] ?? OTHER_COLOR }} /></span>
          <span className="bv">{compact(r.n)}</span>
        </div>
      ))}
    </div>
  );
}

export function ago2(ts: string | null | undefined, now: Date): string {
  if (!ts) return "–";
  const h = (now.getTime() - Date.parse(ts)) / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} T`;
}

/** Steuer-Karte: Titel mit Tooltip, Inhalt (Formulare). */
export function Ctrl({ title, tip, children, locked }: { title: string; tip: string; children: ReactNode; locked?: string }) {
  return (
    <section className="card ctrl">
      <header className="th"><span title={tip}>{title}</span>{locked && <span className="lock" title={locked}>🔒 fest</span>}</header>
      {children}
    </section>
  );
}

/** Verstecktes Feld „zurück zu“ (aktuelle Seite mit Filtern) für die Server-Aktionen. */
export function Back({ to }: { to: string }) {
  return <input type="hidden" name="back" value={to} />;
}

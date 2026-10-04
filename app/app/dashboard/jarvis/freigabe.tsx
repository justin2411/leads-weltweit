/**
 * Freigabe-Anzeige in JARVIS (Inhaber: „Freigabe-Anzeige … hochwertiger: Ringe, klare Beschriftung, Klick zeigt Gründe,
 * kurze Erklärung was Freigabe ist“). Server-Komponenten, reine Darstellung der Zahlen aus page.tsx
 * (Stichprobe je Land, freigegeben/aussortiert in der letzten Stunde, Gründe aus lead_checks).
 */
import Link from "next/link";
import type { CSSProperties } from "react";
import { Icon } from "@/app/icons";

export type GateView = {
  /** bestanden in der Stichprobe (7 Tage), Prozent; null = noch keine Stichprobe */
  pct: number | null;
  ok: number; bad: number;
  countries: { c: string; pct: number | null }[];
  /** Station öffnen (Info) und Gründe (Prüfen, nur aussortierte) */
  href: string; reasonsHref: string;
};

/** Farbe nach der Regel der täglichen Stichprobe: Fehlerquote > 2 % gelb, > 5 % rot. */
export const gateTone = (p: number | null) => (p === null ? "grey" : p >= 98 ? "green" : p >= 95 ? "gold" : "red");
const pctTxt = (p: number | null) => (p === null ? "–" : `${p.toLocaleString("de-DE", { maximumFractionDigits: 1 })}`);
const fmt = (n: number) => (n >= 10_000 ? `${Math.round(n / 1000).toLocaleString("de-DE")} Tsd.` : n >= 1000 ? `${(n / 1000).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Tsd.` : n.toLocaleString("de-DE"));

/** Ring mit Prozentwert in der Mitte. */
export function Ring({ pct, size = 64, label, big = false }: { pct: number | null; size?: number; label: string; big?: boolean }) {
  const r = 42, c = 2 * Math.PI * r, f = pct === null ? 0 : Math.max(0, Math.min(100, pct)) / 100;
  return (
    <span className={`jring t-${gateTone(pct)}${big ? " big" : ""}`} style={{ "--s": `${size}px` } as CSSProperties}>
      <svg viewBox="0 0 100 100" width={size} height={size} aria-hidden>
        <circle cx="50" cy="50" r={r} className="jr-track" />
        <circle cx="50" cy="50" r={r} className="jr-val" strokeDasharray={`${(f * c).toFixed(1)} ${c.toFixed(1)}`} transform="rotate(-90 50 50)" />
      </svg>
      <b>{pctTxt(pct)}{pct !== null && <small>%</small>}</b>
      <span className="jr-l">{label}</span>
    </span>
  );
}

/** Ringe + Zahlen: Gesamt (groß) und je Land, darunter freigegeben/aussortiert pro Stunde. */
export function GateRings({ g }: { g: GateView }) {
  return (
    <div className="jfg-body">
      <div className="jfg-rings">
        <Link href={g.href} scroll={false} className="jfg-main" title="Stichprobe der letzten 7 Tage: Anteil der Leads, die alle 3 Stufen bestehen">
          <Ring pct={g.pct} size={112} label="bestanden" big />
        </Link>
        <div className="jfg-cs">
          {g.countries.map((x) => (
            <Link key={x.c} href={g.href} scroll={false} title={`${x.c}: Stichprobe bestanden`}><Ring pct={x.pct} size={60} label={x.c} /></Link>
          ))}
        </div>
      </div>
      <div className="jfg-nums">
        <Link href={g.href} scroll={false} className="ok"><b>{fmt(g.ok)}</b><span>frei / h</span></Link>
        <Link href={g.reasonsHref} scroll={false} className={g.bad ? "bad" : ""} title="Gründe ansehen"><b>{fmt(g.bad)}</b><span>aussortiert / h</span></Link>
      </div>
    </div>
  );
}

/** Karte „Freigabe“ unten rechts in JARVIS: Erklärung, Ringe, Klick auf „aussortiert“/„Gründe“ zeigt die Gründe. */
export function GatePanel({ g }: { g: GateView }) {
  return (
    <section className="jcard jfg" aria-label="Freigabe">
      <header className="jcard-h">
        <h2><Icon name="freigabe" size={18} /> Freigabe</h2>
        <span className="jfg-on" title="Die Freigabe ist nie abschaltbar"><Icon name="schloss" size={14} /> immer an</span>
      </header>
      <p className="jfg-what">Jeder Lead wird vor Probe und Lieferung geprüft: Anlass echt · Daten vollständig · lieferbar.</p>
      <GateRings g={g} />
      <Link href={g.reasonsHref} scroll={false} className="jcard-more">Gründe ansehen <Icon name="weiter" size={16} /></Link>
    </section>
  );
}

/** Die drei Stufen als kurze Liste (Seitenfenster „Freigabe“). */
export function GateSteps() {
  const steps: [string, string][] = [["Anlass echt", "frisch, live nachgeprüft"], ["Daten vollständig", "Adresse, Telefon, Mail, keine Widersprüche"], ["lieferbar", "frei, nicht gesperrt, Land passt"]];
  return (
    <ol className="jfg-steps">
      {steps.map(([b, s], i) => <li key={b}><i aria-hidden>{i + 1}</i><b>{b}</b><span>{s}</span></li>)}
    </ol>
  );
}

/** Häufigste Gründe der aussortierten Leads (aus den geladenen Prüfungen), mit Balken. */
export function Reasons({ rows }: { rows: { stage: number | null; reason: string; n: number }[] }) {
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => r.n));
  return (
    <ul className="jfg-why" aria-label="Häufigste Gründe">
      {rows.map((r) => (
        <li key={`${r.stage}-${r.reason}`}>
          <span className="jw-st">{r.stage ? `Stufe ${r.stage}` : "–"}</span>
          <span className="jw-rs" title={r.reason}>{r.reason}</span>
          <b>{r.n}</b>
          <i aria-hidden style={{ width: `${(r.n / max) * 100}%` }} />
        </li>
      ))}
    </ul>
  );
}

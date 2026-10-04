"use client";

/**
 * Großer Website-Trichter im JARVIS-Design (Inhaber 04.10.2026: „trichter … von startseite … bis danke seite …
 * mit animierten animationen in unserem design“). Fünf Stufen senkrecht (auch am Handy), je Stufe eindeutige Besucher
 * groß, darunter Aufrufe · Absprung · Ø Zeit; zwischen den Stufen die Weiter-Quote mit fließenden Lichtpunkten.
 * Zahlen zählen beim Laden hoch. „Bewegung reduzieren“: alles statisch. Klick auf eine Stufe → Details rechts/unten.
 */
import { useEffect, useRef, useState, type CSSProperties } from "react";
import Link from "next/link";
import { Icon, type IconName } from "@/app/icons";
import { fmtDwell, fmtRate, stageWidths, type FunnelStage, type FunnelView, type Share } from "@/lib/website-funnel";

const nf = (n: number) => Math.round(n).toLocaleString("de-DE");
const ICON: Record<FunnelStage, IconName> = { start: "start-seite", landing: "website", tarif: "tarif", stripe: "karte", danke: "ok-kreis" };
const C_COLOR: Record<string, string> = { US: "#5b8fdb", UK: "#b38331", FR: "#2fa898" };
const SRC_L: Record<string, string> = { mail: "Mail", direkt: "Direkt", suche: "Suche", andere: "Andere" };
const DEV_L: Record<string, string> = { desktop: "Desktop", mobil: "Mobil" };

function reduced(): boolean {
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return true;
  }
}

/** Zahl, die einmal von 0 hochzählt (nur mit Bewegung; Server-Ausgabe = Endwert). */
export function Count({ n, format = nf, delay = 0 }: { n: number; format?: (x: number) => string; delay?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const fmt = useRef(format);
  fmt.current = format;
  useEffect(() => {
    const el = ref.current;
    if (!el || reduced() || !n) return;
    let raf = 0;
    const t0 = performance.now() + delay;
    const dur = 1100;
    const tick = (t: number) => {
      const p = Math.min(1, Math.max(0, (t - t0) / dur));
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = fmt.current(n * e);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    el.textContent = fmt.current(0);
    raf = requestAnimationFrame(tick);
    return () => { cancelAnimationFrame(raf); el.textContent = fmt.current(n); };
  }, [n, delay]);
  return <span ref={ref}>{format(n)}</span>;
}

/** Waagrechte Balken für die Details (Länder, Herkunft, Domains). */
function Bars({ rows, label, color }: { rows: Share[]; label: (k: string) => string; color?: (k: string) => string }) {
  const total = rows.reduce((a, r) => a + r.n, 0);
  const max = Math.max(1, ...rows.map((r) => r.n));
  if (!total) return <p className="wt-none">noch keine Messung</p>;
  return (
    <ul className="wt-bars">
      {rows.map((r) => (
        <li key={r.k} title={`${label(r.k)}: ${nf(r.n)} (${fmtRate(r.n / total)})`}>
          <span className="wt-bl">{color && <i style={{ background: color(r.k) }} />}{label(r.k)}</span>
          <span className="wt-bb"><i style={{ width: `${(r.n / max) * 100}%` }} /></span>
          <b>{nf(r.n)}</b>
        </li>
      ))}
    </ul>
  );
}

function Details({ s }: { s: FunnelView["stages"][number] }) {
  const dev = Object.fromEntries(s.devices.map((d) => [d.k, d.n])) as Record<string, number>;
  const dt = (dev.desktop ?? 0) + (dev.mobil ?? 0);
  return (
    <div className="wt-det" aria-live="polite">
      <header>
        <span className="wt-di" aria-hidden><Icon name={ICON[s.id]} size={18} /></span>
        <h3>{s.label}</h3>
        <span className="wt-dn">{nf(s.uv)} Besucher</span>
      </header>
      <section><h4>Länder</h4><Bars rows={s.countries} label={(k) => (k === "XX" ? "unbekannt" : k)} color={(k) => C_COLOR[k] ?? "#7d8ca3"} /></section>
      <section>
        <h4>Gerät</h4>
        {dt ? (
          <div className="wt-split" title={`Desktop ${nf(dev.desktop ?? 0)} · Mobil ${nf(dev.mobil ?? 0)}`}>
            <div className="wt-sb"><i style={{ width: `${((dev.desktop ?? 0) / dt) * 100}%` }} /><i style={{ width: `${((dev.mobil ?? 0) / dt) * 100}%` }} /></div>
            <div className="wt-sl"><span><b>{fmtRate((dev.desktop ?? 0) / dt)}</b> Desktop</span><span><b>{fmtRate((dev.mobil ?? 0) / dt)}</b> Mobil</span></div>
          </div>
        ) : <p className="wt-none">{s.id === "stripe" && s.uv ? "vom Tarif übernommen – keine Messung" : "noch keine Messung"}</p>}
      </section>
      <section><h4>Herkunft</h4><Bars rows={s.sources} label={(k) => SRC_L[k] ?? DEV_L[k] ?? k} /></section>
      <section><h4>Websites</h4>{s.refs.length ? <Bars rows={s.refs} label={(k) => k} /> : <p className="wt-none">keine fremde Herkunft</p>}</section>
    </div>
  );
}

export type TrichterChip = { label: string; href: string; on: boolean };

export function Trichter({ v, periods, stand, since }: { v: FunnelView; periods: TrichterChip[]; stand: string | null; since: string | null }) {
  const first = v.stages.find((s) => s.uv > 0)?.id ?? "start";
  const [sel, setSel] = useState<FunnelStage>(first);
  useEffect(() => setSel(first), [first, v.period, v.country]);
  const share = stageWidths(v.stages);
  const n = v.stages.length;
  const cur = v.stages.find((s) => s.id === sel) ?? v.stages[0];
  const empty = !v.stages.some((s) => s.uv > 0);
  return (
    <section className="wt" aria-label="Website-Trichter">
      <header className="wt-head">
        <h2>Trichter</h2>
        <nav className="wt-chips" aria-label="Zeitraum Trichter">
          {periods.map((c) => <Link key={c.label} href={c.href} scroll={false} className={c.on ? "on" : undefined} aria-current={c.on ? "true" : undefined}>{c.label}</Link>)}
        </nav>
      </header>
      <div className="wt-kpis">
        <div><b><Count n={v.total} /></b><span>Besucher</span></div>
        <div><b>{fmtRate(v.conv)}</b><span>Start → Danke</span></div>
        <div><b><Count n={v.buys} /></b><span>Käufe Stripe</span></div>
      </div>
      <svg className="wt-defs" aria-hidden focusable="false">
        <defs>
          <linearGradient id="wt-grad" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5fd4ff" stopOpacity=".26" /><stop offset="1" stopColor="#0a2a52" stopOpacity=".55" /></linearGradient>
          <linearGradient id="wt-grad-hi" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#5fd4ff" stopOpacity=".38" /><stop offset="1" stopColor="#0d3566" stopOpacity=".6" /></linearGradient>
          <linearGradient id="wt-grad-on" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#e2c68f" stopOpacity=".2" /><stop offset=".6" stopColor="#0d3566" stopOpacity=".5" /><stop offset="1" stopColor="#0a2a52" stopOpacity=".6" /></linearGradient>
        </defs>
      </svg>
      <div className="wt-body">
        <ol className="wt-fun">
          {v.stages.map((s, i) => {
            const top = 100 - i * 7, bot = 100 - (i + 1) * 7;
            const pts = `${(100 - top) / 2},0 ${(100 + top) / 2},0 ${(100 + bot) / 2},100 ${(100 - bot) / 2},100`;
            const nx = s.next;
            const dots = nx === null || !s.nextN ? 0 : nx >= 0.3 ? 3 : nx >= 0.1 ? 2 : 1;
            return (
              <li key={s.id} className="wt-li" style={{ "--i": i } as CSSProperties}>
                <button type="button" className={`wt-band${sel === s.id ? " on" : ""}${s.uv ? "" : " zero"}`} aria-pressed={sel === s.id}
                  onClick={() => setSel(s.id)} title={`${s.label}: ${s.tip}`} style={{ "--top": `${top}%`, "--bot": `${bot}%` } as CSSProperties}>
                  <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden className="wt-shape">
                    <polygon points={pts} className="wt-fill" />
                    <polygon points={pts} className="wt-edge" vectorEffect="non-scaling-stroke" />
                    <rect x={(100 - bot) / 2 + 2} y="93" width={((bot - 4) * share[i]) / 100} height="3" className="wt-share" />
                  </svg>
                  <span className="wt-in" style={{ maxWidth: `calc(${bot}% - 28px)` }}>
                    <span className="wt-l"><Icon name={ICON[s.id]} size={15} />{s.label}</span>
                    <b className="wt-n"><Count n={s.uv} delay={i * 120} /></b>
                    <span className="wt-st">
                      <span><b>{nf(s.views)}</b><em>{s.id === "stripe" ? "Checkouts" : "Aufrufe"}</em></span>
                      <span><b>{fmtRate(s.bounce)}</b><em>Absprung</em></span>
                      <span><b>{fmtDwell(s.dwell)}</b><em>Ø Zeit</em></span>
                    </span>
                  </span>
                </button>
                {i < n - 1 && (
                  <div className={`wt-flow${dots ? " on" : ""}`} aria-label={`weiter zu ${v.stages[i + 1].label}: ${fmtRate(nx)}`}>
                    <span className="wt-pipe" aria-hidden>{Array.from({ length: dots }, (_, k) => <i key={k} style={{ "--k": k } as CSSProperties} />)}</span>
                    <span className="wt-rate"><Icon name="pfeil-runter" size={13} />{fmtRate(nx)}<small>weiter</small></span>
                  </div>
                )}
              </li>
            );
          })}
        </ol>
        <Details s={cur} />
      </div>
      <p className="wt-foot">
        {empty ? "noch keine Messung – zählt ab jetzt" : "Besucher eindeutig je Tag"} · ohne Cookies · Inhaber ausgeblendet
        {since && <> · gemessen seit {since}</>}{stand && <> · Stand {stand}</>}
      </p>
    </section>
  );
}

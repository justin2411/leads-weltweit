"use client";

/**
 * Website-Analyse im HUD-Design (Inhaber 04.10.2026: „mehr daten … wie google analytics oder marketing firmen
 * empfehlen … in unserem design übersichtlich“). Drei JARVIS-Hinweise, Kennzahl-Kacheln mit Vorzeitraum (▲/▼, Klick →
 * Erklärung), darunter Kanäle, Einstieg/Ausstieg, Wochentag × Stunde, Scrolltiefe, Formular/Video/CTA, Web Vitals,
 * Gerät/Browser/Land und A/B-Varianten. Alle Zahlen kommen fertig aus lib/website-analytics.ts.
 */
import { useState, type CSSProperties } from "react";
import { Icon, type IconName } from "@/app/icons";
import { fmtRate } from "@/lib/website-funnel";
import {
  channels, delta, eventsByStage, fmtTile, pageLabel, ranked, rateVital, scrollByStage, weekHour,
  type AnalyticsCalc, type Hint, type Tile,
} from "@/lib/website-analytics";
import { Count } from "./trichter";

const nf = (x: number) => Math.round(x).toLocaleString("de-DE");
const HINT_ICON: Record<Hint["id"], IconName> = { abbruch: "trend-runter", quelle: "kaeufer", langsam: "tempo" };
const DAYS = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
const BR_L: Record<string, string> = { chrome: "Chrome", safari: "Safari", firefox: "Firefox", edge: "Edge", samsung: "Samsung", opera: "Opera", andere: "Andere", "-": "unbekannt" };
const DV_L: Record<string, string> = { desktop: "Desktop", mobil: "Mobil", "-": "unbekannt" };
const C_COLOR: Record<string, string> = { US: "#5b8fdb", UK: "#b38331", FR: "#2fa898" };

function Card({ title, sum, children, wide, span2, fill2 }: { title: string; sum?: string; children: React.ReactNode; wide?: boolean; span2?: boolean; fill2?: boolean }) {
  return (
    <section className={`wa-card${wide ? " wide" : ""}${span2 ? " span2" : ""}${fill2 ? " fill2" : ""}`}>
      <header className="wa-h"><h2>{title}</h2>{sum && <span className="wa-sum">{sum}</span>}</header>
      {children}
    </section>
  );
}
const None = () => <p className="wa-empty">noch keine Messung</p>;

function Bars({ rows, color }: { rows: { k: string; label: string; n: number; sub?: string }[]; color?: (k: string) => string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  const tot = rows.reduce((a, r) => a + r.n, 0);
  if (!tot) return <None />;
  return (
    <ul className="an-bars">
      {rows.map((r) => (
        <li key={r.k} title={`${r.label}: ${nf(r.n)} (${fmtRate(r.n / tot)})`}>
          <span className="an-bl">{color && <i style={{ background: color(r.k) }} />}<b>{r.label}</b>{r.sub && <em>{r.sub}</em>}</span>
          <span className="wa-bb"><i style={{ width: `${(r.n / max) * 100}%` }} /></span>
          <span className="an-bv">{nf(r.n)}</span>
        </li>
      ))}
    </ul>
  );
}

function TileBox({ t, on, onClick, i }: { t: Tile; on: boolean; onClick: () => void; i: number }) {
  const d = delta(t);
  const fmt = (x: number) => fmtTile(x, t.fmt);
  return (
    <button type="button" className={`an-tile${on ? " on" : ""}${t.rating ? ` r-${t.rating}` : ""}`} aria-pressed={on} onClick={onClick}
      style={{ "--i": i } as CSSProperties} title={t.info}>
      <span className="an-tl">{t.label}</span>
      <b className="an-tv">{t.value === null ? "–" : <Count n={t.value} format={fmt} delay={i * 50} />}</b>
      <span className={`an-td ${d ? d.tone : "none"}`}>
        {d ? <>{d.dir === "up" ? "▲" : d.dir === "down" ? "▼" : "■"} {d.text}</> : "kein Vergleich"}
      </span>
    </button>
  );
}

export type AnalyseProps = { hints: Hint[]; tiles: Tile[]; cur: AnalyticsCalc; periodLabel: string };

export function Analyse({ hints, tiles, cur, periodLabel }: AnalyseProps) {
  const [sel, setSel] = useState<string | null>(null);
  const st = tiles.find((t) => t.id === sel) ?? null;
  const ch = channels(cur);
  const wh = weekHour(cur.wh);
  const sc = scrollByStage(cur.sc);
  const ev = eventsByStage(cur.ev);
  const vi = cur.vi ?? [];
  const ab = cur.ab ?? [];
  return (
    <div className="an">
      <section className="an-hints" aria-label="JARVIS-Hinweise">
        {hints.map((h) => (
          <article key={h.id} className={`an-hint t-${h.tone}`}>
            <span className="an-hi" aria-hidden><Icon name={HINT_ICON[h.id]} size={18} /></span>
            <div><b>{h.title}</b><p>{h.grund}</p></div>
          </article>
        ))}
      </section>

      <section className="an-panel" aria-label="Kennzahlen">
        <header className="an-ph"><h2>Kennzahlen</h2><span>{periodLabel} · ▲▼ zum Vorzeitraum</span></header>
        <div className="an-tiles">
          {tiles.map((t, i) => <TileBox key={t.id} t={t} i={i} on={sel === t.id} onClick={() => setSel(sel === t.id ? null : t.id)} />)}
        </div>
        {st && (
          <div className="an-det" aria-live="polite">
            <b>{st.label}</b>
            <span>jetzt {fmtTile(st.value, st.fmt)} · vorher {fmtTile(st.prev, st.fmt)}{st.rating ? ` · ${st.rating}` : ""}</span>
            <em>{st.info}</em>
            <button type="button" className="an-x" aria-label="Schließen" onClick={() => setSel(null)}><Icon name="schliessen" size={14} /></button>
          </div>
        )}
      </section>

      <div className="wa-grid an-grid">
        <Card title="Kanäle" sum={ch.length ? `${nf(ch.reduce((a, c) => a + c.n, 0))} Besucher` : undefined} wide>
          {ch.length ? (
            <ul className="an-ch">
              <li className="an-chh" aria-hidden><span>Quelle</span><span>Besucher</span><span>→ Tarif</span><span>Checkout</span></li>
              {ch.slice(0, 10).map((c, i) => (
                <li key={i}>
                  <span className="an-chl"><b>{c.label}</b>{c.sub && <em>{c.sub}</em>}</span>
                  <span>{nf(c.n)}</span><span className="an-g">{fmtRate(c.tarif)}</span><span>{nf(c.checkout)}</span>
                </li>
              ))}
            </ul>
          ) : <None />}
        </Card>
        <Card title="Einstieg"><Bars rows={ranked(cur.en, pageLabel).slice(0, 6)} /></Card>
        <Card title="Ausstieg"><Bars rows={ranked(cur.ex, pageLabel).slice(0, 6)} /></Card>
        <Card title="Scrolltiefe" fill2>
          {sc.length ? (
            <ul className="an-sc">
              {sc.map((r) => (
                <li key={r.st}>
                  <span className="an-scl">{r.label}<em>{nf(r.n)}</em></span>
                  <span className="an-scb">{r.at.map((x, i) => <i key={i} title={`≥ ${[25, 50, 75, 100][i]} %: ${fmtRate(x)}`} style={{ "--a": 0.12 + 0.88 * x } as CSSProperties}>{Math.round(x * 100)}</i>)}</span>
                </li>
              ))}
              <li className="an-scf" aria-hidden><span /><span className="an-scb">{[25, 50, 75, 100].map((p) => <em key={p}>≥{p}</em>)}</span></li>
            </ul>
          ) : <None />}
        </Card>
        <Card title="Wochentag × Stunde" sum={wh.total ? `${nf(wh.total)} Aufrufe · deutsche Zeit` : undefined} wide>
          {wh.total ? (
            <div className="an-wh" role="img" aria-label="Aufrufe je Wochentag und Stunde">
              <span />{Array.from({ length: 24 }, (_, h) => <span key={h} className="an-whx">{h % 3 === 0 ? h : ""}</span>)}
              {wh.m.map((row, d) => [
                <span key={`d${d}`} className="an-why">{DAYS[d]}</span>,
                ...row.map((c, h) => <i key={`${d}-${h}`} className={c ? undefined : "z"} title={`${DAYS[d]} ${h}–${h + 1} Uhr: ${nf(c)} Aufrufe`}
                  style={{ "--a": c ? 0.15 + 0.85 * (c / wh.max) : 0 } as CSSProperties} />),
              ])}
            </div>
          ) : <None />}
        </Card>
        <Card title="CTA · Formular · Video">
          {ev.length ? (
            <ul className="an-ev">
              <li className="an-chh" aria-hidden><span>Seite</span><span>CTA</span><span>Formular</span><span>Video</span></li>
              {ev.map((r) => (
                <li key={r.st}><b>{r.label}</b><span>{nf(r.cta)}</span>
                  <span title="abgeschickt / begonnen">{nf(r.fd)}/{nf(r.fs)}</span><span title="zu Ende / gestartet">{nf(r.vd)}/{nf(r.vs)}</span></li>
              ))}
            </ul>
          ) : <None />}
        </Card>
        <Card title="Gerät"><Bars rows={ranked(cur.dv, (k) => DV_L[k] ?? k)} /></Card>
        <Card title="Browser"><Bars rows={ranked(cur.br, (k) => BR_L[k] ?? k)} /></Card>
        <Card title="Land"><Bars rows={ranked(cur.co, (k) => (k === "XX" ? "unbekannt" : k))} color={(k) => C_COLOR[k] ?? "#7d8ca3"} /></Card>
        <Card title="Web Vitals je Seite" sum="75. Perzentil" span2>
          {vi.length ? (
            <ul className="an-vi">
              <li className="an-chh" aria-hidden><span>Seite</span><span>LCP</span><span>INP</span><span>CLS</span></li>
              {vi.slice(0, 8).map((v) => (
                <li key={v.p}><span className="an-chl"><b>{pageLabel(v.p)}</b><em>{nf(v.n)} Besuche</em></span>
                  <span className={`r-${rateVital("lcp", v.lcp) ?? "x"}`}>{fmtTile(v.lcp, "ms")}</span>
                  <span className={`r-${rateVital("inp", v.inp) ?? "x"}`}>{fmtTile(v.inp, "ms")}</span>
                  <span className={`r-${rateVital("cls", v.cls) ?? "x"}`}>{fmtTile(v.cls, "cls")}</span></li>
              ))}
            </ul>
          ) : <None />}
        </Card>
        <Card title="A/B-Varianten" sum="Landingpages" wide>
          {ab.length ? (
            <ul className="an-ab">
              <li className="an-chh" aria-hidden><span>Variante</span><span>Aufrufe</span><span>CTA</span><span>Probe</span><span>Checkout</span><span>Kauf</span></li>
              {ab.map((x) => (
                <li key={`${x.p}|${x.v}`}><span className="an-chl"><b>{x.p} · {x.v}</b><em>{x.st}</em></span>
                  <span>{nf(x.views)}</span><span title={`${nf(x.cta)} Klicks`}>{fmtRate(x.views ? x.cta / x.views : null)}</span>
                  <span>{nf(x.req)}</span><span>{nf(x.co)}</span><span className={x.buy ? "an-g" : undefined}>{nf(x.buy)}</span></li>
              ))}
            </ul>
          ) : <None />}
        </Card>
      </div>
    </div>
  );
}

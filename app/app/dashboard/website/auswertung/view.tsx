/**
 * Website-Auswertung – reine Darstellung (Server-Komponente). Alle Zahlen kommen fertig aus lib/website-stats.ts
 * (buildView). Grafiken als HTML/SVG ohne Zusatzpaket, Hover über title, Filter als Chips (Links).
 */
import type { CSSProperties, ReactNode } from "react";
import Link from "next/link";
import { Fold } from "../../fold";
import { Icon, type IconName } from "@/app/icons";
import { density, elLabel, pct, type Device, type Source, type View } from "@/lib/website-stats";

/** Länderfarben für die dunkle Fläche (geprüft: Helligkeit, Farbsehschwäche, Kontrast). */
export const WA_COUNTRY: Record<string, string> = { US: "#5b8fdb", UK: "#b38331", FR: "#2fa898" };
const OTHER = "#7d8ca3";
const VAR_A = "#8a7be6", VAR_B = "#d06a9c";

const nf = (n: number) => n.toLocaleString("de-DE");
const dm = (d: string) => `${d.slice(8, 10)}.${d.slice(5, 7)}.`;

export type Chip = { label: string; href: string; on: boolean };

function Chips({ label, items }: { label: string; items: Chip[] }) {
  return (
    <nav className="wa-chips" aria-label={label}>
      <span className="wa-cl">{label}</span>
      {items.map((c) => <Link key={c.href + c.label} href={c.href} scroll={false} className={c.on ? "on" : undefined} aria-current={c.on ? "true" : undefined}>{c.label}</Link>)}
    </nav>
  );
}

function Card({ title, sum, children, wide }: { title: string; sum?: ReactNode; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`wa-card${wide ? " wide" : ""}`}>
      <header className="wa-h"><h2>{title}</h2>{sum !== undefined && <span className="wa-sum">{sum}</span>}</header>
      {children}
    </section>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="wa-empty">{text}</p>;
}

/** Aufrufe je Tag, gestapelt nach Land. */
function Daily({ v }: { v: View }) {
  const max = Math.max(1, ...v.perDay.map((d) => d.total));
  const cs = v.countries;
  const labelEvery = Math.max(1, Math.ceil(v.perDay.length / 5));
  return (
    <>
      {cs.length > 1 && (
        <div className="wa-legend">{cs.map((c) => <span key={c} style={{ "--c": WA_COUNTRY[c] ?? OTHER } as CSSProperties}><i />{c}</span>)}</div>
      )}
      <div className="wa-cols" style={{ "--n": v.perDay.length } as CSSProperties}>
        <span className="wa-ymax">{nf(max)}</span>
        {v.perDay.map((d, i) => (
          <div key={d.day} className="wa-col" title={`${dm(d.day)}: ${nf(d.total)} Aufrufe${cs.length > 1 ? " · " + cs.map((c) => `${c} ${nf(d.byCountry[c] ?? 0)}`).join(" · ") : ""}`}>
            <div className="wa-stack" style={{ height: `${(d.total / max) * 100}%` }}>
              {cs.map((c) => (d.byCountry[c] ?? 0) > 0 && <i key={c} style={{ flexGrow: d.byCountry[c], background: WA_COUNTRY[c] ?? OTHER }} />)}
            </div>
            <span className="wa-x">{i % labelEvery === 0 || i === v.perDay.length - 1 ? dm(d.day) : ""}</span>
          </div>
        ))}
      </div>
    </>
  );
}

/** Waagrechte Balken mit Wert und Anteil. */
function Bars({ rows, total, color = "var(--cy)" }: { rows: { key: string; label: string; icon?: IconName; n: number; tip?: string }[]; total: number; color?: string }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <ul className="wa-bars">
      {rows.map((r) => (
        <li key={r.key} title={r.tip ?? `${r.label}: ${nf(r.n)} (${pct(r.n, total)})`}>
          <span className="wa-bl">{r.icon && <Icon name={r.icon} size={15} />}{r.label}</span>
          <span className="wa-bb"><i style={{ width: `${(r.n / max) * 100}%`, background: color }} /></span>
          <b>{nf(r.n)}</b><em>{pct(r.n, total, 0)}</em>
        </li>
      ))}
    </ul>
  );
}

const SRC: { k: Source; label: string; icon: IconName }[] = [
  { k: "mail", label: "Mail", icon: "mail" }, { k: "direkt", label: "Direkt", icon: "pfeil" },
  { k: "suche", label: "Suche", icon: "suche" }, { k: "andere", label: "Andere", icon: "land" },
];

type Step = { label: string; n: number; icon: IconName; tip?: string };

/** Trichter mit Quote je Schritt (Balken relativ zum ersten Schritt). */
function Funnel({ steps }: { steps: Step[] }) {
  const max = Math.max(1, ...steps.map((s) => s.n));
  return (
    <ol className="wa-fun">
      {steps.map((s, i) => (
        <li key={s.label} title={s.tip}>
          {i > 0 && <span className="wa-rate" title={`${s.label} je ${steps[i - 1].label}`}><Icon name="pfeil-runter" size={13} />{pct(s.n, steps[i - 1].n)}</span>}
          <div className="wa-fr">
            <span className="wa-fl"><Icon name={s.icon} size={15} />{s.label}</span>
            <span className="wa-fb"><i style={{ width: `${Math.max(s.n ? 2 : 0, (s.n / max) * 100)}%` }} /></span>
            <b>{nf(s.n)}</b>
          </div>
        </li>
      ))}
    </ol>
  );
}

/** Kauf-Trichter wie die JARVIS-Linie: Landingpage → Tarif → Stripe → Danke (Besucher eindeutig je Tag). */
export function buyFunnel(f: View["funnel"]): Step[] {
  return [
    { label: "Landingpage", n: f.land, icon: "website", tip: "eindeutige Besucher der Landingpages (je Tag, Summe der Tage)" },
    { label: "Tarif", n: f.tarif, icon: "tarif", tip: `eindeutige Besucher der Tarifseite (${nf(f.tarifViews)} Aufrufe gesamt)` },
    { label: "Stripe", n: f.checkout, icon: "karte", tip: "gestartete Stripe-Checkouts (serverseitig)" },
    { label: "Danke", n: f.buy, icon: "ok-kreis", tip: "abgeschlossene Käufe (Stripe-Webhook)" },
  ];
}

/** Probe-Weg (nicht mehr in der JARVIS-Linie): Aufrufe gesamt → Probe-Klick → Probe-Anfrage. */
function probeFunnel(f: View["funnel"]): Step[] {
  return [
    { label: "Aufrufe gesamt", n: f.views, icon: "land" },
    { label: "Probe-Klick", n: f.cta, icon: "antippen" },
    { label: "Probe-Anfrage", n: f.req, icon: "proben" },
  ];
}

/** Mail-Klicks je Land und Betreff-Variante (A/B) mit Klickquote je gesendeter Mail. */
function MailAB({ v }: { v: View }) {
  if (!v.mail.length) return <Empty text="Noch keine Klicks aus Mails" />;
  const max = Math.max(1, ...v.mail.flatMap((r) => [r.A, r.B]));
  return (
    <>
      <div className="wa-legend"><span style={{ "--c": VAR_A } as CSSProperties}><i />Betreff A</span><span style={{ "--c": VAR_B } as CSSProperties}><i />Betreff B</span></div>
      <div className="wa-ab">
        {v.mail.map((r) => (
          <div key={r.country} className="wa-abr">
            <span className="wa-abc"><i style={{ background: WA_COUNTRY[r.country] ?? OTHER }} />{r.country}</span>
            {(["A", "B"] as const).map((k) => {
              const n = r[k], sent = k === "A" ? r.sentA : r.sentB;
              return (
                <div key={k} className="wa-abl" title={`${r.country} Betreff ${k}: ${nf(n)} Klicks bei ${nf(sent)} Mails`}>
                  <span className="wa-abk">{k}</span>
                  <span className="wa-bb"><i style={{ width: `${(n / max) * 100}%`, background: k === "A" ? VAR_A : VAR_B }} /></span>
                  <b>{nf(n)}</b><em>{pct(n, sent)}</em>
                </div>
              );
            })}
          </div>
        ))}
      </div>
      <p className="wa-note">Klicks je gesendeter Mail · ohne Öffnungsmessung</p>
    </>
  );
}

/** Gerät als geteilter Balken. */
function Devices({ v }: { v: View }) {
  const t = v.devices.desktop + v.devices.mobil;
  if (!t) return <Empty text="Noch keine Messung" />;
  const d = (v.devices.desktop / t) * 100;
  return (
    <div className="wa-split" title={`Desktop ${nf(v.devices.desktop)} · Mobil ${nf(v.devices.mobil)}`}>
      <div className="wa-sb"><i style={{ width: `${d}%` }} /><i style={{ width: `${100 - d}%` }} /></div>
      <div className="wa-sl"><span><b>{pct(v.devices.desktop, t, 0)}</b> Desktop · {nf(v.devices.desktop)}</span><span><b>{pct(v.devices.mobil, t, 0)}</b> Mobil · {nf(v.devices.mobil)}</span></div>
    </div>
  );
}

/** Scrolltiefe als Treppe: Anteil der Aufrufe, die mindestens 25/50/75/100 % sahen. */
function Depth({ v }: { v: View }) {
  if (!v.tracked) return <Empty text="Noch keine Messung" />;
  return (
    <div className="wa-steps">
      {v.depth.map((d) => (
        <div key={d.at} className="wa-step" title={`${nf(d.n)} von ${nf(v.tracked)} Aufrufen sahen mindestens ${d.at} %`}>
          <b>{pct(d.n, v.tracked, 0)}</b>
          <span className="wa-sc"><i style={{ height: `${d.share * 100}%` }} /></span>
          <em>{d.at} %</em>
        </div>
      ))}
    </div>
  );
}

const DWELL_L: Record<string, string> = { "0-10": "< 10 s", "10-30": "10–30 s", "30-60": "30–60 s", "60-180": "1–3 min", "180+": "> 3 min" };

function DwellBars({ v }: { v: View }) {
  const t = v.dwell.reduce((a, d) => a + d.n, 0);
  if (!t) return <Empty text="Noch keine Messung" />;
  return <Bars rows={v.dwell.map((d) => ({ key: d.k, label: DWELL_L[d.k], n: d.n }))} total={t} color="var(--cy)" />;
}

/**
 * Heatmap: schematische Seite im Hochformat, Wärmepunkte aus der Klickdichte (2-%-Raster, Nachbarn gewichtet),
 * Marken für die Scrolltiefe am Rand. Kein Screenshot der Seite nötig.
 */
function Heat({ v, device }: { v: View; device: Device }) {
  const W = device === "mobil" ? 56 : 100, H = 150;
  const pts = density(v.heat);
  const depthAt = Object.fromEntries(v.depth.map((d) => [d.at, d.share]));
  return (
    <div className="wa-heat">
      <svg viewBox={`-14 -2 ${W + 16} ${H + 4}`} className={`wa-page ${device}`} role="img" aria-label={`Heatmap ${device}: ${nf(v.heatTotal)} Klicks`}>
        <defs>
          <radialGradient id="wa-hot">
            <stop offset="0" stopColor="#fff6dc" stopOpacity="1" />
            <stop offset=".35" stopColor="#ffcf7a" stopOpacity=".85" />
            <stop offset="1" stopColor="#ff7a3d" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="wa-warm">
            <stop offset="0" stopColor="#7fe3ff" stopOpacity=".9" />
            <stop offset="1" stopColor="#5fd4ff" stopOpacity="0" />
          </radialGradient>
          <clipPath id="wa-clip"><rect x="0" y="0" width={W} height={H} rx="2" /></clipPath>
        </defs>
        <rect x="0" y="0" width={W} height={H} rx="2" className="wa-pg" />
        {/* schematische Abschnitte: Kopf, Film, Beispiel-Leads, Formular, FAQ */}
        <g className="wa-sk" clipPath="url(#wa-clip)">
          <rect x="0" y="0" width={W} height={H * 0.035} />
          <rect x={W * 0.08} y={H * 0.07} width={W * 0.6} height={H * 0.025} rx=".6" />
          <rect x={W * 0.08} y={H * 0.11} width={W * 0.45} height={H * 0.015} rx=".6" />
          <rect x={W * 0.08} y={H * 0.145} width={W * 0.3} height={H * 0.02} rx="1.5" className="wa-skb" />
          <rect x={W * 0.08} y={H * 0.22} width={W * 0.84} height={H * 0.14} rx="1" />
          {[0.42, 0.5, 0.58].map((y) => <rect key={y} x={W * 0.08} y={H * y} width={W * 0.84} height={H * 0.06} rx="1" />)}
          <rect x={W * 0.08} y={H * 0.7} width={W * 0.84} height={H * 0.12} rx="1" />
          {[0.86, 0.89, 0.92, 0.95].map((y) => <rect key={y} x={W * 0.08} y={H * y} width={W * 0.84} height={H * 0.018} rx=".6" />)}
        </g>
        <g clipPath="url(#wa-clip)">
          {pts.map((p) => (
            <circle key={`${p.x}|${p.y}`} cx={((p.x + 1) / 100) * W} cy={((p.y + 1) / 100) * H} r={2.4 + 4.2 * p.w}
              fill={p.w > 0.45 ? "url(#wa-hot)" : "url(#wa-warm)"} opacity={0.35 + 0.65 * p.w}>
              <title>{`${nf(p.n)} Klicks bei ${p.x}–${p.x + 2} % Breite, ${p.y}–${p.y + 2} % Höhe`}</title>
            </circle>
          ))}
        </g>
        {[25, 50, 75].map((d) => (
          <g key={d} className="wa-dm">
            <line x1="-2" x2={W} y1={(d / 100) * H} y2={(d / 100) * H} />
            <text x="-3" y={(d / 100) * H + 1.4} textAnchor="end" fontSize="3.6">{v.tracked ? `${Math.round((depthAt[d] ?? 0) * 100)}%` : `${d}%`}</text>
          </g>
        ))}
      </svg>
      <div className="wa-hl"><span>wenig</span><i /><span>viel</span></div>
      <p className="wa-note">Linien: Anteil der Aufrufe, die so weit gescrollt haben</p>
    </div>
  );
}

function Targets({ v }: { v: View }) {
  if (!v.targets.length) return <Empty text="Noch keine Klicks" />;
  return (
    <ol className="wa-tg">
      {v.targets.map((t, i) => (
        <li key={`${t.el}|${t.label}`} title={`${elLabel(t.el)}${t.label ? `: ${t.label}` : ""} · ${nf(t.n)} Klicks`}>
          <span className="wa-tn">{i + 1}</span>
          <span className="wa-tt"><b>{t.label || elLabel(t.el)}</b>{t.label && <em>{elLabel(t.el)}</em>}</span>
          <span className="wa-bb"><i style={{ width: `${t.share * 100}%` }} /></span>
          <span className="wa-tv">{nf(t.n)}<small>{Math.round(t.share * 100)}&nbsp;%</small></span>
        </li>
      ))}
    </ol>
  );
}

export type AuswertungProps = {
  v: View;
  stand: string;
  chips: { period: Chip[]; country: Chip[]; page: Chip[]; device: Chip[] };
  device: Device;
  pageLabel: string;
};

export function Auswertung({ v, stand, chips, device, pageLabel }: AuswertungProps) {
  const f = v.funnel;
  const mailViews = v.sources.mail;
  const kpis: { label: string; n: number; sub: string; icon: IconName; tip?: string }[] = [
    { label: "Landingpage", n: f.land, sub: "Besucher eindeutig", icon: "website", tip: "eindeutig je Tag, ohne Cookies – Gerätewechsel zählt doppelt, Inhaber ausgeblendet" },
    { label: "Aufrufe gesamt", n: f.views, sub: `${v.days.length} Tage`, icon: "land" },
    { label: "aus Mails", n: mailViews, sub: v.tracked ? pct(mailViews, v.tracked, 0) : "–", icon: "mail" },
    { label: "Probe-Anfragen", n: f.req, sub: `${nf(f.cta)} Klicks`, icon: "proben" },
    { label: "Tarif", n: f.tarif, sub: pct(f.tarif, f.land), icon: "tarif" },
    { label: "Danke", n: f.buy, sub: `${nf(f.checkout)} bei Stripe`, icon: "ok-kreis" },
  ];
  return (
    <div className="wa">
      <div className="wa-head">
        <h1>Website</h1>
        <span className="wa-at">Auswertung · Stand {stand}</span>
      </div>
      <div className="wa-filter">
        <Chips label="Zeitraum" items={chips.period} />
        <Chips label="Land" items={chips.country} />
        {chips.page.length > 0 && <Chips label="Seite" items={chips.page} />}
      </div>
      <div className="wa-kpis">
        {kpis.map((k) => (
          <div key={k.label} className="wa-kpi" title={k.tip}><span className="wa-ki" aria-hidden><Icon name={k.icon} size={18} /></span><b>{nf(k.n)}</b><span>{k.label}</span><em>{k.sub}</em></div>
        ))}
      </div>
      <div className="wa-grid">
        <Card title="Aufrufe je Tag" sum={nf(f.views)} wide><Daily v={v} /></Card>
        <Card title="Trichter" sum={f.land ? `Danke je Besucher ${pct(f.buy, f.land, 2)}` : undefined}><Funnel steps={buyFunnel(f)} /></Card>
        <Card title="Probe" sum={f.views ? `Anfrage je Aufruf ${pct(f.req, f.views, 1)}` : undefined}><Funnel steps={probeFunnel(f)} /></Card>
        <Card title="Herkunft" sum={v.tracked ? `${nf(v.tracked)} gemessen` : undefined}>
          {v.tracked ? <Bars rows={SRC.map((s) => ({ key: s.k, label: s.label, icon: s.icon, n: v.sources[s.k] }))} total={v.tracked} /> : <Empty text="Noch keine Messung" />}
        </Card>
        <Card title="Mail-Klicks je Betreff"><MailAB v={v} /></Card>
        <Card title="Gerät"><Devices v={v} /></Card>
        <Card title="Scrolltiefe"><Depth v={v} /></Card>
        <Card title="Verweildauer"><DwellBars v={v} /></Card>
      </div>
      <section className="wa-card wa-hm">
        <header className="wa-h"><h2>Heatmap</h2><span className="wa-sum">{pageLabel} · {nf(v.heatTotal)} Klicks</span></header>
        <Chips label="Gerät" items={chips.device} />
        <div className="wa-hmg">
          {v.heatTotal ? <Heat v={v} device={device} /> : <Empty text="Noch keine Klicks auf diesem Gerät" />}
          <Fold id="website-klickziele" title="Top-Klickziele" sum={v.targets.length ? `${v.targets.length}` : ""} className="wa-tgf" head="wa-h">
            <Targets v={v} />
          </Fold>
        </div>
      </section>
      <p className="wa-priv"><Icon name="schloss" size={14} /> anonym · ohne Cookies · IP nicht gespeichert · Besucher eindeutig je Tag (Gerätewechsel zählt doppelt) · Inhaber und Vorschau ausgeblendet · keine Öffnungsmessung</p>
    </div>
  );
}

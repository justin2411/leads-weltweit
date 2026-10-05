/**
 * A/B je Schritt auf /dashboard/gehirn (Inhaber 04.10.2026: „das gehirn soll jeden einzelnen unserer steps a/b
 * splittesten können, damit es mit den quoten immer genau schauen kann wo es KPIs weiter optimieren kann“).
 * Trichter aller Stationen mit Quote (30 Tage, Webagenturen US/UK/FR), Engpass hervorgehoben (größter Abfall gegenüber
 * Richtwert), je Station die Tests mit Varianten-Balken (Quote, n, Sicherheit), Gewinner-Abzeichen. Wenig Text:
 * Titel ≤ 60, Grund ≤ 160, Details per Hover/Tippen (tips.tsx). Reines Server-Rendering, Animation nur per CSS.
 */
import type { CSSProperties } from "react";
import { compact } from "@/lib/dashboard-logic";
import { pct, type FunnelStation, type TestView } from "@/lib/ab";
import type { AbData } from "@/lib/ab-data";
import { Icon, type IconName } from "@/app/icons";
import { Fold } from "./fold";
import { Tip } from "./tips";
import { AbPeek } from "./ab-peek";
import { AB_PEEK_CSS } from "./ab-peek-css";

type V = CSSProperties & Record<`--${string}`, string | number>;

const ICON: Record<string, IconName> = {
  mail: "versand", nachfass: "nachfass", antwort: "antwort", landing: "start-seite", probe: "proben",
  probe_nachfrage: "frage", tarif: "tarif", checkout: "kunde",
};
const STATUS: Record<string, string> = { entwurf: "Entwurf", laeuft: "läuft", gewonnen: "entschieden", gestoppt: "gestoppt" };
const short = (s: string | null | undefined, n: number) => {
  const t = String(s ?? "").replace(/\s+/g, " ").trim();
  return t.length > n ? `${t.slice(0, n - 1).trimEnd()}…` : t;
};

/** Balkenlänge der Station: Quote im Verhältnis zum doppelten Richtwert (Richtwert = Mitte), 0–100 %. */
const fill = (s: FunnelStation) => Math.max(s.n > 0 ? 2 : 0, Math.min(100, Math.round((50 * s.rate) / s.richtwert)));

function Station({ s, i, tests }: { s: FunnelStation; i: number; tests: TestView[] }) {
  return (
    <li className={`ab-st${s.engpass ? " eng" : ""}${s.enough ? "" : " few"}`} style={{ "--d": `${i * 70}ms` } as V}>
      <div className="ab-row">
        <span className="ab-ic"><Icon name={ICON[s.key] ?? "statistik"} size={15} /></span>
        <span className="ab-nm"><b>{s.titel}</b><small>{s.von} → {s.zu}</small></span>
        <Tip className="ab-bar" label={`${s.titel}: ${pct(s.rate)} (${s.k} von ${s.n}), Richtwert ${pct(s.richtwert, 0)}`}
          tip={<div className="gh-pop"><div className="gh-pop-h"><b>{s.titel}</b><span>{s.engpass ? "Engpass" : s.enough ? "" : "zu wenig Daten"}</span></div>
            <p>{compact(s.k)} {s.zu} von {compact(s.n)} {s.von}</p><p className="gh-pop-m">Richtwert {pct(s.richtwert, 0)} (Orientierung)</p></div>}>
          <i style={{ "--w": `${fill(s)}%` } as V} /><em aria-hidden />
        </Tip>
        <b className="ab-q">{s.n ? pct(s.rate) : "–"}</b>
        <span className="ab-n">{compact(s.n)}</span>
        <span className="ab-eng">{s.engpass && <span className="pill t-gold">Engpass</span>}</span>
      </div>
      {tests.length > 0 && <div className="ab-tests">{tests.map((t) => <TestCard key={t.id} t={t} />)}</div>}
    </li>
  );
}

function TestCard({ t }: { t: TestView }) {
  const max = Math.max(...t.variants.map((v) => v.rate), 0.0001);
  const sure = t.eval?.sicherheit ?? null;
  const lead = t.status === "gewonnen" ? t.gewinner : t.eval?.leader ?? null;
  const min = Math.min(...t.variants.map((v) => v.n));
  const peek = { id: t.id, step: t.step, stepTitel: t.stepTitel, country: t.country, segment: t.segment, element: t.element,
    status: t.status, gestartet: t.gestartet, variants: t.variants.map((v) => ({ key: v.key, n: v.n, voll: v.voll, pageKey: v.pageKey ?? null })) };
  return (
    <AbPeek t={peek} label={`${t.stepTitel} ${t.country}: Vorschau A und B`}>
    <article className={`ab-card s-${t.status}`}>
      <header>
        <b title={t.hypothese}>{t.stepTitel}</b>
        <span className="ab-cc">{t.country}</span>
        {t.element !== t.stepTitel.toLowerCase() && <span className="ab-el">{t.element}</span>}
        {t.status === "gewonnen" && t.gewinner
          ? <span className="ab-win" title={t.grund ?? undefined}><Icon name="stern" size={12} /> {t.gewinner}</span>
          : <span className={`ab-stt s-${t.status}`}>{STATUS[t.status] ?? t.status}</span>}
      </header>
      <p className="ab-hyp" title={t.hypothese}>{short(t.hypothese, 160)}</p>
      <div className="ab-vs">
        {t.variants.map((v) => (
          <div key={v.key} className={`ab-v${lead === v.key ? " lead" : ""}`} title={`Variante ${v.key}: ${pct(v.rate)} (${v.k} von ${v.n})`}>
            <span className="ab-k">{v.key}</span>
            <span className="ab-track"><i style={{ "--w": `${v.n ? Math.max(3, Math.round((100 * v.rate) / max)) : 0}%` } as V} /></span>
            <b>{v.n ? pct(v.rate) : "–"}</b>
            <small>n {compact(v.n)}</small>
          </div>
        ))}
      </div>
      <footer>
        {sure !== null ? (
          <span className="ab-sure" title="Sicherheit, dass die führende Variante wirklich besser ist (Gewinner ab 95 %)">
            <span className="ab-meter"><i style={{ "--w": `${Math.round(sure * 100)}%` } as V} /><em /></span>
            <b>{Math.round(sure * 100)} %</b>
          </span>
        ) : <span className="ab-sure muted">{t.status === "entwurf" ? "noch nicht gestartet" : short(t.grund, 60) || "beendet"}</span>}
        {t.status === "laeuft" && <span className="ab-min" title={t.eval?.grund}>{min < 1 ? "wartet auf Daten" : `${compact(min)} je Variante`}</span>}
      </footer>
    </article>
    </AbPeek>
  );
}

/** Kompakte A/B-Anzeige für die Gehirn-Bühne (Kachel links): laufende Tests als geteilte Balken. */
export function AbMini({ data }: { data: AbData | null }) {
  const run = (data?.tests ?? []).filter((t) => t.status === "laeuft");
  if (!run.length) return <span className="gh-none" title="kein laufender Test"><span className="gh-seg ghost" /></span>;
  return (
    <>
      {run.slice(0, 4).map((t) => {
        const [a, b] = t.variants;
        const sum = a.rate + b.rate;
        const wa = sum > 0 ? Math.min(82, Math.max(18, Math.round((100 * a.rate) / sum))) : 50;
        const lead = t.eval?.leader;
        return (
          <div key={t.id} className="gh-ab">
            <span className="gh-ab-s">{t.stepTitel} {t.country} · {Math.min(a.n, b.n) > 0 && t.eval ? `${Math.round(t.eval.sicherheit * 100)} % sicher` : "wartet auf Daten"}</span>
            <a className="gh-split ab-mini" href="#ab" aria-label={`${t.stepTitel} ${t.country}: A ${pct(a.rate)}, B ${pct(b.rate)}`}>
              <span className={`gh-seg${lead === "A" && a.n ? " lead" : ""}`} style={{ width: `${wa}%` }}><b>A</b><em>{a.n ? pct(a.rate) : "–"}</em></span>
              <span className={`gh-seg${lead === "B" && b.n ? " lead" : ""}`} style={{ width: `${100 - wa}%` }}><b>B</b><em>{b.n ? pct(b.rate) : "–"}</em></span>
            </a>
          </div>
        );
      })}
      {run.length > 4 && <span className="gh-ab-s">+{run.length - 4} weitere</span>}
    </>
  );
}

export function AbSection({ data }: { data: AbData | null }) {
  const tests = data?.tests ?? [];
  const funnel = data?.funnel ?? [];
  const running = tests.filter((t) => t.status === "laeuft").length;
  const eng = funnel.find((s) => s.engpass);
  const active = tests.filter((t) => t.status === "laeuft" || t.status === "entwurf");
  const done = tests.filter((t) => t.status === "gewonnen" || t.status === "gestoppt");
  return (
    <Fold name="ab" aliases={["ab-tests", "splittest"]} open={running > 0 || !!eng} title="A/B je Schritt" icon={<Icon name="weiche" size={16} />}
      summary={<>
        <span className="gh-sum-n"><b>{running}</b> laufen</span>
        {eng && <span className="pill t-gold" title="größter Abfall gegenüber Richtwert">Engpass: {eng.titel}</span>}
      </>}>
      {data?.error && <p className="muted"><Icon name="warnung" size={14} /> A/B-Daten nicht lesbar</p>}
      <div className="ab-head">
        <span>Trichter · {data?.days ?? 30} Tage · Webagenturen US/UK/FR</span>
        <span className="ab-legend"><i className="lg-q" />Quote <i className="lg-r" />Richtwert</span>
      </div>
      <ol className="ab-funnel">
        {funnel.map((s, i) => <Station key={s.key} s={s} i={i} tests={active.filter((t) => t.station === s.key)} />)}
      </ol>
      {done.length > 0 && (
        <details className="gh-old ab-done">
          <summary>beendet <b>{done.length}</b></summary>
          <div className="ab-tests">{done.map((t) => <TestCard key={t.id} t={t} />)}</div>
        </details>
      )}
    </Fold>
  );
}

export const GH_AB_CSS = AB_PEEK_CSS + `
.dash .ab-head{display:flex;justify-content:space-between;align-items:center;gap:8px 16px;flex-wrap:wrap;margin:0 0 10px;font-size:12px;color:var(--soft);letter-spacing:.04em}
.dash .ab-legend{display:inline-flex;align-items:center;gap:6px}
.dash .ab-legend i{display:inline-block;width:14px;height:6px;border-radius:3px;margin-left:8px}
.dash .ab-legend .lg-q{background:linear-gradient(90deg,#1b6fa0,var(--cy))}.dash .ab-legend .lg-r{width:2px;height:12px;border-radius:0;background:var(--gold)}
.dash .ab-funnel{list-style:none;margin:0;padding:0;display:grid;gap:8px;position:relative}
.dash .ab-funnel:before{content:"";position:absolute;left:17px;top:18px;bottom:18px;width:1px;background:linear-gradient(180deg,rgba(95,212,255,.5),rgba(95,212,255,.08))}
.dash .ab-st{position:relative;display:grid;gap:8px;min-width:0}
.dash .ab-row{display:grid;grid-template-columns:36px minmax(140px,1.1fr) minmax(120px,2fr) 64px 52px 86px;align-items:center;gap:10px;min-height:48px;padding:6px 10px 6px 0;
  border:1px solid var(--line);background:linear-gradient(90deg,rgba(9,24,48,.82),rgba(4,12,26,.5));min-width:0}
.dash .ab-st.few .ab-row{opacity:.72}
.dash .ab-st.eng .ab-row{border-color:rgba(226,198,143,.75);box-shadow:0 0 0 1px rgba(226,198,143,.25) inset,0 0 22px rgba(226,198,143,.16)}
.dash .ab-ic{position:relative;z-index:1;display:inline-grid;place-items:center;width:26px;height:26px;margin-left:5px;border:1px solid rgba(95,212,255,.45);border-radius:50%;background:#06142a;color:var(--cy)}
.dash .ab-st.eng .ab-ic{border-color:var(--gold);color:var(--gold2);box-shadow:0 0 12px rgba(226,198,143,.55)}
.dash .ab-nm{display:grid;min-width:0;line-height:1.25}
.dash .ab-nm b{font-family:var(--hud);font-size:13.5px;letter-spacing:.08em;text-transform:uppercase;color:#e6f6ff;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash .ab-nm small{font-size:11.5px;color:var(--soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash .gh button.ab-bar{position:relative;display:block;width:100%;height:12px;border:1px solid rgba(95,212,255,.25);background:rgba(2,8,18,.7);padding:0;overflow:hidden}
.dash .gh button.ab-bar i{position:absolute;left:0;top:0;bottom:0;width:var(--w);background:linear-gradient(90deg,#1b6fa0,var(--cy));box-shadow:0 0 10px rgba(95,212,255,.5);transform-origin:left}
.dash .ab-st.eng .gh-tipbtn.ab-bar i{background:linear-gradient(90deg,#8a6a34,var(--gold2));box-shadow:0 0 10px rgba(226,198,143,.55)}
.dash .gh button.ab-bar em{position:absolute;left:50%;top:-2px;bottom:-2px;width:2px;background:var(--gold);opacity:.85}
.dash .ab-q{font-family:var(--mono);font-size:15px;color:#fff;text-align:right}
.dash .ab-n{font-family:var(--mono);font-size:12px;color:var(--soft);text-align:right}
.dash .ab-eng{justify-self:start;display:flex}
.dash .ab-tests{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:8px;align-items:stretch;margin-left:36px;min-width:0}
.dash .ab-card{display:grid;grid-template-rows:auto auto 1fr auto;gap:8px;padding:10px 12px;border:1px solid rgba(95,212,255,.22);background:rgba(4,12,26,.62);min-width:0}
.dash .ab-card.s-laeuft{border-color:rgba(95,212,255,.45)}
.dash .ab-card.s-gewonnen{border-color:rgba(226,198,143,.6)}
.dash .ab-card.s-gestoppt,.dash .ab-card.s-entwurf{opacity:.8}
.dash .ab-card header{display:flex;align-items:center;gap:6px;min-width:0}
.dash .ab-card header>b{font-size:13px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.dash .ab-cc,.dash .ab-el{font-family:var(--mono);font-size:10.5px;padding:2px 6px;border:1px solid rgba(95,212,255,.3);color:var(--cy2);flex:none}
.dash .ab-el{border-color:rgba(139,166,201,.3);color:var(--soft)}
.dash .ab-stt,.dash .ab-win{margin-left:auto;flex:none;font-size:11px;letter-spacing:.06em;text-transform:uppercase}
.dash .ab-stt.s-laeuft{color:var(--cy)}.dash .ab-stt.s-entwurf,.dash .ab-stt.s-gestoppt{color:var(--soft)}
.dash .ab-win{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:99px;color:#1a1206;background:linear-gradient(90deg,#c9a86a,#f2dcae);font-weight:700}
.dash .ab-hyp{margin:0;font-size:12px;line-height:1.35;color:var(--soft);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dash .ab-vs{display:grid;gap:5px;align-content:start}
.dash .gh .ab-v{display:grid;grid-template-columns:16px minmax(0,1fr) 54px 48px;align-items:center;gap:8px;width:100%;text-align:left}
.dash .ab-k{font-family:var(--mono);font-weight:700;color:var(--cy2)}
.dash .ab-track{position:relative;height:10px;background:rgba(2,8,18,.7);border:1px solid rgba(95,212,255,.18);overflow:hidden}
.dash .ab-track i{position:absolute;left:0;top:0;bottom:0;width:var(--w);background:linear-gradient(90deg,#1b6fa0,var(--cy));transform-origin:left}
.dash .ab-v.lead .ab-track i{background:linear-gradient(90deg,#c9a86a,#f2dcae);box-shadow:0 0 10px rgba(226,198,143,.45)}
.dash .ab-v.lead .ab-k{color:var(--gold2)}
.dash .ab-v b{font-family:var(--mono);font-size:12.5px;color:#fff;text-align:right}
.dash .ab-v small{font-family:var(--mono);font-size:11px;color:var(--soft);text-align:right;white-space:nowrap}
.dash .ab-card footer{display:flex;align-items:center;justify-content:space-between;gap:8px;font-size:11.5px;color:var(--soft);min-width:0}
.dash .ab-sure{display:inline-flex;align-items:center;gap:8px;min-width:0}
.dash .ab-sure b{font-family:var(--mono);color:#fff}
.dash .ab-meter{position:relative;display:block;width:90px;height:6px;background:rgba(2,8,18,.7);border:1px solid rgba(95,212,255,.18)}
.dash .ab-meter i{position:absolute;left:0;top:0;bottom:0;width:var(--w);background:var(--cy);transform-origin:left}
.dash .ab-meter em{position:absolute;left:95%;top:-3px;bottom:-3px;width:2px;background:var(--gold)}
.dash .ab-min{font-family:var(--mono);white-space:nowrap}
.dash .ab-done{margin-top:12px}.dash .ab-done .ab-tests{margin:10px 0 0}
.dash a.gh-split.ab-mini{display:flex;gap:2px;width:100%;height:28px;padding:2px;border:1px solid rgba(95,212,255,.28);background:rgba(2,8,18,.6);text-decoration:none;color:inherit}
.dash a.gh-split.ab-mini:hover{border-color:var(--cy)}
@media (max-width:760px){
  .dash .ab-row{grid-template-columns:36px minmax(0,1fr) 64px;grid-template-areas:"i n q" "b b c";row-gap:6px;padding:8px 10px 8px 0}
  .dash .ab-ic{grid-area:i}.dash .ab-nm{grid-area:n}.dash .ab-q{grid-area:q}.dash .gh button.ab-bar{grid-area:b;margin-left:10px;width:calc(100% - 10px)}
  .dash .ab-n{grid-area:c}.dash .ab-eng{display:none}
  .dash .ab-funnel:before{display:none}
  .dash .ab-tests{margin-left:0;grid-template-columns:minmax(0,1fr)}
}
@keyframes ab-in{from{opacity:0;transform:translateX(-6px)}to{opacity:1;transform:none}}
@keyframes ab-pulse{0%,100%{box-shadow:0 0 0 1px rgba(226,198,143,.25) inset,0 0 14px rgba(226,198,143,.1)}50%{box-shadow:0 0 0 1px rgba(226,198,143,.45) inset,0 0 26px rgba(226,198,143,.28)}}
@media (prefers-reduced-motion:no-preference){
  .dash .ab-st{animation:ab-in .45s ease-out both;animation-delay:var(--d)}
  .dash .gh button.ab-bar i,.dash .ab-track i,.dash .ab-meter i{animation:gh-grow 1s cubic-bezier(.2,.8,.2,1) both}
  .dash .ab-st.eng .ab-row{animation:ab-pulse 3.2s ease-in-out infinite}
}
`;

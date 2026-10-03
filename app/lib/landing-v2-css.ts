/**
 * Landingpages im Stil der Startseite (Inhaber 03.10.2026): ergänzt LANDING_CSS + HOME_V2_CSS + HOME_CSS.
 * Nur für die neuen Abschnitte (.hpz innerhalb von .lp2): Hero-Grafik, „What they have in common“, Probe-Raster.
 */
export const LANDING_V2_CSS = `
/* Hero-Grafik rechts im Landingpage-Hero */
.bx .lp2 .h2o .wrap{align-items:center}
.lp2 .hpz.lz-hero{min-width:0;align-self:stretch;color:#fff}
.lp2 .lz-hero .hp-stage{height:100%;min-height:520px;--co-r:-8px}
.lp2 .lz-hero .hp-stage__title{gap:9px}
.lp2 .lz-hero .hp-map{right:-24px}
.lp2 .lz-hero .hp-map[data-cc="US"],.lp2 .lz-hero .hp-map[data-cc="FR"]{top:40px;bottom:40px}
.lp2 .lz-hero .hp-sigs{top:92px;width:300px}
@media (max-width:1060px){
  .lp2 .lz-hero .hp-stage{height:auto;min-height:0;max-width:600px;margin:0 auto}
  .lp2 .lz-hero .hp-map[data-cc="US"],.lp2 .lz-hero .hp-map[data-cc="FR"]{top:auto;bottom:auto}
  .lp2 .lz-hero .hp-maps{height:min(460px,90vw)}
}
/* Handy: Hero ohne Grafik (Inhaber 03.10.2026) */
@media (max-width:720px){.lp2 .hpz.lz-hero{display:none}}

/* „What they have in common“: Navy-Karte mit Punkten, die sich beim Einblenden füllen */
.lp2 .hpz.lz-common{background:var(--cream);color:var(--text);padding:88px 0 96px}
.lp2 .lz-common__grid{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,.75fr);gap:24px;margin-top:30px;align-items:stretch}
.lp2 .lz-common__grid--solo{grid-template-columns:minmax(0,1fr)}
.lp2 .lz-pres{position:relative;isolation:isolate;overflow:hidden;padding:34px 34px 30px;border-radius:var(--r-xl);color:#fff;
  background:radial-gradient(520px 260px at 100% 0%,rgba(216,189,138,.16),transparent 70%),linear-gradient(170deg,#132A5F,var(--navy-900) 70%);
  box-shadow:0 60px 110px -50px rgba(14,26,51,.75),inset 0 0 0 1px rgba(226,200,148,.16)}
.lp2 .lz-pres::before{content:"";position:absolute;inset:0;z-index:-1;background-image:radial-gradient(rgba(255,255,255,.06) 1px,transparent 1px);background-size:20px 20px;mask-image:linear-gradient(180deg,#000,transparent 80%)}
.lp2 .lz-pres__head h3{margin:0;font-size:clamp(22px,2.2vw,28px);line-height:1.15;font-weight:700;letter-spacing:-.02em;color:#fff}
.lp2 .lz-pres__head p{margin-top:8px;font-size:13.5px;color:var(--on-dark-3)}
.lp2 .lz-pres__rows{display:grid;gap:4px;margin:24px 0 0;padding:0;list-style:none}
.lp2 .lz-prow{display:grid;grid-template-columns:38px minmax(120px,170px) minmax(0,1fr) auto;align-items:center;gap:14px;padding:12px 0;border-top:1px solid rgba(255,255,255,.08)}
.lp2 .lz-prow:first-child{border-top:0}
.lp2 .lz-prow__ic{display:grid;place-items:center;width:38px;height:38px;border-radius:12px;background:rgba(226,200,148,.1);box-shadow:inset 0 0 0 1px rgba(226,200,148,.28);color:var(--gold-hi)}
.lp2 .lz-prow__ic .hp-ico{width:17px;height:17px}
.lp2 .lz-prow__lbl{font-size:15px;font-weight:600;color:#E9EDF5}
.lp2 .lz-prow__dots{display:flex;flex-wrap:wrap;gap:7px}
.lp2 .lz-prow__dots i{display:block;width:14px;height:14px;border-radius:50%;border:1.5px solid rgba(201,211,232,.35)}
.lp2 .lz-prow__dots i.on{border-color:transparent;background:linear-gradient(135deg,#F1DDB0,#C9A465);box-shadow:0 0 12px -2px rgba(226,200,148,.65)}
.lp2 .lz-prow__n{display:inline-flex;align-items:center;gap:6px;padding:5px 11px 5px 8px;border-radius:999px;background:rgba(59,209,138,.12);box-shadow:inset 0 0 0 1px rgba(59,209,138,.4);font-size:13px;font-weight:700;color:#7EEBB6;font-variant-numeric:tabular-nums;white-space:nowrap}
.lp2 .lz-prow__n .hp-ico{width:14px;height:14px;stroke-width:2.6}
.lp2 .lz-prow.is-gap .lz-prow__ic{background:rgba(240,128,112,.12);box-shadow:inset 0 0 0 1px rgba(240,128,112,.4);color:#F49C8E}
.lp2 .lz-prow.is-gap .lz-prow__lbl{color:#F7B5AA}
.lp2 .lz-prow.is-gap .lz-prow__dots i{border:1.5px dashed rgba(244,156,142,.7)}
.lp2 .lz-prow.is-gap .lz-prow__n{background:rgba(240,128,112,.12);box-shadow:inset 0 0 0 1px rgba(240,128,112,.45);color:#F7B5AA}
.lp2 .lz-pres__open{display:flex;align-items:center;gap:10px;margin-top:20px;padding:13px 16px;border-radius:14px;background:linear-gradient(90deg,rgba(226,200,148,.16),rgba(226,200,148,.03));box-shadow:inset 0 0 0 1px rgba(226,200,148,.35);font-size:15.5px;font-weight:700;color:var(--gold-hi)}
.lp2 .lz-pres__open .hp-ico{width:18px;height:18px}
/* Punkte füllen sich nacheinander (nur mit Bewegung) */
.lp2 .hpz.hp-motion .lz-pres .lz-prow__dots i.on{background:transparent;box-shadow:none;border-color:rgba(201,211,232,.35);transition:background .5s var(--ease),box-shadow .5s var(--ease),border-color .5s,transform .5s var(--ease-out);transform:scale(.6)}
.lp2 .hpz.hp-motion .lz-pres.is-in .lz-prow__dots i.on{background:linear-gradient(135deg,#F1DDB0,#C9A465);border-color:transparent;box-shadow:0 0 12px -2px rgba(226,200,148,.65);transform:none;transition-delay:calc(.25s + var(--r) * .32s + var(--k) * .05s)}
.lp2 .hpz.hp-motion .lz-pres .lz-prow__n{opacity:0;transform:translateX(-6px);transition:opacity .5s var(--ease),transform .5s var(--ease-out)}
.lp2 .hpz.hp-motion .lz-pres.is-in .lz-prow__n{opacity:1;transform:none;transition-delay:calc(.75s + var(--r) * .32s)}
.lp2 .hpz.hp-motion .lz-pres .lz-pres__open{opacity:0;transform:translateY(8px);transition:opacity .6s var(--ease),transform .6s var(--ease-out)}
.lp2 .hpz.hp-motion .lz-pres.is-in .lz-pres__open{opacity:1;transform:none;transition-delay:2s}
/* Signale rechts */
.lp2 .lz-sigs{display:grid;grid-auto-rows:1fr;gap:14px;margin:0;padding:0;list-style:none}
.lp2 .lz-common__grid--solo .lz-sigs{grid-template-columns:repeat(3,minmax(0,1fr))}
.lp2 .lz-sigcard{position:relative;display:grid;grid-template-columns:44px minmax(0,1fr);gap:16px;align-items:start;padding:22px 22px 22px 20px;border-radius:18px;background:#fff;border:1px solid #ece5d6;box-shadow:0 1px 2px rgba(14,26,51,.04),0 24px 44px -34px rgba(14,26,51,.35);transition:border-color .3s,transform .4s var(--ease-out),box-shadow .4s}
.lp2 .lz-sigcard:hover{border-color:rgba(176,141,87,.55);transform:translateY(-2px);box-shadow:0 30px 50px -32px rgba(14,26,51,.4)}
.lp2 .lz-sigcard__ic{display:grid;place-items:center;width:44px;height:44px;border-radius:14px;background:linear-gradient(160deg,#16295A,var(--navy-900));color:var(--gold-hi);box-shadow:0 10px 20px -12px rgba(14,26,51,.7)}
.lp2 .lz-sigcard__ic .hp-ico{width:20px;height:20px}
.lp2 .lz-sigcard__no{position:absolute;top:16px;right:18px;font-size:12px;font-weight:700;letter-spacing:.12em;color:var(--gold-lo)}
.lp2 .lz-sigcard h3{margin:0 28px 4px 0;font-size:16.5px;line-height:1.3;font-weight:700;color:var(--ink)}
.lp2 .lz-sigcard p{font-size:14.5px;line-height:1.55;color:var(--muted)}
@media (max-width:980px){
  .lp2 .lz-common__grid,.lp2 .lz-common__grid--solo .lz-sigs{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:720px){
  .lp2 .hpz.lz-common{padding:56px 0 64px}
  .lp2 .lz-pres{padding:26px 18px 22px}
  .lp2 .lz-prow{grid-template-columns:34px minmax(0,1fr) auto;grid-template-areas:"ic lbl n" "ic dots dots";gap:6px 12px}
  .lp2 .lz-prow__ic{grid-area:ic;align-self:start}.lp2 .lz-prow__lbl{grid-area:lbl}.lp2 .lz-prow__n{grid-area:n}
  .lp2 .lz-prow__ic{width:34px;height:34px}
  .lp2 .lz-prow__dots{grid-area:dots;gap:6px}
  .lp2 .lz-prow__dots i{width:12px;height:12px}
}
@media (prefers-reduced-motion:reduce){.lp2 .lz-sigcard{transition:none}}

/* Methode direkt nach dem cremefarbenen Abschnitt */
.lp2 .hpz.lz-method{padding-top:96px}
.lp2 .hpz.lz-common + .vid + .hpz.lz-method,.lp2 .hpz.lz-common + .hpz.lz-method{padding-top:24px}
@media (max-width:720px){.lp2 .hpz.lz-method{padding-top:56px}}

/* Probe: Formular links, rechts „What you receive“ und „How the sample works“; Handy: Vorschau oben, Ablauf unten */
.lp2 .lz-sample__grid{display:grid;grid-template-columns:minmax(0,1.12fr) minmax(0,.88fr);grid-template-areas:"form recv" "form how";gap:38px 28px;align-items:start}
.lp2 .lz-sample__form{grid-area:form}
.lp2 .lz-sample__recv{grid-area:recv;padding:10px 4px 0 18px}
.lp2 .lz-sample__how{grid-area:how;padding:0 4px 0 18px}
@media (max-width:1060px){
  .lp2 .lz-sample__grid{grid-template-columns:minmax(0,1fr);grid-template-areas:"recv" "form" "how";gap:40px}
  .lp2 .lz-sample__recv,.lp2 .lz-sample__how{padding:0}
}
/* Lichtstrahl im Hero wie auf der Startseite */
.lp2 .h2o{position:relative;isolation:isolate}
.lp2 .h2o > .wrap{position:relative;z-index:1}
.lp2 .lz-beam{position:absolute;inset:0;z-index:0;overflow:hidden;pointer-events:none;-webkit-mask-image:linear-gradient(180deg,#000 72%,transparent);mask-image:linear-gradient(180deg,#000 72%,transparent)}
/* Hero: mehr Abstand zwischen Button und den vier Kennzahl-Kästchen (Inhaber 03.10.2026) */
.lp2 .h2o .kpis{margin-top:64px}
@media (max-width:720px){.lp2 .h2o .kpis{margin-top:40px}}
/* Hero-Hintergrund wie Startseite: Farbverlauf, Lichtflächen, Punkteraster mit Lichtkegel (Inhaber 03.10.2026) */
.bx .lp2 .h2o{background:linear-gradient(180deg,#0D1834,#0B1530 70%);overflow:hidden}
.bx .lp2 .h2o:before{display:none}
.lp2 .lz-beam .hp-dots--lit{opacity:0;transition:opacity .4s}
.lp2 .lz-beam.is-pointer .hp-dots--lit{opacity:1}
/* Hero-Karte: Land größer (Inhaber 03.10.2026), Notiz-Karte bleibt gleich. Breite Länder (US, FR) füllen die Spaltenbreite. */
@media (min-width:1061px){
  .lp2 .lz-hero .hp-map[data-cc="US"],.lp2 .lz-hero .hp-map[data-cc="FR"]{top:150px;bottom:auto;left:-70px;right:-60px;height:auto;aspect-ratio:auto}
  .lp2 .lz-hero .hp-map[data-cc="FR"]{left:30px;right:-30px;top:130px}
  .lp2 .lz-hero .hp-map[data-cc="US"] svg,.lp2 .lz-hero .hp-map[data-cc="FR"] svg{height:auto}
  .lp2 .lz-hero .hp-map[data-cc="UK"]{top:-20px;bottom:-40px;right:-70px}
}
`;

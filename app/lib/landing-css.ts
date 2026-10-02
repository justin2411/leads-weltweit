/**
 * Landingpage im Design der Lead-PDF (Inhaber 02.10.2026): Farben und Formen der PDF-Vorlage
 * (scripts/assets/report/lead-report-vorlage.html), damit Kaltmail, Seite und Probe gleich aussehen.
 * Alles unter .lp2, ergänzt BRAND_CSS (Kopf, Fuß, Knöpfe, Formular).
 */
export const LANDING_CSS = `
.bx .lp2{--navy:#0B1530;--navy2:#122247;--navy3:#1A2C55;--pink:#0E1A33;--muted:#566079;--faint:#8C94A6;--pline:#E8E1D3;--cream:#F6F3ED;
  --pgold:#C9A465;--pgold-d:#A98447;--pgold-l:#EBD7AE;--gtext:#8E6C30;--gink:#E2C68F;--coral:#C2412D;--coral-bg:#FBEAE6;--green:#1E7A4C;--green-bg:#E3F3EA}
.bx .lp2 .ic{width:18px;height:18px;flex:none;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.bx .lp2 .cap{font-size:11px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.bx .lp2 .cap.gold{color:var(--gtext)}
.bx .lp2 .sec{padding:72px 0}
.bx .lp2 .sec h2{font-size:clamp(26px,3.2vw,38px);line-height:1.12;letter-spacing:-.02em;margin:0 0 8px;color:var(--pink)}
.bx .lp2 .lede2{color:var(--muted);margin:0 0 28px;font-size:16px}
.bx .lp2 .kick{display:flex;align-items:center;gap:14px;margin:0 0 18px}
.bx .lp2 .kick:after{content:"";flex:1;height:1px;background:var(--pline)}
.bx .lp2 .dark .kick:after{background:rgba(255,255,255,.12)}
.bx .lp2 .gold-t{color:var(--gink)}

/* Hero wie das Deckblatt der PDF */
.bx .lp2 .h2o{position:relative;overflow:hidden;color:#fff;background:
  radial-gradient(900px 420px at 0% 0%,rgba(74,91,140,.35),transparent 60%),
  radial-gradient(800px 500px at 100% 35%,rgba(30,56,120,.5),transparent 65%),linear-gradient(180deg,#0d1834,#0B1530)}
.bx .lp2 section.h2o{padding-bottom:24px}
.bx .lp2 .h2o:before{content:"";position:absolute;inset:0;background-image:radial-gradient(rgba(255,255,255,.07) 1px,transparent 1px);background-size:22px 22px;mask-image:linear-gradient(180deg,#000,transparent 85%);pointer-events:none}
.bx .lp2 .h2o .wrap{position:relative;display:grid;grid-template-columns:1.08fr .92fr;gap:48px;align-items:center;padding-top:44px;padding-bottom:28px}
.bx .lp2 .pill{display:inline-flex;align-items:center;gap:8px;background:linear-gradient(135deg,#EBD7AE,#C9A465);color:#1b1404;font-size:11.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;padding:7px 14px;border-radius:99px}
.bx .lp2 .h2o h1{font-size:clamp(36px,5vw,62px);line-height:1.04;letter-spacing:-.035em;margin:22px 0 16px;color:#fff;font-weight:800}
.bx .lp2 .h2o .sub{font-size:clamp(17px,1.6vw,20px);color:#cfd6e4;margin:0 0 24px;max-width:560px;line-height:1.5}
.bx .lp2 .every{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 30px}
.bx .lp2 .every .cap{color:#97a2bd;margin-right:6px}
.bx .lp2 .chip{display:inline-flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;color:#e9edf6;border:1px solid rgba(255,255,255,.18);border-radius:99px;padding:6px 12px;background:rgba(255,255,255,.03)}
.bx .lp2 .chip .ic{width:15px;height:15px;color:var(--gink)}
.bx .lp2 .ctaline{display:flex;flex-wrap:wrap;align-items:center;gap:16px}
.bx .lp2 .ctabox{display:inline-flex;flex-direction:column;align-items:center;gap:12px}
.bx .lp2 .free2{display:flex;flex-wrap:wrap;justify-content:center;gap:14px;font-size:13px;color:#9aa6ba}
.bx .lp2 .free2 span:before{content:"✓ ";color:var(--gink)}
.bx .lp2 .for{display:inline-block;margin-left:12px;font-size:13px;color:#cfd6e4}
.bx .lp2 .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:14px;padding-bottom:12px;position:relative}
.bx .lp2 .kpi{border:1px solid rgba(255,255,255,.14);border-radius:16px;padding:18px 20px;background:linear-gradient(160deg,rgba(255,255,255,.06),rgba(255,255,255,.015))}
.bx .lp2 .kpi b{display:block;font-size:clamp(30px,3.4vw,44px);font-weight:800;color:var(--gink);letter-spacing:-.02em;line-height:1}
.bx .lp2 .kpi span{display:block;margin-top:10px;font-size:11.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#aab4ca}
.bx .lp2 .kpinote{position:relative;font-size:12.5px;color:#8f9ab3;padding-bottom:40px;margin:6px 0 0}

/* Karte */
.bx .lp2 .mapcard{background:#fff;border:1px solid var(--pline);border-radius:22px;padding:18px;box-shadow:0 30px 70px -40px rgba(11,21,48,.45)}
.bx .lp2 .h2o .mapcard{background:#F6F3ED;border:0;box-shadow:0 40px 90px -40px rgba(0,0,0,.7)}
.bx .lp2 .mapcard svg{display:block;width:100%;height:auto}
.bx .lp2 .mapcard .nb{fill:#ECE6DA;stroke:none}
.bx .lp2 .mapcard .land{fill:#E6DCC8;stroke:#fff;stroke-width:1.2}
.bx .lp2 .mapcard .borders{fill:none;stroke:#fff;stroke-width:1.3}
.bx .lp2 .mapcard .halo{fill:rgba(201,164,101,.25)}
.bx .lp2 .mapcard .dot{fill:var(--navy);stroke:var(--pgold);stroke-width:2.5}
.bx .lp2 .mapcard .num{fill:#EBD7AE;font-size:20px;font-weight:800;font-family:inherit}
.bx .lp2 .mapcard .pin{transform-box:fill-box;transform-origin:center}
.motion .bx .lp2 .mapcard .pin{animation:lp2pop .6s cubic-bezier(.2,.8,.2,1.4) both;animation-delay:calc(.6s + var(--k) * .09s)}
@keyframes lp2pop{from{opacity:0;transform:scale(.2)}to{opacity:1;transform:scale(1)}}
.bx .lp2 .mapcard .note{display:flex;align-items:center;gap:8px;margin:8px 4px 0;font-size:12.5px;color:var(--muted)}
.bx .lp2 .mapcard .note .ic{width:15px;height:15px;color:var(--pgold-d)}

/* Video gleich unter dem Hero */
.bx .lp2 .vid{background:#0B1530;padding:8px 0 72px}
.bx .lp2 .vid .frame{border-radius:20px;overflow:hidden;border:1px solid rgba(201,164,101,.35);box-shadow:0 40px 90px -40px rgba(0,0,0,.8);background:#000}
.bx .lp2 .vid video{display:block;width:100%;height:auto;aspect-ratio:16/9}
.bx .lp2 .vid .kick .cap{color:var(--gink)}

/* Gemeinsamkeiten (Punktgrafik) */
.bx .lp2 .cream{background:var(--cream)}
.bx .lp2 .two{display:grid;grid-template-columns:1.25fr .75fr;gap:22px;align-items:stretch}
.bx .lp2 .box{background:#fff;border:1px solid var(--pline);border-radius:22px;padding:26px 28px}
.bx .lp2 .box h3{margin:0;font-size:20px;color:var(--pink)}
.bx .lp2 .box .small{font-size:13px;color:var(--faint);margin:4px 0 18px}
.bx .lp2 .prow{display:grid;grid-template-columns:150px 1fr auto;align-items:center;gap:12px;padding:11px 0;border-top:1px solid var(--line2,#EFEAE0);font-size:14.5px;color:var(--pink)}
.bx .lp2 .prow .lbl{display:flex;align-items:center;gap:9px}.bx .lp2 .prow .lbl .ic{color:var(--pgold-d);width:16px;height:16px}
.bx .lp2 .prow .dots{display:flex;gap:5px;flex-wrap:wrap}.bx .lp2 .prow .dots i{width:12px;height:12px;border-radius:50%;background:var(--navy)}
.bx .lp2 .prow .n{font-weight:700;font-size:13.5px;color:var(--green)}
.bx .lp2 .prow.gap{color:var(--coral)}.bx .lp2 .prow.gap .lbl .ic{color:var(--coral)}
.bx .lp2 .prow.gap .dots i{background:transparent;border:1.6px solid var(--coral)}.bx .lp2 .prow.gap .n{color:var(--coral)}
.bx .lp2 .opening{display:flex;align-items:center;gap:8px;margin-top:16px;font-weight:700;color:var(--gtext);font-size:14.5px}
.bx .lp2 .opening .ic{width:16px;height:16px}

/* Lead-Kacheln wie in der PDF */
.bx .lp2 .tiles{display:grid;gap:22px}
.bx .lp2 .tile{display:grid;grid-template-columns:1fr 320px;background:#fff;border:1px solid var(--pline);border-radius:22px;overflow:hidden;box-shadow:0 26px 60px -40px rgba(11,21,48,.5);position:relative}
.bx .lp2 .tile:before{content:"";position:absolute;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,#EBD7AE,#C9A465,#A98447)}
.bx .lp2 .tile .main{padding:26px 28px}
.bx .lp2 .tile .th{display:flex;align-items:center;gap:14px;padding-bottom:16px;border-bottom:1px solid var(--line2,#EFEAE0)}
.bx .lp2 .tile .num{width:46px;height:46px;border-radius:12px;background:var(--navy);color:var(--gink);font-weight:800;font-size:17px;display:flex;align-items:center;justify-content:center;flex:none}
.bx .lp2 .tile h3{margin:0;font-size:21px;line-height:1.2;color:var(--pink)}
.bx .lp2 .tile .sub{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--muted);margin-top:3px}.bx .lp2 .tile .sub .ic{width:15px;height:15px;color:var(--pgold-d)}
.bx .lp2 .tile .cgrid{display:grid;grid-template-columns:1fr 1fr;gap:14px 20px;padding:16px 0}
.bx .lp2 .cf{display:flex;gap:11px;align-items:flex-start;min-width:0}
.bx .lp2 .cf .ci{width:34px;height:34px;border-radius:50%;background:#F4EEE2;color:var(--pgold-d);display:flex;align-items:center;justify-content:center;flex:none}
.bx .lp2 .cf .ci .ic{width:16px;height:16px}
.bx .lp2 .cf em{display:block;font-style:normal;font-size:10.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--faint)}
.bx .lp2 .cf b{display:block;font-size:15px;color:var(--pink);font-weight:700;overflow-wrap:anywhere}
.bx .lp2 .cf b.gold{color:var(--coral)}
.bx .lp2 .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
.bx .lp2 .mask{filter:blur(5px);user-select:none}
.bx .lp2 .tile .low{display:grid;grid-template-columns:1fr;gap:12px;padding-top:16px;border-top:1px solid var(--line2,#EFEAE0)}
.bx .lp2 .tile .why p{margin:6px 0 0;font-size:15px;line-height:1.55;color:#2b3446}
.bx .lp2 .pres{display:flex;flex-wrap:wrap;align-items:center;gap:7px}
.bx .lp2 .pc{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;padding:5px 10px;border-radius:99px;background:var(--green-bg);color:var(--green)}
.bx .lp2 .pc.no{background:var(--coral-bg);color:var(--coral)}.bx .lp2 .pc .ic{width:13px;height:13px}
.bx .lp2 .tile .act{background:linear-gradient(170deg,#13265a,#0B1530);color:#fff;padding:24px 22px;display:flex;flex-direction:column;gap:14px}
.bx .lp2 .badge{display:inline-flex;align-items:center;gap:7px;align-self:flex-start;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;padding:6px 11px;border-radius:99px}
.bx .lp2 .badge .ic{width:13px;height:13px}
.bx .lp2 .badge.nosite,.bx .lp2 .badge.insecure{background:rgba(194,65,45,.18);color:#f3b2a5;border:1px solid rgba(194,65,45,.5)}
.bx .lp2 .badge.outdated{background:rgba(201,164,101,.16);color:var(--gink);border:1px solid rgba(201,164,101,.45)}
.bx .lp2 .badge.prio{background:rgba(255,255,255,.06);color:#dfe5f1;border:1px solid rgba(255,255,255,.18)}
.bx .lp2 .meter{display:inline-flex;gap:2px;align-items:flex-end}.bx .lp2 .meter i{width:3px;background:#55617d;border-radius:1px}.bx .lp2 .meter i.on{background:var(--pgold)}
.bx .lp2 .meter i:nth-child(1){height:6px}.bx .lp2 .meter i:nth-child(2){height:9px}.bx .lp2 .meter i:nth-child(3){height:12px}
.bx .lp2 .act .cap{color:var(--gink);display:flex;align-items:center;gap:7px}
.bx .lp2 .act .offer{margin:0;font-size:14px;color:#dfe5f1;line-height:1.5}
.bx .lp2 .askb{background:linear-gradient(135deg,#EBD7AE,#C9A465);color:#1b1404;border-radius:14px;padding:12px 14px;font-size:14px;font-weight:700;font-style:italic;line-height:1.4}
.bx .lp2 .askb small{display:block;font-style:normal;font-size:10.5px;letter-spacing:.14em;text-transform:uppercase;font-weight:800;margin-bottom:4px}
.bx .lp2 .callb{margin-top:auto;display:flex;align-items:center;gap:12px;border:1px solid rgba(255,255,255,.18);border-radius:14px;padding:11px 14px}
.bx .lp2 .callb .ci{width:36px;height:36px;border-radius:50%;background:var(--pgold);color:var(--navy);display:flex;align-items:center;justify-content:center;flex:none}
.bx .lp2 .callb em{display:block;font-style:normal;font-size:10.5px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;color:var(--gink)}
.bx .lp2 .callb b{font-size:16px}
.bx .lp2 .unlock{display:flex;align-items:center;gap:7px;font-size:13px;color:var(--gtext);font-weight:700;margin:14px 0 0}
.bx .lp2 .unlock .ic{width:15px;height:15px}

/* Abschlussseite der PDF: Gründe und Ablauf */
.bx .lp2 .dark{background:linear-gradient(170deg,#0d1834,#0B1530 60%,#122247);color:#fff}
.bx .lp2 .dark h2{color:#fff}.bx .lp2 .dark h2 i{font-style:normal;color:var(--gink)}
.bx .lp2 .rs{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;margin:26px 0 54px}
.bx .lp2 .rcard{border:1px solid rgba(255,255,255,.12);border-radius:18px;padding:22px;background:rgba(255,255,255,.03)}
.bx .lp2 .gi{width:44px;height:44px;border-radius:50%;background:linear-gradient(135deg,#EBD7AE,#C9A465);color:var(--navy);display:flex;align-items:center;justify-content:center;margin-bottom:14px}
.bx .lp2 .gi .ic{width:20px;height:20px}
.bx .lp2 .rcard h3{margin:0 0 6px;font-size:18px;color:#fff}.bx .lp2 .rcard p{margin:0;font-size:14.5px;color:#aab4ca;line-height:1.55}
.bx .lp2 .steps{display:grid;grid-template-columns:repeat(3,1fr);gap:22px;margin-top:22px}
.bx .lp2 .steps:before,.bx .lp2 .steps:after{display:none}
.bx .lp2 .step{padding-right:0}
.bx .lp2 .step .no{display:flex;align-items:center;gap:12px;margin-bottom:10px}
.bx .lp2 .step .no b{font-size:28px;font-weight:800;color:var(--gink)}
.bx .lp2 .step .no .ring{width:36px;height:36px;border-radius:50%;border:1px solid rgba(201,164,101,.6);display:flex;align-items:center;justify-content:center;color:var(--gink)}
.bx .lp2 .step .no:after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(201,164,101,.6),transparent)}
.bx .lp2 .step h3{margin:0 0 6px;font-size:17px;color:#fff}.bx .lp2 .step p{margin:0;font-size:14.5px;color:#aab4ca}

/* Probe-Formular */
.bx .lp2 .formwrap{display:grid;grid-template-columns:1.1fr .9fr;gap:30px;align-items:start}
.bx .lp2 .formcard{background:linear-gradient(170deg,#13265a,#0B1530);color:#fff;border-radius:24px;padding:30px;box-shadow:0 40px 80px -45px rgba(11,21,48,.8)}
.bx .lp2 .formcard h2{color:#fff}
.bx .lp2 .formcard .gold-h{color:var(--gold,#E2C58C);background:linear-gradient(90deg,#E9D3A2,#C9A363);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent}
.bx .lp2 .side2{display:flex;flex-direction:column;gap:14px}
.bx .lp2 .getcard{background:#fff;border:1px solid var(--pline);border-radius:20px;padding:20px 20px 16px;display:grid;gap:14px}
.bx .lp2 .getcard .gf{display:flex;gap:12px;align-items:flex-start}
.bx .lp2 .getcard .gf b{display:block;color:var(--pink);font-size:15px}
.bx .lp2 .getcard .gf em{display:block;font-style:normal;color:#5b6478;font-size:14px;line-height:1.45}
.bx .lp2 .getcard .ci{flex:none;width:38px;height:38px;border-radius:50%;display:grid;place-items:center;background:linear-gradient(140deg,#EAD3A2,#C9A363);color:#0B1530}
.bx .lp2 .getcard .ci .ic{width:18px;height:18px}
.bx .lp2 .getcard .mapcard{box-shadow:none;border:1px solid var(--pline);padding:12px}
.bx .lp2 .ticks2{list-style:none;padding:0;margin:0;display:grid;gap:14px}
.bx .lp2 .ticks2 li{display:flex;gap:12px;align-items:flex-start;background:#fff;border:1px solid var(--pline);border-radius:16px;padding:16px 18px;font-size:15px;color:var(--pink)}
.bx .lp2 .ticks2 li .ic{color:var(--green);width:20px;height:20px;margin-top:2px}
.bx .lp2 .faq2 details{border-bottom:1px solid var(--pline);padding:16px 0}
.bx .lp2 .faq2 summary{cursor:pointer;font-weight:700;color:var(--pink);font-size:17px;list-style:none;display:flex;justify-content:space-between;gap:16px}
.bx .lp2 .faq2 summary:after{content:"+";color:var(--pgold-d);font-size:24px;line-height:1}.bx .lp2 .faq2 details[open] summary:after{content:"–"}
.bx .lp2 .faq2 p{margin:10px 0 0;color:var(--muted)}

@media (max-width:980px){
  .bx .lp2 .h2o .wrap{grid-template-columns:1fr;gap:28px;padding-top:44px}
  .bx .lp2 .kpis{grid-template-columns:repeat(2,1fr)}
  .bx .lp2 .two,.bx .lp2 .formwrap{grid-template-columns:1fr}
  .bx .lp2 .tile{grid-template-columns:1fr}
  .bx .lp2 .rs,.bx .lp2 .steps{grid-template-columns:1fr}
}
@media (max-width:560px){
  .bx .lp2 .sec{padding:52px 0}
  .bx .lp2 .tile .cgrid{grid-template-columns:1fr}
  .bx .lp2 .prow{grid-template-columns:1fr auto;gap:6px}.bx .lp2 .prow .dots{grid-column:1/-1;order:3}
  .bx .lp2 .tile .main{padding:22px 18px}
}
`;

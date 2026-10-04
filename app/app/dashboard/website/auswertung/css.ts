/** Website-Auswertung im JARVIS-Design (dunkles HUD, Cyan/Gold). Nur Klassen mit Präfix wa-. Handy: 390 px ohne Querscroll. */
export const AUSWERTUNG_CSS = `
.wa{display:grid;gap:16px;min-width:0}
.wa-head{display:flex;align-items:baseline;gap:12px;flex-wrap:wrap;margin:4px 0 0}
.wa-head h1{margin:0;font-family:var(--hud);font-size:28px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#fff;text-shadow:0 0 22px rgba(95,212,255,.55)}
.wa-at{font-size:13px;color:var(--soft)}
.wa-filter{display:grid;gap:8px}
.wa-chips{display:flex;gap:6px;flex-wrap:wrap;align-items:center;min-width:0}
.wa-cl{font-size:12px;color:var(--soft);width:64px;flex:0 0 64px}
.wa-chips a{padding:5px 12px;border:1px solid rgba(95,212,255,.28);border-radius:999px;font-size:13px;font-weight:600;color:#a9c3e3;text-decoration:none;background:rgba(4,14,30,.6);min-height:32px;display:inline-flex;align-items:center}
.wa-chips a.on{background:linear-gradient(180deg,rgba(95,212,255,.35),rgba(95,212,255,.12));color:#fff;border-color:var(--cy);box-shadow:var(--glow)}
.wa-kpis{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px}
.wa-kpi{position:relative;display:grid;gap:2px;padding:12px 14px 12px 46px;border:1px solid var(--line);border-radius:10px;background:linear-gradient(180deg,rgba(9,24,48,.7),rgba(4,12,26,.5));min-width:0}
.wa-ki{position:absolute;left:14px;top:15px;color:var(--cy2)}
.wa-kpi b{font-size:24px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;line-height:1.1}
.wa-kpi span{font-size:13px;color:var(--cy2);font-weight:600}.wa-kpi em{font-style:normal;font-size:12.5px;color:var(--soft)}
.wa-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px;min-width:0}
.wa-card{position:relative;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:14px 16px 16px;min-width:0;
  clip-path:polygon(0 10px,10px 0,calc(100% - 10px) 0,100% 10px,100% calc(100% - 10px),calc(100% - 10px) 100%,10px 100%,0 calc(100% - 10px))}
.wa-card.wide{grid-column:1/-1}
.wa-h{display:flex;align-items:baseline;gap:10px;margin:0 0 12px;min-width:0}
.wa-h h2,.wa-h .fold-t{margin:0;font-family:var(--hud);font-size:14px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--cy2)}
.wa-sum,.wa-h .fold-s{margin-left:auto;font-size:13px;color:var(--soft);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wa-empty{margin:8px 0;font-size:13px;color:var(--soft)}
.wa-note{margin:10px 0 0;font-size:12px;color:var(--soft)}
.wa-legend{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:13px;color:var(--soft);margin:0 0 10px}
.wa-legend span{display:inline-flex;align-items:center;gap:6px}
.wa-legend i{width:10px;height:10px;border-radius:2px;background:var(--c)}

/* Aufrufe je Tag */
.wa-cols{position:relative;display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));gap:2px;height:180px;padding-top:18px;border-bottom:1px solid rgba(95,212,255,.25);
  background:linear-gradient(rgba(95,212,255,.08) 1px,transparent 1px) 0 18px/100% calc((100% - 18px)/2)}
.wa-ymax{position:absolute;left:0;top:0;font-size:12px;color:var(--soft);font-variant-numeric:tabular-nums}
.wa-col{position:relative;display:flex;align-items:flex-end;min-width:0;height:100%}
.wa-col:hover{background:rgba(95,212,255,.06)}
.wa-stack{display:flex;flex-direction:column-reverse;width:100%;max-width:22px;margin:0 auto;gap:2px;border-radius:3px 3px 0 0;overflow:hidden}
.wa-stack i{display:block;min-height:2px}
.wa-x{position:absolute;top:100%;left:50%;transform:translateX(-50%);margin-top:4px;font-size:11px;color:var(--soft);white-space:nowrap}
.wa-card.wide .wa-cols{margin-bottom:20px}

/* Balken */
.wa-bars,.wa-tg{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.wa-bars li{display:grid;grid-template-columns:96px minmax(0,1fr) auto 40px;align-items:center;gap:8px;font-size:13px}
.wa-bl{display:inline-flex;align-items:center;gap:6px;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wa-bl .ico{color:var(--cy2);flex:0 0 auto}
.wa-bb{display:block;height:10px;border-radius:0 4px 4px 0;background:rgba(95,212,255,.07);overflow:hidden;min-width:0}
.wa-bb i{display:block;height:100%;border-radius:0 4px 4px 0;background:var(--cy)}
.wa-bars b,.wa-abl b{font-variant-numeric:tabular-nums;color:#fff;font-weight:600;text-align:right}
.wa-bars em,.wa-abl em{font-style:normal;color:var(--soft);font-size:12px;text-align:right;font-variant-numeric:tabular-nums}

/* Trichter */
.wa-fun{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.wa-fr{display:grid;grid-template-columns:118px minmax(0,1fr) auto;gap:8px;align-items:center;font-size:13px}
.wa-fl{display:inline-flex;gap:6px;align-items:center;white-space:nowrap}.wa-fl .ico{color:var(--cy2)}
.wa-fb{display:block;height:14px;background:rgba(95,212,255,.07);border-radius:0 4px 4px 0;overflow:hidden}
.wa-fb i{display:block;height:100%;background:linear-gradient(90deg,var(--cy),#2f9fd0);border-radius:0 4px 4px 0}
.wa-fr b{color:#fff;font-variant-numeric:tabular-nums;font-weight:600}
.wa-rate{display:inline-flex;align-items:center;gap:4px;margin:0 0 2px 20px;font-size:12px;color:var(--gold2);font-variant-numeric:tabular-nums}

/* Mail A/B */
.wa-ab{display:grid;gap:10px}
.wa-abr{display:grid;grid-template-columns:48px minmax(0,1fr);gap:4px 8px;align-items:center}
.wa-abc{grid-row:span 2;display:inline-flex;gap:6px;align-items:center;font-size:13px;font-weight:700}
.wa-abc i{width:10px;height:10px;border-radius:2px}
.wa-abl{display:grid;grid-template-columns:16px minmax(0,1fr) auto 52px;gap:8px;align-items:center;font-size:13px}
.wa-abk{font-weight:700;color:var(--soft)}

/* Gerät */
.wa-sb{display:flex;gap:2px;height:16px;border-radius:4px;overflow:hidden}
.wa-sb i:first-child{background:var(--cy)}.wa-sb i:last-child{background:#2f7fb0}
.wa-sl{display:flex;justify-content:space-between;gap:8px;margin-top:8px;font-size:13px;color:var(--soft);flex-wrap:wrap}
.wa-sl b{color:#fff}

/* Scrolltiefe als Treppe */
.wa-steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;align-items:end;height:150px}
.wa-step{display:grid;grid-template-rows:auto 1fr auto;gap:4px;height:100%;text-align:center;min-width:0}
.wa-step b{font-size:14px;color:#fff;font-variant-numeric:tabular-nums}
.wa-step em{font-style:normal;font-size:12px;color:var(--soft)}
.wa-sc{display:flex;align-items:flex-end;justify-content:center;background:rgba(95,212,255,.05);border-radius:4px 4px 0 0}
.wa-sc i{display:block;width:100%;background:linear-gradient(180deg,var(--cy),#2f7fb0);border-radius:4px 4px 0 0;min-height:2px}

/* Heatmap */
.wa-hm .wa-chips{margin:0 0 12px}
.wa-hmg{display:grid;grid-template-columns:minmax(0,380px) minmax(0,1fr);gap:20px;align-items:start}
.wa-heat{display:grid;justify-items:center;gap:6px;min-width:0}
.wa-page{width:100%;max-height:640px;display:block}
.wa-page.mobil{max-width:260px}
.wa-pg{fill:rgba(2,10,24,.85);stroke:rgba(95,212,255,.35);stroke-width:.4}
.wa-sk rect{fill:rgba(95,212,255,.06)}.wa-sk .wa-skb{fill:rgba(226,198,143,.18)}
.wa-dm line{stroke:rgba(226,198,143,.45);stroke-width:.3;stroke-dasharray:1.2 1.2}
.wa-dm text{fill:var(--gold2);font-weight:600}
.wa-hl{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--soft)}
.wa-hl i{width:120px;height:8px;border-radius:4px;background:linear-gradient(90deg,rgba(95,212,255,.3),#7fe3ff,#ffcf7a,#fff6dc)}
.wa-tgf{min-width:0}
.wa-tg li{display:grid;grid-template-columns:22px minmax(0,1.3fr) minmax(0,1fr) auto;gap:8px;align-items:center;font-size:13px}
.wa-tn{color:var(--soft);font-variant-numeric:tabular-nums;text-align:right}
.wa-tt{display:grid;min-width:0}.wa-tt b{color:#fff;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.wa-tt em{font-style:normal;font-size:12px;color:var(--soft)}
.wa-tv{text-align:right;color:#fff;font-weight:600;font-variant-numeric:tabular-nums;white-space:nowrap}.wa-tv small{display:block;font-weight:400;color:var(--soft);font-size:11.5px}
.wa-priv{display:flex;gap:6px;align-items:center;font-size:12.5px;color:var(--soft);margin:0}

@media (max-width:1100px){.wa-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.wa-kpis{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:720px){
  .wa-head h1{font-size:22px;letter-spacing:.2em}
  .wa-grid{grid-template-columns:minmax(0,1fr)}
  .wa-kpis{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.wa-kpi{padding:10px 10px 10px 38px}.wa-ki{left:11px;top:13px}.wa-kpi b{font-size:20px}
  .wa-kpi:last-child{grid-column:1/-1}
  .wa-hmg{grid-template-columns:minmax(0,1fr)}
  .wa-cl{width:100%;flex-basis:100%}
  .wa-cols{height:150px}
  .wa-bars li{grid-template-columns:84px minmax(0,1fr) auto 36px}
  .wa-fr{grid-template-columns:110px minmax(0,1fr) auto}
  .wa-tg li{grid-template-columns:22px minmax(0,1fr) 56px auto}
}

/* ---------------- Website-Trichter (großer HUD-Trichter oben) ---------------- */
.wt{position:relative;display:grid;gap:14px;padding:16px 18px 14px;border:1px solid rgba(95,212,255,.28);border-radius:8px;min-width:0;overflow:hidden;
  background:radial-gradient(120% 70% at 30% 0%,rgba(95,212,255,.10),transparent 60%),linear-gradient(180deg,rgba(9,24,48,.82),rgba(3,10,22,.72));
  box-shadow:0 0 0 1px rgba(95,212,255,.06) inset,0 18px 50px -30px rgba(95,212,255,.45)}
.dash .wt{margin-top:0}
.wt::before{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(rgba(95,212,255,.05) 1px,transparent 1px) 0 0/100% 26px;mask:linear-gradient(180deg,#000,transparent 70%)}
.wt-head{position:relative;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.wt-head h2{margin:0;font-family:var(--hud);font-size:16px;font-weight:700;letter-spacing:.22em;text-transform:uppercase;color:#fff;text-shadow:0 0 14px rgba(95,212,255,.6)}
.wt-chips{display:flex;gap:6px;margin-left:auto}
.wt-chips a{padding:4px 12px;min-height:30px;display:inline-flex;align-items:center;border:1px solid rgba(95,212,255,.28);border-radius:999px;font-size:13px;font-weight:600;color:#a9c3e3;text-decoration:none;background:rgba(4,14,30,.6)}
.wt-chips a.on{background:linear-gradient(180deg,rgba(95,212,255,.35),rgba(95,212,255,.12));color:#fff;border-color:var(--cy);box-shadow:var(--glow)}
.wt-kpis{position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}
.wt-kpis div{display:grid;gap:2px;padding:10px 12px;border:1px solid var(--line);border-radius:8px;background:rgba(4,12,26,.55);min-width:0}
.wt .wt-kpis b{font-size:22px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;line-height:1.1}
.wt .wt-kpis div:nth-child(2) b{color:var(--gold2);text-shadow:0 0 12px rgba(226,198,143,.45)}
.wt-kpis div>span{font-size:12.5px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wt-body{position:relative;display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:20px;align-items:start}
.wt-fun{list-style:none;margin:0;padding:0;display:grid;justify-items:center;min-width:0}
.wt-li{display:grid;justify-items:center;width:100%;min-width:0;animation:wt-in .6s cubic-bezier(.2,.8,.2,1) both;animation-delay:calc(var(--i) * 90ms)}
@keyframes wt-in{from{opacity:0;transform:translateY(-8px) scaleX(.96)}to{opacity:1;transform:none}}
.wt-band,.dash .wt-band,.dash .wt-band:hover:not(:disabled){position:relative;display:grid;place-items:center;width:100%;height:118px;padding:0;border:0;border-radius:0;background:none;box-shadow:none;color:inherit;font:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
.wt-shape{position:absolute;inset:0;width:100%;height:100%;overflow:visible;filter:drop-shadow(0 0 7px rgba(95,212,255,.35))}
.wt-fill{fill:url(#wt-grad)}
.wt-defs{position:absolute;width:0;height:0}
.wt-edge{fill:none;stroke:rgba(95,212,255,.75);stroke-width:1.4;animation:wt-glow 3.2s ease-in-out infinite;animation-delay:calc(var(--i) * .4s)}
@keyframes wt-glow{0%,100%{stroke:rgba(95,212,255,.55)}50%{stroke:rgba(168,236,255,1)}}
.wt-share{fill:var(--cy);opacity:.85}
.wt-band:hover .wt-fill{fill:url(#wt-grad-hi)}
.wt-band.on .wt-edge{stroke:var(--gold);animation:none;stroke-width:2}
.wt-band.on .wt-shape{filter:drop-shadow(0 0 10px rgba(226,198,143,.55))}
.wt-band.on .wt-share{fill:var(--gold)}.wt-band.on .wt-fill{fill:url(#wt-grad-on)}
.wt-band.zero:not(.on) .wt-fill{fill:rgba(10,30,56,.5)}.wt-band.zero .wt-n{color:#7f97b8;text-shadow:none}
.wt-band:focus-visible{outline:none}.wt-band:focus-visible .wt-edge{stroke:#fff;stroke-width:2}
.wt-in{position:relative;display:grid;justify-items:center;gap:2px;width:100%;min-width:0;text-align:center}
.wt-l{display:inline-flex;align-items:center;gap:6px;font-family:var(--hud);font-size:12.5px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:var(--cy2)}
.wt-n{font-size:32px;line-height:1.05;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;text-shadow:0 0 16px rgba(95,212,255,.65)}
.wt-st{display:grid;grid-template-columns:repeat(3,minmax(0,auto));gap:2px 14px;justify-content:center}
.wt-st span{display:grid;justify-items:center;min-width:0}
.wt-st b{font-size:13.5px;font-weight:600;color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap}
.wt-st em{font-style:normal;font-size:11px;color:var(--soft);white-space:nowrap}
.wt-flow{position:relative;display:flex;align-items:center;justify-content:center;width:100%;height:40px}
.wt-pipe{position:absolute;left:50%;top:-6px;bottom:-6px;width:2px;transform:translateX(-50%);background:linear-gradient(180deg,rgba(95,212,255,.15),rgba(95,212,255,.45),rgba(95,212,255,.15));overflow:visible}
.wt-flow:not(.on) .wt-pipe{background:rgba(95,212,255,.12)}
.wt-pipe i{position:absolute;left:50%;top:0;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:#bff3ff;box-shadow:0 0 8px 2px rgba(95,212,255,.8);
  animation:wt-drop 1.6s linear infinite;animation-delay:calc(var(--k) * -.53s);opacity:0}
@keyframes wt-drop{0%{transform:translateY(0);opacity:0}15%{opacity:1}85%{opacity:1}100%{transform:translateY(48px);opacity:0}}
.wt-rate{position:relative;display:inline-flex;align-items:center;gap:5px;margin-left:96px;padding:3px 10px;border:1px solid rgba(226,198,143,.4);border-radius:999px;background:rgba(20,16,8,.75);
  font-size:13px;font-weight:700;color:var(--gold2);font-variant-numeric:tabular-nums;white-space:nowrap}
.wt-rate small{font-size:11px;font-weight:500;color:var(--soft)}
.wt-det{display:grid;gap:14px;padding:14px;border:1px solid var(--line);border-radius:8px;background:rgba(4,12,26,.6);min-width:0;align-self:start}
.wt-det header{display:flex;align-items:center;gap:8px;min-width:0}
.wt-di{display:inline-grid;place-items:center;width:30px;height:30px;border-radius:50%;border:1px solid rgba(226,198,143,.5);color:var(--gold2)}
.wt-det h3,.dash .wt-det h3{margin:0;font-family:var(--hud);font-size:15px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#fff}
.wt-dn{margin-left:auto;font-size:13px;color:var(--soft);white-space:nowrap}
.wt-det section,.dash .wt-det section{display:grid;gap:6px;min-width:0;margin:0;padding:0;border:0;background:none;box-shadow:none}
.dash .wt-det header,.dash .wt-head{margin:0;padding:0;border:0;background:none;position:relative}
.wt-det h4,.dash .wt-det h4{margin:0;font-size:12px;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:var(--cy2)}
.wt-none{margin:0;font-size:13px;color:var(--soft)}
.wt-bars{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.wt-bars li{display:grid;grid-template-columns:minmax(0,118px) minmax(0,1fr) auto;gap:8px;align-items:center;font-size:13px}
.wt-bl{display:inline-flex;align-items:center;gap:6px;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wt-bl i{flex:0 0 auto;width:9px;height:9px;border-radius:2px}
.wt-bb{display:block;height:8px;border-radius:0 4px 4px 0;background:rgba(95,212,255,.07);overflow:hidden;min-width:0}
.wt-bb i{display:block;height:100%;background:linear-gradient(90deg,var(--cy),#2f9fd0);border-radius:0 4px 4px 0}
.wt-bars b{color:#fff;font-weight:600;font-variant-numeric:tabular-nums;text-align:right}
.wt-sb{display:flex;gap:2px;height:12px;border-radius:4px;overflow:hidden}.wt-sb i:first-child{background:var(--cy)}.wt-sb i:last-child{background:#2f7fb0}
.wt-sl{display:flex;justify-content:space-between;gap:8px;margin-top:6px;font-size:13px;color:var(--soft)}.wt-sl b{color:#fff}
.wt-foot{position:relative;margin:0;font-size:12px;color:var(--soft)}
@media (prefers-reduced-motion:reduce){
  .wt-li,.wt-edge{animation:none}
  .wt-pipe i{display:none}
}
@media (max-width:900px){.wt-body{grid-template-columns:minmax(0,1fr)}}
@media (max-width:560px){
  .wt{padding:14px 12px 12px}
  .dash .wt-band{height:112px}
  .wt-head h2{font-size:15px;letter-spacing:.18em}
  .wt-kpis{gap:6px}.wt-kpis div{padding:8px 8px}.wt .wt-kpis b{font-size:18px}.wt-kpis div>span{font-size:11.5px}
  .wt-band{height:112px}
  .wt-n{font-size:28px}
  .wt-st{gap:2px 10px}.wt-st b{font-size:12.5px}.wt-st em{font-size:10.5px}
  .wt-l{font-size:11.5px;letter-spacing:.12em}
  .wt-rate{margin-left:64px}
  .wt-bars li{grid-template-columns:minmax(0,96px) minmax(0,1fr) auto}
}
`;

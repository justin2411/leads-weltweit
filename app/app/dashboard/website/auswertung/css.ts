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
.wa-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}
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
`;

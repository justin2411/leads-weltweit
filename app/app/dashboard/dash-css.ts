/** Design des Inhaber-Dashboards: wie die Website (Nachtblau, Papier, Gold, Inter), alles unter .dash. */
export const DASH_CSS = `
.dash{--ink:#0b1320;--ink2:#16223a;--paper:#f7f4ee;--card:#fffdf9;--text:#161b24;--soft:#5b6372;--line:#e4ddd0;--gold:#b08d57;--gold2:#d8bd8a;
  --red:#b3261e;--red-bg:#fbeceb;--amber:#9a6412;--amber-bg:#fdf3e1;--green:#2f7d4f;--green-bg:#e9f4ed;--blue:#2c5d9e;--blue-bg:#e8eff9;
  background:var(--paper);color:var(--text);min-height:100vh;font-family:var(--sans),system-ui,sans-serif;font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
.dash *{box-sizing:border-box}
.dash a{color:var(--blue)}
.dash .top{background:var(--ink);color:#f4efe6;position:sticky;top:0;z-index:20;border-bottom:1px solid rgba(216,189,138,.25)}
.dash .top .in{max-width:1240px;margin:0 auto;padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.dash .mark{font-weight:700;font-size:18px;letter-spacing:-.01em}.dash .mark i{font-style:normal;color:var(--gold2)}
.dash .top .stamp{color:#9aa6ba;font-size:13px}
.dash .top .sp{flex:1}
.dash .top button,.dash .top .btn{background:transparent;color:#f4efe6;border:1px solid rgba(216,189,138,.5);border-radius:99px;padding:5px 14px;font:inherit;font-size:13px;cursor:pointer}
.dash .top button:hover{background:rgba(216,189,138,.14)}
.dash .tabs{max-width:1240px;margin:0 auto;padding:0 16px 10px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
.dash .tabs a{color:#d5dbe5;text-decoration:none;font-size:13px;padding:4px 12px;border-radius:99px;white-space:nowrap;border:1px solid rgba(255,255,255,.08)}
.dash .tabs a:hover{border-color:var(--gold2);color:var(--gold2)}
.dash main{max-width:1240px;margin:0 auto;padding:20px 16px 80px}
.dash section{scroll-margin-top:110px;margin-top:34px}
.dash h1{font-size:24px;margin:4px 0 2px;letter-spacing:-.01em}
.dash h2{font-size:19px;margin:0 0 4px;letter-spacing:-.01em;display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.dash h3{font-size:15px;margin:18px 0 8px}
.dash .eyebrow{font-size:11px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold);font-weight:600}
.dash .sub{color:var(--soft);font-size:13px;margin:0 0 12px}
.dash .muted{color:var(--soft)}.dash .small{font-size:12px}
.dash .card{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px;box-shadow:0 1px 2px rgba(11,19,32,.04)}
.dash .grid{display:grid;gap:12px}
.dash .kpis{grid-template-columns:repeat(auto-fill,minmax(160px,1fr))}
.dash .kpi .v{font-size:26px;font-weight:700;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1.15}
.dash .kpi .l{font-size:12px;color:var(--soft);margin-top:2px}
.dash .kpi .h{font-size:12px;color:var(--soft);margin-top:6px}
.dash .lights{display:flex;gap:8px;flex-wrap:wrap;margin:10px 0 12px}
.dash .pill{display:inline-flex;align-items:center;gap:6px;border-radius:99px;padding:2px 10px;font-size:12px;font-weight:600;white-space:nowrap}
.dash .pill:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.dash .rot{color:var(--red);background:var(--red-bg)}.dash .gelb{color:var(--amber);background:var(--amber-bg)}.dash .gruen{color:var(--green);background:var(--green-bg)}
.dash .t-gold{color:#7a5a24;background:#f6ecd9}.dash .t-green{color:var(--green);background:var(--green-bg)}.dash .t-blue{color:var(--blue);background:var(--blue-bg)}
.dash .t-grey{color:var(--soft);background:#eeebe4}.dash .t-red{color:var(--red);background:var(--red-bg)}
.dash .alerts{display:grid;gap:8px}
.dash .alert{display:grid;grid-template-columns:auto 1fr;gap:4px 12px;align-items:start;background:var(--card);border:1px solid var(--line);border-left:4px solid var(--line);border-radius:10px;padding:10px 12px}
.dash .alert.lv-rot{border-left-color:var(--red)}.dash .alert.lv-gelb{border-left-color:#d79a2b}.dash .alert.lv-gruen{border-left-color:var(--green)}
.dash .alert .area{font-size:11px;letter-spacing:.12em;text-transform:uppercase;color:var(--soft);font-weight:600;padding-top:2px;min-width:78px}
.dash .alert .ti{font-weight:600}.dash .alert .de{grid-column:2;color:var(--soft);font-size:13px;overflow-wrap:anywhere}
.dash details.ok-list>summary{cursor:pointer;color:var(--soft);font-size:13px;margin:6px 0}
.dash .funnels{grid-template-columns:repeat(auto-fit,minmax(340px,1fr))}
.dash .fun h3{margin:0 0 2px;display:flex;justify-content:space-between;align-items:baseline;gap:8px}
.dash .steps{list-style:none;margin:10px 0 0;padding:0;display:grid;gap:6px}
.dash .step{display:grid;grid-template-columns:150px 1fr 70px;gap:10px;align-items:center;font-size:13px}
.dash .step .bar{height:10px;background:#efe9de;border-radius:99px;overflow:hidden}
.dash .step .bar i{display:block;height:100%;background:linear-gradient(90deg,var(--gold),var(--gold2));border-radius:99px;min-width:2px}
.dash .step .n{text-align:right;font-weight:700;font-variant-numeric:tabular-nums}
.dash .step .x{grid-column:1/-1;margin:-4px 0 2px;color:var(--soft);font-size:12px}
.dash .rule{margin-top:10px;font-size:12px;padding:6px 10px;border-radius:8px;background:#f3eee4;color:var(--soft)}
.dash .tbl{overflow-x:auto;-webkit-overflow-scrolling:touch;border:1px solid var(--line);border-radius:12px;background:var(--card)}
.dash table{width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;font-size:13px}
.dash th,.dash td{text-align:left;padding:8px 10px;border-bottom:1px solid var(--line);vertical-align:top}
.dash tr:last-child td{border-bottom:0}
.dash th{color:var(--soft);font-weight:600;font-size:12px;background:#faf7f1;white-space:nowrap;position:sticky;top:0}
.dash td.num,.dash th.num{text-align:right;white-space:nowrap}
.dash td.nw{white-space:nowrap}
.dash tr.total td{font-weight:700;background:#faf7f1}
.dash .two{display:grid;gap:16px;grid-template-columns:repeat(auto-fit,minmax(360px,1fr))}
.dash details.more{margin-top:12px}.dash details.more>summary{cursor:pointer;font-weight:600;color:var(--text);padding:8px 0}
.dash .meter{height:8px;background:#efe9de;border-radius:99px;overflow:hidden;margin-top:6px}.dash .meter i{display:block;height:100%;background:var(--ink2)}
.dash .meter.warn i{background:#d79a2b}.dash .meter.bad i{background:var(--red)}
.dash form{margin:0}
.dash input,.dash select,.dash textarea{font:inherit;font-size:14px;padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--text)}
.dash button{font:inherit;font-size:14px;padding:7px 14px;border:1px solid var(--line);border-radius:8px;background:#fff;color:var(--text);cursor:pointer}
.dash button.primary{background:var(--ink);border-color:var(--ink);color:#f4efe6}.dash button:disabled{opacity:.45;cursor:not-allowed}
.dash .row{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.dash pre{white-space:pre-wrap;font:inherit;margin:6px 0;font-size:13px}
.dash .bad{color:var(--red)}.dash .ok{color:var(--green)}
.dash .legacy .card{margin:10px 0}.dash .legacy h2{font-size:16px;margin-top:22px}
.dash .legacy .scroll{overflow-x:auto}
@media (max-width:640px){
  .dash main{padding:14px 12px 60px}.dash h1{font-size:20px}
  .dash .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .dash .kpi .v{font-size:22px}
  .dash .funnels,.dash .two{grid-template-columns:minmax(0,1fr)}
  .dash .step{grid-template-columns:120px 1fr 56px}
  .dash .alert{grid-template-columns:1fr}.dash .alert .de{grid-column:1}.dash .alert .area{padding:0}
  .dash .top .stamp{width:100%;order:3}
  .dash th,.dash td{padding:7px 8px}
  .dash table.cards thead{display:none}
  .dash table.cards tr{display:block;padding:10px 12px;border-bottom:1px solid var(--line)}
  .dash table.cards tr:last-child{border-bottom:0}
  .dash table.cards td{display:block;border:0;padding:2px 0;white-space:normal}
  .dash table.cards td[data-l]:before{content:attr(data-l) ": ";color:var(--soft);font-size:12px}
}
`;

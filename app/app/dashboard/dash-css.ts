/** Design des Inhaber-Dashboards: wie die Website (Nachtblau, Papier, Gold, Inter), alles unter .dash. */
export const DASH_CSS = `
.dash{--ink:#0b1320;--ink2:#16223a;--paper:#f7f4ee;--card:#fffdf9;--text:#161b24;--soft:#5b6372;--line:#e4ddd0;--gold:#b08d57;--gold2:#d8bd8a;
  --red:#b3261e;--red-bg:#fbeceb;--amber:#9a6412;--amber-bg:#fdf3e1;--green:#2f7d4f;--green-bg:#e9f4ed;--blue:#2c5d9e;--blue-bg:#e8eff9;
  background:var(--paper);color:var(--text);min-height:100vh;font-family:var(--sans),system-ui,sans-serif;font-size:15px;line-height:1.5;-webkit-font-smoothing:antialiased}
.dash *{box-sizing:border-box}
.dash a{color:var(--blue)}
.dash .top{background:var(--ink);color:#f4efe6;position:sticky;top:0;z-index:20;border-bottom:1px solid rgba(216,189,138,.25)}
.dash .top .in{max-width:var(--wmax,1240px);margin:0 auto;padding:12px 16px;display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.dash .mark{font-weight:700;font-size:18px;letter-spacing:-.01em}.dash .mark i{font-style:normal;color:var(--gold2)}
.dash .top .stamp{color:#9aa6ba;font-size:13px}
.dash .top .sp{flex:1}
.dash .top button,.dash .top .btn{background:transparent;color:#f4efe6;border:1px solid rgba(216,189,138,.5);border-radius:99px;padding:5px 14px;font:inherit;font-size:13px;cursor:pointer}
.dash .top button:hover{background:rgba(216,189,138,.14)}
.dash .tabs{max-width:var(--wmax,1240px);margin:0 auto;padding:0 16px 10px;display:flex;gap:6px;overflow-x:auto;scrollbar-width:none}
.dash .tabs a{color:#d5dbe5;text-decoration:none;font-size:13px;padding:4px 12px;border-radius:99px;white-space:nowrap;border:1px solid rgba(255,255,255,.08)}
.dash .tabs a:hover{border-color:var(--gold2);color:var(--gold2)}
.dash main{max-width:var(--wmax,1240px);margin:0 auto;padding:20px 16px 80px}
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
.dash .pill{display:inline-flex;align-items:center;gap:6px;border-radius:99px;padding:2px 10px;font-size:12px;font-weight:600;white-space:nowrap}
.dash .pill:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.dash .rot{color:var(--red);background:var(--red-bg)}.dash .gelb{color:var(--amber);background:var(--amber-bg)}.dash .gruen{color:var(--green);background:var(--green-bg)}
.dash .t-gold{color:#7a5a24;background:#f6ecd9}.dash .t-green{color:var(--green);background:var(--green-bg)}.dash .t-blue{color:var(--blue);background:var(--blue-bg)}
.dash .t-grey{color:var(--soft);background:#eeebe4}.dash .t-red{color:var(--red);background:var(--red-bg)}
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
@media (max-width:640px){
  .dash main{padding:14px 12px 60px}.dash h1{font-size:20px}
  .dash .kpis{grid-template-columns:repeat(2,minmax(0,1fr))}
  .dash .kpi .v{font-size:22px}
  .dash .two{grid-template-columns:minmax(0,1fr)}
  .dash .step{grid-template-columns:120px 1fr 56px}
  .dash .top .stamp{width:100%;order:3}
  .dash th,.dash td{padding:7px 8px}
  .dash table.cards thead{display:none}
  .dash table.cards tr{display:block;padding:10px 12px;border-bottom:1px solid var(--line)}
  .dash table.cards tr:last-child{border-bottom:0}
  .dash table.cards td{display:block;border:0;padding:2px 0;white-space:normal}
  .dash table.cards td[data-l]:before{content:attr(data-l) ": ";color:var(--soft);font-size:12px}
}
`;

/** v2: Übersicht mit Unterseiten, wenig Text, große Zahlen, Grafiken. */
export const DASH_V2_CSS = `
.dash .top .in{gap:10px}
.dash .top .tag{font-size:12px;color:var(--gold2);border:1px solid rgba(216,189,138,.4);border-radius:99px;padding:2px 10px}
.dash .top .ib,.dash .ib{width:38px;height:38px;padding:0;display:inline-flex;align-items:center;justify-content:center;border-radius:50%;line-height:0;flex:none}
.dash .ib svg{display:block;width:19px;height:19px}
.dash .ibf{display:inline-flex}
.dash button.danger{background:#b3261e;border-color:#b3261e;color:#fff}
.dash .ctrl textarea,.dash .ctrl input:not([type=checkbox]):not([type=number]),.dash .ctrl select{width:100%;font:inherit;font-size:14px}
.dash .ctrl .acts2 select{width:auto;flex:1}
.dash i.dot{display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:6px}
.dash .werke{display:grid;gap:12px;grid-template-columns:repeat(5,minmax(0,1fr))}
.dash .werk{padding:14px;display:grid;gap:8px;align-content:start}
.dash .werk .th{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:14px;gap:6px}
.dash .funnel{display:grid;gap:8px}
.dash .fstep{display:grid;grid-template-columns:130px 1fr 70px;gap:10px;align-items:center;font-size:13px;cursor:default}
.dash .fb{height:14px;background:#efe6d6;border-radius:4px;overflow:hidden}.dash .fb i{display:block;height:100%;background:var(--ink2);border-radius:0 4px 4px 0}
.dash .fn{text-align:right;font-weight:700}
.dash .bar.wide{grid-template-columns:minmax(0,200px) 1fr 64px}.dash .bar.wide .bk{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
@media (max-width:1000px){.dash .werke{grid-template-columns:repeat(2,minmax(0,1fr))}}
@media (max-width:640px){.dash .werke{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.dash .werk{padding:10px;gap:4px}.dash .werk .facts{font-size:11px}.dash .werk .th{font-size:13px;flex-wrap:wrap}.dash .fstep{grid-template-columns:96px 1fr 56px}.dash .bar.wide{grid-template-columns:minmax(0,120px) 1fr 56px}}
.dash .more-btn{justify-self:center;font-weight:600;color:var(--ink);background:var(--card);border:1px solid var(--line);border-radius:99px;padding:8px 18px;text-decoration:none}
.dash .flash{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:60;padding:10px 18px;border-radius:99px;font-weight:600;font-size:14px;box-shadow:0 10px 30px -10px rgba(0,0,0,.35)}
.dash .flash.good{background:#e9f4ed;color:#1d5e33;border:1px solid #bfe0c6}.dash .flash.bad{background:#fbeceb;color:#8f1f18;border:1px solid #efc6c4}
.dash .col.link{cursor:pointer}
.dash .col:focus{outline:none}.dash .col:focus-visible .stack{outline:2px solid var(--gold);outline-offset:2px}
.dash .tip{position:absolute;top:0;z-index:20;min-width:160px;background:var(--ink);color:#f4efe6;border-radius:10px;padding:10px 12px;font-size:12px;display:grid;gap:4px;box-shadow:0 12px 30px -12px rgba(0,0,0,.5);pointer-events:auto}
.dash .tip.right{left:50%}.dash .tip.left{right:50%}
.dash .tip b{font-size:13px;margin-bottom:2px}
.dash .tip .tr{display:flex;align-items:center;gap:6px;white-space:nowrap}.dash .tip .tr i{width:9px;height:9px;border-radius:2px;flex:none}
.dash .tip .tr em{font-style:normal;font-weight:700;margin-left:auto;padding-left:14px}
.dash .tip .tr.sum{border-top:1px solid rgba(255,255,255,.15);padding-top:4px;margin-top:2px}
.dash .tip .tl{color:var(--gold2);font-weight:600;text-decoration:none;margin-top:4px}
.dash .kpi2.link{position:relative;cursor:pointer;transition:border-color .2s}.dash .kpi2.link:hover{border-color:var(--gold)}
.dash .kgo{position:absolute;right:12px;top:10px;color:var(--gold);font-weight:700}
.dash .ctrls{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(260px,1fr))}
.dash .ctrl{padding:14px 16px;display:grid;gap:10px;align-content:start}
.dash .ctrl .th{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:14px}
.dash .ctrl .th span[title]{cursor:help}
.dash .lock{font-size:11px;color:var(--soft);font-weight:600}
.dash .ctrl form{display:grid;gap:8px}
.dash .ctrl form.sw{display:inline-flex;gap:0;justify-self:start}
.dash .ctrl .frow{display:grid;grid-template-columns:44px 1fr auto;gap:8px;align-items:center;font-size:13px}
.dash .ctrl .frow input[type=number]{width:100%}
.dash .ctrl .hint{font-size:12px;color:var(--soft)}
.dash .ctrl .hint.warn{color:#9a6412}
.dash .sw{display:inline-flex;gap:0;border:1px solid var(--line);border-radius:99px;overflow:hidden}
.dash .sw button{border:0;border-radius:0;padding:6px 14px;font-weight:600;background:#fff}
.dash .sw button.on{background:var(--ink);color:#f4efe6}
.dash .sw button.on.go{background:#0f7a3a}.dash .sw button.on.stop{background:#b3261e}
.dash .tog{display:flex;gap:6px;flex-wrap:wrap}
.dash .tog button{border-radius:99px;font-weight:600;font-size:13px;padding:6px 12px;display:inline-flex;gap:6px;align-items:center}
.dash .tog button.off{opacity:.55;text-decoration:line-through}
.dash .tog button i{width:8px;height:8px;border-radius:50%}
.dash .acts2{display:flex;gap:6px;flex-wrap:wrap}
.dash .acts2 button{font-size:13px}
.dash .facts{display:grid;gap:4px;font-size:12px;color:var(--soft)}.dash .facts b{color:var(--text)}
.dash .lrow{display:grid;grid-template-columns:minmax(0,1.2fr) 52px 110px minmax(0,2fr);gap:10px;align-items:center;padding:10px 4px;border-bottom:1px solid var(--line);font-size:13px;color:inherit;text-decoration:none}
.dash a.lrow:hover{background:#faf6ee}
.dash .lrow:last-child{border-bottom:0}
.dash .lrow .lt{color:var(--soft);overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
@media (max-width:640px){.dash .lrow{grid-template-columns:minmax(0,1fr) auto;row-gap:2px}.dash .lrow .lt{grid-column:1/-1}}
.dash .tabs-wrap .tabs{max-width:var(--wmax,1240px);margin:0 auto;padding:0 16px 10px}
.dash .tabs a.on{background:var(--gold2);color:var(--ink);border-color:var(--gold2);font-weight:600}
.dash .bnav{display:none}
.dash .v2{display:grid;gap:16px;grid-template-columns:minmax(0,1fr)}
.dash .v2 section{margin-top:0}
.dash .crumbs{font-size:13px;color:var(--soft)}.dash .crumbs a{color:var(--soft)}.dash .crumbs b{color:var(--gold);font-weight:400}
.dash .crumbs [aria-current]{color:var(--text);font-weight:600}
.dash .head2{display:flex;gap:10px;align-items:center;justify-content:space-between;flex-wrap:wrap}
.dash .sub2{font-size:13px;color:var(--soft)}
.dash .h2s{font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);margin:6px 0 -6px}
.dash .amp{display:flex;gap:8px;flex-wrap:wrap}
.dash .amp-i{display:inline-flex;align-items:center;gap:8px;border-radius:99px;padding:6px 14px 6px 6px;font-weight:600;font-size:14px;background:var(--card);border:1px solid var(--line);color:var(--text);cursor:default}
.dash .amp-i b{width:22px;height:22px;border-radius:50%;display:grid;place-items:center;color:#fff;font-size:12px}
.dash .amp-i.rot b{background:#d03b3b}.dash .amp-i.gelb b{background:#c98a12}.dash .amp-i.gruen b{background:#0ca30c}
.dash .amp-i.rot{border-color:#efc6c4}.dash .amp-i.gelb{border-color:#ecd7ae}.dash .amp-i.gruen{border-color:#bfe0c6}
.dash .chips{display:flex;gap:6px;flex-wrap:wrap;min-width:0}
.dash .chips a{display:inline-flex;align-items:center;gap:6px;text-decoration:none;color:var(--text);font-size:13px;font-weight:600;padding:6px 12px;border-radius:99px;border:1px solid var(--line);background:var(--card);white-space:nowrap}
.dash .chips a i{width:8px;height:8px;border-radius:50%}
.dash .chips a.on{background:var(--ink);color:#f4efe6;border-color:var(--ink)}
.dash .chain{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:18px}
.dash .chain li{position:relative}
.dash .chain li>a{background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 8px 12px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:2px;color:inherit;text-decoration:none;height:100%;transition:border-color .2s,transform .2s}
.dash .chain li>a:hover{border-color:var(--gold);transform:translateY(-1px)}
.dash .chain li:not(:last-child):after{content:"";position:absolute;right:-14px;top:50%;width:10px;height:10px;border-top:2px solid var(--gold);border-right:2px solid var(--gold);transform:translateY(-50%) rotate(45deg)}
.dash .chain .v{font-size:28px;font-weight:700;letter-spacing:-.02em;line-height:1.1;white-space:nowrap}
.dash .chain .l{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);font-weight:700}
.dash .chain .s{font-size:12px;color:var(--soft)}
.dash .chain li.neck>a{border:2px solid #d03b3b;background:#fdf1f0}
.dash .neck-tag{position:absolute;top:-10px;left:50%;transform:translateX(-50%);background:#d03b3b;color:#fff;font-size:10px;font-weight:700;letter-spacing:.06em;padding:2px 8px;border-radius:99px;white-space:nowrap}
.dash .tiles{display:grid;gap:14px;grid-template-columns:repeat(3,minmax(0,1fr))}
.dash .tile{display:flex;flex-direction:column;gap:12px;padding:16px}
.dash .tile.wide{grid-column:1/-1}
.dash .tile .th{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:15px}
.dash .th2{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:15px;margin-bottom:-4px}
.dash .th2 .more,.dash .tile .th .more{font-size:13px;font-weight:600;color:var(--gold);text-decoration:none}
.dash .kpis2{display:grid;gap:10px;grid-template-columns:repeat(4,minmax(0,1fr))}
.dash .kpis2.two{grid-template-columns:repeat(2,minmax(0,1fr))}
.dash .kpis2.eight{grid-template-columns:repeat(4,minmax(0,1fr))}
.dash .kpi2{display:flex;flex-direction:column;gap:2px;padding:12px 14px;border-radius:12px;background:#faf6ee;border:1px solid var(--line);color:inherit;text-decoration:none;cursor:default}
.dash .v2>.kpis2 .kpi2{background:var(--card)}
.dash .kv{font-size:30px;font-weight:700;letter-spacing:-.02em;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dash .kl{font-size:12px;color:var(--soft)}
.dash .kd{font-size:12px;font-weight:700;color:var(--soft)}.dash .kd.up{color:#006300}.dash .kd.down{color:#b3261e}
.dash .mini{font-size:13px;color:var(--soft)}.dash .mini b{color:var(--text);font-size:15px}
.dash .stagebar{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}
.dash .stagebar a{display:flex;flex-direction:column;align-items:center;gap:2px;padding:10px 4px;border-radius:10px;background:#faf6ee;border:1px solid var(--line);color:inherit;text-decoration:none;text-align:center}
.dash .stagebar a:hover{border-color:var(--gold)}
.dash .stagebar b{font-size:22px}.dash .stagebar span{font-size:11px;color:var(--soft);line-height:1.2}
.dash .vizgrid{display:grid;gap:14px;grid-template-columns:repeat(2,minmax(0,1fr))}
.dash .viz{margin:0;padding:14px 14px 8px}
.dash .viz figcaption{font-weight:700;font-size:15px;margin-bottom:4px;cursor:default}
.dash .legend{display:flex;gap:12px;flex-wrap:wrap;font-size:12px;color:var(--soft)}
.dash .legend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px;vertical-align:-1px}
.dash .cols{position:relative;margin:6px 0 4px 52px}
.dash .cols-grid{position:absolute;inset:0 0 20px 0;display:flex;flex-direction:column;justify-content:space-between;pointer-events:none}
.dash .cols-grid div{border-top:1px solid #ece6da;height:0;position:relative}.dash .cols-grid div.base{border-top-color:#cfc6b6}
.dash .cols-grid span{position:absolute;right:calc(100% + 6px);top:-8px;font-size:11px;color:#8a8479;white-space:nowrap}
.dash .cols-plot{position:absolute;inset:0;display:flex;align-items:stretch}
.dash .col{flex:1;display:flex;flex-direction:column;justify-content:flex-end;align-items:center;min-width:0;padding-bottom:20px;position:relative;cursor:default}
.dash .col:hover{background:rgba(176,141,87,.06)}
.dash .stack{width:min(24px,62%);display:flex;flex-direction:column;gap:2px;position:relative}
.dash .stack i{display:block;min-height:1px;flex-basis:0}.dash .stack i:first-of-type{border-radius:4px 4px 0 0}
.dash .cv{position:absolute;bottom:calc(100% + 3px);left:50%;transform:translateX(-50%);font-size:12px;font-weight:700;white-space:nowrap}
.dash .cl{position:absolute;bottom:2px;font-size:11px;color:#8a8479;white-space:nowrap}
.dash svg .grid{stroke:#ece6da;stroke-width:1}.dash svg .base{stroke:#cfc6b6;stroke-width:1}
.dash svg .tick{fill:#8a8479;font-size:11px}.dash svg .val{fill:var(--text);font-size:12px;font-weight:700}
.dash .fills{display:grid;gap:12px}
.dash .fill{display:grid;grid-template-columns:minmax(40px,auto) 1fr 52px;gap:10px;align-items:center;font-size:13px;cursor:default}
.dash .ft{height:12px;background:#efe6d6;border-radius:99px;overflow:hidden}
.dash .ft i{display:block;height:100%;border-radius:99px;background:var(--ink2)}
.dash .ft i.gelb{background:#c98a12}.dash .ft i.rot{background:#d03b3b}
.dash .fv{text-align:right;font-weight:700;white-space:nowrap}
.dash .st{display:inline-grid;place-items:center;width:16px;height:16px;border-radius:50%;color:#fff;font-size:10px;margin-right:4px;vertical-align:1px}.dash .st.rot{background:#d03b3b}
.dash .bars2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.dash .bt{font-size:12px;color:var(--soft);margin-bottom:6px;font-weight:600}
.dash .bar{display:grid;grid-template-columns:26px 1fr 64px;gap:8px;align-items:center;font-size:13px;margin-bottom:8px;cursor:default}
.dash .bb{height:14px}.dash .bb i{display:block;height:100%;border-radius:0 4px 4px 0}
.dash .bv{text-align:right;font-weight:700;white-space:nowrap}
.dash .big1{font-size:15px;color:var(--soft)}.dash .big1 b{font-size:34px;color:var(--text);margin-right:6px}
.dash .kanban{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:10px;align-items:start}
.dash .kcol{background:#efe9de;border-radius:14px;padding:8px;display:grid;gap:8px}
.dash .kcol.out{opacity:.75}
.dash .kh{display:flex;flex-direction:column;align-items:flex-start;padding:6px 8px;color:inherit;text-decoration:none}
.dash .kh b{font-size:28px;line-height:1.1}.dash .kh span{font-size:12px;color:var(--soft);font-weight:600}
.dash .kc{display:grid;gap:6px}
.dash .kcard{display:grid;gap:4px;background:var(--card);border:1px solid var(--line);border-radius:10px;padding:8px 10px;color:inherit;text-decoration:none;font-size:13px}
.dash a.kcard:hover{border-color:var(--gold)}
.dash .cn{font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash .cm{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--soft)}
.dash .cm i{width:8px;height:8px;border-radius:50%;display:inline-block}
.dash .cm .pill{font-size:11px;padding:1px 8px}
.dash .ca{margin-left:auto}
.dash .kmore{font-size:13px;font-weight:700;color:var(--gold);text-decoration:none;padding:4px 8px}
.dash .klist{display:grid;gap:0;padding:4px 12px}
.dash .klist .kcard{border:0;border-bottom:1px solid var(--line);border-radius:0;padding:10px 2px;grid-template-columns:minmax(0,1fr) auto;align-items:center}
.dash .klist .kcard:last-child{border-bottom:0}
.dash .t-next{color:var(--text);background:#fff;border:1px solid var(--line)}.dash .t-next:before{display:none}
.dash .firm h1{margin:0 0 6px;font-size:24px}.dash .firm .cm{font-size:14px}
.dash .timeline{list-style:none;margin:0;padding:6px 14px}
.dash .timeline li{display:grid;grid-template-columns:110px auto minmax(0,1fr);gap:10px;align-items:center;padding:10px 0;border-bottom:1px solid var(--line);font-size:13px}
.dash .timeline li:last-child{border-bottom:0}
.dash .timeline .tt{color:var(--soft);white-space:nowrap}.dash .timeline .pill{justify-self:start}.dash .timeline .tx{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
/* Gehirn + Freigaben (Inhaber 04.10.2026: alte Ansicht raus) */
.dash .swrow{display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:13px}
.dash .swrow .sw button{padding:5px 12px;font-size:13px}
.dash .klist .kcard.stack{grid-template-columns:minmax(0,1fr);align-items:start}
.dash .kcard.stack .acts2 input{width:150px;min-width:0;font-size:13px;padding:6px 10px}
.dash .tile .klist{padding:0}.dash .tile .klist .kcard>.cm{grid-column:1/-1}
.dash details.why>summary{cursor:pointer;font-size:12px;color:var(--soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash details.why p,.dash details.why pre{font-size:13px;margin:6px 0 0;overflow-wrap:anywhere}
.dash details.envs>summary{cursor:pointer;list-style:none}.dash details.envs>summary::-webkit-details-marker{display:none}
.dash details.envs code{font-family:var(--monof),monospace;font-size:12px;overflow-wrap:anywhere}
.dash .ctrl.evs .timeline{padding:0}
@media (max-width:1000px){
  .dash .chain{grid-template-columns:repeat(4,minmax(0,1fr));row-gap:22px}
  .dash .chain li:nth-child(4):after{display:none}
  .dash .tiles{grid-template-columns:repeat(2,minmax(0,1fr))}
  .dash .kanban{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media (max-width:640px){
  .dash .tabs-wrap{display:none}
  .dash .bnav{display:grid;grid-template-columns:repeat(7,1fr);position:fixed;left:0;right:0;bottom:0;z-index:30;background:var(--ink);border-top:1px solid rgba(216,189,138,.3);padding:6px 4px calc(6px + env(safe-area-inset-bottom))}
  .dash .bnav a{display:flex;flex-direction:column;align-items:center;gap:1px;color:#c9d0db;text-decoration:none;font-size:10px;padding:4px 0}
  .dash .bnav a .bi{font-size:17px;line-height:1.1}
  .dash .bnav a.on{color:var(--gold2)}
  .dash main{padding-bottom:90px}
  .dash .chain{gap:12px;row-gap:20px}
  .dash .chain li>a{padding:12px 4px 8px}
  .dash .chain li:not(:last-child):after{right:-10px;width:7px;height:7px}
  .dash .chain .v{font-size:18px}.dash .chain .l{font-size:8.5px;letter-spacing:0;max-width:100%;overflow:hidden;text-overflow:ellipsis}.dash .chain .s{font-size:10px}
  .dash .tiles,.dash .vizgrid{grid-template-columns:minmax(0,1fr)}
  .dash .kpis2,.dash .kpis2.eight{grid-template-columns:repeat(2,minmax(0,1fr))}
  .dash .kv{font-size:24px}
  .dash .stagebar b{font-size:18px}.dash .stagebar span{font-size:10px}
  .dash .kanban{grid-template-columns:minmax(0,1fr)}
  .dash .kcol{grid-template-columns:minmax(0,1fr)}
  .dash .kh{flex-direction:row;align-items:baseline;gap:8px}
  .dash .chips{flex-wrap:nowrap;overflow-x:auto;max-width:100%;scrollbar-width:none;padding-bottom:2px}
  .dash .head2{flex-direction:column;align-items:stretch}
  .dash .timeline li{grid-template-columns:auto minmax(0,1fr);row-gap:2px}.dash .timeline .tx{grid-column:1/-1}
  .dash .bars2{grid-template-columns:minmax(0,1fr)}
}
`;

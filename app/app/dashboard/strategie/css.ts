/** Strategie-Seite: JARVIS-Design (Cyan/Gold auf Nachtblau), Kästen bündig, Handy ohne Querscrollen, Bewegung nur ohne prefers-reduced-motion. */
export const STRATEGIE_CSS = `
.stg{--cy:#5fd4ff;--cy2:#a8ecff;--gd:#e2c68f;--gn:#3ddc97;--gb:#ffb547;--rt:#ff5e73;--gr:#5d7290;--ln:rgba(95,212,255,.18);--fl:rgba(9,24,48,.62);
  display:grid;gap:8px;max-width:1440px;margin:0 auto;min-width:0}
.stg *{box-sizing:border-box}
.dash .stg section{margin:0}
.stg .z{font-family:var(--monof,ui-monospace),ui-monospace,monospace;font-variant-numeric:tabular-nums}
.stg .cu-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.stg .cu{position:relative}
.stg .stg-hl{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;border:1px solid var(--ln);border-radius:10px;text-decoration:none;color:var(--cy2)}
.stg-card{min-width:0;padding:12px 16px 16px;border:1px solid var(--ln);border-radius:12px;background:var(--fl)}
.stg-h{display:flex;align-items:center;gap:8px;margin:0 0 12px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:var(--cy2)}
.stg-h a{display:inline-flex;align-items:center;gap:8px;min-height:32px;color:inherit;text-decoration:none}
.stg-h small{text-transform:none;letter-spacing:0;color:#8ba6c9;font-weight:400}
.stg-leer{margin:0;color:#8ba6c9}
.stg details>summary{cursor:pointer;list-style:none}
.stg details>summary::-webkit-details-marker{display:none}
.stg details p{margin:6px 0 0;color:#a9c3e3;font-size:13px;line-height:1.45}

/* 1 – Satz + Nordstern */
.stg-hero{display:grid;grid-template-columns:minmax(260px,320px) minmax(0,1fr);gap:8px;align-items:stretch}
.stg-nord{position:relative;display:grid;place-items:center;min-height:260px}
.stg-nord svg{width:min(240px,100%);height:auto;filter:drop-shadow(0 0 18px rgba(226,198,143,.18))}
.stg-nord .tr{fill:none;stroke:rgba(226,198,143,.14);stroke-width:12}
.stg-nord .tk{stroke:rgba(226,198,143,.4);stroke-width:2}
.stg-nord .vl{fill:none;stroke:url(#stg-g);stroke-width:12;stroke-linecap:round;stroke-dashoffset:var(--o)}
.stg-nord-t{position:absolute;inset:0;display:grid;place-content:center;text-align:center;gap:2px}
.stg-nord-t b{font-size:32px;color:var(--gd);line-height:1.1}
.stg-nord-t>span{font-size:13px;color:#a9c3e3}
.stg-nord-t em{font-style:normal;font-size:12px;color:#8ba6c9}
.stg-satz{display:flex;flex-direction:column;gap:12px}
.stg-eyebrow{font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:var(--cy)}
.stg-big{margin:0;font-size:22px;line-height:1.35;color:#eaf6ff;font-weight:600}
.stg-kern{margin:0;padding:0;list-style:none;display:grid;gap:8px}
.stg-kern li{display:flex;gap:8px;align-items:flex-start;color:#d9ecff;font-size:15px;line-height:1.4}
.stg-kern li svg{flex:none;margin-top:3px;color:var(--cy)}
.stg-chip{align-self:flex-start;display:inline-flex;align-items:center;gap:6px;min-height:36px;margin-top:auto;padding:0 12px;border-radius:999px;
  border:1px solid rgba(95,212,255,.5);background:rgba(95,212,255,.1);color:var(--cy2);text-decoration:none;font-size:13px}

/* 2 – Treppe: Stufen steigen nach rechts an */
.stg-weg{position:relative;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));height:60px;margin:0 0 8px}
.stg-weg .seg{position:relative;--y:calc(54px - var(--i) * 14px)}
.stg-weg .seg:before{content:"";position:absolute;left:0;right:0;top:var(--y);height:3px;border-radius:2px;background:rgba(95,212,255,.18)}
.stg-weg .seg:after{content:"";position:absolute;left:0;top:var(--y);width:3px;height:14px;background:rgba(95,212,255,.18)}
.stg-weg .seg:first-child:after{display:none}
.stg-weg .seg.on:after{background:var(--cy)}
.stg-weg .seg i{position:absolute;left:0;top:var(--y);height:3px;width:var(--f);border-radius:2px;background:var(--cy);box-shadow:0 0 8px rgba(95,212,255,.7)}
.stg-weg .hier{position:absolute;left:var(--x);top:var(--y);width:14px;height:14px;margin:-5px 0 0 -7px;border-radius:50%;background:var(--cy);box-shadow:0 0 0 4px rgba(95,212,255,.2),0 0 18px var(--cy)}
.stg-treppe{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;align-items:stretch}
.stg-stufe{position:relative;display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--ln);border-radius:10px;background:rgba(4,14,30,.6);
  min-height:150px;opacity:.72}
.stg-stufe.ok{opacity:1;border-color:rgba(61,220,151,.45)}
.stg-stufe.jetzt{opacity:1;border-color:var(--cy);box-shadow:0 0 0 1px rgba(95,212,255,.35),0 0 26px rgba(95,212,255,.25)}
.stg-stufe-k{display:flex;align-items:center;gap:8px;min-width:0}
.stg-stufe-k b{font-size:15px;line-height:1.25;min-width:0}
.stg-stufe .nr{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:50%;border:1px solid var(--ln);font-weight:700;color:var(--cy2)}
.stg-stufe.ok .nr{background:rgba(61,220,151,.16);border-color:var(--gn);color:var(--gn)}
.stg-stufe.jetzt .nr{background:var(--cy);color:#02101f;border-color:var(--cy)}
.stg-stufe .hier{margin-left:auto;flex:none;font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:var(--cy);border:1px solid var(--cy);border-radius:999px;padding:1px 8px}
.stg-stufe .wert{font-size:13px;color:#a9c3e3;line-height:1.4;overflow-wrap:anywhere}
.stg-stufe .bar{display:block;height:6px;border-radius:3px;background:rgba(95,212,255,.12);overflow:hidden;margin-top:auto}
.stg-stufe .bar i{display:block;height:100%;width:var(--w);border-radius:3px;background:linear-gradient(90deg,#2a8fc0,var(--cy))}
.stg-stufe.ok .bar i{background:var(--gn)}
.stg-stufe details summary{font-size:12px;color:var(--cy);min-height:24px;display:flex;align-items:center}

/* 3 + 4 – Plan und Ziele nebeneinander, bündig */
.stg-zwei{display:grid;grid-template-columns:minmax(0,1.25fr) minmax(0,1fr);gap:8px;align-items:stretch}
.stg-plan{list-style:none;margin:0;padding:0 0 0 4px;position:relative;display:grid;gap:4px}
.stg-plan:before{content:"";position:absolute;left:13px;top:10px;bottom:10px;width:2px;background:linear-gradient(var(--gn),var(--cy) 40%,rgba(95,212,255,.15))}
.stg-plan li{position:relative;display:grid;grid-template-columns:20px minmax(0,1fr);gap:12px;align-items:start}
.stg-plan .dot{position:relative;z-index:1;display:grid;place-items:center;width:20px;height:20px;margin-top:10px;border-radius:50%;border:2px solid var(--gr);background:#06142a;color:#02101f}
.stg-plan .s-erreicht .dot{background:var(--gn);border-color:var(--gn)}
.stg-plan .s-verfehlt .dot{background:var(--gb);border-color:var(--gb)}
.stg-plan .next .dot{border-color:var(--cy);box-shadow:0 0 0 4px rgba(95,212,255,.15)}
.stg-plan summary{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:12px;align-items:center;min-height:40px;padding:4px 8px;border-radius:8px}
.stg-plan summary:hover{background:rgba(95,212,255,.06)}
.stg-plan summary b{font-size:14px;font-weight:600;min-width:0;overflow-wrap:anywhere}
.stg-plan summary .z{font-size:12px;color:#8ba6c9}
.stg-plan summary .st{white-space:nowrap;font-size:12px;color:#a9c3e3;min-width:84px;text-align:right}
.stg-plan .s-erreicht .st{color:var(--gn)}.stg-plan .s-verfehlt .st{color:var(--gb)}.stg-plan .next .st{color:var(--cy)}
.stg-plan details p{padding:0 8px 6px}
.stg-ringe{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;align-items:stretch}
.stg-ring{display:grid;grid-template-columns:56px minmax(0,1fr);gap:12px;align-items:center;min-height:76px;padding:8px 12px;border:1px solid var(--ln);border-radius:10px;
  background:rgba(4,14,30,.6);color:#d9ecff;text-decoration:none}
.stg-ring:hover,.stg-ring:focus-visible{border-color:var(--cy)}
.stg-ring svg{width:56px;height:56px}
.stg-ring .tr{fill:none;stroke:rgba(95,212,255,.14);stroke-width:7}
.stg-ring .vl{fill:none;stroke:var(--cy);stroke-width:7;stroke-linecap:round;stroke-dashoffset:var(--o)}
.stg-ring.gold .vl{stroke:var(--gd)}
.stg-ring.unb .tr{stroke-dasharray:3 4}
.stg-ring>span{display:grid;min-width:0}
.stg-ring b{font-size:17px}
.stg-ring small{font-size:12px;color:#8ba6c9}
.stg-ring>span>span{font-size:13px;color:#a9c3e3;overflow-wrap:anywhere}

/* 5 – Rückblick */
.stg-zahlen{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;align-items:stretch;margin-bottom:16px}
.stg-zahl{display:grid;gap:2px;justify-items:start;padding:12px;border:1px solid var(--ln);border-radius:10px;background:rgba(4,14,30,.6)}
.stg-zahl svg{color:var(--gd)}
.stg-zahl b{font-size:22px;color:#eaf6ff}
.stg-zahl>span{font-size:12px;color:#8ba6c9}
.stg-rb{list-style:none;margin:0;padding:0;display:grid;gap:12px;position:relative}
.stg-rb>li{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;align-items:start}
.stg-rb .tag{display:flex;flex-direction:column;gap:2px;padding-top:6px;font-size:13px;color:var(--cy2)}
.stg-rb .tag small{font-size:11px;color:#8ba6c9}
.stg-rb ul{list-style:none;margin:0;padding:0 0 0 12px;border-left:2px solid rgba(95,212,255,.25);display:grid;gap:4px}
.stg-rb li li .k,.stg-rb li li summary{display:flex;align-items:center;gap:8px;min-height:32px;padding:2px 8px;border-radius:8px;font-size:14px}
.stg-rb li li summary:hover{background:rgba(95,212,255,.06)}
.stg-rb li li svg{flex:none;color:var(--cy)}
.stg-rb li li .t{min-width:0;overflow-wrap:anywhere}
.stg-rb li li b{margin-left:auto;color:var(--gd);font-size:13px}
.stg-rb .a-meilenstein svg,.stg-rb .a-premium svg{color:var(--gd)}
.stg-rb .a-meilenstein .t{color:var(--gd);font-weight:600}
.stg-rb .a-lehre svg{color:#b9a3ff}
.stg-rb .mehr summary{color:var(--cy);font-size:13px}
.stg-rb .mehr ul{border-left:0;padding-left:0}
.stg-rb details p{padding:0 8px 4px 30px}

/* Bewegung: nur ohne prefers-reduced-motion */
@media (prefers-reduced-motion:no-preference){
  .stg-nord .vl{animation:stg-fill 1.6s cubic-bezier(.2,.8,.2,1) both .1s}
  .stg-ring .vl{animation:stg-fill 1.1s cubic-bezier(.2,.8,.2,1) both calc(.3s + var(--i) * .08s)}
  .stg-kern li{animation:stg-in .5s ease-out both calc(.2s + var(--i) * .12s)}
  .stg-stufe{animation:stg-up .6s cubic-bezier(.2,.8,.2,1) both calc(var(--i) * .12s)}
  .stg-stufe .bar i{animation:stg-bar 1.2s ease-out both calc(.4s + var(--i) * .12s)}
  .stg-stufe.jetzt{animation:stg-up .6s cubic-bezier(.2,.8,.2,1) both calc(var(--i) * .12s),stg-glow 2.4s ease-in-out infinite 1s}
  .stg-plan li{animation:stg-in .45s ease-out both calc(var(--i) * .07s)}
  .stg-plan .next .dot{animation:stg-ping 2s ease-out infinite}
  .stg-rb>li{animation:stg-in .5s ease-out both calc(var(--i) * .06s)}
  .stg-weg .seg i{animation:stg-bar .5s ease-out both calc(.2s + var(--i) * .45s)}
  .stg-weg .hier{animation:stg-ping 2s ease-out infinite 1.8s}
  .stg-chip{animation:stg-glow 2.4s ease-in-out infinite}
}
@keyframes stg-fill{from{stroke-dashoffset:var(--c)}}
@keyframes stg-in{from{opacity:0;transform:translateY(6px)}}
@keyframes stg-up{from{opacity:0;transform:translateY(18px)}}
@keyframes stg-bar{from{width:0}}
@keyframes stg-glow{50%{box-shadow:0 0 0 1px rgba(95,212,255,.5),0 0 34px rgba(95,212,255,.4)}}
@keyframes stg-ping{0%{box-shadow:0 0 0 0 rgba(95,212,255,.5)}100%{box-shadow:0 0 0 10px rgba(95,212,255,0)}}

@media (max-width:1023px){.stg-zwei{grid-template-columns:minmax(0,1fr)}.stg-zahlen{grid-template-columns:repeat(3,minmax(0,1fr))}}
@media (max-width:759px){
  .stg-hero{grid-template-columns:minmax(0,1fr)}
  .stg-nord{min-height:220px}
  .stg-big{font-size:18px}
  .stg-treppe{grid-template-columns:minmax(0,1fr);align-items:stretch}
  .stg-stufe{min-height:0;margin-left:calc(var(--i) * 8px)}
  .stg-weg{display:none}
  .stg-ringe{grid-template-columns:minmax(0,1fr)}
  .stg-zahlen{grid-template-columns:repeat(2,minmax(0,1fr))}
  .stg-rb>li{grid-template-columns:minmax(0,1fr);gap:4px}
  .stg-rb .tag{flex-direction:row;gap:8px;align-items:baseline}
  .stg-plan summary{grid-template-columns:minmax(0,1fr) auto}
  .stg-plan summary .z{display:none}
}
`;

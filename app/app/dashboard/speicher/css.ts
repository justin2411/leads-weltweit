/**
 * Speicher-Ansicht: Glas-Tanks im JARVIS-Design (dunkles HUD, Cyan/Gold). Flüssigkeit mit bewegter Oberfläche
 * (Welle per CSS-Maske), steigt beim Laden – ohne Bewegung bei prefers-reduced-motion. Nur Klassen mit Präfix sp-/tk-.
 */
const WAVE = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 12' preserveAspectRatio='none'%3E%3Cpath d='M0 6 Q10 0 20 6 T40 6 T60 6 T80 6 V12 H0Z'/%3E%3C/svg%3E")`;

export const SPEICHER_CSS = `
.sp{--l-frei:#5fd4ff;--l-proben:#e2c68f;--l-geliefert:#3ddc97;--l-zurueck:#ff7a6b;--l-abgelaufen:#56657e;--l-sonst:#8ba6c9;
  --b-frei:#f2c86b;--b-queued:#c49a4e;--b-sent:#8d7442;--pr:#ffd56b;--pr-p:#c99a3c;display:grid;gap:18px;min-width:0}
.sp-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:4px 0 0}
.sp-head h1{margin:0;font-family:var(--hud);font-size:28px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#fff;text-shadow:0 0 22px rgba(95,212,255,.55)}
.sp-head .sp-at{font-size:13px;color:var(--soft)}
.sp-chips{display:flex;gap:6px}
.sp-chips a{padding:6px 14px;border:1px solid rgba(95,212,255,.28);border-radius:999px;font-size:13px;font-weight:600;color:#a9c3e3;text-decoration:none;background:rgba(4,14,30,.6)}
.sp-chips a.on{background:linear-gradient(180deg,rgba(95,212,255,.35),rgba(95,212,255,.12));color:#fff;border-color:var(--cy);box-shadow:var(--glow)}
.sp-card{position:relative;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:16px 18px 18px;min-width:0;
  clip-path:polygon(0 10px,10px 0,calc(100% - 10px) 0,100% 10px,100% calc(100% - 10px),calc(100% - 10px) 100%,10px 100%,0 calc(100% - 10px));
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.sp-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 12px}
.sp-h h2{margin:0;font-family:var(--hud);font-size:15px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--cy2)}
.sp-h .sp-big{font-size:26px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;text-shadow:0 0 14px rgba(95,212,255,.4)}
.sp-h .sp-note{font-size:13px;color:var(--soft)}
.sp-h .sp-sp{flex:1}
.sp-legend{display:flex;gap:6px 14px;flex-wrap:wrap;font-size:13px;color:var(--soft);margin:12px 0 0}
.sp-legend span{display:inline-flex;align-items:center;gap:6px}
.sp-legend i{width:10px;height:10px;border-radius:2px;background:var(--c);box-shadow:0 0 8px var(--c)}
.sp-row3{display:grid;grid-template-columns:1.1fr 1fr 1fr;gap:18px;min-width:0}
/* bündig (Inhaber 04.10.2026): Karten einer Zeile gleich hoch, Fußzeilen unten */
.sp-row3{align-items:stretch}.sp-row3>.sp-card{display:flex;flex-direction:column}.sp-row3>.sp-card>.sp-cost:first-of-type{margin-top:auto;padding-top:12px}
.sp-row3>.fold{display:block}.sp-row3>.fold .sp-cost:first-of-type{padding-top:12px}
@media (max-width:1000px){.sp-row3{grid-template-columns:1fr}}

/* ------------------------------------------------------------- Tanks */
.tk-row{display:grid;grid-template-columns:repeat(var(--n,7),minmax(0,1fr));gap:14px;min-width:0}
/* Länder-Reihe: jede Säule fester Platz, bei vielen Ländern seitlich verschiebbar mit Pfeilen (Inhaber 04.10.2026) */
.tk-scroll{position:relative;min-width:0}
.tk-scroll>.tk-row{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax(150px,1fr);overflow-x:auto;overscroll-behavior-x:contain;
  scroll-snap-type:x proximity;scrollbar-width:none;padding-bottom:2px}
.tk-scroll>.tk-row::-webkit-scrollbar{display:none}
.tk-scroll>.tk-row>.tk{scroll-snap-align:start}
.dash .tk-arrow{position:absolute;top:calc(var(--h,230px) / 2 - 20px);z-index:4;display:grid;place-items:center;width:40px;height:40px;padding:0;border-radius:50%;
  border:1px solid rgba(168,236,255,.45);background:rgba(2,10,24,.88);color:#d6ecff;cursor:pointer;box-shadow:0 0 18px rgba(95,212,255,.3)}
.dash .tk-arrow:hover{border-color:var(--cy);color:#fff}
.tk-arrow.l{left:-6px}.tk-arrow.l svg{transform:scaleX(-1)}
.tk-arrow.r{right:-6px}
.tk-arrow svg{display:block}
.tk-scroll .tk-s,.tk-scroll .tk-call{white-space:normal}
.tk-scroll .tk-s span,.tk-scroll .tk-call>span{display:block}.tk-scroll .tk-s .dot{display:none}
.tk{display:grid;gap:6px;justify-items:center;align-content:start;text-decoration:none;color:inherit;min-width:0;border-radius:10px;padding:4px 2px 6px;transition:background .2s}
a.tk:hover,a.tk:focus-visible{background:rgba(95,212,255,.06);outline:none}
a.tk:hover .tk-glass,a.tk:focus-visible .tk-glass{border-color:rgba(168,236,255,.75);box-shadow:inset 0 0 24px rgba(95,212,255,.18),0 0 26px rgba(95,212,255,.35)}
.tk-glass{position:relative;width:100%;max-width:120px;height:var(--h,230px);border-radius:16px 16px 12px 12px;overflow:hidden;
  border:1px solid rgba(95,212,255,.35);background:linear-gradient(90deg,rgba(95,212,255,.10),rgba(95,212,255,.02) 35%,rgba(95,212,255,.02) 65%,rgba(95,212,255,.09)),rgba(2,10,24,.75);
  box-shadow:inset 0 0 22px rgba(95,212,255,.10),0 0 18px -6px rgba(95,212,255,.35);transition:border-color .2s,box-shadow .2s}
.tk-glass:after{content:"";position:absolute;top:8px;bottom:8px;left:12%;width:7%;border-radius:6px;background:linear-gradient(180deg,rgba(255,255,255,.22),rgba(255,255,255,.03));pointer-events:none;z-index:3}
.tk-tick{position:absolute;left:0;right:0;height:0;border-top:1px dashed rgba(168,236,255,.18);z-index:2;pointer-events:none}
.tk-tick span{position:absolute;right:5px;top:-10px;padding:1px 6px;border-radius:999px;font-size:12px;font-weight:600;line-height:16px;color:#d6ecff;background:rgba(2,10,24,.82);border:1px solid rgba(168,236,255,.22);letter-spacing:.01em;white-space:nowrap}
/* Skala nur am ersten Tank jeder Zeile – die Linien laufen durch alle */
.tk-row .tk:not(:first-child) .tk-tick span{display:none}
.tk-tick.top span{top:4px}
.tk-liq{position:absolute;left:0;right:0;bottom:0;display:flex;flex-direction:column-reverse;transform-origin:bottom;animation:tkrise 1.4s cubic-bezier(.2,.8,.2,1) both;z-index:1}
.tk-liq>i{display:block;min-height:0;background:linear-gradient(90deg,color-mix(in srgb,var(--c) 70%,#000),var(--c) 45%,color-mix(in srgb,var(--c) 75%,#000));opacity:.82}
.tk-liq>i+i{box-shadow:0 1px 0 rgba(0,0,0,.35)}
.tk-liq>i.tk-top{opacity:.95;box-shadow:0 0 22px color-mix(in srgb,var(--c) 55%,transparent)}
.tk-wave{position:absolute;left:0;right:0;top:-9px;height:10px;background:var(--wc);opacity:.95;
  -webkit-mask:${WAVE} repeat-x 0 0/60px 10px;mask:${WAVE} repeat-x 0 0/60px 10px;animation:tkwave 2.6s linear infinite}
.tk-wave.b{top:-7px;opacity:.45;animation-duration:4.2s;animation-direction:reverse}
.tk-glow{position:absolute;left:0;right:0;top:0;height:14px;background:linear-gradient(180deg,rgba(255,255,255,.35),transparent);mix-blend-mode:overlay}
.tk-empty{position:absolute;inset:auto 0 10px;text-align:center;font-size:13px;color:var(--soft);z-index:2}
.tk-n{font-size:24px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;line-height:1.1;text-shadow:0 0 14px rgba(95,212,255,.45);white-space:nowrap}
.tk-n small{font-size:14px;color:var(--soft);font-weight:600}
.tk-c{display:flex;align-items:center;gap:6px;font-family:var(--hud);font-weight:700;letter-spacing:.14em;font-size:14px;color:var(--cy2)}
.tk-s{font-size:13px;color:var(--soft);text-align:center;line-height:1.35;white-space:nowrap}
.tk-s span{white-space:nowrap}
.tk-s b{color:var(--text);font-weight:600}
.tk-call{font-size:13px;color:#c9b48a;white-space:nowrap;text-align:center;line-height:1.35}
.tk.off .tk-glass{border-style:dashed;opacity:.55}
.tk.off .tk-n{color:var(--soft);text-shadow:none}
.tk-row.small{--h:120px;grid-template-columns:repeat(auto-fill,minmax(78px,1fr))}
.tk-row.small .tk-glass{max-width:70px;border-radius:12px 12px 9px 9px}
.tk-row.small .tk-n{font-size:18px}
.tk-row.gold .tk-n{text-shadow:0 0 14px rgba(242,200,107,.45)}

/* ------------------------------------------------------------- Premium (05.10.2026) */
.cu-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.cu{position:relative;font-variant-numeric:tabular-nums}
.pr-card{border-color:rgba(255,213,107,.38);box-shadow:inset 0 0 40px -18px rgba(255,213,107,.35)}
.pr-card .sp-h h2{display:inline-flex;align-items:center;gap:8px;color:var(--pr)}
.sp-h .pr-big{color:#fff3cf;text-shadow:0 0 18px rgba(255,213,107,.65)}
.pr-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;align-items:stretch;min-width:0}
.pr-c{position:relative;display:flex;flex-direction:column;gap:6px;min-width:0;padding:14px 14px 12px;border-radius:10px;text-decoration:none;color:inherit;
  border:1px solid rgba(255,213,107,.32);background:radial-gradient(120% 90% at 85% 0%,rgba(255,213,107,.16),transparent 60%),rgba(4,12,26,.7);transition:border-color .2s,box-shadow .2s}
.pr-c:hover,.pr-c:focus-visible{outline:none;border-color:var(--pr);box-shadow:0 0 26px -6px rgba(255,213,107,.55)}
.pr-c.leer{opacity:.6}
.pr-gem{position:absolute;top:10px;right:12px;width:34px;height:34px;display:grid;place-items:center;color:var(--pr);filter:drop-shadow(0 0 8px rgba(255,213,107,.7))}
.pr-land{font-family:var(--hud);font-weight:700;letter-spacing:.16em;font-size:15px;color:var(--cy2)}
.pr-n{font-size:40px;line-height:1.05;font-weight:700;color:#fff6da;text-shadow:0 0 20px rgba(255,213,107,.55);white-space:nowrap}
.pr-bar{display:flex;height:8px;border-radius:4px;overflow:hidden;background:rgba(255,213,107,.1)}
.pr-bar i{display:block;height:100%;transform-origin:left;animation:prbar 1.2s cubic-bezier(.2,.8,.2,1) both}
.pr-bar .f{background:linear-gradient(90deg,#c99a3c,var(--pr));box-shadow:0 0 10px rgba(255,213,107,.7)}
.pr-bar .p{background:var(--pr-p)}.pr-bar .g{background:var(--l-geliefert)}
.pr-s{font-size:13px;color:var(--soft);display:flex;align-items:center;gap:4px;flex-wrap:wrap}
.pr-s b{color:var(--text);font-weight:600;font-variant-numeric:tabular-nums}
.pr-pb{margin-top:auto}.pr-pb .ico{color:var(--pr)}
/* Funkeln: Premium-Schicht im Tank und Edelstein */
.sk{position:absolute;width:3px;height:3px;border-radius:50%;background:#fffbe8;box-shadow:0 0 6px 2px rgba(255,236,170,.9);opacity:0;animation:sktw 2.8s ease-in-out infinite;pointer-events:none}
.pr-gem .sk{width:2px;height:2px}
.tk-liq>i.tk-pr{position:relative;overflow:hidden;opacity:1;background:linear-gradient(90deg,#b3862f,#ffd56b 45%,#c99a3c);box-shadow:0 0 18px rgba(255,213,107,.75)}
.tk-liq>i.tk-pr:before{content:"";position:absolute;inset:0;background:linear-gradient(110deg,transparent 30%,rgba(255,255,255,.55) 48%,transparent 66%);background-size:250% 100%;animation:prshine 3.4s linear infinite}
.tk-prn{display:inline-flex;align-items:center;gap:3px;color:var(--pr);font-weight:600}

/* ------------------------------------------------------------- Datenbank */
.sp-db{display:grid;grid-template-columns:150px 1fr;gap:18px;align-items:center}
.sp-ring{position:relative;display:grid;gap:8px;justify-items:center}
.sp-ring svg{width:150px;height:150px;display:block}
.sp-ring circle{fill:none;stroke-width:12;transform:rotate(-90deg);transform-origin:60px 60px}
.sp-ring .rg-bg{stroke:rgba(95,212,255,.10)}
.sp-ring .rg-zone{stroke:rgba(255,94,115,.16)}
.sp-ring .rg-fg{stroke:var(--cy);stroke-linecap:round;filter:drop-shadow(0 0 6px rgba(95,212,255,.7));animation:rgfill 1.6s cubic-bezier(.2,.8,.2,1) both}
.sp-ring.lvl-gelb .rg-fg{stroke:var(--amber)}.sp-ring.lvl-rot .rg-fg{stroke:var(--red)}
.sp-ring .rg-mk{stroke-width:2.5;stroke-linecap:round}
.rg-mk.m6,.rg-lg .m6 i{stroke:var(--amber);background:var(--amber)}
.rg-mk.m75,.rg-lg .m75 i{stroke:#ff8a5c;background:#ff8a5c}
.rg-mk.m8,.rg-lg .m8 i{stroke:var(--red);background:var(--red)}
.rg-in{position:absolute;top:0;left:50%;width:150px;height:150px;margin-left:-75px;display:grid;place-content:center;justify-items:center;pointer-events:none}
.rg-in b{font-size:30px;font-weight:700;color:#fff;line-height:1;text-shadow:0 0 14px rgba(95,212,255,.45)}
.rg-in span{font-size:12px;color:var(--soft)}
.rg-lg{display:flex;flex-wrap:wrap;justify-content:center;gap:2px 10px;font-size:12px;color:var(--soft)}
.rg-lg span{display:inline-flex;align-items:center;gap:4px;white-space:nowrap}.rg-lg i{width:8px;height:3px;border-radius:2px}
.sp-tbl{display:grid;gap:8px;align-self:center;min-width:0}
.sp-tbl div{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;font-size:13px}
.sp-tbl div span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.sp-tbl div b{font-weight:600;font-variant-numeric:tabular-nums}
.sp-tbl div em{grid-column:1/-1;height:5px;border-radius:3px;background:rgba(95,212,255,.1);overflow:hidden;font-style:normal}
.sp-tbl div em i{display:block;height:100%;background:linear-gradient(90deg,rgba(95,212,255,.5),var(--cy));box-shadow:0 0 8px rgba(95,212,255,.6)}
.sp-cost{margin:12px 0 0;font-size:13px;color:var(--soft)}
.sp-cost b{color:var(--gold2);font-weight:600}
.sp-lvl-gelb .sp-big{color:var(--amber)}.sp-lvl-rot .sp-big{color:var(--red)}

/* ------------------------------------------------------------- Freigabe */
.sp-gate{display:grid;gap:12px}
.sp-gate a{display:grid;grid-template-columns:38px minmax(0,1fr) auto;gap:10px;align-items:center;text-decoration:none;color:inherit;border-radius:6px;padding:3px 4px}
.sp-gate a:hover{background:rgba(95,212,255,.06)}
.sp-gate .c{font-family:var(--hud);font-weight:700;letter-spacing:.12em;color:var(--cy2)}
.sp-gate .bar{display:flex;height:12px;border-radius:6px;overflow:hidden;background:rgba(95,212,255,.08)}
.sp-gate .bar i{display:block;height:100%}
.sp-gate .bar .ok{background:linear-gradient(90deg,rgba(61,220,151,.55),var(--green));box-shadow:0 0 10px rgba(61,220,151,.5)}
.sp-gate .bar .bad{background:var(--red);box-shadow:0 0 10px rgba(255,94,115,.6)}
.sp-gate .v{font-size:13px;font-variant-numeric:tabular-nums;white-space:nowrap;color:var(--soft)}
.sp-gate .v b{color:#fff}
.sp-gate .v .r{color:var(--red)}
.sp-none{font-size:13px;color:var(--soft);margin:4px 0}
.sp-err{border-color:rgba(255,94,115,.45)}

/* ------------------------------------------------------------- Eigene Speicher */
.pl{display:grid;gap:18px;min-width:0;--bnav:0px}
.pl.has-bar{padding-bottom:90px}
.pl-err{margin:0 0 12px;padding:8px 12px;border:1px solid rgba(255,94,115,.5);border-radius:8px;background:rgba(255,94,115,.12);color:#ffb3bd;font-size:13px;font-weight:600}
.pl-pools{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:12px;align-items:stretch}
.pl-pool{display:flex;flex-direction:column;gap:8px;min-width:0;padding:12px 14px;border:1px solid var(--line);border-left:3px solid var(--c,#8ba6c9);border-radius:8px;background:rgba(2,10,24,.55)}
.pl-pool.all{border-left-color:var(--cy);background:rgba(95,212,255,.05)}
.pl-pool.add{border-style:dashed;border-left-width:1px;justify-content:center;align-items:stretch}
.pl-ph{display:flex;align-items:center;gap:8px;min-width:0}
.pl-ph>i{flex:none;width:12px;height:12px;border-radius:50%;background:var(--c,#8ba6c9);box-shadow:0 0 10px var(--c,#8ba6c9)}
.pl-ph b{flex:1;min-width:0;font-size:15px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-ph .ico{color:var(--soft)}
.pl-ed{flex:none;display:grid;place-items:center;width:40px;height:40px;padding:0;border-radius:8px;cursor:pointer}
.pl-n{font-size:24px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;line-height:1.1}
.pl-n small{font-size:13px;font-weight:600;color:var(--soft)}
.pl-sub{font-size:13px;color:var(--soft)}
.pl-cs{display:flex;flex-wrap:wrap;gap:4px 10px;margin-top:auto;font-size:13px;color:var(--soft);font-variant-numeric:tabular-nums}
.pl-cs b{font-family:var(--hud);letter-spacing:.1em;color:var(--cy2);font-weight:700}
.pl-cs em{font-style:normal}
.pl-foot{margin-top:auto;font-size:13px;color:var(--soft)}
.pl-new{display:flex;align-items:center;justify-content:center;gap:8px;min-height:44px;width:100%;border-radius:8px;font:600 14px var(--sans);cursor:pointer;color:var(--cy2)}
.pl-form{display:grid;grid-template-columns:44px minmax(0,1fr);gap:8px;align-items:center}
.pl-form input[type=color]{width:44px;height:44px;padding:2px;border-radius:8px;border:1px solid var(--line);background:transparent;cursor:pointer}
.pl-form input[type=text]{min-height:44px;min-width:0;padding:0 10px;border-radius:8px;font:500 14px var(--sans)}
.pl-fbtn{grid-column:1/-1;display:flex;gap:8px}
.pl-fbtn button{flex:1;min-height:44px;border-radius:8px;font:600 14px var(--sans);cursor:pointer}
.pl .pri{color:#02060f!important;background:linear-gradient(180deg,#f2dcae,#e2c68f)!important;border:0!important;font-weight:700}
.pl .pri:disabled{opacity:.55;cursor:default}

.pl-matrix{display:grid;gap:14px}
.pl-seg{display:grid;grid-template-columns:180px minmax(0,1fr);gap:10px;align-items:start;padding-top:12px;border-top:1px solid rgba(95,212,255,.1)}
.pl-seg:first-child{padding-top:0;border-top:0}
.pl-sh{display:flex;gap:8px;align-items:baseline;min-width:0;padding-top:10px}
.pl-sh b{font-family:var(--hud);letter-spacing:.1em;color:var(--cy2)}
.pl-sh span{font-size:14px;color:#cfe3f7;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.pl-cells{display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:8px;align-items:stretch}
.pl-cell{display:grid;grid-template-columns:34px minmax(0,1fr);gap:6px;align-items:center;padding:4px 6px 4px 10px;border:1px solid var(--line);border-left:3px solid var(--line);border-radius:8px;background:rgba(2,10,24,.45)}
.pl-cell.own{border-left-color:var(--c)}
.pl-cell>span{font-family:var(--hud);font-weight:700;letter-spacing:.1em;font-size:13px;color:var(--cy2)}
.pl select{min-height:40px;min-width:0;width:100%;padding:0 8px;border-radius:6px;font:500 13.5px var(--sans)}
.pl-cell.chg,.pl-subr.chg{border-color:rgba(226,198,143,.75);box-shadow:0 0 0 1px rgba(226,198,143,.25)}

.pl-subs{display:grid;grid-template-columns:repeat(auto-fill,minmax(400px,1fr));gap:8px;align-items:stretch}
.pl-subr{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,240px);gap:10px;align-items:center;padding:6px 8px 6px 12px;border:1px solid var(--line);border-radius:8px;background:rgba(2,10,24,.45)}
.pl-co{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;min-width:0}
.pl-co b{max-width:100%;font-size:14px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-co small{font-size:13px;color:var(--soft)}
.pl-test{font-style:normal;font-size:12px;font-weight:600;padding:1px 8px;border-radius:999px;color:#c9d4e3;border:1px solid rgba(139,166,201,.45);background:rgba(139,166,201,.12)}

.pl-bar{position:fixed;left:0;right:0;bottom:var(--bnav);z-index:45;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:rgba(4,10,22,.94);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-top:1px solid rgba(226,198,143,.6);box-shadow:0 -12px 40px -10px rgba(226,198,143,.35)}
.pl-bar .in{max-width:var(--wmax,1240px);margin:0 auto;display:flex;align-items:center;gap:10px 14px}
.pl-bn{flex:none;display:inline-flex;align-items:center;gap:8px;font:700 15px var(--sans);color:#fff}
.pl-bn b{display:inline-grid;place-items:center;min-width:28px;height:28px;padding:0 6px;border-radius:99px;background:var(--gold);color:#02060f;font-size:14px}
.pl-list{flex:1;min-width:0;font-size:13px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.pl-bar button{flex:none;min-height:44px;padding:0 16px;border-radius:10px;font:600 14.5px var(--sans);cursor:pointer;white-space:nowrap}
.pl-x{background:transparent!important}
.pl-toast{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:70;display:flex;align-items:center;gap:10px;width:min(440px,calc(100vw - 24px));padding:10px 10px 10px 14px;border-radius:12px;border:1px solid rgba(61,220,151,.55);background:rgba(6,26,22,.96);color:#fff;font-size:14px;box-shadow:0 20px 50px -14px rgba(0,0,0,.9)}
.pl-toast.bad{border-color:rgba(255,94,115,.6);background:rgba(36,8,14,.96)}
.pl-toast>span{flex:1}.pl-toast .ico{color:var(--ok,#3ddc97)}.pl-toast.bad .ico{color:#ff5e73}
.pl-toast button{display:grid;place-items:center;width:32px;height:32px;padding:0;border-radius:50%;cursor:pointer}
@media (max-width:760px){
  .pl{gap:14px}
  .pl-seg{grid-template-columns:1fr;gap:6px}.pl-sh{padding-top:0}
  .pl-cells{grid-template-columns:repeat(2,minmax(0,1fr))}
  .pl-cell{grid-template-columns:1fr;gap:4px;padding:6px 6px 6px 10px}
  .pl-subs{grid-template-columns:1fr}
  .pl-subr{grid-template-columns:1fr;gap:6px}
  .pl-list{display:none}.pl-bar .in{justify-content:space-between}
  .pl-bar{padding:8px 12px 10px}.pl-bar .in{flex-wrap:wrap;gap:8px}
  .pl-bar .pri,.pl-x{flex:1 1 0;min-width:0;padding:0 10px}
  .pl-bn{flex:1 1 100%}
  .pl.has-bar{padding-bottom:130px}
}
@media (max-width:480px){.pl-pools{grid-template-columns:1fr}}

@keyframes sktw{0%,100%{opacity:0;transform:scale(.4)}45%{opacity:1;transform:scale(1.25)}60%{opacity:.85}}
@keyframes prshine{from{background-position:150% 0}to{background-position:-100% 0}}
@keyframes prbar{from{transform:scaleX(0)}}
@keyframes rgfill{from{stroke-dasharray:0 var(--c0)}}
@keyframes tkwave{to{-webkit-mask-position:60px 0;mask-position:60px 0}}
@keyframes tkrise{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@media (prefers-reduced-motion:reduce){.tk-wave,.tk-liq,.pr-bar i,.sp-ring .rg-fg,.tk-liq>i.tk-pr:before{animation:none}.sk{animation:none;opacity:.7}.tk,.tk-glass,.pr-c{transition:none}}

@media (max-width:760px){
  .sp{gap:14px}
  .sp-head h1{font-size:22px;letter-spacing:.2em}
  .sp-card{padding:14px 12px 16px}
  .tk-row{grid-template-columns:repeat(4,minmax(0,1fr));gap:10px 8px;--h:170px}
  .tk-scroll>.tk-row{grid-auto-columns:minmax(96px,1fr)}
  .dash .tk-arrow{width:34px;height:34px}
  .tk-n{font-size:18px}.tk-n small{font-size:12px}
  .tk-s,.tk-call{font-size:13px;white-space:normal}
  .tk-s span,.tk-call span{display:block}.tk-s .dot{display:none}
  .tk-tick span{font-size:12px;right:3px;padding:0 5px}
  .tk-row .tk-tick span{display:none}.tk-row .tk:nth-child(4n+1) .tk-tick:not(.top) span{display:inline}
  .tk-tick.top span,.tk-row .tk .tk-tick.top span{display:none}
  .tk-row.small{--h:110px;grid-template-columns:repeat(4,minmax(0,1fr))}
  .sp-db{grid-template-columns:1fr;gap:14px}
  .pr-grid{grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px}
  .pr-c{padding:12px 10px 10px}.pr-n{font-size:32px}.pr-gem{top:8px;right:8px}
}
@media (max-width:480px){
  /* Handy: drei Tanks je Zeile – Zahlen und „nur Anruf/Brief“ passen ohne Umbruch */
  .tk-row{grid-template-columns:repeat(3,minmax(0,1fr));gap:12px 10px}
  .tk-row .tk:nth-child(4n+1) .tk-tick:not(.top) span{display:none}.tk-row .tk:nth-child(3n+1) .tk-tick:not(.top) span{display:inline}
  .tk-call span{white-space:nowrap}
  .tk-row.small{grid-template-columns:repeat(4,minmax(0,1fr))}
  .pr-grid{grid-template-columns:repeat(auto-fit,minmax(96px,1fr))}.pr-n{font-size:24px}.pr-gem{width:24px;height:24px}.pr-det,.pr-w{display:none}.pr-gem svg{width:18px;height:18px}.pr-c{padding:10px 8px}
}
`;

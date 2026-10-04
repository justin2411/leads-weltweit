/**
 * JARVIS-Design für das ganze Inhaber-Dashboard (Inhaber 03.10.2026: „futuristisch … wie bei tony stark … mach es so
 * wie bei jarvis“). Legt sich über DASH_CSS/DASH_V2_CSS/LIVE_CSS: dunkles HUD (Nachtblau, Cyan-Leuchten, Gold der Marke),
 * feines Raster, Eckwinkel, technische Schrift für Zahlen. Bewegung nur ohne prefers-reduced-motion.
 */
export const HUD_CSS = `
.dash{--ink:#020812;--ink2:#0a1a33;--paper:#02060f;--card:rgba(9,24,48,.62);--text:#d9ecff;--soft:#8ba6c9;--line:rgba(95,212,255,.16);
  --gold:#e2c68f;--gold2:#f2dcae;--red:#ff5e73;--red-bg:rgba(255,94,115,.12);--amber:#ffb547;--amber-bg:rgba(255,181,71,.12);
  --green:#3ddc97;--green-bg:rgba(61,220,151,.12);--blue:#5fd4ff;--blue-bg:rgba(95,212,255,.1);
  --cy:#5fd4ff;--cy2:#a8ecff;--glow:0 0 18px rgba(95,212,255,.35);--hud:var(--sans),system-ui,sans-serif;--mono:var(--sans),system-ui,sans-serif;
  background:radial-gradient(1200px 700px at 50% -10%,rgba(40,110,190,.28),transparent 60%),radial-gradient(900px 600px at 100% 100%,rgba(226,198,143,.07),transparent 60%),#02060f;
  color:var(--text);position:relative;isolation:isolate;overflow-x:clip}
.dash:before{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;
  background-image:linear-gradient(rgba(95,212,255,.045) 1px,transparent 1px),linear-gradient(90deg,rgba(95,212,255,.045) 1px,transparent 1px);background-size:44px 44px;
  -webkit-mask-image:radial-gradient(ellipse at 50% 30%,#000 30%,transparent 85%);mask-image:radial-gradient(ellipse at 50% 30%,#000 30%,transparent 85%)}
.dash:after{content:"";position:fixed;inset:0;z-index:-1;pointer-events:none;background:repeating-linear-gradient(0deg,rgba(255,255,255,.018) 0 1px,transparent 1px 3px)}
.dash a{color:var(--cy)}
.dash h1,.dash h2,.dash h3,.dash .th,.dash .th2,.dash .h2s,.dash .eyebrow{font-family:var(--hud);letter-spacing:.04em}
.dash .h2s,.dash .th2>span:first-child{text-transform:uppercase;color:var(--cy2);font-weight:600}
.dash .top{background:rgba(2,8,18,.82);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-bottom:1px solid rgba(95,212,255,.22);box-shadow:0 1px 0 rgba(95,212,255,.08),0 10px 40px -20px rgba(95,212,255,.35)}
.dash .top,.dash .top button,.dash .top .btn{color:#d9ecff}
.dash .mark{font-family:var(--hud);letter-spacing:.06em;text-transform:uppercase}
.dash .tabs a{font-family:var(--hud);letter-spacing:.06em;text-transform:uppercase;font-size:13px;border-color:rgba(95,212,255,.18);color:#a9c3e3}
.dash .tabs a.on{background:linear-gradient(180deg,rgba(95,212,255,.24),rgba(95,212,255,.08));border-color:var(--cy);color:#fff;box-shadow:var(--glow)}
.dash .tabs a.jv-tab{border-color:rgba(226,198,143,.55);color:var(--gold2)}
.dash .tabs a.jv-tab.on{background:linear-gradient(180deg,rgba(226,198,143,.28),rgba(226,198,143,.06));border-color:var(--gold);color:#fff;box-shadow:0 0 18px rgba(226,198,143,.35)}
.dash .nb{display:inline-block;min-width:18px;padding:0 5px;margin-left:6px;border-radius:9px;background:var(--gold);color:#071423;font:600 11px/18px var(--mono);letter-spacing:0;text-align:center;vertical-align:1px}
.dash .bnav .bi{position:relative}.dash .bnav .bi .nb{position:absolute;top:-5px;left:12px;margin:0;min-width:16px;font-size:10px;line-height:16px;padding:0 4px}
.dash .card,.dash .kpi2,.dash .stagebar a,.dash .tro,.dash .sf-stack{background:var(--card);border-color:var(--line);box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 10px 40px -24px rgba(0,0,0,.9);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.dash .card{border-radius:6px;clip-path:polygon(0 10px,10px 0,calc(100% - 10px) 0,100% 10px,100% calc(100% - 10px),calc(100% - 10px) 100%,10px 100%,0 calc(100% - 10px))}
.dash .kpi .v,.dash .kpi2 b,.dash .pipe .v,.dash .num,.dash td.num,.dash output{font-family:var(--mono);font-variant-numeric:tabular-nums}
.dash .pipe .v{color:#fff;text-shadow:0 0 14px rgba(95,212,255,.45)}
.dash .t-gold{background:rgba(226,198,143,.14)}.dash .t-grey{background:rgba(139,166,201,.12)}
.dash .step .bar,.dash .meter,.dash .kcol,.dash .rule,.dash .fb,.dash .ft,.dash .tube{background:rgba(95,212,255,.08)}
.dash .tube.jam{background:rgba(255,94,115,.22)}
.dash th,.dash tr.total td{background:rgba(95,212,255,.06);color:var(--cy2)}
.dash td,.dash th{border-color:var(--line)}
.dash input,.dash select,.dash textarea,.dash button,.dash .sw button,.dash .t-next{background:rgba(4,14,30,.8);color:var(--text);border-color:rgba(95,212,255,.28)}
.dash input:focus,.dash select:focus,.dash textarea:focus{outline:none;border-color:var(--cy);box-shadow:var(--glow)}
.dash button:hover:not(:disabled){border-color:var(--cy);box-shadow:var(--glow)}
.dash button.primary,.dash .sw button.on,.dash .chips a.on{background:linear-gradient(180deg,rgba(95,212,255,.35),rgba(95,212,255,.12));color:#fff;border-color:var(--cy)}
.dash .flash.good{background:rgba(61,220,151,.14);border-color:rgba(61,220,151,.4)}.dash .flash.bad{background:rgba(255,94,115,.14);border:1px solid rgba(255,94,115,.4)}
.dash a.lrow:hover{background:rgba(95,212,255,.07)}
.dash .amp-i.rot{border-color:rgba(255,94,115,.5)}.dash .amp-i.gelb{border-color:rgba(255,181,71,.45)}
.dash .chain li.neck>a,.dash .pipe li.neck>a{background:rgba(255,94,115,.12)}
.dash .cols-grid div{border-top-color:rgba(95,212,255,.1)}.dash svg .grid{stroke:rgba(95,212,255,.12)}
.dash .tlvl .tb{background:linear-gradient(180deg,rgba(95,212,255,.35),rgba(95,212,255,.12));border-color:rgba(95,212,255,.4)}
.dash .tri.idle .tlvl .tb{background:linear-gradient(180deg,rgba(139,166,201,.22),rgba(139,166,201,.08));border-color:rgba(139,166,201,.25)}
.dash .tlvl:last-child .tb{background:linear-gradient(180deg,rgba(61,220,151,.45),rgba(61,220,151,.15))}
.dash .tlvl.na .tb{background:repeating-linear-gradient(45deg,rgba(139,166,201,.1),rgba(139,166,201,.1) 6px,transparent 6px,transparent 12px)}
.dash .sf-line,.dash .mf-box{background:linear-gradient(180deg,rgba(95,212,255,.06),rgba(95,212,255,.02))}.dash .mfl.live .mf-box{background:rgba(95,212,255,.12)}
.dash .sf-cards i,.dash .mf-box i{background:#cfefff;box-shadow:0 0 8px rgba(95,212,255,.5)}
.dash .sf-env,.dash .sf-fly{background:#c9a86a}.dash .sf-env .flap{background:#e2c68f}
.dash .muted,.dash .sub,.dash .small{color:var(--soft)}
.dash .bnav{background:rgba(2,8,18,.92);border-color:rgba(95,212,255,.18)}
.dash ::selection{background:rgba(95,212,255,.35)}
.dash .tag{border-color:rgba(226,198,143,.5);color:var(--gold2)}

/* ------------------------------------------------------------------ JARVIS (Leitstand) */
.jv{--c:var(--cy)}
.jv-head{display:flex;align-items:center;justify-content:space-between;gap:16px;flex-wrap:wrap;margin:6px 0 4px}
.jv-brand{display:flex;align-items:center;gap:14px}
.jv-brand h1{margin:0;font-size:30px;font-weight:700;letter-spacing:.32em;color:#fff;text-shadow:0 0 22px rgba(95,212,255,.6)}
.jv-brand span{font-family:var(--hud);font-size:12px;letter-spacing:.24em;text-transform:uppercase;color:var(--soft)}
.jv-logo{position:relative;width:44px;height:44px;flex:none}
.jv-logo i{position:absolute;inset:0;border-radius:50%;border:2px solid transparent;border-top-color:var(--cy);border-right-color:rgba(95,212,255,.35)}
.jv-logo i:nth-child(2){inset:7px;border-top-color:var(--gold);border-left-color:rgba(226,198,143,.35)}
.jv-logo i:nth-child(3){inset:15px;background:radial-gradient(circle,#cff4ff,#5fd4ff 45%,transparent 70%);border:0;box-shadow:0 0 18px #5fd4ff}
.clock{font-family:var(--mono);font-size:14px;color:var(--cy2);letter-spacing:.08em;padding:6px 12px;border:1px solid var(--line);border-radius:4px;background:rgba(4,14,30,.6)}
.voice{font-family:var(--mono);font-size:13.5px;color:#bfe9ff;margin:10px 0 18px;min-height:1.6em;letter-spacing:.02em}
.voice:before{content:"JARVIS ›";color:var(--gold);margin-right:10px;letter-spacing:.12em}
.voice .caret{display:inline-block;width:8px;height:1.05em;margin-left:2px;vertical-align:-2px;background:var(--cy);box-shadow:var(--glow)}

.jv-hero{display:grid;grid-template-columns:1fr minmax(320px,460px) 1fr;gap:18px;align-items:center;margin-bottom:22px}
.jv-col{display:grid;gap:14px}
.reactor{position:relative;aspect-ratio:1;width:100%;max-width:460px;margin:0 auto}
.reactor svg{display:block;width:100%;height:100%;overflow:hidden}
.rc-halo{fill:none;stroke:rgba(95,212,255,.12);stroke-width:1}
.rc-ticks line{stroke:rgba(95,212,255,.35);stroke-width:1}.rc-ticks line.maj{stroke:var(--cy);stroke-width:2}
.rc-ticks{transform-origin:200px 200px}
.rc-slot{fill:rgba(95,212,255,.05);stroke:rgba(95,212,255,.14);stroke-width:.8}
.rc-slot.plan{fill:transparent;stroke:var(--c);stroke-opacity:.55;stroke-dasharray:3 2}
.rc-slot.run{fill:var(--c);stroke:#fff;stroke-opacity:.35}
.rc-slot.other{fill:#e2c68f}
.rc-slot.reserve{fill:rgba(139,166,201,.1);stroke:rgba(139,166,201,.3);stroke-dasharray:1 2}
.rc-dash{fill:none;stroke:rgba(95,212,255,.4);stroke-width:1.2;stroke-dasharray:2 7;transform-origin:200px 200px}
.rc-track{fill:none;stroke:rgba(95,212,255,.1);stroke-width:6}
.rc-util{fill:none;stroke:var(--gold);stroke-width:6;stroke-linecap:round;filter:drop-shadow(0 0 6px rgba(226,198,143,.6))}
.rc-core{opacity:.7}
.rc-blade{fill:none;stroke:rgba(168,236,255,.75);stroke-width:2;stroke-linecap:round}
.rc-spin{transform-origin:200px 200px}
.rc-center{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;pointer-events:none}
.rc-center b{font-family:var(--mono);font-size:clamp(34px,6vw,56px);font-weight:600;color:#fff;letter-spacing:-.02em;text-shadow:0 0 24px rgba(95,212,255,.8)}
.rc-center span{font-family:var(--hud);font-size:11.5px;letter-spacing:.18em;text-transform:uppercase;color:var(--cy2);max-width:60%;line-height:1.4;margin-top:4px}

.gauge{position:relative;padding:14px 14px 12px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(9,24,48,.7),rgba(4,12,26,.5));clip-path:polygon(0 12px,12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%)}
.gauge svg{display:block;width:100%;max-width:260px;margin:0 auto -8px;height:auto;aspect-ratio:400/230}
.g-track{fill:none;stroke:rgba(95,212,255,.1);stroke-width:16}
.g-val{fill:none;stroke:var(--gc);stroke-width:16;filter:drop-shadow(0 0 8px var(--gc))}
.g-tick{stroke:rgba(95,212,255,.35);stroke-width:2}
.gauge.gc-cyan{--gc:#5fd4ff}.gauge.gc-gold{--gc:#e2c68f}.gauge.gc-green{--gc:#3ddc97}.gauge.gc-amber{--gc:#ffb547}.gauge.gc-red{--gc:#ff5e73}
.g-read{text-align:center;display:grid;gap:2px}
.g-read b{font-family:var(--mono);font-size:28px;color:#fff;font-weight:600;text-shadow:0 0 14px color-mix(in srgb,var(--gc) 70%,transparent)}
.g-read b small{font-size:15px;margin-left:2px;color:var(--soft)}
.g-read span{font-family:var(--hud);font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--cy2)}
.g-read em{font-style:normal;font-size:12px;color:var(--soft)}

.hp{position:relative;margin:0 0 18px;padding:16px 18px 14px;background:linear-gradient(180deg,rgba(9,24,48,.66),rgba(4,12,26,.55));border:1px solid var(--line);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px)}
.hp .cn{position:absolute;width:14px;height:14px;border:2px solid var(--cy);opacity:.85;pointer-events:none}
.hp .cn.tl{top:-1px;left:-1px;border-right:0;border-bottom:0}.hp .cn.tr{top:-1px;right:-1px;border-left:0;border-bottom:0}
.hp .cn.bl{bottom:-1px;left:-1px;border-right:0;border-top:0}.hp .cn.br{bottom:-1px;right:-1px;border-left:0;border-top:0}
.hp>header{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid var(--line)}
.hp-t{font-family:var(--hud);font-weight:600;font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:#e6f6ff}
.hp-t em{font-style:normal;font-family:var(--mono);font-size:11px;color:#02060f;background:var(--cy);padding:2px 6px;margin-right:10px;letter-spacing:.06em;box-shadow:var(--glow)}
.jv-n{font-family:var(--mono);font-size:13px;color:var(--gold2);text-decoration:none}
.jv-note{margin:10px 0 0;font-size:12px;color:var(--soft)}
.jv-grid{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1.25fr);gap:18px}
.jv-grid .hp{margin-bottom:18px}

.jtips{list-style:none;margin:0;padding:0;display:grid;gap:10px;max-height:430px;overflow:auto;scrollbar-width:thin}
.jtip{position:relative;padding:10px 12px 10px 16px;border:1px solid var(--line);background:rgba(2,8,18,.45);display:grid;gap:3px}
.jtip:before{content:"";position:absolute;left:0;top:0;bottom:0;width:3px;background:var(--tc);box-shadow:0 0 10px var(--tc)}
.jtip.rot{--tc:#ff5e73}.jtip.gelb{--tc:#ffb547}.jtip.gruen{--tc:#3ddc97}.jtip.info{--tc:#5fd4ff}
.jtip b{font-family:var(--hud);font-size:15px;letter-spacing:.03em;color:#fff}
.jtip span{font-size:13px;color:#b6cbe6;line-height:1.45}
.jtip-go{justify-self:start;font-family:var(--hud);font-size:12px;letter-spacing:.12em;text-transform:uppercase;text-decoration:none;color:var(--tc)!important;margin-top:2px}

.uchart{display:block;width:100%;height:auto}
.u-grid{stroke:rgba(95,212,255,.08)}.u-cap{stroke:var(--gold);stroke-dasharray:6 4;stroke-opacity:.7}
.u-ax{fill:#7f9bbd;font-family:var(--mono);font-size:11px}.u-ax.end{text-anchor:end;fill:var(--gold2)}
.u-bar{fill:url(#none);fill:rgba(95,212,255,.55)}.u-bar.hi{fill:#5fd4ff;filter:drop-shadow(0 0 4px rgba(95,212,255,.8))}.u-bar.zero{fill:rgba(95,212,255,.08)}.u-bar.nodata{fill:rgba(139,166,201,.18)}

.jv-legend{display:flex;flex-wrap:wrap;gap:6px 12px;font-family:var(--mono);font-size:11px;color:var(--soft)}
.jv-legend span{display:inline-flex;align-items:center;gap:5px}.jv-legend i{width:10px;height:10px;display:inline-block;box-shadow:0 0 6px currentColor}
.jv-legend .lg-plan{border:1px dashed #8ba6c9;box-shadow:none}.jv-legend .lg-free{background:rgba(95,212,255,.08);border:1px solid rgba(95,212,255,.2);box-shadow:none}
.bays{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:8px}
.bay{position:relative;min-height:84px;padding:7px 8px 8px;border:1px solid rgba(95,212,255,.14);background:rgba(2,8,18,.5);display:flex;flex-direction:column;gap:2px;overflow:hidden}
.bay .bn{font-family:var(--mono);font-size:10.5px;color:#5d7ca3}
.bay .bl{font-family:var(--hud);font-weight:600;font-size:12.5px;letter-spacing:.08em;color:#8ba6c9}
.bay .bv{font-size:11px;color:#b6cbe6;line-height:1.25}.bay .bv b{font-family:var(--mono);font-size:15px;color:#fff;margin-right:3px}.bay .bv i{display:block;font-style:normal;color:#7f9bbd;font-size:10.5px}
.bay .bp{position:absolute;left:0;bottom:0;height:3px;width:var(--p);background:var(--c);box-shadow:0 0 8px var(--c)}
.bay.run{border-color:color-mix(in srgb,var(--c) 70%,transparent);background:linear-gradient(180deg,color-mix(in srgb,var(--c) 22%,transparent),rgba(2,8,18,.6));box-shadow:inset 0 0 18px color-mix(in srgb,var(--c) 25%,transparent),0 0 14px -4px var(--c)}
.bay.run .bl{color:var(--c)}.bay.run .bn{color:color-mix(in srgb,var(--c) 70%,#fff)}
.bay.plan{border-style:dashed;border-color:color-mix(in srgb,var(--c) 45%,transparent)}.bay.plan .bl{color:color-mix(in srgb,var(--c) 65%,#8ba6c9)}
.bay.other{border-color:rgba(226,198,143,.6);background:rgba(226,198,143,.1)}.bay.other .bl{color:var(--gold2)}
.bay.reserve{background:repeating-linear-gradient(45deg,rgba(139,166,201,.06) 0 6px,transparent 6px 12px)}.bay.reserve .bl{color:#5d7ca3}
.bay.free .bl{color:#4d6b91}

.pult-sum{display:grid;gap:8px;margin-bottom:14px}
.ps-bar{position:relative;height:14px;background:rgba(95,212,255,.07);border:1px solid var(--line)}
.ps-bar i{position:absolute;top:0;bottom:0;transition:left .25s,width .25s;box-shadow:0 0 10px currentColor}
.ps-bar .ps-res{background:repeating-linear-gradient(45deg,rgba(139,166,201,.25) 0 4px,transparent 4px 8px);box-shadow:none}
.ps-bar .ps-cap{width:2px;background:var(--gold);top:-5px;bottom:-5px;box-shadow:0 0 8px var(--gold)}
.ps-read{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.ps-read b{font-family:var(--mono);font-size:30px;color:#fff;text-shadow:var(--glow)}.ps-read b.bad,.ps-read em.bad{color:#ff5e73}
.ps-read span{color:var(--soft);font-size:13px}.ps-read em{font-style:normal;font-family:var(--mono);font-size:13px;color:var(--green)}
.lanes{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.lane{display:grid;grid-template-columns:96px minmax(0,1fr) 290px;gap:14px;align-items:center;padding:10px 12px;border:1px solid var(--line);background:rgba(2,8,18,.45);border-left:3px solid var(--c)}
.lane.off{opacity:.55;border-left-color:rgba(139,166,201,.4)}
.lane.live{box-shadow:inset 0 0 22px color-mix(in srgb,var(--c) 14%,transparent)}
.ln-id{display:flex;align-items:center;gap:8px}
.hex{font-family:var(--mono);font-size:12px;font-weight:600;color:#02060f;background:var(--c);padding:5px 7px;clip-path:polygon(8% 0,92% 0,100% 50%,92% 100%,8% 100%,0 50%);box-shadow:0 0 12px var(--c);white-space:nowrap}
.ln-led{width:8px;height:8px;border-radius:50%;background:rgba(139,166,201,.4)}.lane.live .ln-led{background:var(--c);box-shadow:0 0 10px var(--c)}
.ln-main{display:grid;gap:3px;min-width:0}
.ln-main b{font-family:var(--hud);font-size:16px;letter-spacing:.03em;color:#fff;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.ln-main b small{font-family:var(--mono);font-size:12.5px;font-weight:400;color:var(--soft);letter-spacing:0}
.ln-what{font-size:13px;color:#9db6d6}
.ln-read{display:flex;gap:6px 16px;flex-wrap:wrap;margin-top:2px;font-family:var(--mono);font-size:13px;color:#e6f6ff}
.ln-read>span{flex:0 0 auto}
/* .dash .st (Status-Punkt der alten Ansicht) nicht auf die Lauf-Marke anwenden */
.dash .ln-read .st{display:inline-block;width:auto;height:auto;border-radius:0;margin:0;vertical-align:baseline;place-items:normal}
.ln-read em{font-style:normal;font-size:12px;color:#8ba6c9;margin-right:5px;text-transform:uppercase;letter-spacing:.06em}
.ln-read small{font-size:12px;color:var(--soft);margin-left:3px}
.ln-read .st{white-space:nowrap;font-family:var(--hud);font-size:12.5px;letter-spacing:.1em;text-transform:uppercase;color:#8ba6c9;border:1px solid var(--line);padding:0 6px}
.ln-read .st.warn{color:#ffb547;border-color:rgba(255,181,71,.45)}.ln-read .st.run{color:var(--c);border-color:var(--c)}
.ln-ctl{display:grid;grid-template-columns:34px 52px 34px;grid-template-areas:"m o p" "r r r" "x x x";gap:6px 6px;justify-content:end;align-items:center}
.ln-ctl button{grid-area:auto;height:34px;padding:0;font-size:20px;line-height:1;color:var(--c);border-color:color-mix(in srgb,var(--c) 50%,transparent)}
.ln-ctl button:first-child{grid-area:m}.ln-ctl button:nth-of-type(2){grid-area:p}
.ln-ctl output{grid-area:o;text-align:center;font-size:24px;color:#fff;text-shadow:0 0 12px var(--c)}
.ln-ctl input[type=range]{grid-area:r;width:100%;accent-color:var(--c);background:transparent;border:0;box-shadow:none;padding:0}
.ln-max{grid-area:x;font-family:var(--mono);font-size:12px;color:#8ba6c9;text-align:right}
.pult-go{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}
.pult-go .go{font-family:var(--hud);font-size:15px;letter-spacing:.14em;text-transform:uppercase;padding:10px 22px;color:#02060f;background:linear-gradient(180deg,#a8ecff,#5fd4ff);border:0;box-shadow:0 0 22px rgba(95,212,255,.55);cursor:pointer}
.pult-go .go:disabled{background:rgba(95,212,255,.12);color:#6e8db3;box-shadow:none;cursor:default}
.pult-go .ghost{font-family:var(--hud);letter-spacing:.1em;text-transform:uppercase;font-size:13px;padding:9px 14px;cursor:pointer}
.pult-go .hint{font-size:13px;color:var(--soft)}

.machines{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}
.mc{position:relative;padding:12px 12px 10px;border:1px solid var(--line);background:rgba(2,8,18,.45);display:grid;gap:6px;align-content:start}
.mc-top{display:flex;align-items:center;gap:8px}.mc-top b{font-family:var(--hud);font-size:15.5px;letter-spacing:.04em;color:#fff;flex:1}
.mc-lamp{width:10px;height:10px;border-radius:50%;background:#3d5677;flex:none}
.mc.live .mc-lamp{background:var(--cy);box-shadow:0 0 12px var(--cy)}.mc.bad .mc-lamp{background:#ff5e73;box-shadow:0 0 12px #ff5e73}
.mc.off{opacity:.6}.mc.live{border-color:rgba(95,212,255,.45);box-shadow:inset 0 0 24px rgba(95,212,255,.08)}
.mc-what{font-size:12.5px;color:#9db6d6}
.mc dl{margin:0;display:grid;grid-template-columns:1fr 1fr;gap:4px 10px}.mc dl div{min-width:0}.mc dl .wide{grid-column:1/-1}
.mc dt{font-family:var(--mono);font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#6e8db3}.mc dd{margin:0;font-size:12.5px;color:#e6f6ff}
.mc-go button{width:100%;font-family:var(--hud);letter-spacing:.12em;text-transform:uppercase;font-size:12.5px;padding:6px;cursor:pointer}
.mc-go button:disabled{opacity:.45;cursor:default}

@media (prefers-reduced-motion:no-preference){
  .rc-ticks{animation:jv-spin 90s linear infinite}.rc-dash{animation:jv-spin 40s linear infinite reverse}
  .reactor.hot .rc-spin{animation:jv-spin 6s linear infinite}.reactor:not(.hot) .rc-spin{animation:jv-spin 40s linear infinite}
  .rc-slot.run{animation:jv-pulse 2.4s ease-in-out infinite;animation-delay:calc(var(--i) * -.13s)}
  .rc-core{animation:jv-breath 4s ease-in-out infinite}
  .voice .caret{animation:jv-blink 1s steps(2) infinite}
  .bay.run:after{content:"";position:absolute;left:0;right:0;height:40%;top:-40%;background:linear-gradient(180deg,transparent,color-mix(in srgb,var(--c) 22%,transparent),transparent);animation:jv-scan 2.8s linear infinite}
  .jv-logo i:nth-child(1){animation:jv-spin 3.5s linear infinite}.jv-logo i:nth-child(2){animation:jv-spin 5s linear infinite reverse}
  .lane.live .ln-led,.mc.live .mc-lamp{animation:jv-blink 1.6s ease-in-out infinite}
  .hp{animation:jv-in .6s ease-out both}
}
@keyframes jv-spin{to{transform:rotate(360deg)}}
@keyframes jv-pulse{0%,100%{opacity:1}50%{opacity:.55}}
@keyframes jv-breath{0%,100%{opacity:.55}50%{opacity:.85}}
@keyframes jv-blink{50%{opacity:.25}}
@keyframes jv-scan{to{top:100%}}
@keyframes jv-in{from{opacity:0;transform:translateY(8px)}}

@media (max-width:1100px){
  .jv-hero{grid-template-columns:1fr 1fr}.reactor{grid-column:1/-1;grid-row:1;max-width:420px}
  .jv-grid{grid-template-columns:1fr}.machines{grid-template-columns:repeat(2,minmax(0,1fr))}
  .bays{grid-template-columns:repeat(8,minmax(0,1fr))}
}
@media (max-width:720px){
  .jv-brand h1{font-size:22px;letter-spacing:.22em}
  .jv-hero{grid-template-columns:1fr 1fr;gap:10px}.jv-col{gap:10px}
  .gauge{padding:10px 8px}.g-read b{font-size:21px}.g-read span{font-size:10px;letter-spacing:.1em}
  .bays{grid-template-columns:repeat(5,minmax(0,1fr));gap:6px}.bay{min-height:64px;padding:5px}.bay .bv i{display:none}
  .lane{grid-template-columns:1fr;gap:8px}.ln-ctl{justify-content:stretch;grid-template-columns:44px 1fr 44px}
  .machines{grid-template-columns:1fr}
  .hp{padding:12px 12px 10px}
  .bay .bl{font-size:11px;letter-spacing:.02em;white-space:nowrap;overflow:hidden;text-overflow:clip}
  .dash .bnav{grid-template-columns:none;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr)}.dash .bnav a{font-size:10px;white-space:nowrap;min-width:0;letter-spacing:-.02em}.dash .bnav a .bnl{display:block;max-width:100%;overflow:hidden;text-overflow:ellipsis}
}

/* ------------------------------------------------------------------ JARVIS v2: Fluss-Karte (Inhaber 03.10.2026) */
.dash{font-size:15.5px}
.jv2 .jv-brand h1{font-size:26px;letter-spacing:.12em}
.jv2 .voice{font-family:var(--sans);font-size:15px;margin:6px 0 10px}
.jv2 .voice:before{content:"JARVIS";font-weight:700;margin-right:10px;letter-spacing:.08em}
.jtips2{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 16px}
.jt{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid var(--tc);border-radius:999px;font-size:13.5px;font-weight:600;color:#fff!important;text-decoration:none;background:color-mix(in srgb,var(--tc) 14%,transparent)}
.jt:before{content:"";width:8px;height:8px;border-radius:50%;background:var(--tc);box-shadow:0 0 8px var(--tc)}
.jt.rot{--tc:#ff5e73}.jt.gelb{--tc:#ffb547}.jt.gruen{--tc:#3ddc97}.jt.info{--tc:#5fd4ff}
.jt:hover{background:color-mix(in srgb,var(--tc) 26%,transparent)}
/* Hinweise auf Agenten ziehen (Inhaber 03.10.2026) */
.jt-wrap{position:relative;display:inline-flex;align-items:center;gap:4px}
.jt-drag{cursor:grab}.jt-drag:active{cursor:grabbing}
.jt.jt-drag:before{display:none}
.jt-grip{font-style:normal;color:var(--tc);font-size:15px;line-height:1;margin-right:-2px}
.jt-give{width:34px;height:34px;border-radius:50%;border:1px solid var(--line);background:rgba(8,18,36,.8);color:var(--cy2);cursor:pointer;display:grid;place-items:center;padding:0}
.jt-give svg{width:16px;height:16px}
@media (hover:hover) and (pointer:fine){.jt-give{opacity:0;width:0;border-width:0;margin-left:-4px;transition:opacity .15s,width .15s}
  .jt-wrap:hover .jt-give,.jt-wrap.open .jt-give,.jt-give:focus-visible{opacity:1;width:34px;border-width:1px;margin-left:0}}
.jt-give:hover,.jt-wrap.open .jt-give{border-color:var(--gold);color:var(--gold)}
.jt-pick{position:absolute;top:calc(100% + 6px);left:0;z-index:40;display:flex;align-items:center;gap:6px;padding:6px 8px;background:#07101f;border:1px solid var(--line);border-radius:12px;box-shadow:0 12px 30px rgba(0,0,0,.5)}
.jt-pick em{font-style:normal;font-size:12px;color:var(--soft);margin-right:2px}
.jt-pick button{min-width:44px;height:40px;border-radius:10px;border:1px solid rgba(95,212,255,.35);background:rgba(95,212,255,.08);color:#fff;font:700 14px var(--sans);cursor:pointer}
.jt-pick button:hover{border-color:var(--gold);color:var(--gold)}
.drag-box{display:contents}
.amp4.jt-drag{cursor:grab}
/* JARVIS empfiehlt und Chat (Inhaber 04.10.2026) */
.jrec{margin:0 0 12px}.jrec h2{display:flex;align-items:center;gap:6px;margin:0 0 6px;font-size:13px;font-weight:700;color:var(--gold);letter-spacing:.04em}
.jrec-l{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:8px}
.jrec-i{--tc:var(--cy);display:flex;align-items:stretch;border:1px solid color-mix(in srgb,var(--tc) 45%,transparent);border-left:3px solid var(--tc);border-radius:10px;background:color-mix(in srgb,var(--tc) 8%,rgba(4,12,26,.7));min-width:0}
.jrec-i.rot{--tc:#ff5e73}.jrec-i.gelb{--tc:#ffb547}.jrec-i.gruen{--tc:#3ddc97}.jrec-i.info{--tc:#5fd4ff}
.jrec-t{flex:1;min-width:0;display:grid;gap:2px;padding:8px 10px;text-decoration:none;color:var(--text)!important}
.jrec-t b{font-size:14px;color:#fff}.jrec-t span{font-size:13px;color:var(--soft);line-height:1.35}
.jrec-give{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;min-width:52px;padding:6px;border-left:1px solid var(--line);text-decoration:none;color:var(--cy2)!important;font-size:11.5px;font-weight:700}
.jrec-give:hover{color:var(--gold)!important}
.jchat{margin:0 0 14px;border:1px solid var(--line);border-radius:12px;background:rgba(4,12,26,.6)}
.jchat summary{display:flex;align-items:center;gap:8px;padding:10px 12px;cursor:pointer;font-weight:700;font-size:14px;color:var(--cy2);list-style:none;min-height:44px}
.jchat summary::-webkit-details-marker{display:none}
.jchat summary em{font-style:normal;font-weight:500;font-size:12.5px;color:var(--soft);margin-left:auto}
.jchat[open] summary{border-bottom:1px solid var(--line)}
.jchat-log{list-style:none;margin:0;padding:10px 12px;display:grid;gap:10px;max-height:320px;overflow:auto}
.jchat-log li{display:grid;gap:4px}
.jchat-log p{margin:0;padding:8px 10px;border-radius:10px;font-size:14px;line-height:1.4;max-width:88%}
.jchat-log .me{justify-self:end;background:rgba(95,212,255,.14);display:grid;gap:2px}
.jchat-log .me time{font-size:11.5px;color:var(--soft)}
.jchat-log .bot{justify-self:start;background:rgba(226,198,143,.1);border:1px solid rgba(226,198,143,.3)}
.jchat-log .bot b{color:var(--gold);font-size:12px;margin-right:6px}
.jchat-log .bot.st-fehler{border-color:#ff5e73}
.jchat-f{display:flex;gap:8px;padding:10px 12px;align-items:flex-end}
.jchat-f textarea{flex:1;min-width:0;padding:9px 11px;border-radius:8px;font:inherit;font-size:15px;resize:vertical;min-height:44px}
.jchat-f .go{display:flex;align-items:center;gap:6px;padding:10px 16px;min-height:44px;border-radius:8px;font-weight:700;color:#02060f;background:linear-gradient(180deg,#f2dcae,#e2c68f);border:0;cursor:pointer;white-space:nowrap}
.jchat>.lock{padding:0 12px 10px;display:flex;gap:6px;align-items:flex-start}
@media (max-width:720px){.jrec-l{grid-template-columns:1fr}.jchat-f{flex-direction:column;align-items:stretch}.jchat-log p{max-width:100%}}
.jchat>.lock .jchat-all{display:inline-flex;align-items:center;gap:5px;min-height:32px;text-decoration:none;color:var(--cy2)}
.jchat>.lock .jchat-all+.jchat-all{margin-left:12px}
.jc-dot-s{display:inline-block;width:8px;height:8px;border-radius:50%;background:var(--gold);box-shadow:0 0 8px rgba(226,198,143,.8);margin-left:4px}
.jchat-log .me time{overflow-wrap:anywhere}.jchat-log p{overflow-wrap:anywhere;white-space:pre-wrap}
.ag-drop{position:relative;flex:1 0 150px;display:flex;min-width:0}
.ag-drop>.ag{flex:1;min-width:0}
.ag-hint{display:none}
.jv-dragging .ag-drop>.ag{border-color:rgba(226,198,143,.7);box-shadow:0 0 0 2px rgba(226,198,143,.25),0 0 22px rgba(226,198,143,.25)}
.ag-drop.over>.ag{border-color:var(--gold);background:rgba(226,198,143,.12)}
.ag-drop.over .ag-hint,.ag-drop.busy .ag-hint{display:grid;place-items:center;position:absolute;inset:0;border-radius:12px;background:rgba(2,6,15,.9);color:var(--gold);font-weight:700;font-size:14px;pointer-events:none}

.amps4{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-bottom:16px}
.amp4{position:relative;display:grid;gap:2px;padding:14px 16px 12px 40px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(9,24,48,.7),rgba(4,12,26,.5));text-decoration:none;color:var(--text)!important;border-radius:10px;transition:border-color .2s,transform .2s}
.amp4:hover{border-color:var(--ac);transform:translateY(-1px)}
.amp4-led{position:absolute;left:16px;top:20px;width:12px;height:12px;border-radius:50%;background:var(--ac);box-shadow:0 0 12px var(--ac)}
.amp4 b{font-size:24px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;line-height:1.1}
.amp4 span{font-size:13px;color:var(--cy2);font-weight:600}.amp4 em{font-style:normal;font-size:12.5px;color:var(--soft)}
.amp4.t-green{--ac:#3ddc97}.amp4.t-gold{--ac:#ffb547}.amp4.t-red{--ac:#ff5e73}.amp4.t-cyan{--ac:#5fd4ff}.amp4.t-grey{--ac:#5d7ca3}
.dash .amp4.t-gold,.dash .amp4.t-grey{background:linear-gradient(180deg,rgba(9,24,48,.7),rgba(4,12,26,.5))}

.jv-stage{position:relative;display:grid;grid-template-columns:minmax(0,1fr);gap:16px;min-height:560px}
.jv2.has-drw .fl-st:not(.on){opacity:.85}
.fl{position:relative;border:1px solid var(--line);border-radius:14px;background:radial-gradient(600px 300px at 50% 50%,rgba(40,110,190,.12),transparent 70%),rgba(4,12,26,.45);padding:8px}
.fl-lanes{position:absolute;inset:8px;display:grid;grid-template-rows:repeat(3,1fr);pointer-events:none}
.fl-lanes span{font-size:12px;font-weight:600;color:#4d6b91;padding:6px 10px;letter-spacing:.04em}
.fl-lanes span+span{border-top:1px dashed rgba(95,212,255,.1)}
.fl-lanes>span{display:flex;align-items:flex-start;gap:6px}
.fl-lanes span span{padding:0;border:0}
.fl-info{position:relative;z-index:5;pointer-events:auto;cursor:help;display:inline-flex;color:#6f8db3;font-style:normal;margin-top:1px}
.fl-info:hover,.fl-info:focus-visible{color:#9fd8ff;outline:none}
.fl-info-m{display:none;margin:6px 2px 14px;font-size:12px;color:#6f8db3;align-items:center;gap:6px}
.fl-map{position:relative;width:100%}
.fl-tall{display:none}
.fl-svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.fl-pipe{fill:none;stroke:rgba(95,212,255,.1);stroke-width:12;stroke-linecap:round}
.fl-core{fill:none;stroke:rgba(95,212,255,.28);stroke-width:2;stroke-dasharray:4 6}
.fl-edge.on .fl-pipe{stroke:rgba(95,212,255,.16)}.fl-edge.on .fl-core{stroke:rgba(95,212,255,.6);stroke-dasharray:none}
.fl-edge.off .fl-core{stroke:rgba(139,166,201,.25)}
.fl-edge.jam .fl-pipe{stroke:rgba(255,94,115,.22)}.fl-edge.jam .fl-core{stroke:rgba(255,94,115,.7)}
.fl-dot{fill:#cff4ff}
.fl-edge.jam .fl-dot{fill:#ffb3bd}
.fl-rate{fill:#9fd8f2;font:600 13px var(--sans);text-anchor:middle;paint-order:stroke;stroke:#02060f;stroke-width:4px}
.fl-rate.zero{fill:#5d7a9c}
.fl-tall .fl-rate{font-size:14px}
.fl-st{position:absolute;transform:translate(-50%,-50%);width:132px;height:132px;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;text-decoration:none;color:var(--text)!important;
  background:radial-gradient(circle at 50% 35%,rgba(30,70,120,.85),rgba(6,16,34,.95) 70%);border:2px solid rgba(95,212,255,.3);box-shadow:0 0 0 6px rgba(2,6,15,.85),0 10px 30px -10px rgba(0,0,0,.9);transition:transform .2s,border-color .2s,box-shadow .2s;z-index:2}
.fl-st:hover{transform:translate(-50%,-50%) scale(1.06);border-color:var(--cy)}
.fl-st.on{border-color:var(--gold);box-shadow:0 0 0 6px rgba(2,6,15,.85),0 0 30px rgba(226,198,143,.5)}
.fl-st.goal{width:150px;height:150px;border-color:rgba(226,198,143,.55)}
.fl-ring{position:absolute;inset:-9px;border-radius:50%;pointer-events:none}
.fl-ring i{position:absolute;inset:0;border-radius:50%;border:2px solid transparent}
.fl-st.live .fl-ring i:first-child{border-top-color:var(--cy);border-right-color:rgba(95,212,255,.4)}
.fl-st.live{border-color:rgba(95,212,255,.7)}
.fl-st.bad{border-color:#ff5e73}.fl-st.off{opacity:.55;filter:grayscale(.6)}
.fl-st.neck{border-color:#ff5e73;box-shadow:0 0 0 6px rgba(2,6,15,.85),0 0 34px rgba(255,94,115,.55)}
.fl-ic{font-size:18px;line-height:1;color:var(--cy2);margin-bottom:2px}
.fl-v{font-size:26px;font-weight:700;color:#fff;line-height:1.1;font-variant-numeric:tabular-nums;white-space:nowrap}
.fl-v small{font-size:13px;color:var(--soft);font-weight:600}
.fl-l{font-size:13px;font-weight:700;color:var(--cy2);margin-top:2px}
.fl-s{font-size:12.5px;color:var(--soft);max-width:110px;line-height:1.25}
.fl-neck{position:absolute;top:-14px;font-style:normal;font-size:12px;font-weight:700;color:#fff;background:#ff5e73;padding:2px 8px;border-radius:999px;box-shadow:0 0 12px rgba(255,94,115,.7)}
/* Autopilot-Abzeichen unten rechts auf dem Kreisrand (Inhaber 04.10.2026): Schalter, grün = an, grau = aus */
.fl-map{--fl-r:66px}
.dash .fl-auto{position:absolute;z-index:3;translate:calc(-50% + var(--fl-r)*.72) calc(-50% + var(--fl-r)*.72);transform:translate(0,0);display:inline-flex;align-items:center;justify-content:center;
  height:22px;min-height:0;padding:0 9px;border-radius:999px;font:700 11.5px/1 var(--sans);letter-spacing:.02em;cursor:pointer;white-space:nowrap;
  background:#1a2638;border:1.5px solid #5d7ca3;color:#a9bdd6;box-shadow:0 0 0 3px rgba(2,6,15,.9);transition:background .15s,border-color .15s,color .15s}
.dash .fl-auto.on{background:#14402f;border-color:var(--green);color:#bff5dc;box-shadow:0 0 0 3px rgba(2,6,15,.9),0 0 12px rgba(61,220,151,.45)}
.dash .fl-auto:hover:not(:disabled){border-color:var(--cy);box-shadow:0 0 0 3px rgba(2,6,15,.9),var(--glow)}
.dash .fl-auto.on:hover:not(:disabled){border-color:#7ff0bf;box-shadow:0 0 0 3px rgba(2,6,15,.9),0 0 14px rgba(61,220,151,.6)}
.dash .fl-auto.err{border-color:var(--red)}
.dash .fl-auto:disabled{opacity:.7;cursor:progress}

.drw{position:absolute;right:10px;top:10px;max-height:calc(100% - 20px);width:420px;max-width:calc(100% - 20px);overflow:auto;z-index:35;scrollbar-width:thin;border:1px solid rgba(226,198,143,.45);border-radius:14px;background:linear-gradient(180deg,rgba(12,28,54,.97),rgba(4,12,26,.98));-webkit-backdrop-filter:blur(12px);backdrop-filter:blur(12px);padding:14px 16px 16px;align-self:start;box-shadow:0 20px 60px -20px rgba(0,0,0,.9),0 0 30px -10px rgba(226,198,143,.35);animation:drw-in .25s ease-out}
.drw-shade{display:none}
.drw header{display:flex;align-items:center;gap:10px;margin-bottom:10px}
.drw h2{margin:0;font-size:19px;flex:1;color:#fff}
.drw-ic{font-size:20px;color:var(--gold)}
.drw-x{width:32px;height:32px;display:grid;place-items:center;border-radius:50%;border:1px solid var(--line);text-decoration:none;color:var(--text)!important}
.drw-tabs{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;margin-bottom:14px}
.drw-tabs a{display:flex;align-items:center;justify-content:center;gap:6px;padding:8px 6px;border:1px solid var(--line);border-radius:8px;text-decoration:none;color:#a9c3e3!important;font-size:14px;font-weight:600}
.drw-tabs a.on{background:linear-gradient(180deg,rgba(95,212,255,.26),rgba(95,212,255,.08));border-color:var(--cy);color:#fff!important}
.drw-body{display:grid;gap:14px}
.drw-body .reactor{max-width:260px}
.bigs{display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:8px}
.bigs div{border:1px solid var(--line);border-radius:10px;padding:10px;background:rgba(2,8,18,.5);text-align:center}
.bigs b{display:block;font-size:22px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap}
.bigs span{font-size:12.5px;color:var(--soft)}
.mbars{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.mbars li>*{display:grid;grid-template-columns:72px 1fr auto;gap:10px;align-items:center;text-decoration:none;color:var(--text)!important;padding:3px 0}
.mb-l{font-size:13px;font-weight:600;color:var(--cy2);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.mb-b{height:10px;border-radius:5px;background:rgba(95,212,255,.08);overflow:hidden}.mb-b i{display:block;height:100%;border-radius:5px;background:var(--cy);box-shadow:0 0 8px rgba(95,212,255,.5)}
.mbars b{font-size:14px;font-variant-numeric:tabular-nums;color:#fff}
.mbars a:hover .mb-b{background:rgba(95,212,255,.16)}
.chk{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.chk li{display:grid;grid-template-columns:22px 1fr auto;grid-template-areas:"i b s" "i e e";gap:0 8px;padding:8px 10px;border:1px solid var(--line);border-radius:8px;background:rgba(2,8,18,.45)}
.chk i{grid-area:i;font-style:normal;font-weight:700;color:#3ddc97}.chk li.bad i{color:#ff5e73}.chk li.warn i{color:#ffb547}.chk li.grey i{color:var(--soft)}
.fun{width:100%;border-collapse:collapse;margin:12px 0 4px;font-size:12.5px}.fun th,.fun td{padding:6px 4px;text-align:right;border-bottom:1px solid var(--line)}.fun thead th{color:var(--soft);font-weight:500;font-size:11px}.fun tbody th{text-align:left;color:var(--text)}.fun td{font-family:var(--mono)}.fun th:first-child{text-align:left}.fun th,.fun td{white-space:nowrap}@media (max-width:400px){.fun{font-size:11px}.fun th,.fun td{padding:6px 2px}.fun thead th{font-size:10px}}
.chk b{grid-area:b;font-size:14px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.chk b a{color:#fff}
.chk span{grid-area:s;font-size:12px;color:var(--soft);white-space:nowrap}
.chk em{grid-area:e;font-style:normal;font-size:12.5px;color:#9db6d6;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.chk li.none{display:block;color:var(--soft);font-size:13px}
.seg{display:flex;gap:6px}.seg a{padding:5px 12px;border:1px solid var(--line);border-radius:999px;text-decoration:none;font-size:13px;color:#a9c3e3!important}.seg a.on{border-color:var(--cy);color:#fff!important;background:rgba(95,212,255,.14)}
.more2{font-size:14px;font-weight:600;color:var(--gold2)!important;text-decoration:none}
.lock{margin:0;font-size:13px;color:var(--soft)}.dash .drw .lock,.dash .jv2 .lock{font-size:13px;font-weight:500}.warn{margin:0;font-size:13.5px;color:#ffb547;font-weight:600}
/* Autopilot (Nachtschicht 04.10.2026) */
.ap{border:1px solid rgba(95,212,255,.25);border-radius:12px;padding:12px 14px;margin:10px 0 14px;background:rgba(95,212,255,.05)}
.ap-h{display:flex;align-items:center;gap:12px;flex-wrap:wrap}
.ap-h b{display:inline-flex;align-items:center;gap:6px;font-size:15px;color:#fff}
.ap-h em{font-style:normal;font-size:13px;color:var(--soft);margin-left:auto}
.ap-l{list-style:none;margin:10px 0 4px;padding:0;display:grid;gap:6px}
.ap-l li{display:grid;grid-template-columns:34px 64px 1fr;align-items:baseline;gap:8px;font-size:13px}
.ap-l li b{font-size:18px;color:var(--cy2);font-variant-numeric:tabular-nums;text-align:right}
.ap-l li span{font-weight:700;color:#fff}
.ap-l li em{font-style:normal;color:var(--soft);line-height:1.35}
.ap-l li.off{opacity:.55}
.row-sw,.row-sw2{display:flex;align-items:center;gap:10px;flex-wrap:wrap}
.row-sw2 button{padding:8px 14px;border-radius:8px;cursor:pointer;font-weight:600}.row-sw2 button.on.go{background:rgba(61,220,151,.2);border-color:#3ddc97}.row-sw2 button.on.stop{background:rgba(255,94,115,.2);border-color:#ff5e73}
.row-go button{padding:7px 12px;border-radius:8px;cursor:pointer;font-weight:600}.row-go button:disabled{opacity:.45;cursor:default}
.tog2{display:flex;gap:8px;flex-wrap:wrap}.tog2 button{display:inline-flex;align-items:center;gap:6px;padding:6px 14px;border-radius:999px;cursor:pointer;font-weight:600}
.tog2 button i{width:9px;height:9px;border-radius:50%}.tog2 button.off{opacity:.45;text-decoration:line-through}
.frm{display:grid;gap:8px}.frm label{display:grid;grid-template-columns:72px 90px 1fr;gap:10px;align-items:center}
.frm label span{font-weight:600;color:var(--cy2)}.frm label em{font-style:normal;font-size:12.5px;color:var(--soft)}
.frm input,.frm select{padding:7px 9px;border-radius:8px}
.frm .go,.pult-go .go{justify-self:start;padding:9px 18px;border-radius:8px;font-family:var(--sans);font-size:14px;letter-spacing:0;text-transform:none;font-weight:700;color:#02060f;background:linear-gradient(180deg,#a8ecff,#5fd4ff);border:0;cursor:pointer}
.drw .ln-what,.drw .ln-max{display:none}
.drw .lane{grid-template-columns:1fr;gap:8px}.drw .ln-ctl{justify-content:stretch;grid-template-columns:44px 1fr 44px}
.drw .pult-go .hint{display:none}
.drw .ln-main b small{display:none}.drw .ln-read{font-size:13px;gap:4px 12px}.drw .ln-read .st{font-size:12px}.drw .ps-read span{font-size:13px}

.tick{display:flex;align-items:center;gap:12px;margin-top:16px;border:1px solid var(--line);border-radius:10px;background:rgba(2,8,18,.6);overflow:hidden;height:44px}
.tick-l{flex:none;align-self:stretch;display:flex;align-items:center;padding:0 12px;font-size:12px;font-weight:800;letter-spacing:.12em;color:#02060f;background:#3ddc97}
.tick-v{flex:1;overflow:hidden;-webkit-mask-image:linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent);mask-image:linear-gradient(90deg,transparent,#000 4%,#000 96%,transparent)}
.tick-t{display:inline-flex;gap:28px;white-space:nowrap;padding-left:8px}
.tick-dup{display:inline-flex;gap:28px}
.tk{display:inline-flex;align-items:center;gap:7px;font-size:14px;color:#cfe3f7}
.tk time{font-size:13px;color:#8ba6c9;font-variant-numeric:tabular-nums}.tk i{font-style:normal;color:var(--kc)}
.tk a{color:#e6f6ff!important;text-decoration:none}.tk a:hover{text-decoration:underline}
.tk.t-cyan{--kc:#5fd4ff}.tk.t-gold{--kc:#ffb547}.tk.t-green{--kc:#3ddc97}.tk.t-red{--kc:#ff5e73}.tk.t-grey{--kc:#8ba6c9}

@media (prefers-reduced-motion:no-preference){
  .fl-st.live .fl-ring i:first-child{animation:jv-spin 3s linear infinite}
  .fl-st.neck{animation:neck-pulse 1.8s ease-in-out infinite}
  .tick-t{animation:tick-run 60s linear infinite}.tick:hover .tick-t{animation-play-state:paused}
  .amp4.t-red .amp4-led{animation:jv-blink 1.4s ease-in-out infinite}
}
@media (prefers-reduced-motion:reduce){.fl-dot{display:none}.tick-dup{display:none}}
@keyframes neck-pulse{50%{box-shadow:0 0 0 6px rgba(2,6,15,.85),0 0 10px rgba(255,94,115,.3)}}
@keyframes tick-run{to{transform:translateX(-50%)}}
@keyframes drw-in{from{opacity:0;transform:translateX(16px)}}

@media (max-width:1100px){
  .fl-st{width:112px;height:112px}.fl-st.goal{width:124px;height:124px}.fl-v{font-size:19px}.fl-s{display:none}.fl-map{--fl-r:56px}
}
@media (max-width:720px){
  .amps4{grid-template-columns:1fr 1fr;gap:8px}.amp4{padding:10px 10px 10px 32px}.amp4-led{left:12px;top:16px;width:10px;height:10px}.amp4 b{font-size:19px}.amp4 em{display:none}
  .fl-wide{display:none}.fl-tall{display:block}.fl-lanes{display:none}.fl-info-m{display:flex}
  .fl-st{width:96px;height:96px}.fl-st.goal{width:112px;height:112px}.fl-map{--fl-r:48px}.dash .fl-auto{height:20px;padding:0 7px;font-size:11px}.fl-v{font-size:17px}.fl-l{font-size:12px;letter-spacing:-.01em}.fl-ic{font-size:15px}
  .drw{position:fixed;left:0;right:0;top:auto;bottom:0;width:auto;max-width:none;z-index:40;max-height:78vh;border-radius:16px 16px 0 0;padding-bottom:calc(16px + env(safe-area-inset-bottom))}
  .frm label{grid-template-columns:64px 80px 1fr}
}

/* ------------------------------------------------------------------ Agenten (Inhaber 03.10.2026) */
.ags{display:flex;gap:12px;margin:0 0 16px;overflow-x:auto;scrollbar-width:none;padding:4px 2px}
.ag{flex:1 0 150px;display:grid;grid-template-columns:54px 1fr;grid-template-areas:"o t" "o s";align-items:center;gap:0 10px;padding:10px 12px;border:1px solid var(--line);border-radius:12px;
  background:linear-gradient(180deg,rgba(9,24,48,.7),rgba(4,12,26,.5));text-decoration:none;color:var(--text)!important;transition:border-color .2s,transform .2s}
.ag:hover{border-color:var(--cy);transform:translateY(-1px)}.ag.on{border-color:var(--gold);box-shadow:0 0 20px -6px rgba(226,198,143,.6)}
.ag-orb{grid-area:o;position:relative;width:50px;height:50px;border-radius:50%;display:grid;place-items:center;background:radial-gradient(circle at 50% 35%,#1d4a7a,#06101f 70%);border:1px solid rgba(95,212,255,.35)}
.ag-orb b{font-size:15px;font-weight:800;color:#fff;letter-spacing:.02em}
.ag-ring{position:absolute;inset:-5px;border-radius:50%;border:2px solid transparent}
.ag-arc{position:absolute;inset:-5px;border-radius:50%;background:conic-gradient(var(--ac,#5fd4ff) calc(var(--p) * 1%),transparent 0);-webkit-mask:radial-gradient(circle,transparent 27px,#000 28px);mask:radial-gradient(circle,transparent 27px,#000 28px);opacity:.9}
.ag-t{grid-area:t;font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ag-s{grid-area:s;font-size:12.5px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.ag.st-laeuft{--ac:#5fd4ff;border-color:rgba(95,212,255,.5)}.ag.st-laeuft .ag-ring{border-top-color:#5fd4ff;border-right-color:rgba(95,212,255,.35)}
.ag.st-offen{--ac:#ffb547}.ag.st-offen .ag-s{color:#ffb547}
.ag.st-fertig{--ac:#3ddc97}.ag.st-fertig .ag-s{color:#3ddc97}
.ag.st-fehler{--ac:#ff5e73}.ag.st-fehler .ag-s{color:#ff5e73}
.ag-new{flex:0 0 150px;border-style:dashed;border-color:rgba(226,198,143,.5)}.ag-new .ag-orb{border-color:rgba(226,198,143,.6);background:radial-gradient(circle,#2a2416,#06101f 70%)}.ag-new .ag-orb b{font-size:24px;color:var(--gold2)}
.ag-ka{flex:0 0 190px;border-color:rgba(226,198,143,.35)}.ag-ka .ag-orb{border-color:rgba(226,198,143,.6);background:radial-gradient(circle,#2a2416,#06101f 70%)}.ag-ka .ag-orb b{color:var(--gold2)}
.agf{display:grid;gap:12px}.agf fieldset{border:0;margin:0;padding:0;display:grid;gap:6px}.agf legend{font-size:13px;font-weight:700;color:var(--cy2);margin-bottom:4px}
.chips3{display:flex;flex-wrap:wrap;gap:6px}.chips3 label{cursor:pointer}.chips3 input{position:absolute;opacity:0;pointer-events:none}
.chips3 span{display:inline-block;padding:6px 12px;border:1px solid var(--line);border-radius:999px;font-size:13.5px;font-weight:600;color:#a9c3e3;background:rgba(2,8,18,.5)}
.chips3 input:checked+span{border-color:var(--cy);color:#fff;background:rgba(95,212,255,.18);box-shadow:0 0 12px -2px rgba(95,212,255,.6)}
.chips3 input:focus-visible+span{outline:2px solid var(--gold)}
.agf>input{padding:9px 11px;border-radius:8px}.agf .go{justify-self:start;padding:10px 20px;border-radius:8px;font-weight:700;color:#02060f;background:linear-gradient(180deg,#f2dcae,#e2c68f);border:0;cursor:pointer}
.agc{border:1px solid var(--line);border-radius:10px;padding:12px;background:rgba(2,8,18,.5);display:grid;gap:8px}
.agc-h{display:flex;justify-content:space-between;gap:8px}.agc-h b{color:#fff}.agc-h em{font-style:normal;font-weight:700;font-size:13px;color:var(--soft)}
.agc.st-laeuft .agc-h em{color:#5fd4ff}.agc.st-fertig .agc-h em{color:#3ddc97}.agc.st-fehler .agc-h em{color:#ff5e73}.agc.st-offen .agc-h em{color:#ffb547}
.agc-b,.agc-step,.agc-r{margin:0;font-size:13.5px;color:#cfe3f7}.agc-step{color:var(--cy2)}.agc-r{color:#fff}
.agc-bar{height:8px;border-radius:4px;background:rgba(95,212,255,.1);overflow:hidden}.agc-bar i{display:block;height:100%;background:linear-gradient(90deg,#5fd4ff,#3ddc97);box-shadow:0 0 10px rgba(95,212,255,.6)}
.agc-t{font-size:12px;color:var(--soft)}.ghost2{padding:6px 12px;border-radius:8px;cursor:pointer;font-size:13px}
@media (prefers-reduced-motion:no-preference){.ag.st-laeuft .ag-ring{animation:jv-spin 2.4s linear infinite}.ag.st-offen .ag-orb{animation:jv-blink 2s ease-in-out infinite}}
@media (max-width:720px){.ag,.ag-drop{flex:0 0 150px}.ag-drop>.ag{flex:1}}
/* Linien-Icons (app/icons.tsx): Textgröße, auf der Grundlinie */
.ico{display:inline-block;vertical-align:-0.18em;flex:none}
/* Icon-Knöpfe und -Marken mittig (statt Glyphen) */
.ln-ctl button,.ag-orb b,.drw-ic,.jt-grip,.chk i,.tk i{display:inline-grid;place-items:center}
.ln-ctl button{display:grid}

/* ------------------------------------------------------------------ Formulare dashboard-weit (Inhaber 04.10.2026:
   Auswahlpfeile, Kästchen und Eingaben hochwertig, klare Fokus-Zustände) */
.dash input:not([type=checkbox]):not([type=radio]):not([type=range]):not([type=hidden]),.dash select,.dash textarea{border-width:1px;border-style:solid;border-radius:8px;transition:border-color .15s,box-shadow .15s,background-color .15s}
.dash input:not([type=checkbox]):not([type=radio]):not([type=range]):not(:disabled):hover,.dash select:not(:disabled):hover,.dash textarea:not(:disabled):hover{border-color:rgba(95,212,255,.55)}
.dash input:focus,.dash select:focus,.dash textarea:focus{box-shadow:0 0 0 3px rgba(95,212,255,.22)}
.dash input::placeholder,.dash textarea::placeholder{color:#6f8db3;opacity:1}
.dash select:not([multiple]):not([size]){-webkit-appearance:none;-moz-appearance:none;appearance:none;padding-right:36px;cursor:pointer;text-overflow:ellipsis;
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%23a8ecff' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E");
  background-repeat:no-repeat;background-position:right 10px center;background-size:16px 16px}
.dash select:not([multiple]):not([size]):hover{background-color:rgba(8,22,44,.92)}
.dash select:disabled,.dash input:disabled,.dash textarea:disabled{opacity:.5;cursor:not-allowed}
.dash select option{background:#07101f;color:#d9ecff}
.dash input[type=checkbox],.dash input[type=radio]{-webkit-appearance:none;appearance:none;flex:none;width:18px;height:18px;margin:0 6px 0 0;padding:0;vertical-align:-4px;cursor:pointer;
  border:1.5px solid rgba(95,212,255,.5);background:rgba(4,14,30,.85) center/12px 12px no-repeat;transition:background-color .15s,border-color .15s,box-shadow .15s}
.dash input[type=checkbox]{border-radius:5px}.dash input[type=radio]{border-radius:50%}
.dash input[type=checkbox]:hover,.dash input[type=radio]:hover{border-color:var(--cy)}
.dash input[type=checkbox]:checked{background-color:var(--cy);border-color:var(--cy);
  background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%2302060f' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='M20 6 9 17l-5-5'/%3E%3C/svg%3E")}
.dash input[type=radio]:checked{border-color:var(--cy);background-color:var(--cy);box-shadow:inset 0 0 0 4px #04101f}
.dash input[type=checkbox]:focus-visible,.dash input[type=radio]:focus-visible{outline:none;box-shadow:0 0 0 3px rgba(95,212,255,.35)}
.dash input[type=range]{accent-color:var(--cy)}
.dash button,.dash a{-webkit-tap-highlight-color:transparent}
.dash button:focus-visible,.dash a:focus-visible,.dash summary:focus-visible{outline:2px solid var(--cy);outline-offset:2px}
.dash button:active:not(:disabled){transform:translateY(1px)}

/* ------------------------------------------------------------------ JARVIS v3 (Inhaber 04.10.2026: „optimiere nochmal
   das design bei jarvis“): klare Reihen im 8er-Raster, Karten bündig und je Reihe gleich hoch */
.jv3{display:grid;gap:16px;min-width:0}
.jv3>*{min-width:0}
.jv3 .amps4,.jv3 .jrec,.jv3 .ags,.jv3 .tick,.jv3 .jchat{margin:0}
.jv-top{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:16px;padding:16px 24px;border:1px solid rgba(95,212,255,.22);border-radius:16px;
  background:radial-gradient(420px 160px at 0 0,rgba(95,212,255,.16),transparent 70%),linear-gradient(180deg,rgba(12,30,58,.8),rgba(4,12,26,.6))}
.jv-top .jv-logo{width:48px;height:48px}
.jv-hi{min-width:0;display:grid;gap:4px}
.jv-hi h1{margin:0;font:700 12px/1 var(--sans);letter-spacing:.24em;color:var(--gold)}
.jv3 .voice{margin:0;font:600 20px/1.35 var(--sans);letter-spacing:0;color:#fff;min-height:1.35em}
.jv3 .voice:before{content:none}
.jv-top .clock{font:500 14px var(--sans);font-variant-numeric:tabular-nums;letter-spacing:0;padding:8px 12px;border-radius:8px;white-space:nowrap}

.jv3 .amps4{grid-template-columns:repeat(4,minmax(0,1fr));gap:16px}
.dash .jv3 .amp4{display:flex;align-items:center;gap:16px;min-height:96px;padding:16px;border-radius:12px;border:1px solid var(--line);color:var(--text)!important;
  background:linear-gradient(180deg,rgba(12,30,58,.78),rgba(4,12,26,.6))}
.dash .jv3 .amp4:hover{border-color:color-mix(in srgb,var(--ac) 70%,transparent);transform:translateY(-1px);box-shadow:0 8px 24px -12px color-mix(in srgb,var(--ac) 60%,transparent)}
.jv3 .amp4-ic{flex:none;width:48px;height:48px;border-radius:12px;display:grid;place-items:center;color:var(--ac);background:color-mix(in srgb,var(--ac) 14%,transparent);border:1px solid color-mix(in srgb,var(--ac) 40%,transparent)}
.jv3 .amp4-tx{display:grid;gap:2px;min-width:0}
.jv3 .amp4 .amp4-l{font-size:13px;font-weight:600;color:var(--soft)}
.jv3 .amp4 b{font-size:26px;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jv3 .amp4 em{font-size:13px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.jv3 .jrec{padding:16px;border:1px solid var(--line);border-radius:16px;background:rgba(4,12,26,.55)}
.jv3 .jrec h2{margin:0 0 12px;font:700 14px var(--sans);letter-spacing:0;gap:8px}
.jv3 .jrec-l{grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}
.jv3 .jrec-i{border-radius:12px;min-height:72px}
.jv3 .jrec-t{padding:12px 16px;align-content:center}
.jv3 .jrec-give{min-width:64px;gap:4px;font-size:12px;font-weight:600;border-radius:0 12px 12px 0;transition:background-color .15s,color .15s}
.jv3 .jrec-give:hover{background:rgba(226,198,143,.1)}
.jv3 .jrec-t:hover b{text-decoration:underline;text-underline-offset:3px}
.jv3 .jtips2{margin:12px 0 0;gap:8px}
.jv3 .jrec-l+.jtips2{padding-top:12px;border-top:1px solid var(--line)}
.jv3 .jt{min-height:36px;padding:6px 14px;font-weight:600}

.jv3 .ags{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:16px;overflow:visible;padding:0}
.jv3 .ag-drop,.jv3 .ag-new{flex:none;min-width:0}
.jv3 .ag{min-height:80px;padding:12px 16px;border-radius:12px;gap:0 12px}
.jv3 .ag-new{border-width:1px}

.jv3 .jv-stage{min-height:0;gap:16px}
.jv3.has-drw .jv-stage{min-height:600px}
.jv3 .fl{border-radius:16px}
.jv3 .drw{border-radius:16px;padding:16px}
.jv3 .drw header{margin-bottom:12px}
.jv3 .drw-tabs{gap:8px;margin-bottom:16px}
.jv3 .drw-tabs a{min-height:40px;transition:border-color .15s,background-color .15s}
.jv3 .drw-tabs a:not(.on):hover{border-color:rgba(95,212,255,.5);color:#fff!important}
.jv3 .drw-body{gap:16px}
.jv3 .drw-x:hover{border-color:var(--cy)}

.jv-duo{display:grid;grid-template-columns:minmax(0,1fr) minmax(0,1fr);gap:16px;align-items:stretch}
.jcard{display:flex;flex-direction:column;gap:12px;min-width:0;padding:16px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,rgba(10,26,50,.72),rgba(4,12,26,.55))}
.jcard-h{display:flex;align-items:center;gap:8px;min-height:32px}
.jcard-h h2{flex:1;display:flex;align-items:center;gap:8px;margin:0;font:700 16px var(--sans);letter-spacing:0;color:#fff}
.jcard-h h2 .ico{color:var(--gold)}
.jcard-h em{font-style:normal;font-size:13px;color:var(--soft);white-space:nowrap}
.jcard-more{margin-top:auto;align-self:flex-start;display:inline-flex;align-items:center;gap:6px;font-size:14px;font-weight:600;color:var(--gold2)!important;text-decoration:none}
.jcard-more:hover{text-decoration:underline;text-underline-offset:3px}
.jv3 .jchat{border-radius:16px}
.jv3 .jchat-log{padding:0;max-height:240px;gap:8px}
.jv3 .jchat-log p{border-radius:12px}
.jchat-empty{margin:0;font-size:14px;color:var(--soft)}
.jv3 .jchat-f{padding:0;margin-top:auto;gap:8px}
.jv3 .jchat-f textarea{min-height:48px;padding:12px;border-radius:12px;resize:none}
.jv3 .jchat-f .go{min-height:48px;padding:0 16px;border-radius:12px}
.jv3 .jchat>.lock{padding:0;align-items:center;font-size:12.5px}

.jfg-on{display:inline-flex;align-items:center;gap:4px;padding:4px 10px;border-radius:999px;font-size:12.5px;font-weight:600;color:var(--green);border:1px solid rgba(61,220,151,.4);background:rgba(61,220,151,.08);white-space:nowrap}
.jfg-what{margin:0;font-size:13.5px;line-height:1.45;color:#b6cbe6}
.jfg-body{display:grid;gap:12px}
.jfg-rings{display:flex;align-items:center;gap:16px}
.jfg-main{flex:none;display:block;text-decoration:none;border-radius:50%}
.jfg-cs{flex:1;min-width:0;display:flex;flex-wrap:wrap;justify-content:space-around;gap:8px}
.jfg-cs a{text-decoration:none;border-radius:12px;padding:4px}
.jfg-cs a:hover,.jfg-main:hover{background:rgba(95,212,255,.06)}
.dash .jring.jring{position:relative;display:inline-grid;justify-items:center;gap:4px;width:var(--s);background:none;color:inherit;--rc:#5d7ca3}
.jring svg{display:block;width:var(--s);height:var(--s)}
.dash .jv3 section{margin-top:0}
.jv3 .ag-t{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.3}
.jring>b{position:absolute;left:0;top:0;width:var(--s);height:var(--s);display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;line-height:1}
.jring>b small{font-size:.62em;font-weight:600;color:var(--soft);margin-left:1px}
.jring.big>b{font-size:26px}
.jr-track{fill:none;stroke:rgba(95,212,255,.1);stroke-width:8}
.jr-val{fill:none;stroke:var(--rc);stroke-width:8;stroke-linecap:round;filter:drop-shadow(0 0 4px color-mix(in srgb,var(--rc) 60%,transparent))}
.jring.big .jr-track,.jring.big .jr-val{stroke-width:7}
.jr-l{font-size:12.5px;font-weight:600;color:var(--cy2)}
.jring.big .jr-l{color:var(--soft)}
.dash .jring.t-green{--rc:#3ddc97}.dash .jring.t-gold{--rc:#ffb547}.dash .jring.t-red{--rc:#ff5e73}.dash .jring.t-grey{--rc:#5d7ca3}
.jfg-nums{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.jfg-nums a{display:grid;gap:2px;padding:8px 12px;border:1px solid var(--line);border-radius:12px;background:rgba(2,8,18,.45);text-decoration:none;transition:border-color .15s}
.jfg-nums a:hover{border-color:var(--cy)}
.jfg-nums b{font-size:20px;color:#fff;font-variant-numeric:tabular-nums}
.jfg-nums span{font-size:12.5px;color:var(--soft)}
.jfg-nums a.ok b{color:var(--green)}.jfg-nums a.bad b{color:#ff8a9a}
.jfg-steps{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.jfg-steps li{display:grid;grid-template-columns:28px minmax(0,1fr);grid-template-areas:"i b" "i s";gap:0 12px;align-items:center}
.jfg-steps i{grid-area:i;width:28px;height:28px;border-radius:50%;display:grid;place-items:center;font:700 13px var(--sans);font-style:normal;color:var(--green);border:1.5px solid rgba(61,220,151,.5);background:rgba(61,220,151,.08)}
.jfg-steps b{grid-area:b;font-size:14px;color:#fff}.jfg-steps span{grid-area:s;font-size:12.5px;color:var(--soft)}
.jfg-why{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.jfg-why li{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:12px;align-items:center;padding:8px 12px;border:1px solid var(--line);border-radius:8px;background:rgba(2,8,18,.45);overflow:hidden}
.jfg-why li>i{position:absolute;left:0;bottom:0;height:3px;background:#ff5e73;opacity:.75}
.jw-st{font-size:12px;font-weight:700;color:#ffb547;white-space:nowrap}
.jw-rs{font-size:13.5px;color:#e6f6ff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jfg-why b{font-size:14px;color:#fff;font-variant-numeric:tabular-nums}

.jv3 .tick{margin:0;height:48px;border-radius:12px}
.jv3 .tick-l{gap:8px;padding:0 16px;font-size:13px;font-weight:700;letter-spacing:0;color:#3ddc97;background:rgba(61,220,151,.1);border-right:1px solid rgba(61,220,151,.3)}
.tick-l i{width:8px;height:8px;border-radius:50%;background:#3ddc97;box-shadow:0 0 8px #3ddc97}
@media (prefers-reduced-motion:no-preference){.tick-l i{animation:jv-blink 1.6s ease-in-out infinite}.dash .jv3 .amp4{transition:border-color .2s,transform .2s,box-shadow .2s}}

@media (max-width:1100px){
  .jv3 .ags{grid-template-columns:repeat(3,minmax(0,1fr))}
  .jv3 .amp4 b{font-size:22px}.dash .jv3 .amp4{gap:12px}.jv3 .amp4-ic{width:40px;height:40px}
}
@media (max-width:860px){.jv-duo{grid-template-columns:1fr}}
@media (max-width:720px){
  .jv3{gap:12px}
  .jv-top{grid-template-columns:auto minmax(0,1fr);gap:8px 12px;padding:12px 16px}
  .jv-top .jv-logo{width:40px;height:40px}
  .jv3 .voice{font-size:16px}
  .jv-top .clock{grid-column:1/-1;justify-self:start;font-size:13px;padding:4px 8px}
  .jv3 .amps4{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .dash .jv3 .amp4{flex-direction:column;align-items:flex-start;gap:8px;min-height:0;padding:12px}
  .jv3 .amp4-ic{width:32px;height:32px;border-radius:8px}.jv3 .amp4-ic svg{width:18px;height:18px}
  .jv3 .amp4 b{font-size:20px}.jv3 .amp4 em{display:block;font-size:12px;white-space:normal}
  .jv3 .jrec{padding:12px}.jv3 .jrec-l{grid-template-columns:1fr;gap:8px}
  .jv3 .ags{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.jv3 .ag-new{grid-column:1/-1}
  .jv3 .ag{padding:8px 12px;min-height:72px;grid-template-columns:44px minmax(0,1fr);gap:0 8px}
  .jv3 .ag-orb{width:40px;height:40px}.jv3 .ag-arc{-webkit-mask:radial-gradient(circle,transparent 22px,#000 23px);mask:radial-gradient(circle,transparent 22px,#000 23px)}
  .jv3 .ag-t{font-size:13px}.jv3 .ag-s{font-size:12px}
  .jcard{padding:12px}
  .jfg-rings{flex-direction:column;align-items:stretch}.jfg-main{align-self:center}
  .jv3 .jchat-f{flex-direction:row;align-items:stretch}
  .jv3 .jchat-f .go{padding:0 12px}.jv3 .jchat-f textarea{min-height:72px}
}

/* ---- Einklappbare Abschnitte (Inhaber 04.10.2026: „solchen langen sektionen immer zum ein und ausklappen“,
   docs/DESIGN.md). Gemeinsame Klasse .fold für <Fold> (fold.tsx) – Kopfzeile mit Titel, Kurzzusammenfassung, Chevron. */
.fold>summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:8px;position:relative;padding-right:32px;min-height:36px;margin:0;-webkit-tap-highlight-color:transparent}
.fold>summary::-webkit-details-marker{display:none}
.fold>summary::after{content:"";position:absolute;right:8px;top:50%;width:9px;height:9px;border-right:2px solid var(--cy2);border-bottom:2px solid var(--cy2);transform:translateY(-70%) rotate(45deg);transition:transform .2s}
.fold[open]>summary::after{transform:translateY(-30%) rotate(-135deg)}
.fold>summary:hover::after{border-color:#fff}
.fold>summary:focus-visible{outline:2px solid var(--cy2);outline-offset:4px;border-radius:6px}
.fold-t{flex:0 1 auto;min-width:0;display:flex;align-items:center;gap:8px}
.fold-t>h2{margin:0;font-size:inherit}
.fold-s{flex:0 1 auto;min-width:0;max-width:100%;margin-left:auto;display:inline-flex;align-items:baseline;gap:6px;font-size:12.5px;font-weight:600;letter-spacing:0;text-transform:none;color:var(--soft);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fold-s>*{min-width:0;overflow:hidden;text-overflow:ellipsis}
.fold>summary.h2s{margin:6px 0 0}
.fold[open]>.fold-b{margin-top:12px}
.fold-note{margin:0 0 12px;font-size:13px;color:var(--soft)}
.fold.card>.fold-b,.fold.sp-card>.fold-b{margin-top:0}
.fold.card[open]>summary,.fold.sp-card[open]>summary{margin-bottom:12px}
.fold:not([open]).card,.fold:not([open]).sp-card{padding-bottom:12px}
@media (max-width:720px){.fold-s{font-size:12px}.fold>summary{padding-right:28px}}

/* ---- JARVIS: Empfehlungen ausblenden (X) und „ausgeblendet · rückgängig“ (Inhaber 04.10.2026) */
.tip-x{position:absolute;top:6px;right:6px;z-index:2;display:grid;place-items:center;width:22px;height:22px;padding:0;margin:0;border:0;border-radius:50%;background:transparent;color:var(--soft);opacity:.55;cursor:pointer;transition:opacity .15s,color .15s,background-color .15s}
.tip-x::before{content:"";position:absolute;inset:-9px}
.tip-x svg{width:12px;height:12px}
.tip-x:hover,.tip-x:focus-visible{opacity:1;color:#ff5e73;background:none}
.tip-x:disabled{opacity:.3;cursor:default}
.jrec-i{position:relative}
.jv3 .jrec-give{border-radius:0 12px 12px 0}
.jt-wrap .tip-x{top:-9px;right:-6px;width:16px;height:16px;opacity:.7;background:none;border:0}
.jt-wrap .tip-x svg{width:10px;height:10px}
.jt-wrap .tip-x:hover,.jt-wrap .tip-x:focus-visible{background:none;color:#ff5e73}
.dash button.tip-x,.dash button.tip-x:hover,.dash button.tip-x:focus-visible{background:none!important;border:0!important;box-shadow:none!important;padding:0;min-height:0}
/* Schließen-X überall gleich (Inhaber 04.10.2026: „das x ist wieder nicht mittig … prüfe das überall“): nur das Zeichen, ohne Rahmen, exakt mittig.
   !important, weil .dash button (padding 7px 14px) und Seiten-CSS sonst das Zeichen aus der Mitte schieben. */
.dash .x-btn,.dash .x-btn:hover,.dash .x-btn:focus-visible{display:inline-grid!important;place-items:center;flex:none;width:32px!important;height:32px!important;min-width:0;min-height:0;padding:0!important;border:0!important;border-radius:50%;background:none!important;box-shadow:none!important;line-height:0;font-size:0;text-decoration:none;cursor:pointer}
.dash .x-btn{color:var(--soft)!important;opacity:.8}
.dash .x-btn:hover,.dash .x-btn:focus-visible{color:#ff5e73!important;opacity:1}
.dash .x-btn>svg{display:block;margin:0}
.dash .x-btn:active:not(:disabled){transform:none}
.tip-gone{display:none!important}
.tip-undo{position:fixed;left:50%;bottom:calc(24px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:70;display:flex;align-items:center;gap:12px;max-width:calc(100vw - 32px);padding:6px 6px 6px 16px;border:1px solid rgba(226,198,143,.5);border-radius:12px;background:#07101f;box-shadow:0 16px 40px -12px rgba(0,0,0,.9),0 0 24px -10px rgba(226,198,143,.4);font-size:13.5px;color:var(--text)}
.tip-undo>span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.tip-undo b{color:#fff;font-weight:600}
.tip-undo button{flex:none;display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border-radius:8px;border:1px solid rgba(226,198,143,.55);background:rgba(226,198,143,.1);color:var(--gold2);font:600 13px var(--sans);cursor:pointer}
.tip-undo button:hover{background:rgba(226,198,143,.2);color:#fff}
.jt-pick{display:grid;grid-template-columns:repeat(4,44px);gap:6px}
.jt-pick em{grid-column:1/-1;margin:0}

/* ---- Agenten A1–A8 (Inhaber 04.10.2026: „nicht nur 4 … sondern 8“): Desktop 4×2 + Spalte „Auftrag“/„Kunden-Agenten“,
   bis 1100 px 4 Spalten, mobil 2 Spalten – immer bündig. Freie Agenten kompakt. */
.jv3 .ags{grid-template-columns:repeat(4,minmax(0,1fr)) minmax(0,1.05fr);gap:12px}
.jv3 .ags>.ag-new{grid-column:5;grid-row:1}
.jv3 .ags>.ag-ka{grid-column:5;grid-row:2;flex:none;min-width:0}
.jv3 .ag.st-idle{min-height:64px;opacity:.78;border-style:dashed}
.jv3 .ag.st-idle:hover,.jv3 .ag.st-idle.on{opacity:1}
.jv3 .ag.st-idle .ag-orb{width:36px;height:36px;justify-self:center}
.jv3 .ag.st-idle .ag-orb b{font-size:13px}
.jv3 .ag.st-idle .ag-arc{display:none}
.jv3 .ag.st-idle .ag-t{font-weight:600;color:var(--soft)}
@media (max-width:1100px){
  .jv3 .ags{grid-template-columns:repeat(4,minmax(0,1fr))}
  .jv3 .ags>.ag-new{grid-column:1/span 2;grid-row:auto}
  .jv3 .ags>.ag-ka{grid-column:3/span 2;grid-row:auto}
}
@media (max-width:720px){
  .jv3 .ags{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .jv3 .ags>.ag-new{grid-column:1;grid-row:auto}
  .jv3 .ags>.ag-ka{grid-column:2;grid-row:auto}
  .jv3 .ag.st-idle{min-height:56px}
  .jv3 .ag.st-idle .ag-orb{width:32px;height:32px}
  .tip-undo{bottom:calc(84px + env(safe-area-inset-bottom))}
  .jt-wrap{flex-wrap:wrap}
  .jt-pick{position:static;flex-basis:100%;grid-template-columns:repeat(4,minmax(0,1fr));box-shadow:none}
}
/* Sprungziele (app/dashboard/use-anker.ts): Abstand unter der festen Kopfzeile, kurzes Aufleuchten nach dem Sprung */
.dash [id],.dash .fold{scroll-margin-top:118px}
@keyframes anker-flash{0%{box-shadow:0 0 0 2px rgba(226,198,143,.95),0 0 34px rgba(226,198,143,.55)}100%{box-shadow:0 0 0 1px rgba(226,198,143,0),0 0 0 rgba(226,198,143,0)}}
@media (prefers-reduced-motion:no-preference){.dash .anker-flash{animation:anker-flash 1.6s ease-out}}
@media (prefers-reduced-motion:reduce){.dash .anker-flash{outline:2px solid var(--gold);outline-offset:2px}}
`;

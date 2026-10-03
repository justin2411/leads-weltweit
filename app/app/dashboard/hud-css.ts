/**
 * JARVIS-Design für das ganze Inhaber-Dashboard (Inhaber 03.10.2026: „futuristisch … wie bei tony stark … mach es so
 * wie bei jarvis“). Legt sich über DASH_CSS/DASH_V2_CSS/LIVE_CSS: dunkles HUD (Nachtblau, Cyan-Leuchten, Gold der Marke),
 * feines Raster, Eckwinkel, technische Schrift für Zahlen. Bewegung nur ohne prefers-reduced-motion.
 */
export const HUD_CSS = `
.dash{--ink:#020812;--ink2:#0a1a33;--paper:#02060f;--card:rgba(9,24,48,.62);--text:#d9ecff;--soft:#8ba6c9;--line:rgba(95,212,255,.16);
  --gold:#e2c68f;--gold2:#f2dcae;--red:#ff5e73;--red-bg:rgba(255,94,115,.12);--amber:#ffb547;--amber-bg:rgba(255,181,71,.12);
  --green:#3ddc97;--green-bg:rgba(61,220,151,.12);--blue:#5fd4ff;--blue-bg:rgba(95,212,255,.1);
  --cy:#5fd4ff;--cy2:#a8ecff;--glow:0 0 18px rgba(95,212,255,.35);--hud:var(--hudf),var(--sans),system-ui,sans-serif;--mono:var(--monof),ui-monospace,monospace;
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
.dash .foot,.dash .bnav{background:rgba(2,8,18,.92);border-color:rgba(95,212,255,.18)}
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
.hex{font-family:var(--mono);font-size:11px;font-weight:600;color:#02060f;background:var(--c);padding:5px 7px;clip-path:polygon(8% 0,92% 0,100% 50%,92% 100%,8% 100%,0 50%);box-shadow:0 0 12px var(--c);white-space:nowrap}
.ln-led{width:8px;height:8px;border-radius:50%;background:rgba(139,166,201,.4)}.lane.live .ln-led{background:var(--c);box-shadow:0 0 10px var(--c)}
.ln-main{display:grid;gap:3px;min-width:0}
.ln-main b{font-family:var(--hud);font-size:16px;letter-spacing:.03em;color:#fff;display:flex;gap:10px;align-items:baseline;flex-wrap:wrap}
.ln-main b small{font-family:var(--mono);font-size:11px;font-weight:400;color:var(--soft);letter-spacing:0}
.ln-what{font-size:12.5px;color:#9db6d6}
.ln-read{display:flex;gap:6px 16px;flex-wrap:wrap;margin-top:2px;font-family:var(--mono);font-size:13px;color:#e6f6ff}
.ln-read em{font-style:normal;font-size:10.5px;color:#6e8db3;margin-right:5px;text-transform:uppercase;letter-spacing:.06em}
.ln-read small{font-size:11px;color:var(--soft);margin-left:3px}
.ln-read .st{white-space:nowrap;font-family:var(--hud);font-size:12px;letter-spacing:.1em;text-transform:uppercase;color:#8ba6c9;border:1px solid var(--line);padding:0 6px}
.ln-read .st.warn{color:#ffb547;border-color:rgba(255,181,71,.45)}.ln-read .st.run{color:var(--c);border-color:var(--c)}
.ln-ctl{display:grid;grid-template-columns:34px 52px 34px;grid-template-areas:"m o p" "r r r" "x x x";gap:6px 6px;justify-content:end;align-items:center}
.ln-ctl button{grid-area:auto;height:34px;padding:0;font-size:20px;line-height:1;color:var(--c);border-color:color-mix(in srgb,var(--c) 50%,transparent)}
.ln-ctl button:first-child{grid-area:m}.ln-ctl button:nth-of-type(2){grid-area:p}
.ln-ctl output{grid-area:o;text-align:center;font-size:24px;color:#fff;text-shadow:0 0 12px var(--c)}
.ln-ctl input[type=range]{grid-area:r;width:100%;accent-color:var(--c);background:transparent;border:0;box-shadow:none;padding:0}
.ln-max{grid-area:x;font-family:var(--mono);font-size:10.5px;color:#6e8db3;text-align:right}
.pult-go{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin-top:14px}
.pult-go .go{font-family:var(--hud);font-size:15px;letter-spacing:.14em;text-transform:uppercase;padding:10px 22px;color:#02060f;background:linear-gradient(180deg,#a8ecff,#5fd4ff);border:0;box-shadow:0 0 22px rgba(95,212,255,.55);cursor:pointer}
.pult-go .go:disabled{background:rgba(95,212,255,.12);color:#6e8db3;box-shadow:none;cursor:default}
.pult-go .ghost{font-family:var(--hud);letter-spacing:.1em;text-transform:uppercase;font-size:13px;padding:9px 14px;cursor:pointer}
.pult-go .hint{font-size:12px;color:var(--soft)}

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
  .dash .bnav{grid-template-columns:repeat(8,1fr)}.dash .bnav a{font-size:9px}
}
`;

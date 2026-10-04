/**
 * Gehirn-Seite (Inhaber 04.10.2026). Eigene Klassen mit Präfix gh- (nur auf /dashboard/gehirn geladen), passend zu
 * HUD_CSS: dunkles HUD, Cyan/Gold, ruhige Puls-/Synapsen-Animation. Bewegung nur ohne prefers-reduced-motion.
 * Ursache des alten Fehlers: „.dash .stack“ (Säulen-Grafik, 24 px breit) traf die Listenkarten „kcard stack“.
 */
export const GH_CSS = `
.dash .gh{--gc:var(--cy);gap:14px}
.dash .gh .t-gold{color:var(--gold2)}.dash .gh .t-grey{color:#a9c3e3}.dash .gh .t-next{color:#cfe6ff}
.dash .gh .small{font-size:12px}

/* ---------------------------------------------------------------- Klapp-Abschnitte */
.dash .gh-fold{position:relative;background:linear-gradient(180deg,rgba(9,24,48,.66),rgba(4,12,26,.55));border:1px solid var(--line);
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);min-width:0}
.dash .gh-fold:before,.dash .gh-fold:after{content:"";position:absolute;width:12px;height:12px;border:2px solid var(--cy);opacity:.7;pointer-events:none}
.dash .gh-fold:before{top:-1px;left:-1px;border-right:0;border-bottom:0}.dash .gh-fold:after{bottom:-1px;right:-1px;border-left:0;border-top:0}
.dash .gh-sum{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;padding:12px 44px 12px 16px;position:relative;user-select:none;min-height:48px}
.dash .gh-sum::-webkit-details-marker{display:none}
.dash .gh-sum:focus-visible{outline:2px solid var(--gold);outline-offset:-2px}
.dash .gh-sum-t{display:inline-flex;align-items:center;gap:9px;font-family:var(--hud);font-weight:600;font-size:15px;letter-spacing:.14em;text-transform:uppercase;color:#e6f6ff}
.dash .gh-sum-t>svg{color:var(--cy)}
.dash .gh-sum-s{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;font-size:13px;color:var(--soft)}
.dash .gh-chev{position:absolute;right:16px;top:50%;width:9px;height:9px;margin-top:-7px;border-right:2px solid var(--cy2);border-bottom:2px solid var(--cy2);transform:rotate(45deg);transition:transform .2s}
.dash .gh-fold[open]>.gh-sum>.gh-chev{transform:rotate(-135deg);margin-top:-2px}
.dash .gh-fold[open]>.gh-sum{border-bottom:1px solid var(--line)}
.dash .gh-body{padding:14px 16px 16px;min-width:0}
.dash .gh-sum:hover .gh-sum-t{color:#fff;text-shadow:0 0 12px rgba(95,212,255,.5)}

.dash .gh-h3{margin:0 0 10px;font-family:var(--hud);font-size:12.5px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--cy2);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dash .gh-lock{font-family:var(--sans);letter-spacing:0;text-transform:none;font-size:11px;color:var(--soft);display:inline-flex;align-items:center;gap:4px}
.dash .gh-num{font-family:var(--mono);font-variant-numeric:tabular-nums}

/* ---------------------------------------------------------------- Bühne: Gehirn + Knoten */
.dash .gh-main>.gh-body{padding:18px 16px 20px}
.dash .gh-live{display:inline-flex;align-items:center;gap:8px;font-family:var(--hud);letter-spacing:.12em;text-transform:uppercase;font-size:12px;color:var(--cy2)}
.dash .gh-live i{width:8px;height:8px;border-radius:50%;background:var(--cy);box-shadow:0 0 10px var(--cy)}
.dash .gh-live.m-aus{color:var(--soft)}.dash .gh-live.m-aus i{background:#6c7f99;box-shadow:none}
.dash .gh-live.m-wartet{color:var(--gold2)}.dash .gh-live.m-wartet i{background:var(--gold);box-shadow:0 0 10px var(--gold)}
.dash .gh-stage{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,420px) minmax(0,1fr);grid-template-areas:"l c r";gap:18px 26px;align-items:center}
.dash .gh-center{grid-area:c;display:flex;flex-direction:column;align-items:center;gap:12px;min-width:0}
.dash .gh-col{display:grid;gap:12px;align-content:center;min-width:0}
.dash .gh-col.l{grid-area:l}.dash .gh-col.r{grid-area:r}

.dash .gh-brain{position:relative;width:100%;max-width:420px;aspect-ratio:1}
.dash .gh-brain svg{display:block;width:100%;height:100%}
.dash .gh-halo{fill:none;stroke:rgba(95,212,255,.12)}
.dash .gh-ticks{transform-origin:200px 200px}.dash .gh-ticks line{stroke:rgba(95,212,255,.3);stroke-width:1}.dash .gh-ticks line.maj{stroke:var(--cy);stroke-width:2}
.dash .gh-orbit{transform-origin:200px 200px}.dash .gh-orbit path{fill:none;stroke-linecap:round}
.dash .gh-orbit.a path{stroke:rgba(95,212,255,.55);stroke-width:2}.dash .gh-orbit.b path{stroke:rgba(226,198,143,.6);stroke-width:3}
.dash .gh-hemi{fill:rgba(95,212,255,.06);stroke:#7fdcff;stroke-width:2;stroke-linejoin:round}
.dash .gh-gyr{fill:none;stroke:rgba(168,236,255,.55);stroke-width:1.5;stroke-linecap:round}
.dash .gh-fiss{fill:none;stroke:rgba(168,236,255,.5);stroke-width:1.5}
.dash .gh-stem{fill:rgba(95,212,255,.06);stroke:#7fdcff;stroke-width:1.6}
.dash .gh-sig{fill:none;stroke:var(--gold);stroke-width:1.4;stroke-linecap:round;stroke-dasharray:5 220;stroke-dashoffset:0;opacity:.0}
.dash .gh-syn{fill:#cff4ff;stroke:rgba(95,212,255,.6);stroke-width:3;stroke-opacity:.35;transform-box:fill-box;transform-origin:center}
.dash .gh-core{transform-box:fill-box;transform-origin:center}
.dash .gh-dot{fill:#fff}
.dash .gh-wave{fill:none;stroke:var(--cy);stroke-width:1.5;opacity:0;transform-box:fill-box;transform-origin:center}
.dash .gh-aura{transform-box:fill-box;transform-origin:center}
.dash .gh-brain.m-aus .gh-hemi,.dash .gh-brain.m-aus .gh-stem{stroke:#6c7f99;fill:rgba(139,166,201,.05)}
.dash .gh-brain.m-aus .gh-gyr,.dash .gh-brain.m-aus .gh-fiss{stroke:rgba(139,166,201,.4)}
.dash .gh-brain.m-aus .gh-syn{fill:#8ba6c9;stroke-opacity:.1}
.dash .gh-brain.m-wartet .gh-orbit.b path{stroke:var(--gold2)}
.dash .gh-state{position:absolute;left:50%;bottom:4%;transform:translateX(-50%);font-family:var(--hud);font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--cy2);
  padding:3px 10px;border:1px solid rgba(95,212,255,.35);background:rgba(2,8,18,.75);white-space:nowrap}
.dash .gh-brain.m-wartet .gh-state{color:var(--gold2);border-color:rgba(226,198,143,.5)}
.dash .gh-brain.m-aus .gh-state{color:var(--soft);border-color:var(--line)}
.dash .gh-voice{margin:0;width:100%;text-align:center;font-family:var(--mono);font-size:14px;line-height:1.5;color:#e6f6ff;overflow-wrap:anywhere;
  padding:10px 14px;border:1px solid var(--line);background:rgba(4,14,30,.6)}
.dash .gh-voice span{display:block;font-family:var(--hud);font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:var(--gold);margin-bottom:4px}

/* Knoten */
.dash .gh-node{background:linear-gradient(180deg,rgba(9,24,48,.78),rgba(4,12,26,.62))}
.dash .gh-node>.gh-sum{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-areas:"t t" "v s";gap:4px 10px;padding:10px 38px 10px 12px;align-items:baseline}
.dash .gh-node .gh-sum-t{grid-area:t;font-size:13px;letter-spacing:.12em}
.dash .gh-node .gh-sum-s{display:contents}
.dash .gh-nv{grid-area:v;font-family:var(--mono);font-size:24px;font-weight:600;color:#fff;line-height:1.1;text-shadow:0 0 14px rgba(95,212,255,.45);white-space:nowrap}
.dash .gh-ns{grid-area:s;font-size:12.5px;color:var(--soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-width:0}
.dash .gh-ico{display:inline-grid;place-items:center;width:26px;height:26px;border:1px solid rgba(95,212,255,.4);border-radius:50%;color:var(--cy);background:rgba(95,212,255,.08)}
.dash .gh-node>.gh-body{padding:10px 12px 12px}
.dash .gh-node:hover{border-color:rgba(95,212,255,.45)}
.dash .gh-node.side-l>.gh-sum:after,.dash .gh-node.side-r>.gh-sum:after{content:"";position:absolute;top:24px;width:26px;height:1px;background:linear-gradient(90deg,rgba(95,212,255,.0),rgba(95,212,255,.7))}
.dash .gh-node.side-l>.gh-sum:after{right:-27px}
.dash .gh-node.side-r>.gh-sum:after{left:-27px;transform:scaleX(-1)}

.dash .gh-mini{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.dash .gh-mini li{display:flex;align-items:center;gap:8px;font-size:13px;min-width:0}
.dash .gh-mini time{font-family:var(--mono);font-size:12px;color:var(--cy2);white-space:nowrap}
.dash .gh-mt{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash .gh-mini .pill{font-size:11px;padding:1px 8px}
.dash .gh-led{width:9px;height:9px;border-radius:50%;background:#3b4a60;flex:none}.dash .gh-led.on{background:var(--green);box-shadow:0 0 8px var(--green)}
.dash .gh-more{display:inline-flex;align-items:center;gap:4px;margin-top:10px;font-size:12.5px;text-decoration:none}
.dash .gh-report b{display:block;font-size:13.5px;margin-bottom:4px}
.dash .gh-report p{margin:0 0 6px;font-size:13px;line-height:1.5;white-space:pre-wrap;overflow-wrap:anywhere;max-height:240px;overflow:auto}
.dash .gh-ab{display:grid;gap:6px;margin-bottom:12px}.dash .gh-ab:last-child{margin-bottom:0}
.dash .gh-ab>b{font-size:13px;overflow-wrap:anywhere}
.dash .gh-abv{display:grid;grid-template-columns:18px minmax(0,1fr) 62px;align-items:center;gap:8px;font-size:12.5px}
.dash .gh-abv span{font-family:var(--mono);color:var(--cy2)}.dash .gh-abv em{font-style:normal;font-family:var(--mono);text-align:right}
.dash .gh-abv.lead span,.dash .gh-abv.lead em{color:var(--gold2)}.dash .gh-abv.lead .gh-bar i{background:linear-gradient(90deg,#c9a86a,#f2dcae)}

/* Fortschritt */
.dash .gh-bar{height:6px;background:rgba(95,212,255,.1);border-radius:3px;overflow:hidden}
.dash .gh-bar i{display:block;height:100%;background:linear-gradient(90deg,#2a8fc4,#5fd4ff);box-shadow:0 0 10px rgba(95,212,255,.6);border-radius:3px}
.dash .gh-task{display:grid;gap:5px;padding:8px 0;border-bottom:1px solid var(--line)}.dash .gh-task:first-child{padding-top:0}.dash .gh-task:last-of-type{border-bottom:0}
.dash .gh-task-h{display:flex;align-items:center;gap:8px;min-width:0}
.dash .gh-ag{font-family:var(--mono);font-size:11px;color:#02060f;background:var(--cy);padding:1px 6px;flex:none}
.dash .gh-task-t{flex:1;min-width:0;font-size:13px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash .gh-task-s{font-size:12.5px;color:#bfe9ff;overflow-wrap:anywhere}

/* ---------------------------------------------------------------- Abläufe */
.dash .gh-flow{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px 26px}
.dash .gh-flow .wide{grid-column:1/-1}
.dash .gh-tl{list-style:none;margin:0;padding:0 0 0 14px;display:grid;gap:0;position:relative}
.dash .gh-tl:before{content:"";position:absolute;left:3px;top:6px;bottom:6px;width:1px;background:linear-gradient(180deg,var(--cy),rgba(95,212,255,.1))}
.dash .gh-tl li{position:relative;display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:6px 0;font-size:13px;border-bottom:1px solid rgba(95,212,255,.07)}
.dash .gh-tl li:last-child{border-bottom:0}
.dash .gh-tl li:before{content:"";position:absolute;left:-14px;top:50%;width:7px;height:7px;margin-top:-3.5px;border-radius:50%;background:#02060f;border:1.5px solid var(--cy)}
.dash .gh-tl li.auftrag:before{border-color:var(--gold)}
.dash .gh-tl.next li{grid-template-columns:52px minmax(0,1fr)}
.dash .gh-tl.next li:first-child:before{background:var(--cy);box-shadow:0 0 8px var(--cy)}
.dash .gh-tl time{font-family:var(--mono);font-size:12px;color:var(--cy2);white-space:nowrap}
.dash .gh-tt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash .gh-tt svg{vertical-align:-2px;color:var(--soft)}
.dash .gh-tl .pill{font-size:11px;padding:1px 8px}

/* ---------------------------------------------------------------- Schalter */
.dash .gh-ctrls{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,260px),1fr))}
.dash .gh-card{border:1px solid var(--line);background:rgba(4,14,30,.45);padding:12px 14px;min-width:0}
.dash .gh-sw{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(95,212,255,.07);font-size:13.5px}
.dash .gh-sw:last-child{border-bottom:0}
.dash .gh-sw>span{min-width:0}.dash .gh-sw small{display:block;font-size:11.5px;color:var(--soft)}
.dash .gh-sw .sw{display:flex;gap:4px;flex:none}.dash .gh-sw .sw button{padding:5px 12px;font-size:13px}
.dash .gh-max{display:grid;gap:10px}
.dash .gh-max label{display:flex;align-items:center;gap:10px;flex-wrap:wrap;font-size:13.5px}
.dash .gh-max input{width:90px}
.dash .gh-max button{justify-self:start}
.dash .gh-facts{display:grid;gap:6px;font-size:13px;color:var(--soft)}.dash .gh-facts b{color:var(--text)}.dash .gh-facts b.ok{color:var(--green)}.dash .gh-facts b.bad{color:var(--red)}

/* ---------------------------------------------------------------- Seiten */
.dash .gh-pages{display:grid;gap:14px}
.dash .gh-page{border:1px solid var(--line);background:rgba(4,14,30,.45);min-width:0}
.dash .gh-page>header{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--line);background:rgba(95,212,255,.04)}
.dash .gh-slug{font-family:var(--mono);font-weight:600;font-size:14px;text-decoration:none;overflow-wrap:anywhere}
.dash .gh-pm{font-size:12.5px;color:var(--soft);margin-right:auto}
.dash .gh-page>header form{margin-left:auto}
.dash .gh-var{display:grid;grid-template-columns:minmax(150px,.9fr) minmax(0,1.8fr) 110px auto;align-items:center;gap:8px 16px;padding:9px 12px;border-bottom:1px solid rgba(95,212,255,.07);font-size:13px}
.dash .gh-var:last-child{border-bottom:0}
.dash .gh-var.off{opacity:.55}
.dash .gh-vk{display:flex;align-items:center;gap:8px;min-width:0}.dash .gh-vk a{font-weight:600;white-space:nowrap;text-decoration:none}
.dash .gh-vs{display:flex;flex-wrap:wrap;gap:4px 14px;color:var(--soft);min-width:0}
.dash .gh-vs span{white-space:nowrap}.dash .gh-vs b{font-family:var(--mono);color:var(--text);font-weight:600}
.dash .gh-vq{display:grid;line-height:1.2}.dash .gh-vq b{font-family:var(--mono);color:#fff}.dash .gh-vq small{font-size:11px;color:var(--soft)}
.dash .gh-acts{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}
.dash .gh-acts button,.dash .gh-page>header button{font-size:12.5px;padding:5px 10px;display:inline-flex;align-items:center;gap:5px;white-space:nowrap}

/* ---------------------------------------------------------------- Entscheidungen */
.dash .gh-decs{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(min(100%,460px),1fr))}
.dash .gh-dec{display:grid;gap:8px;align-content:start;padding:10px 12px;border:1px solid var(--line);background:rgba(4,14,30,.45);min-width:0}
.dash .gh-dec.wait{border-color:rgba(226,198,143,.5);box-shadow:inset 3px 0 0 var(--gold)}
.dash .gh-dh{display:grid;gap:6px;min-width:0}
.dash .gh-ds{font-weight:600;font-size:13.5px;line-height:1.4;overflow-wrap:anywhere;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
.dash .gh-dm{display:flex;align-items:center;gap:6px;flex-wrap:wrap;font-size:12px;color:var(--soft)}
.dash .gh-dm .pill{font-size:11px;padding:1px 8px}.dash .gh-dm time{font-family:var(--mono);margin-left:auto}
.dash .gh-why>summary{cursor:pointer;font-size:12px;color:var(--cy2)}
.dash .gh-why p{font-size:13px;margin:6px 0 0;overflow-wrap:anywhere;line-height:1.5}
.dash .gh-dec .gh-acts{justify-content:flex-start}

/* ---------------------------------------------------------------- Umgebung */
.dash .gh-envs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,360px),1fr));gap:0 22px}
.dash .gh-env{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(95,212,255,.07);min-width:0}
.dash .gh-env>span:first-child{min-width:0}
.dash .gh-env code{font-family:var(--monof),monospace;font-size:12px;overflow-wrap:anywhere}
.dash .gh-env small{display:block;font-size:11.5px;color:var(--soft)}

/* ---------------------------------------------------------------- schmal */
@media (max-width:1100px){
  .dash .gh-stage{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"c c" "l r"}
  .dash .gh-col{align-content:start}
  .dash .gh-brain{max-width:380px}
  .dash .gh-node.side-l>.gh-sum:after,.dash .gh-node.side-r>.gh-sum:after{display:none}
}
@media (max-width:820px){
  .dash .gh-var{grid-template-columns:minmax(0,1fr) auto;grid-template-areas:"k q" "s s" "a a"}
  .dash .gh-var>.gh-vk{grid-area:k}.dash .gh-var>.gh-vs{grid-area:s}.dash .gh-var>.gh-vq{grid-area:q;text-align:right}.dash .gh-var>.gh-acts{grid-area:a;justify-content:flex-start}
  .dash .gh-flow{grid-template-columns:minmax(0,1fr)}
}
@media (max-width:640px){
  .dash .gh-stage{grid-template-columns:minmax(0,1fr);grid-template-areas:"c" "l" "r";gap:12px}
  .dash .gh-brain{max-width:320px}
  .dash .gh-sum{padding:11px 40px 11px 12px}
  .dash .gh-body{padding:12px}
  .dash .gh-main>.gh-body{padding:14px 12px 16px}
  .dash .gh-voice{font-size:13px}
  .dash .gh-sum-s{font-size:12px}
  .dash .gh-tl li{grid-template-columns:minmax(0,1fr) auto;row-gap:2px}
  .dash .gh-tl li time{grid-column:1/-1}
  .dash .gh-tl.next li{grid-template-columns:48px minmax(0,1fr)}.dash .gh-tl.next li time{grid-column:auto}
  .dash .gh-page>header form{margin-left:0}
}

/* ---------------------------------------------------------------- Bewegung */
@keyframes gh-spin{to{transform:rotate(360deg)}}
@keyframes gh-spin-r{to{transform:rotate(-360deg)}}
@keyframes gh-syn{0%,100%{transform:scale(1);opacity:.55}50%{transform:scale(1.55);opacity:1}}
@keyframes gh-breath{0%,100%{transform:scale(.92);opacity:.65}50%{transform:scale(1.08);opacity:1}}
@keyframes gh-wave{0%{transform:scale(.6);opacity:.8}100%{transform:scale(4.2);opacity:0}}
@keyframes gh-flow{0%{stroke-dashoffset:0;opacity:0}12%{opacity:1}80%{opacity:1}100%{stroke-dashoffset:-225;opacity:0}}
@keyframes gh-glow{0%,100%{stroke:#7fdcff}50%{stroke:#bff0ff}}
@keyframes gh-blink{0%,100%{opacity:1}50%{opacity:.35}}
@media (prefers-reduced-motion:no-preference){
  .dash .gh-ticks{animation:gh-spin 120s linear infinite}
  .dash .gh-orbit.a{animation:gh-spin 36s linear infinite}
  .dash .gh-orbit.b{animation:gh-spin-r 52s linear infinite}
  .dash .gh-syn{animation:gh-syn 4.8s ease-in-out infinite;animation-delay:calc(var(--i) * -.4s)}
  .dash .gh-core{animation:gh-breath 5s ease-in-out infinite}
  .dash .gh-aura{animation:gh-breath 9s ease-in-out infinite}
  .dash .gh-sig{animation:gh-flow 6s ease-in infinite;animation-delay:calc(var(--i) * -1.1s)}
  .dash .gh-wave{animation:gh-wave 5s ease-out infinite}.dash .gh-wave.w2{animation-delay:-2.5s}
  .dash .gh-brain.hot .gh-orbit.a{animation-duration:14s}
  .dash .gh-brain.hot .gh-orbit.b{animation-duration:22s}
  .dash .gh-brain.hot .gh-syn{animation-duration:2.2s}
  .dash .gh-brain.hot .gh-sig{animation-duration:2.8s}
  .dash .gh-brain.hot .gh-core{animation-duration:2.4s}
  .dash .gh-brain.hot .gh-wave{animation-duration:2.6s}.dash .gh-brain.hot .gh-wave.w2{animation-delay:-1.3s}
  .dash .gh-brain.hot .gh-hemi{animation:gh-glow 3s ease-in-out infinite}
  .dash .gh-brain.m-aus *{animation:none!important}
  .dash .gh-live i{animation:gh-blink 2.4s ease-in-out infinite}.dash .gh-live.m-aus i{animation:none}
  .dash .gh-bar i{transition:width .6s ease}
  .dash .gh-fold[open]>.gh-body{animation:gh-open .22s ease-out}
}
@keyframes gh-open{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.dash .gh-sig,.dash .gh-wave{display:none}}
`;

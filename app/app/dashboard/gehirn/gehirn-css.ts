/**
 * Gehirn-Seite (Inhaber 04.10.2026: „wenig text und gute grafiken bzw animationen“). Eigene Klassen mit Präfix gh-
 * (nur auf /dashboard/gehirn geladen), passend zu HUD_CSS: dunkles HUD, Cyan/Gold. Bewegung nur ohne
 * prefers-reduced-motion – mit „Bewegung reduzieren“ steht alles still (Signale ausgeblendet, Verbindungslinien bleiben).
 * Info-Karten (tips.tsx) liegen als .gh-poplayer direkt in .dash (fixiert), daher ohne .gh davor.
 */
export const GH_CSS = `
.dash .gh{--gc:var(--cy);gap:14px}
.dash .gh .t-gold{color:var(--gold2)}.dash .gh .t-grey{color:#a9c3e3}.dash .gh .t-next{color:#cfe6ff}

/* ---------------------------------------------------------------- Kacheln (Sprung zum Abschnitt) */
.dash .gh-kpi .kv{font-family:var(--mono)}
.dash .gh-kpi.t-gold .kv{color:var(--gold2);text-shadow:0 0 14px rgba(226,198,143,.45)}
.dash .gh-kpi.t-red .kv{color:var(--red)}.dash .gh-kpi.t-grey .kv{color:var(--soft)}

/* ---------------------------------------------------------------- Klapp-Abschnitte */
.dash .gh-fold{position:relative;background:linear-gradient(180deg,rgba(9,24,48,.66),rgba(4,12,26,.55));border:1px solid var(--line);
  -webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);min-width:0}
.dash .gh-fold:before,.dash .gh-fold:after{content:"";position:absolute;width:12px;height:12px;border:2px solid var(--cy);opacity:.7;pointer-events:none}
.dash .gh-fold:before{top:-1px;left:-1px;border-right:0;border-bottom:0}.dash .gh-fold:after{bottom:-1px;right:-1px;border-left:0;border-top:0}
.dash .gh-sum{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px 14px;flex-wrap:wrap;padding:12px 44px 12px 16px;position:relative;user-select:none;min-height:48px}
.dash .gh-sum::-webkit-details-marker{display:none}
.dash .gh-sum:focus-visible{outline:2px solid var(--gold);outline-offset:-2px}
.dash .gh-sum-t{display:inline-flex;align-items:center;gap:9px;font-family:var(--hud);font-weight:600;font-size:var(--fs-m);letter-spacing:.14em;text-transform:uppercase;color:#e6f6ff}
.dash .gh-sum-t>svg{color:var(--cy)}
.dash .gh-sum-s{display:inline-flex;align-items:center;gap:8px;flex-wrap:wrap;min-width:0;font-size:var(--fs-s);color:var(--soft)}
.dash .gh-sum-n b{font-family:var(--mono);color:#fff}
.dash .gh-chev{position:absolute;right:16px;top:50%;width:9px;height:9px;margin-top:-7px;border-right:2px solid var(--cy2);border-bottom:2px solid var(--cy2);transform:rotate(45deg);transition:transform .2s}
.dash .gh-fold[open]>.gh-sum>.gh-chev{transform:rotate(-135deg);margin-top:-2px}
.dash .gh-fold[open]>.gh-sum{border-bottom:1px solid var(--line)}
.dash .gh-body{padding:14px 16px 16px;min-width:0}
.dash .gh-sum:hover .gh-sum-t{color:#fff;text-shadow:0 0 12px rgba(95,212,255,.5)}

/* Punkte (Status) */
.dash .gh-d{display:inline-block;width:9px;height:9px;border-radius:50%;flex:none;background:var(--hud-mute)}
.dash .gh-d.t-gold{background:var(--gold);box-shadow:0 0 8px rgba(226,198,143,.7)}
.dash .gh-d.t-green{background:var(--green);box-shadow:0 0 7px rgba(61,220,151,.55)}
.dash .gh-d.t-red{background:var(--red);box-shadow:0 0 7px rgba(255,94,115,.6)}
.dash .gh-d.t-cyan{background:var(--cy)}.dash .gh-d.t-grey{background:var(--hud-mute)}
.dash .gh-ico{display:inline-grid;place-items:center;width:24px;height:24px;border:1px solid rgba(95,212,255,.4);border-radius:50%;color:var(--cy);background:rgba(95,212,255,.08);flex:none}

/* Info-Auslöser (Buttons ohne Rahmen) */
.dash .gh button.gh-tipbtn{appearance:none;font:inherit;color:inherit;border:0;background:none;padding:0;margin:0;border-radius:0;box-shadow:none;cursor:pointer;-webkit-tap-highlight-color:transparent}
.dash .gh button.gh-tipbtn:focus-visible{outline:2px solid var(--gold);outline-offset:2px}

/* ---------------------------------------------------------------- Bühne */
.dash .gh-main>.gh-body{padding:18px 16px 20px}
.dash .gh-live{display:inline-flex;align-items:center;gap:8px;font-family:var(--hud);letter-spacing:.12em;text-transform:uppercase;font-size:var(--fs-xs);color:var(--cy2)}
.dash .gh-live i{width:8px;height:8px;border-radius:50%;background:var(--cy);box-shadow:0 0 10px var(--cy)}
.dash .gh-live.m-aus{color:var(--soft)}.dash .gh-live.m-aus i{background:var(--hud-mute);box-shadow:none}
.dash .gh-live.m-wartet{color:var(--gold2)}.dash .gh-live.m-wartet i{background:var(--gold);box-shadow:0 0 10px var(--gold)}
.dash .gh-stage{display:grid;grid-template-columns:minmax(0,1fr) minmax(300px,540px) minmax(0,1fr);grid-template-areas:"l c r";gap:18px 28px;align-items:center}
.dash .gh-center{grid-area:c;display:flex;flex-direction:column;align-items:center;gap:12px;min-width:0}
.dash .gh-col{display:grid;gap:12px;align-content:center;min-width:0}
.dash .gh-col.l{grid-area:l}.dash .gh-col.r{grid-area:r}

.dash .gh-brain{position:relative;width:100%;max-width:540px;aspect-ratio:1;container-type:inline-size}
.dash .gh-brain>svg{position:absolute;inset:0;display:block;width:100%;height:100%}
.dash .gh-halo{fill:none;stroke:rgba(95,212,255,.12)}
.dash .gh-dial line{stroke:rgba(95,212,255,.26);stroke-width:1}
.dash .gh-dial line.hr{stroke:rgba(95,212,255,.6);stroke-width:1.5}
.dash .gh-dial line.six{stroke:var(--cy2);stroke-width:2.2}
.dash .gh-hour{fill:#7fa6c9;font-size:var(--fs-xs);font-family:var(--mono);font-weight:600}
.dash .gh-track{fill:none;stroke:rgba(95,212,255,.16);stroke-width:1;stroke-dasharray:2 6}
.dash .gh-hand{transform-origin:200px 200px;transform:rotate(var(--a))}
.dash .gh-hand line{stroke:var(--gold);stroke-width:2.2;stroke-linecap:round}.dash .gh-hand path{fill:var(--gold)}
.dash .gh-art{transform-origin:200px 200px}
.dash .gh-hemi{fill:rgba(95,212,255,.06);stroke:#7fdcff;stroke-width:2;stroke-linejoin:round}
.dash .gh-gyr{fill:none;stroke:rgba(168,236,255,.55);stroke-width:1.5;stroke-linecap:round}
.dash .gh-fiss{fill:none;stroke:rgba(168,236,255,.5);stroke-width:1.5}
.dash .gh-stem{fill:rgba(95,212,255,.06);stroke:#7fdcff;stroke-width:1.6}
.dash .gh-sig{fill:none;stroke:var(--gold);stroke-width:1.4;stroke-linecap:round;stroke-dasharray:5 220;stroke-dashoffset:0;opacity:0}
.dash .gh-syn{fill:#cff4ff;stroke:rgba(95,212,255,.6);stroke-width:3;stroke-opacity:.35;transform-box:fill-box;transform-origin:center}
.dash .gh-core,.dash .gh-aura{transform-box:fill-box;transform-origin:center}
.dash .gh-dot{fill:#fff}
.dash .gh-wave{fill:none;stroke:var(--cy);stroke-width:1.5;opacity:0;transform-box:fill-box;transform-origin:center}
.dash .gh-brain.m-aus .gh-hemi,.dash .gh-brain.m-aus .gh-stem{stroke:var(--hud-mute);fill:rgba(139,166,201,.05)}
.dash .gh-brain.m-aus .gh-gyr,.dash .gh-brain.m-aus .gh-fiss{stroke:rgba(139,166,201,.4)}
.dash .gh-brain.m-aus .gh-syn{fill:#8ba6c9;stroke-opacity:.1}
.dash .gh-brain.m-wartet .gh-hemi{stroke:var(--gold-hi)}

/* Satelliten */
.dash .gh-orbit-l{position:absolute;inset:0;pointer-events:none}
.dash .gh-arm{position:absolute;left:50%;top:50%;width:0;height:0;transform:rotate(var(--a))}
.dash .gh-satpos{position:absolute;left:-5.5cqw;top:-5.5cqw;width:11cqw;height:11cqw;transform:translateY(-35cqw) rotate(calc(-1 * var(--a)));pointer-events:auto}
.dash .gh button.gh-sat{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;height:100%;border-radius:50%;line-height:1.05;color:#e6f6ff}
.dash .gh-sat>svg{position:absolute;inset:0;width:100%;height:100%;transform:rotate(-90deg);overflow:visible}
.dash .gh-sat-bg{fill:rgba(2,8,18,.92);stroke:rgba(95,212,255,.28);stroke-width:2.5}
.dash .gh-sat-ring{fill:none;stroke:var(--cy);stroke-width:3.6;stroke-linecap:round;stroke-dasharray:calc(var(--p) * 1px) 200px;filter:drop-shadow(0 0 3px rgba(95,212,255,.8))}
.dash .gh-sat b,.dash .gh-sat em{position:relative;font-family:var(--mono);font-style:normal}
.dash .gh-sat b{font-size:clamp(10px,2.5cqw,14px);font-weight:700;letter-spacing:.02em}
.dash .gh-sat em{font-size:clamp(8.5px,2cqw,11.5px);color:var(--cy2);display:flex}
.dash .gh button.gh-sat.st-laeuft{box-shadow:0 0 18px rgba(95,212,255,.45)}
.dash .gh button.gh-sat.st-wartet{opacity:.55}
.dash .gh-sat.st-wartet .gh-sat-bg{stroke-dasharray:4 4;stroke:rgba(226,198,143,.6)}
.dash .gh-sat.st-wartet em{color:var(--gold2)}
.dash .gh button.gh-sat.st-frei{opacity:.32}
.dash .gh button.gh-sat:hover,.dash .gh button.gh-sat.is-open{opacity:1}
.dash .gh button.gh-sat.is-open .gh-sat-bg{stroke:var(--gold)}
.dash .gh-tether{position:absolute;left:-.5px;top:-29.5cqw;width:1px;height:17cqw;background:linear-gradient(180deg,rgba(95,212,255,.6),rgba(95,212,255,0))}
.dash .gh-arm.st-wartet .gh-tether{background:linear-gradient(180deg,rgba(226,198,143,.35),rgba(226,198,143,0))}
/* Auftrag vom Gehirn: goldene Linie Gehirn → Agent */
.dash .gh-arm.brain .gh-tether{width:2px;left:-1px;background:linear-gradient(0deg,rgba(242,220,174,.95),rgba(226,198,143,.15));box-shadow:0 0 8px rgba(226,198,143,.7)}
.dash .gh-pop-g{display:flex;align-items:center;gap:5px;margin:2px 0;font-size:var(--fs-xs);color:var(--gold2)}
.dash .gh-signal{position:absolute;left:-.6cqw;top:-.6cqw;width:1.2cqw;height:1.2cqw;border-radius:50%;background:var(--gold2);box-shadow:0 0 8px var(--gold);opacity:0;transform:translateY(-29cqw)}

/* Uhr-Punkte (nächste Läufe) */
.dash .gh-marks{position:absolute;inset:0;pointer-events:none}
.dash .gh button.gh-mark{position:absolute;width:26px;height:26px;margin:-13px 0 0 -13px;display:grid;place-items:center;pointer-events:auto;border-radius:50%}
.dash .gh-mark i{width:9px;height:9px;border-radius:50%;background:#02060f;border:2px solid var(--cy);box-sizing:border-box}
.dash .gh-mark.next i{width:12px;height:12px;background:var(--cy);border-color:#d9f6ff;box-shadow:0 0 10px var(--cy)}
.dash .gh-mark.next:after{content:"";position:absolute;left:50%;top:50%;width:12px;height:12px;margin:-6px 0 0 -6px;border-radius:50%;border:2px solid var(--cy);opacity:0;pointer-events:none}
.dash .gh-mark.multi i{box-shadow:0 0 0 2px #02060f,0 0 0 3.5px rgba(95,212,255,.75)}
.dash .gh-mark.multi.next i{box-shadow:0 0 0 2px #02060f,0 0 0 3.5px rgba(95,212,255,.85),0 0 12px var(--cy)}
.dash .gh button.gh-mark:hover i,.dash .gh button.gh-mark.is-open i{border-color:var(--gold);box-shadow:0 0 10px var(--gold)}

/* eine Zeile unter dem Gehirn */
.dash .gh-voice{display:flex;align-items:center;gap:9px;max-width:100%;margin:0;padding:8px 14px;border:1px solid var(--line);background:rgba(4,14,30,.6);
  font-size:var(--fs-m);color:#e6f6ff;white-space:nowrap;min-width:0}
.dash .gh-voice>span,.dash .gh-voice>a{overflow:hidden;text-overflow:ellipsis;min-width:0}
.dash .gh-voice>a{color:var(--gold2);text-decoration:none}
.dash .gh-vd{width:8px;height:8px;border-radius:50%;flex:none;background:var(--cy);box-shadow:0 0 8px var(--cy)}
.dash .gh-vd.m-wartet{background:var(--gold);box-shadow:0 0 8px var(--gold)}.dash .gh-vd.m-aus{background:var(--hud-mute);box-shadow:none}

/* Instrumente neben dem Gehirn */
.dash .gh-inst{position:relative;display:grid;gap:10px;padding:10px 12px 12px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(9,24,48,.78),rgba(4,12,26,.62));min-width:0}
.dash .gh-inst-h{display:flex;align-items:center;gap:8px;text-decoration:none;color:var(--cy2);font-family:var(--hud);font-size:var(--fs-s);font-weight:600;letter-spacing:.14em;text-transform:uppercase;min-width:0}
.dash .gh-inst-h>b{font-family:var(--mono);font-size:var(--fs-l);letter-spacing:0;color:#fff;text-shadow:0 0 12px rgba(95,212,255,.45)}
.dash .gh-inst-h>svg:last-child{margin-left:auto;opacity:.45}
.dash .gh-inst-h:hover{color:#fff}.dash .gh-inst-h:hover>svg:last-child{opacity:1}
.dash .gh-col.l .gh-inst:after,.dash .gh-col.r .gh-inst:after{content:"";position:absolute;top:50%;width:27px;height:1px;background:linear-gradient(90deg,rgba(95,212,255,0),rgba(95,212,255,.7))}
.dash .gh-col.l .gh-inst:after{right:-29px}.dash .gh-col.r .gh-inst:after{left:-29px;transform:scaleX(-1)}
.dash .gh-ab{display:grid;gap:4px;min-width:0}
.dash .gh-ab-s{font-family:var(--mono);font-size:var(--fs-xs);color:var(--soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash .gh button.gh-split{display:flex;gap:2px;width:100%;height:28px;padding:2px;border:1px solid rgba(95,212,255,.28);background:rgba(2,8,18,.6)}
.dash .gh button.gh-split:hover,.dash .gh button.gh-split.is-open{border-color:var(--cy)}
.dash .gh-seg{display:flex;align-items:center;justify-content:space-between;gap:4px;padding:0 7px;min-width:0;overflow:hidden;white-space:nowrap;font-size:var(--fs-xs);
  color:#e6f6ff;background:linear-gradient(90deg,rgba(42,143,196,.6),rgba(95,212,255,.32));transform-origin:left center}
.dash .gh-seg b,.dash .gh-seg em{font-family:var(--mono);font-style:normal}
.dash .gh-seg.lead{color:#1a1206;background:linear-gradient(90deg,var(--gold),var(--gold-hi))}
.dash .gh-seg.ghost{display:block;height:28px;width:100%;border:1px dashed var(--line);background:none}
.dash .gh-none{display:block;color:var(--soft)}
.dash .gh-leds{display:flex;gap:6px}
.dash .gh button.gh-led{width:30px;height:30px;display:grid;place-items:center;border-radius:50%}
.dash .gh-led i{width:13px;height:13px;border-radius:50%;background:#26354b;box-shadow:inset 0 0 0 1px rgba(255,255,255,.08)}
.dash .gh-led.on i{background:var(--green);box-shadow:0 0 10px var(--green),inset 0 0 0 1px rgba(255,255,255,.3)}
.dash .gh button.gh-led:hover i,.dash .gh button.gh-led.is-open i{outline:2px solid rgba(226,198,143,.7);outline-offset:2px}
.dash .gh button.gh-rep{display:inline-flex;align-items:center;gap:8px;padding:6px 12px;border:1px solid rgba(95,212,255,.3);background:rgba(2,8,18,.6);color:var(--cy)}
.dash .gh-rep b{font-family:var(--mono);font-size:var(--fs-m);color:#fff}
.dash .gh button.gh-rep:hover,.dash .gh button.gh-rep.is-open{border-color:var(--cy);box-shadow:var(--glow)}

/* Info-Karte */
.dash .gh-poplayer{position:fixed;z-index:1000;max-width:min(300px,calc(100vw - 16px));max-height:60vh;overflow:auto;padding:10px 12px;
  background:rgba(4,12,26,.97);border:1px solid rgba(95,212,255,.38);box-shadow:0 14px 40px -10px rgba(0,0,0,.85),0 0 18px rgba(95,212,255,.18);
  color:var(--text);font-size:var(--fs-s);line-height:1.45;overflow-wrap:anywhere}
.dash .gh-pop{display:grid;gap:3px;min-width:150px}
.dash .gh-pop.wide{max-width:300px}
.dash .gh-pop-h{display:flex;justify-content:space-between;align-items:baseline;gap:12px}
.dash .gh-pop-h b{color:#fff;font-size:var(--fs-s)}
.dash .gh-pop-h span{font-family:var(--mono);font-size:var(--fs-xs);color:var(--gold2);white-space:nowrap}
.dash .gh-pop p{margin:0;font-size:var(--fs-s)}
.dash .gh-pop .gh-pop-t{font-weight:600;color:#e6f6ff}
.dash .gh-pop .gh-pop-m{color:var(--soft);font-size:var(--fs-xs)}
.dash .gh-pop-a{display:inline-flex;align-items:center;gap:3px;margin-top:4px;font-size:var(--fs-xs);text-decoration:none}
.dash .gh-pop .gh-full{margin-top:4px}

/* ---------------------------------------------------------------- Vorschläge */
.dash .gh-pcs{display:grid;gap:10px;grid-template-columns:repeat(auto-fill,minmax(min(100%,440px),1fr))}
.dash .gh-pc{display:grid;gap:6px;align-content:start;padding:10px 12px;border:1px solid rgba(226,198,143,.45);box-shadow:inset 3px 0 0 var(--gold);background:rgba(4,14,30,.5);min-width:0}
.dash .gh-pc.dim{opacity:.55;border-color:var(--line);box-shadow:none}
.dash .gh-pc.dim .gh-d{background:color-mix(in srgb,var(--gold) 45%,#02060f);box-shadow:none}
.dash .gh-pc-h{display:flex;align-items:center;gap:9px;min-width:0}
.dash .gh-pc-t{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:var(--fs-m);font-weight:600;color:#fff}
.dash .gh-pc-h time{font-family:var(--mono);font-size:var(--fs-xs);color:var(--soft);white-space:nowrap}
.dash .gh-pc-f{display:flex;flex-wrap:wrap;align-items:center;gap:6px 10px;margin-left:18px}
.dash .gh-pc-f>.gh-more{flex:1;min-width:0}
.dash .gh-pc-f>.gh-more[open]{order:2;flex-basis:100%}
.dash .gh-yn{display:flex;gap:6px;flex:none;margin-left:auto}
.dash .gh-yn button{width:34px;height:34px;padding:0;display:grid;place-items:center;border-radius:50%}
.dash .gh .gh-yn button.yes{color:var(--green);border-color:rgba(61,220,151,.55)}
.dash .gh .gh-yn button.no{color:#a9c3e3}
.dash .gh-pc-g{margin:0 0 0 18px;font-size:var(--fs-s);line-height:1.45;color:#bcd3ea;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.dash .gh-more>summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:4px;font-size:var(--fs-xs);color:var(--soft)}
.dash .gh-more>summary::-webkit-details-marker{display:none}
.dash .gh-more>summary:before{content:"";width:5px;height:5px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .15s}
.dash .gh-more[open]>summary:before{transform:rotate(45deg)}
.dash .gh-more>summary:hover{color:var(--cy2)}
.dash .gh-full{font-size:var(--fs-xs);line-height:1.5;color:var(--soft);max-height:180px;overflow:auto;margin-top:6px;padding:8px 10px;border:1px solid var(--line);background:rgba(2,8,18,.5);white-space:pre-wrap;overflow-wrap:anywhere}
.dash .gh-full p{margin:0 0 6px}.dash .gh-full p:last-child{margin:0}.dash .gh-full b{color:var(--text);font-weight:600}
.dash .gh-calm{margin:0;display:flex;align-items:center;gap:8px;font-size:var(--fs-s);color:var(--soft)}.dash .gh-calm svg{color:var(--green)}
.dash .gh-strip{display:inline-flex;gap:4px;align-items:center}
.dash .gh-strip i{width:7px;height:7px;border-radius:50%;background:var(--hud-mute)}
.dash .gh-strip i.t-gold{background:var(--gold);box-shadow:0 0 6px var(--gold)}.dash .gh-strip i.t-green{background:var(--green)}.dash .gh-strip i.t-red{background:var(--red)}

.dash .gh-vlist{margin-top:16px;display:grid;gap:8px}
.dash .gh-filter{display:flex;gap:6px;flex-wrap:wrap}
.dash .gh-filter input{position:absolute;opacity:0;width:1px;height:1px;pointer-events:none}
.dash .gh-filter label{display:inline-flex;align-items:center;gap:6px;padding:4px 11px;border:1px solid var(--line);border-radius:99px;font-size:var(--fs-s);color:var(--soft);cursor:pointer;user-select:none}
.dash .gh-filter label b{font-family:var(--mono);font-weight:600;color:var(--text)}
.dash .gh-filter input:checked+label{border-color:var(--cy);color:#fff;background:rgba(95,212,255,.12)}
.dash .gh-filter input:focus-visible+label{outline:2px solid var(--gold);outline-offset:2px}
.dash .gh-vlist:has(#gh-vf-done:checked) .gh-tl>li:not(.s-done){display:none}
.dash .gh-vlist:has(#gh-vf-rej:checked) .gh-tl>li:not(.s-rejected){display:none}
.dash .gh-tl{list-style:none;margin:0;padding:0;position:relative}
.dash .gh-tl:before{content:"";position:absolute;left:4px;top:12px;bottom:12px;width:1px;background:linear-gradient(180deg,rgba(95,212,255,.5),rgba(95,212,255,.06))}
.dash .gh-tl>li{border-bottom:1px solid rgba(95,212,255,.07)}.dash .gh-tl>li:last-child{border-bottom:0}
.dash .gh-tl summary{display:grid;grid-template-columns:9px 44px minmax(0,1fr) 14px;align-items:center;gap:10px;padding:7px 0;cursor:pointer;list-style:none;font-size:var(--fs-s);position:relative}
.dash .gh-tl summary::-webkit-details-marker{display:none}
.dash .gh-tl summary:hover .gh-tt{color:#fff}
.dash .gh-tl summary>svg{color:var(--soft)}
.dash .gh-tl time{font-family:var(--mono);font-size:var(--fs-xs);color:var(--cy2);white-space:nowrap}
.dash .gh-tt{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:#d9ecff}
.dash .gh-tl>li.s-rejected .gh-tt{color:var(--soft)}
.dash .gh-tl-b{padding:0 0 10px 63px;font-size:var(--fs-s);color:#bcd3ea;display:grid;gap:6px}
.dash .gh-tl-b>p{margin:0;overflow-wrap:anywhere}
.dash .gh-old{margin-top:14px}
.dash .gh-old>summary{cursor:pointer;list-style:none;display:inline-flex;align-items:center;gap:6px;font-size:var(--fs-s);color:var(--soft);margin-bottom:8px}
.dash .gh-old>summary::-webkit-details-marker{display:none}
.dash .gh-old>summary b{font-family:var(--mono);color:var(--text);font-weight:600}
.dash .gh-old>summary:before{content:"";width:6px;height:6px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);transition:transform .15s}
.dash .gh-old[open]>summary:before{transform:rotate(45deg)}

/* ---------------------------------------------------------------- Seiten */
.dash .gh-pages{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(min(100%,460px),1fr))}
.dash .gh-page{border:1px solid var(--line);background:rgba(4,14,30,.45);min-width:0}
.dash .gh-page>header{display:flex;align-items:center;gap:10px;padding:9px 12px;border-bottom:1px solid var(--line);background:rgba(95,212,255,.04);min-width:0}
.dash .gh-slug{flex:1;min-width:0;font-family:var(--mono);font-weight:600;font-size:var(--fs-s);text-decoration:none;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash .gh-q{font-family:var(--mono);font-size:var(--fs-s);color:#fff;white-space:nowrap;text-align:right}
.dash .gh-var{display:grid;grid-template-columns:20px 9px minmax(0,1fr) 58px auto;align-items:center;gap:10px;padding:8px 12px;border-bottom:1px solid rgba(95,212,255,.07)}
.dash .gh-var:last-child{border-bottom:0}
.dash .gh-var.off{opacity:.5}
.dash .gh-vk{font-family:var(--mono);font-weight:700;text-decoration:none;text-align:center}
.dash .gh button.gh-vbar{display:block;width:100%;height:12px;border-radius:6px;background:rgba(95,212,255,.1);overflow:hidden}
.dash .gh-vbar i{display:block;height:100%;border-radius:6px;background:linear-gradient(90deg,#2a8fc4,#5fd4ff);box-shadow:0 0 8px rgba(95,212,255,.5);transform-origin:left center}
.dash .gh button.gh-vbar:hover,.dash .gh button.gh-vbar.is-open{outline:1px solid var(--cy);outline-offset:2px}
.dash .gh-acts{display:flex;gap:6px;justify-content:flex-end}
.dash .gh-ib{width:30px;height:30px;padding:0!important;display:inline-grid;place-items:center;border-radius:50%!important}

/* ---------------------------------------------------------------- Schalter */
.dash .gh-ctrls{display:grid;gap:14px;grid-template-columns:repeat(auto-fit,minmax(min(100%,300px),1fr))}
.dash .gh-card{border:1px solid var(--line);background:rgba(4,14,30,.45);padding:10px 14px;min-width:0}
.dash .gh-sw{display:flex;justify-content:space-between;align-items:center;gap:10px;padding:7px 0;border-bottom:1px solid rgba(95,212,255,.07);font-size:var(--fs-s)}
.dash .gh-sw:last-child{border-bottom:0}
.dash .gh-sw>span{min-width:0;display:inline-flex;align-items:center;gap:8px}
.dash .gh-sw .sw{display:flex;gap:4px;flex:none}.dash .gh-sw .sw button{padding:5px 12px;font-size:var(--fs-s)}
.dash .gh-max{display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:4px 0 10px;border-bottom:1px solid rgba(95,212,255,.07)}
.dash .gh-max label{display:flex;align-items:center;gap:8px;font-size:var(--fs-s)}.dash .gh-max label svg{color:var(--cy)}
.dash .gh-max input{width:72px}
.dash .gh-facts{display:flex;flex-wrap:wrap;gap:8px 16px;padding-top:10px;font-size:var(--fs-s);color:var(--soft)}
.dash .gh-facts>span,.dash .gh-facts>a{display:inline-flex;align-items:center;gap:6px;white-space:nowrap}
.dash .gh-facts>a{color:var(--soft);text-decoration:none}.dash .gh-facts>a:hover{color:#fff}

/* ---------------------------------------------------------------- Umgebung */
.dash .gh-envs{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr));gap:0 22px}
.dash .gh-env{display:flex;align-items:center;gap:9px;padding:6px 0;border-bottom:1px solid rgba(95,212,255,.07);min-width:0}
.dash .gh button.gh-envn{min-width:0;text-align:left;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--monof),monospace;font-size:var(--fs-xs)}
.dash .gh button.gh-envn:hover,.dash .gh button.gh-envn.is-open{color:#fff}

/* ---------------------------------------------------------------- schmal */
@media (max-width:1100px){
  .dash .gh-stage{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-areas:"c c" "l r"}
  .dash .gh-col{align-content:start}
  .dash .gh-brain{max-width:480px}
  .dash .gh-col.l .gh-inst:after,.dash .gh-col.r .gh-inst:after{display:none}
}
@media (max-width:640px){
  .dash .gh-stage{grid-template-columns:minmax(0,1fr);grid-template-areas:"c" "l" "r";gap:12px}
  .dash .gh-orbit-l{display:none}
  .dash .gh-col,.dash .gh-col.r{grid-template-columns:minmax(0,1fr);align-items:stretch}
  .dash .gh-pcs,.dash .gh-pages,.dash .gh-ctrls{grid-template-columns:minmax(0,1fr);align-items:stretch}
  .dash .gh-sum{padding:11px 40px 11px 12px}
  .dash .gh-body{padding:12px}
  .dash .gh-main>.gh-body{padding:12px 8px 14px}
  .dash .gh-voice{font-size:var(--fs-s);padding:7px 12px}
  .dash .gh-sum-s{font-size:var(--fs-xs)}
  .dash .gh-var{grid-template-columns:18px 9px minmax(0,1fr) 54px auto;gap:8px;padding:8px 10px}
  .dash .gh-pc-g,.dash .gh-pc-f{margin-left:0}
  .dash .gh-tl-b{padding-left:20px}
  .dash .gh-tl summary{grid-template-columns:9px 40px minmax(0,1fr) 14px;gap:8px}
}

/* ---------------------------------------------------------------- Bewegung (nur ohne „Bewegung reduzieren“) */
@keyframes gh-hand{from{transform:rotate(var(--a))}to{transform:rotate(calc(var(--a) + 360deg))}}
@keyframes gh-breath{0%,100%{transform:scale(.92);opacity:.65}50%{transform:scale(1.08);opacity:1}}
@keyframes gh-flow{0%{stroke-dashoffset:0;opacity:0}12%{opacity:1}80%{opacity:1}100%{stroke-dashoffset:-225;opacity:0}}
@keyframes gh-blink{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes gh-in{0%{transform:translateY(-29cqw) scale(.6);opacity:0}12%{opacity:1}85%{opacity:1}100%{transform:translateY(-11cqw) scale(1.1);opacity:0}}
@keyframes gh-ping{0%{transform:scale(1);opacity:.9}100%{transform:scale(3);opacity:0}}
@keyframes gh-ring{from{stroke-dasharray:0 200px}}
@keyframes gh-grow{from{transform:scaleX(0)}}
@keyframes gh-open{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:none}}
/* Ruhig (W1-6): genau 3 Dauer-Bewegungen – Kern atmet, Signal fließt nur bei Aktivität (.hot), Ping nur am nächsten
   Lauf. Puls nur bei Alarm (rot); Engpass pulst in ab-section. Einmalige Einblendungen (Ring, Balken, Aufklappen) bleiben. */
@media (prefers-reduced-motion:no-preference){
  .dash .gh-core{animation:gh-breath 6s ease-in-out infinite}
  .dash .gh-hand{animation:gh-hand 86400s linear infinite} /* echte Uhr: 1 Umdrehung/Tag, nicht sichtbar bewegt */
  .dash .gh-brain.hot .gh-sig{animation:gh-flow 3.2s ease-in infinite;animation-delay:calc(var(--i) * -1.1s)}
  .dash .gh-brain.hot .gh-signal{animation:gh-in 2.4s cubic-bezier(.5,0,.8,1) infinite}
  .dash .gh-brain.hot .gh-signal.s2{animation-delay:-.8s}.dash .gh-brain.hot .gh-signal.s3{animation-delay:-1.6s}
  .dash .gh-mark.next:after{animation:gh-ping 2.6s ease-out infinite}
  .dash .gh-d.t-red,.dash .gh-strip i.t-red,.dash .gh .pill.t-red{animation:gh-blink 2s ease-in-out infinite}
  .dash .gh-sat-ring{animation:gh-ring 1.2s ease-out both}
  .dash .gh-seg,.dash .gh-vbar i{animation:gh-grow .9s cubic-bezier(.2,.8,.2,1) both}
  .dash .gh-brain.m-aus *{animation:none!important}
  .dash .gh-fold[open]>.gh-body{animation:gh-open .22s ease-out}
}
/* ohne Aktivität stehen Signale still (unsichtbar) */
.dash .gh-brain:not(.hot) .gh-sig,.dash .gh-brain:not(.hot) .gh-signal{display:none}
@media (prefers-reduced-motion:reduce){.dash .gh-sig,.dash .gh-wave,.dash .gh-signal{display:none}}
`;

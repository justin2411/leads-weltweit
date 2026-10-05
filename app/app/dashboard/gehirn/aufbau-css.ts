/**
 * Aufbau-Organigramm der Gehirn-Seite (aufbau.tsx). Designsystem Kommandozentrale (hud-css.ts): Nachtblau, Cyan = läuft,
 * Gold = Gehirn/Inhaber, Rot/Gelb/Grün nur Status. Layout-Regel Inhaber: Kästen nebeneinander bündig (Grid stretch,
 * Überschrift im Kasten), X = x-btn mittig. Handy: keine Überläufe (minmax(0,1fr), Text mit Ellipse).
 * prefers-reduced-motion: keine Bewegung.
 */
export const AUFBAU_CSS = `
.dash .ga{display:flex;flex-direction:column;align-items:stretch;margin:0 0 24px;min-width:0}
.dash .ga *{box-sizing:border-box}
.dash .ga-box{position:relative;min-width:0;border:1px solid var(--ds-linie);border-radius:var(--ds-r);background:var(--ds-flaeche);padding:16px;
  box-shadow:inset 0 1px 0 rgba(255,255,255,.03),0 10px 40px -24px rgba(0,0,0,.9)}
.dash .ga-h{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px;font-size:var(--fs-l);color:var(--cy2);text-transform:uppercase;letter-spacing:.06em}
.dash .ga-h .ico{color:var(--cy)}
.dash .ga-gross{margin-left:auto;font-size:var(--fs-num);color:#fff;text-transform:none;letter-spacing:0;line-height:1;text-shadow:0 0 14px rgba(95,212,255,.45)}
.dash .ga-gross small{font-size:var(--fs-s);color:var(--ds-leise);margin-left:4px;font-family:var(--sans),system-ui,sans-serif}

/* ① Gehirn */
.dash .ga-kopf{display:flex;flex-direction:column;align-items:center;text-align:center;border-color:rgba(226,198,143,.35);
  background:radial-gradient(420px 260px at 50% 40%,rgba(95,212,255,.12),transparent 70%),var(--ds-flaeche)}
.dash .ga-kopf .ga-h{align-self:stretch;justify-content:center;color:var(--gold2)}
.dash .ga-kopf .ga-h .ico{color:var(--gold)}
.dash .ga-hirn{display:block;width:min(260px,70vw);aspect-ratio:320/260;padding:0;border:0;background:none;cursor:pointer;border-radius:50%}
.dash .ga-hirn:focus-visible{outline:2px solid var(--cy);outline-offset:4px}
.dash .ga-brain{width:100%;height:100%;overflow:visible}
.dash .ga-aura{fill:none;stroke:rgba(95,212,255,.18);stroke-width:1.5;transform-origin:200px 196px}
.dash .ga-hemi{fill:rgba(95,212,255,.07);stroke:#7fdcff;stroke-width:2.2;stroke-linejoin:round}
.dash .ga-gyr{fill:none;stroke:rgba(168,236,255,.55);stroke-width:1.6;stroke-linecap:round}
.dash .ga-sig{fill:none;stroke:var(--gold-hi);stroke-width:2;stroke-linecap:round;stroke-dasharray:6 100;stroke-dashoffset:6;opacity:0}
.dash .ga-syn{fill:#cff4ff;stroke:rgba(95,212,255,.6);stroke-width:3;stroke-opacity:.35;transform-box:fill-box;transform-origin:center}
.dash .ga-kern{fill:var(--gold);filter:drop-shadow(0 0 6px var(--gold))}
.dash .ga-brain.m-aus .ga-hemi{stroke:var(--ds-grau);fill:rgba(139,166,201,.05)}
.dash .ga-brain.m-aus .ga-gyr{stroke:rgba(139,166,201,.35)}
.dash .ga-brain.m-aus .ga-syn,.dash .ga-brain.m-aus .ga-kern{fill:var(--ds-grau);filter:none}
.dash .ga-brain.m-wartet .ga-hemi{stroke:var(--gold-hi)}
.dash .ga-fakten{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:8px}
.dash .ga-chip{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 12px;border:1px solid var(--ds-linie);border-radius:16px;background:rgba(4,14,30,.6);font-size:var(--fs-s);color:var(--text);white-space:nowrap}
.dash .ga-chip b{color:#fff;font-weight:600}
.dash .ga-chip small{color:var(--cy);font-size:var(--fs-xs)}
.dash .ga-chip.aus{color:var(--ds-leise)}
.dash .ga-meld{display:flex;align-items:center;gap:8px;max-width:100%;margin-top:12px;min-height:40px;padding:0 12px;border:1px solid rgba(226,198,143,.3);border-radius:8px;background:rgba(226,198,143,.06);color:var(--text);font:inherit;font-size:var(--fs-s);cursor:pointer}
.dash .ga-meld span{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash .ga-meld time{color:var(--gold2);flex:none}
.dash .ga-meld .ico{flex:none;color:var(--gold)}
.dash .ga-meld:hover{border-color:var(--gold)}

/* Draht zwischen den Ebenen: Lichtpunkte fließen nach unten */
.dash .ga-draht{position:relative;align-self:center;width:2px;height:32px;background:linear-gradient(var(--ds-linie),rgba(95,212,255,.45));overflow:visible}
.dash .ga-draht i{position:absolute;left:-2px;top:0;width:6px;height:6px;border-radius:50%;background:var(--cy2);box-shadow:0 0 8px var(--cy);opacity:0}

/* ② Agenten */
.dash .ga-gruppen{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,320px),1fr));gap:12px;align-items:stretch}
.dash .ga-gr{display:flex;flex-direction:column;min-width:0;margin:0;padding:12px;border:1px solid rgba(95,212,255,.12);border-radius:10px;background:rgba(2,10,22,.45)}
.dash .ga-gr.g-nummer{grid-column:1/-1}
.dash .ga-gr h3{display:flex;align-items:center;gap:6px;margin:0 0 8px;font-size:var(--fs-s);font-weight:600;color:var(--ds-leise);text-transform:uppercase;letter-spacing:.06em}
.dash .ga-ags{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,150px),1fr));gap:8px;align-items:stretch;align-content:start;flex:1}
.dash .ga-ag,.dash .ga-werk{position:relative;display:flex;flex-direction:column;gap:4px;min-width:0;min-height:84px;padding:8px 10px;border:1px solid var(--ds-linie);border-radius:8px;
  background:rgba(9,24,48,.7);color:var(--text);font:inherit;text-align:left}
.dash .ga-ag{cursor:pointer;transition:border-color var(--ds-t-glide) var(--ds-ease),transform var(--ds-t-glide) var(--ds-ease)}
.dash .ga-ag:hover,.dash .ga-ag:focus-visible{border-color:var(--cy);outline:none}
.dash .ga-ag.s-arbeitet{border-color:rgba(95,212,255,.6);box-shadow:0 0 16px -6px var(--cy)}
.dash .ga-ag.s-aus{opacity:.55}
.dash .ga-ag-h{display:flex;align-items:center;gap:8px;min-width:0}
.dash .ga-ic{display:inline-grid;place-items:center;flex:none;width:28px;height:28px;border-radius:50%;border:1px solid rgba(95,212,255,.3);color:var(--cy);background:rgba(95,212,255,.06)}
.dash .ga-ic b{font:600 var(--fs-xs) var(--ds-mono);color:var(--cy2)}
.dash .ga-ag-n{flex:1;min-width:0;font-size:var(--fs-s);font-weight:600;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash .ga-ag-a{font-size:var(--fs-xs);color:var(--ds-leise);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;min-height:1.3em}
.dash .ga-ag.s-arbeitet .ga-ag-a{color:var(--cy2)}
.dash .ga-ag-z{margin-top:auto;font-size:var(--fs-xs);color:var(--ds-leise)}
.dash .ga-ag-z b{font:600 var(--fs-m) var(--ds-mono);color:#fff}
.dash .ga-pt{flex:none;display:inline-block;width:10px;height:10px;border-radius:50%;background:var(--ds-grau)}
.dash .ga-pt.s-arbeitet,.dash .ga-pt.s-live,.dash .ga-pt.s-cy{background:var(--cy);box-shadow:0 0 8px var(--cy)}
.dash .ga-pt.s-wartet,.dash .ga-pt.s-gruen{background:var(--ds-gruen)}
.dash .ga-pt.s-gelb,.dash .ga-pt.s-still{background:var(--ds-gelb)}
.dash .ga-pt.s-rot{background:var(--ds-rot);box-shadow:0 0 8px var(--ds-rot)}
.dash .ga-pt.s-aus,.dash .ga-pt.s-grau{background:var(--ds-grau)}

/* ③ Werke */
.dash .ga-bar{height:6px;margin:-4px 0 12px;border-radius:3px;background:rgba(95,212,255,.1);overflow:hidden}
.dash .ga-bar i{display:block;height:100%;border-radius:3px;background:linear-gradient(90deg,var(--cy),var(--cy2));box-shadow:0 0 10px var(--cy);transition:width var(--ds-t-fill) var(--ds-ease)}
.dash .ga-werke{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,190px),1fr));gap:8px;align-items:stretch}
.dash .ga-werk.t-rot{border-color:var(--ds-rot);background:rgba(255,94,115,.08)}
.dash .ga-werk.t-grau{opacity:.7}
.dash .ga-werk-m{display:flex;align-items:center;gap:10px;margin-top:auto;min-width:0}
.dash .ga-ringw{position:relative;display:inline-grid;place-items:center;flex:none;width:40px;height:40px}
.dash .ga-ringw b{position:absolute;font-size:var(--fs-s);color:#fff}
.dash .ga-ring{width:40px;height:40px;transform:rotate(-90deg)}
.dash .ga-ring circle{fill:none;stroke-width:3.5}
.dash .ga-ring .bg{stroke:rgba(95,212,255,.12)}
.dash .ga-ring .fg{stroke:var(--cy);stroke-linecap:round;transition:stroke-dasharray var(--ds-t-fill) var(--ds-ease)}
.dash .ga-zahl{flex:none;min-width:40px;font-size:var(--fs-m);font-weight:600;color:#fff}
.dash .ga-werk-t{display:flex;flex-direction:column;gap:2px;min-width:0;font-size:var(--fs-xs);color:var(--ds-leise)}
.dash .ga-werk-t span{display:block;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-family:var(--ds-mono)}
.dash .ga-werk-t .ico{vertical-align:-2px}

/* ④ Zeitplan */
.dash .ga-next{display:flex;flex-wrap:wrap;align-items:baseline;gap:4px 16px;margin:0 0 16px}
.dash .ga-cd{font-size:var(--fs-num);color:var(--gold2);text-shadow:0 0 14px rgba(226,198,143,.4);line-height:1}
.dash .ga-next-n{display:inline-flex;align-items:center;gap:6px;font-size:var(--fs-m);color:#fff}
.dash .ga-next-l{display:flex;flex-wrap:wrap;gap:4px 12px;width:100%;font-size:var(--fs-xs);color:var(--ds-leise)}
.dash .ga-plan{--lab:150px;--zt:48px;min-width:0}
.dash .ga-skala,.dash .ga-spur{display:grid;grid-template-columns:var(--lab) minmax(0,1fr) var(--zt);gap:8px;align-items:center}
.dash .ga-skala-b{position:relative;height:16px}
.dash .ga-skala-b b{position:absolute;top:0;transform:translateX(-50%);font:var(--fs-xs) var(--ds-mono);color:var(--ds-leise)}
.dash .ga-skala-b b:first-child{transform:none}.dash .ga-skala-b b:last-child{transform:translateX(-100%)}
.dash .ga-spuren{position:relative}
.dash .ga-jetzt{position:absolute;top:-4px;bottom:0;left:calc(var(--lab) + 8px + (100% - var(--lab) - var(--zt) - 16px) * var(--x));width:2px;margin-left:-1px;background:var(--gold);box-shadow:0 0 10px var(--gold);z-index:2;pointer-events:none;transition:left 1s linear}
.dash .ga-jetzt b{position:absolute;bottom:100%;left:50%;transform:translate(-50%,-2px);padding:0 4px;border-radius:4px;background:#07101f;font-size:var(--fs-xs);color:var(--gold2);white-space:nowrap}
.dash .ga-spur{min-height:28px;border-top:1px solid rgba(95,212,255,.06)}
.dash .ga-spur-n{display:flex;align-items:center;gap:6px;min-width:0;font-size:var(--fs-s);color:var(--text)}
.dash .ga-spur-n span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash .ga-spur.a-routine .ga-spur-n{color:var(--gold2)}
.dash .ga-spur-b{position:relative;height:14px;border-radius:7px;background:rgba(95,212,255,.06)}
.dash .ga-spur-b i{position:absolute;top:2px;width:3px;height:10px;margin-left:-1.5px;border-radius:2px;background:var(--cy)}
.dash .ga-spur.a-routine .ga-spur-b i{background:var(--gold)}
.dash .ga-spur-b i.morgen{opacity:.35}
.dash .ga-spur-b.dicht{background:repeating-linear-gradient(90deg,rgba(95,212,255,.55) 0 2px,transparent 2px 5px)}
.dash .ga-spur-t{font-size:var(--fs-xs);color:var(--ds-leise);text-align:right}
.dash .ga-spur.next .ga-spur-t{color:var(--gold2);font-weight:600}
.dash .ga-spur.next .ga-spur-n{color:#fff}
.dash .ga-fuss{display:flex;flex-wrap:wrap;align-items:center;gap:6px 16px;margin:12px 0 0;font-size:var(--fs-xs);color:var(--ds-leise)}
.dash .ga-fuss>span{display:inline-flex;align-items:center;gap:6px}
.dash .ga-lg{display:inline-block;width:10px;height:10px;border-radius:2px;background:var(--cy)}
.dash .ga-lg.r{background:var(--gold)}.dash .ga-lg.m{opacity:.35}
.dash .ga-mehr{min-height:32px;padding:0 12px;border:1px solid var(--ds-linie);border-radius:16px;background:none;color:var(--cy);font:inherit;font-size:var(--fs-xs);cursor:pointer}
.dash .ga-hinweis{margin-left:auto}

/* Fenster (Details nur auf Klick) */
.dash .ga-bg{position:fixed;inset:0;z-index:60;display:grid;place-items:center;padding:16px;background:rgba(0,4,12,.7)}
.dash .ga-dlg{width:min(520px,100%);max-height:80vh;overflow:auto;padding:8px 16px 16px;border:1px solid rgba(95,212,255,.3);border-radius:12px;background:#06121f;box-shadow:0 20px 60px -20px rgba(0,0,0,.9),0 0 30px -12px var(--cy)}
.dash .ga-dlg header{display:flex;align-items:center;gap:8px;min-height:48px}
.dash .ga-dlg header b{flex:1;min-width:0;font-size:var(--fs-l);color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash .ga-vl{list-style:none;margin:0;padding:0}
.dash .ga-vl li{display:grid;grid-template-columns:10px minmax(0,1fr) auto;gap:10px;align-items:start;padding:8px 0;border-top:1px solid rgba(95,212,255,.08)}
.dash .ga-vl li>.ga-pt{margin-top:5px}
.dash .ga-vl-t{display:flex;flex-direction:column;gap:2px;min-width:0;font-size:var(--fs-s);color:var(--text);overflow-wrap:anywhere}
.dash .ga-vl-t small{font-size:var(--fs-xs);color:var(--ds-leise)}
.dash .ga-vl time{font-size:var(--fs-xs);color:var(--ds-leise);white-space:nowrap}
.dash .ga-leer{color:var(--ds-leise);font-size:var(--fs-s)}
.dash .ga-link{display:inline-flex;align-items:center;gap:6px;margin-top:12px;font-size:var(--fs-s)}

@media (max-width:640px){
  .dash .ga-box{padding:12px}
  .dash .ga-plan{--lab:96px;--zt:40px}
  .dash .ga-spur-n .ico{display:none}
  .dash .ga-ag .ga-ag-n{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere;line-height:1.25}
  .dash .ga-hinweis{margin-left:0}
  .dash .ga-ags{grid-template-columns:repeat(2,minmax(0,1fr))}
  .dash .ga-werke{grid-template-columns:repeat(2,minmax(0,1fr))}
}

@media (prefers-reduced-motion:no-preference){
  .dash .ga-aura{animation:ga-aura 4s ease-in-out infinite}
  .dash .ga-hemi{animation:ga-atem 5s ease-in-out infinite;transform-origin:200px 196px}
  .dash .ga-syn{animation:ga-funk 3s ease-in-out infinite;animation-delay:calc(var(--i) * -.27s)}
  .dash .ga-sig{animation:ga-sig 3.6s ease-in infinite;animation-delay:calc(var(--i) * -.6s)}
  .dash .ga-brain.m-hot .ga-sig{animation-duration:1.6s}
  .dash .ga-brain.m-hot .ga-syn{animation-duration:1.2s}
  .dash .ga-brain.m-aus .ga-sig,.dash .ga-brain.m-aus .ga-syn,.dash .ga-brain.m-aus .ga-aura,.dash .ga-brain.m-aus .ga-hemi{animation:none}
  .dash .ga-kern{animation:ga-kern 2.4s ease-in-out infinite;transform-origin:200px 196px}
  .dash .ga-draht i{animation:ga-tropf 1.8s linear infinite;animation-delay:calc(var(--i) * -.6s)}
  .dash .ga-pt.s-arbeitet,.dash .ga-pt.s-live{animation:ga-puls 1.4s ease-in-out infinite}
  .dash .ga-ag.s-arbeitet:after{content:"";position:absolute;inset:-1px;border-radius:8px;border:1px solid var(--cy);animation:ga-ring 2s ease-out infinite;pointer-events:none}
  .dash .ga-spur.next .ga-spur-b i:not(.morgen):first-child{animation:ga-puls 1.2s ease-in-out infinite}
  .dash .ga-jetzt{animation:ga-glimm 2.4s ease-in-out infinite}
}
@keyframes ga-aura{0%,100%{opacity:.4;transform:scale(.97)}50%{opacity:1;transform:scale(1.03)}}
@keyframes ga-atem{0%,100%{transform:scale(1)}50%{transform:scale(1.015)}}
@keyframes ga-funk{0%,100%{fill:#cff4ff;stroke-opacity:.2}50%{fill:#fff;stroke-opacity:.8}}
@keyframes ga-sig{0%{stroke-dashoffset:6;opacity:0}15%{opacity:1}85%{opacity:1}100%{stroke-dashoffset:-100;opacity:0}}
@keyframes ga-kern{0%,100%{transform:scale(1)}50%{transform:scale(1.35)}}
@keyframes ga-tropf{0%{top:-3px;opacity:0}20%{opacity:1}80%{opacity:1}100%{top:calc(100% - 3px);opacity:0}}
@keyframes ga-puls{0%,100%{opacity:1}50%{opacity:.35}}
@keyframes ga-ring{0%{opacity:.8;transform:scale(1)}100%{opacity:0;transform:scale(1.06)}}
@keyframes ga-glimm{0%,100%{box-shadow:0 0 6px var(--gold)}50%{box-shadow:0 0 16px var(--gold)}}
@media (prefers-reduced-motion:reduce){.dash .ga *{animation:none!important;transition:none!important}}
`;

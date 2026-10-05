/**
 * Büro-Seite (Präfix bu-, Inhaber 05.10.2026: „kacheln und das design des büro hochwertiger“). JARVIS-Glas mit
 * Akzentfarbe je Bereich (--ac), alle Kacheln gleich hoch (feste Zeilenhöhe), Bereichs-Kästen bündig
 * (align-items:stretch). Rechner: 6 Spalten, Bereiche spannen so viele Spalten wie sie Kacheln haben (3 volle Reihen).
 * Handy: 2 Kachel-Spalten, kein Querscroll. Hover hebt sanft an (nicht bei prefers-reduced-motion).
 */
export const BUERO_CSS = `
.buero{--bu-h:132px;padding-top:4px}
.buero .pg-head{scroll-margin-top:140px}
.buero .bu-sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.buero .bu-grid{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:12px;align-items:stretch}
.buero .bu-g{--n:1;grid-column:span var(--n);position:relative;display:flex;flex-direction:column;min-width:0;margin:0;padding:12px 12px 12px;
  border:1px solid color-mix(in srgb,var(--ac) 28%,transparent);border-radius:16px;
  background:linear-gradient(160deg,color-mix(in srgb,var(--ac) 9%,rgba(9,24,48,.78)) 0%,rgba(6,16,34,.72) 60%);
  box-shadow:inset 0 1px 0 rgba(255,255,255,.05),0 18px 50px -30px rgba(0,0,0,.9);-webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);overflow:hidden}
.buero .bu-g::before{content:"";position:absolute;left:16px;right:16px;top:0;height:1px;background:linear-gradient(90deg,transparent,var(--ac),transparent);opacity:.7}
.buero .bu-g.n1{--n:1}.buero .bu-g.n2{--n:2}.buero .bu-g.n3{--n:3}.buero .bu-g.n4{--n:4}.buero .bu-g.n5{--n:5}.buero .bu-g.n6{--n:6}
.buero .bu-g h2{display:flex;flex-wrap:nowrap;align-items:center;gap:8px;margin:0 0 8px;padding:0 4px;min-height:44px;font-size:var(--fs-m);letter-spacing:0;text-transform:none;font-family:var(--sans),system-ui,sans-serif}
.buero .bu-g h2 a{display:inline-flex;align-items:center;gap:8px;min-width:0;flex:0 1 auto;overflow:hidden;min-height:44px;color:#fff;text-decoration:none;font-weight:700}
.buero .bu-g h2 a .nm{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.buero .bu-g h2 a>svg{flex:none}
.buero .bu-g.n1 h2 a>svg:last-child{display:none}
.buero .bu-g h2 a:hover,.buero .bu-g h2 a:focus-visible{color:var(--ac)}
.buero .bu-g h2 a>svg:last-child{color:var(--ac);opacity:.8}
.buero .ic{display:inline-flex;align-items:center;justify-content:center;flex:none;width:28px;height:28px;border-radius:8px;
  color:var(--ac);background:color-mix(in srgb,var(--ac) 14%,transparent);border:1px solid color-mix(in srgb,var(--ac) 35%,transparent)}
.buero .dot{flex:none;width:10px;height:10px;border-radius:50%;margin-left:auto;background:var(--ds-grau)}
.buero .dot.t-gruen{background:var(--ds-gruen);box-shadow:0 0 10px var(--ds-gruen)}
.buero .dot.t-gelb{background:var(--ds-gelb);box-shadow:0 0 10px var(--ds-gelb)}
.buero .dot.t-rot{background:var(--ds-rot);box-shadow:0 0 10px var(--ds-rot)}
.buero .bu-k{display:grid;grid-template-columns:repeat(var(--n),minmax(0,1fr));grid-auto-rows:var(--bu-h);gap:10px;align-items:stretch;flex:1}

.buero .bu-t{position:relative;display:flex;flex-direction:column;gap:4px;min-width:0;padding:12px 14px 14px;border-radius:12px;overflow:hidden;
  border:1px solid rgba(95,212,255,.14);background:linear-gradient(180deg,rgba(255,255,255,.035),rgba(255,255,255,0) 40%),rgba(3,12,26,.72);
  color:var(--text);text-decoration:none;font-family:var(--sans),system-ui,sans-serif;
  transition:transform .18s ease-out,border-color .18s ease-out,box-shadow .18s ease-out}
.buero .bu-t::after{content:"";position:absolute;inset:0 0 auto 0;height:1px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);
  transform:translateX(-100%);transition:transform .5s ease-out}
.buero .bu-t:hover,.buero .bu-t:focus-visible{transform:translateY(-2px);border-color:color-mix(in srgb,var(--ac) 70%,transparent);
  box-shadow:0 10px 28px -14px var(--ac),0 0 0 1px color-mix(in srgb,var(--ac) 30%,transparent) inset;outline:none}
.buero .bu-t:hover::after,.buero .bu-t:focus-visible::after{transform:translateX(100%)}
.buero .bu-th{display:flex;align-items:center;gap:8px;min-width:0}
.buero .bu-th .ic{width:26px;height:26px;border-radius:7px}
.buero .bu-th b{min-width:0;font-size:var(--fs-m);font-weight:600;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.buero .bu-th .dot{width:8px;height:8px}
.buero .bu-tm{display:flex;align-items:center;justify-content:space-between;gap:8px;min-width:0;flex:1}
.buero .bu-t .z{min-width:0;font-size:28px;line-height:1.1;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;letter-spacing:0;
  white-space:nowrap;overflow:hidden;text-overflow:ellipsis;text-shadow:0 0 18px color-mix(in srgb,var(--ac) 45%,transparent)}
.buero .bu-t .z.lang{font-size:22px}
.buero .bu-t.gold .z{color:var(--gold2);text-shadow:0 0 18px rgba(226,198,143,.45)}
.buero .bu-t .u{font-size:var(--fs-xs);line-height:1.3;color:var(--hud-soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.buero .bu-bar{position:absolute;left:0;right:0;bottom:0;height:4px;background:rgba(95,212,255,.10)}
.buero .bu-bar i{display:block;height:100%;background:linear-gradient(90deg,color-mix(in srgb,var(--ac) 55%,transparent),var(--ac));box-shadow:0 0 10px var(--ac);
  border-radius:0 2px 2px 0;transform-origin:left;animation:bu-fill .9s ease-out both}
.buero .bu-t.t-gelb .bu-bar i{background:var(--ds-gelb);box-shadow:0 0 10px var(--ds-gelb)}
.buero .bu-t.t-rot .bu-bar i{background:var(--ds-rot);box-shadow:0 0 10px var(--ds-rot)}
.buero .bu-ring{flex:none}
.buero .bu-ring .bg{fill:none;stroke:rgba(95,212,255,.12);stroke-width:4}
.buero .bu-ring .fg{fill:none;stroke:var(--ac);stroke-width:4;stroke-linecap:round;filter:drop-shadow(0 0 4px var(--ac))}
.buero .bu-t.t-gelb .bu-ring .fg{stroke:var(--ds-gelb)}.buero .bu-t.t-rot .bu-ring .fg{stroke:var(--ds-rot)}
.buero .bu-ring text{fill:#d9ecff;font-size:10px;font-weight:600;font-family:var(--sans),system-ui,sans-serif}
.buero .bu-saeulen{flex:none;display:flex;align-items:flex-end;gap:4px;width:44px;height:36px}
.buero .bu-saeulen i{flex:1;min-height:3px;border-radius:2px 2px 0 0;background:var(--ac);box-shadow:0 0 6px color-mix(in srgb,var(--ac) 60%,transparent);
  transform-origin:bottom;animation:bu-grow .8s ease-out both}
.buero .bu-ampel{flex:none;display:flex;flex-direction:column;gap:3px;padding:4px;border-radius:8px;background:rgba(0,0,0,.35);border:1px solid rgba(95,212,255,.14)}
.buero .bu-ampel i{width:9px;height:9px;border-radius:50%;background:rgba(255,255,255,.08)}
.buero .bu-ampel.t-rot i:nth-child(1){background:var(--ds-rot);box-shadow:0 0 8px var(--ds-rot)}
.buero .bu-ampel.t-gelb i:nth-child(2){background:var(--ds-gelb);box-shadow:0 0 8px var(--ds-gelb)}
.buero .bu-ampel.t-gruen i:nth-child(3){background:var(--ds-gruen);box-shadow:0 0 8px var(--ds-gruen)}
@keyframes bu-fill{from{transform:scaleX(0)}to{transform:scaleX(1)}}
@keyframes bu-grow{from{transform:scaleY(0)}to{transform:scaleY(1)}}
@keyframes bu-in{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:none}}
.buero .bu-t{animation:bu-in .45s ease-out both;animation-delay:calc(var(--i,0) * 30ms)}
.buero .bu-t:hover,.buero .bu-t:focus-visible{animation:none}

@media (max-width:1179px){
  .buero .bu-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .buero .bu-g.n1,.buero .bu-g.n2{grid-column:span 1}
  .buero .bu-g.n3,.buero .bu-g.n4,.buero .bu-g.n5,.buero .bu-g.n6{grid-column:1/-1}
  .buero .bu-g.n1 .bu-k,.buero .bu-g.n2 .bu-k{grid-template-columns:repeat(2,minmax(0,1fr))}
  .buero .bu-k>.bu-t:last-child:nth-child(odd){grid-column:span 2}
  .buero .bu-g.n3 .bu-k>.bu-t:last-child{grid-column:auto}
  .buero .bu-g.n5 .bu-k{grid-template-columns:repeat(3,minmax(0,1fr))}
  .buero .bu-g.n5 .bu-k>.bu-t:last-child{grid-column:span 2}
  .buero .bu-t .z{font-size:24px}
  .buero .bu-t .z.lang{font-size:20px}
}
@media (max-width:759px){
  .buero{--bu-h:120px}
  .buero .bu-grid{grid-template-columns:minmax(0,1fr);gap:10px}
  .buero .bu-g,.buero .bu-g.n1,.buero .bu-g.n2,.buero .bu-g.n3,.buero .bu-g.n4,.buero .bu-g.n5,.buero .bu-g.n6{grid-column:auto}
  .buero .bu-k,.buero .bu-g.n5 .bu-k{grid-template-columns:repeat(2,minmax(0,1fr))}
  .buero .bu-k>.bu-t:last-child:nth-child(odd),.buero .bu-g.n3 .bu-k>.bu-t:last-child,.buero .bu-g.n5 .bu-k>.bu-t:last-child{grid-column:span 2}
  .buero .bu-g{padding:8px 10px 10px}
  .buero .bu-k{gap:8px}
  .buero .bu-t{padding:10px 10px 12px}
  .buero .bu-t .z{font-size:22px}
  .buero .bu-t .z.lang{font-size:18px}
  .buero .bu-saeulen{width:34px;height:30px}
  .buero .bu-ring{width:38px;height:38px}
}
.buero .bu-kopf{display:flex;gap:8px;margin-left:auto}
.buero .bu-kopf a{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 12px;border:1px solid rgba(201,182,255,.45);border-radius:10px;color:#e3d9ff;text-decoration:none}
.buero .bu-kopf a:hover,.buero .bu-kopf a:focus-visible{border-color:#c9b6ff}
@media (prefers-reduced-motion:reduce){
  .buero .bu-t,.buero .bu-t::after,.buero .bu-bar i,.buero .bu-saeulen i{animation:none;transition:none}
  .buero .bu-t:hover,.buero .bu-t:focus-visible{transform:none}
}
`;

/**
 * Themenfeld „Website“ im JARVIS-Stil (Farben aus hud-css.ts), eigenes Präfix ws- (Marken-CSS ist global).
 * Handy zuerst: 390 px ohne Querscroll, Ringe 4 + 3 je Zeile. Bewegung nur ohne „Bewegung reduzieren“.
 */
export const WS_CSS = `
.ws{padding-bottom:40px;max-width:var(--wmax,1240px);margin:0 auto}
.ws-head{display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap;margin:4px 0 12px}
.ws-head h1{margin-right:auto!important}
.ws-head h1{margin:0;font-size:var(--fs-xl);letter-spacing:.12em;text-transform:uppercase;color:#fff;display:flex;align-items:center;gap:10px}
.ws-open{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 14px;border-radius:99px;border:1px solid rgba(226,198,143,.5);color:var(--gold2);text-decoration:none;font-size:var(--fs-s);font-weight:600}
.ws-open:hover{background:rgba(226,198,143,.1)}
.ws-err{margin:0 0 12px;padding:10px 12px;border:1px solid rgba(255,94,115,.5);border-radius:10px;background:var(--red-bg);color:#ffb3bd;font-weight:600;display:flex;gap:8px;align-items:center;overflow-wrap:anywhere}
.ws-h{display:flex;align-items:center;gap:8px;margin:0 0 10px;font-size:var(--fs-xs);letter-spacing:.14em;text-transform:uppercase;color:var(--cy2)}
.ws-h em{margin-left:auto;font-style:normal;letter-spacing:0;text-transform:none;font-size:var(--fs-s);color:var(--soft)}
.ws-note{display:flex;gap:6px;align-items:center;font-size:var(--fs-s);color:var(--soft);margin:8px 0 0}

/* Gesundheit */
.ws-health{position:relative;display:grid;grid-template-columns:minmax(0,370px) minmax(0,1fr);gap:18px;align-items:center;padding:18px;border:1px solid var(--line);border-radius:16px;
  background:radial-gradient(120% 140% at 0% 0%,rgba(95,212,255,.10),transparent 55%),var(--card);margin:0 0 14px;min-width:0;overflow:hidden}
.ws-main{display:flex;align-items:center;gap:16px;min-width:0}
.ws-ring{position:relative;display:block;flex:none;max-width:none;--rc:#5d7ca3}
.ws-ring.t-gruen{--rc:#3ddc97}.ws-ring.t-gelb{--rc:#ffb547}.ws-ring.t-rot{--rc:#ff5e73}.ws-ring.t-leer{--rc:#5d7ca3}
.ws-ring>svg{position:absolute;inset:0;overflow:visible}
.ws-ring .bg{fill:none;stroke:rgba(95,212,255,.12)}
.ws-ring .fg{fill:none;stroke:var(--rc);stroke-linecap:round;filter:drop-shadow(0 0 6px color-mix(in srgb,var(--rc) 55%,transparent))}
.ws-ring .in{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--rc);line-height:1}
.ws-main .ws-ring .in b{font-family:var(--mono);font-size:var(--fs-num);font-weight:700;color:#fff}
.ws-main .ws-ring .in small{margin-top:4px;font-size:var(--fs-xs);color:var(--soft);letter-spacing:.06em}
.ws-sum{display:flex;flex-direction:column;gap:8px;min-width:0}
.ws-site{display:inline-flex;align-items:center;gap:6px;font-weight:600;color:#fff;font-size:var(--fs-m);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ws-pills{display:flex;gap:6px;flex-wrap:wrap}
.ws-pills em{display:inline-flex;align-items:center;gap:5px;font-style:normal;font-size:var(--fs-s);font-weight:600;padding:3px 9px;border-radius:99px;border:1px solid currentColor}
.ws-pills .p-rot{color:var(--red)}.ws-pills .p-gelb{color:var(--amber)}.ws-pills .p-n{color:var(--soft)}
.ws-spark{display:flex;align-items:flex-end;gap:3px;height:30px;max-width:200px}
.ws-spark i{flex:1;min-width:4px;max-width:12px;height:var(--h);border-radius:3px 3px 1px 1px;background:#5d7ca3;opacity:.9}
.ws-spark i.t-gruen{background:#3ddc97}.ws-spark i.t-gelb{background:#ffb547}.ws-spark i.t-rot{background:#ff5e73}
.ws-at{display:inline-flex;align-items:center;gap:5px;font-size:var(--fs-xs);color:var(--soft)}
.ws-areas{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;min-width:0}
.ws .ws-area{width:100%;min-width:0;display:flex;flex-direction:column;align-items:center;gap:4px;padding:10px 2px 8px;border-radius:12px;border:1px solid transparent;background:none;color:var(--text);cursor:pointer;min-height:44px}
.ws-area:hover,.ws-area:focus-visible{border-color:var(--line);background:rgba(95,212,255,.05);outline:none}
.ws-area.on{border-color:rgba(95,212,255,.45);background:rgba(95,212,255,.08);box-shadow:var(--glow)}
.ws-area .ws-ring .in{color:var(--rc)}
.ws-area>b{font-family:var(--mono);font-size:var(--fs-l);color:#fff}
.ws-area>b.t-rot{color:var(--red)}.ws-area>b.t-gelb{color:var(--amber)}.ws-area>b.t-leer{color:var(--soft)}
.ws-area>span{font-size:var(--fs-xs);color:var(--soft);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ws-funde{grid-column:1/-1;border-top:1px solid var(--line);padding-top:12px;min-width:0}
.ws-funde-h{display:flex;align-items:center;gap:8px;color:#fff;margin:0 0 8px}
.ws .ws-funde-h button{margin-left:auto;display:grid;place-items:center;width:34px;height:34px;border-radius:8px;background:none;border:1px solid var(--line);color:var(--soft);cursor:pointer}
.ws-funde ul{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
.ws-funde li{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;font-size:var(--fs-s);padding:7px 10px;border-radius:9px;background:rgba(4,14,30,.55);border-left:3px solid #5d7ca3}
.ws-funde li.l-rot{border-left-color:var(--red)}.ws-funde li.l-rot>.ico{color:var(--red)}
.ws-funde li.l-gelb{border-left-color:var(--amber)}.ws-funde li.l-gelb>.ico{color:var(--amber)}
.ws-funde li>.ico{color:var(--soft)}
.ws-funde li span{overflow-wrap:anywhere}
.ws-funde li a{font-family:var(--mono);font-size:var(--fs-xs);color:var(--cy2);max-width:160px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ws-clean{display:flex;gap:6px;align-items:center;color:var(--green);margin:0;font-size:var(--fs-m)}
.ws-ftext{display:flex;flex-direction:column;gap:2px;min-width:0}
.ws-sug{display:flex;gap:5px;align-items:center;color:var(--soft);font-size:var(--fs-s);overflow-wrap:anywhere}
.ws-sug .ico{flex:none;color:var(--cy2)}
.ws-fact{display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end}
.ws .ws-fix,.ws .ws-ign,.ws .ws-auto{display:inline-flex;align-items:center;gap:5px;min-height:34px;padding:0 10px;border-radius:8px;border:1px solid var(--line);background:none;color:var(--cy2);font-size:var(--fs-s);cursor:pointer}
.ws .ws-fix{border-color:rgba(64,200,255,.45)}
.ws .ws-ign{width:34px;padding:0;justify-content:center;color:var(--soft)}
.ws .ws-fix:disabled,.ws .ws-ign:disabled,.ws .ws-auto:disabled{opacity:.55;cursor:wait}
.ws .ws-auto{color:var(--soft);align-self:flex-start}
.ws .ws-auto.on{color:var(--green);border-color:rgba(60,200,140,.45)}
.ws-fst{font-style:normal;font-size:var(--fs-xs);padding:3px 8px;border-radius:999px;background:rgba(255,255,255,.06);color:var(--soft);white-space:nowrap}
.ws-fst.t-wait{color:var(--amber)}.ws-fst.t-work{color:var(--cy2)}.ws-fst.t-ok{color:var(--green)}.ws-fst.t-bad{color:var(--red)}
.ws-ferr{display:flex;gap:6px;align-items:center;color:var(--red);margin:0 0 8px;font-size:var(--fs-s)}
.ws-fdone{display:flex;gap:5px;align-items:center;color:var(--soft);margin:8px 0 0;font-size:var(--fs-s)}
.ws-fdone .ico{color:var(--green)}

/* Chat + Agenten */
.ws-cols{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:stretch}
/* Kästen nebeneinander oben und unten bündig (Inhaber 04.10.2026: „das muss immer sein“): .dash section-Abstand nullen, beide als Kasten */
.dash .ws-cols>*{margin:0}
.ws-cols:has(>.ws-chat:not([open])){align-items:start}
.ws-agents{padding:14px;border:1px solid var(--line);border-radius:12px;background:rgba(4,12,26,.72);box-sizing:border-box}
.ws-agents>.ws-h{min-height:22px}
.dash .ws-agents>.ws-h{font-size:var(--fs-m);letter-spacing:.12em}
.ws-chat{margin:0}
.ws-chat>summary{min-height:50px;font-size:var(--fs-m)}
.ws-chat .jc-log{max-height:min(52vh,520px);min-height:120px}
.ws-chat .jc-comp textarea{min-height:76px}
.ws-chat-empty{display:flex;flex-direction:column;align-items:flex-start;gap:6px;color:var(--soft);line-height:1.5}
.ws-chat-empty .ico{color:var(--gold)}
.ws-agents{min-width:0}
.ws-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,250px),1fr));gap:10px}
.ws-card{position:relative;display:flex;flex-direction:column;gap:8px;padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--card);min-width:0}
.ws-card.off{opacity:.62}
.ws-card-h{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center}
.ws-card-h b{color:#fff;font-size:var(--fs-m);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ws-orb{width:38px;height:38px;border-radius:50%;display:grid;place-items:center;color:var(--cy);border:1px solid rgba(95,212,255,.45);
  background:radial-gradient(circle at 50% 35%,rgba(95,212,255,.28),rgba(4,14,30,.9) 72%);box-shadow:0 0 16px -6px var(--cy)}
.ws-orb.s-work{color:var(--green);border-color:rgba(61,220,151,.55);box-shadow:0 0 18px -4px var(--green)}
.ws-orb.s-wait{color:var(--amber);border-color:rgba(255,181,71,.55)}
.ws-orb.s-bad{color:var(--red);border-color:rgba(255,94,115,.55)}
.ws-orb.s-aus{color:var(--soft);border-color:var(--line);box-shadow:none}
.ws-task{margin:0;font-size:var(--fs-s);line-height:1.45;color:var(--text);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;overflow-wrap:anywhere}
.ws-meta{display:flex;flex-wrap:wrap;gap:6px}
.ws-chip{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:99px;font-size:var(--fs-xs);font-weight:600;color:var(--soft);border:1px solid var(--line);white-space:nowrap}
.ws-chip.s-work{color:var(--green);border-color:rgba(61,220,151,.5)}.ws-chip.s-wait{color:var(--amber);border-color:rgba(255,181,71,.5)}
.ws-chip.s-bad{color:var(--red);border-color:rgba(255,94,115,.5)}.ws-chip.s-ok{color:var(--cy2)}
.ws-bar{display:block;height:4px;border-radius:99px;background:rgba(95,212,255,.12);overflow:hidden}
.ws-bar i{display:block;height:100%;background:linear-gradient(90deg,var(--cy),var(--green));border-radius:99px}
.ws-res{margin:0;display:flex;gap:6px;align-items:flex-start;font-size:var(--fs-s);color:var(--soft);border-top:1px solid var(--line);padding-top:8px}
.ws-res .ico{flex:none;margin-top:2px;color:var(--green)}
.ws-res span{min-width:0;overflow:hidden;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow-wrap:anywhere}
.ws .ws-sw{position:relative;width:44px;height:26px;border-radius:99px;border:1px solid var(--line);background:rgba(4,14,30,.8);cursor:pointer;padding:0;flex:none}
.ws-sw i{position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:var(--soft)}
.ws .ws-sw.on{background:rgba(61,220,151,.22);border-color:rgba(61,220,151,.6)}
.ws-sw.on i{left:21px;background:var(--green);box-shadow:0 0 10px var(--green)}
.ws-new{border-style:dashed;border-color:rgba(226,198,143,.45);background:rgba(4,12,26,.5)}
.ws-new.open{grid-column:1/-1;border-style:solid}
.ws .ws-add{display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;min-height:120px;width:100%;background:none;border:0;color:var(--gold2);cursor:pointer;font-size:var(--fs-m)}
.ws .ws-add:hover{background:rgba(226,198,143,.06)}
.ws-add .ws-orb{color:var(--gold);border-color:rgba(226,198,143,.5);box-shadow:0 0 16px -6px var(--gold)}
.ws-form{display:flex;flex-direction:column;gap:10px}
.ws-form label{display:flex;flex-direction:column;gap:4px;font-size:var(--fs-xs);color:var(--soft)}
.ws-form input{width:100%;box-sizing:border-box;min-height:42px;padding:8px 12px;border-radius:10px;font-size:var(--fs-m)}
.ws-tpl{display:flex;flex-wrap:wrap;gap:6px}
.ws .ws-tpl button{display:inline-flex;align-items:center;gap:5px;min-height:34px;padding:0 11px;border-radius:99px;font-size:var(--fs-s);cursor:pointer;border:1px solid var(--line);background:rgba(4,14,30,.6);color:var(--text)}
.ws-tpl button .ico{color:var(--gold)}
.ws .ws-tpl button.on{border-color:var(--gold);background:rgba(226,198,143,.14);color:#fff}
.ws-seg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;border:1px solid var(--line);border-radius:10px;overflow:hidden}
.ws .ws-seg button{min-height:40px;border:0;background:none;color:var(--soft);cursor:pointer;font-size:var(--fs-s);font-weight:600}
.ws .ws-seg button+button{border-left:1px solid var(--line)}
.ws .ws-seg button.on{background:rgba(95,212,255,.16);color:#fff}
.ws-form-f{display:flex;justify-content:flex-end;gap:8px}
.ws .ws-ghost,.ws .ws-go{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 16px;border-radius:99px;cursor:pointer;font-weight:600;font-size:var(--fs-m)}
.ws .ws-ghost{background:none;border:1px solid var(--line);color:var(--soft)}
.ws .ws-go{border:0;color:#08111f;background:linear-gradient(90deg,var(--gold),var(--gold))}
.ws .ws-go:disabled{opacity:.5;cursor:default}

@media (min-width:1100px){.ws-cols{grid-template-columns:minmax(0,1.05fr) minmax(0,1fr)}}
@media (max-width:900px){
  .ws-health{grid-template-columns:minmax(0,1fr);padding:14px;gap:14px}
}
@media (max-width:560px){
  .ws-areas{grid-template-columns:repeat(4,minmax(0,1fr));row-gap:2px}
  .ws-main{gap:12px}
  .ws-main .ws-ring{transform:scale(.86);transform-origin:left center;margin-right:-18px}
  .ws-funde li{grid-template-columns:auto minmax(0,1fr)}
  .ws-funde li a{grid-column:2;max-width:100%}
  .ws-fact{grid-column:2;justify-content:flex-start}
}
@media (prefers-reduced-motion:no-preference){
  .ws-ring .fg{animation:ws-draw 1.1s cubic-bezier(.3,.7,.2,1) both;animation-delay:var(--d,0ms)}
  .ws-areas li{animation:ws-up .5s ease both;animation-delay:var(--d,0ms)}
  .ws-areas li .ws-ring .fg{animation-delay:inherit}
  .ws-spark i{animation:ws-grow .6s ease both;animation-delay:var(--d,0ms);transform-origin:bottom}
  .ws-health::after{content:"";position:absolute;inset:0;pointer-events:none;background:linear-gradient(100deg,transparent 40%,rgba(95,212,255,.06) 50%,transparent 60%);
    background-size:250% 100%;animation:ws-scan 6s linear infinite}
  .ws-orb.s-work{animation:ws-pulse 1.8s ease-in-out infinite}
  .ws-sw i{transition:left .18s ease}
  .ws-funde{animation:ws-up .25s ease both}
}
@keyframes ws-draw{from{stroke-dashoffset:var(--c)}}
@keyframes ws-up{from{opacity:0;transform:translateY(6px)}}
@keyframes ws-grow{from{transform:scaleY(0)}}
@keyframes ws-scan{from{background-position:150% 0}to{background-position:-100% 0}}
@keyframes ws-pulse{50%{box-shadow:0 0 26px -2px var(--green)}}
`;

/**
 * Seiten-Flow im JARVIS-Stil (Farben/Leitungen wie die Fluss-Karte in hud-css.ts), eigenes Präfix wf-.
 * Seiten = abgerundete Vierecke mit fester Höhe (nebeneinander immer bündig). Handy (≤ 720 px): senkrechter Fluss,
 * Stufen als Zeilen, ohne Querscroll. Bewegung nur ohne „Bewegung reduzieren“.
 */
export const WF_CSS = `
.wf{padding-bottom:40px;max-width:var(--wmax,1240px);margin:0 auto;--box-h:118px}
.wf section{margin-top:0}
.wf-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:4px 0 12px}
.wf-head h1{margin:0;font-size:24px;letter-spacing:.12em;text-transform:uppercase;color:#fff;display:flex;align-items:center;gap:10px}
.wf-chips{display:flex;gap:6px;flex-wrap:wrap}
.wf-chips a,.wf-chips span{display:inline-flex;align-items:center;gap:6px;height:34px;padding:0 13px;border-radius:99px;border:1px solid var(--line);font-size:13px;font-weight:600;text-decoration:none;color:var(--soft)}
.wf-chips a{color:var(--cy2)!important}
.wf-chips a.on{border-color:var(--cy);background:linear-gradient(180deg,rgba(95,212,255,.22),rgba(95,212,255,.06));color:#fff!important;box-shadow:var(--glow)}
.wf-chips span.off{opacity:.5;cursor:not-allowed}
.wf-chips em{font-style:normal;font-size:11px;font-weight:600;padding:1px 6px;border-radius:99px;background:rgba(139,166,201,.16);color:var(--soft)}
.wf-err{margin:0 0 12px;padding:10px 12px;border:1px solid rgba(255,181,71,.5);border-radius:10px;background:var(--amber-bg);color:#ffd59a;font-weight:600;display:flex;gap:8px;align-items:center}

.wf-bar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin:0 0 6px}
.wf-note{display:inline-flex;align-items:center;gap:7px;height:36px;margin:0;padding:0 12px;border-radius:10px;border:1px solid rgba(226,198,143,.35);background:rgba(226,198,143,.07);color:var(--gold2);font-size:13px;font-weight:600}
.wf-acts{display:flex;gap:6px;flex-wrap:wrap}
.dash .wf-acts button{display:inline-flex;align-items:center;gap:6px;height:36px;padding:0 13px;border-radius:10px;font-size:13px;font-weight:600}
.dash .wf-acts button.on{border-color:var(--cy);color:#fff;background:rgba(95,212,255,.16)}
.dash .wf-acts .wf-save:not(:disabled){border-color:var(--gold);color:#071423;background:linear-gradient(180deg,var(--gold2),var(--gold))}
.wf-state{margin:0 0 10px;font-size:12.5px;color:var(--soft);min-height:18px}
.wf-state.t-ok{color:var(--green)}.wf-state.t-err{color:#ffb3bd}.wf-state.t-dirty{color:var(--amber)}
.wf-state span{color:var(--soft)}

.wf-board{position:relative;border:1px solid var(--line);border-radius:14px;padding:14px;
  background:radial-gradient(700px 320px at 50% 40%,rgba(40,110,190,.13),transparent 70%),rgba(4,12,26,.45)}
.wf-svg{position:absolute;inset:0;pointer-events:none;overflow:visible;z-index:1}
.wf-pipe{fill:none;stroke:rgba(95,212,255,.13);stroke-width:10;stroke-linecap:round}
.wf-core{fill:none;stroke:rgba(95,212,255,.6);stroke-width:2;stroke-linecap:round}
.wf-edge.side .wf-pipe{stroke:rgba(226,198,143,.06)}
.wf-edge.side .wf-core{stroke:rgba(226,198,143,.45);stroke-dasharray:4 6}
.wf-dot{fill:#cff4ff}

.wf-main{position:relative;display:grid;grid-template-columns:repeat(var(--n,1),minmax(0,1fr));gap:56px;align-items:stretch}
.wf-stage{display:flex;flex-direction:column;gap:8px;min-width:0}
.wf-sl{position:relative;z-index:2;align-self:flex-start;display:flex;align-items:center;gap:7px;height:22px;padding:0 8px 0 0;border-radius:7px;background:#040b18;font-size:12px;font-weight:600;letter-spacing:.06em;text-transform:uppercase;color:#6f8fb6}
.wf-sl i{display:grid;place-items:center;width:20px;height:20px;border-radius:6px;border:1px solid var(--line);font-style:normal;font-size:11px;color:var(--cy2)}
.wf-col{flex:1;display:flex;flex-direction:column;justify-content:center;align-items:center;gap:14px;border-radius:12px;min-height:var(--box-h);transition:background .15s}
.wf-row{display:flex;gap:14px;flex-wrap:wrap;align-items:stretch;border-radius:12px;min-height:var(--box-h)}
.wf-side{position:relative;display:flex;flex-direction:column;gap:8px;margin-top:40px;padding-top:12px;border-top:1px dashed rgba(226,198,143,.2)}
.wf-side .wf-node{width:210px}
.wf-empty{grid-column:1/-1;margin:20px 0;text-align:center;color:var(--soft)}

.wf-node{position:relative;z-index:2;width:100%;max-width:236px;height:var(--box-h);border-radius:14px;border:1.5px solid rgba(95,212,255,.38);
  background:linear-gradient(180deg,rgba(18,44,82,.92),rgba(6,16,34,.96));box-shadow:0 0 0 5px rgba(2,6,15,.85),0 10px 28px -12px rgba(0,0,0,.9);transition:border-color .2s,box-shadow .2s,transform .2s,opacity .2s}
.wf-node:hover{border-color:var(--cy);box-shadow:0 0 0 5px rgba(2,6,15,.85),0 0 22px rgba(95,212,255,.35)}
.wf-node.k-checkout,.wf-node.k-danke{border-color:rgba(226,198,143,.55)}
.wf-node.k-recht{border-color:rgba(226,198,143,.35)}
.wf-node.k-frei{border-style:dashed}
.wf-node.over{border-color:var(--gold);box-shadow:0 0 0 5px rgba(2,6,15,.85),0 0 26px rgba(226,198,143,.55)}
.wf-node.lift{opacity:.35}
.wf-in{display:flex;flex-direction:column;gap:3px;height:100%;padding:11px 13px;text-decoration:none;color:var(--text)!important;border-radius:inherit;min-width:0;overflow:hidden}
.wf-top{display:flex;align-items:center;gap:6px;height:22px}
.wf-ic{display:grid;place-items:center;width:22px;height:22px;border-radius:7px;background:rgba(95,212,255,.1);color:var(--cy2);flex:none}
.k-checkout .wf-ic,.k-danke .wf-ic,.k-recht .wf-ic{background:rgba(226,198,143,.12);color:var(--gold2)}
.wf-cc{font-style:normal;font-size:11px;font-weight:700;letter-spacing:.06em;padding:1px 6px;border-radius:6px;border:1px solid rgba(95,212,255,.35);color:var(--cy2)}
.wf-t{font-size:15px;font-weight:700;color:#fff;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wf-p{font-family:var(--mono);font-size:11.5px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wf-n{margin-top:auto;font-size:12px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wf-n b{font-family:var(--mono);font-size:14px;color:var(--cy2)}

.wf-tools{position:absolute;top:8px;right:8px;display:flex;gap:2px;z-index:3}
.dash .wf .wf-ib{display:grid;place-items:center;padding:0;width:28px;height:28px;border-radius:8px;border:0;background:rgba(2,8,18,.7);color:var(--soft);cursor:pointer;box-shadow:none}
.dash .wf .wf-ib:hover:not(:disabled){color:#fff;background:rgba(95,212,255,.16);box-shadow:none}
.dash .wf .wf-grip{cursor:grab;touch-action:none;color:var(--cy2)}
.dash .wf .wf-grip:active{cursor:grabbing}
.dash .wf .wf-ib.wf-x:hover:not(:disabled){color:#ffb3bd;background:rgba(255,94,115,.14)}
.wf-slot{display:grid;place-items:center;width:100%;max-width:236px;height:44px;border:1.5px dashed rgba(95,212,255,.28);border-radius:12px;font-size:12px;color:#6f8fb6;position:relative;z-index:2}
.wf-row .wf-slot{width:210px;height:var(--box-h)}
.wf-new .wf-slot{height:var(--box-h)}
.wf-slot.over,.wf-col.over,.wf-row.over{border-color:var(--gold);background:rgba(226,198,143,.07);color:var(--gold2)}
.wf-wrap.editing .wf-board{user-select:none;-webkit-user-select:none;-webkit-touch-callout:none}
.wf-wrap.dragging .wf-in{pointer-events:none}
.wf-ghost{position:fixed;z-index:60;transform:translate(-50%,-130%);display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:10px;border:1px solid var(--gold);background:rgba(12,28,54,.96);color:#fff;font-size:13px;font-weight:600;pointer-events:none;box-shadow:0 10px 30px -8px rgba(0,0,0,.9),0 0 20px rgba(226,198,143,.35);white-space:nowrap}

/* Auswahl (Einfügen / Ersetzen) */
.wf-pick{position:fixed;inset:0;z-index:70;display:grid;place-items:center;padding:16px;background:rgba(2,6,15,.72);-webkit-backdrop-filter:blur(4px);backdrop-filter:blur(4px)}
.wf-pbox{width:min(520px,100%);max-height:min(640px,calc(100vh - 32px));display:flex;flex-direction:column;gap:10px;padding:14px 16px 16px;border:1px solid rgba(226,198,143,.45);border-radius:14px;background:linear-gradient(180deg,rgba(12,28,54,.98),rgba(4,12,26,.99));box-shadow:0 20px 60px -20px rgba(0,0,0,.9)}
.wf-pbox>*{flex:none}
.wf-pbox>.wf-list{flex:1 1 auto}
.wf-pbox header{display:flex;align-items:center;justify-content:space-between;gap:10px}
.wf-pbox h2{margin:0;font-size:16px;color:#fff;letter-spacing:.04em}
.dash .wf .wf-x{display:grid;place-items:center;padding:0;width:34px;height:34px;border:0;border-radius:8px;background:none;color:var(--soft);box-shadow:none}
.dash .wf .wf-x:hover:not(:disabled){color:#fff;background:rgba(95,212,255,.1);box-shadow:none}
.wf-where{display:grid;grid-template-columns:auto minmax(0,1fr);gap:10px;align-items:center;font-size:13px;color:var(--soft)}
.dash .wf .wf-where select,.dash .wf input.wf-q,.dash .wf .wf-free input{height:38px;padding:0 10px;border-radius:9px;font-size:14px;width:100%;min-width:0;box-sizing:border-box}
.wf-list{list-style:none;margin:0;padding:0;overflow:auto;flex:1;min-height:120px;display:flex;flex-direction:column;gap:4px;scrollbar-width:thin}
.dash .wf .wf-list button{width:100%;display:grid;grid-template-columns:auto auto minmax(0,1fr) auto;gap:8px;align-items:center;text-align:left;min-height:42px;padding:6px 10px;border-radius:9px;border:1px solid transparent;background:rgba(4,14,30,.55)}
.dash .wf .wf-list button:hover:not(:disabled){border-color:var(--cy);box-shadow:none}
.wf-list b{font-size:14px;color:#fff;white-space:nowrap}
.wf-lp{font-family:var(--mono);font-size:12px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wf-none{padding:10px;color:var(--soft);font-size:13px}
.wf-free{display:grid;grid-template-columns:auto minmax(0,1fr) minmax(0,1.3fr) auto;gap:8px;align-items:center;padding-top:10px;border-top:1px solid var(--line)}
.wf-free>b{font-size:13px;color:var(--cy2)}
.dash .wf .wf-free button{display:inline-flex;align-items:center;gap:6px;height:38px;padding:0 12px;border-radius:9px;font-size:13px;font-weight:600}
.wf-perr{display:flex;gap:6px;align-items:center;margin:0;color:#ffb3bd;font-size:13px;font-weight:600}

@media (prefers-reduced-motion:reduce){.wf-dot{display:none}}

@media (max-width:1100px){
  .wf-main{gap:40px}
  .wf{--box-h:112px}
}
@media (max-width:720px){
  .wf{--box-h:96px}
  .wf-head h1{font-size:20px}
  .wf-board{padding:10px}
  .wf-main{grid-template-columns:minmax(0,1fr);gap:30px}
  .wf-col,.wf-row{flex-direction:row;flex-wrap:wrap;justify-content:center;align-items:stretch;gap:8px}
  .wf-node,.wf-side .wf-node{flex:1 1 0;min-width:96px;max-width:none;width:auto;border-radius:12px}
  .wf-in{padding:8px 8px;gap:2px}
  .wf-t{font-size:13px;letter-spacing:-.01em}.wf-p{font-size:10.5px}.wf-n{font-size:11px}.wf-n b{font-size:12.5px}
  .wf-slot,.wf-row .wf-slot,.wf-new .wf-slot{flex:1 1 100%;max-width:none;width:auto;height:40px}
  .wf-side{margin-top:30px}
  .editing .wf-in{padding-top:40px}.editing .wf-top{display:none}
  .editing{--box-h:118px}
  .wf-tools{top:6px;right:6px;left:6px}
  .wf-tools .wf-grip{margin-right:auto}
  .wf-chips{flex-wrap:nowrap;overflow-x:auto;scrollbar-width:none;max-width:100%;padding:2px 0}
  .wf-chips::-webkit-scrollbar{display:none}
  .wf-chips a,.wf-chips span{flex:none;height:32px;padding:0 11px;font-size:12.5px}
  .wf-head{flex-direction:column;align-items:stretch}
  .wf-note{width:100%;justify-content:center}
  .wf-acts{width:100%;display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
  .dash .wf-acts button{padding:0 6px;justify-content:center;font-size:12.5px;gap:4px}
  .wf-free{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .wf-free>b{grid-column:1/-1}
  .dash .wf .wf-free button{grid-column:1/-1;justify-content:center}
  .wf-pick{align-items:end;padding:0}
  .wf-pbox{width:100%;max-height:82vh;border-radius:16px 16px 0 0;padding-bottom:calc(16px + env(safe-area-inset-bottom))}
}
`;

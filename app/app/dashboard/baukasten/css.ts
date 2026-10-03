/**
 * Baukasten (Inhaber 03.10.2026: „Flows per Drag & Drop selber bauen … ich sehe die ganze Zeit Daten“).
 * Eigenes CSS im JARVIS-Stil (Token aus hud-css.ts): Knoten-Editor mit Palette, Leinwand, Prüfer-Fenster.
 * Handy: Palette und Prüfer als Blätter von unten, Leinwand volle Breite, kein seitliches Scrollen.
 * Bewegung (wandernde Punkte, Schimmer) nur ohne prefers-reduced-motion.
 */
export const BAUKASTEN_CSS = `
.bk{--bk-h:calc(100vh - 250px);position:relative;width:min(calc(100vw - 32px),1680px);margin-left:calc(50% - min(calc(50vw - 16px),840px));display:grid;gap:10px}
.bk *{box-sizing:border-box}
.bk section{margin:0}
.bk button{font-family:var(--sans);cursor:pointer}
.bk button:disabled{cursor:default;opacity:.45}
.bk-num{font-variant-numeric:tabular-nums}

/* ---------- Kopfleiste ---------- */
.bk-top{display:flex;align-items:center;gap:8px 10px;flex-wrap:wrap;padding:10px 12px;border:1px solid var(--line);border-radius:12px;background:linear-gradient(180deg,rgba(9,24,48,.78),rgba(4,12,26,.62))}
.bk-brand{display:flex;align-items:center;gap:8px;font-family:var(--hud);font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#fff;font-size:15px;text-shadow:0 0 16px rgba(95,212,255,.55)}
.bk-brand i{font-style:normal;display:grid;place-items:center;width:28px;height:28px;border-radius:8px;border:1px solid var(--cy);color:var(--cy);box-shadow:var(--glow);font-size:15px}
.bk-name{flex:1 1 170px;min-width:0;max-width:300px;padding:7px 10px;border-radius:8px;font:600 15px var(--sans);border:1px solid rgba(95,212,255,.28)}
.bk-dirty{display:inline-flex;align-items:center;gap:6px;font-size:12.5px;font-weight:600;color:#ffb547;white-space:nowrap}
.bk-dirty:before{content:"";width:8px;height:8px;border-radius:50%;background:#ffb547;box-shadow:0 0 8px #ffb547}
.bk-saved{font-size:12.5px;color:var(--soft);white-space:nowrap}
.bk-chip{display:inline-flex;align-items:center;gap:6px;padding:4px 10px;border-radius:999px;font-size:12.5px;font-weight:700;border:1px solid var(--line);color:#a9c3e3;white-space:nowrap}
.bk-chip:before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.bk-chip.on{color:#3ddc97;border-color:rgba(61,220,151,.55);background:rgba(61,220,151,.1);box-shadow:0 0 14px -4px rgba(61,220,151,.7)}
.bk-chip.aus{color:#8ba6c9}
.bk-sp{flex:1}
.bk-sel{padding:7px 9px;border-radius:8px;font:600 13px var(--sans);max-width:150px}
.bk-seg{display:inline-flex;border:1px solid rgba(95,212,255,.28);border-radius:8px;overflow:hidden}
.bk-seg button{border:0;border-radius:0;padding:6px 10px;font:600 12.5px var(--sans);background:rgba(4,14,30,.8);color:#a9c3e3}
.bk-seg button+button{border-left:1px solid rgba(95,212,255,.2)}
.bk-seg button.on{background:linear-gradient(180deg,rgba(95,212,255,.35),rgba(95,212,255,.12));color:#fff}
.bk-seg em{font-style:normal;align-self:center;padding:0 8px;font-size:11.5px;color:var(--soft)}
.bk-btn{display:inline-flex;align-items:center;gap:6px;padding:7px 12px;border-radius:8px;font:600 13px var(--sans);border:1px solid rgba(95,212,255,.28);background:rgba(4,14,30,.8);color:var(--text);text-decoration:none;white-space:nowrap}
.bk-btn.go{border:0;color:#02060f;background:linear-gradient(180deg,#a8ecff,#5fd4ff);box-shadow:0 0 18px rgba(95,212,255,.45);font-weight:700}
.bk-btn.go:disabled{background:rgba(95,212,255,.12);color:#6e8db3;box-shadow:none;opacity:1}
.bk-btn.gold{border:0;color:#02060f;background:linear-gradient(180deg,#f2dcae,#e2c68f);box-shadow:0 0 18px rgba(226,198,143,.4);font-weight:700}
.bk-btn.green{border:0;color:#02060f;background:linear-gradient(180deg,#8ff0c4,#3ddc97);box-shadow:0 0 18px rgba(61,220,151,.4);font-weight:700}
.bk-undo{padding:6px 11px;font-size:16px}
.bk-btn.red{border-color:rgba(255,94,115,.55);color:#ffb3bd}
.bk-btn.dot{position:relative}
.bk-btn.dot:after{content:"";position:absolute;top:-3px;right:-3px;width:9px;height:9px;border-radius:50%;background:#ffb547;box-shadow:0 0 8px #ffb547}
.bk-prob{position:relative}
.bk-pb{display:inline-flex;align-items:center;gap:6px;padding:6px 10px;border-radius:8px;font:700 12.5px var(--sans);border:1px solid var(--line);background:rgba(4,14,30,.8);color:#a9c3e3}
.bk-pb b{display:inline-grid;place-items:center;min-width:20px;height:20px;padding:0 5px;border-radius:999px;font-size:11.5px;color:#02060f}
.bk-pb b.e{background:#ff5e73}.bk-pb b.w{background:#ffb547}.bk-pb b.ok{background:#3ddc97}
.bk-pop{position:absolute;right:0;top:calc(100% + 6px);z-index:60;width:min(360px,calc(100vw - 24px));max-height:320px;overflow:auto;padding:8px;border:1px solid var(--line);border-radius:12px;background:#07101f;box-shadow:0 18px 40px rgba(0,0,0,.6);display:grid;gap:4px}
.bk-msg{font-size:13px;font-weight:600;padding:6px 10px;border-radius:8px}
.bk-msg.good{color:#3ddc97;background:rgba(61,220,151,.1)}.bk-msg.bad{color:#ffb3bd;background:rgba(255,94,115,.12)}

/* Problemliste */
.bk-pl{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.bk-pl button{width:100%;display:grid;grid-template-columns:10px 1fr;gap:8px;align-items:start;text-align:left;padding:6px 8px;border-radius:8px;border:1px solid transparent;background:transparent;color:#cfe3f7;font-size:13px;line-height:1.35}
.bk-pl button:hover{border-color:var(--line);background:rgba(95,212,255,.06)}
.bk-pl i{width:8px;height:8px;margin-top:5px;border-radius:50%;background:#ffb547}.bk-pl .error i{background:#ff5e73;box-shadow:0 0 6px #ff5e73}
.bk-pl em{font-style:normal;color:var(--soft)}

/* ---------- Arbeitsfläche ---------- */
.bk-main{display:grid;grid-template-columns:172px minmax(0,1fr) 352px;gap:10px;height:max(560px,var(--bk-h))}
.bk-pal,.bk-ins{min-height:0;overflow:auto;scrollbar-width:thin;border:1px solid var(--line);border-radius:12px;background:linear-gradient(180deg,rgba(9,24,48,.7),rgba(4,12,26,.55))}
.bk-pal{padding:10px 8px;display:grid;align-content:start;gap:12px}
.bk-pal h4,.bk-ins h4{margin:0 0 6px;font-family:var(--hud);font-size:12px;font-weight:600;letter-spacing:.16em;text-transform:uppercase;color:var(--cy2)}
.bk-pal ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.bk-tile{width:100%;display:grid;grid-template-columns:30px 1fr;grid-template-areas:"i l" "i h";gap:0 8px;align-items:center;text-align:left;padding:7px 8px;border-radius:10px;border:1px solid color-mix(in srgb,var(--nc) 28%,transparent);background:rgba(2,8,18,.55);color:var(--text);cursor:grab;transition:border-color .15s,transform .15s,box-shadow .15s;user-select:none;-webkit-user-select:none;touch-action:manipulation}
.bk-tile:hover:not(:disabled){border-color:var(--nc);transform:translateX(2px);box-shadow:0 0 16px -6px var(--nc)}
.bk-tile:active{cursor:grabbing}
.bk-tile i{grid-area:i;font-style:normal;display:grid;place-items:center;width:30px;height:30px;border-radius:8px;background:color-mix(in srgb,var(--nc) 16%,transparent);color:var(--nc);font-size:16px;text-shadow:0 0 10px var(--nc)}
.bk-tile b{grid-area:l;font-size:13.5px;font-weight:700;color:#fff}
.bk-tile span{grid-area:h;font-size:11.5px;color:var(--soft);line-height:1.25}
.bk-pal p{margin:0;font-size:11.5px;color:#6e8db3;line-height:1.4}

.bk-cv{position:relative;min-width:0;min-height:0;border:1px solid rgba(95,212,255,.22);border-radius:12px;overflow:hidden;
  background:radial-gradient(800px 420px at 50% 40%,rgba(40,110,190,.14),transparent 70%),rgba(2,8,18,.72);box-shadow:inset 0 0 60px rgba(0,0,0,.5)}
.bk-cv .react-flow{--xy-background-color:transparent;--xy-edge-label-background-color:transparent;background:transparent!important}
.bk-cv.over{border-color:var(--gold);box-shadow:inset 0 0 0 2px rgba(226,198,143,.35),inset 0 0 60px rgba(0,0,0,.5)}
.bk-cn{position:absolute;width:16px;height:16px;border:2px solid var(--cy);opacity:.7;pointer-events:none;z-index:5}
.bk-cn.tl{top:6px;left:6px;border-right:0;border-bottom:0}.bk-cn.tr{top:6px;right:6px;border-left:0;border-bottom:0}
.bk-cn.bl{bottom:6px;left:6px;border-right:0;border-top:0}.bk-cn.br{bottom:6px;right:6px;border-left:0;border-top:0}
.bk-hud{position:absolute;left:12px;top:10px;z-index:5;display:flex;gap:8px;align-items:center;flex-wrap:wrap;pointer-events:none;font-size:12px;color:var(--soft)}
.bk-hud b{color:#fff;font-weight:700}
.bk-hud .ld{color:var(--cy2)}
.bk-hud .er{color:#ffb3bd;pointer-events:auto}
.bk-fab{display:none}
.bk-empty{position:absolute;inset:0;display:grid;place-items:center;pointer-events:none;z-index:4;color:#4d6b91;font-size:14px;text-align:center}

/* React-Flow-Bedienelemente im HUD-Stil */
.bk .react-flow__controls{display:flex;flex-direction:column;gap:4px;box-shadow:none}
.bk .react-flow__controls-button{width:32px;height:32px;padding:7px;border-radius:8px;border:1px solid rgba(95,212,255,.3);background:rgba(4,14,30,.9);color:var(--cy2);fill:var(--cy2);display:grid;place-items:center}
.bk .react-flow__controls-button svg{width:14px;height:14px;fill:currentColor;max-width:14px;max-height:14px}
.bk .react-flow__controls-button:hover{border-color:var(--cy);box-shadow:var(--glow)}
.bk .react-flow__minimap{background:rgba(2,8,18,.9);border:1px solid var(--line);border-radius:10px;overflow:hidden}
.bk .react-flow__minimap-mask{fill:rgba(2,6,15,.72)}
.bk .react-flow__attribution{background:transparent;font-size:9px;opacity:.45}.bk .react-flow__attribution a{color:#6e8db3}
.bk .react-flow__selection{background:rgba(95,212,255,.08);border:1px dashed var(--cy)}
.bk .react-flow__connectionline path,.bk .react-flow__connection-path{stroke:var(--gold);stroke-width:2.5;stroke-dasharray:6 5}

/* ---------- Baustein-Karte ---------- */
.bkn{position:relative;width:240px;padding:10px 12px 11px;border-radius:12px;font-family:var(--sans);color:var(--text);
  background:linear-gradient(180deg,rgba(15,36,68,.97),rgba(5,14,30,.97));border:1px solid color-mix(in srgb,var(--nc) 42%,transparent);
  box-shadow:0 0 0 1px rgba(2,6,15,.6),0 16px 36px -16px rgba(0,0,0,.95),inset 0 1px 0 rgba(255,255,255,.05);transition:border-color .15s,box-shadow .15s}
.bkn:before{content:"";position:absolute;left:14px;right:14px;top:-1px;height:2px;border-radius:2px;background:var(--nc);box-shadow:0 0 14px var(--nc)}
.bkn:hover{border-color:color-mix(in srgb,var(--nc) 75%,transparent)}
.bkn.sel{border-color:var(--gold);box-shadow:0 0 0 1px var(--gold),0 0 30px -6px rgba(226,198,143,.7),0 16px 36px -16px rgba(0,0,0,.95)}
.bkn.off{border-style:dashed;opacity:.7}
.bkn.has-e{border-color:rgba(255,94,115,.7)}
.bkn header{display:flex;align-items:center;gap:8px;min-width:0}
.bkn-ic{flex:none;display:grid;place-items:center;width:28px;height:28px;border-radius:8px;background:color-mix(in srgb,var(--nc) 18%,transparent);color:var(--nc);font-size:16px;text-shadow:0 0 10px var(--nc)}
.bkn-t{flex:1;min-width:0;display:grid}
.bkn-t b{font-size:14px;font-weight:700;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bkn-t small{font-size:10.5px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:color-mix(in srgb,var(--nc) 75%,#8ba6c9)}
.bkn-x{flex:none;width:24px;height:24px;padding:0;border-radius:50%;border:1px solid var(--line);background:rgba(2,8,18,.8);color:#8ba6c9;font-size:11px;line-height:1;opacity:0;transition:opacity .15s}
.bkn:hover .bkn-x,.bkn.sel .bkn-x{opacity:1}
.bkn-x:hover{border-color:#ff5e73!important;color:#ff5e73;box-shadow:0 0 10px rgba(255,94,115,.5)!important}
.bkn-badges{display:flex;gap:3px}
.bkn-badge{display:grid;place-items:center;min-width:18px;height:18px;padding:0 4px;border-radius:999px;font-size:10.5px;font-weight:800;color:#02060f}
.bkn-badge.e{background:#ff5e73;box-shadow:0 0 10px rgba(255,94,115,.7)}.bkn-badge.w{background:#ffb547}
.bkn-d{margin:6px 0 0;font-size:12px;line-height:1.35;color:#9db6d6;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden;min-height:2.7em}
.bkn-v{display:flex;align-items:baseline;gap:8px;margin-top:6px}
.bkn-v b{font-size:28px;font-weight:700;line-height:1.05;color:#fff;font-variant-numeric:tabular-nums;text-shadow:0 0 16px color-mix(in srgb,var(--nc) 60%,transparent)}
.bkn-v span{font-size:12px;color:var(--soft)}
.bkn-v span{white-space:nowrap}
.bkn-v em{margin-left:auto;white-space:nowrap;font-style:normal;font-size:13px;font-weight:700;color:var(--nc);font-variant-numeric:tabular-nums}
.bkn-bar{position:relative;height:5px;margin-top:6px;border-radius:3px;background:rgba(95,212,255,.1);overflow:hidden}
.bkn-bar i{position:absolute;left:0;top:0;bottom:0;border-radius:3px;background:var(--nc);box-shadow:0 0 8px var(--nc);transition:width .3s}
.bkn-io{display:flex;justify-content:space-between;margin-top:4px;font-size:11.5px;color:#7f9bbd;font-variant-numeric:tabular-nums}
.bkn-sub{margin-top:4px;font-size:11.5px;color:var(--soft)}
.bkn-sub b{color:var(--cy2)}
.bkn-st{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:3px}
.bkn-st li{display:grid;grid-template-columns:78px 1fr 40px;gap:6px;align-items:center;font-size:11px}
.bkn-st span{color:#a9c3e3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bkn-st i{height:6px;border-radius:3px;background:rgba(95,212,255,.1);overflow:hidden}.bkn-st i i{display:block;height:100%;background:var(--nc);box-shadow:0 0 6px var(--nc)}
.bkn-st b{text-align:right;color:#fff;font-variant-numeric:tabular-nums}
.bkn-ports{display:grid;gap:4px;margin:8px -12px 0 0}
.bkn-port{position:relative;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:5px 20px 5px 8px;border-radius:8px 0 0 8px;font-size:12.5px;font-weight:700;background:linear-gradient(90deg,transparent,color-mix(in srgb,var(--pc) 14%,transparent))}
.bkn-port span{color:var(--pc);letter-spacing:.06em;text-transform:uppercase;font-size:11px}
.bkn-port b{color:#fff;font-variant-numeric:tabular-nums}
.bkn-port.ja{--pc:#3ddc97}.bkn-port.nein{--pc:#ff8a5c}
.bkn.k-quelle .bkn-v b{font-size:30px}
.bkn.load .bkn-v b{background:linear-gradient(90deg,#5d7ca3 20%,#e6faff 50%,#5d7ca3 80%);background-size:200% 100%;-webkit-background-clip:text;background-clip:text;color:transparent}
.bkn.load:after{content:"";position:absolute;inset:0;border-radius:12px;pointer-events:none;background:linear-gradient(100deg,transparent 30%,rgba(95,212,255,.14) 50%,transparent 70%);background-size:220% 100%}
.bkn.sink{border-radius:12px 22px 22px 12px}
.bkn.k-pipeline.live{border-color:#3ddc97;box-shadow:0 0 0 1px rgba(61,220,151,.6),0 0 30px -6px rgba(61,220,151,.7)}
.bkn-live{display:inline-flex;align-items:center;gap:5px;margin-top:6px;font-size:11.5px;font-weight:700;color:#3ddc97}
.bkn-live:before{content:"";width:7px;height:7px;border-radius:50%;background:#3ddc97;box-shadow:0 0 8px #3ddc97}

/* Anschlüsse */
.bk .react-flow__handle{width:14px;height:14px;border-radius:50%;background:#02060f;border:2px solid var(--hc,var(--nc));box-shadow:0 0 10px color-mix(in srgb,var(--hc,var(--nc)) 70%,transparent);transition:transform .12s,background .12s}
.bk .react-flow__handle:hover,.bk .react-flow__handle.connectingto{background:var(--hc,var(--nc));transform:translate(-50%,-50%) scale(1.25)}
.bk .react-flow__handle-right:hover{transform:translate(50%,-50%) scale(1.25)}
.bk .react-flow__handle.ja{--hc:#3ddc97}.bk .react-flow__handle.nein{--hc:#ff8a5c}
.bk .react-flow__handle.in{--hc:#8ba6c9}
.bk .react-flow__handle.valid{background:var(--gold);border-color:var(--gold)}

/* Verbindungen */
.bke-pipe{fill:none;stroke:color-mix(in srgb,var(--ec) 16%,transparent);stroke-width:10;stroke-linecap:round}
.bk .react-flow__edge-path.bke-core{stroke:var(--ec);stroke-width:2.2}
.bk .react-flow__edge.selected .bke-core{stroke:var(--gold)}
.bk .react-flow__edge.selected .bke-pipe{stroke:rgba(226,198,143,.25)}
.bke-zero .bke-core{stroke-dasharray:5 6;opacity:.55}
.bke-dot{fill:#e9fbff}
.bke-halo{fill:var(--ec);opacity:.35}
.bke-l{position:absolute;display:flex;align-items:center;gap:4px;pointer-events:all;padding:2px 4px 2px 9px;border-radius:999px;font:700 12px var(--sans);font-variant-numeric:tabular-nums;color:#fff;
  background:#06101f;border:1px solid color-mix(in srgb,var(--ec) 60%,transparent);box-shadow:0 0 12px -2px color-mix(in srgb,var(--ec) 60%,transparent)}
.bke-l.nox{padding-right:9px}
.bke-l.zero{color:#6e8db3}
.bke-l button{width:20px;height:20px;padding:0;border-radius:50%;border:1px solid rgba(255,94,115,.5);background:transparent;color:#ff8a9a;font-size:10px;line-height:1}
.bke-l button:hover{background:rgba(255,94,115,.2)}

/* ---------- Prüfer (rechts) ---------- */
.bk-ins{padding:12px;display:grid;align-content:start;gap:14px}
.bk-ins>header{display:flex;align-items:center;gap:10px}
.bk-ins>header .bkn-ic{width:34px;height:34px;font-size:19px}
.bk-ins>header div{flex:1;min-width:0}
.bk-ins>header small{display:block;font-size:10.5px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--nc)}
.bk-ins>header input{width:100%;padding:5px 8px;border-radius:7px;font:700 15px var(--sans);background:rgba(2,8,18,.5);border:1px solid transparent}
.bk-ins>header input:hover,.bk-ins>header input:focus{border-color:rgba(95,212,255,.35)}
.bk-x{width:30px;height:30px;padding:0;border-radius:50%;border:1px solid var(--line);background:rgba(2,8,18,.7);color:#a9c3e3;font-size:12px}
.bk-del{color:#ff8a9a;border-color:rgba(255,94,115,.4)}
.bk-hint{margin:0;font-size:12.5px;color:var(--soft);line-height:1.4}
.bk-bigs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px}
.bk-bigs div{padding:8px 6px;border:1px solid var(--line);border-radius:10px;background:rgba(2,8,18,.5);text-align:center;min-width:0}
.bk-bigs b{display:block;font-size:19px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bk-bigs span{font-size:11.5px;color:var(--soft)}
.bk-bigs .hi b{color:var(--nc);text-shadow:0 0 14px color-mix(in srgb,var(--nc) 60%,transparent)}
.bk-sec{display:grid;gap:8px}
.bk-sec>header{display:flex;align-items:center;justify-content:space-between;gap:8px}
.bk-sec>header h4{margin:0}
.bk-f{display:grid;gap:4px}
.bk-f>span{font-size:12px;font-weight:600;color:#9db6d6}
.bk-f input,.bk-f select,.bk-in{width:100%;padding:7px 9px;border-radius:8px;font:500 14px var(--sans)}
.bk-row{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.bk-row>input{flex:1;min-width:70px}
.bk-chips{display:flex;flex-wrap:wrap;gap:5px}
.bk-c{display:inline-flex;align-items:center;gap:5px;padding:4px 9px;border-radius:999px;border:1px solid var(--line);background:rgba(2,8,18,.55);color:#a9c3e3;font:600 12.5px var(--sans)}
.bk-c em{font-style:normal;font-size:11px;color:#6e8db3;font-variant-numeric:tabular-nums}
.bk-c.on{border-color:var(--cy);background:rgba(95,212,255,.18);color:#fff;box-shadow:0 0 12px -3px rgba(95,212,255,.7)}
.bk-c.on em{color:var(--cy2)}
.bk-c.ja.on{border-color:#3ddc97;background:rgba(61,220,151,.16)}.bk-c.nein.on{border-color:#ff8a5c;background:rgba(255,138,92,.16)}
.bk-cond{position:relative;display:grid;gap:6px;padding:9px 9px 9px 12px;border:1px solid var(--line);border-radius:10px;background:rgba(2,8,18,.5)}
.bk-cond:before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:3px;border-radius:2px;background:var(--nc)}
.bk-cond.bad{border-color:rgba(255,94,115,.5)}.bk-cond.bad:before{background:#ff5e73}
.bk-cond-h{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:6px;align-items:center}
.bk-cond-h select{padding:6px 7px;border-radius:7px;font:600 13px var(--sans);min-width:0}
.bk-hit{font-size:11.5px;font-weight:700;color:var(--cy2);font-variant-numeric:tabular-nums;white-space:nowrap}
.bk-err{margin:0;font-size:12px;font-weight:600;color:#ff8a9a}
.bk-andor{display:flex;align-items:center;gap:8px;font-size:12px;color:var(--soft)}
.bk-pts{display:grid;grid-template-columns:auto 64px;gap:6px;align-items:center}
.bk-pts input{padding:6px 7px;border-radius:7px;text-align:center;font:700 14px var(--sans)}
.bk-addc{justify-self:start;padding:6px 12px;border-radius:8px;border:1px dashed rgba(95,212,255,.45);background:transparent;color:var(--cy2);font:600 13px var(--sans)}
.bk-rows{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.bk-rows li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 8px;padding:6px 8px;border:1px solid rgba(95,212,255,.1);border-radius:8px;background:rgba(2,8,18,.45)}
.bk-rows b{font-size:13px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bk-rows span{font-size:11.5px;color:#9db6d6;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bk-rows em{grid-row:1/3;grid-column:2;align-self:center;display:flex;gap:3px;font-style:normal}
.bk-rows em i{font-style:normal;display:grid;place-items:center;min-width:22px;height:18px;padding:0 3px;border-radius:5px;font-size:10px;font-weight:800;background:rgba(95,212,255,.1);color:#5d7ca3}
.bk-rows em i.y{background:rgba(61,220,151,.18);color:#3ddc97}
.bk-rows .none{display:block;color:var(--soft);font-size:12.5px}
.bk-bars{list-style:none;margin:0;padding:0;display:grid;gap:5px}
.bk-bars li{display:grid;grid-template-columns:minmax(0,104px) 1fr 70px;gap:8px;align-items:center;font-size:12.5px}
.bk-bars span{color:#cfe3f7;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.bk-bars i{height:9px;border-radius:5px;background:rgba(95,212,255,.08);overflow:hidden}.bk-bars i i{display:block;height:100%;border-radius:5px;background:var(--nc,var(--cy));box-shadow:0 0 8px color-mix(in srgb,var(--nc,var(--cy)) 60%,transparent)}
.bk-bars b{text-align:right;color:#fff;font-variant-numeric:tabular-nums;font-weight:600}
.bk-bars b small{color:var(--soft);font-weight:500;margin-left:4px}
.bk-act{display:grid;gap:8px;padding:10px;border:1px solid rgba(61,220,151,.35);border-radius:12px;background:linear-gradient(180deg,rgba(61,220,151,.08),rgba(2,8,18,.4))}
.bk-act.warn{border-color:rgba(255,181,71,.45);background:linear-gradient(180deg,rgba(255,181,71,.08),rgba(2,8,18,.4))}
.bk-act p{margin:0;font-size:13px;line-height:1.45;color:#cfe3f7}
.bk-act p b{color:#fff;font-variant-numeric:tabular-nums}
.bk-meter{height:10px;border-radius:5px;background:rgba(61,220,151,.25);overflow:hidden;display:flex}
.bk-meter i{display:block;height:100%;background:#ff5e73;box-shadow:0 0 8px rgba(255,94,115,.6)}
.bk-tabs{display:inline-flex;gap:4px}
.bk-howto{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.bk-howto li{display:grid;grid-template-columns:28px 1fr;gap:8px;align-items:center;font-size:13px;color:#cfe3f7}
.bk-howto i{font-style:normal;display:grid;place-items:center;width:28px;height:28px;border-radius:8px;border:1px solid var(--line);color:var(--cy2)}
.bk-ov{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.bk-ov button{width:100%;display:grid;grid-template-columns:24px 1fr auto;gap:8px;align-items:center;padding:6px 8px;border-radius:8px;border:1px solid rgba(95,212,255,.1);background:rgba(2,8,18,.45);color:var(--text);text-align:left;font-size:13px}
.bk-ov button:hover{border-color:var(--cy)}
.bk-ov i{font-style:normal;color:var(--nc);text-align:center}
.bk-ov b{font-variant-numeric:tabular-nums}
.bk-lock{margin:0;font-size:12.5px;color:var(--soft)}
.bk-shade{display:none}
.bk-sheet-h{display:none}

@media (prefers-reduced-motion:no-preference){
  .bkn.load .bkn-v b{animation:bk-shim 1.2s linear infinite}
  .bkn.load:after{animation:bk-shim 1.4s linear infinite}
  .bk-chip.on:before{animation:jv-blink 1.6s ease-in-out infinite}
  .bkn-live:before{animation:jv-blink 1.6s ease-in-out infinite}
  .bk-ins{animation:bk-in .2s ease-out both}
}
@media (prefers-reduced-motion:reduce){.bke-dot,.bke-halo{display:none}}
@keyframes bk-shim{from{background-position:120% 0}to{background-position:-120% 0}}
@keyframes bk-in{from{opacity:.4;transform:translateX(8px)}}

@media (max-width:1180px){
  .bk-main{grid-template-columns:150px minmax(0,1fr) 320px}
  .bk-tile{grid-template-columns:26px 1fr;padding:6px}.bk-tile span{display:none}.bk-tile i{width:26px;height:26px}
}
@media (max-width:900px){
  .bk{width:auto;margin-left:0}
  .bk-main{grid-template-columns:minmax(0,1fr);height:auto}
  .bk-cv{height:max(440px,calc(100vh - 290px))}
  .bk-pal{display:none}
  .bk-pal.open{display:grid;position:fixed;left:0;right:0;bottom:0;z-index:48;max-height:72vh;border-radius:16px 16px 0 0;padding:12px 12px calc(16px + env(safe-area-inset-bottom));background:#06101f;border-color:rgba(226,198,143,.45);grid-template-columns:minmax(0,1fr)}
  .bk-pal.open ul{grid-template-columns:repeat(2,minmax(0,1fr))}
  .bk-pal.open .bk-tile span{display:block}
  .bk-ins{display:none}
  .bk-ins.open{display:grid;position:fixed;left:0;right:0;bottom:0;z-index:48;max-height:74vh;border-radius:16px 16px 0 0;padding:12px 12px calc(18px + env(safe-area-inset-bottom));background:#06101f;border-color:rgba(226,198,143,.45)}
  .bk-shade.open{display:block;position:fixed;inset:0;z-index:47;background:rgba(2,6,15,.55)}
  .bk-sheet-h{display:flex;align-items:center;justify-content:space-between}
  .bk-sheet-h:before{content:"";position:absolute;left:50%;top:5px;width:44px;height:4px;margin-left:-22px;border-radius:2px;background:rgba(139,166,201,.4)}
  .bk-fab{display:flex;position:absolute;left:10px;right:10px;top:34px;z-index:6;justify-content:space-between;gap:8px;pointer-events:none}
  .bk-fab>*{pointer-events:auto}
  .bk-add{display:inline-flex;align-items:center;gap:6px;padding:9px 16px;border-radius:999px;border:0;font:700 14px var(--sans);color:#02060f;background:linear-gradient(180deg,#f2dcae,#e2c68f);box-shadow:0 0 20px rgba(226,198,143,.55)}
  .bk .react-flow__controls{display:none}
}
@media (min-width:901px){.bk-fab{display:none}}
@media (max-width:600px){
  .bk-top{padding:8px}
  .bk-brand span{display:none}
  .bk-name{flex:1 1 150px;max-width:none}
  .bk-top .bk-sp{display:none}
  .bk-sel{max-width:none;flex:1 1 140px}
  .bk-pb .t{display:none}
  .bk-top .bk-btn.go{margin-left:auto}
  .bk-cv{height:max(380px,calc(100svh - 230px))}
  .bk-bigs b{font-size:18px}
  .bk-bars li{grid-template-columns:minmax(0,88px) 1fr 62px}
}
@media (pointer:coarse){.bk .react-flow__handle{width:20px;height:20px}.bkn-x{opacity:1}}
`;

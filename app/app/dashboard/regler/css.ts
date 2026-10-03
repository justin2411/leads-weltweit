/** Regler (Inhaber 03.10.2026): Maschinen-Karten mit großen Schaltern, Status-Leiste, feste Übernehmen-Leiste. HUD-Farben aus hud-css.ts. */
export const REGLER_CSS = `
.rg{--ok:#3ddc97;--wait:#ffb547;--now:#e2c68f;padding-bottom:40px}
.rg-head{display:flex;align-items:flex-end;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:4px 0 16px}
.rg-head h1{margin:0;font-size:26px;letter-spacing:.12em;color:#fff;text-transform:uppercase;text-shadow:0 0 22px rgba(95,212,255,.5)}
.rg-steps{display:flex;gap:6px;align-items:center;font-size:13px;color:var(--soft);flex-wrap:wrap}
.rg-steps b{display:inline-grid;place-items:center;width:20px;height:20px;border-radius:50%;border:1px solid var(--line);font-size:11px;color:var(--cy2);margin-right:4px}
.rg-steps i{font-style:normal;color:#3d5677}
.rg-err{margin:0 0 14px;padding:10px 14px;border:1px solid rgba(255,94,115,.5);border-radius:10px;background:rgba(255,94,115,.12);color:#ffb3bd;font-weight:600}
.rg-grid{display:grid;grid-template-columns:minmax(0,1fr);gap:14px;align-items:start}
@media (min-width:1100px){.rg-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}

.rg-card{position:relative;display:grid;gap:14px;padding:16px 16px 14px;border:1px solid var(--line);border-radius:14px;background:linear-gradient(180deg,rgba(9,24,48,.72),rgba(4,12,26,.55));transition:border-color .2s,box-shadow .2s}
.rg-card.dirty{border-color:rgba(226,198,143,.7);box-shadow:0 0 0 1px rgba(226,198,143,.25),0 0 26px -8px rgba(226,198,143,.5)}
.rg-card.off .rg-knobs{opacity:.5}
.rg-h{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:12px;align-items:center}
.rg-ic{width:48px;height:48px;border-radius:50%;display:grid;place-items:center;font-size:22px;background:radial-gradient(circle at 50% 35%,#1d4a7a,#06101f 70%);border:1px solid rgba(95,212,255,.35)}
.rg-card.off .rg-ic{filter:grayscale(1);opacity:.6}
.rg-h h2{margin:0;font-family:var(--sans);font-size:18px;font-weight:700;letter-spacing:0;color:#fff}
.rg-eff{display:block;margin-top:2px;font-size:13.5px;color:var(--cy2);font-variant-numeric:tabular-nums;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rg-eff.bad{color:var(--wait)}.rg-eff.off{color:var(--soft)}

.rg-sw{position:relative;display:inline-flex;align-items:center;gap:10px;padding:0;border:0!important;background:none!important;box-shadow:none!important;cursor:pointer;color:var(--text);font:700 14px var(--sans)}
.rg-sw .tr{position:relative;width:62px;height:34px;border-radius:99px;background:rgba(139,166,201,.25);border:1px solid rgba(139,166,201,.35);transition:background .2s,border-color .2s}
.rg-sw .tr:after{content:"";position:absolute;top:3px;left:3px;width:26px;height:26px;border-radius:50%;background:#cfdcec;box-shadow:0 2px 6px rgba(0,0,0,.4);transition:left .2s,background .2s}
.rg-sw[aria-checked=true] .tr{background:rgba(61,220,151,.35);border-color:var(--ok)}
.rg-sw[aria-checked=true] .tr:after{left:31px;background:#fff;box-shadow:0 0 12px rgba(61,220,151,.8)}
.rg-sw .lb{min-width:26px;text-align:left;color:var(--soft)}.rg-sw[aria-checked=true] .lb{color:var(--ok)}
.rg-sw:focus-visible{outline:2px solid var(--gold);outline-offset:4px;border-radius:99px}
.rg-sw:disabled{cursor:default;opacity:.5}

.rg-knobs{display:grid;gap:12px}
.rg-k{display:grid;grid-template-columns:96px minmax(0,1fr);gap:10px;align-items:center}
.rg-k>span{font-size:13px;font-weight:600;color:var(--soft)}
.rg-k.dim{opacity:.55}
.rg-k .rg-note{grid-column:2;margin:-4px 0 0;font-size:12px;color:var(--soft)}
.rg-st{display:inline-grid;grid-template-columns:44px minmax(74px,auto) 44px;align-items:center;gap:6px}
.rg-st button{height:44px;width:44px;padding:0;border-radius:10px;font-size:24px;line-height:1;color:var(--cy);cursor:pointer;border:1px solid rgba(95,212,255,.35)}
.rg-st button:disabled{opacity:.3;cursor:default}
.rg-st output{text-align:center;font-size:28px;font-weight:700;color:#fff;line-height:1;text-shadow:0 0 14px rgba(95,212,255,.45);white-space:nowrap}
.rg-st output small{font-size:13px;font-weight:600;color:var(--soft);margin-left:3px;text-shadow:none}
.rg-st.chg output{color:var(--gold2);text-shadow:0 0 14px rgba(226,198,143,.5)}
.rg-row{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap}
.rg-chips{display:flex;flex-wrap:wrap;gap:6px}
.rg-chip{min-height:38px;padding:0 14px;border-radius:999px;font:600 14px var(--sans);cursor:pointer;color:#a9c3e3;background:rgba(2,8,18,.5);border:1px solid var(--line)}
.rg-chip[aria-pressed=true]{color:#fff;border-color:var(--cy);background:rgba(95,212,255,.18);box-shadow:0 0 12px -2px rgba(95,212,255,.6)}
.rg-chip.pre{min-height:32px;padding:0 12px;font-size:13px}
.rg-chip.pre[aria-pressed=true]{border-color:var(--gold);background:rgba(226,198,143,.16);box-shadow:none}
.rg-chip small{font-weight:500;color:var(--soft);margin-left:5px}
.rg-pages{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.rg-page{display:grid;gap:4px;justify-items:center;padding:8px 6px 6px;border:1px solid var(--line);border-radius:10px;background:rgba(2,8,18,.4)}
.rg-page>div:first-child{display:flex;gap:8px;align-items:baseline}
.rg-page b{font-size:14px;color:var(--cy2)}
.rg-page em{font-style:normal;font-size:12px;color:var(--soft);font-variant-numeric:tabular-nums}
.rg-page .rg-st{grid-template-columns:40px minmax(54px,auto) 40px}.rg-page .rg-st button{width:40px;height:40px}
.rg-lock{margin:0;font-size:12.5px;color:var(--soft)}
.rg-fine{font-size:13px;font-weight:600;color:var(--gold2)!important;text-decoration:none;justify-self:start}

.rg-rail{list-style:none;margin:0;padding:10px 0 0;border-top:1px solid var(--line);display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;counter-reset:rg}
.rg-rail li{position:relative;display:grid;grid-template-columns:22px minmax(0,1fr);gap:0 7px;align-items:start;font-size:12.5px;color:var(--soft);min-width:0}
.rg-rail li>i{grid-row:span 2;width:22px;height:22px;border-radius:50%;display:grid;place-items:center;font-style:normal;font-size:11px;font-weight:700;border:1px solid rgba(139,166,201,.35);color:#6e8db3}
.rg-rail li b{font-size:12.5px;font-weight:600;color:#cfe3f7;line-height:22px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rg-rail li span{line-height:1.3;overflow-wrap:anywhere}
.rg-rail li.ok>i{border-color:var(--ok);background:rgba(61,220,151,.18);color:var(--ok)}
.rg-rail li.ok b{color:var(--ok)}
.rg-rail li.wait>i{border-color:var(--wait);color:var(--wait)}
.rg-rail li.wait b{color:var(--wait)}
.rg-rail li.now>i{border-color:var(--now);background:rgba(226,198,143,.2);color:var(--now)}
.rg-rail li.now b{color:var(--now)}
.rg-rail li.todo{opacity:.55}
.rg-go{grid-column:2;justify-self:start;margin-top:5px;padding:6px 12px;border-radius:8px;font:700 12.5px var(--sans);cursor:pointer;color:#02060f!important;background:linear-gradient(180deg,#a8ecff,#5fd4ff)!important;border:0!important}
.rg-go:disabled{opacity:.5;cursor:default}

.rg-hist{margin-top:22px;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:rgba(4,12,26,.5)}
.rg-hist h2{margin:0 0 10px;font-family:var(--sans);font-size:15px;font-weight:700;letter-spacing:0;color:var(--cy2)}
.rg-hist ul{list-style:none;margin:0;padding:0;display:grid;gap:2px}
.rg-hist li{display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:10px;align-items:center;padding:7px 0;border-top:1px solid rgba(95,212,255,.08)}
.rg-hist li:first-child{border-top:0}
.rg-hist time{font-size:13px;color:#7f9bbd;font-variant-numeric:tabular-nums}
.rg-hist li span{font-size:13.5px;color:#e6f6ff}
.rg-hist li span em{font-style:normal;color:var(--soft);margin-left:6px}
.rg-hist button{padding:6px 12px;border-radius:8px;font:600 12.5px var(--sans);cursor:pointer}
.rg-hist .none{display:block;color:var(--soft);font-size:13px}

.rg-bar{position:fixed;left:0;right:0;bottom:0;z-index:45;padding:10px 16px calc(10px + env(safe-area-inset-bottom));background:rgba(4,10,22,.94);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);border-top:1px solid rgba(226,198,143,.6);box-shadow:0 -12px 40px -10px rgba(226,198,143,.35);animation:rg-up .2s ease-out}
.rg-bar .in{max-width:1240px;margin:0 auto;display:flex;align-items:center;gap:10px 14px}
.rg-n{flex:none;display:inline-flex;align-items:center;gap:8px;font-weight:700;font-size:15px;color:#fff}
.rg-n b{display:inline-grid;place-items:center;min-width:28px;height:28px;padding:0 6px;border-radius:99px;background:var(--gold);color:#02060f;font-size:14px}
.rg-list{flex:1;min-width:0;font-size:13px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.rg-btns{flex:none;display:flex;gap:8px}
.rg-btns button{min-height:44px;padding:0 16px;border-radius:10px;font:700 14.5px var(--sans);cursor:pointer;white-space:nowrap}
.rg-btns .pri{color:#02060f!important;background:linear-gradient(180deg,#f2dcae,#e2c68f)!important;border:0!important;box-shadow:0 0 20px rgba(226,198,143,.45)}
.rg-btns .now{color:#02060f!important;background:linear-gradient(180deg,#a8ecff,#5fd4ff)!important;border:0!important}
.rg-btns .gh{background:transparent!important}
.rg-btns button:disabled{opacity:.55;cursor:wait}
.rg-msg{margin:6px auto 0;max-width:1240px;font-size:13px;color:#ffb3bd;font-weight:600}

.rg-toast{position:fixed;top:14px;left:50%;transform:translateX(-50%);z-index:70;width:min(440px,calc(100vw - 24px));padding:12px 14px 12px 16px;border-radius:14px;border:1px solid rgba(61,220,151,.55);background:rgba(6,26,22,.96);box-shadow:0 20px 50px -14px rgba(0,0,0,.9),0 0 30px -10px rgba(61,220,151,.6);animation:rg-down .2s ease-out}
.rg-toast.bad{border-color:rgba(255,94,115,.6);background:rgba(36,8,14,.96)}
.rg-toast header{display:flex;align-items:center;gap:10px}
.rg-toast header b{flex:1;font-size:16px;color:#fff}
.rg-toast button{width:32px;height:32px;padding:0;border-radius:50%;cursor:pointer;flex:none}
.rg-toast ul{margin:8px 0 0;padding:0 0 0 18px;font-size:13.5px;color:#cfe3f7;display:grid;gap:2px}
.rg-toast p{margin:8px 0 0;font-size:13px;color:var(--cy2)}

@keyframes rg-up{from{transform:translateY(100%)}}
@keyframes rg-down{from{opacity:0;transform:translate(-50%,-8px)}}
@media (prefers-reduced-motion:no-preference){.rg-rail li.now>i,.rg-rail li.wait>i{animation:jv-blink 1.6s ease-in-out infinite}}

@media (max-width:900px){.rg-list{display:none}.rg-bar .in{justify-content:space-between}}
@media (max-width:640px){
  .rg-head h1{font-size:21px}
  .rg-card{padding:14px 12px 12px}
  .rg-h{grid-template-columns:42px minmax(0,1fr) auto;gap:10px}.rg-ic{width:42px;height:42px;font-size:19px}
  .rg-sw .lb{display:none}
  .rg-k{grid-template-columns:1fr;gap:6px}.rg-k .rg-note{grid-column:1}
  .rg-st{grid-template-columns:52px minmax(0,1fr) 52px;width:100%}.rg-st button{width:52px}
  .rg-pages{grid-template-columns:1fr;gap:6px}
  .rg-page{grid-template-columns:minmax(0,1fr) auto;justify-items:start;align-items:center;padding:6px 8px 6px 12px}
  .rg-page>div:first-child{flex-direction:column;gap:0}
  .rg-page .rg-st{grid-template-columns:44px 64px 44px;width:auto}.rg-page .rg-st button{width:44px;height:44px}
  .rg-rail{grid-template-columns:1fr;gap:6px}
  .rg-rail li b{white-space:normal}
  .rg-hist li{grid-template-columns:52px minmax(0,1fr);}.rg-hist li button{grid-column:2;justify-self:start}
  .rg-bar{bottom:calc(58px + env(safe-area-inset-bottom));padding:10px 12px}
  .rg-bar .in{flex-wrap:wrap}
  .rg-btns{flex:1 1 100%}.rg-btns button{flex:1;padding:0 8px;font-size:14px}
  .rg-btns .gh{flex:0 0 auto}
}
`;

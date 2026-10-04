/**
 * JARVIS-Chat (Seite /dashboard/jarvis/chat) und Baukasten-Chat – im HUD-Stil (hud-css.ts: Nachtblau, Cyan, Gold).
 * Inhaber rechts (Cyan), JARVIS links (Gold-Rand). Am Handy (≤ 820 px) Sitzungsliste als Schublade von links,
 * kein seitliches Scrollen (lange Wörter brechen um). Bewegung nur ohne prefers-reduced-motion.
 */
export const JCHAT_CSS = `
.dash .jc section,.dash .jc aside{margin-top:0}
.jc{align-items:stretch}
.jc-top{display:flex;align-items:center;justify-content:space-between;gap:12px;max-width:1200px;margin:0 auto 12px;min-height:32px}
.jc-crumbs{display:flex;align-items:center;gap:6px;font-size:13px;color:var(--soft)}
.jc-crumbs a{color:var(--soft)!important;text-decoration:none}.jc-crumbs a:hover{color:var(--cy2)!important}
.jc-crumbs svg{color:var(--gold)}.jc-crumbs [aria-current]{color:var(--text);font-weight:600}
.jc-back{display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 12px;border-radius:999px;border:1px solid var(--line);font-size:12.5px;letter-spacing:.12em;text-transform:uppercase;color:var(--cy2)!important;text-decoration:none;transition:border-color .15s,color .15s}
.jc-back svg{transform:scaleX(-1)}
.jc-back:hover{border-color:var(--gold);color:var(--gold)!important}
.jc{display:grid;grid-template-columns:minmax(220px,280px) minmax(0,1fr);gap:14px;min-height:calc(100dvh - 190px);max-width:1200px;margin:0 auto;padding:4px 0 16px}
.jc-side{display:flex;flex-direction:column;gap:8px;min-width:0;margin:0;padding:12px;border:1px solid var(--line);border-radius:12px;background:rgba(4,12,26,.72);
  -webkit-backdrop-filter:blur(8px);backdrop-filter:blur(8px);max-height:calc(100dvh - 190px);overflow:auto}
.jc-side-h{display:flex;align-items:center;gap:8px}
.jc-side-h h2{display:flex;align-items:center;gap:6px;margin:0;font-size:13px;letter-spacing:.14em;text-transform:uppercase;color:var(--cy2);flex:1}
.jc-new{display:inline-flex;align-items:center;gap:5px;min-height:36px;padding:6px 12px;border-radius:8px;font-weight:600;font-size:13px;cursor:pointer;
  color:#02060f!important;background:linear-gradient(180deg,#f2dcae,#e2c68f)!important;border:0!important}
.jc-ib{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:8px;border:1px solid var(--line);cursor:pointer;flex:none}
.jc-only-m{display:none}
.jc-list{list-style:none;margin:0;padding:0;display:grid;gap:4px}
.jc-list a{display:grid;grid-template-columns:22px minmax(0,1fr) auto auto;align-items:center;gap:6px 8px;padding:9px 10px;border-radius:9px;
  color:var(--text)!important;text-decoration:none;border:1px solid transparent;min-height:44px;position:relative}
.jc-list a:hover{background:rgba(95,212,255,.07)}
.jc-list a.on{background:linear-gradient(90deg,rgba(95,212,255,.16),rgba(95,212,255,.04));border-color:rgba(95,212,255,.4)}
.jc-list a.pin{border-color:rgba(226,198,143,.35);background:rgba(226,198,143,.06)}
.jc-list a.pin.on{border-color:var(--gold);background:rgba(226,198,143,.14)}
.jc-list a i{display:flex;color:var(--cy2)}.jc-list a.pin i{color:var(--gold)}
.jc-list .t{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:14px}
.jc-list time{grid-column:2/-1;font-size:11.5px;color:var(--soft);font-variant-numeric:tabular-nums}
.jc-open{font-style:normal;font-size:11px;line-height:18px;min-width:18px;padding:0 5px;border-radius:9px;text-align:center;background:rgba(95,212,255,.18);color:var(--cy2)}
.jc-dot{width:9px;height:9px;border-radius:50%;background:var(--gold);box-shadow:0 0 8px rgba(226,198,143,.8)}
.jc-more{display:flex;flex-wrap:wrap;gap:6px 12px;padding:6px 4px 0;border-top:1px solid var(--line);margin-top:4px}
.jc-more a{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:var(--soft)!important;text-decoration:none;min-height:32px}
.jc-more a.on,.jc-more a:hover{color:var(--cy2)!important}
.jc-arch a{opacity:.8}.jc-none{font-size:12.5px;color:var(--soft);padding:4px 10px}
.jc-main{display:flex;flex-direction:column;min-width:0;margin:0;border:1px solid var(--line);border-radius:12px;background:rgba(4,12,26,.6);overflow:hidden;
  max-height:calc(100dvh - 190px)}
.jc-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;border-bottom:1px solid var(--line);background:rgba(9,24,48,.5)}
.jc-head h1{display:flex;align-items:center;gap:8px;margin:0;font-size:17px;min-width:0;flex:0 1 auto;color:#fff;letter-spacing:.03em}
.jc-head h1 span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jc-head h1 svg{color:var(--gold);flex:none}
.jc-state{display:inline-flex;align-items:center;gap:5px;font-style:normal;font-size:12.5px;color:var(--gold2);padding:3px 9px;border-radius:999px;border:1px solid rgba(226,198,143,.35)}
.jc-sp{flex:1}
.jc-rename{display:flex;gap:6px;flex:1;min-width:0}
.jc-rename input{flex:1;min-width:0;padding:8px 10px;border-radius:8px;font:inherit;font-size:15px}
.jc-rename button{width:40px;border-radius:8px;cursor:pointer;display:inline-flex;align-items:center;justify-content:center}
.jc-err{display:flex;align-items:center;gap:6px;margin:8px 12px 0;padding:8px 10px;border-radius:8px;font-size:13.5px;color:#ffd0d6;background:var(--red-bg);border:1px solid rgba(255,94,115,.4)}
.jc-empty{margin:auto;padding:28px 18px;text-align:center;color:var(--soft);font-size:14.5px;max-width:420px}
.jc-log{list-style:none;margin:0;padding:14px 12px;display:flex;flex-direction:column;gap:12px;overflow-y:auto;flex:1;min-height:0}
.jc-log li{display:flex;flex-direction:column;gap:3px;max-width:min(78%,640px);min-width:0}
.jc-log li.me{align-self:flex-end;align-items:flex-end}
.jc-log li.bot{align-self:flex-start;align-items:flex-start}
.jc-log .b{padding:9px 12px;border-radius:12px;min-width:0;max-width:100%}
.jc-log .me .b{background:rgba(95,212,255,.15);border:1px solid rgba(95,212,255,.32);border-bottom-right-radius:4px}
.jc-log .bot .b{background:rgba(226,198,143,.08);border:1px solid rgba(226,198,143,.32);border-bottom-left-radius:4px}
.jc-log .b p{margin:0;font-size:14.5px;line-height:1.45;white-space:pre-wrap;overflow-wrap:anywhere;word-break:break-word}
.jc-log .who{display:block;font-size:11px;letter-spacing:.16em;color:var(--gold);margin-bottom:3px}
.jc-log .lk{display:flex;flex-wrap:wrap;gap:6px;margin-top:8px}
.jc-log .lk a{display:inline-flex;align-items:center;gap:4px;padding:4px 9px;border-radius:999px;font-size:12.5px;text-decoration:none;border:1px solid rgba(95,212,255,.35);
  background:rgba(95,212,255,.08);color:var(--cy2)!important;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jc-log .meta{display:block;text-align:right;font-size:11.5px;line-height:1.6;color:var(--soft)}
.jc-log .meta>*{display:inline-flex;align-items:center;gap:4px;white-space:nowrap;vertical-align:middle}
.jc-log .meta>*+*{margin-left:8px}
.jc-log .bot .meta{text-align:left}
.jc-log .jc-st{font-style:normal}
.jc-log .jc-st.wait{color:var(--gold2)}.jc-log .jc-st.work{color:var(--cy2)}.jc-log .jc-st.done{color:var(--green)}
.jc-log.cmp{max-height:300px;padding:10px}
.jc-comp{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:6px 8px;padding:10px 12px;border-top:1px solid var(--line);background:rgba(2,8,18,.6)}
.jc-comp textarea{min-width:0;width:100%;padding:10px 12px;border-radius:10px;font:inherit;font-size:15px;line-height:1.4;resize:vertical;min-height:48px;max-height:240px;box-sizing:border-box}
.jc-comp .go{display:inline-flex;align-items:center;gap:6px;align-self:end;min-height:48px;padding:0 16px;border-radius:10px;font-weight:700;cursor:pointer;
  color:#02060f!important;background:linear-gradient(180deg,#f2dcae,#e2c68f)!important;border:0!important}
.jc-comp .go:disabled{opacity:.5;cursor:default}
.jc-hint{grid-column:1/-1;display:flex;align-items:center;gap:5px;font-size:11.5px;color:var(--soft)}
.jc-ro{display:flex;align-items:center;gap:6px;margin:0;padding:12px;border-top:1px solid var(--line);font-size:13px;color:var(--soft)}
.jc-shade{display:none}
.jc-missing{max-width:560px;margin:40px auto;padding:20px;border:1px solid var(--line);border-radius:12px;background:rgba(4,12,26,.6)}
.jc-missing h1{margin:0 0 8px;font-size:18px}
@media (max-width:820px){
  .jc{grid-template-columns:minmax(0,1fr);min-height:calc(100dvh - 210px)}
  .jc-only-m{display:inline-flex}
  .jc-side{position:fixed;z-index:60;top:0;bottom:0;left:0;width:min(86vw,320px);max-height:none;border-radius:0 14px 14px 0;transform:translateX(-105%);
    background:rgba(4,12,26,.97);box-shadow:20px 0 60px -20px rgba(0,0,0,.9)}
  .jc.jc-drw .jc-side{transform:none}
  .jc.jc-drw .jc-shade{display:block;position:fixed;inset:0;z-index:59;background:rgba(2,6,15,.6)}
  .jc-main{max-height:none;min-height:calc(100dvh - 210px);overflow:clip}
  .jc .jc-comp{position:sticky;bottom:calc(64px + env(safe-area-inset-bottom));z-index:5;background:rgba(2,8,18,.94)}
  .jc-log li{max-width:90%}
  .jc-head h1{flex:1 1 0;font-size:16px}
  .jc-head .jc-sp{display:none}
  .jc-head .jc-state{order:10;flex:1 0 100%;border:0;padding:0 0 0 2px}
  .jc-comp .go span{display:none}
  .jc-comp .go{padding:0 14px}
}
/* Baukasten-Chat unter der Fläche */
.bk-chat{margin:12px 0 0;border:1px solid rgba(226,198,143,.35);border-radius:12px;background:rgba(4,12,26,.72);min-width:0}
.bk-chat>summary{display:flex;align-items:center;gap:8px;padding:10px 12px;min-height:44px;cursor:pointer;list-style:none;font-weight:700;font-size:14px;color:var(--gold2)}
.bk-chat>summary::-webkit-details-marker{display:none}
.bk-chat>summary em{font-style:normal;font-weight:500;font-size:12.5px;color:var(--soft);margin-left:auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.bk-chat>summary .chev{display:flex;color:var(--soft)}
.bk-chat[open]>summary{border-bottom:1px solid var(--line)}
.bk-chat[open]>summary .chev{transform:rotate(180deg)}
.bk-chat-in{display:flex;flex-direction:column;min-width:0}
.bk-chat .jc-log{max-height:320px}
.bk-chat .jc-empty{margin:0;padding:14px 12px;text-align:left;max-width:none}
.bk-chat .jc-comp{border-top:1px solid var(--line)}
.bk-chat-stale{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:10px 12px 0;padding:8px 10px;border-radius:8px;font-size:13.5px;color:var(--amber);background:var(--amber-bg);border:1px solid rgba(255,181,71,.4)}
.bk-chat-stale span{flex:1;min-width:0}
.bk-chat-stale button{min-height:36px;padding:0 12px;border-radius:8px;cursor:pointer;font-weight:600}
.bk-chat-f{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:8px 12px 10px;font-size:12px;color:var(--soft)}
.bk-chat-f span{display:inline-flex;align-items:center;gap:5px;flex:1;min-width:0}
.bk-chat-f button{display:inline-flex;align-items:center;gap:5px;min-height:36px;padding:0 12px;border-radius:8px;cursor:pointer;font-size:12.5px}
@media (prefers-reduced-motion:no-preference){.jc-side{transition:transform .22s ease}.bk-chat>summary .chev{transition:transform .2s ease}}
`;

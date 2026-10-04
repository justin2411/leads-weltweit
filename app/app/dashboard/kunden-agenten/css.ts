/** Kunden-Agenten (Inhaber 04.10.2026): Karten und Chat-Verlauf im JARVIS-Stil (Farben aus hud-css.ts), Handy zuerst. */
export const KA_CSS = `
.ka{padding-bottom:40px}
.ka-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:4px 0 14px}
.ka-head h1{margin:0;font-size:24px;letter-spacing:.12em;text-transform:uppercase;color:#fff;display:flex;align-items:center;gap:10px}
.ka-sub{font-size:13px;color:var(--soft);margin:-6px 0 14px}
.ka-err{margin:0 0 14px;padding:12px 14px;border:1px solid rgba(255,94,115,.5);border-radius:10px;background:rgba(255,94,115,.12);color:#ffb3bd;font-weight:600;overflow-wrap:anywhere}
.ka-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,320px),1fr));gap:12px}
.ka-card{display:flex;flex-direction:column;gap:10px;padding:14px;border:1px solid var(--line);border-radius:14px;background:var(--card);color:var(--text);text-decoration:none;min-width:0;transition:border-color .15s,box-shadow .15s}
.ka-card:hover,.ka-card:focus-visible{border-color:var(--cy);box-shadow:var(--glow);outline:none}
.ka-card.st-pausiert{opacity:.72}
.ka-who{display:grid;grid-template-columns:52px minmax(0,1fr) auto;gap:12px;align-items:center}
.ka-av{width:52px;height:52px;border-radius:50%;display:grid;place-items:center;font-weight:800;font-size:17px;letter-spacing:.04em;color:#fff;
  background:radial-gradient(circle at 50% 35%,hsl(var(--h) 55% 38%),#06101f 75%);border:1px solid hsl(var(--h) 70% 60% / .6);box-shadow:0 0 18px -8px hsl(var(--h) 80% 60%)}
.ka-av.big{width:64px;height:64px;font-size:21px}
.ka-nm{min-width:0;display:flex;flex-direction:column;gap:2px}
.ka-nm b{font-size:16px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ka-nm span{font-size:12.5px;color:var(--soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ka-chip{display:inline-flex;align-items:center;gap:5px;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;border:1px solid currentColor;white-space:nowrap}
.ka-chip.st-onboarding{color:var(--amber,#ffb547)}.ka-chip.st-aktiv{color:var(--green,#3ddc97)}.ka-chip.st-pausiert{color:var(--soft,#8ba6c9)}
.ka-co{display:flex;align-items:center;gap:6px;font-size:13.5px;color:var(--text);min-width:0}
.ka-co span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ka-co i{width:8px;height:8px;border-radius:50%;display:inline-block;flex:none}
.ka-tags{display:flex;flex-wrap:wrap;gap:6px}
.ka-tags span{font-size:12px;padding:3px 9px;border-radius:99px;background:rgba(95,212,255,.1);border:1px solid rgba(95,212,255,.3);color:#cfefff;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ka-tags em{font-size:12px;color:var(--soft);font-style:normal}
.ka-last{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:8px;align-items:center;font-size:13px;color:var(--soft)}
.ka-last .tx{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text)}
.ka-last .tt{font-family:var(--mono);font-size:11.5px}
.ka-kpi{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:6px;border-top:1px solid var(--line);padding-top:10px}
.ka-kpi div{display:flex;flex-direction:column;align-items:center;gap:1px;min-width:0}
.ka-kpi b{font-family:var(--mono);font-size:20px;color:#fff;line-height:1.1}
.ka-kpi span{font-size:11px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:100%}
.ka-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:36px 12px;color:var(--soft);border:1px dashed var(--line);border-radius:12px;text-align:center}

.ka-top{display:grid;grid-template-columns:64px minmax(0,1fr);gap:14px;align-items:center;margin:2px 0 14px}
.ka-top h1{margin:0;font-size:22px;color:#fff;overflow-wrap:anywhere}
.ka-top .ka-line{display:flex;flex-wrap:wrap;gap:8px;align-items:center;margin-top:4px;font-size:13px;color:var(--soft)}
.ka-box{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:14px;margin:0 0 12px;min-width:0}
.ka-box h2{margin:0 0 10px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--cy2,#a8ecff);display:flex;align-items:center;gap:8px}
.ka-chat{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:10px;max-height:70vh;overflow:auto}
.ka-msg{max-width:88%;padding:10px 12px;border-radius:14px;font-size:14.5px;line-height:1.5;border:1px solid var(--line);background:rgba(4,14,30,.6);min-width:0}
.ka-msg.out{align-self:flex-end;background:linear-gradient(180deg,rgba(95,212,255,.18),rgba(95,212,255,.06));border-color:rgba(95,212,255,.4);border-bottom-right-radius:4px}
.ka-msg.in{align-self:flex-start;border-bottom-left-radius:4px}
.ka-msg.notiz{align-self:center;max-width:94%;background:rgba(226,198,143,.1);border:1px dashed rgba(226,198,143,.55)}
.ka-msg .mh{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:11.5px;color:var(--soft);margin-bottom:4px}
.ka-msg .mh b{color:#fff;font-weight:600}
.ka-msg .ms{font-weight:600;color:#fff;margin:0 0 4px;overflow-wrap:anywhere}
.ka-msg .mb{white-space:pre-wrap;overflow-wrap:anywhere;margin:0}
.ka-msg .mx{font-size:11px;color:var(--amber,#ffb547)}
.ka-facts{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 14px;font-size:14px;margin:0}
.ka-facts dt{color:var(--soft)}.ka-facts dd{margin:0;overflow-wrap:anywhere}
.ka-form{display:flex;flex-direction:column;gap:10px}
.ka-form textarea{width:100%;min-height:110px;font-size:15px;line-height:1.5;padding:12px;border-radius:10px;resize:vertical;box-sizing:border-box}
.ka-hint{font-size:12px;color:var(--soft)}
.ka-tasks{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;font-size:13px}
.ka-tasks li{display:grid;grid-template-columns:92px minmax(0,1fr);gap:10px}
.ka-tasks .tt{color:var(--soft);font-family:var(--mono);font-size:12px}
.ka-tasks .tx{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ka-lock{font-size:12px;color:var(--soft);display:flex;gap:6px;align-items:flex-start;margin:4px 0 0}
@media (min-width:860px){.ka-detail{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,1fr);gap:16px;align-items:start}}
`;

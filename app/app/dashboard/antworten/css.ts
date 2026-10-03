/** Antworten-Cockpit (Nachtschicht 03./04.10.2026): Handy zuerst, große Flächen, wenig Text. Farben aus hud-css.ts. */
export const ANTWORTEN_CSS = `
.aw{--aw-gold:var(--gold,#e2c68f);--aw-blue:var(--cy,#5fd4ff);--aw-amber:var(--amber,#ffb547);--aw-green:var(--green,#3ddc97);--aw-grey:var(--soft,#8ba6c9);--aw-red:var(--red,#ff5e73);padding-bottom:40px}
.aw-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:4px 0 14px}
.aw-head h1{margin:0;font-size:24px;letter-spacing:.12em;text-transform:uppercase;color:#fff;display:flex;align-items:center;gap:10px}
.aw-err{margin:0 0 14px;padding:12px 14px;border:1px solid rgba(255,94,115,.5);border-radius:10px;background:rgba(255,94,115,.12);color:#ffb3bd;font-weight:600}
.aw-tabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:0 0 14px}
.aw-tabs a{display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:58px;border:1px solid var(--line);border-radius:12px;
  background:rgba(4,14,30,.7);color:var(--soft);text-decoration:none;font-size:13px;letter-spacing:.04em}
.aw-tabs a b{font-family:var(--mono);font-size:22px;color:#fff;line-height:1.1}
.aw-tabs a.on{border-color:var(--cy);background:linear-gradient(180deg,rgba(95,212,255,.24),rgba(95,212,255,.06));color:#fff;box-shadow:var(--glow)}
.aw-tabs a.hot b{color:var(--aw-gold)}
.aw-list{display:flex;flex-direction:column;gap:8px}
.aw-row{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:center;min-height:68px;padding:10px 14px;
  border:1px solid var(--line);border-radius:12px;background:var(--card);color:var(--text);text-decoration:none;transition:border-color .15s,box-shadow .15s}
.aw-row:hover,.aw-row:focus-visible{border-color:var(--cy);box-shadow:var(--glow);outline:none}
.aw-row.late{border-color:rgba(255,94,115,.65);box-shadow:0 0 0 1px rgba(255,94,115,.25),0 0 22px -8px rgba(255,94,115,.6)}
.aw-ic{width:44px;height:44px;border-radius:50%;display:grid;place-items:center;border:1px solid currentColor;background:rgba(255,255,255,.03)}
.aw-ic.gold{color:var(--aw-gold)}.aw-ic.blue{color:var(--aw-blue)}.aw-ic.amber{color:var(--aw-amber)}.aw-ic.green{color:var(--aw-green)}.aw-ic.grey{color:var(--aw-grey)}
.aw-mid{min-width:0;display:flex;flex-direction:column;gap:3px}
.aw-co{font-weight:600;font-size:16px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aw-sum{font-size:13px;color:var(--soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aw-meta{display:flex;flex-direction:column;align-items:flex-end;gap:6px;font-size:12px;color:var(--soft)}
.aw-cc{display:inline-flex;align-items:center;gap:5px;font-family:var(--mono)}
.aw-cc i{width:8px;height:8px;border-radius:50%;display:inline-block}
.aw-age{display:inline-flex;align-items:center;gap:4px;font-family:var(--mono);font-size:13px;color:var(--soft);white-space:nowrap}
.aw-age.late{color:var(--aw-red);font-weight:700}
.aw-chip{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:99px;font-size:12px;font-weight:600;border:1px solid currentColor;white-space:nowrap}
.aw-chip.gold{color:var(--aw-gold)}.aw-chip.blue{color:var(--aw-blue)}.aw-chip.amber{color:var(--aw-amber)}.aw-chip.green{color:var(--aw-green)}.aw-chip.grey{color:var(--aw-grey)}
.aw-empty{display:flex;flex-direction:column;align-items:center;gap:8px;padding:36px 12px;color:var(--soft);border:1px dashed var(--line);border-radius:12px}
.aw-empty .ico{color:var(--aw-green)}

.aw-top{display:flex;flex-direction:column;gap:8px;margin:2px 0 12px}
.aw-top h1{margin:0;font-size:22px;color:#fff;letter-spacing:.03em;overflow-wrap:anywhere}
.aw-tags{display:flex;gap:8px;flex-wrap:wrap;align-items:center}
.aw-box{border:1px solid var(--line);border-radius:12px;background:var(--card);padding:14px;margin:0 0 12px}
.aw-box h2{margin:0 0 8px;font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--cy2,#a8ecff);display:flex;align-items:center;gap:8px}
.aw-from{font-size:13px;color:var(--soft);margin:0 0 6px;overflow-wrap:anywhere}
.aw-subj{font-weight:600;color:#fff;margin:0 0 8px;overflow-wrap:anywhere}
.aw-text{white-space:pre-wrap;overflow-wrap:anywhere;font-size:15px;line-height:1.55;color:var(--text);max-height:60vh;overflow:auto}
.aw-sumline{font-size:13px;color:var(--soft);margin:8px 0 0}
.aw-form{display:flex;flex-direction:column;gap:10px}
.aw-form textarea{width:100%;min-height:180px;font-size:15px;line-height:1.5;padding:12px;border-radius:10px;resize:vertical;box-sizing:border-box}
.aw-hint{font-size:12px;color:var(--soft)}
.aw-big{display:flex;align-items:center;justify-content:center;gap:10px;width:100%;min-height:56px;padding:12px 16px;border-radius:12px;font-size:16px;font-weight:700;cursor:pointer;border:1px solid rgba(95,212,255,.4)}
.aw-big:disabled{opacity:.45;cursor:not-allowed}
.aw .aw-big.go{background:linear-gradient(180deg,rgba(95,212,255,.4),rgba(95,212,255,.14));color:#fff;border-color:var(--cy)}
.aw .aw-big.gold{background:linear-gradient(180deg,rgba(226,198,143,.38),rgba(226,198,143,.1));color:#fff;border-color:var(--aw-gold)}
.aw .aw-big.red{background:rgba(255,94,115,.16);color:#ffd0d6;border-color:rgba(255,94,115,.6)}
.aw-acts{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;margin:0 0 12px}
.aw-acts form{margin:0;display:flex}
.aw-acts .aw-big{min-height:64px;flex-direction:column;gap:4px;font-size:14px}
.aw-acts .aw-big small{font-weight:500;font-size:11px;color:var(--soft)}
.aw-why{font-size:12px;color:var(--soft);text-align:center;margin:-4px 0 0}
.aw-danger{border:1px solid rgba(255,94,115,.35);border-radius:12px;padding:12px;margin:0 0 12px}
.aw-danger summary{cursor:pointer;color:#ffb3bd;font-weight:600;list-style:none;display:flex;align-items:center;gap:8px;min-height:40px}
.aw-danger summary::-webkit-details-marker{display:none}
.aw-danger form{display:flex;flex-direction:column;gap:10px;margin-top:8px}
.aw-chk{display:flex;align-items:center;gap:10px;font-size:14px;min-height:44px}
.aw-chk input{width:22px;height:22px}
.aw-more summary{cursor:pointer;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:40px}
.aw-more summary::-webkit-details-marker{display:none}
.aw-more[open] summary .ico{transform:rotate(90deg)}
.aw-facts{display:grid;grid-template-columns:auto minmax(0,1fr);gap:6px 14px;font-size:14px;margin:0}
.aw-facts dt{color:var(--soft)}.aw-facts dd{margin:0;overflow-wrap:anywhere}
.aw-hist{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;font-size:13px}
.aw-hist li{display:grid;grid-template-columns:92px minmax(0,1fr);gap:10px}
.aw-hist .tt{color:var(--soft);font-family:var(--mono);font-size:12px}
.aw-hist .tx{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.aw-done{display:flex;align-items:center;gap:8px;color:var(--aw-green);font-weight:600;margin:0 0 12px}
@media (min-width:860px){
  .aw-detail{display:grid;grid-template-columns:minmax(0,1.3fr) minmax(0,1fr);gap:16px;align-items:start}
  .aw-acts{grid-template-columns:repeat(3,minmax(0,1fr))}
}
@media (max-width:420px){.aw-row{grid-template-columns:38px minmax(0,1fr) auto;padding:10px}.aw-ic{width:38px;height:38px}}
`;

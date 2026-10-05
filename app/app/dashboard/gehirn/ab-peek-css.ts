/** Styles der Live-Vorschau (ab-peek.tsx); eigene Datei, weil Server-Komponenten keine Werte aus "use client" lesen. */
export const AB_PEEK_CSS = `
.dash .abp-wrap{display:grid;min-width:0;outline:none;cursor:zoom-in}
.dash .abp-wrap>.ab-card{height:100%}
.dash .abp-wrap:focus-visible>.ab-card,.dash .abp-wrap.is-open>.ab-card{border-color:var(--gold);box-shadow:0 0 0 1px rgba(226,198,143,.35) inset,0 0 18px rgba(226,198,143,.18)}
.dash .abp-card{position:fixed;z-index:1001;width:min(760px,calc(100vw - 16px));max-height:calc(100vh - 16px);overflow:auto;padding:12px;
  border:1px solid rgba(226,198,143,.6);background:rgba(4,12,26,.97);box-shadow:0 18px 48px rgba(0,0,0,.55),0 0 24px rgba(226,198,143,.12);box-sizing:border-box}
.dash .abp-card.sheet{width:calc(100vw - 16px);max-height:82vh}
.dash .abp-h{display:flex;align-items:center;gap:8px;min-width:0;margin:0 0 10px}
.dash .abp-h>b{font-size:13.5px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.dash .abp-meta{font-family:var(--mono);font-size:11px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.dash .abp-h .x-btn{margin-left:auto}
.dash .abp-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px;align-items:stretch}
.dash .abp-pane{display:grid;grid-template-rows:auto auto 1fr;gap:6px;margin:0;min-width:0}
.dash .abp-pane figcaption{display:flex;align-items:center;gap:8px;font-size:11.5px;color:var(--soft)}
.dash .abp-pane figcaption small{margin-left:auto;font-family:var(--mono)}
.dash .abp-inbox{display:grid;grid-template-columns:28px minmax(0,1fr) auto;align-items:center;gap:8px;padding:7px 9px;background:#fff;color:#1D2433;border-radius:6px;min-width:0}
.dash .abp-av{display:grid;place-items:center;width:28px;height:28px;border-radius:50%;background:#0B1428;color:#D8BD8A;font-weight:700;font-size:13px}
.dash .abp-ib{display:grid;min-width:0;line-height:1.3;font-size:12px}
.dash .abp-ib>*{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dash .abp-ib b{font-size:12px;color:#0B1428}
.dash .abp-ib small{color:#667085;font-size:11px}
.dash .abp-mk{background:#F6E7C1;box-shadow:0 0 0 2px #D8BD8A;border-radius:3px;padding:0 2px;color:#1D2433}
.dash .abp-chip{font-size:10.5px;padding:2px 6px;border-radius:99px;background:#EEF0F4;color:#1D2433;white-space:nowrap}
.dash .abp-shot{position:relative;height:300px;overflow:hidden;border-radius:6px;background:#EEF0F4;min-width:0}
.dash .abp-shot iframe{position:absolute;left:0;top:0;border:0;transform-origin:0 0;pointer-events:none;background:#fff}
.dash .abp-shot.page{background:#0B1428}
.dash .abp-shot.page iframe{opacity:0}
.dash .abp-shot.page.ready iframe{opacity:1}
.dash .abp-load{position:absolute;inset:0;background:linear-gradient(90deg,rgba(255,255,255,0),rgba(255,255,255,.08),rgba(255,255,255,0)) 0 0/200% 100%}
.dash .abp-off{position:absolute;left:8px;bottom:8px;padding:3px 8px;border-radius:99px;background:rgba(4,12,26,.88);border:1px solid rgba(226,198,143,.6);color:var(--gold2);font-size:11px;font-family:var(--mono)}
.dash .abp-none{margin:0;padding:10px;font-size:12px;color:var(--soft);border:1px dashed rgba(95,212,255,.25)}
@media (max-width:640px){
  .dash .abp-grid{grid-template-columns:minmax(0,1fr)}
  .dash .abp-shot{height:220px}
}
@keyframes abp-in{from{opacity:0;transform:translateY(6px) scale(.985)}to{opacity:1;transform:none}}
@keyframes abp-shine{to{background-position:-200% 0}}
@media (prefers-reduced-motion:no-preference){
  .dash .abp-card{animation:abp-in .22s ease-out both}
  .dash .abp-shot.page iframe{transition:opacity .3s ease-out}
  .dash .abp-load{animation:abp-shine 1.2s linear infinite}
}
`;

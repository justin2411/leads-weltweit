/**
 * Firma-Seite (Präfix fa-, Farben aus hud-css.ts/ampel.ts über zx-a-<ampel>). Bündig (Inhaber 04.10.2026): Kacheln
 * je Reihe gleich hoch (align-items:stretch), keine Abstände über Karten. Handy 390 px ohne Querscroll.
 */
export const FIRMA_CSS = `
.fa-gb{margin:0 0 14px;padding:12px 16px 14px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
.fa-gb h2{margin:0 0 10px;font-size:var(--fs-m);font-weight:700;color:#fff}
.fa-kette{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:8px;align-items:stretch}
.fa-kette li{display:flex;flex-direction:column;justify-content:center;gap:2px;min-width:0;margin:0;padding:8px 10px;border-radius:10px;background:rgba(95,212,255,.06);border:1px solid rgba(95,212,255,.14)}
.fa-kette b{font-family:var(--mono);font-size:var(--fs-l);color:#fff;font-weight:600;line-height:1.15;overflow-wrap:anywhere}
.fa-kette span{font-size:var(--fs-xs);color:var(--soft);letter-spacing:.06em;text-transform:uppercase;overflow-wrap:anywhere}
.fa-kette li:last-child{border-color:rgba(226,198,143,.5)}
.fa-kette li:last-child b{color:var(--gold2)}

.fa-org{margin:0 0 14px;display:flex;flex-direction:column;align-items:center}
.fa-top{display:inline-flex;align-items:center;gap:8px;padding:8px 16px;border-radius:99px;border:1px solid rgba(226,198,143,.5);color:var(--gold2);font-size:var(--fs-s)}
.fa-top b{color:#fff;font-weight:600}
.fa-org::before{content:"";order:1;width:2px;height:14px;background:rgba(95,212,255,.35)}
.fa-top{order:0}
.fa-grid{order:2;align-self:stretch;list-style:none;margin:0;padding:14px 0 0;border-top:2px solid rgba(95,212,255,.35);border-radius:0;display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:10px;align-items:stretch}
.fa-grid li{position:relative;display:flex;min-width:0;margin:0}
.fa-grid li::before{content:"";position:absolute;left:50%;top:-14px;width:2px;height:14px;background:rgba(95,212,255,.35)}
.fa-grid li:nth-child(n+5)::before{display:none}
.fa-b{flex:1;display:flex;flex-direction:column;gap:4px;min-width:0;padding:10px 12px;border:1px solid var(--line);border-left:3px solid var(--ac);border-radius:12px;background:var(--card);color:inherit;text-decoration:none}
.fa-b:hover,.fa-b:focus-visible,.fa-b.on{border-color:var(--ac)}
.fa-b.on{box-shadow:0 0 0 1px var(--ac) inset}
.fa-bh{display:flex;align-items:center;gap:6px;min-width:0;color:#fff;font-weight:600;font-size:var(--fs-s)}
.fa-bh svg{flex:none;color:var(--ac)}
.fa-bh>span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fa-b>b{font-family:var(--mono);font-size:var(--fs-l);color:var(--ac);font-weight:600;line-height:1.2;overflow-wrap:anywhere}
.fa-b>small{font-size:var(--fs-xs);color:var(--soft);overflow-wrap:anywhere}
.fa-b>em{margin-top:auto;display:flex;align-items:center;gap:5px;min-width:0;font-style:normal;font-size:var(--fs-xs);color:var(--cy2)}
.fa-b>em>span{min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.fa-b>em>i{font-style:normal;color:var(--soft)}

.fa-det .zx-h{flex-wrap:wrap}
.fa-det .zx-h .zx-sum{flex:1;min-width:0}
.fa-kz{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;align-items:stretch;margin:0 0 10px}
.fa-kz .fa-t{font-family:inherit;font-size:var(--fs-m)}
.fa-sub{margin-top:10px;padding-top:6px;border-top:1px solid rgba(95,212,255,.12)}
.fa-pf{display:inline-flex;align-items:center;gap:4px;flex-wrap:wrap}
.fa-pf svg{flex:none;color:var(--cy2)}

@media (max-width:900px){
  .fa-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .fa-grid li:nth-child(n+3)::before{display:none}
}
@media (max-width:760px){
  .fa-kette{grid-template-columns:repeat(2,minmax(0,1fr))}
  .fa-kette li:last-child{grid-column:1/3}
  .fa-kz{grid-template-columns:minmax(0,1fr)}
  .fa-grid{gap:8px}
  .fa-b{padding:8px 10px}
}
`;

/** CSS der Handy-Bausteine (MobileFold, MobileTabs) – eigene Datei, weil Konstanten aus "use client"-Modulen auf dem Server nur Verweise sind. */
export const MOBILE_FOLD_CSS = `
.dash details.mfold{display:flex;flex-direction:column;min-width:0}
@media (min-width:761px){.dash details.mfold::details-content{display:contents}}
.dash details.mfold>summary{display:none}
.dash details.mfold>.mf-b{flex:1;display:flex;flex-direction:column;min-width:0}
.dash details.mfold>.mf-b>*{flex:1}
@media (max-width:760px){
  .dash details.mfold{display:block;margin:8px 0;border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,rgba(10,26,50,.72),rgba(4,12,26,.55))}
  .dash details.mfold>summary{display:flex;align-items:center;gap:12px;min-height:48px;padding:8px 16px;cursor:pointer;list-style:none}
  .dash details.mfold>summary::-webkit-details-marker{display:none}
  .dash details.mfold>summary:before{content:"▸";color:var(--gold);transition:transform .15s}
  .dash details.mfold[open]>summary:before{transform:rotate(90deg)}
  .dash .mf-t{font-weight:700;color:#fff;font-size:var(--fs-m)}
  .dash .mf-s{margin-left:auto;color:var(--soft);font-size:var(--fs-s);font-variant-numeric:tabular-nums}
  .dash details.mfold:not([data-ready])>.mf-b{display:none}
  .dash details.mfold>.mf-b{display:block;padding:0 0 4px}
  .dash details.mfold>.mf-b>*{margin-top:0;margin-bottom:0;border:0;background:none;box-shadow:none}
  .dash details.mfold>.mf-b>*>.jcard-h:first-child{display:none}
}
`;

const IDX = Array.from({ length: 10 }, (_, j) => j);

export const MOBILE_TABS_CSS = `
.dash .mtabs{display:none}
@media (max-width:760px){
  .dash .mtabs{display:flex;gap:6px;overflow-x:auto;scrollbar-width:none;margin:0 0 12px;padding-bottom:2px}
  .dash .mtabs::-webkit-scrollbar{display:none}
  .dash .mtabs button{flex:none;display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border-radius:99px;border:1px solid var(--line);background:none;color:var(--soft);font:inherit;font-size:var(--fs-s);white-space:nowrap;cursor:pointer}
  .dash .mtabs button b{color:var(--text);font-variant-numeric:tabular-nums}
  .dash .mtabs button.on{border-color:var(--gold2);color:var(--gold2);background:rgba(226,198,143,.1)}
  ${IDX.map((j) => `.dash .mt-${j}>:not(:nth-child(${j + 1}))`).join(",")}{display:none}
  ${IDX.map((j) => `.dash .mt-${j}`).join(",")}{grid-template-columns:1fr}
}
`;

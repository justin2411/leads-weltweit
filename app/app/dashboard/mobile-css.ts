/** CSS der Handy-Bausteine (MobileTabs; MobileFold entfiel mit der Zentrale 05.10.2026) – eigene Datei, weil Konstanten aus "use client"-Modulen auf dem Server nur Verweise sind. */
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

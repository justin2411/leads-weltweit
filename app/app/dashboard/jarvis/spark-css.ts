/** CSS der Stations-Sparklines (lokal, nicht in hud-css.ts); eigene Datei, damit Screenshot-Prüfungen sie ohne JSX laden. */
export const SPARK_W = 52, SPARK_H = 14;
const W = SPARK_W, H = SPARK_H;

export const SPARK_CSS = `
.fl-tr{display:flex;align-items:center;justify-content:center;gap:5px;height:14px;margin:3px 0 1px;line-height:1}
.fl-sp{width:${W}px;height:${H}px;overflow:visible;flex:none}
.fl-sp path{fill:none;stroke:var(--cy,#5fd4ff);stroke-width:1.6;stroke-linecap:round;stroke-linejoin:round;opacity:.85}
.fl-sp circle{fill:var(--cy,#5fd4ff)}
.fl-sp.gold path{stroke:var(--gold,#e2c68f)}.fl-sp.gold circle{fill:var(--gold,#e2c68f)}
.fl-ar{font-size:11px;font-weight:600;color:#8ba6c9;font-variant-numeric:tabular-nums;white-space:nowrap}
.fl-ar.up{color:#9fd8f2}.fl-ar.gold.up{color:var(--gold,#e2c68f)}
@media (max-width:720px){.fl-tr{height:11px;margin:2px 0 1px;gap:3px}.fl-sp{width:40px;height:11px}.fl-ar{font-size:10px}.fl-tr .fl-ar:not(:only-child){display:none}}
`;

/**
 * Bereichs-Office (Präfix of-, Farben über zx-a-<ampel>). Bündig (Inhaber 04.10.2026): Kacheln je Reihe gleich hoch,
 * Handy 390 px ohne Querscroll, Klickflächen ≥ 44 px. Animation (arbeitet) nur per CSS, bei „Bewegung reduzieren“ aus.
 */
export const OFFICE_CSS = `
.of .sr{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap}
.of-kopf{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:20px;margin:0 0 14px;padding:16px 20px;border:1px solid var(--line);border-left:4px solid var(--ac);border-radius:16px;background:var(--card)}
.of-rw{position:relative;width:112px;height:112px;flex:none}
.of-ring{width:100%;height:100%;display:block}
.of-rt{fill:none;stroke:rgba(139,166,201,.18);stroke-width:9}
.of-rv{fill:none;stroke:var(--ac);stroke-width:9;stroke-linecap:round;filter:drop-shadow(0 0 6px var(--ac))}
.of-pct{position:absolute;inset:0;display:grid;place-items:center;font-family:var(--mono);font-size:24px;font-weight:700;color:#fff}
.of-ziel{display:flex;flex-direction:column;gap:4px;min-width:0}
.of-zt{display:flex;align-items:center;gap:8px;min-width:0;font-size:var(--fs-s);color:var(--soft);text-transform:uppercase;letter-spacing:.06em}
.of-amp{flex:none;width:22px;height:22px;border-radius:50%;background:var(--ac);box-shadow:0 0 14px var(--ac)}
.of-ziel b{font-family:var(--mono);font-size:36px;line-height:1.1;color:var(--ac);font-weight:700;overflow-wrap:anywhere}
.of-ziel small{font-size:var(--fs-s);color:var(--soft);overflow-wrap:anywhere}
.of-team{display:flex;flex-direction:column;align-items:center;gap:2px;min-width:96px;padding:8px 12px;border-radius:12px;background:rgba(95,212,255,.06);border:1px solid rgba(95,212,255,.14)}
.of-team b{font-family:var(--mono);font-size:32px;line-height:1;color:#fff}
.of-team span{font-size:var(--fs-xs);color:var(--soft);text-transform:uppercase;letter-spacing:.06em}
.of-team em{display:inline-flex;align-items:center;gap:4px;font-style:normal;font-size:var(--fs-xs);color:var(--amp-green)}
.of-live{width:8px;height:8px;border-radius:50%;background:var(--amp-green);animation:of-blink 1.4s ease-in-out infinite}

.of-seiten{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.of-chip{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border-radius:99px;border:1px solid rgba(95,212,255,.3);color:var(--cy2);text-decoration:none;font-size:var(--fs-s);font-weight:600}
.of-chip:hover,.of-chip:focus-visible{background:rgba(95,212,255,.08)}

.of-raum{margin:0 0 14px;padding:12px 16px 16px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
.of-hd{display:flex;align-items:center;gap:8px;margin:0 0 10px}
.of-hd h2{margin:0;font-size:var(--fs-m);font-weight:700;color:#fff}
.of-hd .zx-sum{margin-left:auto}
.of-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(200px,1fr));gap:12px;align-items:stretch}
.of-grid li{display:flex;min-width:0;margin:0}
.of-p{flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;min-width:0;min-height:44px;padding:14px 10px 12px;border-radius:14px;border:1px solid var(--line);background:linear-gradient(180deg,rgba(10,26,50,.6),rgba(4,12,26,.5));color:inherit;text-decoration:none;text-align:center}
.of-p:hover,.of-p:focus-visible,.of-p.on{border-color:var(--ac)}
.of-p.on{box-shadow:0 0 0 1px var(--ac) inset}
.of-av{position:relative;display:grid;place-items:center;width:56px;height:56px;border-radius:50%;border:2px solid var(--ac);background:var(--ab);color:var(--ac);margin-bottom:4px}
.of-p.s-arbeitet .of-av::after{content:"";position:absolute;inset:-7px;border-radius:50%;border:2px dashed var(--ac);animation:of-spin 4s linear infinite}
.of-p.s-arbeitet .of-av{animation:of-glow 1.8s ease-in-out infinite}
.of-pn{display:flex;flex-wrap:wrap;justify-content:center;align-items:center;gap:4px 6px;min-width:0;max-width:100%;font-size:var(--fs-s);font-weight:600;color:#fff;overflow-wrap:anywhere}
.of-lt{font-style:normal;font-size:var(--fs-xs);font-weight:600;padding:0 6px;border-radius:8px;border:1px solid rgba(226,198,143,.5);color:var(--gold2)}
.of-pt{font-size:var(--fs-xs);color:var(--soft);overflow-wrap:anywhere}
.of-st{margin-top:auto;display:inline-flex;align-items:center;gap:6px;padding-top:4px;font-size:var(--fs-s);font-weight:600;color:var(--ac)}

.of-det .zx-h{flex-wrap:wrap}
.of-det .zx-h .zx-sum{flex:1;min-width:0}
.of-det .zx-row .n,.of-det .zx-row .m{white-space:nowrap;overflow:hidden;text-overflow:ellipsis;min-width:0}
.of-none{margin:0;color:var(--soft);font-size:var(--fs-s)}
.of-go{margin-top:10px}
.of-go button,.of-auftrag button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;padding:0 16px;border-radius:12px;border:1px solid rgba(226,198,143,.6);background:rgba(226,198,143,.12);color:var(--gold2);font:inherit;font-weight:600;cursor:pointer;white-space:nowrap}
.of-go button:disabled{opacity:.55;cursor:default}

.of-auftrag{display:flex;gap:8px;margin:0 0 14px}
.of-auftrag input{flex:1;min-width:0;min-height:44px;padding:0 14px;border-radius:12px;border:1px solid var(--line);background:rgba(2,8,18,.6);color:#fff;font:inherit}

.of-ueb{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;align-items:stretch;margin:0 0 14px}
.of-ueb>.zx-card{margin:0}
.of-pl{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:8px}
.of-pl li{display:grid;grid-template-columns:auto 56px minmax(0,1fr);grid-template-areas:"v a t" "v a s";column-gap:10px;align-items:center;min-width:0;margin:0;padding:8px 10px;border-radius:10px;background:var(--ab);border-left:3px solid var(--ac)}
.of-von{grid-area:v;font-weight:600;color:#fff;font-size:var(--fs-s);max-width:110px;overflow-wrap:anywhere}
.of-arrow{grid-area:a;position:relative;display:block;height:14px}
.of-arrow i{position:absolute;left:0;right:8px;top:6px;height:2px;background:var(--ac)}
.of-arrow::after{content:"";position:absolute;right:0;top:2px;border:5px solid transparent;border-left:8px solid var(--ac);border-right:0}
.of-ut{grid-area:t;min-width:0;font-size:var(--fs-s);color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.of-us{grid-area:s;min-width:0;font-size:var(--fs-xs);color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}

.of-extra{display:flex;flex-direction:column;gap:14px}
.of-extra>*{margin:0!important}
.of-fluss{display:flex;align-items:center;gap:12px;min-height:56px;padding:10px 16px;border:1px solid rgba(95,212,255,.3);border-radius:14px;background:var(--card);color:#fff;text-decoration:none}
.of-fluss .of-av{width:44px;height:44px;margin:0;--ac:var(--cy2);--ab:rgba(95,212,255,.08)}
.of-fluss b{flex:1;min-width:0}
.of-fluss:hover,.of-fluss:focus-visible{border-color:var(--cy2)}

@keyframes of-spin{to{transform:rotate(360deg)}}
@keyframes of-glow{0%,100%{box-shadow:0 0 6px -2px var(--ac)}50%{box-shadow:0 0 22px 2px var(--ac)}}
@keyframes of-blink{0%,100%{opacity:1}50%{opacity:.3}}
@media (prefers-reduced-motion:reduce){
  .of-p.s-arbeitet .of-av,.of-p.s-arbeitet .of-av::after,.of-live{animation:none!important}
}
@media (max-width:760px){
  .of-kopf{grid-template-columns:auto minmax(0,1fr);gap:12px;padding:12px}
  .of-rw{width:84px;height:84px}
  .of-pct{font-size:18px}
  .of-ziel b{font-size:26px}
  .of-team{grid-column:1/3;flex-direction:row;justify-content:center;gap:8px;min-width:0}
  .of-team b{font-size:22px}
  .of-grid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}
  .of-av{width:48px;height:48px}
  .of-ueb{grid-template-columns:minmax(0,1fr)}
  .of-auftrag{flex-direction:column}
}
`;

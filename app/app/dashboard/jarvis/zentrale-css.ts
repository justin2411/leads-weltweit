/**
 * CSS der JARVIS-Zentrale „Organigramm live“ (docs/DESIGN-KOMMANDOZENTRALE.md): Raster 12 Spalten (Karte 9 + Leitplanken 3),
 * 8-px-Abstand, alles bündig (align-items:stretch), Handy < 760 px eine Spalte. Farben: Nachtblau-Fläche, 1-px-Linien,
 * Cyan = läuft, Gold nur Geld/Premium, Rot/Gelb/Grün nur Status, Grau = aus/keine Daten. Bewegung nur mit Bedeutung;
 * prefers-reduced-motion schaltet jede Animation ab (Gegenblock unten), .jv-paused hält sie bei verstecktem Tab an.
 */
export const ZENTRALE_CSS = `
.dash:has(.jz) .top .in{display:none}
.dash:has(.jz) main{padding-top:8px}
.jz{--cy:var(--ds-cy,#5fd4ff);--gd:var(--ds-gold,#e2c68f);--rt:var(--ds-rot,#ff5e73);--gb:var(--ds-gelb,#ffb547);--gn:var(--ds-gruen,#3ddc97);--gr:var(--ds-grau,#5d7290);
  --fl:var(--ds-flaeche,rgba(9,24,48,.62));--ln:var(--ds-linie,rgba(95,212,255,.18));display:grid;gap:8px;margin:0 auto;max-width:1440px;min-width:0}
.jz section{margin:0}
.jz *{box-sizing:border-box}
.jz .mono,.jz b.z{font-family:var(--monof,ui-monospace),ui-monospace,monospace;font-variant-numeric:tabular-nums}
.jz .p{border:1px solid var(--ln);border-radius:12px;background:var(--fl);padding:8px 16px;min-width:0}
.jz .p>h2{margin:0 0 8px;font-size:13px;letter-spacing:.08em;text-transform:uppercase;color:#a8ecff;font-weight:600;display:flex;align-items:center;gap:8px}
.jz .p>h2 .r{margin-left:auto;font-family:var(--monof,ui-monospace),monospace;color:#8ba6c9;letter-spacing:0;text-transform:none;font-weight:400}
.jz a{color:inherit;text-decoration:none}
.jz .t-rot{--ac:var(--rt)}.jz .t-gelb{--ac:var(--gb)}.jz .t-gruen{--ac:var(--gn)}.jz .t-grau{--ac:var(--gr)}

/* B0 Kopfzeile */
.jz-kopf{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:stretch;gap:8px;min-height:56px}
.jz-kopf>*{display:flex;align-items:center;gap:12px;min-width:0;border:1px solid var(--ln);border-radius:12px;background:var(--fl);padding:0 16px}
.jz-marke b{font:700 18px/1 var(--hudf,inherit);letter-spacing:.14em;color:#fff}
.jz-uhr{font-family:var(--monof,ui-monospace),monospace;color:#d9ecff;font-size:15px;white-space:nowrap}
.jz-live{display:inline-flex;align-items:center;gap:6px;font-size:12px;color:#8ba6c9;white-space:nowrap}
.jz-live i{width:10px;height:10px;border-radius:50%;background:var(--gr)}
.jz-live.an i{background:var(--cy);box-shadow:0 0 10px var(--cy)}
.jz-lage{justify-content:center;text-align:center;cursor:pointer;background:var(--fl);color:#fff;font:600 15px/1.3 inherit;border:1px solid var(--ln);min-height:56px;width:100%}
.jz-lage span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jz-lage em{display:none;font-style:normal;font-weight:400;font-size:13px;color:#8ba6c9}
.jz-lage:hover em,.jz-lage:focus-visible em,.jz-lage[aria-expanded="true"] em{display:block}
.jz-lage:hover,.jz-lage:focus-visible,.jz-lage[aria-expanded="true"]{flex-direction:column;justify-content:center;gap:2px}
.jz-zaehl{gap:8px}
.jz-zaehl a,.jz-zaehl button{display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;min-width:44px;padding:0 12px;border-radius:22px;border:1px solid var(--ln);background:none;color:#d9ecff;font:600 13px/1 inherit;cursor:pointer}
.jz-zaehl .bd{border-color:rgba(255,181,71,.6);color:var(--gb)}
.jz-zaehl .an{border-color:rgba(95,212,255,.6);color:var(--cy)}
.jz-zaehl .heiss{width:10px;height:10px;border-radius:50%;background:var(--gd);box-shadow:0 0 10px var(--gd)}
.jz-zaehl form{display:contents}

/* B1 Ziel-Ringe */
.jz-ziele{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;align-items:stretch}
.jz-ziel{display:grid;grid-template-columns:56px minmax(0,1fr);align-items:center;gap:12px;min-height:72px;padding:8px 16px;border:1px solid var(--ln);border-radius:12px;background:var(--fl)}
.jz-ziel svg{width:56px;height:56px}
.jz-ziel .tr{fill:none;stroke:rgba(95,212,255,.14);stroke-width:7}
.jz-ziel .vl{fill:none;stroke:var(--cy);stroke-width:7;stroke-linecap:round;transition:stroke-dasharray .15s ease-out}
.jz-ziel.gold .vl{stroke:var(--gd)}
.jz-ziel.erst .vl{transition:stroke-dasharray .3s ease-out}
.jz-ziel.unb .tr{stroke-dasharray:3 4}
.jz-ziel b.z{display:block;font-size:18px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jz-ziel b.z small{font-size:13px;color:#8ba6c9;font-weight:400}
.jz-ziel span{display:block;font-size:13px;color:#8ba6c9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jz-ziel em{display:block;font-style:normal;font-size:12px;color:var(--gb);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jz-ziel .sp{display:block;height:16px;width:100%}
.jz-ziel .sp polyline{fill:none;stroke:var(--cy);stroke-width:1.5}

/* B1a KPI-Leiste (10 Kacheln), Ziel-Ring 25.000 € und Website-Trichter (docs/DESIGN-KOMMANDOZENTRALE.md „Designsystem“) */
.jz-kpi{display:grid;grid-template-columns:repeat(10,minmax(0,1fr));gap:8px;align-items:stretch}
.jz-kpi-k{position:relative;display:flex;flex-direction:column;justify-content:center;gap:0;min-width:0;min-height:80px;padding:8px 16px 12px;border:1px solid var(--ln);border-radius:12px;background:var(--fl);overflow:hidden}
.jz-kpi-k:hover,.jz-kpi-k:focus-visible{border-color:var(--cy)}
.jz-kpi-k .l{font-size:12px;letter-spacing:0;color:#a8ecff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jz-kpi-k b.z{font-size:24px;line-height:1.2;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jz-kpi-k .u{font-size:12px;color:#8ba6c9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jz-kpi-k .bar{position:absolute;left:0;right:0;bottom:0;height:2px;background:rgba(95,212,255,.12)}
.jz-kpi-k .bar i{position:absolute;inset:0;transform-origin:left;background:var(--ac,var(--cy));transition:transform .3s ease-out}
.jz-kpi-k.t-cy{--ac:var(--cy)}.jz-kpi-k.t-gold{--ac:var(--gd)}.jz-kpi-k.t-gruen{--ac:var(--gn)}.jz-kpi-k.t-gelb{--ac:var(--gb)}.jz-kpi-k.t-rot{--ac:var(--rt)}.jz-kpi-k.t-grau{--ac:var(--gr)}
.jz-kpi-k.t-gold b.z{color:var(--gd)}
.jz-kpi-k.t-gruen b.z,.jz-kpi-k.t-gelb b.z,.jz-kpi-k.t-rot b.z{color:var(--ac)}
.jz-kpi-k.t-grau b.z{color:#8ba6c9}
.jz-kpi-k:before{content:"";position:absolute;left:0;top:8px;bottom:8px;width:2px;border-radius:1px;background:var(--ac)}
.jz-umsatz{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:8px;align-items:stretch}
.jz-ring25{grid-column:1/5;display:flex;flex-direction:column}
.jz-tri{grid-column:5/13;display:flex;flex-direction:column}
.jz-ring25 .in{flex:1;display:grid;grid-template-columns:168px minmax(0,1fr);gap:16px;align-items:stretch}
.jz-ring25 .rg{position:relative;display:block;width:168px;height:168px;align-self:center}
.jz-ring25 .rg svg{width:168px;height:168px;display:block}
.jz-ring25 .tr{fill:none;stroke:rgba(226,198,143,.14);stroke-width:12}
.jz-ring25 .vl{fill:none;stroke:var(--gd);stroke-width:12;stroke-linecap:round;transition:stroke-dasharray .3s ease-out;filter:drop-shadow(0 0 6px rgba(226,198,143,.45))}
.jz-ring25 .mitte{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center}
.jz-ring25 .mitte b.z{font-size:24px;color:var(--gd);line-height:1.2}
.jz-ring25 .mitte span{font-size:12px;color:#8ba6c9}
.jz-ring25 .weg{display:flex;flex-direction:column;justify-content:center;gap:8px;min-width:0}
.jz-ring25 .zeile{margin:0;font-size:13px;color:#d9ecff}
.jz-ring25 .zeile b.z{font-size:24px;color:#fff;margin-right:4px}
.jz-ring25 .zeile span{display:block;color:#8ba6c9;font-size:12px}
.jz-ring25 .pkt{display:grid;grid-template-columns:repeat(17,minmax(0,1fr));gap:4px;align-items:stretch}
.jz-ring25 .pkt i{display:block;aspect-ratio:1;border-radius:50%;border:1px solid rgba(226,198,143,.35)}
.jz-ring25 .pkt i.an{background:var(--gd);border-color:var(--gd)}
.jz-ring25 .fuss{margin:0;font-size:12px;color:#8ba6c9}
.jz-ring25 .fuss .mono{color:#d9ecff}
.jz-wahl{display:inline-flex;gap:8px;flex-wrap:wrap;justify-content:flex-end}
.jz-wahl .grp{display:inline-flex;border:1px solid var(--ln);border-radius:16px;overflow:hidden}
.jz-wahl button{min-height:32px;min-width:40px;padding:0 8px;border:0;border-radius:0;background:none;color:#8ba6c9;font:600 12px/1 var(--monof,ui-monospace),monospace;cursor:pointer}
.jz-wahl button.on{background:rgba(95,212,255,.18);color:#fff}
.jz-tri .stufen{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;align-items:stretch;gap:8px;flex:1;justify-content:center}
.jz-tri .tst{width:100%;display:grid;grid-template-columns:112px minmax(0,1fr) 72px 96px;gap:8px;align-items:stretch;min-height:32px}
.jz-tri .tst>*{display:flex;align-items:center;min-width:0}
.jz-tri .tst .nm{font-size:13px;color:#d9ecff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jz-tri .tst .bahn{position:relative;background:rgba(95,212,255,.06);border-radius:4px;overflow:hidden}
.jz-tri .tst .fill{position:absolute;left:0;top:0;bottom:0;width:100%;transform-origin:left;background:linear-gradient(90deg,rgba(95,212,255,.5),rgba(95,212,255,.22));border-right:1px solid var(--cy);transition:transform .3s ease-out;overflow:hidden}
.jz-tri .tst.gold .fill{background:linear-gradient(90deg,rgba(226,198,143,.6),rgba(226,198,143,.25));border-right-color:var(--gd)}
.jz-tri .tst .licht{position:absolute;top:0;bottom:0;left:0;width:24px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.55),transparent);animation:jz-licht 4s linear infinite}
.jz-tri .tst b.z{justify-content:flex-end;font-size:18px;color:#fff}
.jz-tri .tst.gold b.z{color:var(--gd)}
.jz-tri .tst .q{font-family:var(--monof,ui-monospace),monospace;font-size:12px;color:#8ba6c9;white-space:nowrap}
.jz-tri .scan{margin:8px 0 0;display:flex;align-items:center;gap:4px;font-size:12px;color:#8ba6c9}
.jz-tri .scan b.z{color:#d9ecff;font-size:12px}
.jz-tri .hinweis{margin:8px 0 0;font-size:12px;color:#8ba6c9}
.jz-tri.laedt .stufen{opacity:.6}
.jz-tri .mehr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:16px;align-items:stretch;margin-top:8px;padding-top:8px;border-top:1px solid var(--ln)}
.jz-tri .mehr h3{margin:0 0 4px;font-size:12px;letter-spacing:.06em;text-transform:uppercase;color:#a8ecff;font-weight:600}
.jz-tri .bars{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:4px}
.jz-tri .bars li{display:grid;grid-template-columns:minmax(0,9fr) minmax(0,8fr) 48px;gap:8px;align-items:stretch;font-size:12px;color:#d9ecff;min-height:24px}
.jz-tri .bars li>*{display:flex;align-items:center;min-width:0}
.jz-tri .bars li>span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;line-height:24px}
.jz-tri .bars li>i{position:relative;height:6px;align-self:center;background:rgba(95,212,255,.08);border-radius:3px}
.jz-tri .bars li>i>i{position:absolute;left:0;top:0;bottom:0;background:var(--cy);border-radius:3px}
.jz-tri .bars li b.z{justify-content:flex-end;font-size:12px}
.jz-tri .bars li.nix{display:block;color:#8ba6c9}
.jz-tri .stand{margin:8px 0 0;display:flex;justify-content:space-between;font-size:12px;color:#8ba6c9}
.jz-tri .stand a{color:var(--cy)}
@keyframes jz-licht{from{transform:translateX(-24px)}to{transform:translateX(100vw)}}

/* Raster Karte 9 + Leitplanken 3 */
.jz-raster{display:grid;grid-template-columns:repeat(12,minmax(0,1fr));gap:8px;align-items:stretch}
.jz-links{grid-column:1/10;display:flex;flex-direction:column;gap:8px;min-width:0}
.jz-planken{grid-column:10/13}
.jz-links>.jz-werke{flex:1}

/* B2 Du + B3 Gehirn */
.jz-kern{display:grid;grid-template-columns:minmax(0,1fr) auto minmax(0,1fr);align-items:center;gap:8px;padding:8px 16px}
.jz-du{grid-column:1;justify-self:end;display:flex;flex-direction:column;align-items:center;gap:8px;min-width:0;max-width:100%}
.jz-du a.du{position:relative;display:grid;place-items:center;width:64px;height:64px;border-radius:50%;border:1px solid var(--gd);color:var(--gd);font:700 15px/1 inherit}
.jz-du a.du.ruf:after{content:"";position:absolute;inset:-6px;border-radius:50%;border:2px solid var(--gb);opacity:0}
.jz-du a.du b{position:absolute;top:-4px;right:-4px;min-width:20px;height:20px;padding:0 6px;border-radius:10px;background:var(--gb);color:#04101f;font-size:12px;line-height:20px;text-align:center}
.jz-lampen{display:flex;flex-wrap:wrap;justify-content:center;gap:4px;max-width:min(100%,188px)}
.jz-lampen a{display:grid;justify-items:center;align-content:center;gap:4px;width:60px;min-height:48px;padding:6px 0;border-radius:10px;border:1px solid var(--ln)}
.jz-lampen small{font-size:12px;line-height:1;color:#8ba6c9;white-space:nowrap}
.jz-lampen i{width:10px;height:10px;border-radius:50%;background:var(--gr)}
.jz-lampen a.an i{background:var(--gn);box-shadow:0 0 8px var(--gn)}
.jz-lampen a.aus i{background:var(--rt)}
.jz-strang{grid-column:3;justify-self:start;display:flex;flex-direction:column;gap:8px;font-size:13px;color:#8ba6c9}
.jz-strang b.z{color:#fff;font-size:15px}
.jz-hirn{grid-column:2;position:relative;width:min(340px,70vw);aspect-ratio:1}
.jz-hirn svg{width:100%;height:100%;overflow:visible}
.jz-hirn .seg{fill:rgba(95,212,255,.08);stroke:rgba(95,212,255,.35);stroke-width:1;cursor:pointer}
.jz-hirn .seg.grau{fill:url(#jz-schraffur);stroke:rgba(93,114,144,.6)}
.jz-hirn .seg.akt{fill:rgba(95,212,255,.32);stroke:var(--cy);filter:drop-shadow(0 0 6px rgba(95,212,255,.8))}
.jz-hirn .seg:hover,.jz-hirn a:focus-visible .seg{stroke:#fff}
.jz-hirn text{fill:#d9ecff;font-size:13px;text-anchor:middle;dominant-baseline:central;pointer-events:none}
.jz-hirn text.w{font-weight:600;font-size:14px}
.jz-hirn text.n{font-family:var(--monof,ui-monospace),monospace;fill:#8ba6c9}
.jz-hirn .ring{transform-origin:200px 200px;transform-box:view-box}
.jz-hirn .strich{fill:none;stroke:rgba(95,212,255,.4);stroke-width:1.5;stroke-dasharray:2 12}
.jz-hirn.dreht .ring{animation:jz-dreh 60s linear infinite}
.jz-kernfeld{position:absolute;inset:27%;display:grid;place-items:center;align-content:center;gap:2px;border-radius:50%;text-align:center;
  background:radial-gradient(circle,rgba(95,212,255,.28),rgba(8,30,60,.85) 70%);border:1px solid rgba(95,212,255,.5)}
.jz-kernfeld b.w{font:700 20px/1 var(--hudf,inherit);letter-spacing:.12em;color:#fff}
.jz-kernfeld span{font-size:13px;color:#8ba6c9}
.jz-kernfeld .z{font-size:15px;color:var(--cy)}
.jz-hirn.aus .jz-kernfeld{background:rgba(30,40,56,.8);border-color:var(--gr)}
.jz-hirn.aus .jz-kernfeld b.w{color:#8ba6c9}
.jz-hirn .herz{position:absolute;inset:25%;border-radius:50%;border:2px solid var(--cy);opacity:0;pointer-events:none}
.jz-hirn.schlag .herz{animation:jz-herz var(--takt,3s) ease-out infinite}

/* B4 Bereiche + Agenten */
.jz-bereiche{position:relative}
.jz-bgrid{position:relative;display:grid;grid-template-columns:repeat(9,minmax(0,1fr));gap:8px;align-items:stretch}
.jz-b{position:relative;display:flex;flex-direction:column;align-items:center;gap:4px;min-height:88px;padding:8px 4px;border:1px solid var(--ln);border-radius:10px;background:rgba(4,14,30,.6);text-align:center}
.jz-b.gold{border-color:rgba(226,198,143,.55)}
.jz-b.rang1{border-color:var(--gb);box-shadow:0 0 0 1px var(--gb) inset}
.jz-b.on{border-color:var(--cy);background:rgba(95,212,255,.14)}
.jz-b .ic{color:var(--cy)}.jz-b.gold .ic{color:var(--gd)}
.jz-b .nm{font-size:12px;color:#d9ecff;line-height:1.2;max-width:100%;overflow:hidden;white-space:normal;hyphens:manual;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical}
.jz-b .ab{display:flex;align-items:center;gap:6px}
.jz-b .amp{width:10px;height:10px;border-radius:50%;background:var(--ac,var(--gr))}
.jz-b .pk{display:flex;gap:4px;flex-wrap:wrap;justify-content:center}
.jz-b .pk i{width:8px;height:8px;border-radius:50%;background:rgba(95,212,255,.25)}
.jz-b .pk i.l{background:var(--cy);box-shadow:0 0 6px var(--cy)}
.jz-b .bdg{display:none}
.jz-uebergabe{position:absolute;left:0;right:0;top:0;height:100%;pointer-events:none;overflow:visible}
.jz-bereiche .jz-bgrid{margin-top:16px}
.jz-uebergabe path{fill:none;stroke:rgba(95,212,255,.35);stroke-width:1;stroke-dasharray:3 3}
.jz-uebergabe circle{fill:var(--cy)}
.jz-scout{display:flex;align-items:center;gap:8px;margin:8px 0 0;font-size:13px;color:#8ba6c9}
.jz-scout i{width:10px;height:10px;border-radius:50%;background:var(--gr)}
.jz-scout.an i{background:var(--cy);box-shadow:0 0 8px var(--cy)}
.jz-scout.grau i{background:none;border:1px dashed var(--gr)}
.jz-spur{display:grid;grid-template-columns:minmax(0,1fr);gap:8px;align-items:stretch;margin-top:8px}
.jz-spur>span{font-size:12px;color:#8ba6c9;letter-spacing:.06em;text-transform:uppercase}
.jz .ags{margin:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:8px;overflow:visible;padding:0;align-items:stretch}
.jz .ags .ag{min-width:0}
.jz .ag-t,.jz .ag-s{white-space:normal;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;line-height:1.25}
.jz .ags.kompakt{grid-template-columns:repeat(auto-fill,minmax(64px,1fr));align-items:stretch}
.jz .ags.kompakt .ag{grid-template-columns:54px;grid-template-areas:"o";justify-content:center;padding:8px 4px}
.jz .ag.jz-neu .ag-orb{box-shadow:0 0 0 2px var(--cy)}
.jz .ag.jz-neu.gold .ag-orb{box-shadow:0 0 0 2px var(--gd)}
.jz .ag.jz-neu .ag-orb:before{content:"";position:absolute;left:50%;top:-14px;width:6px;height:6px;margin-left:-3px;border-radius:50%;background:var(--cy);animation:jz-fall 1.6s ease-in infinite}
.jz .ag.jz-neu.gold .ag-orb:before{background:var(--gd)}
.jz .ag .ag-orb{position:relative}
.jz .ags.kompakt .ag-t,.jz .ags.kompakt .ag-s,.jz .ags.kompakt .ag-brain{display:none}

/* B5 Werke-Karte */
.jz-werke{display:flex;flex-direction:column}
.jz-wk{position:relative;width:100%}
.jz-wk.breit{aspect-ratio:1000/480}
.jz-wk.hoch{display:none;aspect-ratio:360/960}
.jz-wk svg.kanten{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.jz-wk .k{fill:none;stroke:rgba(95,212,255,.45);stroke-width:1.5}
.jz-wk .k.leer{stroke:rgba(93,114,144,.35);stroke-dasharray:2 4}
.jz-wk .k.ast{stroke:rgba(226,198,143,.45);stroke-dasharray:4 4}
.jz-wk .k.grau{stroke:rgba(93,114,144,.45);stroke-dasharray:4 4}
.jz-wk .k.rahmen{stroke:rgba(95,212,255,.25)}
.jz-wk .pt{fill:var(--cy);filter:drop-shadow(0 0 4px var(--cy))}
.jz-wk .pt.gold{fill:var(--gd)}
.jz-wk .ab{fill:var(--gb)}
.jz-wk text.rate{font-size:12px;fill:#8ba6c9;text-anchor:middle;font-family:var(--monof,ui-monospace),monospace;display:none}
.jz-wk text.rate.seite{text-anchor:start}
.jz-wk .tick{fill:var(--cy)}
.jz-w{position:absolute;transform:translate(-50%,-50%);width:16%;display:flex;flex-direction:column;gap:2px;padding:8px;border:1px solid var(--ln);border-radius:10px;
  background:rgba(4,14,30,.92);transition:opacity .3s,border-color .3s;min-width:0}
.jz-w:hover,.jz-w:focus-visible{border-color:var(--cy)}
.jz-w.on{border-color:var(--cy);box-shadow:0 0 0 1px var(--cy)}
.jz-w .kz{display:flex;align-items:center;gap:4px;font-size:12px;color:#d9ecff;min-width:0}
.jz-w .kz span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.jz-w b.z{font-size:18px;color:#fff;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jz-w em{font-style:normal;font-size:12px;color:#8ba6c9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jz-w.gold{border-color:rgba(226,198,143,.7)}
.jz-w.gold b.z{color:var(--gd)}
.jz-w.grau{border-style:dashed;border-color:rgba(93,114,144,.6);background:rgba(4,14,30,.6)}
.jz-w.grau b.z,.jz-w.grau .kz{color:#8ba6c9}
.jz-w.dim{opacity:.3}
.jz-w.stau{border-color:var(--gb);box-shadow:0 0 18px -2px var(--gb)}
.jz-w .stauw{color:var(--gb);font-weight:700}
.jz-w.nutzt{outline:1px dashed var(--cy);outline-offset:3px}
.jz-w .ags2{display:flex;gap:4px;flex-wrap:wrap}
.jz-w .ags2 i{font:600 12px/16px var(--monof,ui-monospace),monospace;font-style:normal;padding:0 4px;border-radius:4px;border:1px dashed var(--cy);color:var(--cy)}
.jz-w.chip{width:auto;max-width:22%;flex-direction:row;align-items:center;padding:4px 8px;border-radius:14px}
.jz-w.chip em{display:none}
.jz-w.chip b.cz{flex:none;font:600 13px/1 var(--monof,ui-monospace),monospace;font-variant-numeric:tabular-nums;color:#fff;margin-left:4px}
.jz-w.chip.gold b.cz{color:var(--gd)}
.jz-pp{position:relative;flex:none;width:10px;height:10px;border-radius:50%;background:var(--gr)}
.jz-pp.live,.jz-pp.live-{background:var(--cy);box-shadow:0 0 8px var(--cy)}
.jz-pp.live:after,.jz-pp.live-:after{content:"";position:absolute;inset:-4px;border-radius:50%;border:1px solid var(--cy);opacity:0;animation:jz-puls 2s ease-out infinite}
.jz-pp.still{background:#2a3c56}
.jz-pp.grau{background:none;border:1px dashed var(--gr)}
.jz-w .tl{font:600 12px/1 var(--monof,ui-monospace),monospace;color:var(--cy)}
.jz-mr{flex:none;margin-left:auto;width:22px;height:22px}
.jz-mr .a{fill:none;stroke:rgba(95,212,255,.18);stroke-width:4}
.jz-mr .b{fill:none;stroke:var(--cy);stroke-width:4}
.jz-mr .c{fill:none;stroke:var(--gd);stroke-width:1}
.jz-plaetze{display:flex;align-items:center;gap:8px}
.jz-kl{display:flex;gap:2px;flex-wrap:wrap;max-width:280px}
.jz-kl i{width:5px;height:10px;border-radius:1px;background:rgba(95,212,255,.12)}
.jz-kl i.l{background:var(--cy)}
.jz-kl i.p{background:rgba(95,212,255,.4)}
.jz-kl.wander i.l{animation:jz-wander .3s ease-out}
.jz-wh{display:flex;align-items:center;gap:8px;font-size:12px;color:#8ba6c9}

/* B6 Leitplanken */
.jz-planken{display:flex;flex-direction:column;gap:8px}
.jz-planken ul{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:minmax(0,1fr);gap:8px;flex:1;align-content:stretch}
.jz-pl{display:grid;grid-template-columns:auto minmax(0,1fr);grid-template-rows:auto auto auto auto;align-items:center;align-content:center;row-gap:2px;column-gap:8px;min-height:64px;height:100%;padding:8px 12px;
  border:1px solid var(--ln);border-left:3px solid var(--ac,var(--gr));border-radius:10px;background:rgba(4,14,30,.6)}
.jz-pl .ic{grid-column:1;grid-row:1/3;color:var(--ac,var(--gr))}
@media (min-width:1101px){.jz-pl b.z{font-size:24px}}
.jz-pl b.nm{grid-column:2;grid-row:1}.jz-pl .wd{grid-column:2;grid-row:2}
.jz-pl b.nm{font-size:13px;color:#fff;text-transform:uppercase;letter-spacing:.06em;white-space:normal;overflow-wrap:anywhere;line-height:1.2}
.jz-pl .wd{font-size:12px;color:var(--ac,#8ba6c9);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jz-pl b.z{grid-column:1/3;grid-row:3;font-size:18px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;margin-top:4px}
.jz-pl em{grid-column:1/3;grid-row:4;font-style:normal;font-size:12px;color:#8ba6c9;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jz-pl.gold{border-left-color:var(--gd)}.jz-pl.gold .ic{color:var(--gd)}
.jz-pl.blitz{animation:jz-blitz .3s ease-out}
.jz-pl.greift{animation:jz-greift 1s ease-in-out infinite}
.jz-pl b.z.zt{color:var(--ac,#fff)}

/* B7 Ticker */
.jz-ticker{display:flex;align-items:center;gap:12px;min-height:44px;padding:0 16px;border:1px solid var(--ln);border-radius:12px;background:var(--fl);overflow:hidden}
.jz-ticker>b{font-size:12px;letter-spacing:.08em;color:#a8ecff;text-transform:uppercase}
.jz-ticker ol{list-style:none;margin:0;padding:0;display:flex;gap:16px;min-width:0;overflow:hidden}
.jz-ticker li{display:flex;align-items:center;gap:6px;white-space:nowrap;font-size:13px;color:#d9ecff}
.jz-ticker li time{font-family:var(--monof,ui-monospace),monospace;color:#8ba6c9}
.jz-ticker li.neu{animation:jz-rein .2s ease-out}
.jz-ticker li a{display:inline-flex;align-items:center;min-height:44px}

/* Seitenfenster */
.jz .drw{position:fixed;top:72px;right:16px;max-height:calc(100vh - 96px);width:420px;z-index:45}
.jz .drw .ring2{display:grid;grid-template-columns:96px minmax(0,1fr);gap:12px;align-items:center}
.jz .drw ul.l{list-style:none;margin:0;padding:0;display:grid;gap:8px}
.jz .drw ul.l li{display:grid;gap:2px;padding:8px 12px;border:1px solid var(--ln);border-radius:8px}
.jz .drw ul.l li b{font-size:13px;color:#fff}
.jz .drw ul.l li span{font-size:13px;color:#8ba6c9}
.jz .drw ul.l li time{font-size:12px;color:#8ba6c9;font-family:var(--monof,ui-monospace),monospace}
.jz .drw .big{font:700 28px/1.1 var(--monof,ui-monospace),monospace;color:#fff}
.jz .drw .lnk{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border-radius:22px;border:1px solid rgba(226,198,143,.5);color:var(--gd)}
.jz .drw .stop{min-height:44px;padding:0 16px;border-radius:22px;border:1px solid var(--rt);background:rgba(255,94,115,.12);color:#fff;font:600 13px/1 inherit;cursor:pointer}
.jz .drw .go{min-height:44px;padding:0 16px;border-radius:22px;border:1px solid var(--cy);background:rgba(95,212,255,.12);color:#fff;font:600 13px/1 inherit;cursor:pointer}
.jz .drw .reihe{display:flex;flex-wrap:wrap;gap:8px;align-items:center}
.jz .drw .bd{margin:0;padding:0;border:0;background:none}

/* Chat-Knopf: siehe kopf.tsx (.jfab) */
.jz-funke{position:fixed;left:50%;top:80px;transform:translateX(-50%);z-index:50;margin:0;padding:8px 16px;border-radius:22px;border:1px solid var(--gd);background:rgba(40,30,10,.9);color:var(--gd);font-weight:700;box-shadow:0 0 24px var(--gd)}
.dash nav.seg a{min-height:44px;display:inline-flex;align-items:center;gap:6px}

@keyframes jz-puls{0%{transform:scale(.6);opacity:.9}100%{transform:scale(1.8);opacity:0}}
@keyframes jz-herz{0%{transform:scale(.92);opacity:.8}100%{transform:scale(1.25);opacity:0}}
@keyframes jz-dreh{to{transform:rotate(360deg)}}
@keyframes jz-fall{0%{transform:translateY(-6px);opacity:0}30%{opacity:1}100%{transform:translateY(12px);opacity:0}}
@keyframes jz-wander{0%{transform:translateX(-6px);opacity:.3}100%{transform:none;opacity:1}}
@keyframes jz-blitz{0%{box-shadow:0 0 0 0 var(--ac)}50%{box-shadow:0 0 16px 2px var(--ac)}100%{box-shadow:none}}
@keyframes jz-greift{0%,100%{box-shadow:0 0 0 0 var(--ac)}50%{box-shadow:0 0 14px 1px var(--ac)}}
@keyframes jz-rein{from{transform:translateX(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes jz-ruf{0%{transform:scale(.9);opacity:.9}100%{transform:scale(1.3);opacity:0}}
.jz-du a.du.ruf:after{animation:jz-ruf 1.6s ease-out infinite}

.jv-paused *,.jv-paused *:before,.jv-paused *:after{animation-play-state:paused!important}

@media (prefers-reduced-motion:reduce){
  .jz *,.jz *:before,.jz *:after{animation:none!important;transition:none!important}
  .jz-pp.live:after,.jz-pp.live-:after{display:none}
  .jz-wk text.rate{display:block}
  .jz .ag.jz-neu .ag-orb:before{display:none}
}

@media (min-width:1101px) and (max-width:1400px){
  .jz{padding-right:64px}
}
@media (max-width:1400px){
  .jz-kpi{grid-template-columns:repeat(5,minmax(0,1fr))}
}
@media (max-width:1100px){
  .jz-umsatz{grid-template-columns:minmax(0,1fr)}
  .jz-ring25,.jz-tri{grid-column:auto}
  .jz-ziele{grid-template-columns:repeat(2,minmax(0,1fr))}
  /* mittlere Breite: Karte über die volle Breite, Leitplanken als Leiste darunter (Kacheln bleiben überschneidungsfrei) */
  .jz-raster{grid-template-columns:minmax(0,1fr)}
  .jz-links,.jz-planken{grid-column:auto}
  .jz-planken ul{grid-template-columns:repeat(2,minmax(0,1fr))}
  .jz-w b.z{font-size:15px}
  .jz-w .jz-mr{display:none}
}
@media (min-width:760px) and (max-width:1100px){
  .jz-kern{grid-template-columns:minmax(0,1fr) auto}
  .jz-du{grid-column:1;grid-row:1;justify-self:center;align-self:end}
  .jz-strang{grid-column:1;grid-row:2;justify-self:center;align-self:start;align-items:center;text-align:center}
  .jz-hirn{grid-column:2;grid-row:1/3}
}
@media (max-width:759px){
  .jz-kpi{grid-template-columns:repeat(2,minmax(0,1fr))}
  .jz-kpi-k{min-height:72px;padding:8px 12px 12px}
  .jz-kpi-k b.z{font-size:18px}
  .jz-ring25 .in{grid-template-columns:minmax(0,1fr);justify-items:center}
  .jz-ring25 .weg{width:100%;max-width:320px}
  .jz-tri>h2{flex-wrap:wrap}
  .jz-tri>h2 .r{margin-left:0;width:100%;justify-content:flex-start}
  .jz-wahl button{min-height:44px;min-width:44px}
  .jz-tri .tst{grid-template-columns:96px minmax(0,1fr) 56px;row-gap:0}
  .jz-tri .tst .q{grid-column:2/4;justify-content:flex-end}
  .jz-tri .mehr{grid-template-columns:minmax(0,1fr)}
  .jz-kopf{grid-template-columns:minmax(0,1fr) auto}
  .jz-kopf .jz-lage{grid-column:1/3;grid-row:2}
  .jz-kopf>*{padding:0 12px;overflow:hidden}
  .jz-uhr .wt,.jz-live .lt{display:none}
  .jz-ziel{grid-template-columns:40px minmax(0,1fr);gap:8px;padding:8px 12px}
  .jz-ziel svg{width:40px;height:40px}
  .jz-ziel b.z{font-size:15px}
  .jz-ziel b.z small{display:block;font-size:12px}
  .jz-kernfeld .rd{font-size:12px}
  .jz-raster{grid-template-columns:minmax(0,1fr)}
  .jz-links{display:contents}
  .jz-planken{grid-column:auto;order:2}
  .jz-kern{order:1}.jz-bereiche{order:3}.jz-werke{order:4}
  .jz-planken ul{grid-template-columns:repeat(3,minmax(0,1fr))}
  .jz-pl{grid-template-columns:minmax(0,1fr);grid-template-rows:auto;justify-items:center;text-align:center;padding:8px 4px;gap:2px;min-height:96px}
  .jz-pl .ic,.jz-pl b.nm,.jz-pl .wd{grid-column:auto;grid-row:auto}
  .jz-pl b.z,.jz-pl em{grid-column:auto;grid-row:auto;text-align:center}
  .jz-pl em{display:none}
  .jz-pl b.z{font-size:13px;white-space:normal;overflow-wrap:anywhere}
  .jz-pl b.nm{font-size:12px;letter-spacing:.02em;white-space:normal}
  .jz-pl .wd{max-width:100%;white-space:normal;overflow-wrap:anywhere}
  .jz-pl b.z.zt{color:var(--ac,#fff)}
  .jz-kern{grid-template-columns:minmax(0,1fr);justify-items:center}
  .jz-du,.jz-strang,.jz-hirn{grid-column:1;justify-self:center}
  .jz-strang{flex-direction:row;flex-wrap:wrap;justify-content:center;text-align:center}
  .jz-hirn{width:min(300px,82vw)}
  .jz-bgrid{grid-template-columns:repeat(3,minmax(0,1fr))}
  .jz-b{min-height:72px}
  .jz-b .nm{font-size:12px;line-height:1.15}
  .jz-b .pk{display:none}
  .jz-b .bdg{display:inline-block;font:600 12px/18px var(--monof,ui-monospace),monospace;min-width:20px;padding:0 6px;border-radius:9px;border:1px solid var(--ln);color:#d9ecff}
  .jz-uebergabe{display:none}
  .jz-spur{grid-template-columns:minmax(0,1fr)}
  .jz-wk.breit{display:none}
  .jz-wk.hoch{display:block}
  .jz-w{width:44%}
  .jz-w.chip{max-width:44%}
  .jz-ticker ol li:nth-child(n+2){display:none}
  .jz-ticker ol,.jz-ticker li{min-width:0}
  .jz-ticker li a{overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:block;line-height:44px}
  .jz .drw{top:auto;right:0;left:0;bottom:0;width:auto;max-height:78vh}
  .jz-plaetze .jz-kl{display:none}
}
`;

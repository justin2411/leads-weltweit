/**
 * Gemeinsames Aussehen der Abteilungs-Seiten Recht, Betrieb, Protokoll (Präfix zx-, Farben aus hud-css.ts/ampel.ts).
 * Bündig (Inhaber 04.10.2026): Karten in einer Zeile strecken sich (align-items:stretch), keine Abstände über Karten.
 * Handy zuerst: 390 px ohne Querscroll.
 */
export const ZX_CSS = `
.zx{max-width:var(--wmax,1240px);margin:0 auto;padding-bottom:40px}
.zx-head{display:flex;align-items:center;gap:8px 12px;flex-wrap:wrap;margin:4px 0 12px}
.zx-head h1{margin:0 auto 0 0;font-size:var(--fs-xl);letter-spacing:.12em;text-transform:uppercase;color:#fff;display:flex;align-items:center;gap:10px}
.zx-at{font-size:var(--fs-s);color:var(--soft)}
.zx-link{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 14px;border-radius:99px;border:1px solid rgba(226,198,143,.5);color:var(--gold2);text-decoration:none;font-size:var(--fs-s);font-weight:600}
.zx-link:hover{background:rgba(226,198,143,.1)}
.zx-a-green{--ac:var(--amp-green);--ab:var(--amp-green-bg)}.zx-a-gold{--ac:var(--amp-gold);--ab:var(--amp-gold-bg)}
.zx-a-red{--ac:var(--amp-red);--ab:var(--amp-red-bg)}.zx-a-grey{--ac:var(--amp-grey);--ab:var(--amp-grey-bg)}
.zx-dot{display:inline-block;flex:none;width:10px;height:10px;border-radius:50%;background:var(--ac);box-shadow:0 0 8px color-mix(in srgb,var(--ac) 60%,transparent)}
.zx-pill{display:inline-flex;align-items:center;gap:6px;padding:3px 10px;border-radius:99px;background:var(--ab);color:var(--ac);font-size:var(--fs-xs);font-weight:600;white-space:nowrap}

/* Kopf-Kacheln: eine Zeile, gleich hoch */
.zx-tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px;align-items:stretch;margin:0 0 14px}
.zx-tile{display:flex;flex-direction:column;gap:4px;min-width:0;padding:12px 14px;border:1px solid var(--line);border-left:3px solid var(--ac);border-radius:12px;background:var(--card);color:inherit;text-decoration:none}
a.zx-tile:hover{border-color:var(--ac)}
.zx-tile b{font-family:var(--mono);font-size:var(--fs-l);color:#fff;font-weight:600;overflow-wrap:anywhere}
.zx-tile span{font-size:var(--fs-xs);letter-spacing:.1em;text-transform:uppercase;color:var(--cy2)}
.zx-tile em{font-style:normal;font-size:var(--fs-s);color:var(--soft);overflow-wrap:anywhere}

/* Karten */
.zx-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;align-items:stretch;margin:0 0 14px}
.zx-grid>*{margin:0!important}
.zx-card{min-width:0;padding:14px 16px;border:1px solid var(--line);border-radius:14px;background:var(--card);margin:0 0 14px}
.zx-grid>.zx-card{margin:0}
.zx-h{display:flex;align-items:center;gap:8px;margin:0 0 10px;min-width:0}
.zx-h h2{margin:0;font-size:var(--fs-xs);letter-spacing:.14em;text-transform:uppercase;color:var(--cy2);display:flex;align-items:center;gap:8px}
.zx-h .zx-sum{margin-left:auto;font-size:var(--fs-s);color:var(--soft);text-align:right}
.zx-card p{margin:0;color:var(--soft);font-size:var(--fs-s)}
.zx-card p+p{margin-top:6px}
.zx-big{font-family:var(--mono);font-size:var(--fs-num);color:#fff;font-weight:600;line-height:1.1}
.zx-check{display:flex;gap:10px;align-items:flex-start}
.zx-check .zx-dot{margin-top:6px}
.zx-check b{display:block;color:#fff;font-size:var(--fs-m)}

/* Zeilen-Liste (statt Tabelle, bricht auf dem Handy um) */
.zx-rows{display:flex;flex-direction:column;gap:2px;margin:0;padding:0;list-style:none}
.zx-row{display:grid;grid-template-columns:14px minmax(0,1.3fr) minmax(0,1fr) auto;gap:4px 10px;align-items:center;padding:8px 4px;border-bottom:1px solid rgba(95,212,255,.08);font-size:var(--fs-s)}
.zx-row:last-child{border-bottom:0}
.zx-row .n{color:#fff;font-weight:600;min-width:0;overflow-wrap:anywhere;text-align:left}
.zx-row .m{color:var(--soft);min-width:0;overflow-wrap:anywhere;text-align:left}
.zx-row .v{font-family:var(--mono);color:#fff;text-align:right;white-space:nowrap}
.zx-row a{color:inherit}
.zx-legend{display:flex;flex-wrap:wrap;gap:6px 14px;margin:10px 0 0;font-size:var(--fs-xs);color:var(--soft)}
.zx-legend span{display:inline-flex;align-items:center;gap:6px}

/* Sperrliste: Balken je Grund */
.zx-bars{display:flex;flex-direction:column;gap:8px}
.zx-bar{display:grid;grid-template-columns:96px minmax(0,1fr) auto;gap:10px;align-items:center;font-size:var(--fs-s)}
.zx-bar i{display:block;height:10px;border-radius:99px;background:rgba(95,212,255,.10);overflow:hidden}
.zx-bar i>s{display:block;height:100%;border-radius:99px;background:var(--ac);text-decoration:none}
.zx-bar span{color:var(--soft)}
.zx-bar b{font-family:var(--mono);color:#fff;font-weight:600;white-space:nowrap}

/* Schalter */
.zx-sw{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px;align-items:stretch}
.zx-sw>div{display:flex;align-items:center;gap:8px;min-width:0;padding:8px 10px;border:1px solid var(--line);border-radius:10px;font-size:var(--fs-s);color:#fff}
.zx-sw>div em{margin-left:auto;font-style:normal;color:var(--ac);font-weight:600;white-space:nowrap}
.zx-sw>div.fest{border-style:dashed}

/* Protokoll */
.zx-chips{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 12px}
.zx-chips a{display:inline-flex;align-items:center;gap:6px;min-height:34px;padding:0 12px;border-radius:99px;border:1px solid var(--line);color:var(--soft);text-decoration:none;font-size:var(--fs-s)}
.zx-chips a.on{border-color:var(--cy);color:#fff;background:rgba(95,212,255,.12)}
.zx-chips a small{font-family:var(--mono);color:var(--cy2)}
.zx-chips .sp{flex:0 0 12px}
.zx-day{margin:0 0 14px}
.zx-day>h3{margin:0 0 6px;font-size:var(--fs-xs);letter-spacing:.14em;text-transform:uppercase;color:var(--cy2)}
.zx-ev{border:1px solid var(--line);border-radius:12px;background:var(--card);margin:0 0 6px}
.zx-ev>summary,.zx-ev>div{display:grid;grid-template-columns:52px 86px minmax(0,1fr);gap:2px 10px;align-items:baseline;padding:10px 12px;list-style:none}
.zx-ev>summary{cursor:pointer}
.zx-ev>summary::-webkit-details-marker{display:none}
.zx-ev time{font-family:var(--mono);font-size:var(--fs-s);color:var(--soft)}
.zx-ev .b{font-size:var(--fs-xs);color:var(--cy2);font-weight:600;text-transform:uppercase;letter-spacing:.08em}
.zx-ev .t{color:#fff;font-weight:600;min-width:0;overflow-wrap:anywhere}
.zx-ev .g{grid-column:3;color:var(--soft);font-size:var(--fs-s);min-width:0;overflow-wrap:anywhere}
.zx-ev .more{grid-column:3;color:var(--cy2);font-size:var(--fs-xs)}
.zx-ev[open] .more{display:none}
.zx-ev pre{margin:0 12px 10px;padding:10px 12px;border-radius:8px;background:rgba(0,0,0,.25);color:var(--soft);font:inherit;font-size:var(--fs-s);white-space:pre-wrap;overflow-wrap:anywhere}
.zx-none{color:var(--soft);font-size:var(--fs-s);margin:0}
.zx-err{margin:0 0 12px;padding:10px 12px;border:1px solid rgba(255,94,115,.5);border-radius:10px;background:var(--red-bg);color:#ffb3bd;font-weight:600}

@media (max-width:760px){
  .zx-grid{grid-template-columns:minmax(0,1fr)}
  .zx-row{grid-template-columns:14px minmax(0,1fr) auto}
  .zx-row .m{grid-column:2/4;grid-row:2}
  .zx-ev>summary,.zx-ev>div{grid-template-columns:44px minmax(0,1fr)}
  .zx-ev .b{grid-column:2}
  .zx-ev .t,.zx-ev .g,.zx-ev .more{grid-column:1/3}
  .zx-bar{grid-template-columns:84px minmax(0,1fr) auto}
}
`;

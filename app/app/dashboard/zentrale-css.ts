/**
 * Kommandozentrale (Finanzen, Vertrieb, Ziele): gemeinsames HUD-Design wie Speicher. Nur Klassen mit Präfix zt-.
 * Bündig (Inhaber 04.10.2026): alle Reihen als Grid mit align-items:stretch, Karten als Spalten-Flex; kein <section>
 * (globaler Abstand). Ampelfarben nur über var(--amp-…) (lib/ampel.ts).
 */
export const ZENTRALE_CSS = `
.zt{display:grid;gap:18px;min-width:0}
.zt-head{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin:4px 0 0}
.zt-head h1{margin:0;font-family:var(--hud);font-size:28px;font-weight:700;letter-spacing:.28em;text-transform:uppercase;color:#fff;text-shadow:0 0 22px rgba(95,212,255,.55)}
.zt-head .zt-at{font-size:13px;color:var(--soft)}
.zt-card{position:relative;display:flex;flex-direction:column;gap:12px;background:var(--card);border:1px solid var(--line);border-radius:6px;padding:16px 18px 18px;min-width:0;
  clip-path:polygon(0 10px,10px 0,calc(100% - 10px) 0,100% 10px,100% calc(100% - 10px),calc(100% - 10px) 100%,10px 100%,0 calc(100% - 10px))}
.zt-card h2{margin:0;font-family:var(--hud);font-size:15px;font-weight:600;letter-spacing:.14em;text-transform:uppercase;color:var(--cy2)}
.zt-h{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.zt-h .zt-sp{flex:1}
.zt-big{font-size:24px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums}
.zt-note{font-size:13px;color:var(--soft);margin:0}
.zt-foot{margin-top:auto;font-size:13px;color:var(--soft)}
.zt-none{margin:0;font-size:14px;color:var(--soft)}
.zt-row2{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:18px;align-items:stretch;min-width:0}
.zt-row3{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:18px;align-items:stretch;min-width:0}
@media (max-width:1000px){.zt-row2,.zt-row3{grid-template-columns:minmax(0,1fr)}}

/* Kennzahl-Kacheln: Wert groß, Ampel als Streifen links */
.zt-kpis{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;align-items:stretch}
@media (max-width:760px){.zt-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}}
.zt-k{--ac:var(--amp-grey);display:flex;flex-direction:column;gap:2px;min-width:0;padding:12px 14px 12px 16px;border:1px solid var(--line);border-left:3px solid var(--ac);border-radius:6px;background:var(--card)}
.zt-k.a-green{--ac:var(--amp-green)}.zt-k.a-gold{--ac:var(--amp-gold)}.zt-k.a-red{--ac:var(--amp-red)}.zt-k.a-grey{--ac:var(--amp-grey)}
.zt-k b{font-size:26px;font-weight:700;color:#fff;font-variant-numeric:tabular-nums;line-height:1.15;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zt-k span{font-size:13px;color:var(--soft)}
.zt-k small{font-size:12px;color:var(--ac)}

/* Ampel-Pille */
.zt-a{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap}
.zt-a::before{content:"";width:7px;height:7px;border-radius:50%;background:currentColor}
.zt-a.a-green{color:var(--amp-green);background:var(--amp-green-bg)}.zt-a.a-gold{color:var(--amp-gold);background:var(--amp-gold-bg)}
.zt-a.a-red{color:var(--amp-red);background:var(--amp-red-bg)}.zt-a.a-grey{color:var(--amp-grey);background:var(--amp-grey-bg)}

/* Tabellen */
.zt-tbl{width:100%;border-collapse:collapse;font-size:14px;font-variant-numeric:tabular-nums}
.zt-tbl th{font-size:12px;font-weight:600;color:var(--soft);text-align:right;padding:4px 6px;border-bottom:1px solid var(--line)}
.zt-tbl td{text-align:right;padding:6px;border-bottom:1px solid rgba(95,212,255,.07);color:var(--text)}
.zt-tbl th:first-child,.zt-tbl td:first-child{text-align:left}
.zt-tbl tr:last-child td{border-bottom:0}
.zt-tbl .sum td{font-weight:700;color:#fff}
@media (max-width:520px){.zt-tbl{font-size:12px}.zt-tbl th{font-size:11px;padding:4px 2px}.zt-tbl td{padding:6px 2px}.zt-card{padding:14px 12px 16px}}

/* Pipeline-Board */
.zt-board{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;align-items:stretch}
@media (max-width:760px){.zt-board{grid-template-columns:minmax(0,1fr)}}
.zt-col{display:flex;flex-direction:column;gap:8px;min-width:0;padding:12px;border:1px solid var(--line);border-radius:6px;background:rgba(4,14,30,.55)}
.zt-col header{display:flex;align-items:baseline;justify-content:space-between;gap:6px}
.zt-col header span{font-size:12px;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--cy2)}
.zt-col header b{font-size:24px;color:#fff;font-variant-numeric:tabular-nums}
.zt-col .zt-conv{margin-top:auto;display:flex;gap:6px;align-items:center;flex-wrap:wrap;font-size:12px;color:var(--soft)}
.zt-bar{display:grid;grid-template-columns:28px minmax(0,1fr) auto;gap:6px;align-items:center;font-size:13px;color:var(--soft)}
.zt-bar em{display:block;height:8px;border-radius:4px;background:rgba(95,212,255,.08);overflow:hidden}
.zt-bar em i{display:block;height:100%;border-radius:4px;background:var(--c,#5fd4ff)}
.zt-bar b{color:var(--text);font-variant-numeric:tabular-nums}

/* Listen (heiße Kontakte) */
.zt-list{display:grid;gap:6px;margin:0;padding:0;list-style:none}
.zt-list a{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:10px;align-items:center;padding:8px 10px;border:1px solid var(--line);border-radius:6px;color:var(--text);text-decoration:none;background:rgba(4,14,30,.45)}
.zt-list a:hover{border-color:var(--cy)}
.zt-list .t{min-width:0;display:flex;flex-direction:column}
.zt-list .t b{font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zt-list .t span{font-size:13px;color:var(--soft);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.zt-list .w{font-size:12px;color:var(--soft);white-space:nowrap}

/* Ziele */
.zt-goals{display:grid;gap:10px}
.zt-goal{display:grid;grid-template-columns:minmax(0,1.4fr) minmax(0,2fr) 150px;gap:14px;align-items:center;padding:12px 14px;border:1px solid var(--line);border-radius:6px;background:rgba(4,14,30,.45)}
.zt-goal .g-t{display:flex;flex-direction:column;gap:3px;min-width:0}
.zt-goal .g-t b{font-weight:600;color:#fff}
.zt-goal .g-t span{font-size:12px;color:var(--soft)}
.zt-goal .g-p{display:flex;flex-direction:column;gap:5px;min-width:0}
.zt-goal .g-p em{display:block;height:10px;border-radius:5px;background:rgba(95,212,255,.08);overflow:hidden}
.zt-goal .g-p em i{display:block;height:100%;border-radius:5px;background:var(--ac,var(--amp-grey))}
.zt-goal .g-p span{font-size:13px;color:var(--soft);font-variant-numeric:tabular-nums}
.zt-goal .g-p span b{color:var(--text)}
.zt-goal.a-green{--ac:var(--amp-green)}.zt-goal.a-gold{--ac:var(--amp-gold)}.zt-goal.a-red{--ac:var(--amp-red)}.zt-goal.a-grey{--ac:var(--amp-grey)}
.zt-goal label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--soft)}
.zt-goal input{width:100%;box-sizing:border-box;padding:7px 9px;font:inherit;font-size:15px;color:#fff;background:rgba(2,8,18,.8);border:1px solid var(--line);border-radius:4px;font-variant-numeric:tabular-nums}
.zt-goal input:focus{outline:2px solid var(--cy);outline-offset:0}
@media (max-width:760px){.zt-goal{grid-template-columns:minmax(0,1fr)}}
.zt-save{display:flex;justify-content:flex-end;gap:10px;align-items:center;flex-wrap:wrap}
.zt-save button{padding:9px 20px;font:inherit;font-weight:700;color:#02060f;background:var(--cy);border:0;border-radius:4px;cursor:pointer}
.zt-save button:hover{box-shadow:var(--glow)}
`;

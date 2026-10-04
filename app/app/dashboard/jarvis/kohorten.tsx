/**
 * Kohorten-Trichter unter der Fluss-Karte (Inhaber 04.10.2026): je Versandwoche und Land gesendet → zugestellt → Antwort →
 * positiv → Probe → Kunde als Heatmap. Aufklappbar per <details> (ohne JavaScript). Farben fest aus lib/ampel.ts.
 */
import { AMPEL_TEXT, AMPELN } from "@/lib/ampel";
import { REIFE_TAGE, SCHRITTE, matrix, quoteText, type Kohorte, type KohorteRow } from "@/lib/kohorten";

const n = (v: number) => v.toLocaleString("de-DE");

function Cells({ k }: { k: Kohorte }) {
  return (<>
    <td className="kh-sent">{n(k.sent)}</td>
    {SCHRITTE.map((s) => {
      const z = k.zellen[s.key];
      const tip = `${s.label}: ${n(z.k)} von ${n(z.n)} ${s.basisLabel} = ${quoteText(z.quote)} · ${z.jung ? `läuft noch (< ${REIFE_TAGE} T)` : AMPEL_TEXT[z.ampel]}${k.week === "gesamt" && s.key !== "zugestellt" ? ` (Farbe aus Wochen ≥ ${REIFE_TAGE} T)` : ""}`;
      return <td key={s.key} className={`kh-c t-${z.ampel}`} title={tip}><b>{n(z.k)}</b><small>{quoteText(z.quote)}</small></td>;
    })}
  </>);
}

export function Kohorten({ rows, countries, today }: { rows: KohorteRow[] | null; countries: readonly string[]; today: string }) {
  const m = rows ? matrix(rows, countries, today) : null;
  const filled = m ? m.weeks.map((w, i) => ({ w, ks: m.cells[i].filter((k): k is Kohorte => !!k) })) : [];
  return (
    <details className="kh" id="kohorten">
      <summary>
        <span className="kh-t">Kohorten-Trichter</span>
        <em>{m ? `${m.weeks.length} Wochen · ${countries.join("/")}` : "nicht lesbar"}</em>
        <span className="kh-leg" aria-label="Farben">{AMPELN.map((a) => <i key={a} className={`t-${a}`}>{AMPEL_TEXT[a]}</i>)}</span>
      </summary>
      {!m ? <p className="jchat-empty">Zahlen nicht lesbar</p> : !m.weeks.length ? <p className="jchat-empty">noch keine Erstmails</p> : (
        <div className="kh-wrap">
          <table className="kh-tab" aria-label="Kohorten-Trichter je Versandwoche und Land">
            <thead><tr><th><span className="l">Woche</span><span className="s">Wo.</span></th><th>Land</th><th><span className="l">gesendet</span><span className="s">ges.</span></th>
              {SCHRITTE.map((s) => <th key={s.key} title={`${s.label}: Quote je ${s.basisLabel}`}><span className="l">{s.label}</span><span className="s">{s.kurz}</span></th>)}</tr></thead>
            <tbody>
              {filled.map(({ w, ks }) => ks.map((k, j) => (
                <tr key={`${w}-${k.country}`} className={j === 0 ? "kh-first" : ""}>
                  {j === 0 && <th rowSpan={ks.length} scope="rowgroup">{w.slice(5)}{ks[0].jung && <small>läuft</small>}</th>}
                  <th scope="row">{k.country}</th>
                  <Cells k={k} />
                </tr>
              )))}
              {m.gesamt.map((k, j) => (
                <tr key={`g-${k.country}`} className={`kh-sum ${j === 0 ? "kh-first" : ""}`}>
                  {j === 0 && <th rowSpan={m.gesamt.length} scope="rowgroup">gesamt</th>}
                  <th scope="row">{k.country}</th>
                  <Cells k={k} />
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </details>
  );
}

export const KOHORTEN_CSS = `
.jv details.kh{display:block;margin:16px 0;padding:0;border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,rgba(10,26,50,.72),rgba(4,12,26,.55))}
.jv .kh>summary{display:flex;align-items:center;flex-wrap:wrap;gap:8px 12px;min-height:48px;padding:8px 16px;cursor:pointer;list-style:none}
.jv .kh>summary::-webkit-details-marker{display:none}
.jv .kh>summary:before{content:"▸";color:var(--gold);transition:transform .15s}.jv .kh[open]>summary:before{transform:rotate(90deg)}
.jv .kh-t{font-weight:700;color:#fff;font-size:var(--fs-m)}
.jv .kh>summary em{font-style:normal;color:var(--soft);font-size:var(--fs-s)}
.jv .kh-leg{display:flex;gap:6px;margin-left:auto;flex-wrap:wrap}
.jv .kh-leg i{font-style:normal;font-size:var(--fs-xs);line-height:18px;padding:1px 8px;border-radius:9px;border:1px solid var(--ac);color:var(--ac);background:var(--ab)}
.jv .kh-wrap{overflow-x:auto;padding:0 16px 16px}
.jv .kh-tab{width:100%;border-collapse:separate;border-spacing:2px;font-variant-numeric:tabular-nums;table-layout:auto}
.jv .kh-tab th,.jv .kh-tab td{padding:4px 6px;text-align:center;font-size:var(--fs-s);line-height:1.3;white-space:nowrap;border:0;background:none;position:static;vertical-align:middle}
.jv .kh-tab thead th{color:var(--soft);font-weight:600;font-size:var(--fs-xs)}
.jv .kh-tab tbody th{color:var(--text);font-weight:600}
.jv .kh-tab tbody th small{display:block;font-weight:400;font-size:var(--fs-xs);color:var(--amp-grey)}
.jv .kh-tab tr.kh-first>*{border-top:1px solid var(--line)}
.jv .kh-tab .kh-sent{color:var(--text)}
.jv .kh-tab td.kh-c{border-radius:4px;background:var(--ab);box-shadow:inset 3px 0 0 var(--ac)}
.jv .kh-tab td.kh-c b{display:block;color:var(--text);font-weight:600;font-size:var(--fs-s);line-height:1.3}
.jv .kh-tab td.kh-c small{display:block;color:var(--ac);font-size:var(--fs-xs);line-height:1.2}
.jv .kh-tab .kh-sum th,.jv .kh-tab .kh-sum td{font-weight:700}
.jv .kh-tab .s{display:none}
.jv .kh .t-green{--ac:var(--amp-green);--ab:var(--amp-green-bg)}
.jv .kh .t-gold{--ac:var(--amp-gold);--ab:var(--amp-gold-bg)}
.jv .kh .t-red{--ac:var(--amp-red);--ab:var(--amp-red-bg)}
.jv .kh .t-grey{--ac:var(--amp-grey);--ab:var(--amp-grey-bg)}
@media (max-width:720px){
  .jv .kh>summary{padding:8px 12px}.jv .kh-leg{margin-left:0}
  .jv .kh-wrap{padding:0 6px 12px}
  .jv .kh-tab{border-spacing:1px}
  .jv .kh-tab th,.jv .kh-tab td{padding:3px 1px;font-size:var(--fs-xs)}
  .jv .kh-tab td.kh-c b{font-size:var(--fs-xs)}
  .jv .kh-tab td.kh-c small{font-size:10px}
  .jv .kh-tab .l{display:none}.jv .kh-tab .s{display:inline}
}
`;

/**
 * Karte „Optimiert sich selbst“ (Inhaber 04.10.2026: „bekommen wir es hin das sich das system also gehirn etc selbst
 * optimiert“; vorher „Gehirn lernt“): Score mit Trend, die letzten 3 automatischen Änderungen (scripts/selbstopt.py und
 * Meta-Review) mit Pfeil der Wirkung, offene Vorschläge. Rest nur auf Klick. Wenig Text, drei Kacheln bündig.
 */
import Link from "next/link";
import { AMPEL_TEXT } from "@/lib/ampel";
import { trendText, type Anpassung, type GehirnScore } from "@/lib/gehirn-lernt";

export type GehirnLerntData = { score: GehirnScore; anpassungen: Anpassung[] | null; offen: number | null };

export function GehirnLernt({ d }: { d: GehirnLerntData }) {
  const s = d.score;
  const tip = s.score === null ? "noch keine Basis (Meta-Review täglich 21:10)" : `Score ${s.day} · ${AMPEL_TEXT[s.ampel]} · Trend gegen 7 Tage davor`;
  const list = d.anpassungen;
  return (
    <section className="gl" id="gehirn-lernt" aria-label="Optimiert sich selbst">
      <div className="gl-k">
        <Link href="/dashboard/gehirn" className="gl-t">Optimiert sich selbst</Link>
        <div className="gl-grid">
          <Link href="/dashboard/gehirn" className={`gl-c t-${s.ampel}`} title={tip}>
            <small>Score</small>
            <b>{s.score === null ? "–" : Math.round(s.score)}</b>
            <em>{trendText(s)}</em>
          </Link>
          <div className="gl-c t-grey gl-list" title="letzte automatische Änderungen · ↑ wirkt · → ohne Effekt · ↩ zurück · … wird bewertet">
            <small>Selbst angepasst</small>
            {list === null ? <em>nicht lesbar</em> : list.length ? (
              <ul>{list.slice(0, 3).map((a, i) => (
                <li key={i} title={`${a.wirkung}${a.grund ? ` · ${a.grund}` : ""}`}><span>{a.titel}</span><i className={`w-${a.pfeil === "↑" ? "up" : a.pfeil === "↩" ? "back" : "flat"}`}>{a.pfeil}</i></li>
              ))}</ul>
            ) : <em>noch nichts</em>}
          </div>
          <Link href="/dashboard/gehirn" className={`gl-c ${d.offen ? "t-gold" : "t-grey"}`} title="offene Verbesserungsvorschläge für die Gehirn-Anleitung">
            <small>Vorschläge offen</small>
            <b>{d.offen === null ? "…" : d.offen}</b>
            <em>{d.offen ? "nächste Sitzung" : "keine"}</em>
          </Link>
        </div>
        {list && list.length > 0 && (
          <details className="gl-mehr">
            <summary>Alle Änderungen</summary>
            <ul>{list.map((a, i) => (
              <li key={i}><i>{a.pfeil}</i><b>{a.titel}</b>{a.grund && <span>{a.grund}</span>}</li>
            ))}</ul>
          </details>
        )}
      </div>
    </section>
  );
}

export const GEHIRN_LERNT_CSS = `
.jv section.gl{margin:16px 0;padding:0}
.jv .gl-k{display:block;padding:12px 16px 16px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,rgba(10,26,50,.72),rgba(4,12,26,.55));color:inherit}
.jv .gl-t{display:inline-block;font-weight:700;color:#fff;font-size:var(--fs-m);margin:0 0 8px;text-decoration:none}
.jv .gl-t:hover{color:var(--gold)}
.jv .gl-grid{display:grid;grid-template-columns:1fr 2fr 1fr;gap:8px;align-items:stretch}
.jv .gl-c{display:flex;flex-direction:column;justify-content:center;gap:2px;min-width:0;margin:0;padding:8px 12px;border-radius:12px;background:var(--ab);box-shadow:inset 3px 0 0 var(--ac);color:inherit;text-decoration:none}
.jv a.gl-c:hover{outline:1px solid var(--gold)}
.jv .gl-c small{color:var(--soft);font-size:var(--fs-xs)}
.jv .gl-c b{color:var(--ac);font-size:28px;line-height:1.1;font-variant-numeric:tabular-nums}
.jv .gl-c em{font-style:normal;color:var(--text);font-size:var(--fs-s)}
.jv .gl-list ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px}
.jv .gl-list li{display:flex;align-items:center;gap:8px;color:var(--text);font-size:var(--fs-s);min-width:0}
.jv .gl-list li span{flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jv .gl-list li i{font-style:normal;font-weight:700;flex:none;width:16px;text-align:center}
.jv .gl-list .w-up{color:var(--amp-green)}
.jv .gl-list .w-back{color:var(--amp-red)}
.jv .gl-list .w-flat{color:var(--soft)}
.jv .gl-mehr{margin:8px 0 0;font-size:var(--fs-s)}
.jv .gl-mehr summary{cursor:pointer;color:var(--soft);font-size:var(--fs-xs)}
.jv .gl-mehr ul{margin:8px 0 0;padding:0;list-style:none;display:flex;flex-direction:column;gap:4px}
.jv .gl-mehr li{display:grid;grid-template-columns:16px 1fr;column-gap:8px;color:var(--text)}
.jv .gl-mehr li i{font-style:normal;text-align:center;grid-row:span 2}
.jv .gl-mehr li b{font-weight:600}
.jv .gl-mehr li span{color:var(--soft);font-size:var(--fs-xs)}
.jv .gl .t-green{--ac:var(--amp-green);--ab:var(--amp-green-bg)}
.jv .gl .t-gold{--ac:var(--amp-gold);--ab:var(--amp-gold-bg)}
.jv .gl .t-red{--ac:var(--amp-red);--ab:var(--amp-red-bg)}
.jv .gl .t-grey{--ac:var(--amp-grey);--ab:var(--amp-grey-bg)}
@media (max-width:720px){
  .jv .gl-k{padding:8px 12px 12px}
  .jv .gl-grid{grid-template-columns:1fr 1fr}
  .jv .gl-list{grid-column:1 / -1;order:3}
}
`;

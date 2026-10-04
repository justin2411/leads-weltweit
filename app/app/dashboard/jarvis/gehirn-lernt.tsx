/**
 * Karte „Gehirn lernt“ (Inhaber 04.10.2026: „Bau es so das sich auch das gehirn weiter selbstoptimiert“): Gehirn-Score
 * mit Trend, die letzten 3 Selbstanpassungen des Meta-Reviews (decisions „Meta: …“) und offene Verbesserungsvorschläge
 * (brain_improvements). Wenig Text, Farben fest aus lib/ampel.ts, drei Kacheln je Reihe bündig.
 */
import Link from "next/link";
import { AMPEL_TEXT } from "@/lib/ampel";
import { trendText, type GehirnScore } from "@/lib/gehirn-lernt";

export type GehirnLerntData = { score: GehirnScore; anpassungen: string[] | null; offen: number | null };

export function GehirnLernt({ d }: { d: GehirnLerntData }) {
  const s = d.score;
  const tip = s.score === null ? "noch keine Basis (Meta-Review täglich 21:10)" : `Gehirn-Score ${s.day} · ${AMPEL_TEXT[s.ampel]} · Trend gegen 7 Tage davor`;
  return (
    <section className="gl" id="gehirn-lernt" aria-label="Gehirn lernt">
      <Link href="/dashboard/gehirn" className="gl-k">
        <span className="gl-t">Gehirn lernt</span>
        <div className="gl-grid">
          <div className={`gl-c t-${s.ampel}`} title={tip}>
            <small>Score</small>
            <b>{s.score === null ? "–" : Math.round(s.score)}</b>
            <em>{trendText(s)}</em>
          </div>
          <div className="gl-c t-grey gl-list" title="letzte Selbstanpassungen (Meta-Review)">
            <small>Selbst angepasst</small>
            {d.anpassungen === null ? <em>nicht lesbar</em> : d.anpassungen.length ? (
              <ul>{d.anpassungen.slice(0, 3).map((a, i) => <li key={i}>{a}</li>)}</ul>
            ) : <em>noch nichts</em>}
          </div>
          <div className={`gl-c ${d.offen ? "t-gold" : "t-grey"}`} title="offene Verbesserungsvorschläge für die Gehirn-Anleitung">
            <small>Vorschläge offen</small>
            <b>{d.offen === null ? "…" : d.offen}</b>
            <em>{d.offen ? "nächste Sitzung übernimmt einen" : "keine"}</em>
          </div>
        </div>
      </Link>
    </section>
  );
}

export const GEHIRN_LERNT_CSS = `
.jv section.gl{margin:16px 0;padding:0}
.jv .gl-k{display:block;padding:12px 16px 16px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,rgba(10,26,50,.72),rgba(4,12,26,.55));color:inherit;text-decoration:none}
.jv .gl-k:hover{border-color:var(--gold)}
.jv .gl-t{display:block;font-weight:700;color:#fff;font-size:var(--fs-m);margin:0 0 8px}
.jv .gl-grid{display:grid;grid-template-columns:1fr 2fr 1fr;gap:8px;align-items:stretch}
.jv .gl-c{display:flex;flex-direction:column;justify-content:center;gap:2px;min-width:0;margin:0;padding:8px 12px;border-radius:12px;background:var(--ab);box-shadow:inset 3px 0 0 var(--ac)}
.jv .gl-c small{color:var(--soft);font-size:var(--fs-xs)}
.jv .gl-c b{color:var(--ac);font-size:28px;line-height:1.1;font-variant-numeric:tabular-nums}
.jv .gl-c em{font-style:normal;color:var(--text);font-size:var(--fs-s)}
.jv .gl-list ul{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:2px}
.jv .gl-list li{color:var(--text);font-size:var(--fs-s);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
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

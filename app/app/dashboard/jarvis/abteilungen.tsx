/**
 * JARVIS „Abteilungen“ (Inhaber 04.10.2026: „… damit jarvis eine komplette kommandozentrale hat und wie in einem
 * unternehmen alles steuern und regeln kann“): Kachel-Raster als Einstieg in die Unterseiten. Je Kachel Icon, Name,
 * eine Kennzahl mit Ampel und Link; „Organigramm“ führt zu /dashboard/firma. Reine Server-Darstellung; Daten aus lib/abteilungen.ts. Kacheln je Reihe gleich hoch.
 */
import Link from "next/link";
import { Icon, isIconName } from "@/app/icons";
import { AMPEL_TEXT } from "@/lib/ampel";
import type { Kachel } from "@/lib/abteilungen";

export function Abteilungen({ items }: { items: Kachel[] }) {
  if (!items.length) return null;
  return (
    <section className="abt" id="abteilungen" aria-label="Abteilungen">
      <div className="abt-hd"><h2 className="abt-t">Abteilungen</h2>
        <Link href="/dashboard/firma" className="abt-org" title="Bereiche, Ziele und Übergaben"><Icon name="agent" size={14} /><span>Organigramm</span></Link></div>
      <ul className="abt-grid">
        {items.map((k) => (
          <li key={k.key}>
            <Link href={k.href} className={`abt-k t-${k.ampel}`} title={`${k.name}: ${k.tip} · ${AMPEL_TEXT[k.ampel]}`}>
              <span className="abt-h">{isIconName(k.icon) && <Icon name={k.icon} size={16} />}<span>{k.name}</span></span>
              <b>{k.wert}</b>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export const ABTEILUNGEN_CSS = `
.jv section.abt{margin:16px 0;padding:12px 16px 16px;border:1px solid var(--line);border-radius:16px;background:linear-gradient(180deg,rgba(10,26,50,.72),rgba(4,12,26,.55))}
.jv .abt-hd{display:flex;align-items:center;gap:8px;margin:0 0 8px;min-width:0}
.jv .abt-t{margin:0;font-size:var(--fs-m);font-weight:700;color:#fff}
.jv .abt-org{margin-left:auto;display:inline-flex;align-items:center;gap:6px;min-height:32px;padding:0 12px;border-radius:99px;border:1px solid rgba(226,198,143,.5);color:var(--gold2);text-decoration:none;font-size:var(--fs-s);font-weight:600;white-space:nowrap}
.jv .abt-org:hover,.jv .abt-org:focus-visible{background:rgba(226,198,143,.1)}
.jv .abt-grid{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fill,minmax(176px,1fr));gap:8px;align-items:stretch}
.jv .abt-grid li{display:flex;min-width:0;margin:0}
.jv .abt-k{flex:1;display:flex;flex-direction:column;justify-content:space-between;gap:4px;min-width:0;padding:8px 12px;border-radius:12px;background:var(--ab);box-shadow:inset 3px 0 0 var(--ac);color:inherit;text-decoration:none;border:1px solid transparent}
.jv .abt-k:hover,.jv .abt-k:focus-visible{border-color:var(--ac)}
.jv .abt-h{display:flex;align-items:center;gap:6px;min-width:0;color:var(--soft);font-size:var(--fs-s)}
.jv .abt-h svg{flex:none;color:var(--ac)}
.jv .abt-h span{white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.jv .abt-k b{color:var(--ac);font-size:19px;line-height:1.2;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
.jv .abt .t-green{--ac:var(--amp-green);--ab:var(--amp-green-bg)}
.jv .abt .t-gold{--ac:var(--amp-gold);--ab:var(--amp-gold-bg)}
.jv .abt .t-red{--ac:var(--amp-red);--ab:var(--amp-red-bg)}
.jv .abt .t-grey{--ac:var(--amp-grey);--ab:var(--amp-grey-bg)}
@media (max-width:720px){
  .jv section.abt{padding:8px 12px 12px}
  .jv .abt-grid{grid-template-columns:repeat(2,minmax(0,1fr))}
  .jv .abt-k b{font-size:16px}
}
`;

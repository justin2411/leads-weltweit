/**
 * Sparkline je JARVIS-Station (JARVIS-Plan W1-3): 7 Tage als ruhige Linie (Cyan, Gold nur bei Geld), letzter Punkt
 * als Kreis, daneben „▲/▼ x %“ (7 T vs. Vor-7 T, nur bei genug Daten). Reines SVG, keine Bibliothek, kein Raster.
 * Unter 2 Punkten keine Linie – die Station zeigt dann nur ihren Wert. CSS lokal (nicht in hud-css.ts).
 */
import { arrow } from "@/lib/trend";
import { sparkAria, sparkPath, type Spark } from "@/lib/spark";
import { SPARK_H as H, SPARK_W as W } from "./spark-css";

export { SPARK_CSS } from "./spark-css";

/** Text für das aria-label der Station: „Mails je Tag, 7 Tage: …, ▲ 12 % zur Vorwoche“. */
export function sparkText(s: Spark | undefined): string {
  if (!s) return "";
  const a = arrow(s.trend);
  return `${sparkAria(s)}${a ? `, ${a} zur Vorwoche` : ""}`;
}

export function StationSpark({ s }: { s: Spark }) {
  const p = sparkPath(s.points, W, H, 2);
  const a = arrow(s.trend);
  if (!p.d && !a) return null;
  const tone = `${s.gold ? " gold" : ""}`;
  return (
    <span className="fl-tr" title={sparkText(s)}>
      {p.d && (
        <svg className={`fl-sp${tone}`} viewBox={`0 0 ${W} ${H}`} role="img" aria-label={sparkAria(s)}>
          <path d={p.d} />
          {p.last && <circle cx={p.last[0]} cy={p.last[1]} r={2} />}
        </svg>
      )}
      {a && <span className={`fl-ar ${s.trend!.dir}${tone}`}>{a}</span>}
    </span>
  );
}

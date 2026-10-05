/**
 * Lernring des Gehirns (Zahlen → Lücke → Auftrag → Umsetzen → Messen → Lehre): 6 Segmente mit Wort und Zahl. 0 = schraffiert
 * grau („0 gemessen“), aktives Segment Cyan. Dreht sich nur, wenn das Gehirn arbeitet (1 Umdrehung / 60 s).
 * Genutzt auf /dashboard/jarvis (Zentrale) und /dashboard/gehirn (groß). Reines SVG, kein Zustand.
 */
import Link from "next/link";
import type { ReactNode } from "react";
import type { LernPhase, LernSegment } from "@/lib/zentrale-logik";

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const pt = (r: number, deg: number) => [200 + r * Math.cos(rad(deg)), 200 + r * Math.sin(rad(deg))];
function seg(r1: number, r2: number, a0: number, a1: number) {
  const [x1, y1] = pt(r2, a0), [x2, y2] = pt(r2, a1), [x3, y3] = pt(r1, a1), [x4, y4] = pt(r1, a0);
  const f = (n: number) => n.toFixed(2);
  return `M${f(x1)} ${f(y1)}A${r2} ${r2} 0 0 1 ${f(x2)} ${f(y2)}L${f(x3)} ${f(y3)}A${r1} ${r1} 0 0 0 ${f(x4)} ${f(y4)}Z`;
}

export function LernRing({ segmente, aktiv, drehen, href, kern, wort, herz }: {
  segmente: LernSegment[]; aktiv: LernPhase | null; drehen: boolean; href: (k: LernPhase) => string; kern: ReactNode; wort: string; herz: number | null;
}) {
  const step = 360 / segmente.length;
  return (
    <div className={`jz-hirn${drehen ? " dreht" : ""}${herz ? " schlag" : ""}${wort === "AUS" ? " aus" : ""}`} style={herz ? ({ "--takt": `${herz}s` } as React.CSSProperties) : undefined}>
      <svg viewBox="0 0 400 400" role="img" aria-label={`Lernschleife: ${segmente.map((s) => `${s.wort} ${s.zahl}`).join(", ")}`}>
        <defs>
          <pattern id="jz-schraffur" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
            <rect width="8" height="8" fill="rgba(30,42,60,.5)" /><line x1="0" y1="0" x2="0" y2="8" stroke="rgba(93,114,144,.55)" strokeWidth="2" />
          </pattern>
        </defs>
        <circle cx="200" cy="200" r="199" className="ring strich" />
        <g>
          {segmente.map((s, i) => {
            const a0 = i * step + 1.5, a1 = (i + 1) * step - 1.5;
            return (
              <Link key={s.key} href={href(s.key)} scroll={false} aria-label={`${s.wort}: ${s.zahl}`}>
                <path d={seg(112, 192, a0, a1)} className={`seg${s.grau ? " grau" : ""}${aktiv === s.key ? " akt" : ""}`}><title>{`${s.wort}: ${s.tip}`}</title></path>
              </Link>
            );
          })}
        </g>
        {segmente.map((s, i) => {
          const m = (i + 0.5) * step;
          const [x, y] = pt(152, m);
          return (
            <g key={`t-${s.key}`}>
              <text x={x} y={y - 9} className="w">{s.wort}</text>
              <text x={x} y={y + 9} className="n">{s.zahl}</text>
            </g>
          );
        })}
      </svg>
      <i className="herz" aria-hidden />
      {kern}
    </div>
  );
}

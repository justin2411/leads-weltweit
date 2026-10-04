/**
 * Großes Gehirn in der Mitte (Inhaber 04.10.2026). Reines SVG + CSS (gehirn-css.ts): zwei Hälften mit Windungen,
 * Synapsen pulsieren ruhig, Signale laufen zum Kern – schneller und heller, wenn gerade etwas läuft (`hot`).
 * prefers-reduced-motion: alles still.
 */
import type { CSSProperties } from "react";
import type { BrainMode } from "@/lib/gehirn";

type V = CSSProperties & Record<`--${string}`, string | number>;

const HEMI = "M196 92C176 78 146 76 128 88C104 84 82 100 80 122C60 130 52 154 62 172C48 186 50 212 66 224C60 246 74 268 98 270C108 290 134 300 156 292C170 304 190 302 196 290Z";
const GYRI = [
  "M120 96C130 112 152 116 170 106",
  "M86 128C104 128 118 142 112 160C108 174 122 186 140 182",
  "M150 140C164 150 168 168 184 172",
  "M66 182C84 176 98 190 96 206",
  "M118 206C134 196 152 204 156 222C160 236 176 240 190 232",
  "M80 238C98 236 112 248 110 264",
  "M134 262C146 250 166 254 172 270",
  "M150 100C146 118 160 128 176 132",
];
const NODES: [number, number][] = [[120, 96], [170, 106], [112, 160], [140, 182], [184, 172], [96, 206], [156, 222], [110, 264], [172, 270], [150, 140], [176, 132], [66, 182]];
/** Signalwege von Synapsen zum Kern (200,196). */
const PATHS = [
  "M120 96C150 120 176 150 200 196", "M112 160C140 170 170 180 200 196", "M96 206C130 200 166 198 200 196",
  "M110 264C140 240 170 220 200 196", "M170 106C184 140 194 170 200 196", "M172 270C182 246 192 220 200 196",
];

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const pt = (r: number, deg: number) => [200 + r * Math.cos(rad(deg)), 200 + r * Math.sin(rad(deg))].map((x) => x.toFixed(2));
const arc = (r: number, a0: number, a1: number) => {
  const [x1, y1] = pt(r, a0), [x2, y2] = pt(r, a1);
  return `M${x1} ${y1}A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x2} ${y2}`;
};

function Half({ mirror }: { mirror?: boolean }) {
  return (
    <g transform={mirror ? "translate(400 0) scale(-1 1)" : undefined} className={mirror ? "gh-r" : "gh-l"}>
      <path d={HEMI} className="gh-hemi" />
      {GYRI.map((d, i) => <path key={i} d={d} className="gh-gyr" />)}
      {PATHS.map((d, i) => <path key={i} d={d} className="gh-sig" style={{ "--i": i + (mirror ? 3 : 0) } as V} />)}
      {NODES.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3.2} className="gh-syn" style={{ "--i": (i * 7 + (mirror ? 5 : 0)) % 12 } as V} />)}
    </g>
  );
}

export function BrainCore({ mode, label, hot }: { mode: BrainMode; label: string; hot: boolean }) {
  return (
    <div className={`gh-brain m-${mode} ${hot ? "hot" : ""}`}>
      <svg viewBox="0 0 400 400" role="img" aria-label={`Gehirn: ${label}`}>
        <defs>
          <radialGradient id="gh-core-g"><stop offset="0" stopColor="#a8ecff" stopOpacity=".95" /><stop offset=".35" stopColor="#5fd4ff" stopOpacity=".5" /><stop offset="1" stopColor="#030812" stopOpacity="0" /></radialGradient>
          <radialGradient id="gh-aura-g"><stop offset="0" stopColor="#5fd4ff" stopOpacity=".22" /><stop offset=".6" stopColor="#1b4d7a" stopOpacity=".08" /><stop offset="1" stopColor="#030812" stopOpacity="0" /></radialGradient>
          <filter id="gh-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <circle cx="200" cy="200" r="198" className="gh-halo" />
        <g className="gh-ticks">{Array.from({ length: 90 }, (_, i) => {
          const [x1, y1] = pt(194, i * 4), [x2, y2] = pt(i % 9 === 0 ? 184 : 189, i * 4);
          return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={i % 9 === 0 ? "maj" : ""} />;
        })}</g>
        <g className="gh-orbit a">{[0, 120, 240].map((a) => <path key={a} d={arc(178, a, a + 64)} />)}</g>
        <g className="gh-orbit b">{[60, 240].map((a) => <path key={a} d={arc(168, a, a + 40)} />)}</g>
        <circle cx="200" cy="200" r="160" fill="url(#gh-aura-g)" className="gh-aura" />
        <g filter="url(#gh-glow)">
          <Half />
          <Half mirror />
          <path d="M200 90C198 130 202 170 200 196C198 240 202 270 200 298" className="gh-fiss" />
          <path d="M190 292Q196 318 200 336Q204 318 210 292" className="gh-stem" />
        </g>
        <circle cx="200" cy="196" r="30" fill="url(#gh-core-g)" className="gh-core" />
        <circle cx="200" cy="196" r="5" className="gh-dot" />
        <circle cx="200" cy="196" r="16" className="gh-wave" />
        <circle cx="200" cy="196" r="16" className="gh-wave w2" />
      </svg>
      <span className="gh-state">{label}</span>
    </div>
  );
}

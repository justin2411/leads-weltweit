/**
 * Gehirn-Bühne (Inhaber 04.10.2026: „wenig text und gute grafiken bzw animationen“). Reines SVG + CSS (gehirn-css.ts):
 * – Gehirn in der Mitte, atmet ruhig im Leerlauf, Synapsen und Signale schneller, wenn etwas läuft (`hot`);
 * – 24-Stunden-Zifferblatt (deutsche Zeit) als äußere Skala: nächste Läufe als Punkte an ihrer Uhrzeit, der nächste
 *   pulsiert, goldener „jetzt“-Zeiger dreht mit;
 * – Agenten als Satelliten auf einer Umlaufbahn (Fortschrittsring, „A1“, Prozent); laufende schicken Signale ins
 *   Gehirn, wartende sind gedimmt. Namen, Schritte und Läufe erst bei Hover/Tippen (tips.tsx).
 * prefers-reduced-motion: alles still. Geometrie (Winkel, Positionen) aus lib/gehirn.ts.
 */
import type { CSSProperties } from "react";
import { berlin } from "@/lib/dashboard-logic";
import { polar, type BrainMode, type ClockMark, type Satellite } from "@/lib/gehirn";
import { Icon } from "@/app/icons";
import { Tip } from "./tips";

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

/** Radien der Bühne (viewBox 400): Zifferblatt außen, Umlaufbahn der Satelliten; Uhr-Punkte in Prozent für HTML. */
const R_DIAL = 188, R_ORBIT = 140;
const MARK_R = (R_DIAL / 400) * 100;

const rad = (deg: number) => ((deg - 90) * Math.PI) / 180;
const pt = (r: number, deg: number) => [200 + r * Math.cos(rad(deg)), 200 + r * Math.sin(rad(deg))].map((x) => x.toFixed(2));

function Half({ mirror }: { mirror?: boolean }) {
  return (
    <g transform={mirror ? "translate(400 0) scale(-1 1)" : undefined}>
      <path d={HEMI} className="gh-hemi" />
      {GYRI.map((d, i) => <path key={i} d={d} className="gh-gyr" />)}
      {PATHS.map((d, i) => <path key={i} d={d} className="gh-sig" style={{ "--i": i + (mirror ? 3 : 0) } as V} />)}
      {NODES.map(([x, y], i) => <circle key={i} cx={x} cy={y} r={3.2} className="gh-syn" style={{ "--i": (i * 7 + (mirror ? 5 : 0)) % 12 } as V} />)}
    </g>
  );
}

/** 24-h-Skala: 96 Striche (Viertelstunden), Stunden länger, 0/6/12/18 hell mit Zahl. */
function Dial() {
  return (
    <g className="gh-dial">
      {Array.from({ length: 96 }, (_, i) => {
        const hour = i % 4 === 0, six = i % 24 === 0;
        const [x1, y1] = pt(R_DIAL + 6, i * 3.75), [x2, y2] = pt(six ? R_DIAL - 8 : hour ? R_DIAL - 4 : R_DIAL + 1, i * 3.75);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} className={six ? "six" : hour ? "hr" : ""} />;
      })}
      {[0, 6, 12, 18].map((h) => {
        const [x, y] = pt(R_DIAL - 19, h * 15);
        return <text key={h} x={x} y={y} className="gh-hour" textAnchor="middle" dominantBaseline="central">{h}</text>;
      })}
    </g>
  );
}

function SatTip({ s }: { s: Satellite }) {
  return (
    <div className="gh-pop">
      <div className="gh-pop-h"><b>A{s.agent}</b><span>{s.state === "laeuft" ? `${s.progress} %` : s.state === "wartet" ? "wartet" : "frei"}</span></div>
      {s.brief && <p className="gh-pop-t">{s.brief}</p>}
      {s.step && <p>{s.step}</p>}
      {(s.since || s.queued > 0) && <p className="gh-pop-m">{s.since && `seit ${berlin(s.since, false)}`}{s.since && s.queued > 0 && " · "}{s.queued > 0 && `+${s.queued} wartet`}</p>}
      <a className="gh-pop-a" href="/dashboard/jarvis">{s.state === "frei" ? "Auftrag geben" : "in JARVIS"} <Icon name="weiter" size={12} /></a>
    </div>
  );
}

export function BrainStage({ mode, label, hot, sats, marks, nowAngle, nowTime }: {
  mode: BrainMode; label: string; hot: boolean; sats: Satellite[]; marks: ClockMark[]; nowAngle: number; nowTime: string;
}) {
  const busy = sats.filter((s) => s.state === "laeuft").length;
  return (
    <div className={`gh-brain m-${mode} ${hot ? "hot" : ""}`}>
      <svg viewBox="0 0 400 400" role="img" aria-label={`Gehirn: ${label}. ${busy} Agenten laufen. Jetzt ${nowTime}.`}>
        <defs>
          <radialGradient id="gh-core-g"><stop offset="0" stopColor="#a8ecff" stopOpacity=".95" /><stop offset=".35" stopColor="#5fd4ff" stopOpacity=".5" /><stop offset="1" stopColor="#030812" stopOpacity="0" /></radialGradient>
          <radialGradient id="gh-aura-g"><stop offset="0" stopColor="#5fd4ff" stopOpacity=".22" /><stop offset=".6" stopColor="#1b4d7a" stopOpacity=".08" /><stop offset="1" stopColor="#030812" stopOpacity="0" /></radialGradient>
          <filter id="gh-glow" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="2.4" result="b" /><feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge></filter>
        </defs>
        <circle cx="200" cy="200" r="198" className="gh-halo" />
        <Dial />
        <circle cx="200" cy="200" r={R_ORBIT} className="gh-track" />
        <g className="gh-hand" style={{ "--a": `${nowAngle}deg` } as V}>
          <line x1="200" y1={200 - R_DIAL + 10} x2="200" y2={200 - R_DIAL - 8} />
          <path d={`M200 ${200 - R_DIAL + 12}l-5 -9h10z`} />
        </g>
        <circle cx="200" cy="200" r="120" fill="url(#gh-aura-g)" className="gh-aura" />
        <g className="gh-art">
          <g transform="translate(200 200) scale(.6) translate(-200 -196)">
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
          </g>
        </g>
      </svg>

      {/* Satelliten (kreisen, halten bei Hover/Tippen an) */}
      <div className="gh-orbit-l">
        {sats.map((s) => (
          <div key={s.agent} className={`gh-arm st-${s.state}`} style={{ "--a": `${s.angle}deg` } as V}>
            {s.state !== "frei" && <i className="gh-tether" />}
            {s.state === "laeuft" && <><i className="gh-signal" /><i className="gh-signal s2" /><i className="gh-signal s3" /></>}
            <div className="gh-satpos">
              <Tip className={`gh-sat st-${s.state}`} tip={<SatTip s={s} />}
                label={`Agent ${s.agent}: ${s.state === "laeuft" ? `${s.progress} %, ${s.brief ?? ""}` : s.state === "wartet" ? `wartet, ${s.brief ?? ""}` : "frei"}`}>
                <svg viewBox="0 0 48 48" aria-hidden>
                  <circle cx="24" cy="24" r="21" className="gh-sat-bg" />
                  <circle cx="24" cy="24" r="21" className="gh-sat-ring" pathLength={100} style={{ "--p": s.state === "laeuft" ? s.progress : 0 } as V} />
                </svg>
                <b>A{s.agent}</b>
                {s.state === "laeuft" ? <em>{s.progress}%</em> : s.state === "wartet" ? <em><Icon name="warten" size={10} /></em> : null}
              </Tip>
            </div>
          </div>
        ))}
      </div>

      {/* Nächste Läufe auf dem Zifferblatt */}
      <div className="gh-marks">
        {marks.map((m) => {
          const p = polar(m.angle, MARK_R);
          return (
            <Tip key={m.at} className={`gh-mark ${m.next ? "next" : ""} ${m.names.length > 1 ? "multi" : ""}`} style={{ left: `${p.x}%`, top: `${p.y}%` }}
              label={`${m.time} ${m.names.join(", ")}`}
              tip={<div className="gh-pop"><div className="gh-pop-h"><b>{m.time}</b>{m.next && <span>als Nächstes</span>}</div>{m.names.map((n) => <p key={n}>{n}</p>)}</div>}>
              <i />
            </Tip>
          );
        })}
      </div>
    </div>
  );
}

/**
 * Live-Grafiken des Dashboards (Inhaber 03.10.2026: „die pipeline eine grafische animation … ich will dort dann auch
 * reinklicken können“, „es soll sich alles wie ein werk anfühlen“). Reines HTML/CSS (Server-Komponenten), Bewegung
 * nur über CSS-Klassen: `.live` an = Werk arbeitet gerade (Lebenszeichen < 15 min), sonst steht alles still und grau.
 * prefers-reduced-motion: keine Bewegung, nur Farben/Status. Jede Stufe hat Tooltip (title) und Link zur Liste.
 */
import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { COUNTRY_COLOR, OTHER_COLOR, compact } from "@/lib/dashboard-logic";
import { PipeDelta } from "./pipe-delta";

type V = CSSProperties & Record<`--${string}`, string | number>;

/** Pulsierender Punkt bzw. drehender Ring: läuft / steht / pausiert. */
export function LiveDot({ state, title }: { state: "live" | "idle" | "off" | "bad"; title?: string }) {
  return <span className={`ldot ${state}`} title={title} aria-label={title} role="img" />;
}

export type FunnelStage = { label: string; n: number | null; tip?: string; href?: string; drop?: string };

/**
 * Trichter: oben Kandidaten, jede Prüfstufe als schmaler werdende Ebene mit Namen des Prüfers und Anzahl (durch /
 * verworfen). Unten groß das Ergebnis je Land. `live`: Punkte fallen durch den Trichter, Ebenen pulsieren dezent.
 * Stufen ohne erfasste Zahlen (n = null) stehen grau als „nicht erfasst“.
 */
export function FunnelViz({ title, stages, result, live, note, href }: {
  title: string; stages: FunnelStage[]; result: { country: string; n: number | null; href?: string; tip?: string }[];
  live: boolean; note?: ReactNode; href?: string;
}) {
  const known = stages.filter((s) => s.n !== null).map((s) => s.n as number);
  const max = Math.max(1, ...known);
  return (
    <section className={`card tri ${live ? "live" : "idle"}`} aria-label={title}>
      <header className="th">
        <span>{href ? <Link href={href}>{title}</Link> : title}</span>
        <LiveDot state={live ? "live" : "idle"} title={live ? "arbeitet gerade" : "steht gerade"} />
      </header>
      <div className="tri-body">
        <div className="tri-drops" aria-hidden>{Array.from({ length: 7 }, (_, i) => <i key={i} style={{ "--i": i } as V} />)}</div>
        {stages.map((s, i) => {
          const prev = i > 0 ? stages[i - 1].n : null;
          const lost = s.n !== null && prev !== null ? prev - s.n : null;
          const w = s.n === null ? 30 : Math.max(14, (100 * s.n) / max);
          const tip = [s.label, s.n === null ? "nicht erfasst" : `${s.n.toLocaleString("de-DE")} durch`,
            lost ? `${lost.toLocaleString("de-DE")} verworfen` : "", s.tip ?? "", s.href ? "Klick: Liste" : ""].filter(Boolean).join(" · ");
          const body = (
            <>
              <span className="tb" style={{ "--w": `${w}%`, "--d": `${i * 0.35}s` } as V} />
              <span className="tl">{s.label}</span>
              <span className="tn">{s.n === null ? "nicht erfasst" : compact(s.n)}</span>
              <span className="tx">{lost ? `−${compact(lost)}` : ""}</span>
            </>
          );
          return s.href
            ? <Link key={s.label} href={s.href} className={`tlvl ${s.n === null ? "na" : ""}`} title={tip}>{body}</Link>
            : <div key={s.label} className={`tlvl ${s.n === null ? "na" : ""}`} title={tip}>{body}</div>;
        })}
      </div>
      <div className="tri-out" aria-label="Ergebnis je Land">
        {result.map((r) => {
          const inner = (
            <>
              <i style={{ background: COUNTRY_COLOR[r.country] ?? OTHER_COLOR }} />
              <b>{r.n === null ? "–" : compact(r.n)}</b><span>{r.country}</span>
            </>
          );
          return r.href
            ? <Link key={r.country} href={r.href} className="tro" title={r.tip ?? `${r.country}: Ergebnis · Klick: Liste`}>{inner}</Link>
            : <div key={r.country} className="tro" title={r.tip}>{inner}</div>;
        })}
      </div>
      {note && <div className="tri-note">{note}</div>}
    </section>
  );
}

export type PipeStep = { id: string; label: string; value: string; sub: string; href: string; tip: string; perHour: number; neck?: boolean; n?: number };

/**
 * Prozesskette als Leitung: Stationen (klickbar) und Rohre dazwischen. Punkte fließen in Richtung der nächsten Stufe;
 * Tempo/Dichte nach der Aktivität der letzten Stunde (`perHour` der Zielstation). Engpass: Rohr davor staut (rot).
 */
export function Pipeline({ steps, flow, at, scope }: { steps: PipeStep[]; flow: (perHour: number) => number | null; at?: string; scope?: string }) {
  return (
    <ol className="pipe" aria-label="Ablauf">
      {steps.map((s, i) => {
        const sec = i < steps.length - 1 ? flow(steps[i + 1].perHour) : null;
        const jam = i < steps.length - 1 && steps[i + 1].neck;
        return (
          <li key={s.id} className={`${s.neck ? "neck" : ""} ${s.perHour > 0 ? "busy" : ""}`}>
            <Link href={s.href} title={`${s.tip}${s.perHour ? ` · letzte Stunde: ${s.perHour.toLocaleString("de-DE")}` : ""}${s.neck ? " · ENGPASS" : ""} · Klick: Details`}>
              {s.neck && <span className="neck-tag">✕ Engpass</span>}
              <span className="v">{s.value}</span>
              <span className="l">{s.label}</span>
              <span className="s">{s.sub}</span>
              {at && typeof s.n === "number" && <PipeDelta k={`${scope ?? "alle"}:${s.id}`} at={at} n={s.n} />}
            </Link>
            {i < steps.length - 1 && (
              <span className={`tube ${sec ? "flow" : ""} ${jam ? "jam" : ""}`} style={{ "--dur": `${sec ?? 6}s` } as V} aria-hidden>
                <i /><i /><i />
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * Probenfertigung: 10 Lead-Kärtchen fallen in einen Umschlag, der Umschlag schließt sich und reiht sich in den Stapel
 * des Landes ein (nur während der Vorrat gebaut wird). Wird eine Probe versendet, fliegt ein Brief hinaus.
 */
export function SampleFactory({ building, sending, stacks, href }: {
  building: boolean; sending: boolean; stacks: { country: string; ready: number; target: number; href?: string }[]; href?: string;
}) {
  return (
    <div className={`sfab ${building ? "live" : "idle"} ${sending ? "send" : ""}`} aria-label="Probenfertigung">
      <div className="sf-line" aria-hidden>
        <div className="sf-cards">{Array.from({ length: 10 }, (_, i) => <i key={i} style={{ "--i": i } as V} />)}</div>
        <div className="sf-env"><span className="flap" /></div>
        <div className="sf-fly" />
      </div>
      <div className="sf-stacks">
        {stacks.map((s) => {
          const inner = (
            <>
              <span className="sf-pile" aria-hidden>{Array.from({ length: Math.min(8, s.ready) }, (_, i) => <i key={i} style={{ "--i": i, background: COUNTRY_COLOR[s.country] ?? OTHER_COLOR } as V} />)}</span>
              <b>{s.ready}/{s.target}</b><span>{s.country}</span>
            </>
          );
          return s.href ?? href
            ? <Link key={s.country} href={s.href ?? href ?? "#"} className="sf-stack" title={`${s.country}: ${s.ready} fertige, geprüfte Proben (Soll ${s.target})`}>{inner}</Link>
            : <div key={s.country} className="sf-stack">{inner}</div>;
        })}
      </div>
      <div className="sf-state">{building ? "Proben werden gerade gebaut und geprüft" : "Vorrat ruht (baut nur, wenn etwas fehlt)"}{sending ? " · Probe wird versendet" : ""}</div>
    </div>
  );
}

/** Versand: kleine Briefe fliegen, solange gerade gesendet wird. */
export function MailFlight({ live, label }: { live: boolean; label: string }) {
  return (
    <div className={`mfl ${live ? "live" : "idle"}`} title={label} aria-label={label}>
      <span className="mf-box" aria-hidden>{Array.from({ length: 4 }, (_, i) => <i key={i} style={{ "--i": i } as V} />)}</span>
      <span className="mf-t">{label}</span>
    </div>
  );
}

export const LIVE_CSS = `
.dash .ldot{display:inline-block;width:10px;height:10px;border-radius:50%;background:#c3bcae;flex:none;position:relative}
.dash .ldot.live{background:#2c5d9e;box-shadow:0 0 0 0 rgba(44,93,158,.5);animation:ld-pulse 1.6s ease-out infinite}
.dash .ldot.live:after{content:"";position:absolute;inset:-4px;border-radius:50%;border:2px solid transparent;border-top-color:#2c5d9e;animation:ld-spin 1.2s linear infinite}
.dash .ldot.bad{background:var(--red)}.dash .ldot.off{background:#d9d4ca;outline:2px solid #eeebe4}
@keyframes ld-pulse{0%{box-shadow:0 0 0 0 rgba(44,93,158,.45)}70%{box-shadow:0 0 0 8px rgba(44,93,158,0)}100%{box-shadow:0 0 0 0 rgba(44,93,158,0)}}
@keyframes ld-spin{to{transform:rotate(360deg)}}

.dash .tris{display:grid;gap:12px;grid-template-columns:repeat(auto-fit,minmax(300px,1fr))}
.dash .tri{padding:14px;display:grid;gap:10px;align-content:start}
.dash .tri .th{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:14px}
.dash .tri .th a{color:inherit}
.dash .tri-body{position:relative;display:grid;gap:4px;padding:2px 0}
.dash .tlvl{position:relative;display:grid;grid-template-columns:1fr auto;align-items:center;min-height:30px;padding:0 10px;color:inherit;text-decoration:none;z-index:1}
.dash .tlvl .tb{position:absolute;left:50%;top:2px;bottom:2px;width:var(--w);transform:translateX(-50%);border-radius:8px;background:linear-gradient(180deg,#e8eff9,#d6e2f3);border:1px solid #c9d7ec;transition:width .6s ease;z-index:-1}
.dash .tri.idle .tlvl .tb{background:linear-gradient(180deg,#f1eee8,#e7e2d8);border-color:#e0dacd}
.dash .tri.live .tlvl .tb{animation:tri-pulse 2.8s ease-in-out infinite;animation-delay:var(--d)}
.dash .tlvl:last-child .tb{background:linear-gradient(180deg,#e9f4ed,#cfe7d8);border-color:#b9dcc6}
.dash .tlvl.na .tb{background:repeating-linear-gradient(45deg,#f4f2ee,#f4f2ee 6px,#ece8e0 6px,#ece8e0 12px);border-style:dashed}
.dash .tlvl .tl{font-size:12.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.dash .tlvl .tn{font-size:13px;font-weight:700;font-variant-numeric:tabular-nums;text-align:right}
.dash .tlvl.na .tn{font-weight:500;color:var(--soft);font-size:11px}
.dash .tlvl .tx{position:absolute;right:-2px;top:-7px;font-size:10px;color:var(--red);font-variant-numeric:tabular-nums}
.dash a.tlvl:hover .tb{border-color:var(--gold)}
.dash .tri-drops{position:absolute;inset:0;pointer-events:none;z-index:2}
.dash .tri-drops i{position:absolute;left:calc(50% + (var(--i) - 3) * 9px);top:0;width:6px;height:6px;border-radius:50%;background:#2c5d9e;opacity:0}
.dash .tri.live .tri-drops i{animation:tri-drop 2.6s cubic-bezier(.45,.05,.55,.95) infinite;animation-delay:calc(var(--i) * .37s)}
@keyframes tri-drop{0%{top:0;opacity:0;transform:translateX(0)}10%{opacity:.9}80%{opacity:.8}100%{top:calc(100% - 6px);opacity:0;transform:translateX(calc((3 - var(--i)) * 7px))}}
@keyframes tri-pulse{0%,100%{filter:none}50%{filter:brightness(1.06) saturate(1.2)}}
.dash .tri-out{display:grid;grid-template-columns:repeat(auto-fit,minmax(70px,1fr));gap:8px;border-top:1px solid var(--line);padding-top:10px}
.dash .tro{display:grid;justify-items:center;gap:0;padding:6px;border-radius:10px;background:#faf8f3;color:inherit;text-decoration:none;border:1px solid transparent}
.dash a.tro:hover{border-color:var(--gold)}
.dash .tro i{width:8px;height:8px;border-radius:50%}
.dash .tro b{font-size:22px;letter-spacing:-.02em;line-height:1.15}
.dash .tro span{font-size:11px;color:var(--soft);letter-spacing:.06em}
.dash .tri-note{font-size:11.5px;color:var(--soft)}

.dash .pipe{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:22px}
.dash .pipe li{position:relative}
.dash .pipe li>a{position:relative;z-index:1;background:var(--card);border:1px solid var(--line);border-radius:14px;padding:16px 8px 12px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:2px;color:inherit;text-decoration:none;height:100%;transition:border-color .2s,transform .2s}
.dash .pipe li>a:hover{border-color:var(--gold);transform:translateY(-1px)}
.dash .pipe li.busy>a{box-shadow:0 0 0 3px rgba(44,93,158,.08)}
.dash .pipe .v{font-size:28px;font-weight:700;letter-spacing:-.02em;line-height:1.1;white-space:nowrap}
.dash .pipe .l{font-size:11px;letter-spacing:.1em;text-transform:uppercase;color:var(--gold);font-weight:700}
.dash .pipe .s{font-size:12px;color:var(--soft)}
.dash .pipe .pd{display:block;margin-top:4px;font-size:11.5px;font-weight:700;font-variant-numeric:tabular-nums}.dash .pipe .pd.up{color:#1f8a5b}.dash .pipe .pd.down{color:var(--soft)}.dash .pipe .pd em{font-style:normal;font-weight:500;color:var(--soft)}
.dash .pipe li.neck>a{border:2px solid #d03b3b;background:#fdf1f0}
.dash .pipe .neck-tag{position:absolute;top:-9px;left:50%;transform:translateX(-50%);background:#d03b3b;color:#fff;font-size:10px;font-weight:700;border-radius:99px;padding:1px 8px;white-space:nowrap}
.dash .tube{position:absolute;top:50%;right:-22px;width:22px;height:8px;margin-top:-4px;border-radius:4px;background:#ece7dd;overflow:hidden;z-index:0}
.dash .tube i{position:absolute;top:1px;left:-6px;width:6px;height:6px;border-radius:50%;background:#2c5d9e;opacity:0}
.dash .tube.flow i{animation:tube-flow var(--dur) linear infinite}
.dash .tube.flow i:nth-child(2){animation-delay:calc(var(--dur) / -3)}.dash .tube.flow i:nth-child(3){animation-delay:calc(var(--dur) / -1.5)}
.dash .tube.jam{background:#f6dcda}.dash .tube.jam i{background:#d03b3b}
.dash .tube.jam.flow i{animation-name:tube-jam}
@keyframes tube-flow{0%{left:-6px;opacity:0}15%{opacity:1}85%{opacity:1}100%{left:100%;opacity:0}}
@keyframes tube-jam{0%{left:-6px;opacity:0}20%{opacity:1}100%{left:calc(100% - 7px);opacity:1}}

.dash .sfab{display:grid;gap:10px}
.dash .sf-line{position:relative;height:74px;border-radius:12px;background:linear-gradient(180deg,#faf8f3,#f3efe7);overflow:hidden}
.dash .sf-cards{position:absolute;left:12%;top:0;width:60px;height:100%}
.dash .sf-cards i{position:absolute;left:calc(var(--i) * 4px);top:-14px;width:22px;height:14px;border-radius:2px;background:#fff;border:1px solid #d6cfc0;opacity:0}
.dash .sfab.live .sf-cards i{animation:sf-card 3.6s ease-in infinite;animation-delay:calc(var(--i) * .16s)}
@keyframes sf-card{0%{top:-14px;left:0;opacity:0}12%{opacity:1}45%{top:34px;left:calc(30px + var(--i) * 1px);opacity:1}55%,100%{top:40px;left:34px;opacity:0}}
.dash .sf-env{position:absolute;left:calc(12% + 22px);top:32px;width:46px;height:30px;border-radius:3px;background:#efe3c8;border:1px solid #d8bd8a}
.dash .sf-env .flap{position:absolute;left:0;right:0;top:0;height:16px;background:#e6d3ab;clip-path:polygon(0 0,100% 0,50% 100%);transform-origin:top;transform:rotateX(180deg)}
.dash .sfab.live .sf-env{animation:sf-env 3.6s ease-in-out infinite}
.dash .sfab.live .sf-env .flap{animation:sf-flap 3.6s ease-in-out infinite}
@keyframes sf-flap{0%,55%{transform:rotateX(180deg)}65%,100%{transform:rotateX(0)}}
@keyframes sf-env{0%,62%{left:calc(12% + 22px);opacity:1}92%{left:78%;opacity:1}100%{left:80%;opacity:0}}
.dash .sf-fly{position:absolute;right:6%;top:24px;width:26px;height:18px;border-radius:2px;background:#efe3c8;border:1px solid #d8bd8a;opacity:0}
.dash .sfab.send .sf-fly{animation:sf-fly 2.4s ease-in infinite}
@keyframes sf-fly{0%{opacity:0;transform:translate(0,0) rotate(0)}15%{opacity:1}100%{opacity:0;transform:translate(60px,-40px) rotate(-14deg)}}
.dash .sfab.idle .sf-line{filter:grayscale(1);opacity:.7}
.dash .sf-stacks{display:grid;grid-template-columns:repeat(auto-fit,minmax(80px,1fr));gap:8px}
.dash .sf-stack{display:grid;justify-items:center;padding:6px;border-radius:10px;background:#faf8f3;color:inherit;text-decoration:none;border:1px solid transparent}
.dash a.sf-stack:hover{border-color:var(--gold)}
.dash .sf-pile{position:relative;width:34px;height:30px}
.dash .sf-pile i{position:absolute;left:0;bottom:calc(var(--i) * 3px);width:34px;height:7px;border-radius:2px;opacity:.85;border:1px solid rgba(0,0,0,.08)}
.dash .sf-stack b{font-size:18px}.dash .sf-stack span{font-size:11px;color:var(--soft)}
.dash .sf-state{font-size:12px;color:var(--soft)}

.dash .mfl{display:flex;align-items:center;gap:10px;font-size:12px;color:var(--soft)}
.dash .mf-box{position:relative;width:70px;height:22px;border-radius:6px;background:#f3efe7;overflow:hidden}
.dash .mf-box i{position:absolute;left:-14px;top:5px;width:12px;height:9px;border-radius:1px;background:#fff;border:1px solid #c9b48a;opacity:0}
.dash .mfl.live .mf-box{background:#e8eff9}
.dash .mfl.live .mf-box i{animation:mf 1.8s linear infinite;animation-delay:calc(var(--i) * .45s)}
@keyframes mf{0%{left:-14px;opacity:0;transform:translateY(2px)}20%{opacity:1}100%{left:72px;opacity:0;transform:translateY(-4px)}}

.dash #token .steps{list-style:decimal;padding-left:22px}.dash #token .steps li{line-height:1.5}
.dash .glow{animation:glow 2.4s ease-in-out 3}
@keyframes glow{0%,100%{box-shadow:none}50%{box-shadow:0 0 0 4px rgba(176,141,87,.35)}}

.dash .wsw{display:inline-flex;align-items:center;gap:6px;font-size:12px}
.dash .wsw button{position:relative;width:38px;height:22px;border-radius:99px;border:0;background:#cfc8bb;cursor:pointer;padding:0;transition:background .2s}
.dash .wsw button:after{content:"";position:absolute;top:3px;left:3px;width:16px;height:16px;border-radius:50%;background:#fff;transition:left .2s;box-shadow:0 1px 2px rgba(0,0,0,.2)}
.dash .wsw button.on{background:var(--green)}.dash .wsw button.on:after{left:19px}
.dash .wsw button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
.dash .werke2{display:grid;gap:12px;grid-template-columns:repeat(4,minmax(0,1fr))}
.dash .werk2{padding:14px;display:grid;gap:8px;align-content:start}
.dash .werk2 .th{display:flex;justify-content:space-between;align-items:center;font-weight:700;font-size:14px;gap:6px}
.dash .werk2 .th .nm{display:inline-flex;align-items:center;gap:8px}
.dash .werk2.off{opacity:.75}
.dash .werk2 .why{font-size:11.5px;color:var(--soft)}
.dash .werkrow{display:grid;gap:8px;grid-template-columns:repeat(5,minmax(0,1fr))}
.dash .werkmini{display:flex;align-items:center;gap:8px;padding:10px 12px;font-size:13px;font-weight:600;justify-content:space-between}
.dash .werkmini a{color:inherit;text-decoration:none;display:inline-flex;align-items:center;gap:8px;min-width:0}
.dash .werkmini small{display:block;font-weight:500;color:var(--soft);font-size:11px}
@media (max-width:1000px){.dash .werke2{grid-template-columns:repeat(2,minmax(0,1fr))}.dash .werkrow{grid-template-columns:repeat(2,minmax(0,1fr))}
  .dash .pipe{grid-template-columns:repeat(4,minmax(0,1fr));row-gap:22px}.dash .pipe li:nth-child(4) .tube{display:none}}
@media (max-width:640px){.dash .werke2{grid-template-columns:minmax(0,1fr)}
  .dash .pipe{gap:14px;row-gap:20px}.dash .pipe li>a{padding:12px 4px 8px}.dash .tube{right:-14px;width:14px}
  .dash .pipe .v{font-size:18px}.dash .pipe .l{font-size:8.5px;letter-spacing:0;max-width:100%;overflow:hidden;text-overflow:ellipsis}.dash .pipe .s{font-size:10px}
  .dash .tlvl .tl{font-size:11.5px}.dash .tro b{font-size:18px}}
@media (prefers-reduced-motion:reduce){.dash .ldot,.dash .ldot:after,.dash .tri *,.dash .tube i,.dash .sfab *,.dash .mf-box i,.dash .glow{animation:none!important}
  .dash .tube.flow{background:#d6e2f3}.dash .sfab.live .sf-line{outline:2px solid #c9d7ec}}
`;

/**
 * Abschnitte der Landingpages im Stil der Startseite (Inhaber 03.10.2026): Hero-Grafik (Punktkarte des Landes mit
 * wechselnden Beispiel-Signalen der Branche), „What they have in common“, Methode mit Beispiel-Lead, Probe-Formular
 * und „Good to know“. Markup und CSS der Startseite (.hpz, HOME_V2_CSS/HOME_CSS), Effekte in landing-fx.tsx.
 */
import type { CSSProperties, ReactNode } from "react";
import { DOT_MAPS } from "@/content/home-dot-maps";
import type { HomeText } from "../../home-i18n";
import type { Part } from "@/lib/examples";
import { Icon } from "./v2";
import { CITY, project, type Cc, type HeroSig, type MethodText } from "./landing-i18n";

const I = ({ n, c = "hp-ico" }: { n: string; c?: string }) => <svg className={c} aria-hidden="true"><use href={`#i-${n}`} /></svg>;
const R = ({ t }: { t: string }) => <span className="hp-redact" aria-hidden="true">{t}</span>;
const css = (o: Record<string, string | number>) => o as CSSProperties;
/** Verdeckte Teile (m) unscharf, der Rest im Klartext. */
export const Parts = ({ p, hidden }: { p: Part[]; hidden?: string }) => (
  <>{p.map((q, k) => q.m ? <R t={q.t} key={k} /> : <span key={k}>{q.t}</span>)}{hidden && p.some((q) => q.m) && <span className="hp-sr">{` (${hidden})`}</span>}</>
);

// ---------------------------------------------------------------- Hero

/** Punktkarte des Landes mit Pins an den Städten der gezeigten Beispiel-Signale (statt der Pins der Startseite). */
function dotMap(cc: Cc, places: string[]): string {
  const src = DOT_MAPS[cc];
  const at = src.indexOf('<g class="hp-pins">'), end = src.lastIndexOf("</svg>");
  const vb = (/viewBox="([^"]+)"/.exec(src)?.[1] ?? "0 0 100 100").split(/\s+/).map(Number);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
  const pins = [...new Set(places)].map((p, k) => {
    const ll = CITY[cc][p];
    if (!ll) return "";
    const [x, y] = project(cc, ll[0], ll[1]).map((v) => Math.round(v * 10) / 10);
    const right = x > vb[0] + vb[2] * 0.7;
    return `<g class="hp-pin${k === 0 ? " is-active" : ""}" data-city="${esc(p)}" data-x="${x}" data-y="${y}"><circle class="hp-pin__ring" cx="${x}" cy="${y}" r="7"/>`
      + `<circle class="hp-pin__dot" cx="${x}" cy="${y}" r="4.6"/><text class="hp-pin__label" x="${right ? x - 11 : x + 11}" y="${y + 4.5}"${right ? ' text-anchor="end"' : ""}>${esc(p)}</text></g>`;
  }).join("");
  return at < 0 ? src : `${src.slice(0, at)}<g class="hp-pins">${pins}</g>${src.slice(end)}`;
}

export function HeroStage({ cc, sigs, note, hidden }: { cc: Cc; sigs: HeroSig[]; note: string; hidden: string }) {
  return (
    <div className="hpz lz-hero">
      <div className="hp-stage">
        <div className="hp-maps" aria-hidden="true">
          <div className="hp-map is-on" data-cc={cc} dangerouslySetInnerHTML={{ __html: dotMap(cc, sigs.map((s) => s.place)) }} />
        </div>
        <svg className="hp-link" aria-hidden="true"><defs><linearGradient id="hp-g-link" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E2C894" stopOpacity=".95" /><stop offset="1" stopColor="#E2C894" stopOpacity=".35" /></linearGradient></defs><path d="" /><circle cx="-99" cy="-99" r="3.2" /></svg>
        <ol className="hp-sigs">
          {sigs.map((g, k) => (
            <li className={`hp-sig${k === 0 ? " is-active" : ""}`} data-city={g.place} data-cc={cc} key={k}>
              <p className="hp-sig__meta"><time>{g.date}</time><span className="hp-src"><I n="doc" />{g.source}</span></p>
              <p className="hp-sig__who"><R t={"x".repeat(14 - (k % 3) * 2)} /><span className="hp-sr">{hidden},</span><span className="hp-sig__place"><I n="pin" />{g.place}</span></p>
              <p className="hp-sig__event">{g.event}</p>
            </li>))}
        </ol>
        <p className="hp-stage__note"><I n="info" />{note}</p>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- What they have in common

export type PresenceRow = { key: string; icon: string; label: string; n: number; gap?: boolean };

export function Common({ kick, presence, signals }: {
  kick: string;
  presence?: { title: string; note: string; rows: PresenceRow[]; total: number; opening: string };
  signals: { icon: string; title: string; text: string }[];
}) {
  return (
    <section className="hpz lz-common" aria-label={kick}>
      <div className="hp-wrap">
        <p className="hp-rule hp-rule--cream" data-reveal="">{kick}</p>
        <div className={`lz-common__grid${presence ? "" : " lz-common__grid--solo"}`}>
          {presence && (
            <div className="lz-pres hp-grain" data-reveal="" data-live="">
              <div className="lz-pres__head">
                <h3>{presence.title}</h3>
                <p>{presence.note}</p>
              </div>
              <ul className="lz-pres__rows">
                {presence.rows.map((r, ri) => (
                  <li className={`lz-prow${r.gap ? " is-gap" : ""}`} key={r.key} style={css({ "--r": ri })}>
                    <span className="lz-prow__ic"><Icon name={r.icon} className="hp-ico" /></span>
                    <span className="lz-prow__lbl">{r.label}</span>
                    <span className="lz-prow__dots" aria-hidden="true">
                      {Array.from({ length: presence.total }, (_, k) => <i key={k} className={k < r.n ? "on" : undefined} style={css({ "--k": k })} />)}
                    </span>
                    <span className="lz-prow__n"><Icon name={r.gap ? "x" : "check"} className="hp-ico" />{r.n}/{presence.total}</span>
                  </li>))}
              </ul>
              <p className="lz-pres__open"><Icon name="spark" className="hp-ico" />{presence.opening}</p>
            </div>
          )}
          <ul className="lz-sigs" data-reveal="" style={css({ "--d": ".12s" })}>
            {signals.map((s, k) => (
              <li className="lz-sigcard" key={s.title} style={css({ "--k": k })}>
                <span className="lz-sigcard__ic"><Icon name={s.icon} className="hp-ico" /></span>
                <span className="lz-sigcard__no">{String(k + 1).padStart(2, "0")}</span>
                <div><h3>{s.title}</h3><p>{s.text}</p></div>
              </li>))}
          </ul>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Methode + Beispiel-Lead

const RADAR_T1 = "M108.1 6.9L108.6 1.9M116.2 7.9L117.1 3.0M124.2 9.7L125.5 4.9M132.0 12.1L133.7 7.4M139.5 15.3L141.6 10.7M153.6 23.4L156.5 19.3M160.1 28.4L163.3 24.5M166.1 33.9L169.7 30.3M171.6 39.9L175.5 36.7M176.6 46.4L180.7 43.5M184.7 60.5L189.3 58.4M187.9 68.0L192.6 66.3M190.3 75.8L195.1 74.5M192.1 83.8L197.0 82.9M193.1 91.9L198.1 91.4M193.1 108.1L198.1 108.6M192.1 116.2L197.0 117.1M190.3 124.2L195.1 125.5M187.9 132.0L192.6 133.7M184.7 139.5L189.3 141.6M176.6 153.6L180.7 156.5M171.6 160.1L175.5 163.3M166.1 166.1L169.7 169.7M160.1 171.6L163.3 175.5M153.6 176.6L156.5 180.7M139.5 184.7L141.6 189.3M132.0 187.9L133.7 192.6M124.2 190.3L125.5 195.1M116.2 192.1L117.1 197.0M108.1 193.1L108.6 198.1M91.9 193.1L91.4 198.1M83.8 192.1L82.9 197.0M75.8 190.3L74.5 195.1M68.0 187.9L66.3 192.6M60.5 184.7L58.4 189.3M46.4 176.6L43.5 180.7M39.9 171.6L36.7 175.5M33.9 166.1L30.3 169.7M28.4 160.1L24.5 163.3M23.4 153.6L19.3 156.5M15.3 139.5L10.7 141.6M12.1 132.0L7.4 133.7M9.7 124.2L4.9 125.5M7.9 116.2L3.0 117.1M6.9 108.1L1.9 108.6M6.9 91.9L1.9 91.4M7.9 83.8L3.0 82.9M9.7 75.8L4.9 74.5M12.1 68.0L7.4 66.3M15.3 60.5L10.7 58.4M23.4 46.4L19.3 43.5M28.4 39.9L24.5 36.7M33.9 33.9L30.3 30.3M39.9 28.4L36.7 24.5M46.4 23.4L43.5 19.3M60.5 15.3L58.4 10.7M68.0 12.1L66.3 7.4M75.8 9.7L74.5 4.9M83.8 7.9L82.9 3.0M91.9 6.9L91.4 1.9";
const RADAR_T2 = "M100.0 13.0L100.0 1.5M143.5 24.7L149.2 14.7M175.3 56.5L185.3 50.7M187.0 100.0L198.5 100.0M175.3 143.5L185.3 149.2M143.5 175.3L149.2 185.3M100.0 187.0L100.0 198.5M56.5 175.3L50.7 185.3M24.7 143.5L14.7 149.3M13.0 100.0L1.5 100.0M24.7 56.5L14.7 50.7M56.5 24.7L50.7 14.7";
const BLIPS: [string, string, string][] = [["73.7%", "30.1%", ".58s"], ["56.2%", "73.2%", "1.93s"], ["16.2%", "40.9%", "3.33s"]];
const Lock = () => <svg className="hp-lock" viewBox="0 0 24 24"><path className="hp-lock__shackle" d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /><rect x="5" y="10.5" width="14" height="10" rx="2" /></svg>;

/** Beispiel-Lead aus der echten Probe der Seite, Firmen- und Kontaktdaten verdeckt (Part.m). */
export type ExampleLead = {
  name: Part[]; place: string; tag: string; prio: string; event: Part[]; date: string; source: string;
  stamp: string; stampDay: [string, string]; person: { name?: Part[]; role: string; askFor: string };
  phone: Part[]; email: Part[]; opener?: Part[];
};

export function Method({ t, m, sources, across, example, hidden }: {
  t: HomeText; m: MethodText; sources: [string, string, string][]; across: string; example?: ExampleLead; hidden: string;
}) {
  const c = t.call;
  const fill = (s: string) => s.replace("{across}", across);
  return (
    <section className="hpz hp-sec hp-cream hp-method lz-method" id="method" aria-labelledby="method-title">
      <div className="hp-wrap">
        <div className="hp-intro" data-reveal=""><h2 className="hp-h2" id="method-title">{t.methH}</h2><p>{t.methSub}</p></div>
        <div className="hp-story" data-story="">
          <div className="hp-story__col">
            <span className="hp-story__rail" aria-hidden="true"><span className="hp-story__fill" /><span className="hp-story__head" /></span>
            <ol className="hp-story__steps">
              {m.steps.map(([ic, h, d], k) => (
                <li className={`hp-sstep is-done${k === 0 ? " is-active" : ""}`} key={h}>
                  <span className="hp-step__icon"><I n={ic} /></span><span className="hp-step__num">{String(k + 1).padStart(2, "0")}</span>
                  <div><h3>{h}</h3><p>{fill(d)}</p></div>
                </li>))}
            </ol>
          </div>
          {/* Mitlaufende Grafik (Illustration, Bewertungswerte sind ein Beispiel) */}
          <div className="hp-story__aside" aria-hidden="true">
            <div className="hp-story__stick">
              <div className="hp-story__stage" data-step="0">
                <span className="hp-story__grid" />
                <span className="hp-story__marks"><i /><i /><i /><i /></span>
                <span className="hp-story__beam" />
                <div className="hp-viz is-active" data-viz="0">
                  <p className="hp-viz__label"><span className="hp-live" />{t.story.v0}</p>
                  <div className="hp-ledger">
                    <span className="hp-ledger__scan" />
                    <ul className="hp-ledger__rows">
                      {sources.map(([ic, name, where], k) => (
                        <li style={css({ "--k": k })} key={name}>
                          <span className="hp-ledger__ico"><I n={ic} /></span>
                          <span className="hp-ledger__txt"><b>{name}</b><small>{where}</small></span>
                          <svg className="hp-ledger__ok" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10" /><path d="m7.5 12.3 3 3 6-6.3" /></svg>
                        </li>))}
                    </ul>
                  </div>
                </div>
                <div className="hp-viz" data-viz="1">
                  <p className="hp-viz__label">{t.story.v1}</p>
                  <div className="hp-moment-wrap">
                    <div className="hp-radar">
                      <svg className="hp-radar__dial" viewBox="0 0 200 200"><circle className="r" cx="100" cy="100" r="98.5" /><circle className="r" cx="100" cy="100" r="74" /><circle className="r" cx="100" cy="100" r="49" /><circle className="r" cx="100" cy="100" r="24" /><path className="x" d="M100 6V194M6 100H194" /><path className="t1" d={RADAR_T1} /><path className="t2" d={RADAR_T2} /></svg>
                      <span className="hp-radar__sweep" /><span className="hp-radar__core" />
                      {BLIPS.map(([x, y, tm]) => <span className="hp-blip" key={tm} style={css({ "--bx": x, "--by": y, "--t": tm })}><i /></span>)}
                    </div>
                    <ul className="hp-moments">{m.moments.map(([ic, txt], k) => <li style={css({ "--t": BLIPS[k]?.[2] ?? "0s" })} key={txt}><I n={ic} />{txt}</li>)}</ul>
                  </div>
                  <p className="hp-moment__stamp"><I n="doc" />{t.story.stamp}</p>
                </div>
                <div className="hp-viz" data-viz="2">
                  <p className="hp-viz__label">{t.story.v2} <span className="hp-viz__ex">{t.story.ex}</span></p>
                  <div className="hp-qs">
                    <div className="hp-qs__head"><span className="hp-qs__ic"><I n="target" /></span><b>{t.story.qs}</b></div>
                    {t.story.rows.map(([l, v]) => <div className="hp-qs__row" key={l} style={css({ "--v": v })}><span>{l}</span><b className="hp-qs__bar"><i /></b><em>{v}</em></div>)}
                  </div>
                  <span className="hp-qs__link" />
                  <div className="hp-belt" data-belt="">
                    <span className="hp-belt__line" />
                    <span className="hp-belt__scan"><i /></span>
                    {[0, 1, 2, 3, 4].map((k) => (
                      <div className={`hp-belt__card${k === 3 ? " is-done is-pass has-score" : ""}`} data-slot={k - 1} key={k}>
                        <span className="hp-belt__sq" /><span className="hp-belt__l1" /><span className="hp-belt__l2" /><span className="hp-belt__l3" />
                        <b className="hp-belt__score">{k === 3 ? 91 : ""}</b>
                        <span className="hp-belt__ok"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg></span>
                      </div>))}
                  </div>
                  <p className="hp-belt__legend"><span className="hp-belt__yes"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>{t.story.pass}</span><span className="hp-belt__no"><I n="ban" />{t.story.fail}</span></p>
                </div>
                <div className="hp-viz" data-viz="3">
                  <div className="hp-mail">
                    <span className="hp-mail__sheen" />
                    <div className="hp-mail__bar"><span className="hp-mail__dots"><i /><i /><i /></span><span className="hp-mail__inbox"><I n="inbox" />{t.story.inbox}</span><em>{t.story.mon} 07:00</em></div>
                    <div className="hp-mail__body">
                      <div className="hp-mail__head"><span className="hp-mail__logo">N<span>P</span></span><div><b>NextGen Profit</b><small>{t.story.mailSub}</small></div><span className="hp-mail__new"><i />{t.story.isNew}</span></div>
                      <p className="hp-mail__subject">{t.story.mailSubject}</p>
                      <div className="hp-mail__files">
                        <span><b className="hp-file hp-file--pdf">PDF</b><span><strong>{t.story.files[0]}</strong><small>{t.story.fileSub[0]}</small></span></span>
                        <span><b className="hp-file hp-file--xls"><I n="table" /></b><span><strong>{t.story.files[1]}</strong><small>{t.story.fileSub[1]}</small></span></span>
                      </div>
                      <ul className="hp-mail__leads">{m.mail.map(([ic, lbl], k) => (
                        <li style={css({ "--k": k })} key={k}><span className="hp-mail__ic"><I n={ic} /></span><span className="hp-mail__who"><R t={"x".repeat(14 - k)} /><small>{lbl}</small></span><span className="hp-mail__sc">{[91, 86, 78][k]}</span><Lock /></li>))}
                      </ul>
                    </div>
                  </div>
                  <p className="hp-mail__excl"><I n="lock" />{t.story.excl}</p>
                </div>
                <ol className="hp-story__track">{t.story.track.map((x, k) => <li className={k === 0 ? "is-on is-cur" : undefined} key={x}>{x}</li>)}</ol>
              </div>
            </div>
          </div>
        </div>

        {example && <Example t={t} ex={example} hidden={hidden} />}
      </div>
    </section>
  );
}

function Example({ t, ex, hidden }: { t: HomeText; ex: ExampleLead; hidden: string }) {
  const c = t.call;
  return (
    <div className="hp-example" data-example-lead="">
      <p className="hp-rule hp-rule--cream" data-reveal="">{t.ex.label}</p>
      <div className="hp-example__grid">
        <div className="hp-lead-wrap" data-reveal="" style={css({ "--d": ".1s" })}>
          <span className="hp-crop" aria-hidden="true"><i /><i /><i /><i /></span>
          <article className="hp-lead" aria-label={t.ex.label}>
            <div className="hp-lead__main">
              <span className="hp-stamp" aria-hidden="true"><svg viewBox="0 0 120 120"><defs><path id="hp-stamp-arc" d="M18 60a42 42 0 1 1 84 0a42 42 0 1 1-84 0" /><filter id="hp-ink" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves={2} seed={7} result="n" /><feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -3 2.5" result="m" /><feComposite in="SourceGraphic" in2="m" operator="in" /></filter></defs>
                <g filter="url(#hp-ink)"><circle className="c" cx="60" cy="60" r="56" strokeWidth="2.4" /><circle className="c" cx="60" cy="60" r="51.5" strokeWidth=".9" /><circle className="c" cx="60" cy="60" r="31" strokeWidth=".9" />
                  <text fontSize="9" letterSpacing="1.5"><textPath href="#hp-stamp-arc" textLength="256" lengthAdjust="spacing">{`${ex.stamp} • ${ex.source.toUpperCase()} •`}</textPath></text>
                  <text x="60" y="59" textAnchor="middle" fontSize="13.5" letterSpacing=".4">{ex.stampDay[0]}</text><text x="60" y="73" textAnchor="middle" fontSize="10" letterSpacing="2.4">{ex.stampDay[1]}</text></g></svg></span>
              <header className="hp-lead__head">
                <span className="hp-lead__icon"><I n="building" /></span>
                <div><p className="hp-lead__name"><Parts p={ex.name} hidden={hidden} /></p>
                  <p className="hp-lead__place"><I n="pin" />{ex.place}</p></div>
              </header>
              <dl className="hp-lead__facts">
                <div className="hp-fact hp-fact--wide hp-fact--event" data-mark="1"><dt>{c.event} <span className="hp-mark" aria-hidden="true">1</span></dt><dd><Parts p={ex.event} hidden={hidden} /></dd></div>
                <div className="hp-fact" data-mark="2"><dt>{c.date} <span className="hp-mark" aria-hidden="true">2</span></dt><dd>{ex.date}</dd></div>
                <div className="hp-fact" data-mark="2"><dt>{c.source} <span className="hp-mark" aria-hidden="true">2</span></dt><dd>{ex.source}</dd></div>
                <div className="hp-fact" data-mark="2"><dt>{c.person} <span className="hp-mark" aria-hidden="true">2</span></dt>
                  <dd>{ex.person.name ? <><Parts p={ex.person.name} hidden={hidden} /><small className="hp-fact__role">{ex.person.role}</small></>
                    : <>{ex.person.askFor} <small className="hp-fact__role">{ex.person.role}</small></>}</dd></div>
                <div className="hp-fact" data-mark="2"><dt>{c.phone} <span className="hp-mark" aria-hidden="true">2</span></dt><dd className="hp-nowrap"><Parts p={ex.phone} hidden={hidden} /></dd></div>
                <div className="hp-fact hp-fact--wide" data-mark="2"><dt>{c.email} <span className="hp-mark" aria-hidden="true">2</span></dt><dd className="hp-nowrap"><Parts p={ex.email} hidden={hidden} /></dd></div>
              </dl>
              <div className="hp-lead__foot">
                <span className="hp-pill"><I n="lock" />{t.ex.pills[0]}</span>
                <span className="hp-pill"><I n="calendar" />{t.ex.pills[1]}</span>
              </div>
            </div>
            <div className="hp-lead__side">
              <div className="hp-tags">
                <span className="hp-tag"><I n="doc" />{ex.tag}</span>
                <span className="hp-tag"><I n="bars" />{ex.prio}</span>
              </div>
              <p className="hp-side-label"><I n="target" />{t.ex.win}</p>
              {ex.opener && (
                <figure className="hp-opening" data-mark="3">
                  <figcaption>{c.opening} <span className="hp-mark" aria-hidden="true">3</span></figcaption>
                  <blockquote>“<Parts p={ex.opener} />”</blockquote>
                </figure>)}
              <div className="hp-call">
                <span className="hp-call__dot"><I n="phone" /></span>
                <div><small>{t.ex.pick}</small><strong className="hp-nowrap"><Parts p={ex.phone} /></strong></div>
              </div>
            </div>
          </article>
        </div>
        <div data-reveal="" style={css({ "--d": ".2s" })}>
          <h2 className="hp-h2">{t.callH}</h2>
          <ol className="hp-notes">
            {c.points.map(([h, d], k) => (
              <li className="hp-note" data-note={k + 1} key={h}><span className="hp-mark" aria-hidden="true">{k + 1}</span><div><h3>{h}</h3><p>{d}</p></div></li>))}
          </ol>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- Probe

const SHEET = [[70, 79, 68, 73], [85, 74, 67, 52], [56, 82, 80, 51], [69, 86, 85, 65], [66, 73, 78, 61], [56, 90, 78, 65], [67, 75, 81, 66], [78, 72, 83, 90], [79, 86, 77, 59], [70, 85, 79, 53]];
const SEAL = "M50.00 1.00L56.00 4.39L62.68 2.67L67.60 7.50L74.50 7.56L78.00 13.51L84.65 15.35L86.49 22.00L92.44 25.50L92.50 32.40L97.33 37.32L95.61 44.00L99.00 50.00L95.61 56.00L97.33 62.68L92.50 67.60L92.44 74.50L86.49 78.00L84.65 84.65L78.00 86.49L74.50 92.44L67.60 92.50L62.68 97.33L56.00 95.61L50.00 99.00L44.00 95.61L37.32 97.33L32.40 92.50L25.50 92.44L22.00 86.49L15.35 84.65L13.51 78.00L7.56 74.50L7.50 67.60L2.67 62.68L4.39 56.00L1.00 50.00L4.39 44.00L2.67 37.32L7.50 32.40L7.56 25.50L13.51 22.00L15.35 15.35L22.00 13.51L25.50 7.56L32.40 7.50L37.32 2.67L44.00 4.39Z";
const w = (n: number) => css({ "--w": `${n}%` });

export function SampleSec({ t, title, gold, intro, form, how, place }: {
  t: HomeText; title: string; gold: string; intro: string; form: ReactNode; how: string[]; place: string;
}) {
  const c = t.call;
  return (
    <section className="hpz hp-sec hp-cream hp-sample lz-sample" id="sample" aria-labelledby="sample-title">
      <div className="hp-wrap lz-sample__grid">
        <div className="hp-formcard hp-grain lz-sample__form" id="probe" data-reveal="" data-live="">
          <h2 className="hp-h2" id="sample-title">{title}<br /><span className="hp-gold">{gold}</span></h2>
          <p className="hp-formcard__intro">{intro}</p>
          {form}
        </div>
        <div className="hp-side__block lz-sample__recv" data-reveal="" style={css({ "--d": ".1s" })}>
          <h3 className="hp-side__title">{t.receive.title}</h3>
          <div className="hp-docs" aria-hidden="true">
            <div className="hp-doc hp-doc--sheet">
              <div className="hp-sheet__top"><span className="hp-file hp-file--xls"><I n="table" /></span><b>{t.story.files[1]}</b></div>
              <div className="hp-sheet"><span className="n" /><span>{t.docs.company}</span><span>{c.phone}</span><span>{c.email}</span><span>{c.event}</span>
                {SHEET.map((r, k) => [<span className="n" key={`n${k}`}>{k + 1}</span>, ...r.map((v, j) => <i className={j === 0 ? "k" : j === 3 ? "g" : undefined} style={w(v)} key={`${k}-${j}`} />)])}</div>
            </div>
            <div className="hp-doc hp-doc--pdf">
              <div className="hp-pdf__head"><span className="hp-pdf__logo">N<span>P</span></span><b>{t.docs.brief}</b><em>1 / 10</em></div>
              <div className="hp-pdf__co"><i className="hp-bar hp-bar--ink" style={w(64)} /><small><I n="pin" />{place}</small></div>
              <p className="hp-pdf__k">{c.event}</p>
              <i className="hp-bar" style={w(96)} /><i className="hp-bar" style={w(88)} /><i className="hp-bar" style={w(58)} />
              <div className="hp-pdf__two"><div><p className="hp-pdf__k">{c.date}</p><i className="hp-bar hp-bar--ink" style={w(72)} /></div><div><p className="hp-pdf__k">{c.source}</p><i className="hp-bar hp-bar--ink" style={w(90)} /></div></div>
              <div className="hp-pdf__open"><p className="hp-pdf__k">{c.opening}</p><i className="hp-bar" style={w(96)} /><i className="hp-bar" style={w(92)} /><i className="hp-bar" style={w(54)} /></div>
              <div className="hp-pdf__call"><span><I n="phone" /></span><i className="hp-bar hp-bar--ink" style={w(100)} /></div>
            </div>
            <span className="hp-seal"><svg viewBox="0 0 100 100"><defs><linearGradient id="hp-g-seal" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#F5E0B2" /><stop offset=".55" stopColor="#D4B072" /><stop offset="1" stopColor="#A9824A" /></linearGradient><path id="hp-seal-arc" d="M19 50a31 31 0 1 1 62 0a31 31 0 1 1-62 0" /></defs>
              <path d={SEAL} fill="url(#hp-g-seal)" /><circle cx="50" cy="50" r="41.5" fill="none" stroke="#FFF4DA" strokeOpacity=".75" strokeWidth=".8" /><circle cx="50" cy="50" r="24" fill="none" stroke="#4A3612" strokeOpacity=".35" strokeWidth=".8" />
              <text fontSize="7.4" letterSpacing="1.1" fill="#3A2A0E"><textPath href="#hp-seal-arc" textLength="188" lengthAdjust="spacing">{t.docs.seal}</textPath></text>
              <text x="50" y="58" textAnchor="middle" fontSize="23" letterSpacing="-1" fill="#1E1608">10</text></svg></span>
          </div>
          <ul className="hp-receive">
            <li><strong>{t.receive.pdf[0]}</strong><span>{t.receive.pdf[1]}</span></li>
            <li><strong>{t.receive.csv[0]}</strong><span>{t.receive.csv[1]}</span></li>
          </ul>
        </div>
        <div className="hp-side__block lz-sample__how" data-reveal="" style={css({ "--d": ".2s" })}>
          <h3 className="hp-side__title">{t.howTitle}</h3>
          <ol className="hp-how">{how.map((h) => <li key={h}><span>{h}</span></li>)}</ol>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- Fragen

export function Faq({ t, contact }: { t: HomeText; contact: string }) {
  return (
    <section className="hpz hp-sec hp-faq" id="faq" aria-labelledby="faq-title">
      <div className="hp-wrap hp-faq__grid">
        <div className="hp-faq__head">
          <h2 className="hp-h2" id="faq-title">{t.faqH}</h2>
          <p className="hp-faq__more"><span className="hp-faq__mail"><I n="mail" /></span><span>{t.askMore}<br /><a href={`mailto:${contact}`}>{contact}</a></span></p>
        </div>
        <div className="hp-faq__list">
          {t.faq.map((f) => (
            <details className="hp-qa" key={f.q}><summary>{f.q}<span className="hp-qa__btn" aria-hidden="true"><I n="plus" c="hp-ico hp-qa__ic" /></span></summary><div className="hp-qa__a"><p>{f.a}</p></div></details>))}
        </div>
      </div>
    </section>
  );
}

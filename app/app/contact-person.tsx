import type { CSSProperties } from "react";
import type { HomeText } from "./home-i18n";

/** Persönlicher Ansprechpartner (Vorlage v4): Startseite und Landingpages (Inhaber 03.10.2026). Animation: tune-fx.ts. */
const I = ({ n, c = "hp-ico" }: { n: string; c?: string }) => <svg className={c} aria-hidden="true"><use href={`#${/^fs?-/.test(n) ? n : "i-" + n}`} /></svg>;
const TUNE_DOTS: [number, number, boolean][] = [[18.4, -26.2, true], [13.6, -8.5, true], [25.2, 9.7, true], [9.8, 6.9, true], [4.0, 45.8, false], [-7.5, 20.7, true], [-27.6, 9.0, true], [-8.0, -0.8, true], [-22.0, -27.2, true], [-6.8, -17.7, true]];

export function ContactPersonSec({ t, contactHref }: { t: HomeText; contactHref: string }) {
  return (
    <section className="hp-sec hp-dark hp-grain hp-contact" id="contact-person" aria-labelledby="contact-title">
      <div className="hp-wrap hp-contact__grid">
        <div className="hp-contact__copy" data-reveal="">
          <p className="hp-rule">{t.pcKick}</p>
          <h2 className="hp-h2" id="contact-title">{t.pcH[0]}{t.pcH[1]}</h2>
          <p className="hp-contact__lede">{t.pcLede}</p>
          <ul className="hp-contact__points">
            {t.pcList.map(([ic, h, d]) => (
              <li key={h}><span className="hp-contact__ico"><I n={{ user: "user", focus: "sliders", target: "coins" }[ic] ?? ic} /></span><div><h3>{h}</h3><p>{d}</p></div></li>))}
          </ul>
          <a className="hp-btn hp-btn--gold" href={contactHref} data-magnetic=""><span>{t.pcBtn}</span><I n="arrow" c="hp-ico hp-btn__arrow" /></a>
        </div>
        <figure className="hp-tune" data-tune="" data-reveal="" style={{ "--d": ".15s" } as CSSProperties}>
          <figcaption className="hp-sr">{t.tune.cap}</figcaption>
          <div className="hp-tune__note">
            <span className="hp-tune__avatar" aria-hidden="true">N<span>P</span></span>
            <div className="hp-tune__msg">
              <p className="hp-tune__who">{t.tune.who} <span className="hp-tune__ex">{t.tune.ex}</span></p>
              <div className="hp-tune__texts">
                {t.tune.texts.map((x, k) => <p data-w={k} aria-hidden={k < 3 ? true : undefined} className={k === 3 ? "is-on" : undefined} key={k}>{x}</p>)}
              </div>
            </div>
          </div>
          <div className="hp-tune__body">
            <div className="hp-target" aria-hidden="true">
              <svg viewBox="0 0 200 200"><path className="cross" d="M100 4V196M4 100H196" /><circle className="ring" cx="100" cy="100" r="94" /><circle className="ring ring--mid" cx="100" cy="100" r="67" /><circle className="ring ring--fit" cx="100" cy="100" r="40" /><circle className="core" cx="100" cy="100" r="2.5" />
                <g>{TUNE_DOTS.map(([x, y, fit], k) => <circle className={`dot${fit ? " is-fit" : ""}`} cx="100" cy="100" r="4.6" style={{ transform: `translate(${x}px,${y}px)` }} key={k} />)}</g></svg>
              <p className="hp-target__legend"><span><i className="is-fit" />{t.tune.fit}</span><span><i />{t.tune.notYet}</span></p>
            </div>
            <dl className="hp-filters">
              {t.tune.rows.map(([label, vals, from], k) => (
                <div className={k === t.tune.rows.length - 1 ? "is-changed" : undefined} key={label}><dt data-upd={t.tune.upd}>{label}</dt>
                  <dd>{vals.map((v, j) => <span data-from={from[j]} aria-hidden={j < vals.length - 1 ? true : undefined} className={j === vals.length - 1 ? "is-on" : undefined} key={v}>{v}</span>)}</dd></div>))}
            </dl>
          </div>
          <div className="hp-tune__weeks" role="tablist" aria-label={t.tune.weeks}>
            {[0, 1, 2, 3].map((k) => <button className="hp-week" type="button" role="tab" aria-selected={k === 3} tabIndex={k === 3 ? 0 : -1} key={k}>{t.tune.week} {k + 1}</button>)}
          </div>
        </figure>
      </div>
    </section>
  );
}

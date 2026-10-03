import type { CSSProperties } from "react";
import type { Metadata } from "next";
import VIDEOS from "@/content/videos.json";
import { BRAND, CONTACT, LEGAL_NAME, siteUrl } from "@/lib/site";
import { consentText } from "@/lib/consent";
import { wishesFor } from "@/content/sample-wishes";
import { LANDING_CSS } from "@/lib/landing-css";
import { HOME_CSS } from "@/lib/home-css";
import { HOME_SPRITE, HOME_V2_CSS } from "@/lib/home-v2-css";
import { SampleForm, type FormOption } from "./sample-form";
import { homeFeed, homeStats, publicPages, type PublicPage } from "@/lib/site-pages";
import { BrandShell, SiteFooter, SiteHeader } from "./chrome";
import { HOME, HOME_LANGS, HOME_PATH, type HomeLang } from "./home-i18n";
import { CONTACT_PATH } from "./contact/contact-i18n";
import { HomeFx } from "./home-fx";
import { COUNTRIES, segKey, type CountryCode } from "@/lib/country";

// Register (Inhaber 27.09.2026 „über 18 Millionen“): Companies House 4.930.634 (effektives Register, März 2026,
// GOV.UK Companies register activities 2025/26) + INSEE SIRENE 13,7 Mio. aktive Rechtseinheiten (2022) = 18,6 Mio.
// Hochrechnung (Stand 27.09.2026): neue Firmen pro Tag je Land × 365, abgerundet.
// UK 12.698 in 35 Tagen ≈ 132.000, US 600 in 2 Tagen ≈ 110.000, FR 362 in 6 Tagen ≈ 22.000 → ≈ 264.000 pro Jahr.
const YEARLY = 250000;

export function homeMetadata(lang: HomeLang): Metadata {
  const t = HOME[lang];
  const title = `${BRAND} | ${t.title}`;
  const url = siteUrl() + (lang === "en" ? "" : HOME_PATH[lang]);
  return {
    title, description: t.desc,
    alternates: { canonical: url, languages: { en: siteUrl() + "/", fr: siteUrl() + "/fr", de: siteUrl() + "/de", "x-default": siteUrl() + "/" } },
    robots: { index: true, follow: true },
    openGraph: { title, description: t.desc, url, siteName: BRAND, type: "website", locale: { en: "en_GB", fr: "fr_FR", de: "de_DE" }[lang] },
  };
}

/** Gleiche Reihenfolge der Branchen in jedem Land (Vorlage Inhaber 03.10.2026). */
const ORDER = ["accountants", "financial-advisers", "insurance-brokers", "recruitment", "web-agencies", "it-services"];
const IND_ICON: Record<string, string> = {
  accountants: "calc", "financial-advisers": "trend", "insurance-brokers": "umbrella", recruitment: "users", "web-agencies": "globe", "it-services": "zap",
};
const CC: CountryCode[] = ["UK", "US", "FR"];
const FLAG: Record<string, string> = { UK: "f-uk", US: "f-us", FR: "f-fr" };

/** Symbol aus dem Sprite der Vorlage. */
const I = ({ n, c = "hp-ico" }: { n: string; c?: string }) => <svg className={c} aria-hidden="true"><use href={`#${n.startsWith("f-") ? n : "i-" + n}`} /></svg>;
const R = ({ t }: { t: string }) => <span className="hp-redact" aria-hidden="true">{t}</span>;
const i = (n: number) => ({ "--i": n }) as CSSProperties;

/** Beispiele für „Recently detected“, falls die Datenbank nichts liefert (echte Probe, Firmenname verdeckt). */
const FALLBACK = [
  { place: "London", date: "2 Oct 2026", source: "Find a Tender", event: "Won a public contract, published on Find a Tender on 2 October 2026: “London Borough of Richmond” for Sutton, Achieving for Children and Kingston" },
  { place: "Wolverhampton", date: "2 Oct 2026", source: "Find a Tender", event: "Won a public contract, published on Find a Tender on 2 October 2026: “FP&A Tool Consultancy” for Agriculture and Horticulture Development Board" },
  { place: "Wakefield", date: "2 Oct 2026", source: "Find a Tender", event: "Won a public contract, published on Find a Tender on 2 October 2026: “Cleaning Services” for Inspire Learning Trust" },
];

/** Radar: Signale aus drei Ländern leuchten auf, wenn der Strahl sie erreicht (Inhaber 03.10.2026: „das radar auf jeden fall drin“). */
function Radar({ labels }: { labels: [string, string][] }) {
  const C = 200;
  const pt = (deg: number, r: number) => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)];
  const blips: [number, number][] = [[30, 130], [150, 120], [260, 150], [75, 70], [200, 165], [320, 95], [115, 175], [345, 160], [230, 60]];
  return (
    <div className="radar" aria-hidden="true">
      <svg viewBox="0 0 400 400">
        <defs>
          <radialGradient id="hmsw" cx="0" cy="0" r="1" gradientUnits="userSpaceOnUse" gradientTransform="translate(200 200) scale(195)">
            <stop offset="0" stopColor="#C9A465" stopOpacity=".05" /><stop offset="1" stopColor="#EBD7AE" stopOpacity=".35" />
          </radialGradient>
        </defs>
        {[60, 110, 160, 195].map((r) => <circle key={r} className="ring" cx={C} cy={C} r={r} />)}
        <path className="axis" d="M5 200H395M200 5V395" />
        <g className="sweep">
          {/* Keil hinter dem Strahl (gegen den Uhrzeigersinn), Strahl zeigt bei 0° nach rechts */}
          <path d={`M200 200L395 200A195 195 0 0 0 ${pt(-50, 195).join(" ")}Z`} fill="url(#hmsw)" />
          <path d="M200 200H395" stroke="#EBD7AE" strokeWidth="1.5" strokeOpacity=".8" />
        </g>
        {blips.map(([deg, r], k) => {
          const [x, y] = pt(deg, r);
          return <circle key={k} className="blip" cx={x} cy={y} r={k < 3 ? 7 : 4.5} fill={k < 3 ? "#EBD7AE" : "#C9A465"}
            style={{ "--d": `${(deg / 60).toFixed(2)}s` } as CSSProperties} />;
        })}
        <circle className="core" cx={C} cy={C} r="12" />
      </svg>
      {labels.map(([cc, txt], k) => {
        const [x, y] = pt(blips[k][0], blips[k][1]);
        const left = `calc(${(x / 4).toFixed(1)}% + 12px)`;
        const pos: Record<string, string> = { top: `calc(${(y / 4).toFixed(1)}% - 14px)`, "--d": `${k * 0.8}s` };
        if (k === 1) pos.right = `calc(${(100 - x / 4).toFixed(1)}% + 12px)`; else pos.left = left;
        return (
          <span className="lbl" key={cc} style={pos as CSSProperties}>
            <I n={cc} /><em>{txt}</em>
          </span>);
      })}
    </div>
  );
}


export async function Home({ lang }: { lang: HomeLang }) {
  const t = HOME[lang];
  const loc = { en: "en-GB", fr: "fr-FR", de: "de-DE" }[lang];
  const mio = { en: "M+", fr: " M+", de: " Mio.+" }[lang];
  const [pages, stats, feed] = await Promise.all([
    publicPages().catch(() => [] as PublicPage[]),
    homeStats().catch(() => ({ companies: 0, signals: 0 })),
    homeFeed(lang).catch(() => []),
  ]);
  const V = VIDEOS as Record<string, { src: string; poster: string; seconds: number }>;
  const video = V[`${lang}:home`] ?? V["en:home"];
  const signals = (feed.length >= 3 ? feed.slice(0, 3).map((f) => ({ place: f.place, date: f.date, source: f.source, event: f.event })) : FALLBACK);
  // Branchen je Land: Schlüssel -> Seite je Land
  const bySeg = new Map<string, Partial<Record<CountryCode, string>>>();
  for (const p of pages) {
    const k = segKey(p.slug);
    bySeg.set(k, { ...(bySeg.get(k) ?? {}), [p.country as CountryCode]: "/" + p.slug });
  }
  const segs = [...bySeg.keys()].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  const countries = CC.filter((c) => pages.some((p) => p.country === c));
  const defCountry: CountryCode = lang === "fr" && countries.includes("FR") ? "FR" : countries.includes("UK") ? "UK" : countries[0] ?? "UK";
  const formOptions: FormOption[] = [...pages]
    .sort((a, b) => Number(b.country === defCountry) - Number(a.country === defCountry) || a.country.localeCompare(b.country)
      || ORDER.indexOf(segKey(a.slug)) - ORDER.indexOf(segKey(b.slug)))
    .map((p) => ({
      value: p.slug,
      label: `${t.industries[segKey(p.slug)]?.[0] ?? p.name} · ${COUNTRIES[p.country as CountryCode]?.name[lang] ?? p.country}`,
      wishes: wishesFor(segKey(p.slug)).map((w) => ({ key: w.key, label: w[lang] })),
    }));
  const contactHref = CONTACT_PATH[lang];
  const ld = {
    "@context": "https://schema.org", "@type": "Organization", name: BRAND, legalName: LEGAL_NAME, url: siteUrl(), email: CONTACT,
    description: t.desc, address: { "@type": "PostalAddress", streetAddress: "Nikolaistraße 3-7", postalCode: "04109", addressLocality: "Leipzig", addressCountry: "DE" },
  };
  const nums: [string, string, boolean][] = [
    [`18${mio}`, t.stats[0], false], [`${YEARLY.toLocaleString(loc)}+`, t.stats[1], false],
    [stats.signals.toLocaleString(loc), t.stats[2], true], ["10", t.stats[3], false],
  ];
  const words = t.h1.split(/\s+/);
  const gold = new Set(t.h1gold.map((g) => g.toLowerCase()));
  const c = t.call;

  return (
    <BrandShell lang={lang} extraCss={LANDING_CSS + HOME_CSS + HOME_V2_CSS}>
      {/* Effekte der Vorlage nur mit JavaScript (sonst bleibt alles sichtbar) */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <div dangerouslySetInnerHTML={{ __html: HOME_SPRITE }} />
      <SiteHeader links={[["#film", "Film"], ["#industries", t.nav[1][1]], ["#contact-person", t.nav[2][1]], [contactHref, t.contact]]} cta={["#sample", t.cta]}
        langs={HOME_LANGS.map((l) => [l.toUpperCase(), HOME_PATH[l], l === lang])} />
      <HomeFx />
      <div className="lp2 hm hpz">

        <section className="hp-hero hp-grain" aria-labelledby="hero-title">
          <div className="hp-hero__fx" aria-hidden="true">
            <span className="hp-aurora hp-aurora--blue" /><span className="hp-aurora hp-aurora--gold" /><span className="hp-aurora hp-aurora--deep" />
            <span className="hp-dots" /><span className="hp-dots hp-dots--lit" /><span className="hp-beam" />
          </div>
          <div className="hp-hero__stage">
            <div className="hp-wrap hp-hero__grid">
              <div>
                <p className="hp-badge hp-in" style={{ "--d": ".05s" } as CSSProperties}><I n="star" />{t.pill}</p>
                <h1 className="hp-h1" id="hero-title">
                  {words.map((w, k) => <span key={k}><span className={`hp-w${gold.has(w.toLowerCase().replace(/[.,!?]/g, "")) ? " hp-gold" : ""}`} style={i(k)}>{w}</span>{k < words.length - 1 ? " " : ""}</span>)}
                </h1>
                <p className="hp-lede hp-in" style={{ "--d": ".6s" } as CSSProperties}>{t.sub}</p>
                <div className="hp-inlead hp-in" style={{ "--d": ".75s" } as CSSProperties}>
                  <span className="hp-label">{t.every}</span>
                  <ul className="hp-chips">{t.chips.map(([ic, txt]) => <li className="hp-chip" key={txt}><I n={{ bolt: "zap", cal: "calendar" }[ic] ?? ic} />{txt}</li>)}</ul>
                </div>
                <div className="hp-cta hp-in" style={{ "--d": ".9s" } as CSSProperties}>
                  <a className="hp-btn hp-btn--gold" href="#sample" data-magnetic=""><span>{t.btn}</span><I n="arrow" c="hp-ico hp-btn__arrow" /></a>
                  {video && <a className="hp-btn hp-btn--line" href="#film"><span className="hp-play-dot" aria-hidden="true"><svg><use href="#i-play" /></svg></span><span>{t.film}</span></a>}
                </div>
                <ul className="hp-assure hp-in" style={{ "--d": "1s" } as CSSProperties}>{t.fine.map((f) => <li key={f}><I n="check" />{f}</li>)}</ul>
              </div>
              <div className="hp-feed-wrap">
                <aside className="hp-feed" aria-labelledby="feed-title">
                  <div className="hp-feed__head"><p className="hp-feed__title" id="feed-title"><span className="hp-live" aria-hidden="true" />{t.feedTitle}</p></div>
                  <ol className="hp-feed__list">
                    {signals.map((s, k) => (
                      <li className="hp-signal" style={i(k)} key={k}>
                        <span className="hp-signal__node" aria-hidden="true" />
                        <p className="hp-signal__meta"><time>{s.date}</time><span className="hp-src"><I n="doc" />{s.source}</span></p>
                        <p className="hp-signal__who"><R t={"x".repeat(10 + (k * 3) % 7)} /><span className="hp-sr">{c.hidden},</span>{s.place && <span className="hp-signal__place"><I n="pin" />{s.place}</span>}</p>
                        <p className="hp-signal__event">{s.event}</p>
                      </li>))}
                  </ol>
                  <p className="hp-feed__note"><I n="info" />{t.feedNote}</p>
                  <span className="hp-feed__glare" aria-hidden="true" />
                </aside>
              </div>
            </div>
            <div className="hp-sources">
              <div className="hp-wrap hp-sources__in">
                <span className="hp-sources__label">{t.ticker[0]}</span>
                <div className="hp-ticker"><div className="hp-ticker__track">
                  <ul>{t.ticker[1].map((x) => <li key={x}>{x}</li>)}</ul>
                  <ul aria-hidden="true">{t.ticker[1].map((x) => <li key={x}>{x}</li>)}</ul>
                </div></div>
              </div>
            </div>
          </div>
          <div className="hp-wrap hp-proof">
            <h2 className="hp-proof__title" data-reveal="">{t.statsH}</h2>
            <ul className="hp-statbar" data-reveal="" style={{ "--d": ".1s" } as CSSProperties}>
              {nums.map(([n, label, live]) => (
                <li className={`hp-stat${live ? " hp-stat--live" : ""}`} key={label}>
                  {live ? <p className="hp-stat__num"><span data-odo="">{n}</span><span className="hp-live" aria-hidden="true" /></p>
                    : <p className="hp-stat__num" data-odo="">{n}</p>}
                  <p className="hp-stat__label">{label}</p>
                </li>))}
            </ul>
            <p className="hp-footnote" data-reveal="" style={{ "--d": ".2s" } as CSSProperties}>{t.statsNote}</p>
          </div>
        </section>

        {video && (
          <section className="hp-film hp-grain" id="film" aria-labelledby="film-title">
            <div className="hp-wrap"><div className="hp-film__in">
              <h2 className="hp-rule" id="film-title" data-reveal="">{t.filmH(video.seconds)}</h2>
              <p className="hp-film__sub" data-reveal="" style={{ "--d": ".1s" } as CSSProperties}>{t.filmSub}</p>
              <div className="hp-video" data-scale="">
                {/* Eigenes Video, keine Drittanbieter, lädt erst beim Abspielen */}
                <video controls preload="none" playsInline poster={video.poster} src={video.src} />
                <button className="hp-video__play" type="button" aria-label={t.film} hidden>
                  <span className="hp-video__btn"><svg aria-hidden="true"><use href="#i-play" /></svg></span>
                  <span className="hp-video__len">0:{String(video.seconds).padStart(2, "0")}</span>
                </button>
              </div>
            </div></div>
          </section>
        )}

        <section className="hp-sec hp-cream" id="method" aria-labelledby="method-title">
          <div className="hp-wrap">
            <div className="hp-intro" data-reveal=""><h2 className="hp-h2" id="method-title">{t.methH}</h2><p>{t.methSub}</p></div>
            <div className="hp-steps-wrap" data-steps="">
              <div className="hp-track" aria-hidden="true"><span className="hp-track__fill" /></div>
              <ol className="hp-steps">
                {t.steps.map(([ic, h, d], k) => (
                  <li className="hp-step is-on" key={h}>
                    <span className="hp-step__icon"><I n={ic} /></span><span className="hp-step__num">{String(k + 1).padStart(2, "0")}</span>
                    <div><h3>{h}</h3><p>{d}</p></div>
                  </li>))}
              </ol>
            </div>

            <div className="hp-example" data-example-lead="">
              <p className="hp-rule hp-rule--cream" data-reveal="">{t.ex.label}</p>
              <div className="hp-example__grid">
                <article className="hp-lead" aria-label={t.ex.label} data-reveal="" style={{ "--d": ".1s" } as CSSProperties}>
                  <div className="hp-lead__main">
                    <header className="hp-lead__head">
                      <span className="hp-lead__icon"><I n="building" /></span>
                      <div><p className="hp-lead__name"><R t="xxxxxxxxxxxxxxxx" /><span className="hp-sr">{c.hidden}</span></p>
                        <p className="hp-lead__place"><I n="pin" />{c.city}</p></div>
                    </header>
                    <dl className="hp-lead__facts">
                      <div className="hp-fact hp-fact--wide hp-fact--event" data-mark="1"><dt>{c.event} <span className="hp-mark" aria-hidden="true">1</span></dt><dd>{c.eventText}</dd></div>
                      <div className="hp-fact" data-mark="2"><dt>{c.date} <span className="hp-mark" aria-hidden="true">2</span></dt><dd>{c.dateText}</dd></div>
                      <div className="hp-fact" data-mark="2"><dt>{c.source} <span className="hp-mark" aria-hidden="true">2</span></dt><dd>{c.sourceText}</dd></div>
                      <div className="hp-fact hp-fact--wide"><dt>{c.phone}</dt><dd>{t.ex.phonePrefix} <R t="xxxx xxxx" /><span className="hp-sr">{c.hidden}</span></dd></div>
                      <div className="hp-fact hp-fact--wide"><dt>{c.email}</dt><dd className="hp-nowrap"><R t="xxxxx" />@<R t="xxxxxxxx" />.co.uk<span className="hp-sr">{c.hidden}</span></dd></div>
                    </dl>
                    <div className="hp-lead__foot">
                      <span className="hp-pill"><I n="lock" />{t.ex.pills[0]}</span>
                      <span className="hp-pill"><I n="calendar" />{t.ex.pills[1]}</span>
                    </div>
                  </div>
                  <div className="hp-lead__side">
                    <div className="hp-tags">
                      <span className="hp-tag"><I n="doc" />{t.ex.tag}</span>
                      <span className="hp-tag"><I n="bars" />{c.prio}</span>
                    </div>
                    <p className="hp-side-label"><I n="target" />{t.ex.win}</p>
                    <figure className="hp-opening" data-mark="3">
                      <figcaption>{c.opening} <span className="hp-mark" aria-hidden="true">3</span></figcaption>
                      <blockquote>{c.openingText[0]}<R t="xxxxxxxxx" />{c.openingText[1]}</blockquote>
                    </figure>
                    <div className="hp-call">
                      <span className="hp-call__dot"><I n="phone" /></span>
                      <div><small>{t.ex.pick}</small><strong>{t.ex.phonePrefix} <R t="xxxx xxxx" /></strong></div>
                    </div>
                  </div>
                </article>
                <div data-reveal="" style={{ "--d": ".2s" } as CSSProperties}>
                  <h2 className="hp-h2">{t.callH}</h2>
                  <ol className="hp-notes">
                    {c.points.map(([h, d], k) => (
                      <li className="hp-note" data-note={k + 1} key={h}><span className="hp-mark" aria-hidden="true">{k + 1}</span><div><h3>{h}</h3><p>{d}</p></div></li>))}
                  </ol>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section className="hp-sec hp-dark hp-grain" id="industries" aria-labelledby="ind-title">
          <div className="hp-wrap">
            <div className="hp-ind__top">
              <div className="hp-intro" data-reveal=""><h2 className="hp-h2" id="ind-title">{t.indH}</h2><p>{t.indSub}</p></div>
              {countries.length > 1 && (
                <div className="hp-tabs" role="tablist" aria-label={t.countryPick} data-reveal="" style={{ "--d": ".1s" } as CSSProperties}>
                  <span className="hp-tabs__ind" aria-hidden="true" />
                  {countries.map((cc) => (
                    <button className="hp-tab" role="tab" type="button" key={cc} aria-selected={cc === defCountry} tabIndex={cc === defCountry ? 0 : -1}
                      aria-controls="ind-list" data-country={cc.toLowerCase()} id={`tab-${cc.toLowerCase()}`}>
                      <I n={FLAG[cc]} c="hp-flag" /><span className="hp-tab__long">{COUNTRIES[cc].name[lang]}</span><span className="hp-tab__short">{cc}</span>
                    </button>))}
                </div>)}
            </div>
            <ul className="hp-ind" id="ind-list" role="tabpanel" aria-labelledby={`tab-${defCountry.toLowerCase()}`} data-country={defCountry.toLowerCase()}>
              {segs.map((k, n) => {
                const links = bySeg.get(k) ?? {};
                const [name, desc] = t.industries[k] ?? [k, ""];
                return (
                  <li className="hp-ind__card" data-reveal="" style={{ "--d": `${(n * 0.08).toFixed(2)}s` } as CSSProperties} key={k} hidden={!links[defCountry]}>
                    <div className="hp-ind__top-row"><span className="hp-ind__icon"><I n={IND_ICON[k] ?? "target"} /></span>
                      <span className="hp-cc" aria-hidden="true"><span className="hp-cc__strip" style={{ "--d": `${n * 60}ms` } as CSSProperties}>
                        {CC.map((cc) => <span key={cc}><I n={FLAG[cc]} c="hp-flag" />{cc}</span>)}
                      </span></span></div>
                    <h3>{name}</h3>
                    {desc && <p>{desc}</p>}
                    <a className="hp-ind__link" href={links[defCountry] ?? "#sample"} data-uk={links.UK} data-us={links.US} data-fr={links.FR}>{t.indGo}<I n="arrow" /></a>
                  </li>);
              })}
              <li className="hp-ind__card hp-ind__card--cta" data-reveal="" style={{ "--d": ".4s" } as CSSProperties}>
                <h3>{t.ctaCard[0]}</h3><p>{t.ctaCard[1]}</p>
                <a className="hp-btn hp-btn--gold" href="#sample" data-magnetic=""><span>{t.btn}</span><I n="arrow" c="hp-ico hp-btn__arrow" /></a>
              </li>
            </ul>
          </div>
        </section>

        <section className="hp-sec hp-cream" id="trust" aria-labelledby="trust-title">
          <div className="hp-wrap">
            <div className="hp-intro" data-reveal=""><h2 className="hp-h2" id="trust-title">{t.trustH}</h2><p>{t.trustSub}</p></div>
            <ul className="hp-trust" data-reveal="" style={{ "--d": ".1s" } as CSSProperties}>
              {t.facts.map(([ic, h, d], k) => (
                <li style={{ "--d": `${(k * 0.12).toFixed(2)}s` } as CSSProperties} key={h}>
                  <span className="hp-trust__icon"><I n={ic} /></span><h3>{h}</h3><p>{d.replace("{LEGAL}", LEGAL_NAME)}</p>
                </li>))}
            </ul>
          </div>
        </section>

        <section className="sec dark" id="revenue"><div className="wrap">
          <div className="pc2">
            <div>
              <h2>{t.revenue[0]}<i>{t.revenue[1]}</i></h2>
              <div className="rs" style={{ gridTemplateColumns: "1fr", margin: "22px 0 0", gap: 12 }}>
                {t.reasons.map(([ic, h, d], k) => (
                  <div className="rcard" key={h} data-rv style={{ ...i(k), display: "flex", gap: 14, alignItems: "flex-start", padding: 18 }}>
                    <span className="gi" style={{ margin: 0, flex: "none" }}><I n={ic} /></span><span><h3>{h}</h3><p>{d}</p></span>
                  </div>))}
              </div>
            </div>
            <Radar labels={t.radar} />
          </div>
        </div></section>

        <section className="sec pcl" id="contact-person"><div className="wrap pc2">
          <div>
            <div className="kick"><span className="cap gold">{t.pcKick}</span></div>
            <h2>{t.pcH[0]}<i>{t.pcH[1]}</i></h2>
            <p className="lede2">{t.pcLede}</p>
            <ul className="plist">
              {t.pcList.map(([ic, h, d], k) => (
                <li key={h} data-rv style={i(k)}><span className="gi"><I n={{ user: "users", focus: "filter" }[ic] ?? ic} /></span><span><b>{h}</b><span>{d}</span></span></li>))}
            </ul>
            <a className="hp-btn hp-btn--gold" href={contactHref} data-magnetic=""><span>{t.pcBtn}</span><I n="arrow" c="hp-ico hp-btn__arrow" /></a>
          </div>
          <div className="fitcard" data-rv>
            <div className="who"><span className="av"><I n="users" /></span><span><b>{t.pcWho[0]}</b><span>{t.pcWho[1]}</span></span></div>
            <div className="fitrows">
              <span className="cap" style={{ color: "#97a2bd" }}>{t.pcFit}</span>
              {t.pcRows.map((r, k) => (
                <div className="fitrow" key={r}><span>{r}</span>
                  <span className="fitbar"><i style={{ "--w": ["48%", "74%", "96%"][k], ...i(k) } as CSSProperties} /></span></div>))}
            </div>
            <div className="chat">
              <span className="bubble me" style={i(0)}>{t.pcChat[0]}</span>
              <span className="bubble them" style={i(1)}>{t.pcChat[1]}</span>
            </div>
            <p className="fnote">{t.pcNote}</p>
          </div>
        </div></section>

        <section className="hp-sec hp-cream hp-sample" id="sample" aria-labelledby="sample-title">
          <div className="hp-wrap hp-sample__grid">
            <div className="hp-formcard hp-grain" id="probe" data-reveal="">
              <h2 className="hp-h2" id="sample-title">{t.sampleTitle[0]}<br /><span className="hp-gold">{t.sampleTitle[1]}</span></h2>
              <p className="hp-formcard__intro">{t.sampleSub}</p>
              {formOptions.length > 0 && (
                <SampleForm lang={lang} field="slug" options={formOptions} consent={consentText(lang)}
                  privacyHref={{ en: "/privacy", fr: "/confidentialite", de: "/datenschutz" }[lang]} />
              )}
            </div>
            <div className="hp-side">
              <div className="hp-panel" data-reveal="" style={{ "--d": ".1s" } as CSSProperties}>
                <h3 className="hp-panel__title">{t.howTitle}</h3>
                <ol className="hp-how">{t.how.map((h) => <li key={h}><span>{h}</span></li>)}</ol>
              </div>
              <div className="hp-panel" data-reveal="" style={{ "--d": ".2s" } as CSSProperties}>
                <h3 className="hp-panel__title">{t.receive.title}</h3>
                <ul className="hp-receive">
                  <li><span className="hp-receive__icon"><I n="doc" /></span><p><strong>{t.receive.pdf[0]}</strong><span>{t.receive.pdf[1]}</span></p></li>
                  <li><span className="hp-receive__icon"><I n="table" /></span><p><strong>{t.receive.csv[0]}</strong><span>{t.receive.csv[1]}</span></p></li>
                </ul>
              </div>
              <p className="hp-side__note" data-reveal="" style={{ "--d": ".3s" } as CSSProperties}><I n="mail" /><span>{t.mailHint}</span></p>
              <a className="hp-panel hp-talk" href={contactHref} data-reveal="" style={{ "--d": ".35s" } as CSSProperties}>
                <span className="hp-receive__icon"><I n="users" /></span><span><small>{t.talk[0]}</small><strong>{t.talk[1]} →</strong></span>
              </a>
            </div>
          </div>
        </section>

        <section className="hp-sec hp-cream hp-faq" id="faq" aria-labelledby="faq-title">
          <div className="hp-wrap hp-faq__grid">
            <div className="hp-faq__aside" data-reveal="">
              <h2 className="hp-h2" id="faq-title">{t.faqH}</h2>
              <p>{t.askMore} <a href={`mailto:${CONTACT}`}>{CONTACT}</a></p>
            </div>
            <div className="hp-qa" data-reveal="" style={{ "--d": ".1s" } as CSSProperties}>
              {t.faq.map((f) => (
                <details key={f.q}><summary>{f.q}<span className="hp-plus" aria-hidden="true" /></summary><div className="hp-qa__a"><p>{f.a}</p></div></details>))}
            </div>
          </div>
        </section>
      </div>
      <SiteFooter lang={lang} />
    </BrandShell>
  );
}

import type { CSSProperties } from "react";
import type { Metadata } from "next";
import VIDEOS from "@/content/videos.json";
import { BRAND, CONTACT, LEGAL_NAME, siteUrl } from "@/lib/site";
import { consentText } from "@/lib/consent";
import { wishesFor } from "@/content/sample-wishes";
import { LANDING_CSS } from "@/lib/landing-css";
import { HOME_CSS } from "@/lib/home-css";
import { HOME_SPRITE, HOME_V2_CSS } from "@/lib/home-v2-css";
import { SampleForm, type IndustryOption } from "./sample-form";
import { homeStats, publicPages, type PublicPage } from "@/lib/site-pages";
import { BrandShell, SiteFooter, SiteHeader } from "./chrome";
import { HOME, HOME_LANGS, HOME_PATH, type HomeLang } from "./home-i18n";
import { CONTACT_PATH } from "./contact/contact-i18n";
import { HomeFx } from "./home-fx";
import { DOT_MAPS } from "@/content/home-dot-maps";
import { COUNTRIES, LEAD_COUNTRIES, segKey, type CountryCode } from "@/lib/country";

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
const CC: CountryCode[] = ["UK", "US", "FR"];
const FLAG: Record<string, string> = { UK: "f-uk", US: "f-us", FR: "f-fr" };

/** Symbol aus dem Sprite der Vorlage. */
/** Flaggen einfarbig in Gold (Linien statt Landesfarben), rund. */
const MonoFlag = ({ cc }: { cc: string }) => (
  <svg className="hp-flag" viewBox="0 0 20 20" aria-hidden="true">
    <clipPath id={`mf-${cc}`}><circle cx="10" cy="10" r="10" /></clipPath>
    <g clipPath={`url(#mf-${cc})`} fill="currentColor">
      <rect width="20" height="20" opacity=".16" />
      {cc === "UK" && <g stroke="currentColor" fill="none"><path d="M0 0 20 20M20 0 0 20" strokeWidth="2.2" opacity=".55" /><path d="M10 0v20M0 10h20" strokeWidth="4.2" /></g>}
      {cc === "US" && <>{[1, 5, 9, 13, 17].map((y) => <rect key={y} y={y} width="20" height="2" opacity=".75" />)}<rect width="10" height="10" /><g fill="#141414">{[[2.5, 2.5], [6.5, 2.5], [4.5, 5], [2.5, 7.5], [6.5, 7.5]].map(([x, y]) => <circle key={`${x}${y}`} cx={x} cy={y} r=".9" />)}</g></>}
      {cc === "FR" && <><rect width="6.67" height="20" /><rect x="6.67" width="6.66" height="20" opacity=".22" /><rect x="13.33" width="6.67" height="20" opacity=".6" /></>}
    </g>
  </svg>);
const I = ({ n, c = "hp-ico" }: { n: string; c?: string }) => <svg className={c} aria-hidden="true"><use href={`#${/^fs?-/.test(n) ? n : "i-" + n}`} /></svg>;
const R = ({ t }: { t: string }) => <span className="hp-redact" aria-hidden="true">{t}</span>;
const i = (n: number) => ({ "--i": n }) as CSSProperties;

/** Methode (Vorlage v4): Skalenstriche des Radars, drei Signale mit Zeitpunkt im Umlauf, Bewertungsring, Schloss. */
const RADAR_T1 = "M108.1 6.9L108.6 1.9M116.2 7.9L117.1 3.0M124.2 9.7L125.5 4.9M132.0 12.1L133.7 7.4M139.5 15.3L141.6 10.7M153.6 23.4L156.5 19.3M160.1 28.4L163.3 24.5M166.1 33.9L169.7 30.3M171.6 39.9L175.5 36.7M176.6 46.4L180.7 43.5M184.7 60.5L189.3 58.4M187.9 68.0L192.6 66.3M190.3 75.8L195.1 74.5M192.1 83.8L197.0 82.9M193.1 91.9L198.1 91.4M193.1 108.1L198.1 108.6M192.1 116.2L197.0 117.1M190.3 124.2L195.1 125.5M187.9 132.0L192.6 133.7M184.7 139.5L189.3 141.6M176.6 153.6L180.7 156.5M171.6 160.1L175.5 163.3M166.1 166.1L169.7 169.7M160.1 171.6L163.3 175.5M153.6 176.6L156.5 180.7M139.5 184.7L141.6 189.3M132.0 187.9L133.7 192.6M124.2 190.3L125.5 195.1M116.2 192.1L117.1 197.0M108.1 193.1L108.6 198.1M91.9 193.1L91.4 198.1M83.8 192.1L82.9 197.0M75.8 190.3L74.5 195.1M68.0 187.9L66.3 192.6M60.5 184.7L58.4 189.3M46.4 176.6L43.5 180.7M39.9 171.6L36.7 175.5M33.9 166.1L30.3 169.7M28.4 160.1L24.5 163.3M23.4 153.6L19.3 156.5M15.3 139.5L10.7 141.6M12.1 132.0L7.4 133.7M9.7 124.2L4.9 125.5M7.9 116.2L3.0 117.1M6.9 108.1L1.9 108.6M6.9 91.9L1.9 91.4M7.9 83.8L3.0 82.9M9.7 75.8L4.9 74.5M12.1 68.0L7.4 66.3M15.3 60.5L10.7 58.4M23.4 46.4L19.3 43.5M28.4 39.9L24.5 36.7M33.9 33.9L30.3 30.3M39.9 28.4L36.7 24.5M46.4 23.4L43.5 19.3M60.5 15.3L58.4 10.7M68.0 12.1L66.3 7.4M75.8 9.7L74.5 4.9M83.8 7.9L82.9 3.0M91.9 6.9L91.4 1.9";
const RADAR_T2 = "M100.0 13.0L100.0 1.5M143.5 24.7L149.2 14.7M175.3 56.5L185.3 50.7M187.0 100.0L198.5 100.0M175.3 143.5L185.3 149.2M143.5 175.3L149.2 185.3M100.0 187.0L100.0 198.5M56.5 175.3L50.7 185.3M24.7 143.5L14.7 149.3M13.0 100.0L1.5 100.0M24.7 56.5L14.7 50.7M56.5 24.7L50.7 14.7";
const BLIPS: [string, string, string][] = [["73.7%", "30.1%", ".58s"], ["56.2%", "73.2%", "1.93s"], ["16.2%", "40.9%", "3.33s"]];
const Ring = ({ v, low = false }: { v: number; low?: boolean }) => (
  <span className={`hp-ring${low ? " hp-ring--low" : ""}`} style={{ "--v": v } as CSSProperties}><svg viewBox="0 0 44 44"><circle className="hp-ring__bg" cx="22" cy="22" r="19" /><circle className="hp-ring__fg" cx="22" cy="22" r="19" pathLength={100} /></svg><b className="hp-ring__n" /></span>);
const Lock = () => <svg className="hp-lock" viewBox="0 0 24 24"><path className="hp-lock__shackle" d="M8 10.5V8a4 4 0 0 1 8 0v2.5" /><rect x="5" y="10.5" width="14" height="10" rx="2" /></svg>;
/** Ansprechpartner (Vorlage v4): zehn Punkte im Passungsring, Startlage Woche 4 (ohne JavaScript sichtbar). */
const TUNE_DOTS: [number, number, boolean][] = [[18.4, -26.2, true], [13.6, -8.5, true], [25.2, 9.7, true], [9.8, 6.9, true], [4.0, 45.8, false], [-7.5, 20.7, true], [-27.6, 9.0, true], [-8.0, -0.8, true], [-22.0, -27.2, true], [-6.8, -17.7, true]];
/** Probe (Vorlage v4): Balkenbreiten der Tabellen-Vorschau, je Zeile Firma, Telefon, E-Mail, Ereignis. */
const SHEET = [[70, 79, 68, 73], [85, 74, 67, 52], [56, 82, 80, 51], [69, 86, 85, 65], [66, 73, 78, 61], [56, 90, 78, 65], [67, 75, 81, 66], [78, 72, 83, 90], [79, 86, 77, 59], [70, 85, 79, 53]];
const SEAL = "M50.00 1.00L56.00 4.39L62.68 2.67L67.60 7.50L74.50 7.56L78.00 13.51L84.65 15.35L86.49 22.00L92.44 25.50L92.50 32.40L97.33 37.32L95.61 44.00L99.00 50.00L95.61 56.00L97.33 62.68L92.50 67.60L92.44 74.50L86.49 78.00L84.65 84.65L78.00 86.49L74.50 92.44L67.60 92.50L62.68 97.33L56.00 95.61L50.00 99.00L44.00 95.61L37.32 97.33L32.40 92.50L25.50 92.44L22.00 86.49L15.35 84.65L13.51 78.00L7.56 74.50L7.50 67.60L2.67 62.68L4.39 56.00L1.00 50.00L4.39 44.00L2.67 37.32L7.50 32.40L7.56 25.50L13.51 22.00L15.35 15.35L22.00 13.51L25.50 7.56L32.40 7.50L37.32 2.67L44.00 4.39Z";
const w = (n: number) => ({ "--w": `${n}%` }) as CSSProperties;

/** „Recently detected“: je drei echte Signale aus UK, US und FR (Firmennamen verdeckt), Städte als Pins auf der Karte.
 *  Die Karte wechselt automatisch zwischen den Ländern (Inhaber 03.10.2026). */
const SIGNALS: { cc: CountryCode; place: string; date: string; source: string; event: string }[] = [
  // je Land verschiedene Auslöser (Inhaber 03.10.2026: „unterschiedliche trigger und texte“)
  { cc: "UK", place: "London", date: "2 Oct 2026", source: "Find a Tender", event: "Won a public contract, published on Find a Tender on 2 October 2026: “London Borough of Richmond” for Sutton, Achieving for Children and Kingston" },
  { cc: "UK", place: "Wolverhampton", date: "30 Sep 2026", source: "Companies House", event: "A new advertising agency, incorporated on 30 September 2026." },
  { cc: "UK", place: "Wakefield", date: "2 Oct 2026", source: "Business listing", event: "Has no website: listed with a phone number, an email address and a Facebook page, but no own website could be found." },
  { cc: "UK", place: "London", date: "3 Oct 2026", source: "Website check", event: "Its website shows an error page (HTTP 404) instead of a homepage." },
  { cc: "US", place: "Seattle", date: "3 Oct 2026", source: "Website check", event: "Its website uses a self-signed security certificate, so browsers warn visitors before opening it." },
  { cc: "US", place: "Chicago", date: "24 Sep 2026", source: "US DOT", event: "Registered on 24 September 2026 as a private-fleet operator with 4 trucks and 8 drivers." },
  { cc: "US", place: "Houston", date: "29 Sep 2026", source: "SEC Form D", event: "Filed an SEC Form D on 29 September 2026: raised $18.6 million from 2 investors." },
  { cc: "US", place: "Miami", date: "2 Oct 2026", source: "Business listing", event: "Has no website: listed with a phone number, an email address and a Facebook page, but no own website was found." },
  { cc: "FR", place: "Nantes", date: "3 oct. 2026", source: "Contrôle du site", event: "Le site tourne sous une ancienne version de WordPress (4.9.8)." },
  { cc: "FR", place: "Toulouse", date: "3 oct. 2026", source: "Contrôle du site", event: "La page d'accueil n'est pas adaptée aux mobiles (pas de réglage viewport)." },
  { cc: "FR", place: "Lyon", date: "27 sept. 2026", source: "BODACC", event: "Nouvelle entreprise, immatriculée le 27 septembre 2026 (annonce au BODACC)." },
  { cc: "FR", place: "Marseille", date: "3 oct. 2026", source: "Contrôle du site", event: "Son site affiche une page d'erreur (HTTP 404) au lieu d'une page d'accueil." },
];



export async function Home({ lang }: { lang: HomeLang }) {
  const t = HOME[lang];
  const loc = { en: "en-GB", fr: "fr-FR", de: "de-DE" }[lang];
  const mio = { en: "M+", fr: " M+", de: " Mio.+" }[lang];
  const [pages, stats] = await Promise.all([
    publicPages().catch(() => [] as PublicPage[]),
    homeStats().catch(() => ({ companies: 0, signals: 0 })),
  ]);
  const V = VIDEOS as Record<string, { src: string; poster: string; seconds: number }>;
  const video = V[`${lang}:home`] ?? V["en:home"];
  // Branchen je Land: Schlüssel -> Seite je Land
  const bySeg = new Map<string, Partial<Record<CountryCode, string>>>();
  for (const p of pages) {
    const k = segKey(p.slug);
    bySeg.set(k, { ...(bySeg.get(k) ?? {}), [p.country as CountryCode]: "/" + p.slug });
  }
  const segs = [...bySeg.keys()].sort((a, b) => ORDER.indexOf(a) - ORDER.indexOf(b));
  // Probe-Formular: Branche und Lieferland getrennt (Inhaber 03.10.2026), Länder nur dort, wo wir Leads haben
  const industries: IndustryOption[] = segs.map((k) => {
    const byCc = bySeg.get(k) ?? {};
    return {
      value: k, label: t.industries[k]?.[0] ?? k,
      pages: Object.fromEntries(Object.entries(byCc).map(([cc, href]) => [cc, String(href).slice(1)])),
      wishes: wishesFor(k).map((w) => ({ key: w.key, label: w[lang] })),
    };
  });
  const leadCountries = LEAD_COUNTRIES.map((x) => ({ code: x.code, label: x.name[lang] }));
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
    <BrandShell lang={lang} extraCss={LANDING_CSS + HOME_V2_CSS + HOME_CSS}>
      {/* Effekte der Vorlage nur mit JavaScript (sonst bleibt alles sichtbar) */}
      <script dangerouslySetInnerHTML={{ __html: "document.documentElement.classList.add('js')" }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <div dangerouslySetInnerHTML={{ __html: HOME_SPRITE }} />
      <SiteHeader links={[["#film", "Film"], ["#contact-person", t.nav[2][1]], [contactHref, t.contact]]} cta={["#sample", t.cta]}
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
                <p className="hp-lede hp-in" style={{ "--d": ".6s" } as CSSProperties}><span className="lede-l">{t.sub}</span><span className="lede-s">{t.subShort}</span></p>
                <div className="hp-inlead hp-in" style={{ "--d": ".75s" } as CSSProperties}>
                  <span className="hp-label">{t.every}</span>
                  <ul className="hp-chips">{t.chips.map(([ic, txt], k) => [k === 4 && <li className="hp-chip-br" aria-hidden="true" key="br" />, <li className="hp-chip" key={txt}><I n={{ bolt: "zap", cal: "calendar" }[ic] ?? ic} />{txt}</li>])}</ul>
                </div>
                <div className="hp-cta hp-in" style={{ "--d": ".9s" } as CSSProperties}>
                  <a className="hp-btn hp-btn--gold" href="#sample" data-magnetic=""><span>{t.btn}</span><I n="arrow" c="hp-ico hp-btn__arrow" /></a>
                  {video && <a className="hp-btn hp-btn--line" href="#film"><span className="hp-play-dot" aria-hidden="true"><svg><use href="#i-play" /></svg></span><span>{t.film}</span></a>}
                </div>
              </div>
              {/* Echte Signale aus einer UK-Probe (Firmennamen verdeckt) auf der Karte; die Städte stehen in der Karte */}
              <div className="hp-stage">
                <div className="hp-stage__head">
                  <div className="hp-stage__cities" role="tablist" aria-label={t.countryPick}>
                    {CC.map((cc, k) => (
                      <button type="button" role="tab" className="hp-city" data-cc={cc} aria-selected={k === 0} key={cc}>
                        <span className="hp-cflag"><MonoFlag cc={cc} /></span>{COUNTRIES[cc].name[lang]}
                      </button>))}
                  </div>
                </div>
                <div className="hp-maps" aria-hidden="true">
                  {CC.map((cc, k) => <div className={`hp-map${k === 0 ? " is-on" : ""}`} data-cc={cc} key={cc} dangerouslySetInnerHTML={{ __html: DOT_MAPS[cc] }} />)}
                </div>
                <svg className="hp-link" aria-hidden="true"><defs><linearGradient id="hp-g-link" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#E2C894" stopOpacity=".95" /><stop offset="1" stopColor="#E2C894" stopOpacity=".35" /></linearGradient></defs><path d="" /><circle cx="-99" cy="-99" r="3.2" /></svg>
                <ol className="hp-sigs">
                  {SIGNALS.map((g, k) => (
                    <li className={`hp-sig${k === 0 ? " is-active" : ""}`} data-city={g.place} data-cc={g.cc} key={g.cc + k}>
                      <p className="hp-sig__meta"><time>{g.date}</time><span className="hp-src"><I n="doc" />{g.source}</span></p>
                      <p className="hp-sig__who"><R t={"x".repeat(14 - (k % 3) * 2)} /><span className="hp-sr">{c.hidden},</span><span className="hp-sig__place"><I n="pin" />{g.place}</span></p>
                      <p className="hp-sig__event">{g.event}</p>
                    </li>))}
                </ol>
                <p className="hp-stage__note"><I n="info" />{t.feedNote}</p>
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

        <section className="hp-proofsec" aria-labelledby="proof-title">
          <div className="hp-wrap hp-proof">
            <h2 className="hp-proof__title" id="proof-title" data-reveal="">{t.statsH}</h2>
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


        <section className="hp-sec hp-cream hp-method" id="method" aria-labelledby="method-title">
          <div className="hp-wrap">
            <div className="hp-intro" data-reveal=""><h2 className="hp-h2" id="method-title">{t.methH}</h2><p>{t.methSub}</p></div>
            <div className="hp-story" data-story="">
              <div className="hp-story__col">
                <span className="hp-story__rail" aria-hidden="true"><span className="hp-story__fill" /><span className="hp-story__head" /></span>
                <ol className="hp-story__steps">
                  {t.steps.map(([ic, h, d], k) => (
                    <li className={`hp-sstep is-done${k === 0 ? " is-active" : ""}`} key={h}>
                      <span className="hp-step__icon"><I n={ic} /></span><span className="hp-step__num">{String(k + 1).padStart(2, "0")}</span>
                      <div><h3>{h}</h3><p>{d}</p></div>
                    </li>))}
                </ol>
              </div>
              {/* Mitlaufende Grafik zum aktuellen Schritt (Desktop); auf Handy und Tablet setzt das Skript je Schritt eine Kopie darunter.
                  Illustration, die Bewertungswerte sind ein Beispiel. */}
              <div className="hp-story__aside" aria-hidden="true">
                <div className="hp-story__stage" data-step="0">
                  <span className="hp-story__grid" />
                  <span className="hp-story__marks"><i /><i /><i /><i /></span>
                  <span className="hp-story__beam" />
                  <div className="hp-viz is-active" data-viz="0">
                    <p className="hp-viz__label"><span className="hp-live" />{t.story.v0}</p>
                    <div className="hp-ledger">
                      <span className="hp-ledger__scan" />
                      <ul className="hp-ledger__rows">
                        {t.story.src.map(([ic, name, where], k) => (
                          <li style={{ "--k": k } as CSSProperties} key={name}>
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
                        {BLIPS.map(([x, y, tm]) => <span className="hp-blip" key={tm} style={{ "--bx": x, "--by": y, "--t": tm } as CSSProperties}><i /></span>)}
                      </div>
                      <ul className="hp-moments">{t.story.moments.map(([ic, txt], k) => <li style={{ "--t": BLIPS[k]?.[2] } as CSSProperties} key={txt}><I n={ic} />{txt}</li>)}</ul>
                    </div>
                    <p className="hp-moment__stamp"><I n="doc" />{t.story.stamp}</p>
                  </div>
                  <div className="hp-viz" data-viz="2">
                    <p className="hp-viz__label">{t.story.v2} <span className="hp-viz__ex">{t.story.ex}</span></p>
                    <div className="hp-score">
                      <div className="hp-score__head">
                        <Ring v={91} />
                        <div className="hp-score__who"><b><R t="xxxxxxxxxxxxx" /></b><small>{t.story.rateLead}</small></div>
                        <span className="hp-score__pass"><svg viewBox="0 0 24 24"><path d="m5 12.5 4.5 4.5L19 7.5" /></svg>{t.story.pass}</span>
                      </div>
                      <div className="hp-score__rows">
                        <span className="hp-score__min"><em>{t.story.min}</em></span>
                        {t.story.rows.map(([l, v], k) => <div className="hp-score__row" style={{ "--v": v, "--k": k } as CSSProperties} key={l}><span>{l}</span><b className="hp-score__bar"><i /></b><em /></div>)}
                      </div>
                    </div>
                    <div className="hp-score__out">
                      <Ring v={41} low />
                      <span className="hp-score__name"><R t="xxxxxxxxxx" /><i /></span>
                      <span className="hp-score__fail"><I n="ban" />{t.story.fail}</span>
                    </div>
                  </div>
                  <div className="hp-viz" data-viz="3">
                    <div className="hp-mail">
                      <span className="hp-mail__sheen" />
                      <div className="hp-mail__head"><span className="hp-mail__logo">N<span>P</span></span><div><b>NextGen Profit</b><small>{t.story.mailSub}</small></div><span className="hp-mail__day">{t.story.mon}</span></div>
                      <p className="hp-mail__subject">{t.story.mailSubject}</p>
                      <div className="hp-mail__files"><span><b className="hp-file hp-file--pdf">PDF</b>{t.story.files[0]}</span><span><b className="hp-file hp-file--xls"><I n="table" /></b>{t.story.files[1]}</span></div>
                      <ul className="hp-mail__leads">{t.story.mailLeads.map((m, k) => <li style={{ "--k": k } as CSSProperties} key={m}><R t={"x".repeat(14 - k)} /><small>{m}</small><Lock /></li>)}</ul>
                    </div>
                    <p className="hp-mail__excl"><I n="lock" />{t.story.excl}</p>
                  </div>
                  <ol className="hp-story__track">{t.story.track.map((x, k) => <li className={k === 0 ? "is-on is-cur" : undefined} key={x}>{x}</li>)}</ol>
                </div>
              </div>
            </div>

            {/* Beispiel aus einer echten Probe (Firmen- und Kontaktdaten verdeckt); ohne Zierlinien auf der dunklen Seite (Inhaber 03.10.2026) */}
            <div className="hp-example" data-example-lead="">
              <p className="hp-rule hp-rule--cream" data-reveal="">{t.ex.label}</p>
              <div className="hp-example__grid">
                <div className="hp-lead-wrap" data-reveal="" style={{ "--d": ".1s" } as CSSProperties}>
                  <span className="hp-crop" aria-hidden="true"><i /><i /><i /><i /></span>
                  <article className="hp-lead" aria-label={t.ex.label}>
                    <div className="hp-lead__main">
                      <span className="hp-stamp" aria-hidden="true"><svg viewBox="0 0 120 120"><defs><path id="hp-stamp-arc" d="M18 60a42 42 0 1 1 84 0a42 42 0 1 1-84 0" /><filter id="hp-ink" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency=".8" numOctaves={2} seed={7} result="n" /><feColorMatrix in="n" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -3 2.5" result="m" /><feComposite in="SourceGraphic" in2="m" operator="in" /></filter></defs>
                        <g filter="url(#hp-ink)"><circle className="c" cx="60" cy="60" r="56" strokeWidth="2.4" /><circle className="c" cx="60" cy="60" r="51.5" strokeWidth=".9" /><circle className="c" cx="60" cy="60" r="31" strokeWidth=".9" />
                          <text fontSize="9" letterSpacing="1.5"><textPath href="#hp-stamp-arc" textLength="256" lengthAdjust="spacing">{`${t.ex.stamp} • ${c.sourceText.toUpperCase()} •`}</textPath></text>
                          <text x="60" y="59" textAnchor="middle" fontSize="13.5" letterSpacing=".4">{t.ex.stampDay[0]}</text><text x="60" y="73" textAnchor="middle" fontSize="10" letterSpacing="2.4">{t.ex.stampDay[1]}</text></g></svg></span>
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
                </div>
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

        {/* Persönlicher Ansprechpartner nach Vorlage v4 (Inhaber 03.10.2026): vier Beispielwochen, die Filter werden enger */}
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

        {/* Probe nach Vorlage v4: Formular auf dunkler Karte links, Vorschau der zwei Dateien rechts. Formular und Logik unverändert (SampleForm). */}
        <section className="hp-sec hp-cream hp-sample" id="sample" aria-labelledby="sample-title">
          <div className="hp-wrap hp-sample__grid">
            <div className="hp-formcard hp-grain" id="probe" data-reveal="">
              <h2 className="hp-h2" id="sample-title">{t.sampleTitle[0]}<br /><span className="hp-gold">{t.sampleTitle[1]}</span></h2>
              <p className="hp-formcard__intro">{t.sampleSub}</p>
              {industries.length > 0 && (
                <SampleForm lang={lang} field="slug" options={[]} industries={industries} countries={leadCountries} consent={consentText(lang)}
                  privacyHref={{ en: "/privacy", fr: "/confidentialite", de: "/datenschutz" }[lang]} />
              )}
            </div>
            <div className="hp-side">
              <div className="hp-side__block" data-reveal="" style={{ "--d": ".1s" } as CSSProperties}>
                <h3 className="hp-side__title">{t.receive.title}</h3>
                {/* Bild der beiden Dateien (keine echten Daten) */}
                <div className="hp-docs" aria-hidden="true">
                  <div className="hp-doc hp-doc--sheet">
                    <div className="hp-sheet__top"><span className="hp-file hp-file--xls"><I n="table" /></span><b>{t.story.files[1]}</b></div>
                    <div className="hp-sheet"><span className="n" /><span>{t.docs.company}</span><span>{c.phone}</span><span>{c.email}</span><span>{c.event}</span>
                      {SHEET.map((r, k) => [<span className="n" key={`n${k}`}>{k + 1}</span>, ...r.map((v, j) => <i className={j === 0 ? "k" : j === 3 ? "g" : undefined} style={w(v)} key={`${k}-${j}`} />)])}</div>
                  </div>
                  <div className="hp-doc hp-doc--pdf">
                    <div className="hp-pdf__head"><span className="hp-pdf__logo">N<span>P</span></span><b>{t.docs.brief}</b><em>1 / 10</em></div>
                    <div className="hp-pdf__co"><i className="hp-bar hp-bar--ink" style={w(64)} /><small><I n="pin" />{c.city}</small></div>
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
              <div className="hp-side__block" data-reveal="" style={{ "--d": ".2s" } as CSSProperties}>
                <h3 className="hp-side__title">{t.howTitle}</h3>
                <ol className="hp-how">{t.how.map((h) => <li key={h}><span>{h}</span></li>)}</ol>
              </div>
            </div>
          </div>
        </section>

        {/* Fragen: schmale Spalte, Plus-Symbol dreht sich beim Öffnen (Vorlage home_1, Inhaber 03.10.2026) */}
        <section className="hp-sec hp-faq" id="faq" aria-labelledby="faq-title">
          <div className="hp-wrap hp-faq__grid">
            <div className="hp-faq__head">
              <h2 className="hp-h2" id="faq-title">{t.faqH}</h2>
              <p className="hp-faq__more"><span className="hp-faq__mail"><I n="mail" /></span><span>{t.askMore}<br /><a href={`mailto:${CONTACT}`}>{CONTACT}</a></span></p>
            </div>
            <div className="hp-faq__list">
              {t.faq.map((f) => (
                <details className="hp-qa" key={f.q}><summary>{f.q}<span className="hp-qa__btn" aria-hidden="true"><I n="plus" c="hp-ico hp-qa__ic" /></span></summary><div className="hp-qa__a"><p>{f.a}</p></div></details>))}
            </div>
          </div>
        </section>
      </div>
      <SiteFooter lang={lang} />
    </BrandShell>
  );
}

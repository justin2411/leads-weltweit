import type { CSSProperties } from "react";
import type { Metadata } from "next";
import VIDEOS from "@/content/videos.json";
import { BRAND, CONTACT, LEGAL_NAME, siteUrl } from "@/lib/site";
import { consentText } from "@/lib/consent";
import { wishesFor } from "@/content/sample-wishes";
import { LANDING_CSS } from "@/lib/landing-css";
import { HOME_CSS } from "@/lib/home-css";
import { SampleForm, type FormOption } from "./sample-form";
import { homeStats, publicPages, type PublicPage } from "@/lib/site-pages";
import { BrandShell, SiteFooter, SiteHeader, Words } from "./chrome";
import { HOME, HOME_LANGS, HOME_PATH, type HomeLang } from "./home-i18n";
import { CONTACT_PATH } from "./contact/contact-i18n";
import { HeroNet } from "./motion";
import { Icon } from "./[country]/[segment]/v2";
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

/** Gleiche Reihenfolge der Branchen in jedem Land; Webagenturen zuerst (Fokus 02.10.2026). */
const ORDER = ["web-agencies", "recruitment", "accountants", "insurance-brokers", "financial-advisers", "it-services"];
const IND_ICON: Record<string, string> = {
  "web-agencies": "globe", recruitment: "user", accountants: "table", "insurance-brokers": "lock", "financial-advisers": "target", "it-services": "bolt",
};

const i = (n: number) => ({ "--i": n }) as CSSProperties;

/** Radar: Signale aus drei Ländern leuchten auf, wenn der Strahl sie erreicht (Strahl 6 s je Umdrehung). */
function Radar({ labels }: { labels: [string, string][] }) {
  const C = 200;
  const pt = (deg: number, r: number) => [C + r * Math.cos((deg * Math.PI) / 180), C + r * Math.sin((deg * Math.PI) / 180)];
  const blips: [number, number][] = [[30, 130], [150, 120], [260, 150], [75, 70], [200, 165], [320, 95], [115, 175], [345, 160], [230, 60]];
  const flag: Record<string, string> = { US: "🇺🇸", UK: "🇬🇧", FR: "🇫🇷" };
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
            <span>{flag[cc]}</span><b>{cc}</b><em>{txt}</em>
          </span>);
      })}
    </div>
  );
}

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
  const indName = (p: PublicPage) => t.industries[segKey(p.slug)] ?? p.name;
  // Länder mit öffentlichen Seiten; Startland je Sprache
  const countries = (["US", "UK", "FR"] as CountryCode[]).filter((c) => pages.some((p) => p.country === c));
  const pref: CountryCode = lang === "fr" ? "FR" : lang === "de" ? "UK" : "US";
  const defCountry = countries.includes(pref) ? pref : countries[0];
  const formOptions: FormOption[] = [...pages]
    .sort((a, b) => Number(b.country === defCountry) - Number(a.country === defCountry) || a.country.localeCompare(b.country)
      || ORDER.indexOf(segKey(a.slug)) - ORDER.indexOf(segKey(b.slug)))
    .map((p) => ({
      value: p.slug,
      label: `${indName(p)} · ${COUNTRIES[p.country as CountryCode]?.name[lang] ?? p.country}`,
      wishes: wishesFor(segKey(p.slug)).map((w) => ({ key: w.key, label: w[lang] })),
    }));
  const contactHref = CONTACT_PATH[lang];
  const ld = {
    "@context": "https://schema.org", "@type": "Organization", name: BRAND, legalName: LEGAL_NAME, url: siteUrl(), email: CONTACT,
    description: t.desc, address: { "@type": "PostalAddress", streetAddress: "Nikolaistraße 3-7", postalCode: "04109", addressLocality: "Leipzig", addressCountry: "DE" },
  };
  const kpis: [number, string, string][] = [[18, mio, t.kpi[0]], [YEARLY, "+", t.kpi[1]], [stats.signals, "", t.kpi[2]], [10, "", t.kpi[3]]];

  return (
    <BrandShell lang={lang} extraCss={LANDING_CSS + HOME_CSS}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <SiteHeader links={[...t.nav, [contactHref, t.contact]]} cta={["#sample", t.cta]}
        langs={HOME_LANGS.map((l) => [l.toUpperCase(), HOME_PATH[l], l === lang])} />
      <div className="lp2 hm">

        <section className="h2o" id="top">
          <HeroNet />
          <div className="wrap">
            <span className="pill"><Icon name="star" />{t.pill}</span>
            <h1><Words text={t.h1} gold={t.h1gold} /></h1>
            <p className="sub">{t.sub}</p>
            <div className="ctaline">
              <div className="ctabox">
                <a className="btn gold big" href="#sample" data-cta>{t.btn} <span className="ar">→</span></a>
                <span className="free2">{t.fine.map((f) => <span key={f}>{f}</span>)}</span>
              </div>
            </div>
          </div>
        </section>

        {/* Video ist das wichtigste Element: groß, gleich unter dem Hero, ragt in den hellen Teil */}
        {video && (
          <div className="vbase" id="film">
            <div className="stage" data-rv>
              <span className="vtag"><i />{t.vtag(video.seconds)}</span>
              {/* Eigenes Video, keine Drittanbieter, lädt erst beim Abspielen */}
              <div className="frame"><video controls playsInline preload="none" poster={video.poster} src={video.src} /></div>
            </div>
          </div>
        )}

        <section className="sec">
          <div className="wrap">
            <div className="kpis lite">
              {kpis.map(([n, suf, label], k) => (
                <div className="kpi" key={label} data-rv style={i(k)}>
                  <b data-count={n} data-suffix={suf} data-loc={loc}>{n.toLocaleString(loc)}{suf}</b><span>{label}</span>
                </div>))}
            </div>
            <p className="kpinote" style={{ color: "var(--faint)" }}>{t.kpiNote}</p>
          </div>
        </section>

        <section className="sec dark"><div className="wrap">
          <div className="pc2">
            <div>
              <h2>{t.revenue[0]}<i>{t.revenue[1]}</i></h2>
              <div className="rs" style={{ gridTemplateColumns: "1fr", margin: "22px 0 0", gap: 12 }}>
                {t.reasons.map(([ic, h, d], k) => (
                  <div className="rcard" key={h} data-rv style={{ ...i(k), display: "flex", gap: 14, alignItems: "flex-start", padding: 18 }}>
                    <span className="gi" style={{ margin: 0, flex: "none" }}><Icon name={ic} /></span><span><h3>{h}</h3><p>{d}</p></span>
                  </div>))}
              </div>
            </div>
            <Radar labels={t.radar} />
          </div>
          <div className="kick" style={{ marginTop: 54 }}><span className="cap" style={{ color: "var(--gink)" }}>{t.howTitle}</span></div>
          <div className="steps">{t.steps.map(([ic, h], k) => (
            <div className="step" key={h} data-rv style={i(k)}><div className="no"><b>{String(k + 1).padStart(2, "0")}</b><span className="ring"><Icon name={ic} /></span></div><h3>{h}</h3></div>))}</div>
        </div></section>

        <section className="sec" id="industries"><div className="wrap">
          <h2 style={{ marginBottom: 20 }}>{t.indH}</h2>
          {/* Länder-Umschalter ohne JavaScript: Radio + CSS */}
          {countries.map((c) => <input key={c} type="radio" name="cc" id={`cc-${c}`} className="cc-in" defaultChecked={c === defCountry} />)}
          {countries.length > 1 && (
            <div className="cswitch2" role="group" aria-label={t.countryPick}>
              {countries.map((c) => <label key={c} htmlFor={`cc-${c}`}><span aria-hidden="true">{COUNTRIES[c].flag}</span>{COUNTRIES[c].name[lang]}</label>)}
            </div>)}
          <div className="icards">
            {[...pages].sort((a, b) => ORDER.indexOf(segKey(a.slug)) - ORDER.indexOf(segKey(b.slug))).map((p, k) => (
              <a className="icard" href={`/${p.slug}`} key={p.slug} data-cc={p.country} data-rv style={i(k % 6)}>
                <span className="gi"><Icon name={IND_ICON[segKey(p.slug)] ?? "target"} /></span>
                <h3>{indName(p)}</h3>
                <span className="go">{t.indGo} <i>→</i></span>
              </a>))}
            {pages.length === 0 && <div className="icard"><h3>{t.soon}</h3></div>}
          </div>
        </div></section>

        <section className="sec dark" id="contact-person"><div className="wrap pc2">
          <div>
            <div className="kick"><span className="cap" style={{ color: "var(--gink)" }}>{t.pcKick}</span></div>
            <h2>{t.pcH[0]}<i>{t.pcH[1]}</i></h2>
            <p className="lede2">{t.pcLede}</p>
            <ul className="plist">
              {t.pcList.map(([ic, h, d], k) => (
                <li key={h} data-rv style={i(k)}><span className="gi"><Icon name={ic} /></span><span><b>{h}</b><span>{d}</span></span></li>))}
            </ul>
            <a className="btn gold" href={contactHref}>{t.pcBtn} <span className="ar">→</span></a>
          </div>
          <div className="fitcard" data-rv>
            <div className="who"><span className="av"><Icon name="user" /></span><span><b>{t.pcWho[0]}</b><span>{t.pcWho[1]}</span></span></div>
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

        <section className="sec cream" id="sample"><div className="wrap formwrap">
          <div className="formcard" id="probe">
            <h2>{t.sampleTitle[0]} <span className="gold-h">{t.sampleTitle[1]}</span></h2>
            <p className="lede2" style={{ color: "#aab4ca" }}>{t.sampleSub}</p>
            {formOptions.length > 0 && (
              <SampleForm lang={lang} field="slug" options={formOptions} consent={consentText(lang)}
                privacyHref={{ en: "/privacy", fr: "/confidentialite", de: "/datenschutz" }[lang]} />
            )}
          </div>
          <div className="side2">
            <ul className="ticks2">
              {t.ticks.map(([h, d]) => <li key={h}><Icon name="check" /><span><b>{h}.</b> {d}</span></li>)}
            </ul>
            <a className="getcard" href={contactHref} style={{ textDecoration: "none", flex: "none" }}>
              <span className="cap gold">{t.talk[0]}</span>
              <span className="gf"><span className="ci"><Icon name="user" /></span><span><b>{t.talk[1]} →</b><em>{CONTACT}</em></span></span>
            </a>
          </div>
        </div></section>

        <section className="sec"><div className="wrap faq2" style={{ maxWidth: 820 }}>
          <h2>{t.faqH}</h2>
          {t.faq.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
        </div></section>
      </div>
      <SiteFooter lang={lang} />
    </BrandShell>
  );
}

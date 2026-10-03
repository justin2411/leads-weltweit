import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { BRAND, CONTACT, siteUrl } from "@/lib/site";
import { LANDING_CSS } from "@/lib/landing-css";
import { HOME_CSS } from "@/lib/home-css";
import { wishesFor } from "@/content/sample-wishes";
import { BrandShell, SiteFooter, SiteHeader, Words } from "../chrome";
import { HeroNet } from "../motion";
import { HOME, HOME_PATH, HOME_LANGS, type HomeLang } from "../home-i18n";
import { Icon } from "../[country]/[segment]/v2";
import { ContactForm } from "./contact-form";
import { CONTACT_PATH, CONTACT_TX, INDUSTRY_KEYS, MARKETS } from "./contact-i18n";

export function contactMetadata(lang: HomeLang): Metadata {
  const T = CONTACT_TX[lang];
  const url = siteUrl() + CONTACT_PATH[lang];
  return {
    title: `${T.title} | ${BRAND}`, description: T.desc,
    alternates: { canonical: url, languages: { en: siteUrl() + CONTACT_PATH.en, fr: siteUrl() + CONTACT_PATH.fr, de: siteUrl() + CONTACT_PATH.de } },
    robots: { index: true, follow: true },
  };
}

/** Kontaktseite (Inhaber 03.10.2026): Interessenten melden sich direkt und sagen, welche Leads sie brauchen. */
export function ContactPage({ lang, sent, error }: { lang: HomeLang; sent?: boolean; error?: string }) {
  const T = CONTACT_TX[lang];
  const H = HOME[lang];
  const home = HOME_PATH[lang];
  const industries = INDUSTRY_KEYS.map((k) => ({
    value: k, label: T.industries[k], wishes: wishesFor(k).map((w) => ({ key: w.key, label: w[lang] })),
  }));
  const markets = MARKETS.map((m) => [m, T.markets[m]] as [string, string]);
  const i = (n: number) => ({ "--i": n }) as CSSProperties;
  const errText = error ? (T.f as Record<string, string>)[`e_${error}`] ?? T.f.e_server : "";

  return (
    <BrandShell lang={lang} extraCss={LANDING_CSS + HOME_CSS}>
      <SiteHeader links={[[home, lang === "de" ? "Start" : lang === "fr" ? "Accueil" : "Home"]]} cta={[home === "/" ? "/#sample" : `${home}#sample`, H.cta]}
        langs={HOME_LANGS.map((l) => [l.toUpperCase(), CONTACT_PATH[l], l === lang])} />
      <div className="lp2 hm">
        <section className="h2o" id="top">
          <HeroNet />
          <div className="wrap">
            <span className="pill"><Icon name="mail" />{T.pill}</span>
            <h1><Words text={T.h1} gold={T.gold} /></h1>
            <p className="sub">{T.sub}</p>
            <div className="ccards">
              {T.cards.map(([ic, h, d], k) => (
                <div className="ccard" key={h} data-rv style={i(k)}><span className="gi"><Icon name={ic} /></span><span><b>{h}</b><span>{d}</span></span></div>))}
            </div>
          </div>
        </section>

        <section className="sec cream" id="form"><div className="wrap formwrap">
          <div className="formcard">
            <h2>{T.formH}</h2>
            <p className="lede2" style={{ color: "#aab4ca" }}>{T.formSub}</p>
            {sent ? (
              <div className="pf pf-done" role="status">
                <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-6.5" /></svg>
                <p>{T.f.done.replace(/,[^,]*$/, ".")}</p>
              </div>
            ) : <>
              {errText && <p className="pf-err" role="alert">{errText}</p>}
              <ContactForm T={T} lang={lang} industries={industries} markets={markets}
                privacyHref={{ en: "/privacy", fr: "/confidentialite", de: "/datenschutz" }[lang]} />
            </>}
          </div>
          <div className="side2">
            <span className="cap gold">{T.sideH}</span>
            <ol className="nextsteps">
              {T.side.map(([n, d]) => <li key={n}><b>{n}</b><span>{d}</span></li>)}
            </ol>
            <span className="cap gold" style={{ marginTop: 10 }}>{T.mailH}</span>
            <div className="mailbox"><span className="gi" style={{ width: 38, height: 38, margin: 0, flex: "none" }}><Icon name="mail" /></span>
              <span><a href={`mailto:${CONTACT}`}>{CONTACT}</a><address>NextGen Profit · Nikolaistraße 3-7 · 04109 Leipzig · Germany</address></span></div>
          </div>
        </div></section>
      </div>
      <SiteFooter lang={lang} />
    </BrandShell>
  );
}

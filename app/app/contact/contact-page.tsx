import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { BRAND, CONTACT, siteUrl } from "@/lib/site";
import { LEAD_COUNTRIES } from "@/lib/country";
import { BrandShell, SiteFooter, SiteHeader, Words } from "../chrome";
import { HeroNet } from "../motion";
import { HOME, HOME_PATH, HOME_LANGS, type HomeLang } from "../home-i18n";
import { Icon } from "../[country]/[segment]/v2";
import { ContactForm } from "./contact-form";
import { CONTACT_PATH, CONTACT_TX } from "./contact-i18n";
import { ContactFx } from "./contact-fx";
import { contactIndustries } from "../industry-options";

export function contactMetadata(lang: HomeLang): Metadata {
  const T = CONTACT_TX[lang];
  const url = siteUrl() + CONTACT_PATH[lang];
  return {
    title: `${T.title} | ${BRAND}`, description: T.desc,
    alternates: { canonical: url, languages: { en: siteUrl() + CONTACT_PATH.en, fr: siteUrl() + CONTACT_PATH.fr, de: siteUrl() + CONTACT_PATH.de } },
    robots: { index: true, follow: true },
  };
}

/** Symbole der vier Schritte: Anfrage, Prüfung, Probe mit 10 Leads, Feinschliff. */
const STEP_ICONS = [
  <svg viewBox="0 0 24 24" key="a"><path d="M4 20h4L19 9a2.8 2.8 0 0 0-4-4L4 16v4Z" /><path d="m13.5 6.5 4 4" /></svg>,
  <svg viewBox="0 0 24 24" key="b"><circle cx="11" cy="11" r="6.5" /><path d="m20 20-4.2-4.2" /><path d="m8.5 11 1.8 1.8 3.4-3.6" /></svg>,
  <svg viewBox="0 0 24 24" key="c"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" /></svg>,
  <svg viewBox="0 0 24 24" key="d"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>,
];

/** Kontaktseite (Inhaber 03.10.2026): Interessenten melden sich direkt und sagen, welche Leads sie brauchen. */
export async function ContactPage({ lang, sent, error }: { lang: HomeLang; sent?: boolean; error?: string }) {
  const T = CONTACT_TX[lang];
  const H = HOME[lang];
  const home = HOME_PATH[lang];
  const C = T.card;
  // Branchen und Länder wie im Probe-Formular der Startseite (Inhaber 03.10.2026)
  const industries = await contactIndustries(lang);
  const countries = LEAD_COUNTRIES.map((x) => ({ code: x.code, label: x.name[lang] }));
  const i = (n: number) => ({ "--i": n }) as CSSProperties;
  const errText = error ? (T.f as Record<string, string>)[`e_${error}`] ?? T.f.e_server : "";

  return (
    <BrandShell lang={lang} css="contact">
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
      </div>
      {/* Formular wie das Probe-Formular der Startseite (dunkle Karte), rechts Ansprechpartner-Karte (Inhaber 03.10.2026) */}
      <div className="lp2 hm hpz">
        <section className="hp-sec hp-cream ct" id="form" aria-labelledby="form-title">
          <div className="hp-wrap ct-grid">
            <div className="hp-formcard hp-grain">
              <h2 className="hp-h2" id="form-title">{T.formH}</h2>
              <p className="hp-formcard__intro">{T.formSub}</p>
              {sent ? (
                <div className="pf pf-done" role="status">
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="10" /><path d="M7.5 12.5l3 3 6-6.5" /></svg>
                  <p>{T.f.done.replace(/,[^,]*$/, ".")}</p>
                </div>
              ) : <>
                {errText && <p className="pf-err" role="alert">{errText}</p>}
                <ContactForm T={T} lang={lang} industries={industries} countries={countries}
                  privacyHref={{ en: "/privacy", fr: "/confidentialite", de: "/datenschutz" }[lang]} />
              </>}
            </div>
            <div className="ct-side">
              <figure className="ct-card hp-grain" data-ct-card="">
                <figcaption className="hp-sr">{C.cap}</figcaption>
                <div className="ct-who">
                  <span className="ct-av" aria-hidden="true">N<span>P</span></span>
                  <div><b className="ct-name">{BRAND}</b><span className="ct-role">{C.role}</span>
                    <span className="ct-badge"><i aria-hidden="true" />{C.badge}</span></div>
                </div>
                <div className="ct-chat">
                  <span className="ct-ex">{C.ex}</span>
                  <p className="ct-msg ct-msg--you"><b>{C.you}</b>{C.ask}</p>
                  <div className="ct-reply">
                    <span className="ct-typing" aria-hidden="true"><i /><i /><i /></span>
                    <p className="ct-msg ct-msg--np"><b>{BRAND}</b>{C.reply}</p>
                  </div>
                </div>
                <p className="ct-steps-h">{C.stepsH}</p>
                <ol className="ct-steps">
                  {C.steps.map(([h, d], k) => (
                    <li data-step={k} key={h}><span className="ct-num" aria-hidden="true">{STEP_ICONS[k]}</span>
                      <div><h3><small>{String(k + 1).padStart(2, "0")}</small>{h}</h3><p>{d}</p></div></li>))}
                </ol>
              </figure>
              <div className="ct-mail">
                <span className="ct-mail__ico" aria-hidden="true"><svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="m4 7 8 6 8-6" /></svg></span>
                <div><h3>{T.mailH}</h3><a href={`mailto:${CONTACT}`}>{CONTACT}</a>
                  <address>NextGen Profit · Nikolaistraße 3-7 · 04109 Leipzig · Germany</address></div>
              </div>
            </div>
          </div>
        </section>
      </div>
      <ContactFx />
      <SiteFooter lang={lang} />
    </BrandShell>
  );
}

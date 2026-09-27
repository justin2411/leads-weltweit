import type { CSSProperties } from "react";
import type { Metadata } from "next";
import VIDEOS from "@/content/videos.json";
import { BRAND, CONTACT, LEGAL_NAME, siteUrl } from "@/lib/site";
import { homeFeed, homeStats, publicPages, type PublicPage } from "@/lib/site-pages";
import { BrandShell, SiteFooter, SiteHeader, Words } from "./chrome";
import { HOME, HOME_LANGS, HOME_PATH, type HomeLang } from "./home-i18n";
import { HeroNet, SignalFeed } from "./motion";

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

const ICONS: Record<string, string> = {
  register: "M4 20h16M6 20V9m4 11V9m4 11V9m4 11V9M3 9l9-5 9 5",
  check: "M4 12.5l5 5L20 6.5",
  shield: "M12 3l8 3v6c0 4.5-3.3 8.3-8 9-4.7-.7-8-4.5-8-9V6l8-3z",
  eye: "M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12zm10 3a3 3 0 100-6 3 3 0 000 6z",
  gift: "M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1.5-3-5-3-5-1s5 1 5 1zm0 0c1.5-3 5-3 5-1s-5 1-5 1z",
  pin: "M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21zm0-9a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
};

function Icon({ d }: { d: string }) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" strokeLinecap="round" strokeLinejoin="round"><path d={d} /></svg>;
}

const i = (n: number) => ({ "--i": n }) as CSSProperties;

/** Abschnittskopf: Linie, Überschrift Wort für Wort (ohne Punkt), optional Einleitung. */
function Head({ title, gold, intro }: { title: string; gold?: string[]; intro?: string }) {
  return (
    <div data-rv>
      <div className="rule" />
      <h2 className="rvw" data-rv><Words text={title} gold={gold} /></h2>
      {intro && <p className="intro">{intro}</p>}
    </div>
  );
}

export async function Home({ lang }: { lang: HomeLang }) {
  const t = HOME[lang];
  const loc = { en: "en-GB", fr: "fr-FR", de: "de-DE" }[lang];
  const mio = { en: "M+", fr: "\u00a0M+", de: "\u00a0Mio.+" }[lang];
  const [pages, stats, feed] = await Promise.all([
    publicPages().catch(() => []),
    homeStats().catch(() => ({ companies: 0, signals: 0 })),
    homeFeed(lang).catch(() => []),
  ]);
  const V = VIDEOS as Record<string, { src: string; poster: string; seconds: number }>;
  const video = V[`${lang}:home`] ?? V["uk/accountants"];
  const example = feed.find((f) => f.opener) ?? feed[0];
  const ind = (p: PublicPage): [string, string] => {
    const seg = p.slug.split("/")[1];
    return t.industries[seg] ?? [p.name, p.blurb];
  };
  const mailto = `mailto:${CONTACT}?subject=${encodeURIComponent(t.mailSubject)}&body=${encodeURIComponent(t.mailBody)}`;
  const ld = {
    "@context": "https://schema.org", "@type": "Organization", name: BRAND, legalName: LEGAL_NAME, url: siteUrl(), email: CONTACT,
    description: t.desc, address: { "@type": "PostalAddress", streetAddress: "Poststraße 14-16", postalCode: "20354", addressLocality: "Hamburg", addressCountry: "DE" },
  };

  return (
    <BrandShell lang={lang}>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <SiteHeader links={t.nav} cta={["#sample", t.cta]} langs={HOME_LANGS.map((l) => [l.toUpperCase(), HOME_PATH[l], l === lang])} />

      <div className="hero" id="top">
        <HeroNet />
        <div className="wrap">
          <div>
            <div className="eyebrow later" style={{ "--d": ".05s" } as CSSProperties}>{t.eyebrow}</div>
            <h1 className={t.h1.length > 44 ? "long" : undefined}><Words text={t.h1} gold={t.h1gold} /></h1>
            <p className="lede later" style={{ "--d": ".75s" } as CSSProperties}>{t.lede}</p>
            <div className="cta-row later" style={{ "--d": ".95s" } as CSSProperties}>
              <a className="btn gold" href="#sample">{t.btn} <span className="ar">→</span></a>
              {video && <a className="btn ghost" href="#film">{t.film}</a>}
            </div>
            <div className="fine later" style={{ "--d": "1.1s" } as CSSProperties}>{t.fine.map((f) => <span key={f}>{f}</span>)}</div>
          </div>
          <div className="feed-wrap">
            <SignalFeed items={feed} label={t.feedLabel} />
            {feed.length > 0 && <p className="feed-note">{t.feedNote}</p>}
          </div>
        </div>
      </div>

      <div className="band"><div className="wrap row">
        <div className="lbl">{t.readFrom}</div>
        <div className="marquee" aria-label={t.sources.join(", ")}>
          <div className="track" aria-hidden="true">{[...t.sources, ...t.sources].map((s, k) => <span key={k}>{s}</span>)}</div>
        </div>
      </div></div>

      <section><div className="wrap">
        <Head title={t.covH} gold={t.covGold} />
        <div className="stats" data-rv>
          <div className="stat" style={i(0)}><b data-count={18} data-suffix={mio} data-loc={loc}>18{mio}</b><span>{t.stat[0]}</span></div>
          <div className="stat" style={i(1)}><b data-count={YEARLY} data-suffix="+" data-loc={loc}>{YEARLY.toLocaleString(loc)}+</b><span>{t.stat[1]}</span></div>
          <div className="stat" style={i(2)}><b data-count={stats.signals} data-loc={loc}>{stats.signals.toLocaleString(loc)}</b><span>{t.stat[2]}</span></div>
          <div className="stat" style={i(3)}><b data-count={10}>10</b><span>{t.stat[3]}</span></div>
        </div>
        <p className="stats-note">{t.statsNote}</p>
      </div></section>

      {video && (
        <section className="dark" id="film"><div className="wrap">
          <Head title={t.filmH(video.seconds)} gold={t.filmGold(video.seconds)} intro={t.filmIntro} />
          {/* Eigenes Video, keine Drittanbieter, lädt erst beim Abspielen */}
          <div className="frame" data-rv><video controls playsInline preload="none" poster={video.poster} src={video.src} /></div>
        </div></section>
      )}

      <section id="method"><div className="wrap">
        <Head title={t.methH} gold={t.methGold} intro={t.methIntro} />
        <div className="steps" data-rv>
          {t.steps
            .map(([h, d], k) => <div className="step" key={h} style={i(k)}><div className="n">{k + 1}</div><h3>{h}</h3><p>{d}</p></div>)}
        </div>
      </div></section>

      {example && (
        <section style={{ paddingTop: 0 }}><div className="wrap anat">
          <div className="lead-card" data-rv>
            <span className="tagx">{t.exTag}</span>
            <dl>
              {([[t.exRows[0], example.company, "big"], [t.exRows[1], example.place], [t.exRows[2], example.event], [t.exRows[3], example.date],
                [t.exRows[4], example.source], [t.exRows[5], example.urgency ? ({ en: { high: "High", medium: "Medium", low: "Low" }, fr: { high: "Haute", medium: "Moyenne", low: "Basse" }, de: { high: "Hoch", medium: "Mittel", low: "Niedrig" } }[lang] as Record<string, string>)[example.urgency] ?? example.urgency : "", "prio"],
                [t.exRows[6], example.opener ? `“${example.opener}”` : "", "quote"]] as [string, string, string?][])
                .filter(([, v]) => v).flatMap(([k, v, cls], n) => [
                  <dt key={k + "t"} style={i(n)}>{k}</dt>, <dd key={k + "d"} className={cls} style={i(n)}>{cls === "prio" ? <span>{v}</span> : v}</dd>])}
            </dl>
          </div>
          <div>
            <Head title={t.anatH} gold={t.anatGold} />
            <ul className="points" data-rv>
              {t.points.map(([h, d]) => <li key={h}><b>{h}</b><span>{d}</span></li>)}
            </ul>
          </div>
        </div></section>
      )}

      <section id="industries" style={{ paddingTop: example ? 32 : undefined }}><div className="wrap">
        <Head title={t.indH} gold={t.indGold} intro={t.indIntro} />
        <div className="cards">
          {pages.map((p, k) => (
            <a className="card glow" href={`/${p.slug}`} key={p.slug} data-rv style={i(k)}>
              <div className="cc">{t.country[p.country] ?? p.country}</div><h3>{ind(p)[0]}</h3>{ind(p)[1] && <p>{ind(p)[1]}</p>}
              <span className="go">{t.indGo} <i>→</i></span>
            </a>))}
          {pages.length === 0 && <div className="card"><h3>{t.soon[0]}</h3><p>{t.soon[1]}</p></div>}
        </div>
      </div></section>

      <section className="tinted" id="trust"><div className="wrap">
        <Head title={t.trustH} gold={t.trustGold} intro={t.trustIntro} />
        <div className="facts">
          {t.facts
            .map(([ic, h, d], k) => (
              <div className="fact glow" key={h} data-rv style={i(k)}>
                <div className="seal"><Icon d={ICONS[ic]} /></div><h3>{h}</h3><p>{d.replace("{LEGAL}", LEGAL_NAME)}</p>
              </div>))}
        </div>
      </div></section>

      <section className="offer" id="sample"><div className="wrap">
        <div>
          <Head title={t.offerH} gold={t.offerGold} intro={t.offerIntro} />
          <div className="cta-row" data-rv><a className="btn gold big" href={mailto}>{t.offerBtn} <span className="ar">→</span></a></div>
          <div className="fine">{t.offerFine.map((f) => <span key={f}>{f}</span>)}</div>
        </div>
        <div data-rv>
          <ol className="olist">
            {t.offerSteps.map((o) => <li key={o}>{o}</li>)}
          </ol>
          <p className="feed-note" style={{ marginTop: 22 }}>{t.offerNote}</p>
        </div>
      </div></section>

      <section><div className="wrap faq">
        <Head title={t.faqH} />
        {t.faq.map((f, k) => <details key={f.q} data-rv style={i(k)}><summary>{f.q}</summary><p>{f.a}</p></details>)}
      </div></section>

      <SiteFooter lang={lang} />
    </BrandShell>
  );
}

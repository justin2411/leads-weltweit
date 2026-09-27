import type { CSSProperties } from "react";
import type { Metadata } from "next";
import VIDEOS from "@/content/videos.json";
import { BRAND, CONTACT, siteUrl } from "@/lib/site";
import { homeFeed, homeStats, publicPages } from "@/lib/site-pages";
import { BrandShell, SiteFooter, SiteHeader, Words } from "./chrome";
import { HeroNet, SignalFeed } from "./motion";

export const dynamic = "force-dynamic";

const TITLE = `${BRAND} | B2B leads with a reason to call`;
const DESC = "Every week: companies in your area that were just registered, are hiring or expanding. Each lead dated, with its official source and a suggested opening line. For accountants, insurance brokers, financial advisers and other B2B service firms.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: siteUrl() },
  robots: { index: true, follow: true },
  openGraph: { title: TITLE, description: DESC, url: siteUrl(), siteName: BRAND, type: "website" },
};

// Register (Inhaber 27.09.2026 „über 18 Millionen“): Companies House 4.930.634 (effektives Register, März 2026,
// GOV.UK Companies register activities 2025/26) + INSEE SIRENE 13,7 Mio. aktive Rechtseinheiten (2022) = 18,6 Mio.
// Hochrechnung (Stand 27.09.2026): neue Firmen pro Tag je Land × 365, abgerundet.
// UK 12.698 in 35 Tagen ≈ 132.000, US 600 in 2 Tagen ≈ 110.000, FR 362 in 6 Tagen ≈ 22.000 → ≈ 264.000 pro Jahr.
const YEARLY = 250000;

const SOURCES = ["Companies House", "NY Department of State", "BODACC France", "Company careers pages", "Official public notices"];

const FAQ = [
  { q: "What exactly is a lead?", a: "A company in your area with a recent, dated event that gives you a genuine reason to get in touch, for example a new registration or a role that has stayed open for weeks. Each lead names the company, the event, the date, the official source and a suggested opening line." },
  { q: "Where does the data come from?", a: "From official company registers such as Companies House, from official public notices and from companies' own websites and careers pages. We do not scrape LinkedIn, job boards or any platform whose terms forbid it." },
  { q: "Does a lead contain personal data?", a: "No. Company data only: name, address, website, the main phone number where it is published, the event and its source." },
  { q: "How do you decide what is worth sending?", a: "Every lead is rated for freshness, clarity of the signal and completeness of the company data. Leads below our minimum are not delivered. You only receive leads from the areas you choose, and each lead reaches you once." },
  { q: "What does the free sample include?", a: "Ten current leads from your area in exactly the format of the weekly delivery. There is no charge, no card and no subscription." },
  { q: "How often are new leads delivered?", a: "Every Monday morning, as a short list for your region." },
];

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

/** Abschnittskopf: Linie, Stichwort, Überschrift Wort für Wort (ohne Punkt), optional Einleitung. */
function Head({ eyebrow, title, gold, intro }: { eyebrow: string; title: string; gold?: string[]; intro?: string }) {
  return (
    <div data-rv>
      <div className="rule" /><div className="eyebrow">{eyebrow}</div>
      <h2 className="rvw" data-rv><Words text={title} gold={gold} /></h2>
      {intro && <p className="intro">{intro}</p>}
    </div>
  );
}

export default async function Home() {
  const [pages, stats, feed] = await Promise.all([
    publicPages().catch(() => []),
    homeStats().catch(() => ({ companies: 0, signals: 0 })),
    homeFeed().catch(() => []),
  ]);
  const video = (VIDEOS as Record<string, { src: string; poster: string; seconds: number }>)["uk/accountants"];
  const example = feed.find((f) => f.opener) ?? feed[0];
  const mailto = `mailto:${CONTACT}?subject=${encodeURIComponent("Request for a free sample of 10 leads")}&body=${encodeURIComponent(
    "Dear NextGen Profit team,\n\n" +
    "we would like to receive the free sample of 10 current leads for our area.\n\n" +
    "Company name:\n" +
    "Our services (for example accounting, insurance, recruitment):\n" +
    "Towns or counties we cover:\n\n" +
    "Please send the sample to this email address.\n\n" +
    "Kind regards\n")}`;
  const ld = {
    "@context": "https://schema.org", "@type": "Organization", name: BRAND, url: siteUrl(), email: CONTACT,
    description: DESC, address: { "@type": "PostalAddress", streetAddress: "Poststraße 14-16", postalCode: "20354", addressLocality: "Hamburg", addressCountry: "DE" },
  };

  return (
    <BrandShell lang="en">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <SiteHeader links={[["#method", "Method"], ["#industries", "Industries"], ["#trust", "Why trust us"]]} cta={["#sample", "Free sample"]} />

      <div className="hero" id="top">
        <HeroNet />
        <div className="spot" aria-hidden="true" />
        <div className="wrap">
          <div>
            <div className="eyebrow later" style={{ "--d": ".05s" } as CSSProperties}>Trigger leads for B2B service firms</div>
            <h1><Words text="Reach companies at the moment they need you" gold={["need", "you"]} /></h1>
            <p className="lede later" style={{ "--d": ".75s" } as CSSProperties}>Every week we read official registers and company careers pages, find the businesses in your area with a real reason to buy, and send you a short list. Each lead with its date, its source and an opening line.</p>
            <div className="cta-row later" style={{ "--d": ".95s" } as CSSProperties}>
              <a className="btn gold mag" href="#sample">Get 10 free sample leads <span className="ar">→</span></a>
              {video && <a className="btn ghost mag" href="#film">Watch the film</a>}
            </div>
            <div className="fine later" style={{ "--d": "1.1s" } as CSSProperties}><span>Free of charge</span><span>No card</span><span>No subscription</span></div>
          </div>
          <div className="feed-wrap">
            <SignalFeed items={feed} label="Recently detected" />
            {feed.length > 0 && <p className="feed-note">Real examples from our current sample set. Company data only.</p>}
          </div>
        </div>
      </div>

      <div className="band"><div className="wrap row">
        <div className="lbl">Read daily from</div>
        <div className="marquee" aria-label={SOURCES.join(", ")}>
          <div className="track" aria-hidden="true">{[...SOURCES, ...SOURCES].map((s, k) => <span key={k}>{s}</span>)}</div>
        </div>
      </div></div>

      <section><div className="wrap">
        <Head eyebrow="Our coverage" title="Built on public record, checked every day" gold={["checked", "every", "day"]} />
        <div className="stats" data-rv>
          <div className="stat" style={i(0)}><b data-count={18} data-suffix="M+">18M+</b><span>companies in the official registers of our markets</span></div>
          <div className="stat" style={i(1)}><b data-count={YEARLY} data-suffix="+">{YEARLY.toLocaleString("en-GB")}+</b><span>new companies a year within our view</span></div>
          <div className="stat" style={i(2)}><b data-count={stats.signals}>{stats.signals.toLocaleString("en-GB")}</b><span>dated signals recorded</span></div>
          <div className="stat" style={i(3)}><b data-count={10}>10</b><span>free leads in every sample</span></div>
        </div>
        <p className="stats-note">Registers: 4.93 million companies on the UK Companies House register (March 2026) and 13.7 million active legal units in the French SIRENE register (INSEE). Signals are counted live from our database. The yearly figure is projected from the new registrations we currently record per day in the UK, US and France.</p>
      </div></section>

      {video && (
        <section className="dark" id="film"><div className="wrap">
          <Head eyebrow="The film" title={`How it works in ${video.seconds} seconds`} gold={[String(video.seconds), "seconds"]}
            intro="An example for accountancy firms in the UK. The same process runs for every industry we serve." />
          {/* Eigenes Video, keine Drittanbieter, lädt erst beim Abspielen */}
          <div className="frame" data-rv><video controls playsInline preload="none" poster={video.poster} src={video.src} /></div>
        </div></section>
      )}

      <section id="method"><div className="wrap">
        <Head eyebrow="Method" title="From public record to your next client" gold={["your", "next", "client"]}
          intro="We do the watching. You receive a short list you can act on the same morning." />
        <div className="steps" data-rv>
          {[["We read the sources", "Every day we check company registers, official notices and local careers pages."],
            ["We spot the moment", "A new registration, a role open for weeks, several hires at once. Each event is recorded with its date and source."],
            ["We filter and rate", "Only your areas, only relevant signals. Every lead is rated for freshness and relevance, weak ones are left out."],
            ["You get the list", "Every Monday: company, event, date, source and a suggested opening line. Each lead reaches you once."]]
            .map(([t, d], k) => <div className="step" key={t} style={i(k)}><div className="n">{k + 1}</div><h3>{t}</h3><p>{d}</p></div>)}
        </div>
      </div></section>

      {example && (
        <section style={{ paddingTop: 0 }}><div className="wrap anat">
          <div className="lead-card tilt" data-rv>
            <span className="tagx">Example from a real sample</span>
            <dl>
              {([["Company", example.company, "big"], ["Location", example.place], ["Event", example.event], ["Date", example.date],
                ["Source", example.source], ["Priority", example.urgency ? example.urgency[0].toUpperCase() + example.urgency.slice(1) : ""],
                ["Opening line", example.opener ? `“${example.opener}”` : "", "quote"]] as [string, string, string?][])
                .filter(([, v]) => v).flatMap(([k, v, cls], n) => [
                  <dt key={k + "t"} style={i(n)}>{k}</dt>, <dd key={k + "d"} className={cls} style={i(n)}>{v}</dd>])}
            </dl>
          </div>
          <div>
            <Head eyebrow="Anatomy of a lead" title="Everything you need for the first call" gold={["the", "first", "call"]} />
            <ul className="points" data-rv>
              <li><b>The reason to call</b><span>A concrete event, not a guess. You know why this company might need you now.</span></li>
              <li><b>Proof you can check</b><span>Date and official source on every line. Nothing to take on trust.</span></li>
              <li><b>A way in</b><span>A short opening line that refers to the event, ready for a call or an email.</span></li>
            </ul>
          </div>
        </div></section>
      )}

      <section id="industries" style={{ paddingTop: example ? 32 : undefined }}><div className="wrap">
        <Head eyebrow="Industries" title="Signals chosen for your line of work" gold={["your", "line", "of", "work"]}
          intro="Each industry needs different moments. Choose yours to see what you would receive." />
        <div className="cards">
          {pages.map((p, k) => (
            <a className="card glow" href={`/${p.slug}`} key={p.slug} data-rv style={i(k)}>
              <div className="cc">{p.country}</div><h3>{p.name}</h3>{p.blurb && <p>{p.blurb}</p>}
              <span className="go">See example leads <i>→</i></span>
            </a>))}
          {pages.length === 0 && <div className="card"><h3>Coming soon</h3><p>Industry pages are being prepared.</p></div>}
        </div>
      </div></section>

      <section className="tinted" id="trust"><div className="wrap">
        <Head eyebrow="Why trust us" title="Facts you can verify yourself" gold={["verify", "yourself"]}
          intro="No bought lists and no guesswork. Here is exactly how we work." />
        <div className="facts">
          {[["register", "Official sources only", "Companies House, state registers, official notices and the companies' own websites."],
            ["check", "Every lead verifiable", "Each entry carries the date of the event and the source it came from."],
            ["shield", "Company data only", "No personal data of employees. Operated from Hamburg, Germany, under the GDPR."],
            ["eye", "No scraping", "We never scrape LinkedIn, job boards or platforms whose terms forbid it."],
            ["gift", "Try before you decide", "Ten free leads from your area. No card, no subscription, no obligation."],
            ["pin", "A real company", `${BRAND}, Poststraße 14-16, 20354 Hamburg, Germany. Full details in our legal notice.`]]
            .map(([ic, t, d], k) => (
              <div className="fact glow" key={t} data-rv style={i(k)}>
                <div className="seal"><Icon d={ICONS[ic]} /></div><h3>{t}</h3><p>{d}</p>
              </div>))}
        </div>
      </div></section>

      <section className="offer" id="sample"><div className="wrap">
        <div>
          <Head eyebrow="Free sample" title="See it for your area, ten leads free" gold={["ten", "leads", "free"]}
            intro="Tell us what you offer and which area you cover. You receive ten current leads in the format of the weekly delivery." />
          <div className="cta-row" data-rv><a className="btn gold big mag" href={mailto}>Request the sample by email <span className="ar">→</span></a></div>
          <div className="fine"><span>No charge</span><span>No card</span><span>No obligation</span></div>
        </div>
        <div data-rv>
          <ol className="olist">
            <li>You send us a short email with your company and your area.</li>
            <li>We prepare ten current leads from official sources for that area.</li>
            <li>You contact the companies that fit. Once you have, we ask briefly how it went.</li>
          </ol>
          <p className="feed-note" style={{ marginTop: 22 }}>Received an email from us? Use the link in it and your sample is one click away.</p>
        </div>
      </div></section>

      <section><div className="wrap faq">
        <Head eyebrow="Questions" title="Good to know" />
        {FAQ.map((f, k) => <details key={f.q} data-rv style={i(k)}><summary>{f.q}</summary><p>{f.a}</p></details>)}
      </div></section>

      <SiteFooter />
    </BrandShell>
  );
}

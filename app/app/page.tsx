import type { Metadata } from "next";
import VIDEOS from "@/content/videos.json";
import { BRAND, CONTACT, siteUrl } from "@/lib/site";
import { publicPages } from "@/lib/site-pages";

export const dynamic = "force-dynamic";

const TITLE = `${BRAND} – B2B leads with a reason to call`;
const DESC = "Every week: companies in your area that were just registered, are hiring or growing – dated, with the official source and a suggested opening line. For accountants, insurance brokers, financial advisers and other B2B service firms.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: siteUrl() },
  robots: { index: true, follow: true },
  openGraph: { title: TITLE, description: DESC, url: siteUrl(), siteName: BRAND, type: "website" },
};

const css = `
.hp{--ink:#0f1b2d;--soft:#51607a;--brand:#1d4ed8;--line:#e2e8f0;--tint:#f5f8ff;--dark:#0a1324;color:var(--ink);background:#fff;font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}
@media (prefers-color-scheme:dark){.hp{--ink:#e8edf6;--soft:#a3b0c6;--brand:#7aa2ff;--line:#2a3345;--tint:#141b28;background:#0c111b}}
.hp .wrap{max-width:1080px;margin:0 auto;padding:0 20px}.hp header{border-bottom:1px solid var(--line)}
.hp nav{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 0;flex-wrap:wrap}
.hp .mark{font-weight:800;font-size:18px;letter-spacing:.01em;color:inherit;text-decoration:none}.hp .mark b{color:var(--brand)}
.hp nav .links a{color:var(--soft);text-decoration:none;margin-left:18px;font-size:15px}
.hp .hero{padding-top:64px;padding-bottom:48px}.hp h1{font-size:clamp(32px,5vw,52px);line-height:1.1;margin:0 0 18px;letter-spacing:-.02em}
.hp .sub{font-size:20px;color:var(--soft);max-width:760px;margin:0}.hp .btns{display:flex;gap:12px;flex-wrap:wrap;margin-top:28px}
.hp .btn{display:inline-block;padding:14px 22px;border-radius:10px;font-weight:700;text-decoration:none;border:1px solid var(--brand)}
.hp .btn.pri{background:var(--brand);color:#fff}.hp .btn.sec{color:var(--brand)}
.hp .note{color:var(--soft);font-size:14px}.hp section{padding:48px 0;border-top:1px solid var(--line)}
.hp h2{font-size:28px;margin:0 0 10px;letter-spacing:-.01em}.hp .lead{color:var(--soft);margin:0 0 24px;max-width:720px}
.hp .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:16px}
.hp .card{background:var(--tint);border:1px solid var(--line);border-radius:14px;padding:20px}.hp .card h3{margin:0 0 6px;font-size:18px}
.hp .card p{margin:0;color:var(--soft)}.hp a.card{color:inherit;text-decoration:none;display:block;transition:border-color .15s}
.hp a.card:hover{border-color:var(--brand)}.hp .go{color:var(--brand);font-weight:700;margin-top:12px;display:inline-block}
.hp .tag{display:inline-block;font-size:12px;font-weight:700;padding:2px 10px;border-radius:99px;background:var(--brand);color:#fff;margin-bottom:10px}
.hp .num{display:inline-flex;width:34px;height:34px;border-radius:50%;background:var(--brand);color:#fff;font-weight:800;align-items:center;justify-content:center;margin-bottom:10px}
.hp .vid{width:100%;max-width:960px;aspect-ratio:16/9;border-radius:14px;background:var(--dark);display:block}
.hp ul.checks{list-style:none;padding:0;margin:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px 28px}
.hp ul.checks li{padding-left:30px;position:relative}.hp ul.checks li:before{content:"✓";position:absolute;left:0;color:#15803d;font-weight:800}
.hp details{border-bottom:1px solid var(--line);padding:12px 0}.hp summary{cursor:pointer;font-weight:600}
.hp .cta{background:var(--dark);color:#eef3fb;border-radius:18px;padding:36px;margin:8px 0}.hp .cta p{color:#a9b8d4}
.hp footer{padding:28px 0;border-top:1px solid var(--line);color:var(--soft);font-size:14px}.hp footer a{color:inherit;margin-right:16px}
@media (max-width:640px){.hp nav .links{display:none}.hp .hero{padding-top:40px;padding-bottom:32px}.hp .sub{font-size:18px}.hp .btn{display:block;text-align:center;width:100%}
.hp section{padding:36px 0}.hp .cta{padding:24px}}
`;

const FAQ = [
  { q: "What exactly is a lead?", a: "A company in your area with a fresh, dated event that gives you a reason to get in touch – for example a new registration or a role that has been open for weeks. Each lead shows the company, the event, the date, the official source and a suggested opening line." },
  { q: "Where does the data come from?", a: "Official company registers such as Companies House, official public notices and companies' own websites and careers pages. We do not scrape LinkedIn, job boards or other platforms whose terms forbid it." },
  { q: "Is there personal data in the leads?", a: "No. Company data only: name, address, website, main phone number where published, the event and its source." },
  { q: "How are leads selected?", a: "Every lead is scored for freshness, clarity of the signal and completeness of the company data. Leads below a minimum score are not delivered. You only receive leads from the areas you choose, and each lead is delivered to you once." },
  { q: "What does the free sample include?", a: "10 current leads from your area in the same format as the weekly delivery. Free of charge, no card, no subscription." },
  { q: "How often do I receive leads?", a: "Every Monday morning, as a short list for your region." },
];

export default async function Home() {
  const pages = await publicPages().catch(() => []);
  const video = (VIDEOS as Record<string, { src: string; poster: string; seconds: number }>)["uk/accountants"];
  const mailto = `mailto:${CONTACT}?subject=${encodeURIComponent("Free sample: 10 leads")}&body=${encodeURIComponent("Hello,\n\nplease send us 10 free sample leads.\n\nCompany:\nWhat we offer (e.g. accounting, insurance):\nArea (towns or counties):\n")}`;
  const ld = {
    "@context": "https://schema.org", "@type": "Organization", name: BRAND, url: siteUrl(), email: CONTACT,
    description: DESC, address: { "@type": "PostalAddress", streetAddress: "Poststraße 14-16", postalCode: "20354", addressLocality: "Hamburg", addressCountry: "DE" },
  };

  return (
    <div className="hp" lang="en">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <header><div className="wrap"><nav>
        <a className="mark" href="/">NextGen <b>Profit</b></a>
        <div className="links"><a href="#how">How it works</a><a href="#industries">Industries</a><a href="#sample">Free sample</a></div>
      </nav></div></header>

      <div className="wrap hero">
        <h1>B2B leads with a reason to call.</h1>
        <p className="sub">Every week we find companies near you that were just registered, are hiring or growing – each one dated, with the official source and a suggested opening line. So you reach them early, when they are choosing a provider.</p>
        <div className="btns"><a className="btn pri" href="#sample">Get 10 free sample leads</a><a className="btn sec" href="#video">Watch how it works</a></div>
        <p className="note" style={{ marginTop: 14 }}>Free of charge · no card · no subscription</p>
      </div>

      {video && (
        <section id="video"><div className="wrap">
          <h2>How it works in {video.seconds} seconds</h2>
          <p className="lead">Example: leads for accountancy firms in the UK. The same process runs for every industry we serve.</p>
          {/* Eigenes Video, keine Drittanbieter, lädt erst beim Abspielen */}
          <video className="vid" controls playsInline preload="none" poster={video.poster} src={video.src} />
        </div></section>
      )}

      <section id="how"><div className="wrap">
        <h2>From public record to your next client</h2>
        <p className="lead">We do the watching. You get a short, ready-to-use list.</p>
        <div className="grid">
          {[["We watch official sources", "Every day we check company registers, public notices and local careers pages."],
            ["We spot the moment", "A new registration, a role open for weeks, several hires at once – each event is recorded with its date and source."],
            ["We filter and score", "Only your areas, only relevant signals. Every lead is rated for freshness and relevance; weak ones are left out."],
            ["You get the list", "Every Monday: company, event, date, source and a suggested opening line. Each lead delivered to you once."]]
            .map(([t, d], i) => <div className="card" key={t}><span className="num">{i + 1}</span><h3>{t}</h3><p>{d}</p></div>)}
        </div>
      </div></section>

      <section id="industries"><div className="wrap">
        <h2>Leads for your industry</h2>
        <p className="lead">Each industry needs different signals. Choose yours to see what you would receive.</p>
        <div className="grid">
          {pages.map((p) => (
            <a className="card" href={`/${p.slug}`} key={p.slug}>
              <span className="tag">{p.country}</span><h3>{p.name}</h3>{p.blurb && <p>{p.blurb}</p>}
              <span className="go">See example leads →</span>
            </a>))}
          {pages.length === 0 && <div className="card"><h3>Coming soon</h3><p>Industry pages are being prepared.</p></div>}
        </div>
      </div></section>

      <section><div className="wrap">
        <h2>Why these leads are worth calling</h2>
        <p className="lead">No bought lists, no guesswork – every lead can be checked.</p>
        <ul className="checks">
          <li><b>Official sources only.</b> Company registers, public notices, companies' own sites.</li>
          <li><b>Dated and sourced.</b> Every lead links to where the event was found.</li>
          <li><b>Quality score.</b> Leads below our minimum score are never delivered.</li>
          <li><b>Your area only.</b> You choose the towns or counties.</li>
          <li><b>Each lead once.</b> You never pay for the same lead twice.</li>
          <li><b>Opening line included.</b> A short, relevant first sentence for your call or email.</li>
          <li><b>Company data only.</b> No personal data of employees.</li>
          <li><b>Checked daily.</b> New events are picked up as they appear.</li>
        </ul>
      </div></section>

      <section id="sample"><div className="wrap"><div className="cta">
        <h2>See it for your area – 10 leads, free</h2>
        <p>Tell us what you offer and which area you cover. We send you 10 current leads in the same format as the weekly delivery. Free of charge, no obligation – and once you have had a chance to contact them, we will ask how it went.</p>
        <div className="btns"><a className="btn pri" href={mailto}>Request by email</a></div>
        <p className="note" style={{ color: "#a9b8d4", marginTop: 14 }}>Received an email from us? Use the link in it – your sample is then just one click.</p>
      </div></div></section>

      <section><div className="wrap">
        <h2>Questions</h2>
        {FAQ.map((f) => <details key={f.q}><summary>{f.q}</summary><p>{f.a}</p></details>)}
      </div></section>

      <footer><div className="wrap">
        <a href="/impressum">Legal notice</a><a href="/datenschutz">Privacy policy</a><a href="/agb">Terms</a>
        <span>© {new Date().getFullYear()} {BRAND} · {CONTACT}</span>
      </div></footer>
    </div>
  );
}

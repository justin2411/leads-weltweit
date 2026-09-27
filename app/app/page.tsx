import type { Metadata } from "next";
import { Fraunces, Inter } from "next/font/google";
import VIDEOS from "@/content/videos.json";
import { BRAND, CONTACT, siteUrl } from "@/lib/site";
import { homeFeed, homeStats, publicPages } from "@/lib/site-pages";
import { Motion, SignalFeed } from "./home-motion";

export const dynamic = "force-dynamic";

// Schriften werden beim Build selbst gehostet (kein Abruf bei Google durch Besucher, DSGVO).
const serif = Fraunces({ subsets: ["latin"], weight: ["400", "500", "600"], style: ["normal", "italic"], variable: "--serif", display: "swap" });
const sans = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--sans", display: "swap" });

const TITLE = `${BRAND} | B2B leads with a reason to call`;
const DESC = "Every week: companies in your area that were just registered, are hiring or expanding. Each lead dated, with its official source and a suggested opening line. For accountants, insurance brokers, financial advisers and other B2B service firms.";

export const metadata: Metadata = {
  title: TITLE,
  description: DESC,
  alternates: { canonical: siteUrl() },
  robots: { index: true, follow: true },
  openGraph: { title: TITLE, description: DESC, url: siteUrl(), siteName: BRAND, type: "website" },
};

const css = `
.hp{--ink:#0b1320;--ink2:#121c2e;--paper:#f7f4ee;--card:#fffdf9;--text:#161b24;--soft:#5b6372;--line:#e4ddd0;--gold:#b08d57;--gold2:#d8bd8a;--night-soft:#9aa6ba;
  color:var(--text);background:var(--paper);font-family:var(--sans),system-ui,sans-serif;font-size:17px;line-height:1.65;-webkit-font-smoothing:antialiased;overflow-x:hidden}
.hp *{box-sizing:border-box}.hp a{color:inherit}
.hp .wrap{max-width:1160px;margin:0 auto;padding:0 24px}
.hp .serif{font-family:var(--serif),Georgia,serif;font-weight:500;letter-spacing:-.015em}
.hp .eyebrow{font-size:12px;letter-spacing:.2em;text-transform:uppercase;color:var(--gold);font-weight:600}

/* Navigation */
.hp .nav{position:sticky;top:0;z-index:20;background:rgba(11,19,32,.72);backdrop-filter:saturate(160%) blur(14px);-webkit-backdrop-filter:saturate(160%) blur(14px);border-bottom:1px solid rgba(255,255,255,.06)}
.hp .nav .wrap{display:flex;align-items:center;justify-content:space-between;height:68px}
.hp .mark{font-family:var(--serif),Georgia,serif;font-size:22px;color:#f4efe6;text-decoration:none;letter-spacing:-.01em}.hp .mark i{color:var(--gold2)}
.hp .nav .links{display:flex;gap:30px;align-items:center}.hp .nav .links a{color:#c9d1de;text-decoration:none;font-size:14px}
.hp .nav .links a:hover{color:#fff}.hp .nav .links .pill{border:1px solid rgba(216,189,138,.5);color:#f4efe6;padding:8px 16px;border-radius:99px}

/* Hero */
.hp .hero{position:relative;background:var(--ink);color:#eef1f6;overflow:hidden;isolation:isolate}
.hp .hero:before{content:"";position:absolute;inset:0;z-index:-2;background:
  radial-gradient(900px 520px at 78% 18%,rgba(176,141,87,.20),transparent 60%),
  radial-gradient(700px 500px at 8% 90%,rgba(62,98,170,.22),transparent 60%);animation:glow 14s ease-in-out infinite alternate}
.hp .hero:after{content:"";position:absolute;inset:0;z-index:-1;opacity:.35;
  background-image:linear-gradient(rgba(255,255,255,.05) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.05) 1px,transparent 1px);
  background-size:56px 56px;mask-image:radial-gradient(ellipse at 60% 40%,#000 30%,transparent 75%);-webkit-mask-image:radial-gradient(ellipse at 60% 40%,#000 30%,transparent 75%)}
.hp .scan{position:absolute;left:0;right:0;height:140px;top:-140px;z-index:-1;background:linear-gradient(180deg,transparent,rgba(216,189,138,.07),transparent);animation:scan 9s linear infinite}
.hp .hero .wrap{display:grid;grid-template-columns:1.15fr .85fr;gap:56px;align-items:center;padding-top:96px;padding-bottom:104px}
.hp h1{font-family:var(--serif),Georgia,serif;font-weight:400;font-size:clamp(40px,5.6vw,72px);line-height:1.04;letter-spacing:-.025em;margin:18px 0 24px}
.hp h1 em{font-style:italic;color:var(--gold2)}
.hp h1 .ln{display:block;overflow:hidden;padding-bottom:.1em;margin-bottom:-.1em}.hp h1 .ln span{display:inline-block;animation:rise 1.1s cubic-bezier(.2,.7,.1,1) both}
.hp h1 .ln:nth-child(2) span{animation-delay:.12s}.hp h1 .ln:nth-child(3) span{animation-delay:.24s}
.hp .lede{font-size:19px;color:#c3cbd8;max-width:560px;margin:0;animation:fade 1.2s .45s both}
.hp .cta-row{display:flex;gap:14px;flex-wrap:wrap;margin-top:36px;animation:fade 1.2s .6s both}
.hp .btn{display:inline-flex;align-items:center;gap:10px;padding:15px 26px;border-radius:99px;font-weight:600;font-size:16px;text-decoration:none;transition:transform .25s,box-shadow .25s,background .25s}
.hp .btn.gold{background:linear-gradient(135deg,#d8bd8a,#b08d57);color:#141008;box-shadow:0 10px 30px -10px rgba(216,189,138,.6)}
.hp .btn.gold:hover{transform:translateY(-2px);box-shadow:0 16px 40px -12px rgba(216,189,138,.75)}
.hp .btn.ghost{border:1px solid rgba(255,255,255,.22);color:#eef1f6}.hp .btn.ghost:hover{background:rgba(255,255,255,.06)}
.hp .btn .ar{transition:transform .25s}.hp .btn:hover .ar{transform:translateX(4px)}
.hp .fine{margin-top:18px;font-size:13px;color:var(--night-soft);letter-spacing:.02em;animation:fade 1.2s .75s both}
.hp .fine span+span:before{content:"";display:inline-block;width:4px;height:4px;border-radius:50%;background:var(--gold);margin:0 12px 3px}

/* Laufende Beispiele */
.hp .feed{background:rgba(255,255,255,.04);border:1px solid rgba(255,255,255,.1);border-radius:20px;padding:22px;backdrop-filter:blur(6px);box-shadow:0 40px 80px -40px rgba(0,0,0,.6);animation:float-in 1.3s .35s both}
.hp .feed-head{display:flex;align-items:center;gap:10px;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--night-soft);margin-bottom:14px}
.hp .pulse{width:8px;height:8px;border-radius:50%;background:#5bd49a;box-shadow:0 0 0 0 rgba(91,212,154,.6);animation:pulse 2s infinite}
.hp .feed ul{list-style:none;margin:0;padding:0;display:grid;gap:10px}
.hp .feed li{background:rgba(255,255,255,.05);border:1px solid rgba(255,255,255,.07);border-radius:14px;padding:14px 16px;transition:opacity .6s}
.hp .feed li:nth-child(2){opacity:.7}.hp .feed li:nth-child(3){opacity:.42}
.hp .feed li.new{animation:slide .7s cubic-bezier(.2,.7,.1,1) both;border-color:rgba(216,189,138,.35)}
.hp .feed .co{font-weight:600;color:#fff;font-size:15px}.hp .feed .co span{font-weight:400;color:var(--night-soft);margin-left:8px;font-size:13px}
.hp .feed .ev{color:#d5dbe5;font-size:14px;margin-top:2px}.hp .feed .mt{color:var(--gold2);font-size:12px;margin-top:6px;letter-spacing:.02em}
.hp .feed-note{font-size:12px;color:var(--night-soft);margin:12px 4px 0}

/* Quellen-Band */
.hp .band{background:var(--ink2);color:#c9d1de;border-top:1px solid rgba(255,255,255,.06);padding:22px 0;overflow:hidden}
.hp .band .row{display:flex;align-items:center;gap:28px}
.hp .band .lbl{flex:none;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:var(--gold2)}
.hp .marquee{flex:1;overflow:hidden;mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent);-webkit-mask-image:linear-gradient(90deg,transparent,#000 8%,#000 92%,transparent)}
.hp .marquee .track{display:flex;gap:56px;width:max-content;animation:marq 38s linear infinite}
.hp .marquee span{font-family:var(--serif),Georgia,serif;font-size:19px;white-space:nowrap;color:#e6e9ef}
.hp .marquee span:before{content:"";display:inline-block;width:5px;height:5px;border-radius:50%;background:var(--gold);margin:0 16px 4px 0}

/* Abschnitte */
.hp section{padding:112px 0}
.hp h2{font-family:var(--serif),Georgia,serif;font-weight:400;font-size:clamp(32px,3.8vw,50px);line-height:1.1;letter-spacing:-.02em;margin:14px 0 18px}
.hp h2 em{font-style:italic;color:var(--gold)}
.hp .intro{color:var(--soft);font-size:19px;max-width:640px;margin:0 0 56px}
.hp .rule{width:56px;height:1px;background:var(--gold);margin:0 0 18px}

/* Kennzahlen */
.hp .stats{display:grid;grid-template-columns:repeat(4,1fr);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.hp .stat{padding:36px 28px}.hp .stat+.stat{border-left:1px solid var(--line)}
.hp .stat b{display:block;font-family:var(--serif),Georgia,serif;font-weight:400;font-size:clamp(38px,4.4vw,58px);line-height:1;letter-spacing:-.02em;font-variant-numeric:tabular-nums}
.hp .stat span{display:block;color:var(--soft);font-size:15px;margin-top:12px}
.hp .stats-note{font-size:13px;color:var(--soft);margin-top:16px}

/* Video */
.hp .video{background:var(--ink);color:#eef1f6}.hp .video .intro{color:#b9c2d0}
.hp .frame{position:relative;border-radius:22px;padding:10px;background:linear-gradient(135deg,rgba(216,189,138,.5),rgba(255,255,255,.06) 40%,rgba(216,189,138,.25));box-shadow:0 60px 120px -50px rgba(0,0,0,.8)}
.hp .frame video{display:block;width:100%;aspect-ratio:16/9;border-radius:14px;background:#000}

/* Ablauf */
.hp .steps{display:grid;grid-template-columns:repeat(4,1fr);gap:0;position:relative}
.hp .steps:before{content:"";position:absolute;left:0;right:0;top:27px;height:1px;background:var(--line)}
.hp .steps:after{content:"";position:absolute;left:0;top:27px;height:1px;width:0;background:var(--gold);transition:width 2.2s cubic-bezier(.2,.7,.1,1)}
.hp .steps.in:after{width:100%}
.hp .step{padding-right:28px;position:relative}
.hp .step .n{width:54px;height:54px;border-radius:50%;background:var(--paper);border:1px solid var(--gold);display:flex;align-items:center;justify-content:center;font-family:var(--serif),Georgia,serif;font-size:22px;color:var(--gold);position:relative;z-index:1}
.hp .step h3{font-family:var(--serif),Georgia,serif;font-weight:500;font-size:22px;margin:24px 0 8px}
.hp .step p{color:var(--soft);margin:0;font-size:16px}

/* Anatomie eines Leads */
.hp .anat{display:grid;grid-template-columns:1fr 1fr;gap:64px;align-items:center}
.hp .lead-card{background:var(--card);border:1px solid var(--line);border-radius:20px;padding:30px;box-shadow:0 30px 70px -40px rgba(22,27,36,.35);position:relative}
.hp .lead-card .tagx{position:absolute;top:-12px;left:28px;background:var(--ink);color:var(--gold2);font-size:11px;letter-spacing:.16em;text-transform:uppercase;padding:5px 12px;border-radius:99px}
.hp .lead-card dl{margin:0;display:grid;grid-template-columns:120px 1fr;gap:14px 18px}
.hp .lead-card dt{font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:var(--gold);padding-top:3px}
.hp .lead-card dd{margin:0;font-size:16px}.hp .lead-card dd.big{font-family:var(--serif),Georgia,serif;font-size:22px;line-height:1.25}
.hp .lead-card dd.quote{font-style:italic;color:var(--soft)}
.hp .anat ul{list-style:none;padding:0;margin:0;display:grid;gap:22px}
.hp .anat li{padding-left:22px;border-left:1px solid var(--gold)}.hp .anat li b{display:block;font-weight:600;margin-bottom:2px}
.hp .anat li span{color:var(--soft);font-size:16px}

/* Branchen */
.hp .inds{display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:20px}
.hp a.ind{display:block;text-decoration:none;background:var(--card);border:1px solid var(--line);border-radius:18px;padding:30px;position:relative;overflow:hidden;transition:transform .35s cubic-bezier(.2,.7,.1,1),box-shadow .35s,border-color .35s}
.hp a.ind:before{content:"";position:absolute;inset:0 0 auto 0;height:2px;background:linear-gradient(90deg,var(--gold),transparent);transform:scaleX(0);transform-origin:left;transition:transform .5s}
.hp a.ind:hover{transform:translateY(-4px);box-shadow:0 30px 60px -35px rgba(22,27,36,.4);border-color:#d6c7ad}.hp a.ind:hover:before{transform:scaleX(1)}
.hp .ind .cc{font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold)}
.hp .ind h3{font-family:var(--serif),Georgia,serif;font-weight:500;font-size:25px;margin:10px 0 10px;line-height:1.2}
.hp .ind p{color:var(--soft);margin:0 0 22px;font-size:16px}.hp .ind .go{font-weight:600;font-size:15px}
.hp .ind .go i{font-style:normal;display:inline-block;transition:transform .3s}.hp a.ind:hover .go i{transform:translateX(5px)}

/* Vertrauen */
.hp .trust{background:var(--card);border-top:1px solid var(--line);border-bottom:1px solid var(--line)}
.hp .facts{display:grid;grid-template-columns:repeat(3,1fr);gap:0}
.hp .fact{padding:34px 32px 34px 0}.hp .fact:nth-child(3n+2),.hp .fact:nth-child(3n){padding-left:32px;border-left:1px solid var(--line)}
.hp .fact:nth-child(n+4){border-top:1px solid var(--line)}
.hp .seal{width:44px;height:44px;border-radius:50%;border:1px solid var(--gold);display:flex;align-items:center;justify-content:center;margin-bottom:18px}
.hp .seal svg{width:20px;height:20px;stroke:var(--gold);fill:none;stroke-width:1.5}
.hp .fact h3{font-family:var(--serif),Georgia,serif;font-weight:500;font-size:21px;margin:0 0 8px}
.hp .fact p{color:var(--soft);margin:0;font-size:15.5px}

/* Probe */
.hp .offer{background:var(--ink);color:#eef1f6;position:relative;overflow:hidden;isolation:isolate}
.hp .offer:before{content:"";position:absolute;inset:0;z-index:-1;background:radial-gradient(700px 400px at 85% 20%,rgba(176,141,87,.22),transparent 60%)}
.hp .offer .wrap{display:grid;grid-template-columns:1.2fr .8fr;gap:56px;align-items:center}
.hp .offer .intro{color:#b9c2d0;margin-bottom:0}
.hp .offer ol{list-style:none;counter-reset:o;margin:0;padding:0;display:grid;gap:16px}
.hp .offer ol li{counter-increment:o;display:grid;grid-template-columns:36px 1fr;gap:12px;color:#d5dbe5;font-size:16px}
.hp .offer ol li:before{content:counter(o);font-family:var(--serif),Georgia,serif;color:var(--gold2);font-size:22px;line-height:1.2}
.hp .offer .fine{animation:none}

/* Fragen */
.hp .faq{max-width:820px}
.hp details{border-bottom:1px solid var(--line);padding:22px 0}
.hp summary{cursor:pointer;list-style:none;display:flex;justify-content:space-between;gap:24px;font-family:var(--serif),Georgia,serif;font-size:21px}
.hp summary::-webkit-details-marker{display:none}
.hp summary:after{content:"+";color:var(--gold);font-family:var(--sans),sans-serif;font-size:24px;line-height:1;transition:transform .3s}
.hp details[open] summary:after{transform:rotate(45deg)}
.hp details p{color:var(--soft);margin:12px 0 0;max-width:720px}

/* Fußzeile */
.hp footer{background:var(--ink);color:#9aa6ba;padding:56px 0;font-size:14px}
.hp footer .wrap{display:flex;justify-content:space-between;gap:24px;flex-wrap:wrap;align-items:flex-end}
.hp footer .mark{font-size:24px}.hp footer address{font-style:normal;margin-top:10px;line-height:1.7}
.hp footer nav a{margin-left:22px;text-decoration:none;color:#c9d1de}.hp footer nav a:hover{color:#fff}

/* Einblenden beim Scrollen (nur mit JavaScript aktiv) */
.motion .hp [data-rv]{opacity:0;transform:translateY(26px);transition:opacity 1s cubic-bezier(.2,.7,.1,1),transform 1s cubic-bezier(.2,.7,.1,1)}
.motion .hp [data-rv].in{opacity:1;transform:none}
.motion .hp [data-rv="2"]{transition-delay:.12s}.motion .hp [data-rv="3"]{transition-delay:.24s}.motion .hp [data-rv="4"]{transition-delay:.36s}

@keyframes rise{from{transform:translateY(105%)}to{transform:none}}
@keyframes fade{from{opacity:0;transform:translateY(12px)}to{opacity:1;transform:none}}
@keyframes float-in{from{opacity:0;transform:translateY(30px) scale(.98)}to{opacity:1;transform:none}}
@keyframes slide{from{opacity:0;transform:translateY(-14px)}to{opacity:1;transform:none}}
@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(91,212,154,.55)}70%{box-shadow:0 0 0 10px rgba(91,212,154,0)}100%{box-shadow:0 0 0 0 rgba(91,212,154,0)}}
@keyframes scan{from{top:-140px}to{top:100%}}
@keyframes glow{from{transform:translate3d(0,0,0)}to{transform:translate3d(-3%,2%,0)}}
@keyframes marq{to{transform:translateX(-50%)}}
@media (prefers-reduced-motion:reduce){.hp *,.hp *:before,.hp *:after{animation:none!important;transition:none!important}}

@media (max-width:900px){
  .hp .hero .wrap,.hp .anat,.hp .offer .wrap{grid-template-columns:1fr;gap:40px}
  .hp .hero .wrap{padding-top:56px;padding-bottom:64px}
  .hp .stats{grid-template-columns:repeat(2,1fr)}.hp .stat:nth-child(3){border-left:0}.hp .stat:nth-child(n+3){border-top:1px solid var(--line)}
  .hp .steps{grid-template-columns:1fr 1fr;gap:40px 0}.hp .steps:before,.hp .steps:after{display:none}
  .hp .facts{grid-template-columns:1fr 1fr}.hp .fact,.hp .fact:nth-child(n){padding:28px 20px 28px 0;border-left:0;border-top:1px solid var(--line)}
  .hp .fact:nth-child(2n){padding-left:20px;border-left:1px solid var(--line)}
  .hp section{padding:80px 0}
}
@media (max-width:640px){
  .hp{font-size:16px}.hp .wrap{padding:0 18px}
  .hp .nav .links a:not(.pill){display:none}
  .hp .lede{font-size:17px}.hp .btn{width:100%;justify-content:center}
  .hp .band .row{flex-direction:column;align-items:flex-start;gap:12px}.hp .band .marquee{width:100%}
  .hp .stat{padding:26px 16px}.hp .steps{grid-template-columns:1fr}.hp .step{padding-right:0}
  .hp .facts{grid-template-columns:1fr}.hp .fact:nth-child(2n){padding-left:0;border-left:0}
  .hp .lead-card{padding:24px 20px}.hp .lead-card dl{grid-template-columns:1fr;gap:4px}.hp .lead-card dd{margin-bottom:10px}
  .hp section{padding:64px 0}.hp .intro{margin-bottom:36px;font-size:17px}
  .hp footer nav a{margin:0 18px 0 0}
}
`;

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
    <div className={`hp ${serif.variable} ${sans.variable}`} lang="en">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld) }} />
      <Motion />

      <header className="nav"><div className="wrap">
        <a className="mark" href="/">NextGen <i>Profit</i></a>
        <nav className="links" aria-label="Main">
          <a href="#method">Method</a><a href="#industries">Industries</a><a href="#trust">Why trust us</a>
          <a className="pill" href="#sample">Free sample</a>
        </nav>
      </div></header>

      <div className="hero" id="top">
        <div className="scan" aria-hidden="true" />
        <div className="wrap">
          <div>
            <div className="eyebrow" style={{ animation: "fade 1s both" }}>Trigger leads for B2B service firms</div>
            <h1>
              <span className="ln"><span>Reach companies</span></span>
              <span className="ln"><span>at the moment</span></span>
              <span className="ln"><span>they <em>need you.</em></span></span>
            </h1>
            <p className="lede">Every week we read official registers and company careers pages, find the businesses in your area with a real reason to buy, and send you a short list. Each lead with its date, its source and an opening line.</p>
            <div className="cta-row">
              <a className="btn gold" href="#sample">Get 10 free sample leads <span className="ar">→</span></a>
              {video && <a className="btn ghost" href="#film">Watch the film</a>}
            </div>
            <div className="fine"><span>Free of charge</span><span>No card</span><span>No subscription</span></div>
          </div>
          <div>
            <SignalFeed items={feed} label="Recently detected" />
            {feed.length > 0 && <p className="feed-note">Real examples from our current sample set. Company data only.</p>}
          </div>
        </div>
      </div>

      <div className="band"><div className="wrap row">
        <div className="lbl">Read daily from</div>
        <div className="marquee" aria-label={SOURCES.join(", ")}>
          <div className="track" aria-hidden="true">{[...SOURCES, ...SOURCES].map((s, i) => <span key={i}>{s}</span>)}</div>
        </div>
      </div></div>

      <section><div className="wrap">
        <div data-rv><div className="rule" /><div className="eyebrow">Our coverage</div>
          <h2>Built on public record, <em>checked every day.</em></h2></div>
        <div className="stats" data-rv="2">
          <div className="stat"><b data-count={18} data-suffix="M+">18M+</b><span>companies in the official registers of our markets</span></div>
          <div className="stat"><b data-count={YEARLY} data-suffix="+">{YEARLY.toLocaleString("en-GB")}+</b><span>new companies a year within our view</span></div>
          <div className="stat"><b data-count={stats.signals}>{stats.signals.toLocaleString("en-GB")}</b><span>dated signals recorded</span></div>
          <div className="stat"><b data-count={10}>10</b><span>free leads in every sample</span></div>
        </div>
        <p className="stats-note">Registers: 4.93 million companies on the UK Companies House register (March 2026) and 13.7 million active legal units in the French SIRENE register (INSEE). Signals are counted live from our database. The yearly figure is projected from the new registrations we currently record per day in the UK, US and France.</p>
      </div></section>

      {video && (
        <section className="video" id="film"><div className="wrap">
          <div data-rv><div className="rule" /><div className="eyebrow">The film</div>
            <h2>How it works, in {video.seconds} seconds.</h2>
            <p className="intro">An example for accountancy firms in the UK. The same process runs for every industry we serve.</p></div>
          {/* Eigenes Video, keine Drittanbieter, lädt erst beim Abspielen */}
          <div className="frame" data-rv="2"><video controls playsInline preload="none" poster={video.poster} src={video.src} /></div>
        </div></section>
      )}

      <section id="method"><div className="wrap">
        <div data-rv><div className="rule" /><div className="eyebrow">Method</div>
          <h2>From public record <em>to your next client.</em></h2>
          <p className="intro">We do the watching. You receive a short list you can act on the same morning.</p></div>
        <div className="steps" data-rv="2">
          {[["We read the sources", "Every day we check company registers, official notices and local careers pages."],
            ["We spot the moment", "A new registration, a role open for weeks, several hires at once. Each event is recorded with its date and source."],
            ["We filter and rate", "Only your areas, only relevant signals. Every lead is rated for freshness and relevance, weak ones are left out."],
            ["You get the list", "Every Monday: company, event, date, source and a suggested opening line. Each lead reaches you once."]]
            .map(([t, d], i) => <div className="step" key={t}><div className="n">{i + 1}</div><h3>{t}</h3><p>{d}</p></div>)}
        </div>
      </div></section>

      {example && (
        <section style={{ paddingTop: 0 }}><div className="wrap anat">
          <div className="lead-card" data-rv>
            <span className="tagx">Example from a real sample</span>
            <dl>
              <dt>Company</dt><dd className="big">{example.company}</dd>
              {example.place && <><dt>Location</dt><dd>{example.place}</dd></>}
              <dt>Event</dt><dd>{example.event}</dd>
              <dt>Date</dt><dd>{example.date}</dd>
              <dt>Source</dt><dd>{example.source}</dd>
              {example.urgency && <><dt>Priority</dt><dd style={{ textTransform: "capitalize" }}>{example.urgency}</dd></>}
              {example.opener && <><dt>Opening line</dt><dd className="quote">“{example.opener}”</dd></>}
            </dl>
          </div>
          <div data-rv="2">
            <div className="rule" /><div className="eyebrow">Anatomy of a lead</div>
            <h2>Everything you need <em>for the first call.</em></h2>
            <ul>
              <li><b>The reason to call</b><span>A concrete event, not a guess. You know why this company might need you now.</span></li>
              <li><b>Proof you can check</b><span>Date and official source on every line. Nothing to take on trust.</span></li>
              <li><b>A way in</b><span>A short opening line that refers to the event, ready for a call or an email.</span></li>
            </ul>
          </div>
        </div></section>
      )}

      <section id="industries" style={{ paddingTop: example ? 32 : undefined }}><div className="wrap">
        <div data-rv><div className="rule" /><div className="eyebrow">Industries</div>
          <h2>Signals chosen <em>for your line of work.</em></h2>
          <p className="intro">Each industry needs different moments. Choose yours to see what you would receive.</p></div>
        <div className="inds">
          {pages.map((p, i) => (
            <a className="ind" href={`/${p.slug}`} key={p.slug} data-rv={String((i % 3) + 1)}>
              <div className="cc">{p.country}</div><h3>{p.name}</h3>{p.blurb && <p>{p.blurb}</p>}
              <span className="go">See example leads <i>→</i></span>
            </a>))}
          {pages.length === 0 && <div className="ind"><h3>Coming soon</h3><p>Industry pages are being prepared.</p></div>}
        </div>
      </div></section>

      <section className="trust" id="trust"><div className="wrap">
        <div data-rv><div className="rule" /><div className="eyebrow">Why trust us</div>
          <h2>Facts you can <em>verify yourself.</em></h2>
          <p className="intro">No bought lists and no guesswork. Here is exactly how we work.</p></div>
        <div className="facts">
          {[["register", "Official sources only", "Companies House, state registers, official notices and the companies' own websites."],
            ["check", "Every lead verifiable", "Each entry carries the date of the event and the source it came from."],
            ["shield", "Company data only", "No personal data of employees. Operated from Hamburg, Germany, under the GDPR."],
            ["eye", "No scraping", "We never scrape LinkedIn, job boards or platforms whose terms forbid it."],
            ["gift", "Try before you decide", "Ten free leads from your area. No card, no subscription, no obligation."],
            ["pin", "A real company", `${BRAND}, Poststraße 14-16, 20354 Hamburg, Germany. Full details in our legal notice.`]]
            .map(([ic, t, d], i) => (
              <div className="fact" key={t} data-rv={String((i % 3) + 1)}>
                <div className="seal"><Icon d={ICONS[ic]} /></div><h3>{t}</h3><p>{d}</p>
              </div>))}
        </div>
      </div></section>

      <section className="offer" id="sample"><div className="wrap">
        <div data-rv>
          <div className="rule" /><div className="eyebrow">Free sample</div>
          <h2>See it for your area. <em>Ten leads, free.</em></h2>
          <p className="intro">Tell us what you offer and which area you cover. You receive ten current leads in the format of the weekly delivery.</p>
          <div className="cta-row" style={{ animation: "none" }}><a className="btn gold" href={mailto}>Request the sample by email <span className="ar">→</span></a></div>
          <div className="fine"><span>No charge</span><span>No card</span><span>No obligation</span></div>
        </div>
        <div data-rv="2">
          <ol>
            <li>You send us a short email with your company and your area.</li>
            <li>We prepare ten current leads from official sources for that area.</li>
            <li>You contact the companies that fit. Once you have, we ask briefly how it went.</li>
          </ol>
          <p className="feed-note" style={{ marginTop: 22 }}>Received an email from us? Use the link in it and your sample is one click away.</p>
        </div>
      </div></section>

      <section><div className="wrap faq">
        <div data-rv><div className="rule" /><div className="eyebrow">Questions</div><h2>Good to know.</h2></div>
        {FAQ.map((f) => <details key={f.q} data-rv><summary>{f.q}</summary><p>{f.a}</p></details>)}
      </div></section>

      <footer><div className="wrap">
        <div>
          <a className="mark" href="/">NextGen <i>Profit</i></a>
          <address>Poststraße 14-16 · 20354 Hamburg · Germany<br /><a href={`mailto:${CONTACT}`}>{CONTACT}</a></address>
        </div>
        <nav aria-label="Legal"><a href="/impressum">Legal notice</a><a href="/datenschutz">Privacy policy</a><a href="/agb">Terms</a></nav>
        <div style={{ width: "100%", marginTop: 8 }}>© {new Date().getFullYear()} {BRAND}</div>
      </div></footer>
    </div>
  );
}

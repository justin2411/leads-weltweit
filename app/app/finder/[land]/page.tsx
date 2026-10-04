import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { consentText } from "@/lib/consent";
import { wishesFor } from "@/content/sample-wishes";
import { BRAND, fitDesc, fitTitle } from "@/lib/site";
import { finderData } from "@/lib/finder-data";
import { FINDER_LANDS, FINDER_SLUG, FINDER_TEXT, finderDate, finderLand, finderLang, finderPlace, type FinderLand } from "@/lib/finder";
import { BrandShell, SiteFooter, SiteHeader } from "../../chrome";
import { SampleForm } from "../../sample-form";

/**
 * „Finde Firmen ohne Website in deinem Land“ – kostenloses Werkzeug für Webagenturen US/UK/FR (Auftrag 05.10.2026).
 * Zahl freigegebener, freier Anlässe (14 Tage) + 3 Beispiele (Firmenname, Anlass, Datum); der Rest über den
 * vorhandenen Probe-Ablauf der S2-Landingpage (Einwilligung, Proben-Vorrat). Kein Tracking, keine externen Ressourcen.
 */
export const dynamic = "force-dynamic";

type Params = Promise<{ land: string }>;

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const land = finderLand((await params).land);
  if (!land) return { robots: { index: false, follow: false } };
  const t = FINDER_TEXT[finderLang(land)];
  return {
    title: fitTitle(t.title(finderPlace(land)), BRAND), description: fitDesc(t.meta(finderPlace(land))),
    alternates: { canonical: `/finder/${land}` },
  };
}

const CSS = `
.bx .fd{background:var(--ink);color:#eef1f6;min-height:70vh}
.bx .fd .wrap{display:grid;grid-template-columns:1.1fr .9fr;gap:28px;align-items:stretch;padding-top:56px;padding-bottom:72px}
.bx .fd-card{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.1);border-radius:22px;padding:28px 30px;display:flex;flex-direction:column;min-width:0}
.bx .fd h1{font-size:clamp(28px,3.6vw,42px);line-height:1.1;letter-spacing:-.025em;margin:0 0 18px}
.bx .fd-tabs{display:inline-flex;gap:4px;padding:4px;border:1px solid rgba(255,255,255,.14);border-radius:99px;align-self:flex-start}
.bx .fd-tabs a{display:inline-grid;place-items:center;min-width:52px;padding:7px 14px;border-radius:99px;font-size:14px;font-weight:600;color:#9aa6ba;text-decoration:none;line-height:1}
.bx .fd-tabs a.on{background:linear-gradient(135deg,#e2c894,#b08d57);color:#141008}
.bx .fd-num{margin:26px 0 4px;font-size:clamp(44px,6vw,64px);font-weight:700;letter-spacing:-.03em;line-height:1;color:var(--gold2)}
.bx .fd-lbl{margin:0;color:#c9d0db;font-size:15.5px}
.bx .fd-ex{margin:28px 0 0;width:100%;border-collapse:collapse;font-size:14.5px}
.bx .fd-ex caption{text-align:left;font-size:12px;letter-spacing:.16em;text-transform:uppercase;color:var(--gold2);font-weight:600;padding-bottom:10px}
.bx .fd-ex th{text-align:left;font-weight:600;color:#8d98ab;font-size:12.5px;padding:0 10px 8px 0;border-bottom:1px solid rgba(255,255,255,.12)}
.bx .fd-ex td{padding:11px 10px 11px 0;border-bottom:1px solid rgba(255,255,255,.07);vertical-align:top;overflow-wrap:anywhere}
.bx .fd-ex td:last-child,.bx .fd-ex th:last-child{white-space:nowrap;text-align:right;padding-right:0}
.bx .fd-ex td:first-child{font-weight:600;color:#fff}
.bx .fd-none{margin:22px 0 0;color:#9aa6ba;font-size:14.5px}
.bx .fd-more{margin-top:auto;padding-top:22px;font-size:14px}
.bx .fd-more a{color:var(--gold2)}
.bx .fd-card h2{font-size:22px;letter-spacing:-.015em;line-height:1.2;margin:0 0 6px}
.bx .fd .pf{max-width:none}
@media (max-width:900px){.bx .fd .wrap{grid-template-columns:1fr;padding-top:32px;padding-bottom:48px}}
@media (max-width:520px){.bx .fd .wrap{padding-left:16px;padding-right:16px}.bx .fd-card{padding:22px 18px}.bx .fd .pf-row{grid-template-columns:1fr}}
`;

export default async function FinderPage({ params }: { params: Params }) {
  const land = finderLand((await params).land);
  if (!land) notFound();
  const lang = finderLang(land);
  const t = FINDER_TEXT[lang];
  const { count, examples } = await finderData(land);
  const slug = FINDER_SLUG[land];
  const tab = (l: FinderLand) => (
    <a key={l} href={`/finder/${l}`} className={l === land ? "on" : undefined} aria-current={l === land ? "page" : undefined}>{l.toUpperCase()}</a>
  );
  return (
    <BrandShell lang={lang} extraCss={CSS}>
      <SiteHeader />
      <div className="fd" role="main">
        <div className="wrap">
          <section className="fd-card" aria-labelledby="fd-title">
            <h1 id="fd-title">{t.title(finderPlace(land))}</h1>
            <nav className="fd-tabs" aria-label={lang === "fr" ? "Pays" : "Country"}>{FINDER_LANDS.map(tab)}</nav>
            {count === null ? <p className="fd-none">{t.none}</p> : <>
              <p className="fd-num">{count.toLocaleString(lang === "fr" ? "fr-FR" : "en-US")}</p>
              <p className="fd-lbl">{t.count}</p>
            </>}
            {examples.length > 0 ? (
              <table className="fd-ex">
                <caption>{t.examples}</caption>
                <thead><tr><th scope="col">{t.company}</th><th scope="col">{t.event}</th><th scope="col">{t.date}</th></tr></thead>
                <tbody>{examples.map((e) => (
                  <tr key={e.name + e.date}><td>{e.name}</td><td>{t.sig[e.signal] ?? e.signal}</td><td>{finderDate(e.date, lang)}</td></tr>
                ))}</tbody>
              </table>
            ) : count !== null && <p className="fd-none">{t.noEx}</p>}
            <p className="fd-more"><a href={`/${slug}`}>{t.back}</a></p>
          </section>
          <section className="fd-card" id="probe" aria-labelledby="fd-rest">
            <h2 id="fd-rest">{t.rest}</h2>
            <SampleForm lang={lang} field="slug" options={[{ value: slug, label: slug, wishes: wishesFor("web-agencies").map((w) => ({ key: w.key, label: w[lang] })) }]}
              consent={consentText(lang)} privacyHref={lang === "fr" ? "/confidentialite" : "/privacy"} />
          </section>
        </div>
      </div>
      <SiteFooter lang={lang} />
    </BrandShell>
  );
}

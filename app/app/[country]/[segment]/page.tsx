import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { consentText, t } from "@/lib/consent";
import VIDEOS from "@/content/videos.json";
import { getSettings, isOwner, loadPage, pageIsPublic } from "@/lib/pages";
import { BRAND, CONTACT, siteUrl } from "@/lib/site";
import { checkoutMode, lineItemFor, priceLabel, stripeEnabled, type Plan } from "@/lib/stripe";
import { fill, fillDeep, type Personal } from "@/lib/personalize";
import { personalFor } from "@/lib/recipient";
import { db } from "@/lib/supabase";
import { pickVariant } from "@/lib/variants";
import { Tracker } from "./tracker";
import type { CSSProperties } from "react";
import { BrandShell, SiteFooter, SiteHeader, Words } from "../../chrome";
import { HeroNet } from "../../motion";

export const dynamic = "force-dynamic";

type Params = Promise<{ country: string; segment: string }>;
type Search = Promise<{ vorschau?: string; v?: string; angefragt?: string; fehler?: string; r?: string; schritt?: string }>;

type Sample = { company: string; location?: string; event: string; date?: string; source?: string };

/** Echte Probe-Leads aus der Region des Empfängers (Firmendaten, als Beispiel markiert). */
async function regionalSamples(page: { segment_id: string; country: string }, region: string | undefined): Promise<Sample[]> {
  if (!region) return [];
  const { data } = await db().from("leads")
    .select("event_summary, event_date, source_name, watch_companies!inner(name, city, region)")
    .eq("segment_id", page.segment_id).eq("country", page.country).in("status", ["sample", "new"])
    .or(`region.ilike.%${region.replace(/[%,()]/g, "")}%,city.ilike.%${region.replace(/[%,()]/g, "")}%`, { foreignTable: "watch_companies" })
    .order("event_date", { ascending: false }).limit(5);
  return (data ?? []).map((l: any) => ({ company: l.watch_companies.name, location: l.watch_companies.city ?? undefined,
    event: String(l.event_summary).slice(0, 160), date: l.event_date ?? undefined, source: l.source_name }));
}

async function resolve(params: Params, searchParams: Search) {
  const { country, segment } = await params;
  const sp = await searchParams;
  const slug = `${country}/${segment}`.toLowerCase();
  if (!/^[a-z]{2}\/[a-z0-9-]+$/.test(slug)) return null;
  const [data, settings] = await Promise.all([loadPage(slug), getSettings()]);
  if (!data) return null;
  const isPublic = pageIsPublic(data.page, settings);
  const preview = !isPublic && sp.vorschau === "1" && (await isOwner());
  if (!isPublic && !preview) return null;
  const candidates = data.variants.filter((v: any) => (preview ? v.status !== "retired" : v.status === "live"));
  const variant = (preview && sp.v && candidates.find((v: any) => v.variant_key === sp.v)) || pickVariant(candidates);
  if (!variant) return null;
  return { ...data, variant, settings, preview, isPublic, sp, slug };
}

export async function generateMetadata({ params, searchParams }: { params: Params; searchParams: Search }): Promise<Metadata> {
  const r = await resolve(params, searchParams);
  if (!r) return { robots: { index: false, follow: false } };
  return {
    title: `${fill(r.variant.headline, {}, r.page.language)} | ${BRAND}`,
    description: r.variant.subheadline ? fill(r.variant.subheadline, {}, r.page.language) : undefined,
    alternates: { canonical: `${siteUrl()}/${r.slug}` },
    robots: r.isPublic ? { index: true, follow: true } : { index: false, follow: false },
  };
}


export default async function LandingPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const r = await resolve(params, searchParams);
  if (!r) notFound();
  const { page, variant: v, settings, preview, sp } = r;
  const L = t(page.language);
  const plans = (v.pricing ?? settings.pricing ?? []) as Plan[];
  const mode = checkoutMode({ vercelEnv: process.env.VERCEL_ENV, ownerPreview: preview });
  const buyable = plans.filter((p) => lineItemFor(p, mode, BRAND));
  const canBuy = stripeEnabled(mode) && buyable.length > 0;
  const personal = preview && !sp.r ? null : await personalFor(sp.r, page);
  const P: Personal = personal ?? {};
  const lang = page.language;
  const regional = await regionalSamples(page, personal?.region);
  const samples = regional.length >= 3 ? regional : ((v.sample_leads ?? []) as Sample[]);
  const nd = (x: string) => x.replace(/\s+[–—]\s+/g, ", ");
  const signals = fillDeep((v.signals ?? []) as { title: string; text: string }[], P, lang);
  const faq = fillDeep((v.faq ?? []) as { q: string; a: string }[], P, lang);
  const headline = nd(fill(v.headline, P, lang));
  const subheadline = v.subheadline ? nd(fill(v.subheadline, P, lang)) : null;
  const cta = fill(v.cta_label, P, lang);
  const video = (VIDEOS as Record<string, { src: string; poster: string; seconds: number }>)[page.slug];
  // Kein Formular: Knopf -> zweiter Schritt (Bedingungen) -> ein Klick sendet die Probe. Adresse kommt aus dem Mail-Link.
  const known = Boolean(personal?.email && personal.firma);
  const keep = [preview && `vorschau=1&v=${v.variant_key}`, sp.r && /^[A-Za-z0-9_-]{8,80}$/.test(sp.r) && `r=${sp.r}`].filter(Boolean).join("&");
  const stepHref = `?${[keep, "schritt=probe"].filter(Boolean).join("&")}#probe`;
  const backHref = `?${keep}#top`;
  const step = sp.schritt === "probe" && !sp.angefragt;
  const mailto = `mailto:${CONTACT}?subject=${encodeURIComponent(`${L.mailSubject}: ${page.slug}`)}&body=${encodeURIComponent(L.mailBody)}`;
  const i = (n: number) => ({ "--i": n }) as CSSProperties;
  const fr = lang === "fr";
  const Probe = () => (
    <div className="panel" id="probe">
      <h2>{L.stepTitle}</h2>
      <ul className="ticks">
        <li><b>{L.free}</b> {L.freeText}</li>
        <li><b>{L.noObl}</b> {L.noOblText}</li>
        <li>{known ? L.sendsTo(personal!.gebiet, personal!.email!) : L.sendsToUnknown}</li>
        <li>{L.followUp}</li>
      </ul>
      {known ? (
        <form method="post" action="/api/sample-request">
          <input type="hidden" name="variant_id" value={v.id} />
          {preview && <input type="hidden" name="vorschau" value="1" />}
          <input type="hidden" name="r" value={sp.r} />
          <div className="cta-row" style={{ marginTop: 6 }}><button className="btn gold big mag" type="submit" name="consent" value="yes" data-cta>{L.confirm} <span className="ar">→</span></button>
            <a className="btn ghost" href={backHref}>{L.back}</a></div>
          <p className="small">{consentText(lang)} <a href="/datenschutz">{L.legal[1]}</a></p>
        </form>
      ) : (
        <div className="cta-row" style={{ marginTop: 6 }}><a className="btn gold big mag" href={mailto} data-cta>{L.byMail} <span className="ar">→</span></a><a className="btn ghost" href={backHref}>{L.back}</a></div>
      )}
    </div>
  );
  const Start = ({ label }: { label: string }) => <a className="btn gold big mag" href={stepHref} data-cta>{label} <span className="ar">→</span></a>;
  const Head = ({ eyebrow, title }: { eyebrow: string; title: string }) => (
    <div data-rv><div className="rule" /><div className="eyebrow">{eyebrow}</div><h2 className="rvw" data-rv><Words text={title} /></h2></div>
  );

  return (
    <BrandShell lang={page.language}>
      {preview && <div className="banner">VORSCHAU (nicht öffentlich) · Seite {page.status} · Variante {v.variant_key} ({v.status}) · keine Ereignisse gezählt</div>}
      <Tracker variantId={v.id} enabled={!preview} />
      <SiteHeader links={video ? [["#video", fr ? "Vidéo" : "Film"]] : []} cta={[stepHref, fr ? "Échantillon gratuit" : "Free sample"]} />

      <div className="hero solo" id="top">
        <HeroNet />
        <div className="spot" aria-hidden="true" />
        <div className="wrap">
          {personal?.firma && <div className="for later" style={{ "--d": ".05s" } as CSSProperties}>{fr ? `Préparé pour ${personal.firma}` : `Prepared for ${personal.firma}`}</div>}
          <h1><Words text={headline} /></h1>
          {subheadline && <p className="lede later" style={{ "--d": ".7s" } as CSSProperties}>{subheadline}</p>}
          {sp.angefragt ? <p className="ok">{known ? L.thanksTo(personal!.email!) : L.thanks}</p>
            : sp.fehler ? <p className="err">{L.error}</p> : null}
          {step ? <Probe /> : !sp.angefragt && (
            <div className="cta-row later" style={{ "--d": ".9s" } as CSSProperties}><Start label={known ? L.send : cta} />{canBuy && <a className="btn ghost mag" href="#plans" data-cta>{L.subscribe}</a>}</div>
          )}
          {!step && !sp.angefragt && <div className="fine later" style={{ "--d": "1.05s" } as CSSProperties}><span>{L.free.replace(/\.$/, "")}</span><span>{L.noObl.replace(/\.$/, "")}</span></div>}
        </div>
      </div>

      {video && (
        <section className="dark" id="video"><div className="wrap">
          <Head eyebrow={fr ? "Le film" : "The film"} title={L.video(video.seconds)} />
          {/* Eigenes Video, keine Drittanbieter, lädt erst beim Abspielen */}
          <div className="frame" data-rv><video controls playsInline preload="none" poster={video.poster} src={video.src} /></div>
        </div></section>
      )}

      {signals.length > 0 && (
        <section><div className="wrap"><Head eyebrow={fr ? "Signaux" : "Signals"} title={L.what} />
          <div className="cards">{signals.map((sg, k) => <div className="card glow lift" key={k} data-rv style={i(k)}><h3>{nd(sg.title)}</h3><p>{nd(sg.text)}</p></div>)}</div>
        </div></section>
      )}

      {samples.length > 0 && (
        <section className="tinted"><div className="wrap"><Head eyebrow={fr ? "Exemples" : "Examples"} title={L.examples} />
          <p className="intro" style={{ marginTop: -30 }}>{L.examplesNote}</p>
          <div className="leads">{samples.map((sm, k) => (
            <div className="lead" key={k} data-rv style={i(k)}>
              <span className="tag">{L.example}</span><span className="co">{sm.company}{sm.location ? `, ${sm.location}` : ""}</span>
              <div>{nd(sm.event)}</div>
              <div className="meta">{[sm.date, sm.source && `${L.source}: ${sm.source}`].filter(Boolean).join(" · ")}</div>
            </div>))}</div>
        </div></section>
      )}

      <section><div className="wrap"><Head eyebrow={fr ? "Méthode" : "Method"} title={L.how} />
        <div className="steps three" data-rv>{L.steps.map((st, k) => <div className="step" key={k} style={i(k)}><div className="n">{k + 1}</div><p style={{ marginTop: 22 }}>{st}</p></div>)}</div>
      </div></section>

      {canBuy && (
        <section id="plans" className="tinted"><div className="wrap"><Head eyebrow={fr ? "Offres" : "Plans"} title={L.pricing} />
          {mode === "test" && <p className="note">Stripe-Testmodus: keine echte Zahlung (Testkarte 4242 4242 4242 4242).</p>}
          <div className="cards">{buyable.map((pl, k) => (
            <form className="card glow lift" key={pl.key} method="post" action="/api/checkout" data-rv style={i(k)}>
              <h3>{pl.name}</h3><div className="price">{priceLabel(pl)} <small>{L.perMonth}</small></div>{pl.description && <p className="note">{pl.description}</p>}
              <input type="hidden" name="variant_id" value={v.id} /><input type="hidden" name="package" value={pl.key} />
              {preview && <input type="hidden" name="vorschau" value="1" />}
              <button className="btn gold" style={{ marginTop: 18 }} type="submit" data-cta>{L.subscribe}</button>
            </form>))}</div>
        </div></section>
      )}

      {!step && !sp.angefragt && (
        <section className="offer" id="sample"><div className="wrap">
          <div><Head eyebrow={fr ? "Échantillon gratuit" : "Free sample"} title={L.sampleTitle} />
            <p className="intro">{known ? L.sendsTo(personal!.gebiet, personal!.email!) : L.sendsToUnknown}</p>
            <div className="cta-row" data-rv><Start label={L.send} /></div>
            <div className="fine"><span>{L.free.replace(/\.$/, "")}</span><span>{L.noObl.replace(/\.$/, "")}</span></div>
          </div>
          <div data-rv><ol className="olist">{L.steps.map((st, k) => <li key={k}>{st}</li>)}</ol></div>
        </div></section>
      )}

      {faq.length > 0 && (
        <section><div className="wrap faq"><Head eyebrow={fr ? "Questions" : "Questions"} title={L.faq} />
          {faq.map((f, k) => <details key={k} data-rv style={i(k)}><summary>{nd(f.q)}</summary><p>{nd(f.a)}</p></details>)}
        </div></section>
      )}

      <SiteFooter labels={L.legal} />
    </BrandShell>
  );
}

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

const css = `
.lp{--ink:#0f1b2d;--soft:#51607a;--brand:#1d4ed8;--line:#e2e8f0;--tint:#f5f8ff;color:var(--ink);background:#fff;font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}
@media (prefers-color-scheme:dark){.lp{--ink:#e8edf6;--soft:#a3b0c6;--brand:#7aa2ff;--line:#2a3345;--tint:#141b28;background:#0c111b}}
.lp .wrap{max-width:1040px;margin:0 auto;padding:0 16px}.lp header{padding:18px 0;border-bottom:1px solid var(--line)}
.lp .mark{font-weight:800;letter-spacing:.02em}.lp .hero{padding-top:56px;padding-bottom:40px}
.lp .for{display:inline-block;font-size:13px;font-weight:600;color:var(--brand);border:1px solid var(--brand);border-radius:99px;padding:3px 12px;margin-bottom:14px}
.lp .samples{display:grid;gap:12px}.lp .sample{border:1px solid var(--line);border-radius:10px;padding:14px 16px;background:var(--tint)}
.lp .sample .co{font-weight:700}.lp .sample .meta{color:var(--soft);font-size:13px;margin-top:6px}
@media (max-width:640px){.lp .wrap{padding:0 20px}.lp .hero{padding-top:32px;padding-bottom:28px}.lp h1{font-size:28px}
.lp .sub{font-size:17px}.lp .btn{display:block;width:100%;text-align:center}.lp section{padding:28px 0}.lp .card{padding:14px}
.lp footer a{display:inline-block;margin:0 16px 8px 0}}.lp h1{font-size:clamp(28px,4.5vw,44px);line-height:1.15;margin:0 0 14px}
.lp .sub{font-size:19px;color:var(--soft);max-width:720px}.lp .btns{display:flex;gap:12px;flex-wrap:wrap;margin-top:24px}
.lp .btn{display:inline-block;padding:12px 20px;border-radius:8px;font-weight:600;text-decoration:none;border:1px solid var(--brand)}
.lp .btn.pri{background:var(--brand);color:#fff}.lp .btn.sec{color:var(--brand)}
.lp section{padding:36px 0;border-top:1px solid var(--line)}.lp h2{font-size:24px;margin:0 0 16px}
.lp .grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:16px}.lp .card{background:var(--tint);border:1px solid var(--line);border-radius:10px;padding:16px}
.lp .card h3{margin:0 0 6px;font-size:17px}.lp .note{color:var(--soft);font-size:14px}.lp table{width:100%;border-collapse:collapse;font-size:14px}
.lp th,.lp td{text-align:left;padding:8px;border-bottom:1px solid var(--line);vertical-align:top}.lp .scroll{overflow-x:auto}
.lp .tag{display:inline-block;font-size:12px;padding:2px 8px;border-radius:99px;background:var(--brand);color:#fff}
.lp .step{margin-top:24px;max-width:640px;border:2px solid var(--brand);border-radius:14px;padding:22px 24px;background:var(--tint)}
.lp .step h2{margin:0 0 12px}.lp .checks{list-style:none;padding:0;margin:0 0 18px;display:grid;gap:10px}
.lp .checks li{padding-left:30px;position:relative}.lp .checks li:before{content:"✓";position:absolute;left:0;color:#15803d;font-weight:800}
.lp .step .btns{margin-top:6px}.lp .step .small{margin-top:14px}.lp .done{font-size:19px;margin-top:22px}
.lp .small{font-size:13px;color:var(--soft);margin:0}
.lp .btn.big{font-size:18px;padding:14px 24px;cursor:pointer}
.lp .vid{width:100%;max-width:960px;aspect-ratio:16/9;border-radius:12px;background:#0a1324;display:block}
.lp footer{padding:28px 0;border-top:1px solid var(--line);color:var(--soft);font-size:14px}.lp footer a{color:inherit;margin-right:16px}
.lp .banner{background:#b91c1c;color:#fff;padding:10px 16px;font-weight:600}.lp .ok{color:#15803d;font-weight:600}.lp .err{color:#b91c1c;font-weight:600}
.lp details{border-bottom:1px solid var(--line);padding:10px 0}.lp summary{cursor:pointer;font-weight:600}
`;

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
  const signals = fillDeep((v.signals ?? []) as { title: string; text: string }[], P, lang);
  const faq = fillDeep((v.faq ?? []) as { q: string; a: string }[], P, lang);
  const headline = fill(v.headline, P, lang);
  const subheadline = v.subheadline ? fill(v.subheadline, P, lang) : null;
  const cta = fill(v.cta_label, P, lang);
  const video = (VIDEOS as Record<string, { src: string; poster: string; seconds: number }>)[page.slug];
  // Kein Formular: Knopf -> zweiter Schritt (Bedingungen) -> ein Klick sendet die Probe. Adresse kommt aus dem Mail-Link.
  const known = Boolean(personal?.email && personal.firma);
  const keep = [preview && `vorschau=1&v=${v.variant_key}`, sp.r && /^[A-Za-z0-9_-]{8,80}$/.test(sp.r) && `r=${sp.r}`].filter(Boolean).join("&");
  const stepHref = `?${[keep, "schritt=probe"].filter(Boolean).join("&")}#probe`;
  const backHref = `?${keep}#top`;
  const step = sp.schritt === "probe" && !sp.angefragt;
  const mailto = `mailto:${CONTACT}?subject=${encodeURIComponent(`${L.mailSubject} – ${page.slug}`)}&body=${encodeURIComponent(L.mailBody)}`;
  const Probe = () => (
    <div className="step" id="probe">
      <h2>{L.stepTitle}</h2>
      <ul className="checks">
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
          <div className="btns"><button className="btn pri big" type="submit" name="consent" value="yes" data-cta>{L.confirm}</button>
            <a className="btn sec" href={backHref}>{L.back}</a></div>
          <p className="small">{consentText(lang)} <a href="/datenschutz">{L.legal[1]}</a></p>
        </form>
      ) : (
        <div className="btns"><a className="btn pri big" href={mailto} data-cta>{L.byMail}</a><a className="btn sec" href={backHref}>{L.back}</a></div>
      )}
    </div>
  );
  const Start = ({ label }: { label: string }) => <a className="btn pri big" href={stepHref} data-cta>{label}</a>;

  return (
    <div className="lp" lang={page.language} id="top">
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {preview && <div className="banner">VORSCHAU (nicht öffentlich) · Seite {page.status} · Variante {v.variant_key} ({v.status}) · keine Ereignisse gezählt</div>}
      <Tracker variantId={v.id} enabled={!preview} />
      <header><div className="wrap"><span className="mark">{BRAND}</span></div></header>

      <div className="wrap hero">
        {personal?.firma && <div className="for">{lang === "fr" ? `Préparé pour ${personal.firma}` : `Prepared for ${personal.firma}`}</div>}
        <h1>{headline}</h1>
        {subheadline && <p className="sub">{subheadline}</p>}
        {sp.angefragt ? <p className="ok done">{known ? L.thanksTo(personal!.email!) : L.thanks}</p>
          : sp.fehler ? <p className="err">{L.error}</p> : null}
        {step ? <Probe /> : !sp.angefragt && (
          <div className="btns"><Start label={known ? L.send : cta} />{canBuy && <a className="btn sec" href="#plans" data-cta>{L.subscribe}</a>}</div>
        )}
      </div>

      {video && (
        <section id="video"><div className="wrap"><h2>{L.video(video.seconds)}</h2>
          {/* Eigenes Video, keine Drittanbieter, lädt erst beim Abspielen */}
          <video className="vid" controls playsInline preload="none" poster={video.poster} src={video.src} />
        </div></section>
      )}

      {signals.length > 0 && (
        <section><div className="wrap"><h2>{L.what}</h2>
          <div className="grid">{signals.map((s, i) => <div className="card" key={i}><h3>{s.title}</h3><p>{s.text}</p></div>)}</div>
        </div></section>
      )}

      {samples.length > 0 && (
        <section><div className="wrap"><h2>{L.examples}</h2><p className="note">{L.examplesNote}</p>
          <div className="samples">{samples.map((s, i) => (
            <div className="sample" key={i}>
              <span className="tag">{L.example}</span>{" "}<span className="co">{s.company}{s.location ? `, ${s.location}` : ""}</span>
              <div>{s.event}</div>
              <div className="meta">{[s.date, s.source && `${L.source}: ${s.source}`].filter(Boolean).join(" · ")}</div>
            </div>))}</div>
        </div></section>
      )}

      <section><div className="wrap"><h2>{L.how}</h2>
        <div className="grid">{L.steps.map((s, i) => <div className="card" key={i}><h3>{i + 1}.</h3><p>{s}</p></div>)}</div>
      </div></section>

      {canBuy && (
        <section id="plans"><div className="wrap"><h2>{L.pricing}</h2>
          {mode === "test" && <p className="note">Stripe-Testmodus: keine echte Zahlung (Testkarte 4242 4242 4242 4242).</p>}
          <div className="grid">{buyable.map((p) => (
            <form className="card" key={p.key} method="post" action="/api/checkout">
              <h3>{p.name}</h3><p><strong>{priceLabel(p)}</strong> {L.perMonth}</p>{p.description && <p className="note">{p.description}</p>}
              <input type="hidden" name="variant_id" value={v.id} /><input type="hidden" name="package" value={p.key} />
              {preview && <input type="hidden" name="vorschau" value="1" />}
              <button className="btn pri" type="submit" data-cta>{L.subscribe}</button>
            </form>))}</div>
        </div></section>
      )}

      {!step && !sp.angefragt && (
        <section id="sample"><div className="wrap"><h2>{L.sampleTitle}</h2>
          <p>{L.free} · {L.noObl} · {known ? L.sendsTo(personal!.gebiet, personal!.email!) : L.sendsToUnknown}</p>
          <div className="btns"><Start label={L.send} /></div>
        </div></section>
      )}

      {faq.length > 0 && (
        <section><div className="wrap"><h2>{L.faq}</h2>
          {faq.map((f, i) => <details key={i}><summary>{f.q}</summary><p>{f.a}</p></details>)}
        </div></section>
      )}

      <footer><div className="wrap">
        <a href="/impressum">{L.legal[0]}</a><a href="/datenschutz">{L.legal[1]}</a><a href="/agb">{L.legal[2]}</a>
        <span>© {new Date().getFullYear()} {BRAND}</span>
      </div></footer>
    </div>
  );
}

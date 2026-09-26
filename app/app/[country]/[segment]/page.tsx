import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { consentText, t } from "@/lib/consent";
import { getSettings, isOwner, loadPage, pageIsPublic } from "@/lib/pages";
import { BRAND, siteUrl } from "@/lib/site";
import { checkoutMode, lineItemFor, priceLabel, stripeEnabled, type Plan } from "@/lib/stripe";
import { cleanFirm, fill, fillDeep, splitRegion, type Personal } from "@/lib/personalize";
import { db } from "@/lib/supabase";
import { pickVariant } from "@/lib/variants";
import { Tracker } from "./tracker";

export const dynamic = "force-dynamic";

type Params = Promise<{ country: string; segment: string }>;
type Search = Promise<{ vorschau?: string; v?: string; angefragt?: string; fehler?: string; r?: string }>;

type Sample = { company: string; location?: string; event: string; date?: string; source?: string };

/** Persönliche Angaben aus dem Mail-Link (?r=<Token der Mail>) – nur wenn die Mail zu dieser Zielgruppe gehört. */
type Recipient = Personal & { email?: string; gebiet?: string };

async function personalFor(token: string | undefined, page: { segment_id: string; country: string }): Promise<Recipient | null> {
  if (!token || !/^[A-Za-z0-9_-]{8,80}$/.test(token)) return null;
  const { data } = await db().from("messages").select("to_email, prospects(company_name, region, specialization, segment_id, country)")
    .eq("unsubscribe_token", token).maybeSingle();
  const p: any = data?.prospects;
  if (!p || p.segment_id !== page.segment_id || p.country !== page.country) return null;
  const { ort, region } = splitRegion(p.region);
  const gebiet = [ort, region].filter((x, i, a) => x && a.indexOf(x) === i).join(", ") || undefined;
  return { firma: cleanFirm(p.company_name), ort, region, branche: p.specialization ?? undefined,
    email: data?.to_email ?? undefined, gebiet };
}

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
.lp form{display:grid;gap:12px;max-width:560px}.lp label{display:grid;gap:4px;font-size:14px;font-weight:600}
.lp input[type=text],.lp input[type=email]{padding:10px 12px;border:1px solid var(--line);border-radius:8px;font:inherit;background:transparent;color:inherit}
.lp .grid1{display:grid;gap:12px;margin-top:10px}.lp .small{font-size:13px;color:var(--soft);margin:0}
.lp .btn.big{font-size:18px;padding:14px 24px;cursor:pointer}.lp .quick{margin-top:24px;max-width:560px}
.lp details.fields{border:0;padding:0}.lp .hp{position:absolute;left:-9999px}
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
  // Mail-Empfänger mit bekannter Adresse: ein Klick genügt, alles ist vorausgefüllt (Angaben änderbar).
  const oneClick = Boolean(personal?.email && personal.firma && !sp.angefragt);
  const SampleHidden = () => (<>
    <input type="hidden" name="variant_id" value={v.id} />
    {preview && <input type="hidden" name="vorschau" value="1" />}
    {sp.r && <input type="hidden" name="r" value={sp.r} />}
    <input type="hidden" name="company" value={personal?.firma ?? ""} />
    <input type="hidden" name="email" value={personal?.email ?? ""} />
    <input type="hidden" name="region" value={personal?.gebiet ?? ""} />
  </>);

  return (
    <div className="lp" lang={page.language}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {preview && <div className="banner">VORSCHAU (nicht öffentlich) · Seite {page.status} · Variante {v.variant_key} ({v.status}) · keine Ereignisse gezählt</div>}
      <Tracker variantId={v.id} enabled={!preview} />
      <header><div className="wrap"><span className="mark">{BRAND}</span></div></header>

      <div className="wrap hero">
        {personal?.firma && <div className="for">{lang === "fr" ? `Préparé pour ${personal.firma}` : `Prepared for ${personal.firma}`}</div>}
        <h1>{headline}</h1>
        {subheadline && <p className="sub">{subheadline}</p>}
        {oneClick ? (
          <form className="quick" method="post" action="/api/sample-request">
            <SampleHidden />
            <button className="btn pri big" type="submit" name="consent" value="yes" data-cta>{L.send}</button>
            <p className="small">{L.sendTo(personal!.email!)} {consentText(lang)} <a href="/datenschutz">{L.legal[1]}</a></p>
          </form>
        ) : (
          <div className="btns">
            <a className="btn pri" href="#sample" data-cta>{cta}</a>
            {canBuy && <a className="btn sec" href="#plans" data-cta>{L.subscribe}</a>}
          </div>
        )}
      </div>

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

      <section id="sample"><div className="wrap"><h2>{L.sampleTitle}</h2>
        {sp.angefragt && <p className="ok">{L.thanks}</p>}
        {sp.fehler && <p className="err">{L.error}</p>}
        <form method="post" action="/api/sample-request">
          <input type="hidden" name="variant_id" value={v.id} />
          {preview && <input type="hidden" name="vorschau" value="1" />}
          {personal && sp.r && <input type="hidden" name="r" value={sp.r} />}
          <label className="hp" aria-hidden="true">Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
          {oneClick && <p>{L.sendTo(personal!.email!)}</p>}
          <details className="fields" open={!oneClick}>
            {oneClick && <summary>{L.change}</summary>}
            <div className="grid1">
              <label>{L.company}<input type="text" name="company" required maxLength={200} defaultValue={personal?.firma ?? ""} /></label>
              <label>{L.email}<input type="email" name="email" required maxLength={200} defaultValue={personal?.email ?? ""} /></label>
              <label>{L.region}<input type="text" name="region" maxLength={200} defaultValue={personal?.gebiet ?? ""} /></label>
            </div>
          </details>
          <button className="btn pri big" type="submit" name="consent" value="yes" data-cta>{L.send}</button>
          <p className="small">{consentText(lang)} <a href="/datenschutz">{L.legal[1]}</a></p>
        </form>
      </div></section>

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

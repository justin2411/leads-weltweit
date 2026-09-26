import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { consentText, t } from "@/lib/consent";
import { getSettings, isOwner, loadPage, pageIsPublic } from "@/lib/pages";
import { BRAND, siteUrl } from "@/lib/site";
import { stripeEnabled } from "@/lib/stripe";
import { pickVariant } from "@/lib/variants";
import { Tracker } from "./tracker";

export const dynamic = "force-dynamic";

type Params = Promise<{ country: string; segment: string }>;
type Search = Promise<{ vorschau?: string; v?: string; angefragt?: string; fehler?: string }>;

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
    title: `${r.variant.headline} | ${BRAND}`,
    description: r.variant.subheadline ?? undefined,
    alternates: { canonical: `${siteUrl()}/${r.slug}` },
    robots: r.isPublic ? { index: true, follow: true } : { index: false, follow: false },
  };
}

const css = `
.lp{--ink:#0f1b2d;--soft:#51607a;--brand:#1d4ed8;--line:#e2e8f0;--tint:#f5f8ff;color:var(--ink);background:#fff;font:16px/1.6 system-ui,-apple-system,Segoe UI,sans-serif}
@media (prefers-color-scheme:dark){.lp{--ink:#e8edf6;--soft:#a3b0c6;--brand:#7aa2ff;--line:#2a3345;--tint:#141b28;background:#0c111b}}
.lp .wrap{max-width:1040px;margin:0 auto;padding:0 16px}.lp header{padding:18px 0;border-bottom:1px solid var(--line)}
.lp .mark{font-weight:800;letter-spacing:.02em}.lp .hero{padding:56px 0 40px}.lp h1{font-size:clamp(28px,4.5vw,44px);line-height:1.15;margin:0 0 14px}
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
.lp .consent{display:flex;gap:8px;font-weight:400;align-items:flex-start}.lp .hp{position:absolute;left:-9999px}
.lp footer{padding:28px 0;border-top:1px solid var(--line);color:var(--soft);font-size:14px}.lp footer a{color:inherit;margin-right:16px}
.lp .banner{background:#b91c1c;color:#fff;padding:10px 16px;font-weight:600}.lp .ok{color:#15803d;font-weight:600}.lp .err{color:#b91c1c;font-weight:600}
.lp details{border-bottom:1px solid var(--line);padding:10px 0}.lp summary{cursor:pointer;font-weight:600}
`;

export default async function LandingPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const r = await resolve(params, searchParams);
  if (!r) notFound();
  const { page, variant: v, settings, preview, sp } = r;
  const L = t(page.language);
  const plans = (v.pricing ?? settings.pricing ?? []) as NonNullable<typeof settings.pricing>;
  const canBuy = stripeEnabled() && plans.length > 0 && !preview;
  const samples = (v.sample_leads ?? []) as { company: string; location?: string; event: string; date?: string; source?: string }[];
  const signals = (v.signals ?? []) as { title: string; text: string }[];
  const faq = (v.faq ?? []) as { q: string; a: string }[];

  return (
    <div className="lp" lang={page.language}>
      <style dangerouslySetInnerHTML={{ __html: css }} />
      {preview && <div className="banner">VORSCHAU (nicht öffentlich) · Seite {page.status} · Variante {v.variant_key} ({v.status}) · keine Ereignisse gezählt</div>}
      <Tracker variantId={v.id} enabled={!preview} />
      <header><div className="wrap"><span className="mark">{BRAND}</span></div></header>

      <div className="wrap hero">
        <h1>{v.headline}</h1>
        {v.subheadline && <p className="sub">{v.subheadline}</p>}
        <div className="btns">
          <a className="btn pri" href="#sample" data-cta>{v.cta_label}</a>
          {canBuy && <a className="btn sec" href="#plans" data-cta>{L.subscribe}</a>}
        </div>
      </div>

      {signals.length > 0 && (
        <section><div className="wrap"><h2>{L.what}</h2>
          <div className="grid">{signals.map((s, i) => <div className="card" key={i}><h3>{s.title}</h3><p>{s.text}</p></div>)}</div>
        </div></section>
      )}

      {samples.length > 0 && (
        <section><div className="wrap"><h2>{L.examples}</h2><p className="note">{L.examplesNote}</p>
          <div className="scroll"><table><thead><tr><th></th><th>Company</th><th>Event</th><th>Date</th><th>{L.source}</th></tr></thead>
            <tbody>{samples.map((s, i) => (
              <tr key={i}><td><span className="tag">{L.example}</span></td><td>{s.company}{s.location ? `, ${s.location}` : ""}</td>
                <td>{s.event}</td><td>{s.date ?? ""}</td><td>{s.source ?? ""}</td></tr>))}</tbody></table></div>
        </div></section>
      )}

      <section><div className="wrap"><h2>{L.how}</h2>
        <div className="grid">{L.steps.map((s, i) => <div className="card" key={i}><h3>{i + 1}.</h3><p>{s}</p></div>)}</div>
      </div></section>

      {canBuy && (
        <section id="plans"><div className="wrap"><h2>{L.pricing}</h2>
          <div className="grid">{plans.map((p) => (
            <form className="card" key={p.key} method="post" action="/api/checkout">
              <h3>{p.name}</h3><p><strong>{p.price_label}</strong> {L.perMonth}</p>{p.description && <p className="note">{p.description}</p>}
              <input type="hidden" name="variant_id" value={v.id} /><input type="hidden" name="package" value={p.key} />
              <button className="btn pri" type="submit" data-cta>{L.subscribe}</button>
            </form>))}</div>
        </div></section>
      )}

      <section id="sample"><div className="wrap"><h2>{L.sampleTitle}</h2>
        {sp.angefragt && <p className="ok">{L.thanks}</p>}
        {sp.fehler && <p className="err">{L.error}</p>}
        <form method="post" action="/api/sample-request">
          <input type="hidden" name="variant_id" value={v.id} />
          <label className="hp" aria-hidden="true">Website<input type="text" name="website" tabIndex={-1} autoComplete="off" /></label>
          <label>{L.company}<input type="text" name="company" required maxLength={200} /></label>
          <label>{L.email}<input type="email" name="email" required maxLength={200} /></label>
          <label>{L.region}<input type="text" name="region" maxLength={200} /></label>
          <label className="consent"><input type="checkbox" name="consent" value="yes" required /> <span>{consentText(page.language)} <a href="/datenschutz">{L.legal[1]}</a></span></label>
          <button className="btn pri" type="submit" data-cta disabled={preview}>{L.send}</button>
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

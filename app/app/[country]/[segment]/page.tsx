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
import { PREMIUM, segmentCopy } from "@/content/segment-words";
import type { CSSProperties } from "react";
import { BrandShell, SiteFooter, SiteHeader, Words } from "../../chrome";
import { HeroNet } from "../../motion";

export const dynamic = "force-dynamic";

type Params = Promise<{ country: string; segment: string }>;
type Search = Promise<{ vorschau?: string; v?: string; angefragt?: string; fehler?: string; r?: string; schritt?: string }>;

/** Registernamen in GROSSBUCHSTABEN lesbar machen, Datum lokal formatieren (Inhalt bleibt gleich). */
function nice(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\bLlp\b/g, "LLP").replace(/\bPlc\b/g, "PLC");
}
function day(d: string | undefined, lang: string): string | undefined {
  if (!d || !/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return new Date(d + "T12:00:00Z").toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
}

const SIGNAL_LABEL: Record<"en" | "fr", Record<string, string>> = {
  en: { new_incorporation: "Newly registered", job_open_30d: "Role open 30+ days", jobs_3plus: "Several roles open", new_location: "New location", website_outdated: "Outdated website" },
  fr: { new_incorporation: "Création récente", job_open_30d: "Poste ouvert depuis 30 jours", jobs_3plus: "Plusieurs postes ouverts", new_location: "Nouveau site", website_outdated: "Site web vieillissant" },
};
const PRIO: Record<"en" | "fr", Record<string, string>> = {
  en: { high: "High priority", medium: "Medium priority", low: "Low priority" },
  fr: { high: "Priorité haute", medium: "Priorité moyenne", low: "Priorité basse" },
};

/** "ACME LTD registered on 31 Aug 2026 (London)." -> "" ; sonst Firmenname vorne und Klammern entfernen. */
function cleanEvent(ev: string, company: string): string {
  let e = ev.split(" (")[0].trim().replace(/\.$/, "");
  if (e.toUpperCase().startsWith(company.toUpperCase())) e = e.slice(company.length).trim();
  if (/^registered on /i.test(e)) return "";
  return e ? e[0].toUpperCase() + e.slice(1) : "";
}

type Sample = { company: string; location?: string; district?: string; industry?: string; noWebsite?: boolean; event: string; date?: string; source?: string; signal?: string; urgency?: string; opener?: string };

/** Echte Probe-Leads aus der Region des Empfängers (Firmendaten, als Beispiel markiert). */
async function regionalSamples(page: { segment_id: string; country: string }, region: string | undefined): Promise<Sample[]> {
  if (!region) return [];
  const r = region.replace(/[%,()]/g, "");
  const { data } = await db().from("leads")
    .select("event_summary, event_date, source_name, signal_type, urgency, opener, company_id, observation_ids, watch_companies!inner(name, city, region, address)")
    .eq("segment_id", page.segment_id).eq("country", page.country).in("status", ["sample", "new"])
    .or(`region.ilike.%${r}%,city.ilike.%${r}%`, { foreignTable: "watch_companies" })
    .order("event_date", { ascending: false }).limit(200);
  const rows = (data ?? []) as any[];
  // Branche (SIC) aus der Beobachtung holen, damit die Beispiele unterscheidbar sind
  const obsIds = [...new Set(rows.map((l) => l.observation_ids?.[0]).filter(Boolean))].slice(0, 200);
  const sic = new Map<string, string>();
  if (obsIds.length) {
    const { data: obs } = await db().from("observations").select("id, details").in("id", obsIds);
    for (const o of (obs ?? []) as any[]) if (o.details?.sic) sic.set(o.id, String(o.details.sic));
  }
  // Vielfalt: erst verschiedene Signale, dann verschiedene Branchen und Tage, jede Firma einmal
  const picked: any[] = [], firms = new Set<string>(), sigs = new Set<string>(), divs = new Set<string>(), days = new Map<string, number>();
  const take = (l: any) => { picked.push(l); firms.add(l.company_id); sigs.add(l.signal_type); days.set(l.event_date, (days.get(l.event_date) ?? 0) + 1);
    const d = (sic.get(l.observation_ids?.[0]) ?? "").slice(0, 2); if (d) divs.add(d); };
  for (const pass of [0, 1, 2]) {
    for (const l of rows) {
      if (picked.length >= 6) break;
      if (firms.has(l.company_id)) continue;
      const d = (sic.get(l.observation_ids?.[0]) ?? "").slice(0, 2);
      if (pass === 0 && sigs.has(l.signal_type)) continue;
      if (pass === 1 && ((d && divs.has(d)) || (days.get(l.event_date) ?? 0) >= 2)) continue;
      take(l);
    }
  }
  return picked.map((l: any) => {
    const code = sic.get(l.observation_ids?.[0]);
    const pc = String(l.watch_companies.address ?? "").match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*\d[A-Z]{2}\b/i)?.[1];
    return { company: l.watch_companies.name, location: l.watch_companies.city ?? undefined, district: pc?.toUpperCase(),
      industry: code ? code.split(" - ").slice(1).join(" - ") || undefined : undefined,
      noWebsite: /no website found/i.test(String(l.event_summary)),
      event: String(l.event_summary).slice(0, 160), date: l.event_date ?? undefined, source: l.source_name,
      signal: l.signal_type ?? undefined, urgency: l.urgency ?? undefined, opener: l.opener ?? undefined };
  });
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
    title: `${fill(r.variant.headline, {}, r.page.language, segmentCopy(r.slug, r.page.language).words)} | ${BRAND}`,
    description: r.variant.subheadline ? fill(r.variant.subheadline, {}, r.page.language, segmentCopy(r.slug, r.page.language).words) : undefined,
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
  const SC = segmentCopy(page.slug, lang);
  const W = SC.words;
  // Platzhalter füllen; Satzanfang groß (z. B. "{team} calls" -> "Your practice calls")
  const F = (x: string) => { const r = nd(fill(x, P, lang, W)); return r ? r[0].toUpperCase() + r.slice(1) : r; };
  const signals = fillDeep((v.signals ?? []) as { title: string; text: string }[], P, lang, W);
  const faq = fillDeep((v.faq ?? []) as { q: string; a: string }[], P, lang, W);
  const headline = F(v.headline);
  const subheadline = v.subheadline ? F(v.subheadline) : null;
  const cta = fill(v.cta_label, P, lang, W);
  const VV = VIDEOS as Record<string, { src: string; poster: string; seconds: number }>;
  // Video in der Sprache der Seite (z. B. "fr:fr/experts-comptables"), sonst das der Seite
  const video = VV[`${lang}:${page.slug}`] ?? VV[page.slug];
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
          <div className="cta-row" style={{ marginTop: 6 }}><button className="btn gold big" type="submit" name="consent" value="yes" data-cta>{L.confirm} <span className="ar">→</span></button>
            <a className="btn ghost" href={backHref}>{L.back}</a></div>
          <p className="small">{consentText(lang)} <a href={fr ? "/confidentialite" : "/privacy"}>{L.legal[1]}</a></p>
        </form>
      ) : (
        <div className="cta-row" style={{ marginTop: 6 }}><a className="btn gold big" href={mailto} data-cta>{L.byMail} <span className="ar">→</span></a><a className="btn ghost" href={backHref}>{L.back}</a></div>
      )}
    </div>
  );
  const Start = ({ label }: { label: string }) => <a className="btn gold big" href={stepHref} data-cta>{label} <span className="ar">→</span></a>;
  const Head = ({ eyebrow, title }: { eyebrow: string; title: string }) => (
    <div data-rv><div className="rule" /><h2 className="rvw" data-rv><Words text={title} /></h2></div>
  );

  return (
    <BrandShell lang={page.language}>
      {preview && <div className="banner">VORSCHAU (nicht öffentlich) · Seite {page.status} · Variante {v.variant_key} ({v.status}) · keine Ereignisse gezählt</div>}
      <Tracker variantId={v.id} enabled={!preview} />
      <SiteHeader links={video ? [["#video", fr ? "Vidéo" : "Film"]] : []} cta={[stepHref, fr ? "Échantillon gratuit" : "Free sample"]} />

      <div className="hero solo" id="top">
        <HeroNet />
        <div className="wrap">
          {personal?.firma && <div className="for later" style={{ "--d": ".05s" } as CSSProperties}>{fr ? `Préparé pour ${personal.firma}` : `Prepared for ${personal.firma}`}</div>}
          <h1><Words text={headline} /></h1>
          {subheadline && <p className="lede later" style={{ "--d": ".7s" } as CSSProperties}>{subheadline}</p>}
          <ul className="chips later" style={{ "--d": ".85s" } as CSSProperties} aria-label={fr ? "Signaux" : "Signals"}>
            {SC.chips.map((c) => <li key={c}>{F(c)}</li>)}
          </ul>
          {sp.angefragt ? <p className="ok">{known ? L.thanksTo(personal!.email!) : L.thanks}</p>
            : sp.fehler ? <p className="err">{L.error}</p> : null}
          {step ? <Probe /> : !sp.angefragt && (
            <div className="cta-row later" style={{ "--d": ".9s" } as CSSProperties}><Start label={known ? L.send : cta} />{canBuy && <a className="btn ghost" href="#plans" data-cta>{L.subscribe}</a>}</div>
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
        <section><div className="wrap"><Head eyebrow="" title={fr ? L.what : F("What we flag for {beruf}")} />
          <div className="cards">{signals.map((sg, k) => <div className="card glow lift" key={k} data-rv style={i(k)}><h3>{nd(sg.title)}</h3><p>{nd(sg.text)}</p></div>)}</div>
        </div></section>
      )}

      {samples.length > 0 && (
        <section className="tinted"><div className="wrap"><Head eyebrow="" title={fr ? L.examples : F(personal?.region ? "Example leads from {region}" : "Example leads")} />
          <p className="intro">{L.examplesNote}</p>
          <div className="leadgrid">{samples.map((sm, k) => {
            const label = SIGNAL_LABEL[fr ? "fr" : "en"][sm.signal ?? ""] ?? null;
            const detail = cleanEvent(sm.event, sm.company);
            const why = sm.signal ? SC.why[sm.signal] : undefined;
            return (
              <article className="leadx" key={k} data-rv style={i(k)}>
                <header>
                  <div><div className="co">{nice(sm.company)}</div>{sm.location && <div className="loc">{nice(sm.location)}{sm.district ? ` · ${sm.district}` : ""}</div>}</div>
                  <span className="ex">{L.example}</span>
                </header>
                <div className="sig">{label && <span className="pill">{label}</span>}<span className="dt">{day(sm.date, lang)}</span>
                  {sm.noWebsite && <span className="tagw">{fr ? "Pas encore de site web" : "No website yet"}</span>}</div>
                {sm.industry && <p className="ind"><span>{fr ? "Activité" : "Industry"}</span>{sm.industry}</p>}
                {detail && <p className="det">{nd(detail)}</p>}
                {why && <p className="why"><b>{fr ? "Pourquoi c'est une opportunité" : F("Why it matters for {beruf}")}</b>{F(why)}</p>}
                {sm.opener && <p className="op">“{nd(sm.opener.split(sm.company).join(nice(sm.company)))}”</p>}
                <div className="ft">
                  {sm.source && <span>{L.source}: {sm.source}</span>}
                  {sm.urgency && <span className={`prio p-${sm.urgency}`}>{PRIO[fr ? "fr" : "en"][sm.urgency] ?? sm.urgency}</span>}
                </div>
              </article>);
          })}</div>
        </div></section>
      )}

      <section><div className="wrap">
        <div className="deliv">
          <div className="report" data-rv>
            <div className="rp-head">
              <span className="pulse" aria-hidden="true" />
              <div><b>{F(fr ? "Aperçu : votre livraison avec NextGen Profit" : "Preview: your delivery with NextGen Profit")}</b>
                <span>{fr ? "Chaque lundi · 07:00" : "Every Monday · 07:00"}</span></div>
            </div>
            <h3 className="rp-title">{F(SC.getsTitle)}</h3>
            <ul className="rp-list">{SC.gets.map((g, k) => (
              <li key={k} style={i(k)}><span className="ic" aria-hidden="true">{["◆", "◇", "◈", "❝"][k % 4]}</span>{F(g)}</li>))}</ul>
          </div>
          <div className="flow" data-rv>
            <h3>{F(SC.stepsTitle)}</h3>
            <ol>{SC.steps.map((st, k) => <li key={k} style={i(k)}><span className="dot">{k + 1}</span><p>{F(st)}</p></li>)}</ol>
          </div>
        </div>
      </div></section>

      <section className="tinted"><div className="wrap">
        <Head eyebrow="" title={F(SC.revenueTitle)} />
        <div className="cards two">{SC.revenue.map(([h, d], k) => (
          <div className="card glow lift" key={h} data-rv style={i(k)}><div className="num">{k + 1}</div><h3>{F(h)}</h3><p>{F(d)}</p></div>))}</div>
      </div></section>

      <section className="dark"><div className="wrap">
        <Head eyebrow="" title={F(PREMIUM[fr ? "fr" : "en"].title)} />
        <div className="prem">{PREMIUM[fr ? "fr" : "en"].items.map(([h, d], k) => (
          <div key={h} data-rv style={i(k)}><h3>{F(h)}</h3><p>{F(d)}</p></div>))}</div>
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
          <div><Head eyebrow="" title={F(SC.sampleTitle)} />
            <p className="intro">{known ? L.sendsTo(personal!.gebiet, personal!.email!) : L.sendsToUnknown}</p>
            <div className="cta-row" data-rv><Start label={L.send} /></div>
            <div className="fine"><span>{L.free.replace(/\.$/, "")}</span><span>{L.noObl.replace(/\.$/, "")}</span></div>
          </div>
          <div data-rv><ol className="olist">{SC.steps.map((st, k) => <li key={k}>{F(st)}</li>)}</ol></div>
        </div></section>
      )}

      {faq.length > 0 && (
        <section><div className="wrap faq"><Head eyebrow={fr ? "Questions" : "Questions"} title={L.faq} />
          {faq.map((f, k) => <details key={k} data-rv style={i(k)}><summary>{nd(f.q)}</summary><p>{nd(f.a)}</p></details>)}
        </div></section>
      )}

      <SiteFooter lang={lang} />
    </BrandShell>
  );
}

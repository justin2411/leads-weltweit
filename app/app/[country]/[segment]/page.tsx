import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { consentText, t } from "@/lib/consent";
import VIDEOS from "@/content/videos.json";
import { getSettings, isOwner, loadPage, pageIsPublic } from "@/lib/pages";
import { BRAND, siteUrl } from "@/lib/site";
import { checkoutMode, lineItemFor, priceLabel, stripeEnabled, type Plan } from "@/lib/stripe";
import { fill, fillDeep, type Personal } from "@/lib/personalize";
import { personalFor } from "@/lib/recipient";
import { db } from "@/lib/supabase";
import { pickVariant } from "@/lib/variants";
import { Tracker } from "./tracker";
import { PREMIUM, segmentCopy } from "@/content/segment-words";
import { countryWords, localize, segKey } from "@/lib/country";
import HINTS from "@/content/industry-hints.json";
import type { CSSProperties } from "react";
import { BrandShell, SiteFooter, SiteHeader, Words } from "../../chrome";
import { HeroNet } from "../../motion";
import { SampleForm } from "../../sample-form";
import { wishesFor } from "@/content/sample-wishes";
import { localizeJob, maskCompany, maskEmail, maskPhone, pickDiverse, roleFor, seedOf, shortForm, type Part } from "@/lib/examples";

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
  fr: { new_incorporation: "Création récente", job_open_30d: "Poste ouvert 30+ jours", jobs_3plus: "Plusieurs postes ouverts", new_location: "Nouveau site", website_outdated: "Site web vieillissant" },
};
const PRIO: Record<"en" | "fr", Record<string, string>> = {
  en: { high: "High priority", medium: "Medium priority", low: "Low priority" },
  fr: { high: "Priorité haute", medium: "Priorité moyenne", low: "Priorité basse" },
};

/** "ACME LTD registered on 31 Aug 2026 (London)." -> "" ; sonst Firmenname vorne und Klammern entfernen. */
/** Verkaufstipp und Frage je Branche der Firma (SIC) und Zielgruppe (content/industry-hints.json, auch für die Lieferung). */
function industryHint(seg: string, sic: string | undefined): [string, string] | undefined {
  if (!sic) return undefined;
  const g = (HINTS.groups as Record<string, string>)[sic.slice(0, 2)];
  return g ? (HINTS.hints as unknown as Record<string, Record<string, [string, string]>>)[seg]?.[g] : undefined;
}

/** Lange Branchenbezeichnungen (SIC) am Wortende kürzen. */
function short(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n).replace(/\s+\S*$/, "") + "…";
}

/** Firmenname mit und ohne Rechtsform, in jeder Schreibweise (zum Verdecken in Titel und Einstiegssatz). */
function nameRe(company: string): RegExp {
  const esc = (x: string) => x.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const core = company.replace(/(,?\s+(ltd\.?|limited|llp|plc|llc|l\.l\.c\.?|inc\.?|corp\.?|corporation|sas|sasu|sarl|eurl|sa|sci))+$/i, "").trim();
  const alts = [...new Set([company, core].filter((x) => x.length >= 3))].sort((a, b) => b.length - a.length).map(esc);
  return new RegExp(`(?:${alts.join("|")})`, "i");
}

function cleanEvent(ev: string, company: string): string {
  // nur die Klammer am Ende entfernen (Details), nicht Klammern im Stellentitel
  let e = ev.trim().replace(/\.$/, "").replace(/\s*\([^()]*(\([^()]*\)[^()]*)*\)$/, "").trim().replace(/\.$/, "");
  if (e.toUpperCase().startsWith(company.toUpperCase())) e = e.slice(company.length).trim();
  if (/^(registered on|immatricul)/i.test(e)) return "";
  return e ? e[0].toUpperCase() + e.slice(1) : "";
}

type Sample = {
  company: string; companyId?: string; location?: string; district?: string; industry?: string; sicCode?: string; noWebsite?: boolean;
  web?: "none" | "found"; legalForm?: string; role?: string; personKnown?: boolean; phone?: string; email?: string;
  event: string; date?: string; source?: string; signal?: string; urgency?: string; opener?: string;
};

/** Ab dieser Zahl offener Stellen ist es ein Konzern – als Beispiel für kleine und mittlere Käufer ungeeignet. */
const MAX_ROLES_EXAMPLE = 40;
const NON_LATIN = /[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\u0400-\u04ff\u0600-\u06ff]/;
const cache = new Map<string, { at: number; rows: Sample[] }>();

/**
 * Echte Leads aus dem ganzen Land als Beispiele (Firmendaten, maskiert). Vielfalt (Inhaber 28.09.2026: „alle
 * Leads sehen gleich aus“): Kandidaten aus mehreren Abfragen (neueste, andere Signale, ältere Tage), dann
 * pickDiverse – verschiedene Signale, Branchen, Prioritäten, Tage und Website-Befunde. 10 Minuten zwischengespeichert.
 */
async function countrySamples(page: { segment_id: string; country: string }): Promise<Sample[]> {
  const ck = `${page.segment_id}|${page.country}`;
  const hit = cache.get(ck);
  if (hit && process.env.NODE_ENV === "production" && Date.now() - hit.at < 10 * 60 * 1000) return hit.rows;
  const sel = "event_summary, event_date, source_name, signal_type, urgency, opener, company_id, observation_ids, watch_companies!inner(name, legal_form, website, website_checked_at)";
  const base = () => db().from("leads").select(sel).eq("segment_id", page.segment_id).eq("country", page.country)
    .in("status", ["sample", "new"]).order("event_date", { ascending: false });
  const ago = (d: number) => new Date(Date.now() - d * 864e5).toISOString().slice(0, 10);
  // Tage relativ zum neuesten Lead (Register liefern teils mit Verzug), damit auch ältere Tage zur Auswahl stehen
  const first = await base().limit(120);
  const newest = ((first.data ?? []) as any[])[0]?.event_date as string | undefined;
  const before = (d: number) => newest
    ? new Date(Date.parse(newest + "T12:00:00Z") - d * 864e5).toISOString().slice(0, 10) : ago(d);
  const res = [first, ...await Promise.all([
    base().neq("signal_type", "new_incorporation").limit(80),
    base().lte("event_date", before(1)).limit(40),
    base().lte("event_date", before(3)).limit(40),
    base().lte("event_date", before(8)).limit(40),
    base().lte("event_date", ago(20)).limit(30),
    base().eq("urgency", "medium").limit(30),
  ])];
  const seen = new Set<string>();
  const rows = res.flatMap((r) => (r.data ?? []) as any[]).filter((l) => {
    const k = `${l.company_id}|${l.signal_type}|${l.event_date}`;
    if (seen.has(k)) return false;
    seen.add(k);
    const n = Number(cleanEvent(String(l.event_summary), String(l.watch_companies.name)).match(/^(\d+) open roles/)?.[1] ?? 0);
    return !NON_LATIN.test(String(l.event_summary)) && n <= MAX_ROLES_EXAMPLE;
  });
  // Branche (SIC) aus der Beobachtung, damit die Beispiele aus verschiedenen Bereichen kommen
  const sic = new Map<string, string>();
  const obsIds = [...new Set(rows.map((l) => l.observation_ids?.[0]).filter(Boolean))] as string[];
  for (let i = 0; i < obsIds.length; i += 100) {
    const { data: obs } = await db().from("observations").select("id, details").in("id", obsIds.slice(i, i + 100));
    for (const o of (obs ?? []) as any[]) if (o.details?.sic) sic.set(o.id, String(o.details.sic));
  }
  const noWeb = (l: any) => /no website found/i.test(String(l.event_summary))
    || (!l.watch_companies.website && Boolean(l.watch_companies.website_checked_at));
  const cands = rows.map((l) => {
    const code = sic.get(l.observation_ids?.[0]);
    const n = cleanEvent(String(l.event_summary), String(l.watch_companies.name)).match(/\d+/)?.[0] ?? "";
    return {
      l, id: String(l.company_id), name: String(l.watch_companies.name), signal: l.signal_type ?? undefined,
      urgency: l.urgency ?? undefined, date: l.event_date ?? undefined,
      group: code ? `sic${code.slice(0, 2)}` : shortForm(l.watch_companies.legal_form, l.watch_companies.name),
      web: noWeb(l) ? "none" as const : l.watch_companies.website ? "found" as const : undefined,
      opener: Boolean(l.opener),
      // Stellen-Signale: gleiche Anzahl Stellen am selben Tag = dieselbe Firma unter zwei Einträgen
      evKey: l.signal_type === "new_incorporation" ? undefined : `${l.signal_type}|${n}|${l.event_date}`,
    };
  });
  // Salz je Zielgruppe: Seiten mit denselben Neugründungen (Buchhaltung, Makler, Web) zeigen verschiedene Firmen
  const picked = pickDiverse(cands, 3, page.segment_id);
  // Ansprechperson (Rolle aus Register/Impressum) und Kontaktdaten nur für die gezeigten Firmen
  const ids = picked.map((c) => c.id);
  const [people, contacts] = ids.length ? await Promise.all([
    db().from("observations").select("company_id, details").eq("kind", "other").eq("key", "person").in("company_id", ids),
    db().from("observations").select("company_id, details").eq("kind", "other").eq("key", "contact").in("company_id", ids),
  ]) : [{ data: [] }, { data: [] }];
  const person = new Map(((people.data ?? []) as any[]).filter((p) => p.details?.name).map((p) => [p.company_id, p.details]));
  const contact = new Map(((contacts.data ?? []) as any[]).map((p) => [p.company_id, p.details ?? {}]));
  const out = picked.map(({ l }) => {
    const code = sic.get(l.observation_ids?.[0]);
    const pp: any = person.get(l.company_id);
    const cc: any = contact.get(l.company_id) ?? {};
    return {
      company: l.watch_companies.name, companyId: String(l.company_id),
      industry: code ? code.split(" - ").slice(1).join(" - ") || undefined : undefined, sicCode: code?.slice(0, 5),
      noWebsite: noWeb(l), web: noWeb(l) ? "none" as const : l.watch_companies.website ? "found" as const : undefined,
      legalForm: shortForm(l.watch_companies.legal_form, l.watch_companies.name),
      role: pp?.role ?? undefined, personKnown: Boolean(pp?.name),
      phone: cc.phone ?? undefined, email: cc.email ?? undefined,
      event: String(l.event_summary), date: l.event_date ?? undefined, source: l.source_name,
      signal: l.signal_type ?? undefined, urgency: l.urgency ?? undefined, opener: l.opener ?? undefined,
    };
  });
  cache.set(ck, { at: Date.now(), rows: out });
  return out;
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
  const CW = countryWords(r.page.country);
  const W = { ...segmentCopy(r.slug, r.page.language).words, ...CW };
  const P = { region: CW.land, ort: CW.land };
  return {
    title: `${localize(fill(r.variant.headline, P, r.page.language, W), r.page.country)} | ${BRAND}`,
    description: r.variant.subheadline ? localize(fill(r.variant.subheadline, P, r.page.language, W), r.page.country) : undefined,
    alternates: { canonical: `${siteUrl()}/${r.slug}` },
    robots: r.isPublic ? { index: true, follow: true } : { index: false, follow: false },
  };
}


const SHOW_PRICES = false;

export default async function LandingPage({ params, searchParams }: { params: Params; searchParams: Search }) {
  const r = await resolve(params, searchParams);
  if (!r) notFound();
  const { page, variant: v, settings, preview, sp } = r;
  const L = t(page.language);
  const plans = (v.pricing ?? settings.pricing ?? []) as Plan[];
  const mode = checkoutMode({ vercelEnv: process.env.VERCEL_ENV, ownerPreview: preview });
  const buyable = plans.filter((p) => lineItemFor(p, mode, BRAND));
  // Preise öffentlich noch nicht zeigen (Inhaber 27.09.2026); nur in der Vorschau des Inhabers sichtbar
  const canBuy = (preview || SHOW_PRICES) && stripeEnabled(mode) && buyable.length > 0;
  const personal = preview && !sp.r ? null : await personalFor(sp.r, page);
  // Leads aus dem ganzen Land: {region}/{ort} in älteren Texten meinen das Land
  const CW = countryWords(page.country);
  const P: Personal = { ...(personal ?? {}), region: CW.land, ort: CW.land };
  const lang = page.language;
  const live = await countrySamples(page).catch(() => [] as Sample[]);
  const samples = (live.length >= 3 ? live : ((v.sample_leads ?? []) as Sample[])).slice(0, 3);
  const nd = (x: string) => x.replace(/\s+[–—]\s+/g, ", ");
  const SC = segmentCopy(page.slug, lang);
  const W = { ...SC.words, ...CW };
  // Platzhalter füllen; Satzanfang groß (z. B. "{team} calls" -> "Your practice calls")
  const F = (x: string) => { const r = localize(nd(fill(x, P, lang, W)), page.country); return r ? r[0].toUpperCase() + r.slice(1) : r; };
  const faq = fillDeep((v.faq ?? []) as { q: string; a: string }[], P, lang, W).map((f) => ({ q: localize(f.q, page.country), a: localize(f.a, page.country) }));
  const headline = F(v.headline);
  const subheadline = v.subheadline ? F(v.subheadline) : null;
  const cta = localize(fill(v.cta_label, P, lang, W), page.country);
  const VV = VIDEOS as Record<string, { src: string; poster: string; seconds: number }>;
  // Video in der Sprache der Seite (z. B. "fr:fr/experts-comptables"), sonst das der Seite
  const video = VV[page.slug] ?? VV[`${lang}:${page.slug}`] ?? VV[`${lang}:ind/${segKey(page.slug)}`];
  // Kein Formular: Knopf -> zweiter Schritt (Bedingungen) -> ein Klick sendet die Probe. Adresse kommt aus dem Mail-Link.
  const known = Boolean(personal?.email && personal.firma);
  const keep = [preview && `vorschau=1&v=${v.variant_key}`, sp.r && /^[A-Za-z0-9_-]{8,80}$/.test(sp.r) && `r=${sp.r}`].filter(Boolean).join("&");
  // Formular statt Mail-Knopf (Inhaber 28.09.2026): alle Knöpfe springen zum Formular (#probe) auf derselben Seite.
  // Alte Links mit ?schritt=probe zeigen das Formular oben im Kopf; über ?r= sind Firma und Adresse vorbelegt.
  const stepHref = "#probe";
  const step = sp.schritt === "probe" && !sp.angefragt;
  const i = (n: number) => ({ "--i": n }) as CSSProperties;
  const fr = lang === "fr";
  const wl: "en" | "fr" = fr ? "fr" : "en";
  const form = (
    <SampleForm lang={wl} field="variant_id" consent={consentText(lang)} privacyHref={fr ? "/confidentialite" : "/privacy"}
      options={[{ value: v.id, label: "", wishes: wishesFor(segKey(page.slug)).map((w) => ({ key: w.key, label: w[wl] })) }]}
      hidden={{ ...(keep.includes("r=") ? { r: String(sp.r) } : {}), ...(preview ? { vorschau: "1" } : {}) }}
      company={personal?.firma ?? ""} email={personal?.email ?? ""} />
  );
  const Probe = () => (
    <div className="panel" id="probe">
      <h2>{L.stepTitle}</h2>
      <p className="small" style={{ marginTop: 0 }}>{known ? L.sendsTo(CW.land, personal!.email!) : L.sendsToUnknown}</p>
      {form}
    </div>
  );
  const Fine = () => <div className="fine"><span>{L.free.replace(/\.$/, "")}</span><span>{L.noObl.replace(/\.$/, "")}</span></div>;
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
            <div className="cta-row later" style={{ "--d": ".9s", alignItems: "flex-start" } as CSSProperties}>
              <div className="cta-stack"><Start label={known ? L.send : cta} /><Fine /></div>
              {canBuy && <a className="btn ghost" href="#plans" data-cta>{L.subscribe}</a>}</div>
          )}
        </div>
      </div>

      {video && (
        <section className="dark tight" id="video"><div className="wrap narrow">
          <Head eyebrow={fr ? "Le film" : "The film"} title={L.video(video.seconds)} />
          {/* Eigenes Video, keine Drittanbieter, lädt erst beim Abspielen */}
          <div className="frame" data-rv><video controls playsInline preload="none" poster={video.poster} src={video.src} /></div>
        </div></section>
      )}

      {samples.length > 0 && (
        <section className="tinted tight"><div className="wrap"><Head eyebrow="" title={fr ? L.examples : F("Example leads from across {land}")} />
          <p className="intro">{L.examplesNote}</p>
          <div className="leadgrid p3">{samples.map((s0, k) => {
            // ältere Beispiele (sample_leads) haben kein Signal: Neugründung am Text erkennen
            const sm = { ...s0, signal: s0.signal ?? (/registered on|immatricul/i.test(s0.event) ? "new_incorporation" : undefined) };
            const label = SIGNAL_LABEL[fr ? "fr" : "en"][sm.signal ?? ""] ?? null;
            const detail = localizeJob(cleanEvent(sm.event, sm.company), lang);
            const hint = industryHint(segKey(page.slug), sm.sicCode);
            const why = hint?.[0] ?? (sm.signal ? SC.why[sm.signal] : undefined);
            const month = sm.date ? new Date(sm.date + "T12:00:00Z").toLocaleDateString("en-GB", { month: "long" }) : "";
            const opener = hint && sm.signal === "new_incorporation" && !fr
              ? `Congratulations on setting up ${nice(sm.company)}${month ? ` this ${month}` : ""}. ${hint[1]}`
              : sm.opener ? localizeJob(sm.opener.split(sm.company).join(nice(sm.company)), lang) : undefined;
            const age = sm.date ? Math.max(0, Math.round((Date.now() - Date.parse(sm.date + "T12:00:00Z")) / 864e5)) : undefined;
            const inc = sm.signal === "new_incorporation" && age !== undefined
              ? (fr ? `Créée il y a ${age} jour${age === 1 ? "" : "s"}` : `Registered ${age} day${age === 1 ? "" : "s"} ago`) : "";
            const noSite = sm.web === "none" ? (fr ? ", sans site web" : ", no website found") : "";
            const title = (detail.length > 110 ? detail.slice(0, 107).replace(/[\s,]+\S*$/, "") + "…" : detail) || (inc ? inc + noSite : label ?? "");
            // keine Städte/Regionen (landesweit): Branche, Rechtsform, Datum
            const meta = [sm.industry && short(sm.industry.split(/[,;]/)[0], 48), sm.legalForm, day(sm.date, lang)].filter(Boolean).join(" · ");
            const seed = seedOf(sm.companyId ?? sm.company);
            const co = maskCompany(sm.company, seed);
            const role = roleFor(page.country, sm.legalForm, sm.role, lang);
            const show = (parts: Part[]) => parts.map((q, j) => q.m
              ? <span className="mask" key={j} aria-hidden="true">{q.t}</span> : <span key={j}>{q.t}</span>);
            const hidden = <span className="sr">{fr ? " (masqué)" : " (hidden)"}</span>;
            // Firmenname überall verdecken (auch ohne Rechtsform, z. B. im Stellentitel "…, Withings Health Solutions")
            const masked = (x: string) => x.split(nameRe(sm.company))
              .flatMap((part, j) => j ? [<span key={j} className="nw">{show(co)}</span>, part] : [part]);
            return (
              <article className="leadp" key={k} data-rv style={i(k)}>
                <div className="top">{label && <span className="pill">{label}</span>}
                  {sm.urgency && <span className={`prio p-${sm.urgency}`}>{PRIO[fr ? "fr" : "en"][sm.urgency] ?? sm.urgency}</span>}</div>
                <h3 className="ev">{masked(nd(title))}</h3>
                {meta && <div className="meta">{meta}</div>}
                <dl className="lock">
                  <div><dt>{fr ? "Entreprise" : "Company"}</dt><dd>{show(co)}{hidden}</dd></div>
                  {sm.personKnown
                    ? <div><dt>{fr ? "Interlocuteur" : "Contact"}</dt><dd><span className="mask" aria-hidden="true">{maskCompany("Name Surname", seed ^ 7)[1].t}</span>, {role}</dd></div>
                    : <div><dt>{fr ? "Demander" : "Ask for"}</dt><dd>{role}</dd></div>}
                  <div><dt>{fr ? "Téléphone" : "Phone"}</dt><dd className="nw">{show(maskPhone(page.country, seed, sm.phone))}{hidden}</dd></div>
                  <div><dt>E-mail</dt><dd className="nw">{show(maskEmail(sm.company, page.country, seed, sm.email))}{hidden}</dd></div>
                  {sm.web === "none" && <div><dt>{fr ? "Site web" : "Website"}</dt><dd className="gold">{fr ? "aucun trouvé" : "none found"}</dd></div>}
                  <p className="unlock"><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" /><path d="M8 11V8a4 4 0 0 1 8 0v3" /></svg>{fr ? "Visible dans votre échantillon gratuit" : "Unlocked in your free sample"}</p>
                </dl>
                {why && <p className="why"><b>{fr ? "Pourquoi maintenant" : "Why now"}</b>{F(why)}</p>}
                {opener && <p className="op"><b>{fr ? "Phrase d'accroche" : "Opening line"}</b>“{masked(nd(opener))}”</p>}
                <div className="ft"><span className="vf">✓ {fr ? "Vérifié" : "Verified"}</span><span>{L.example}</span></div>
              </article>);
          })}</div>
        </div></section>
      )}

      <section className="tinted tight"><div className="wrap">
        <Head eyebrow="" title={F(SC.revenueTitle)} />
        <div className="cards two">{SC.revenue.map(([h, d], k) => (
          <div className="card glow lift" key={h} data-rv style={i(k)}><div className="num">{k + 1}</div><h3>{F(h)}</h3><p>{F(d)}</p></div>))}</div>
      </div></section>

      <section className="dark tight"><div className="wrap">
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
        <section className="offer tight" id="sample"><div className="wrap">
          <div id="probe"><Head eyebrow="" title={F(SC.sampleTitle)} />
            <p className="intro">{known ? L.sendsTo(CW.land, personal!.email!) : L.sendsToUnknown}</p>
            {form}
          </div>
          <ul className="ticks" data-rv>
            <li><b>{L.free}</b> {L.freeText}</li>
            <li><b>{L.noObl}</b> {L.noOblText}</li>
            <li>{L.followUp}</li>
          </ul>
        </div></section>
      )}

      {faq.length > 0 && (
        <section className="tight"><div className="wrap faq"><Head eyebrow={fr ? "Questions" : "Questions"} title={L.faq} />
          {faq.map((f, k) => <details key={k} data-rv style={i(k)}><summary>{nd(f.q)}</summary><p>{nd(f.a)}</p></details>)}
        </div></section>
      )}

      <SiteFooter lang={lang} />
    </BrandShell>
  );
}

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
import { unstable_cache } from "next/cache";
import { Tracker } from "./tracker";
import { segmentCopy } from "@/content/segment-words";
import { AREA_LABEL, COUNTRY_NAME, LANDING } from "@/content/landing-v2";
import { LANDING_CSS } from "@/lib/landing-css";
import { Field, Icon, MapCard, Presence, type MapData } from "./v2";
import S2_US from "@/content/maps/s2-us.json";
import S2_UK from "@/content/maps/s2-uk.json";
import S2_FR from "@/content/maps/s2-fr.json";

/** Karte und Kennzahlen einer echten Probe je Zielgruppe und Land (scripts: Lead-PDF-Vorlage, 02.10.2026). */
// Kartenumriss als statische Datei (scripts/map_svg.py), im HTML nur die Pins
const mapOf = (m: unknown, src: string): MapData => ({ ...(m as MapData), land: "", borders: "", neighbors: "", src });
const MAPS: Record<string, MapData> = {
  "S2:US": mapOf(S2_US, "/maps/s2-us.svg"), "S2:UK": { ...mapOf(S2_UK, "/maps/s2-uk.svg"), crop: "232 125 711 445" }, "S2:FR": mapOf(S2_FR, "/maps/s2-fr.svg"),
};
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
  en: { new_incorporation: "Newly registered", job_open_30d: "Role open 30+ days", jobs_3plus: "Several roles open", new_location: "New location", website_outdated: "Outdated website",
    no_website: "No website found", website_not_mobile: "Not mobile-friendly", no_https: "Security gap", website_broken: "Website down" },
  fr: { new_incorporation: "Création récente", job_open_30d: "Poste ouvert 30+ jours", jobs_3plus: "Plusieurs postes ouverts", new_location: "Nouveau site", website_outdated: "Site web vieillissant",
    no_website: "Aucun site trouvé", website_not_mobile: "Pas adapté au mobile", no_https: "Faille de sécurité", website_broken: "Site hors service" },
};
/** Website-Befunde (Webagenturen): Beispiel-Titel aus Branche + Befund statt Rohtext der Quelle (Inhaber 02.10.2026). */
const WEB_SIGNALS = ["no_website", "website_outdated", "website_not_mobile", "no_https", "website_broken"];
const WEB_TITLE: Record<"en" | "fr", Record<string, string>> = {
  en: { no_website: "{x} with no website", website_outdated: "{x} with an outdated website", website_not_mobile: "{x} whose website fails on phones",
    no_https: "{x} whose website is not secure", website_broken: "{x} whose website is down" },
  fr: { no_website: "{x} sans site web", website_outdated: "{x} au site vieillissant", website_not_mobile: "{x} au site non adapté au mobile",
    no_https: "{x} au site non sécurisé", website_broken: "{x} au site hors service" },
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
async function countrySamplesRaw(page: { segment_id: string; country: string }): Promise<Sample[]> {
  const ck = `${page.segment_id}|${page.country}`;
  const hit = cache.get(ck);
  if (hit && process.env.NODE_ENV === "production" && Date.now() - hit.at < 10 * 60 * 1000) return hit.rows;
  const sel = "event_summary, event_date, source_name, signal_type, urgency, opener, company_id, observation_ids, watch_companies!inner(name, legal_form, website, website_checked_at, industry)";
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
    ...(page.segment_id === "S2" ? [base().in("signal_type", WEB_SIGNALS.slice(1)).limit(60),
      base().eq("signal_type", "no_website").ilike("source_name", "Overture%").limit(60)] : []),
  ])];
  const seen = new Set<string>();
  const all = res.flatMap((r) => (r.data ?? []) as any[]);
  // Webagenturen: Beispiele wie in der Probe (Website-Befunde), nicht Neugründungen aus Verkehrs- oder Firmenregistern
  // (ohne Verkehrsregister FMCSA: dort liefern wir für Webagenturen keine Proben)
  const webOnly = page.segment_id === "S2"
    ? all.filter((l) => WEB_SIGNALS.includes(l.signal_type) && !/FMCSA/i.test(String(l.source_name))) : [];
  const rows = (webOnly.length >= 3 ? webOnly : all).filter((l) => {
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
      // (Website-Befunde ohne Zahl im Text sind verschiedene Firmen, nicht ein Eintrag)
      evKey: l.signal_type === "new_incorporation" || WEB_SIGNALS.includes(l.signal_type) || !n
        ? undefined : `${l.signal_type}|${n}|${l.event_date}`,
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
      industry: (code ? code.split(" - ").slice(1).join(" - ") || undefined : undefined) ?? (l.watch_companies.industry || undefined),
      sicCode: code?.slice(0, 5),
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

/**
 * Beispiel-Leads im Datencache von Vercel (über alle Server-Instanzen, 10 Minuten): der erste Aufruf nach einer Pause
 * – typisch nach einer Kaltmail – wartet sonst auf rund 12 Abfragen über den ganzen Lead-Bestand (Inhaber 02.10.2026:
 * „die landingpage … braucht noch zu lange“).
 */
const countrySamplesCached = unstable_cache(
  (segment_id: string, country: string) => countrySamplesRaw({ segment_id, country }),
  ["landing-samples-v1"], { revalidate: 600 },
);
const countrySamples = (page: { segment_id: string; country: string }) =>
  countrySamplesCached(page.segment_id, page.country).catch(() => countrySamplesRaw(page));
const loadPageCached = unstable_cache(loadPage, ["landing-page-v1"], { revalidate: 120 });
const getSettingsCached = unstable_cache(getSettings, ["landing-settings-v1"], { revalidate: 120 });

async function resolve(params: Params, searchParams: Search) {
  const { country, segment } = await params;
  const sp = await searchParams;
  const slug = `${country}/${segment}`.toLowerCase();
  if (!/^[a-z]{2}\/[a-z0-9-]+$/.test(slug)) return null;
  const [data, settings] = await Promise.all([loadPageCached(slug), getSettingsCached()]);
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

  // ---- Landingpage im Design der Lead-PDF (Inhaber 02.10.2026) ----
  const T2 = LANDING[wl];
  const MAP = MAPS[`${page.segment_id}:${page.country}`];
  const cname = COUNTRY_NAME[page.country]?.[wl] ?? CW.land;
  const goldFrom = headline.search(/\(/);
  const goldWords = goldFrom >= 0 ? headline.slice(goldFrom).split(/\s+/).map((w) => w.toLowerCase().replace(/[.,!?]/g, "")) : [];
  const KIND: Record<string, string> = { no_website: "nosite", no_https: "insecure", website_outdated: "outdated", website_not_mobile: "outdated", website_broken: "outdated" };
  const S2 = page.segment_id === "S2";
  const sigIcons = S2 ? ["nosite", "outdated", "insecure"] : ["target", "bolt", "lock"];
  const signals = ((v.signals ?? []) as { title: string; text: string }[]).slice(0, 3);
  const st = MAP?.stats;
  const presenceRows = st ? ([
    ["phone", "phone"], ["email", "mail"], ["facebook", "social"], ["website", "globe"],
  ] as const).filter(([k]) => k !== "facebook" || st.presence.facebook > 0)
    .map(([k, icon]) => ({ key: k, icon, label: T2.presence[k], n: st.presence[k] ?? 0, gap: k === "website" && st.kinds.nosite > 0 })) : [];

  const tile = (s0: Sample, k: number) => {
    const sm = { ...s0, signal: s0.signal ?? (/registered on|immatricul/i.test(s0.event) ? "new_incorporation" : undefined) };
    const label = SIGNAL_LABEL[wl][sm.signal ?? ""] ?? null;
    const kind = KIND[sm.signal ?? ""] ?? "outdated";
    const hint = industryHint(segKey(page.slug), sm.sicCode);
    const why = hint?.[0] ?? (sm.signal ? SC.why[sm.signal] : undefined);
    const webT = WEB_TITLE[wl][sm.signal ?? ""];
    const kindTxt = sm.industry ? short(sm.industry.split(/[,;]/)[0], 40) : (fr ? "Entreprise locale" : "Local business");
    const detail = localizeJob(cleanEvent(sm.event, sm.company), lang);
    const title = webT ? webT.replace("{x}", kindTxt.charAt(0).toUpperCase() + kindTxt.slice(1)) : (detail || label || "");
    const opener = sm.opener ? localizeJob(sm.opener.split(sm.company).join(nice(sm.company)), lang) : undefined;
    const seed = seedOf(sm.companyId ?? sm.company);
    const co = maskCompany(sm.company, seed);
    const role = roleFor(page.country, sm.legalForm, sm.role, lang);
    const show = (parts: Part[]) => parts.map((q, j) => q.m ? <span className="mask" key={j} aria-hidden="true">{q.t}</span> : <span key={j}>{q.t}</span>);
    const masked = (x: string) => x.split(nameRe(sm.company)).flatMap((part, j) => j ? [<span key={j} className="nw">{show(co)}</span>, part] : [part]);
    const hidden = <span className="sr">{` ${T2.hidden}`}</span>;
    const prio = sm.urgency ?? "medium";
    const bars = prio === "high" ? 3 : prio === "low" ? 1 : 2;
    return (
      <article className="tile" key={k} data-rv style={i(k)}>
        <div className="main">
          <div className="th"><div className="num">{String(k + 1).padStart(2, "0")}</div>
            <div><h3>{show(co)}{hidden}</h3><div className="sub"><Icon name="shop" />{masked(nd(title))}</div></div></div>
          <div className="cgrid">
            <Field icon="phone" label={T2.phone}><span className="nw">{show(maskPhone(page.country, seed, sm.phone))}</span>{hidden}</Field>
            {sm.personKnown
              ? <Field icon="user" label={T2.contact}><span className="mask" aria-hidden="true">{maskCompany("Name Surname", seed ^ 7)[1].t}</span>, {role}</Field>
              : <Field icon="cal" label={T2.detected}>{day(sm.date, lang)}</Field>}
            <Field icon="mail" label={T2.email}><span className="nw">{show(maskEmail(sm.company, page.country, seed, sm.email))}</span>{hidden}</Field>
            {sm.web === "none" && <Field icon="globe" label={T2.website}><span className="gold">{T2.noneFound}</span></Field>}
          </div>
          <div className="low">
            {why && <div className="why"><span className="cap gold">{T2.whyNow}</span><p>{F(why)}</p></div>}
            <div className="pres"><span className="cap" style={{ marginRight: 6 }}>{T2.online}</span>
              <span className="pc"><Icon name="phone" />{T2.phone}<Icon name="check" /></span>
              <span className="pc"><Icon name="mail" />{T2.email}<Icon name="check" /></span>
              {sm.web && <span className={`pc${sm.web === "none" ? " no" : ""}`}><Icon name="globe" />{T2.website}<Icon name={sm.web === "none" ? "x" : "check"} /></span>}
            </div>
          </div>
        </div>
        <aside className="act">
          {label && <span className={`badge ${kind}`}><Icon name={kind} />{label}</span>}
          <span className="badge prio"><span className="meter">{[1, 2, 3].map((b) => <i key={b} className={b <= bars ? "on" : ""} />)}</span>{PRIO[wl][prio] ?? prio}</span>
          <span className="cap"><Icon name="target" />{T2.howWin}</span>
          {opener && <div className="askb"><small>{fr ? "Phrase d'accroche" : "Opening line"}</small>“{masked(nd(opener))}”</div>}
          <div className="callb"><span className="ci"><Icon name="phone" /></span><span><em>{T2.call}</em><b className="nw">{show(maskPhone(page.country, seed, sm.phone))}</b></span></div>
        </aside>
      </article>);
  };

  return (
    <BrandShell lang={page.language} extraCss={LANDING_CSS}>
      {preview && <div className="banner">VORSCHAU (nicht öffentlich) · Seite {page.status} · Variante {v.variant_key} ({v.status}) · keine Ereignisse gezählt</div>}
      <Tracker variantId={v.id} enabled={!preview} />
      <SiteHeader links={video ? [["#video", fr ? "Vidéo" : "Film"]] : []} cta={[stepHref, fr ? "Échantillon gratuit" : "Free sample"]} />
      <div className="lp2">

        <section className="h2o" id="top">
          <div className="wrap" style={MAP ? undefined : { gridTemplateColumns: "1fr", maxWidth: 920 }}>
            <div>
              <span className="pill"><Icon name="star" className="ic" />{T2.pill.replace("{country}", cname)}</span>
              {personal?.firma && <span className="for">{fr ? `Préparé pour ${personal.firma}` : `Prepared for ${personal.firma}`}</span>}
              <h1><Words text={headline} gold={goldWords} /></h1>
              {subheadline && <p className="sub">{subheadline}</p>}
              <div className="every"><span className="cap">{T2.every}</span>
                {/* zwei Zeilen: Kontaktdaten, dann Vertriebshilfe */}
                {[T2.chips.slice(0, 3), T2.chips.slice(3)].map((row, r) => (
                  <span className="chiprow" key={r}>{row.map(([ic, txt]) => <span className="chip" key={txt}><Icon name={ic} />{txt}</span>)}</span>))}</div>
              {sp.angefragt ? <p className="ok">{known ? L.thanksTo(personal!.email!) : L.thanks}</p>
                : sp.fehler ? <p className="err">{L.error}</p> : null}
              {step ? <Probe /> : !sp.angefragt && (
                <div className="ctaline"><div className="ctabox"><Start label={known ? L.send : cta} />
                  <span className="free2"><span>{L.free.replace(/\.$/, "")}</span><span>{L.noObl.replace(/\.$/, "")}</span><span>{T2.byMail}</span></span></div>
                  {canBuy && <a className="btn ghost" href="#plans" data-cta>{L.subscribe}</a>}</div>
              )}
            </div>
            {MAP && <MapCard map={MAP} note={T2.whereNote.replace("{land}", CW.land)} />}
          </div>
          {st && (
            <div className="wrap" style={{ display: "block", paddingTop: 0 }}>
              <div className="kpis">
                <div className="kpi" data-rv style={i(0)}><b>{st.leads}</b><span>{T2.kpi.leads}</span></div>
                <div className="kpi" data-rv style={i(1)}><b>{st.areas}</b><span>{AREA_LABEL[page.country]?.[wl] ?? ""}</span></div>
                <div className="kpi" data-rv style={i(2)}><b>{st.industries}</b><span>{T2.kpi.industries}</span></div>
                <div className="kpi" data-rv style={i(3)}><b>{T2.kpi.firm[0]}</b><span>{T2.kpi.firm[1]}</span></div>
              </div>
              <p className="kpinote">{T2.kpiNote.replace("{date}", st.date)}</p>
            </div>
          )}
        </section>

        {video && (
          <section className="vid" id="video"><div className="wrap" style={{ maxWidth: 980 }}>
            <div className="kick"><span className="cap">{L.video(video.seconds)}</span></div>
            <div className="frame" data-rv><video controls playsInline preload="none" poster={video.poster} src={video.src} /></div>
          </div></section>
        )}

        {(st || signals.length > 0) && (
          <section className="sec cream"><div className="wrap">
            <div className="kick"><span className="cap gold">{T2.common}</span></div>
            <div className="two" style={st ? undefined : { gridTemplateColumns: "1fr" }}>
              {st && <Presence title={st.kinds.nosite > 0 ? T2.presenceTitle : T2.common} note={T2.presenceNote.replace("{date}", st.date)}
                rows={presenceRows} total={st.leads} opening={T2.opening} />}
              <div className="box">
                {signals.map((sg, k) => (
                  <div className="prow" key={sg.title} style={{ gridTemplateColumns: "auto 1fr", alignItems: "start", borderTop: k ? undefined : 0 }}>
                    <span className="gi" style={{ width: 38, height: 38, margin: 0 }}><Icon name={sigIcons[k] ?? "check"} /></span>
                    <span><b style={{ display: "block", fontSize: 16 }}>{F(sg.title)}</b><span style={{ color: "var(--muted)", fontSize: 14.5 }}>{F(sg.text)}</span></span>
                  </div>))}
              </div>
            </div>
          </div></section>
        )}

        {samples.length > 0 && (
          <section className="sec"><div className="wrap">
            <div className="kick"><span className="cap gold">{st ? T2.examples : (fr ? L.examples : F("Example leads from across {land}"))}</span></div>
            <div className="tiles">{samples.slice(0, 2).map(tile)}</div>
          </div></section>
        )}

        <section className="sec dark"><div className="wrap">
          <h2>{T2.revenue.replace(/(revenue|chiffre d'affaires)$/, "")}<i>{(T2.revenue.match(/(revenue|chiffre d'affaires)$/) ?? [""])[0]}</i></h2>
          <div className="rs">{T2.reasons.map(([ic, h, d], k) => (
            <div className="rcard" key={h} data-rv style={i(k)}><span className="gi"><Icon name={ic} /></span><h3>{h}</h3><p>{d}</p></div>))}</div>
          <div className="kick"><span className="cap" style={{ color: "var(--gink)" }}>{T2.howTitle}</span></div>
          <div className="steps">{T2.steps.map(([ic, h, d], k) => (
            <div className="step" key={h} data-rv style={i(k)}><div className="no"><b>{String(k + 1).padStart(2, "0")}</b><span className="ring"><Icon name={ic} /></span></div><h3>{h.split("|").map((t, j) => <span key={j}>{j > 0 && <br />}{t}</span>)}</h3>{d && <p>{d}</p>}</div>))}</div>
        </div></section>

        {canBuy && (
          <section id="plans" className="sec cream"><div className="wrap"><h2>{L.pricing}</h2>
            {mode === "test" && <p className="lede2">Stripe-Testmodus: keine echte Zahlung (Testkarte 4242 4242 4242 4242).</p>}
            <div className="rs" style={{ margin: "20px 0 0" }}>{buyable.map((pl, k) => (
              <form className="box" key={pl.key} method="post" action="/api/checkout" data-rv style={i(k)}>
                <h3>{pl.name}</h3><p className="small">{priceLabel(pl)} {L.perMonth}</p>{pl.description && <p className="lede2">{pl.description}</p>}
                <input type="hidden" name="variant_id" value={v.id} /><input type="hidden" name="package" value={pl.key} />
                {preview && <input type="hidden" name="vorschau" value="1" />}
                <button className="btn gold" type="submit" data-cta>{L.subscribe}</button>
              </form>))}</div>
          </div></section>
        )}

        {!step && !sp.angefragt && (
          <section className="sec cream" id="sample"><div className="wrap formwrap">
            <div className="formcard" id="probe">
              <h2>{F(T2.sampleTitle[0])} <span className="gold-h">{localize(nd(fill(T2.sampleTitle[1], P, lang, W)), page.country)}</span></h2>
              <p className="lede2" style={{ color: "#aab4ca" }}>{known ? L.sendsTo(CW.land, personal!.email!) : L.sendsToUnknown}</p>
              {form}
            </div>
            <div className="side2">
              <ul className="ticks2">
                <li><Icon name="check" /><span><b>{L.free}</b> {L.freeText}</span></li>
                <li><Icon name="check" /><span><b>{L.noObl}</b> {L.noOblText}</span></li>
                <li><Icon name="check" /><span>{L.followUp}</span></li>
              </ul>
              <div className="getcard">
                <span className="cap gold">{T2.get.title}</span>
                <div className="gf"><span className="ci"><Icon name="doc" /></span><span><b>{T2.get.pdf[0]}</b><em>{T2.get.pdf[1]}</em></span></div>
                <div className="gf"><span className="ci"><Icon name="table" /></span><span><b>{T2.get.csv[0]}</b><em>{T2.get.csv[1]}</em></span></div>
                {MAP && <MapCard map={MAP as MapData} note={localize(nd(fill(T2.get.map, P, lang, W)), page.country)} />}
              </div>
            </div>
          </div></section>
        )}

        {faq.length > 0 && (
          <section className="sec"><div className="wrap faq2" style={{ maxWidth: 820 }}>
            <h2>{T2.questions}</h2>
            {faq.map((f, k) => <details key={k}><summary>{nd(f.q)}</summary><p>{nd(f.a)}</p></details>)}
          </div></section>
        )}
      </div>
      <SiteFooter lang={lang} />
    </BrandShell>
  );
}

import "server-only";
import { getSettings, pageIsPublic } from "./pages";
import { db } from "./supabase";
import { segKey } from "./country";

/** Anzeigenamen der Zielgruppen für Startseite und Sitemap (Fallback: aus dem Slug). */
const NAMES: Record<string, { name: string; blurb: string }> = {
  accountants: { name: "Accountants & bookkeepers", blurb: "Newly registered companies and firms hiring for finance roles, before they pick an accountant." },
  "insurance-brokers": { name: "Commercial insurance brokers", blurb: "New and growing businesses at the moment liability, property and employer cover is arranged." },
  "financial-advisers": { name: "Financial advisers", blurb: "New directors and growing employers, at the point when pensions, protection and benefits come up." },
  recruitment: { name: "Recruitment agencies", blurb: "Employers with roles open for weeks, repeated postings or several hires at once." },
  "web-agencies": { name: "Web agencies", blurb: "Newly registered companies without a website, when site, domain and email are set up." },
  "it-services": { name: "IT & managed service providers", blurb: "New sites, fast-growing teams and open IT roles." },
};

const COUNTRY: Record<string, string> = { uk: "UK", us: "US", fr: "FR", ie: "IE", nl: "NL" };

export type PublicPage = { slug: string; name: string; blurb: string; country: string; updated: string };

/** Alle öffentlich sichtbaren Landingpages (live und Rechtstexte freigegeben). */
export async function publicPages(): Promise<PublicPage[]> {
  const [settings, { data }] = await Promise.all([
    getSettings(),
    db().from("landing_pages").select("slug, status, updated_at").eq("status", "live").order("slug"),
  ]);
  return (data ?? []).filter((p: any) => pageIsPublic(p, settings)).map((p: any) => {
    const [cc] = String(p.slug).split("/");
    const seg = segKey(p.slug);
    const n = NAMES[seg] ?? { name: seg.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), blurb: "" };
    return { slug: p.slug, ...n, country: COUNTRY[cc] ?? cc.toUpperCase(), updated: p.updated_at };
  });
}

export type HomeStats = { companies: number; signals: number };
export type HomeFeedItem = { company: string; place: string; event: string; date: string; source: string; opener: string; urgency: string };

let statsCache: { at: number; stats: HomeStats } | null = null;

/** Echte Kennzahlen für die Startseite (keine geschätzten oder erfundenen Werte). */
export async function homeStats(): Promise<HomeStats> {
  // Exakte Zählung liest beide Tabellen ganz (Disk-IO): höchstens alle 10 Minuten je Server-Instanz zählen,
  // dazwischen den letzten Stand zeigen; antwortet die Datenbank nicht, ebenfalls den letzten Stand.
  if (statsCache && Date.now() - statsCache.at < 10 * 60_000) return statsCache.stats;
  try {
    const [c, l] = await Promise.all([
      db().from("watch_companies").select("id", { count: "exact", head: true }),
      db().from("leads").select("id", { count: "exact", head: true }),
    ]);
    if (c.error || l.error) throw new Error((c.error ?? l.error)!.message);
    statsCache = { at: Date.now(), stats: { companies: c.count ?? 0, signals: l.count ?? 0 } };
    return statsCache.stats;
  } catch (e) {
    if (statsCache) return statsCache.stats;
    throw e;
  }
}

/** Echte Beispiel-Leads aus den Proben (status sample), nur Firmendaten, je Firma einmal, für die laufende Anzeige. */
/** Ereignis in der Sprache der Seite (Inhalt unverändert, nur übersetzt). */
function eventText(signal: string, raw: string, dateIso: string | null, lang: "en" | "fr" | "de"): string {
  const d = dateIso ? day(dateIso, lang) : "";
  const n = raw.match(/(\d+)\s+open roles/i)?.[1];
  const T = {
    en: { reg: `Newly registered${d ? ` on ${d}` : ""}`, many: (k: string) => `${k} open roles at the same time on the careers page`, open: "Role open for more than 30 days" },
    fr: { reg: `Immatriculée${d ? ` le ${d}` : " récemment"}`, many: (k: string) => `${k} postes ouverts en même temps sur la page carrières`, open: "Poste ouvert depuis plus de 30 jours" },
    de: { reg: `Neu eingetragen${d ? ` am ${d}` : ""}`, many: (k: string) => `${k} offene Stellen gleichzeitig auf der Karriereseite`, open: "Stelle seit über 30 Tagen offen" },
  }[lang];
  if (signal === "new_incorporation" || /registered on/i.test(raw)) return T.reg;
  if (signal === "jobs_3plus" && n) return T.many(n);
  if (signal === "job_open_30d") return T.open;
  return raw;
}

/** Einstiegssatz in der Sprache der Seite. Die gespeicherten Sätze sind englisch; FR/DE aus festen Vorlagen je Signal. */
function openerText(signal: string, raw: string, name: string, n: string | undefined, lang: "en" | "fr" | "de"): string {
  if (lang === "en") return raw;
  const T = {
    fr: {
      reg: `Félicitations pour la création de ${name}. Avez-vous déjà choisi vos partenaires pour les premiers mois ?`,
      many: `J'ai vu que ${name} recrute ${n ? `${n} personnes` : "plusieurs personnes"} en ce moment. Cette croissance est-elle aussi l'occasion de revoir certains sujets en interne ?`,
      open: `J'ai vu qu'un poste est ouvert depuis quelques semaines chez ${name}. Un soutien externe en attendant vous serait-il utile ?`,
    },
    de: {
      reg: `Herzlichen Glückwunsch zur Gründung von ${name}. Haben Sie für die ersten Monate schon die passenden Partner gefunden?`,
      many: `Ich habe gesehen, dass ${name} gerade ${n ? `${n} Stellen` : "mehrere Stellen"} gleichzeitig ausgeschrieben hat. Steht mit dem Wachstum auch das eine oder andere Thema intern auf der Agenda?`,
      open: `Ich habe gesehen, dass bei ${name} eine Stelle seit einigen Wochen offen ist. Wäre Unterstützung von außen bis dahin eine Hilfe?`,
    },
  }[lang];
  if (signal === "new_incorporation") return T.reg;
  if (signal === "jobs_3plus") return T.many;
  if (signal === "job_open_30d") return T.open;
  return "";
}

function day(iso: string, lang: "en" | "fr" | "de"): string {
  return new Date(iso + "T12:00:00Z").toLocaleDateString({ en: "en-GB", fr: "fr-FR", de: "de-DE" }[lang], { day: "numeric", month: "short", year: "numeric" });
}

function sourceText(src: string, lang: "en" | "fr" | "de"): string {
  const s = src.replace(/\s*\(.*\)$/, "");
  const m = s.match(/^(?:Careers page|Karriereseite)\s+(.+)$/i);
  if (m) return { en: `Careers page ${m[1]}`, fr: `Page carrières ${m[1]}`, de: `Karriereseite ${m[1]}` }[lang];
  return s;
}

/** Echte Beispiel-Leads aus den Proben (status sample), nur Firmendaten, je Firma einmal, in der Sprache der Seite. */
/** Platzhalter für den Firmennamen in Texten; die Seite zeigt ihn verwischt. */
export const MASK = "\u2060\u2060";

export async function homeFeed(lang: "en" | "fr" | "de" = "en"): Promise<HomeFeedItem[]> {
  const { data } = await db().from("leads")
    .select("event_summary, event_date, source_name, signal_type, country, company_id, opener, urgency, watch_companies!inner(name, city)")
    .eq("status", "sample").eq("country", "UK").order("event_date", { ascending: false }).limit(60);
  const seen = new Set<string>();
  const out: HomeFeedItem[] = [];
  for (const l of (data ?? []) as any[]) {
    if (seen.has(l.company_id) || out.length >= 8) continue;
    seen.add(l.company_id);
    const name = String(l.watch_companies.name);
    const roles = String(l.event_summary).match(/(\d+)\s+open roles/i)?.[1];
    let ev = String(l.event_summary).split(/(?<=\.)\s/)[0].split(" (")[0].replace(/\.$/, "");
    if (ev.toUpperCase().startsWith(name.toUpperCase())) ev = ev.slice(name.length).trim();
    ev = ev.replace(/\s*[–—]\s*/g, ", ");
    ev = eventText(String(l.signal_type ?? ""), ev, l.event_date, lang);
    // Firmenname nie öffentlich zeigen (sonst verschenken wir den Lead): Platzhalter, im Browser verwischt
    out.push({
      company: "x".repeat(Math.min(16, Math.max(8, name.length))),
      place: nice(String(l.watch_companies.city ?? "").replace(/\s*\(.*$/, "")),
      event: ev.charAt(0).toUpperCase() + ev.slice(1),
      date: l.event_date ? day(l.event_date, lang) : "",
      source: sourceText(String(l.source_name), lang).split(name).join("").split(nice(name)).join("").trim(),
      opener: openerText(String(l.signal_type ?? ""), String(l.opener ?? "").replace(/\s*[–—]\s*/g, ", ").split(name).join(MASK),
        MASK, roles, lang),
      urgency: String(l.urgency ?? ""),
    });
  }
  return out;
}

/** GROSSBUCHSTABEN aus dem Register lesbar machen (Ltd, LLP bleiben erkennbar). */
function nice(s: string): string {
  if (s !== s.toUpperCase()) return s;
  return s.toLowerCase().replace(/\b([a-z])/g, (c) => c.toUpperCase()).replace(/\bLlp\b/g, "LLP").replace(/\bPlc\b/g, "PLC");
}

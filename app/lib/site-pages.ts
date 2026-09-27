import "server-only";
import { getSettings, pageIsPublic } from "./pages";
import { db } from "./supabase";

/** Anzeigenamen der Zielgruppen für Startseite und Sitemap (Fallback: aus dem Slug). */
const NAMES: Record<string, { name: string; blurb: string }> = {
  accountants: { name: "Accountants & bookkeepers", blurb: "Newly registered companies and local firms hiring for finance roles – before they pick an accountant." },
  "insurance-brokers": { name: "Commercial insurance brokers", blurb: "New and growing businesses at the moment liability, property and employer cover is arranged." },
  "financial-advisers": { name: "Financial advisers", blurb: "New directors and growing employers – when pensions, protection and benefits come up." },
  recruitment: { name: "Recruitment agencies", blurb: "Employers with roles open for weeks, repeated postings or several hires at once." },
  "web-agencies": { name: "Web agencies", blurb: "New companies and businesses with outdated or missing websites." },
  "it-services": { name: "IT & managed service providers", blurb: "New sites, fast-growing teams and open IT roles." },
};

const COUNTRY: Record<string, string> = { uk: "UK", us: "US", fr: "France", ie: "Ireland", nl: "Netherlands" };

export type PublicPage = { slug: string; name: string; blurb: string; country: string; updated: string };

/** Alle öffentlich sichtbaren Landingpages (live und Rechtstexte freigegeben). */
export async function publicPages(): Promise<PublicPage[]> {
  const [settings, { data }] = await Promise.all([
    getSettings(),
    db().from("landing_pages").select("slug, status, updated_at").eq("status", "live").order("slug"),
  ]);
  return (data ?? []).filter((p: any) => pageIsPublic(p, settings)).map((p: any) => {
    const [cc, seg] = String(p.slug).split("/");
    const n = NAMES[seg] ?? { name: seg.replace(/-/g, " ").replace(/^./, (c) => c.toUpperCase()), blurb: "" };
    return { slug: p.slug, ...n, country: COUNTRY[cc] ?? cc.toUpperCase(), updated: p.updated_at };
  });
}

export type HomeStats = { companies: number; signals: number };
export type HomeFeedItem = { company: string; place: string; event: string; date: string; source: string; opener: string; urgency: string };

/** Echte Kennzahlen für die Startseite (keine geschätzten oder erfundenen Werte). */
export async function homeStats(): Promise<HomeStats> {
  const [c, l] = await Promise.all([
    db().from("watch_companies").select("id", { count: "exact", head: true }),
    db().from("leads").select("id", { count: "exact", head: true }),
  ]);
  return { companies: c.count ?? 0, signals: l.count ?? 0 };
}

/** Echte Beispiel-Leads aus den Proben (status sample), nur Firmendaten, je Firma einmal, für die laufende Anzeige. */
export async function homeFeed(): Promise<HomeFeedItem[]> {
  const { data } = await db().from("leads")
    .select("event_summary, event_date, source_name, country, company_id, opener, urgency, watch_companies!inner(name, city)")
    .eq("status", "sample").eq("country", "UK").order("event_date", { ascending: false }).limit(60);
  const seen = new Set<string>();
  const out: HomeFeedItem[] = [];
  for (const l of (data ?? []) as any[]) {
    if (seen.has(l.company_id) || out.length >= 8) continue;
    seen.add(l.company_id);
    const name = String(l.watch_companies.name);
    let ev = String(l.event_summary).split(/(?<=\.)\s/)[0].replace(/\s*\([^)]*\)?/g, "").replace(/\.$/, "");
    if (ev.toUpperCase().startsWith(name.toUpperCase())) ev = ev.slice(name.length).trim();
    ev = ev.replace(/^registered/i, "Newly registered").replace(/\s*[–—]\s*/g, ", ");
    out.push({
      company: nice(name),
      place: nice(String(l.watch_companies.city ?? "").replace(/\s*\(.*$/, "")),
      event: ev.charAt(0).toUpperCase() + ev.slice(1),
      date: l.event_date ? new Date(l.event_date).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "",
      source: String(l.source_name).replace(/\s*\(.*\)$/, ""),
      opener: String(l.opener ?? "").replace(/\s*[–—]\s*/g, ", "),
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

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

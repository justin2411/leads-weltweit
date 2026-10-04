import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { publicPages } from "@/lib/site-pages";

export const dynamic = "force-dynamic";

/** Startseite (EN, FR, DE), alle öffentlichen Landingpages und Rechtstexte – für Suchmaschinen. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const pages = await publicPages().catch(() => []);
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    ...["fr", "de"].map((l) => ({ url: `${base}/${l}`, changeFrequency: "weekly" as const, priority: 0.9 })),
    ...["contact", "fr/contact", "de/kontakt"].map((s) => ({ url: `${base}/${s}`, changeFrequency: "monthly" as const, priority: 0.6 })),
    // Werkzeug für Webagenturen (US/UK/FR)
    ...["us", "uk", "fr"].map((l) => ({ url: `${base}/finder/${l}`, changeFrequency: "daily" as const, priority: 0.7 })),
    ...pages.map((p) => ({ url: `${base}/${p.slug}`, lastModified: p.updated, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...["impressum", "datenschutz", "agb", "legal-notice", "privacy", "terms", "mentions-legales", "confidentialite", "cgv"].map((s) => ({ url: `${base}/${s}`, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}

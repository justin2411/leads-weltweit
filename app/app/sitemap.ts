import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";
import { publicPages } from "@/lib/site-pages";

export const dynamic = "force-dynamic";

/** Startseite, alle öffentlichen Landingpages und Rechtstexte – für Suchmaschinen. */
export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const base = siteUrl();
  const pages = await publicPages().catch(() => []);
  return [
    { url: base, changeFrequency: "weekly", priority: 1 },
    ...pages.map((p) => ({ url: `${base}/${p.slug}`, lastModified: p.updated, changeFrequency: "weekly" as const, priority: 0.8 })),
    ...["impressum", "datenschutz", "agb"].map((s) => ({ url: `${base}/${s}`, changeFrequency: "yearly" as const, priority: 0.2 })),
  ];
}

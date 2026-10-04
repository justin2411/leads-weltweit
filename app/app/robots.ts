import type { MetadataRoute } from "next";
import { siteUrl } from "@/lib/site";

// /login und /dashboard stehen bewusst NICHT hier (Inhaber 03.10.2026): robots.txt ist öffentlich und würde die
// Adressen verraten. Beide Seiten tragen stattdessen noindex/nofollow per Meta-Tag und X-Robots-Tag (next.config.mjs).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/", disallow: ["/api/", "/kunde/", "/danke", "/bewerten"] },
    sitemap: `${siteUrl()}/sitemap.xml`,
  };
}

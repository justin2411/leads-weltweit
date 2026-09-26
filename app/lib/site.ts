/** Öffentliche Basis-URL. Später nur SITE_URL auf https://nextgen-profit.de umstellen. */
export function siteUrl(): string {
  const raw = process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");
  return raw.replace(/\/+$/, "");
}

export const BRAND = process.env.BRAND_NAME || "NextGen Profit";

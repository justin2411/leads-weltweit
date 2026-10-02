/** Öffentliche Basis-URL. Später nur SITE_URL auf https://nextgen-profit.de umstellen. */
export function siteUrl(): string {
  const raw = process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://www.nextgen-profit.de");
  return raw.replace(/\/+$/, "");
}

// Schreibweise wie das Logo ("NextGen Profit"), auch wenn die Variable ohne Leerzeichen gesetzt ist
export const BRAND = (process.env.BRAND_NAME?.trim() || "NextGen Profit").replace(/^NextGenProfit$/i, "NextGen Profit");
/** Rechtsträger (Inhaber 27.09.2026). */
export const LEGAL_NAME = process.env.LEGAL_NAME || "NextGen Profit GmbH";
export const CONTACT = process.env.CONTACT_EMAIL || "info@nextgen-profit.de";

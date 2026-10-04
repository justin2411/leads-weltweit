/** Öffentliche Basis-URL. Später nur SITE_URL auf https://nextgen-profit.de umstellen. */
export function siteUrl(): string {
  const raw = process.env.SITE_URL || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : process.env.NODE_ENV === "development" ? "http://localhost:3000" : "https://www.nextgen-profit.de");
  return raw.replace(/\/+$/, "");
}

// Schreibweise wie das Logo ("NextGen Profit"), auch wenn die Variable ohne Leerzeichen gesetzt ist
export const BRAND = (process.env.BRAND_NAME?.trim() || "NextGen Profit").replace(/^NextGenProfit$/i, "NextGen Profit");
/** Rechtsträger (Inhaber 27.09.2026). */
// Fest im Code (Inhaber 03.10.2026: Einzelunternehmen); eine alte Umgebungsvariable mit „GmbH“ darf nicht mehr greifen
export const LEGAL_NAME = "NextGen Profit, Inhaber Justin Koch";
export const CONTACT = process.env.CONTACT_EMAIL || "info@nextgen-profit.de";

/** Höchstlänge des Seitentitels (Website-Check, Inhaber 04.10.2026: Titel ≤ 60 Zeichen). */
export const TITLE_MAX = 60;

/**
 * Seitentitel ≤ 60 Zeichen: „Text | Marke“ (bzw. „Marke | Text“), passt das nicht, nur der Text; ist auch der zu lang,
 * an einer Wortgrenze gekürzt mit „…“. Gleiche Regel wie scripts/website_check.py `short_title`.
 */
export function fitTitle(main: string, brand: string, brandFirst = false, max = TITLE_MAX): string {
  const m = main.replace(/\s+/g, " ").trim();
  const full = !m ? brand : brandFirst ? `${brand} | ${m}` : `${m} | ${brand}`;
  if (full.length <= max) return full;
  if (m.length <= max) return m;
  const cut = m.slice(0, max - 1);
  const at = cut.lastIndexOf(" ");
  return `${(at > max / 2 ? cut.slice(0, at) : cut).replace(/[\s,;:.–—-]+$/, "")}…`;
}

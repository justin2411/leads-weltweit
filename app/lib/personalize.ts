/**
 * Platzhalter für persönliche Landingpages: {firma}, {ort}, {region}, {branche}.
 * Werte kommen aus dem Mail-Link (?r=<Token der Mail>) – ohne Link greifen neutrale Ersatzwörter.
 * Es wird nichts gespeichert, wer die Seite aufruft (kein Tracking).
 */
export type Personal = { firma?: string; ort?: string; region?: string; branche?: string };

const FALLBACK = {
  en: { firma: "your firm", ort: "your area", region: "your area", branche: "your clients" },
  fr: { firma: "votre entreprise", ort: "votre région", region: "votre région", branche: "vos clients" },
} as const;

/** "Harper & Co Accountants Ltd" -> "Harper & Co Accountants" */
export function cleanFirm(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const n = name.replace(/\s*,?\s*\b(ltd\.?|limited|llc|l\.l\.c\.|inc\.?|llp|plc|corp\.?|gmbh|sarl|sas|s\.a\.s\.)\s*$/i, "").trim();
  return n || undefined;
}

/** "Stockport, Greater Manchester" -> { ort: "Stockport", region: "Greater Manchester" } */
export function splitRegion(region: string | null | undefined): { ort?: string; region?: string } {
  if (!region) return {};
  const parts = region.split(",").map((s) => s.trim()).filter(Boolean);
  if (parts.length === 0) return {};
  const area = parts[parts.length - 1];
  return { ort: parts[0], region: area === "NY" && parts.length > 1 ? parts[0] : area };
}

export function fill(text: string, p: Personal, lang: string): string {
  const fb = lang === "fr" ? FALLBACK.fr : FALLBACK.en;
  return text.replace(/\{(firma|ort|region|branche)\}/g, (_, k: keyof Personal) => (p[k] && p[k]!.trim()) || fb[k]);
}

/** Ersetzt Platzhalter rekursiv in Strings, Arrays und Objekten (Signale, FAQ). */
export function fillDeep<T>(value: T, p: Personal, lang: string): T {
  if (typeof value === "string") return fill(value, p, lang) as T;
  if (Array.isArray(value)) return value.map((x) => fillDeep(x, p, lang)) as T;
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value).map(([k, x]) => [k, fillDeep(x, p, lang)])) as T;
  }
  return value;
}

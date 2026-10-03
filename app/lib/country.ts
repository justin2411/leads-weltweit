/**
 * Länder der Landingpages. Leads kommen aus dem ganzen Land (Inhaber 27.09.2026), daher stehen in Texten
 * keine Orte, sondern {land} ("the UK") und {register} (amtliche Quelle des Landes).
 */
export type CountryCode = "UK" | "US" | "FR";

export const COUNTRIES: Record<CountryCode, {
  path: string; lang: "en" | "fr"; flag: string;
  name: { en: string; fr: string; de: string };
  /** in Sätzen: "across the UK", "de toute la France" */
  land: string; landDe?: string; register: string;
}> = {
  UK: { path: "uk", lang: "en", flag: "🇬🇧", name: { en: "United Kingdom", fr: "Royaume-Uni", de: "Vereinigtes Königreich" }, land: "the UK", register: "public business registers" },
  US: { path: "us", lang: "en", flag: "🇺🇸", name: { en: "United States", fr: "États-Unis", de: "USA" }, land: "the US", register: "public business registers" },
  FR: { path: "fr", lang: "fr", flag: "🇫🇷", name: { en: "France", fr: "France", de: "Frankreich" }, land: "la France", landDe: "de toute la France", register: "le registre national des entreprises" },
};

/** Branchen-Schlüssel (englischer Slug) aus dem Seiten-Slug, auch für französische Slugs. */
const FR_SEG: Record<string, string> = {
  "experts-comptables": "accountants", recrutement: "recruitment", "courtiers-assurance": "insurance-brokers",
  "conseillers-patrimoine": "financial-advisers", "agences-web": "web-agencies",
};
export function segKey(slug: string): string {
  const s = slug.split("/")[1] ?? "";
  return FR_SEG[s] ?? s;
}

/** Platzhalter-Wörter des Landes für fill(): {land}, {land_de}, {register}. */
export function countryWords(country: string): Record<string, string> {
  const c = COUNTRIES[country as CountryCode] ?? COUNTRIES.UK;
  return { land: c.land, land_de: c.landDe ?? `de ${c.land}`, register: c.register };
}

/** US-Begriffe statt britischer (Texte der Branchen sind britisch geschrieben). */
const US_TERMS: [RegExp, string][] = [
  [/\bVAT returns?\b/g, "sales tax filings"], [/\bVAT\b/g, "sales tax"], [/Companies House/g, "state business registers"],
  [/\bworkplace pension\b/g, "401(k)"], [/\bauto-enrolment\b/g, "401(k) setup"], [/\bcorporation tax\b/g, "business taxes"],
];
export function localize(text: string, country: string): string {
  if (country !== "US") return text;
  return US_TERMS.reduce((t, [a, b]) => t.replace(a, b), text);
}

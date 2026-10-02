/**
 * Rechnungsland vor dem Checkout (Inhaber 02.10.2026, Variante b): Stripe hat `dynamic_tax_rates` abgeschafft, Stripe Tax
 * kostet Gebühren. Der Kunde wählt sein Land aus einer normalen Länderliste (Land der Seite vorausgewählt); nur
 * Deutschland bekommt 19 % USt., alle anderen zahlen netto (Ausland: § 3a Abs. 2 UStG, EU: Reverse Charge mit USt-IdNr.).
 * Nach der Zahlung vergleicht der Webhook die Angabe mit der echten Rechnungsadresse und meldet Abweichungen dem Inhaber.
 */
export type Billing = string; // ISO-3166-Code, z. B. "US", "GB", "DE"

const ISO = ("AD AE AF AG AL AM AO AR AT AU AZ BA BB BD BE BF BG BH BI BJ BN BO BR BS BT BW BY BZ CA CD CF CG CH CI CL CM CN " +
  "CO CR CU CV CY CZ DE DJ DK DM DO DZ EC EE EG ER ES ET FI FJ FM FR GA GB GD GE GH GM GN GQ GR GT GW GY HK HN HR HT HU ID IE " +
  "IL IN IQ IR IS IT JM JO JP KE KG KH KI KM KN KR KW KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MG MH MK ML MM MN MO MR " +
  "MT MU MV MW MX MY MZ NA NE NG NI NL NO NP NR NZ OM PA PE PG PH PK PL PR PS PT PW PY QA RO RS RU RW SA SB SC SD SE SG SI SK " +
  "SL SM SN SO SR SS ST SV SY SZ TD TG TH TJ TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VN VU WS YE ZA ZM ZW").split(" ");

/** Unsere Ländercodes (UK) auf ISO (GB). */
export function isoOf(pageCountry: string): string {
  const c = pageCountry.toUpperCase();
  return c === "UK" ? "GB" : c;
}

/** Alle Länder alphabetisch in der Sprache der Seite. */
export function billingOptions(lang: "en" | "fr"): { value: string; label: string }[] {
  const names = new Intl.DisplayNames([lang === "fr" ? "fr" : "en-GB"], { type: "region" });
  return ISO.map((c) => ({ value: c, label: names.of(c) ?? c }))
    .sort((a, b) => a.label.localeCompare(b.label, lang === "fr" ? "fr" : "en"));
}

/** Nur bekannte Codes; sonst das Land der Seite (auch ohne JavaScript ein sinnvoller Standard). */
export function normalizeBilling(v: unknown, pageCountry: string): Billing {
  const x = isoOf(String(v ?? ""));
  return ISO.includes(x) ? x : isoOf(pageCountry);
}

/** 19 % deutsche USt. nur bei Rechnungsland Deutschland. */
export function chargesGermanVat(billing: Billing): boolean {
  return billing === "DE";
}

/**
 * Passt die echte Rechnungsadresse (ISO-Code aus Stripe) zur Angabe? Steuerlich zählt nur Deutschland ja/nein;
 * fehlt die Adresse, kein Alarm.
 */
export function vatMismatch(billing: Billing, actualCountry: string | null | undefined): boolean {
  if (!actualCountry) return false;
  return chargesGermanVat(billing) !== (actualCountry.toUpperCase() === "DE");
}

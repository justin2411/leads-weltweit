/**
 * Rechnungsland vor dem Checkout (Inhaber 02.10.2026, Variante b): Stripe hat `dynamic_tax_rates` abgeschafft, Stripe Tax
 * kostet Gebühren. Der Kunde wählt das Land auf der Buchungsseite; nur „Deutschland“ bekommt 19 % USt., alle anderen
 * zahlen netto (Ausland: § 3a Abs. 2 UStG, EU: Reverse Charge mit USt-IdNr.). Nach der Zahlung vergleicht der Webhook die
 * Angabe mit der echten Rechnungsadresse und meldet Abweichungen dem Inhaber.
 */
export type Billing = string; // Ländercode der Seite (US, UK, FR, …), "DE", "EU" oder "OTHER"

const NAMES: Record<string, Record<"en" | "fr", string>> = {
  US: { en: "United States", fr: "États-Unis" }, UK: { en: "United Kingdom", fr: "Royaume-Uni" },
  FR: { en: "France", fr: "France" }, IE: { en: "Ireland", fr: "Irlande" }, NL: { en: "Netherlands", fr: "Pays-Bas" },
  BE: { en: "Belgium", fr: "Belgique" }, SE: { en: "Sweden", fr: "Suède" },
  DE: { en: "Germany", fr: "Allemagne" }, EU: { en: "Other EU country", fr: "Autre pays de l'UE" },
  OTHER: { en: "Other country", fr: "Autre pays" },
};

/** Auswahl auf der Buchungsseite: Land der Seite zuerst (vorausgewählt), dann Deutschland, übrige EU, übrige Welt. */
export function billingOptions(pageCountry: string, lang: "en" | "fr"): { value: string; label: string }[] {
  const pc = pageCountry.toUpperCase();
  return [...new Set([pc, "DE", "EU", "OTHER"])].map((v) => ({ value: v, label: NAMES[v]?.[lang] ?? v }));
}

/** Nur bekannte Werte; sonst das Land der Seite (auch ohne JavaScript ein sinnvoller Standard). */
export function normalizeBilling(v: unknown, pageCountry: string): Billing {
  const x = String(v ?? "").toUpperCase();
  const pc = pageCountry.toUpperCase();
  return [pc, "DE", "EU", "OTHER"].includes(x) ? x : pc;
}

/** 19 % deutsche USt. nur bei Rechnungsland Deutschland. */
export function chargesGermanVat(billing: Billing): boolean {
  return billing === "DE";
}

/**
 * Passt die echte Rechnungsadresse (ISO-Code aus Stripe, z. B. "DE", "GB") zur Angabe? Steuerlich zählt nur
 * Deutschland ja/nein; fehlt die Adresse, kein Alarm.
 */
export function vatMismatch(billing: Billing, actualCountry: string | null | undefined): boolean {
  if (!actualCountry) return false;
  return chargesGermanVat(billing) !== (actualCountry.toUpperCase() === "DE");
}

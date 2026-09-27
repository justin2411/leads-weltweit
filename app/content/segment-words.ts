/**
 * Branchen-Wortschatz für Landingpages. Jede Branche bekommt eigene Platzhalter, die auf der ganzen Seite
 * ersetzt werden (auch in Texten aus der Datenbank):
 *   {beruf}      Berufsbezeichnung der Zielgruppe im Plural ("accountants")
 *   {team}       wie wir den Betrieb ansprechen ("your practice")
 *   {zielkunden} wen der Käufer gewinnen will ("new businesses")
 *   {leistung}   was der Käufer verkauft ("bookkeeping, VAT and payroll")
 *   {anlass}     typische Anlässe ("a first VAT return, payroll set-up or year-end")
 * Dazu kommen {firma}, {ort}, {region}, {branche} aus dem Mail-Link (lib/personalize.ts).
 * Nur Aussagen, die stimmen: keine erfundenen Zahlen, keine Garantien.
 */
export type SegmentCopy = {
  words: Record<"beruf" | "team" | "zielkunden" | "leistung" | "anlass", string>;
  chips: string[];
  steps: string[];
  getsTitle: string;
  gets: string[];
  sampleTitle: string;
  stepsTitle: string;
};

const EN: Record<string, SegmentCopy> = {
  accountants: {
    words: { beruf: "accountants", team: "your practice", zielkunden: "new businesses", leistung: "bookkeeping, VAT and payroll", anlass: "a first VAT return, payroll set-up or year-end" },
    chips: ["New directors", "No accountant yet", "First payroll", "Finance roles open"],
    stepsTitle: "How {firma} wins the first call",
    steps: [
      "We watch Companies House and local careers pages around {ort} every day.",
      "We keep only businesses that will soon need {leistung}, and leave out the rest.",
      "Every Monday {firma} gets the list with date, source and an opening line written for {beruf}.",
    ],
    getsTitle: "What {firma} receives every Monday",
    gets: [
      "Companies registered around {ort} in recent weeks, with registered address and date",
      "Local firms hiring for bookkeeping or payroll roles",
      "The official Companies House record for every lead",
      "A short opening line that refers to {anlass}",
    ],
    sampleTitle: "10 new businesses from {region},\nfree for {firma}",
  },
  "insurance-brokers": {
    words: { beruf: "brokers", team: "your brokerage", zielkunden: "new and growing businesses", leistung: "liability, property and employer cover", anlass: "first premises, first employees or a growing team" },
    chips: ["Newly trading", "First employees", "Growing teams", "Cover to arrange"],
    stepsTitle: "How {firma} reaches them first",
    steps: [
      "We watch Companies House and local careers pages around {ort} every day.",
      "We keep only businesses at the point where {leistung} is arranged or reviewed.",
      "Every Monday {firma} gets the list with date, source and an opening line written for {beruf}.",
    ],
    getsTitle: "What {firma} receives every Monday",
    gets: [
      "Businesses registered around {ort} in recent weeks, with registered address and date",
      "Local firms hiring several people or expanding",
      "The official record for every lead",
      "A short opening line that refers to {anlass}",
    ],
    sampleTitle: "10 businesses from {region} that need cover,\nfree for {firma}",
  },
  "financial-advisers": {
    words: { beruf: "advisers", team: "your advice firm", zielkunden: "business owners", leistung: "pensions, protection and employee benefits", anlass: "a new company, first hires or a growing team" },
    chips: ["New directors", "Workplace pensions", "Protection needs", "Growing employers"],
    stepsTitle: "How {firma} starts the right conversation",
    steps: [
      "We watch Companies House and local careers pages around {ort} every day.",
      "We keep only owners and employers at the point where {leistung} come up.",
      "Every Monday {firma} gets the list with date, source and an opening line written for {beruf}.",
    ],
    getsTitle: "What {firma} receives every Monday",
    gets: [
      "Companies registered around {ort} in recent weeks, with registered address and date",
      "Local employers hiring several people at once",
      "The official record for every lead",
      "A short opening line that refers to {anlass}",
    ],
    sampleTitle: "10 business owners from {region},\nfree for {firma}",
  },
};

const EN_DEFAULT: SegmentCopy = {
  words: { beruf: "service firms", team: "your firm", zielkunden: "new clients", leistung: "your services", anlass: "a new registration or growth" },
  chips: ["Newly registered", "Hiring now", "Growing teams", "Dated and sourced"],
  stepsTitle: "How {firma} gets there first",
  steps: [
    "We watch official registers and local careers pages around {ort} every day.",
    "We keep only businesses with a fresh reason to buy {leistung}.",
    "Every Monday {firma} gets the list with date, source and an opening line.",
  ],
  getsTitle: "What {firma} receives every Monday",
  gets: ["Businesses in {region} with a fresh, dated event", "The official source for every lead", "A short opening line for the first call", "Each lead delivered to you once"],
  sampleTitle: "10 current leads from {region},\nfree for {firma}",
};

const FR_DEFAULT: SegmentCopy = {
  words: { beruf: "prestataires", team: "votre cabinet", zielkunden: "nouveaux clients", leistung: "vos services", anlass: "une création ou une croissance" },
  chips: ["Créations récentes", "Recrutements", "Équipes en croissance", "Datées et sourcées"],
  stepsTitle: "Comment {firma} arrive en premier",
  steps: [
    "Nous suivons chaque jour les registres officiels et les pages carrières autour de {ort}.",
    "Nous ne gardons que les entreprises qui ont une raison récente d'acheter {leistung}.",
    "Chaque lundi, {firma} reçoit la liste avec date, source et une phrase d'accroche.",
  ],
  getsTitle: "Ce que {firma} reçoit chaque lundi",
  gets: ["Des entreprises de {region} avec un événement récent et daté", "La source officielle de chaque piste", "Une phrase d'accroche pour le premier appel", "Chaque piste livrée une seule fois"],
  sampleTitle: "10 pistes récentes de {region},\noffertes à {firma}",
};

/** Wortschatz zur Landingpage (Slug "uk/accountants" → "accountants"). */
export function segmentCopy(slug: string, lang: string): SegmentCopy {
  const seg = slug.split("/")[1] ?? "";
  if (lang === "fr") return FR_DEFAULT;
  return EN[seg] ?? EN_DEFAULT;
}

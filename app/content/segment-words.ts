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
  /** Warum ein Signal für diese Branche zählt (je signal_type) */
  why: Record<string, string>;
  revenueTitle: string;
  revenue: [string, string][];
};

/** Warum es Premium-Leads sind: gilt für alle Branchen, mit Platzhaltern. */
export const PREMIUM: Record<"en" | "fr", { title: string; items: [string, string][] }> = {
  en: {
    title: "Why these are premium leads",
    items: [
      ["Fresh", "Events from the last weeks, not a database that was bought years ago."],
      ["Verified", "Every lead carries the date and the official source, so {firma} can check it in seconds."],
      ["Rated", "Each lead is scored for freshness and relevance. Anything below our minimum is never sent."],
      ["Local", "Only the towns {firma} chooses, so every call is in {team}'s own market."],
      ["Ready to use", "An opening line written for {beruf}, referring to the actual event."],
      ["Delivered once", "No lead reaches {firma} twice."],
    ],
  },
  fr: {
    title: "Pourquoi ce sont des pistes premium",
    items: [
      ["Récentes", "Des événements des dernières semaines, pas une base achetée il y a des années."],
      ["Vérifiées", "Chaque piste indique la date et la source officielle, {firma} peut la vérifier en quelques secondes."],
      ["Notées", "Chaque piste est notée selon sa fraîcheur et sa pertinence. En dessous de notre seuil, elle n'est jamais envoyée."],
      ["Locales", "Uniquement les villes choisies par {firma}."],
      ["Prêtes à l'emploi", "Une phrase d'accroche qui fait référence à l'événement."],
      ["Livrées une fois", "Aucune piste n'arrive deux fois chez {firma}."],
    ],
  },
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
    why: {
      new_incorporation: "No accountant chosen yet. Bookkeeping, VAT, payroll and the first year-end are all still ahead.",
      job_open_30d: "A finance role that stays open is the natural moment to offer outsourced bookkeeping or payroll.",
      jobs_3plus: "A growing team means payroll, pensions and more complex books, often more than one person can handle.",
    },
    revenueTitle: "How {firma} turns this into revenue",
    revenue: [
      ["Be first, not fifth", "New directors choose their accountant in the first weeks. Calling then, with a concrete reason, puts {firma} ahead of practices that only wait for referrals."],
      ["One call, recurring fees", "A new client brings monthly bookkeeping, VAT returns, payroll and a year-end. Won once, the relationship typically runs for years."],
      ["Less time prospecting", "{team} calls companies that have a reason to talk, instead of working through cold lists."],
      ["Growth where you want it", "{firma} picks the towns. Every lead is in the area your team already serves."],
    ],
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
    why: {
      new_incorporation: "Newly trading: public liability now, employers' liability as soon as the first person is hired.",
      job_open_30d: "Hiring means employers' liability and often a review of existing cover.",
      jobs_3plus: "Several hires at once change the risk. The cover the business started with rarely fits any more.",
    },
    revenueTitle: "How {firma} turns this into premium income",
    revenue: [
      ["Before renewal habits form", "A new business has not settled on a broker yet. Reaching it early puts {firma} in the first quote, not the last."],
      ["More than one policy", "Liability, property, employers' liability and later fleet or cyber. One client relationship can grow into several policies."],
      ["Reviews that are due", "Growing firms outgrow their cover. A dated hiring or expansion signal gives {team} a genuine reason to offer a review."],
      ["Your patch only", "{firma} picks the towns. Every lead is in the market your brokerage already covers."],
    ],
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
    why: {
      new_incorporation: "A new director: questions about pensions, protection and paying themselves tax efficiently come up now.",
      job_open_30d: "An employer that is hiring has to offer a workplace pension to eligible staff.",
      jobs_3plus: "A growing team starts to look at benefits to attract and keep people.",
    },
    revenueTitle: "How {firma} turns this into new clients",
    revenue: [
      ["The right moment", "Business owners rarely look for an adviser until something changes. The signal tells {firma} when it has."],
      ["Business and personal", "A director is often a private client too. One relationship can cover the company's pension scheme and the owner's own planning."],
      ["Long relationships", "Pensions, protection and benefits are reviewed year after year. Won once, a client typically stays."],
      ["Local and personal", "{firma} picks the towns, so every meeting is within reach."],
    ],
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
  why: {
    new_incorporation: "A new business still choosing its suppliers.",
    job_open_30d: "A role open for weeks: a sign of pressure and a reason to talk.",
    jobs_3plus: "Several hires at once: the business is growing.",
  },
  revenueTitle: "How {firma} turns this into revenue",
  revenue: [
    ["Be first", "Reach businesses at the moment they choose, not after."],
    ["Less prospecting", "Call companies with a reason to talk, not cold lists."],
    ["Your area only", "{firma} picks the towns, every lead is local."],
  ],
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
  why: {
    new_incorporation: "Une entreprise nouvelle qui choisit encore ses prestataires.",
    job_open_30d: "Un poste ouvert depuis des semaines : un signe de tension et une raison d'échanger.",
    jobs_3plus: "Plusieurs recrutements à la fois : l'entreprise grandit.",
  },
  revenueTitle: "Comment {firma} en fait du chiffre d'affaires",
  revenue: [
    ["Arriver en premier", "Contactez les entreprises au moment où elles choisissent, pas après."],
    ["Moins de prospection", "Appelez des entreprises qui ont une raison d'échanger, pas des listes froides."],
    ["Votre zone uniquement", "{firma} choisit les villes, chaque piste est locale."],
  ],
};

/** Wortschatz zur Landingpage (Slug "uk/accountants" → "accountants"). */
export function segmentCopy(slug: string, lang: string): SegmentCopy {
  const seg = slug.split("/")[1] ?? "";
  if (lang === "fr") return FR_DEFAULT;
  return EN[seg] ?? EN_DEFAULT;
}

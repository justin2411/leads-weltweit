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
      ["Verified", "Every lead is checked against official registers or the company's own website, with the date we found it."],
      ["Rated", "Each lead is scored for freshness and relevance. Anything below our minimum is never sent."],
      ["Local", "Only the towns {firma} would choose, so every call would be in {team}'s own market."],
      ["Ready to call", "Phone number and company email with every lead, plus an opening line written for {beruf} that refers to the actual event."],
      ["Exclusive", "Each lead goes to one firm in your industry only. No competitor of {firma} would receive it."],
    ],
  },
  fr: {
    title: "Pourquoi ce sont des pistes premium",
    items: [
      ["Récentes", "Des événements des dernières semaines, pas une base achetée il y a des années."],
      ["Vérifiées", "Chaque piste est vérifiée dans les registres officiels ou sur le site de l'entreprise, avec la date."],
      ["Notées", "Chaque piste est notée selon sa fraîcheur et sa pertinence. En dessous de notre seuil, elle n'est jamais envoyée."],
      ["Locales", "Uniquement les villes que {firma} choisirait."],
      ["Prêtes à appeler", "Téléphone et e-mail de l'entreprise pour chaque piste, et une phrase d'accroche qui fait référence à l'événement."],
      ["Exclusives", "Chaque piste ne va qu'à une seule entreprise de votre secteur. Aucun concurrent de {firma} ne la recevrait."],
    ],
  },
};

const EN: Record<string, SegmentCopy> = {
  accountants: {
    words: { beruf: "accountants", team: "your practice", zielkunden: "new businesses", leistung: "bookkeeping, VAT and payroll", anlass: "a first VAT return, payroll set-up or year-end" },
    chips: ["New directors", "No accountant yet", "First payroll", "Finance roles open"],
    stepsTitle: "How {firma} could win the first call",
    steps: [
      "We watch Companies House and local careers pages around {ort} every day.",
      "We keep only businesses that will soon need {leistung}, and leave out the rest.",
      "As a client, {firma} would get the list every Monday, with date, source and an opening line written for {beruf}.",
    ],
    getsTitle: "What {firma} would receive every Monday",
    gets: [
      "Companies registered around {ort} in recent weeks, with registered address and date",
      "Local firms hiring for bookkeeping or payroll roles",
      "The official Companies House record for every lead",
      "The company's phone number and email, a short profile and a sales tip for {beruf} with every lead",
      "A short opening line that refers to {anlass}",
    ],
    sampleTitle: "10 new businesses from {region}, free",
    why: {
      new_incorporation: "No accountant chosen yet. Bookkeeping, VAT, payroll and the first year-end are all still ahead.",
      job_open_30d: "A finance role that stays open is the natural moment to offer outsourced bookkeeping or payroll.",
      jobs_3plus: "A growing team means payroll, pensions and more complex books, often more than one person can handle.",
    },
    revenueTitle: "How {firma} could turn this into revenue",
    revenue: [
      ["Be first, not fifth", "New directors choose their accountant in the first weeks. Calling then, with a concrete reason, would put {firma} ahead of practices that only wait for referrals."],
      ["One call, recurring fees", "A new client brings monthly bookkeeping, VAT returns, payroll and a year-end. Won once, the relationship typically runs for years."],
      ["Less time prospecting", "{team} calls companies that have a reason to talk, instead of working through cold lists."],
      ["Growth where you want it", "{firma} would pick the towns. Every lead would be in the area your team already serves."],
    ],
  },
  "insurance-brokers": {
    words: { beruf: "brokers", team: "your brokerage", zielkunden: "new and growing businesses", leistung: "liability, property and employer cover", anlass: "first premises, first employees or a growing team" },
    chips: ["Newly trading", "First employees", "Growing teams", "Cover to arrange"],
    stepsTitle: "How {firma} could reach them first",
    steps: [
      "We watch Companies House and local careers pages around {ort} every day.",
      "We keep only businesses at the point where {leistung} is arranged or reviewed.",
      "As a client, {firma} would get the list every Monday, with date, source and an opening line written for {beruf}.",
    ],
    getsTitle: "What {firma} would receive every Monday",
    gets: [
      "Businesses registered around {ort} in recent weeks, with registered address and date",
      "Local firms hiring several people or expanding",
      "The official record for every lead",
      "The company's phone number and email, a short profile and a sales tip for {beruf} with every lead",
      "A short opening line that refers to {anlass}",
    ],
    sampleTitle: "10 businesses from {region} that need cover, free",
    why: {
      new_incorporation: "Newly trading: public liability now, employers' liability as soon as the first person is hired.",
      job_open_30d: "Hiring means employers' liability and often a review of existing cover.",
      jobs_3plus: "Several hires at once change the risk. The cover the business started with rarely fits any more.",
    },
    revenueTitle: "How {firma} could turn this into premium income",
    revenue: [
      ["Before renewal habits form", "A new business has not settled on a broker yet. Reaching it early would put {firma} in the first quote, not the last."],
      ["More than one policy", "Liability, property, employers' liability and later fleet or cyber. One client relationship can grow into several policies."],
      ["Reviews that are due", "Growing firms outgrow their cover. A dated hiring or expansion signal gives {team} a genuine reason to offer a review."],
      ["Your patch only", "{firma} would pick the towns. Every lead would be in the market your brokerage already covers."],
    ],
  },
  "financial-advisers": {
    words: { beruf: "advisers", team: "your advice firm", zielkunden: "business owners", leistung: "pensions, protection and employee benefits", anlass: "a new company, first hires or a growing team" },
    chips: ["New directors", "Workplace pensions", "Protection needs", "Growing employers"],
    stepsTitle: "How {firma} could start the right conversation",
    steps: [
      "We watch Companies House and local careers pages around {ort} every day.",
      "We keep only owners and employers at the point where {leistung} come up.",
      "As a client, {firma} would get the list every Monday, with date, source and an opening line written for {beruf}.",
    ],
    getsTitle: "What {firma} would receive every Monday",
    gets: [
      "Companies registered around {ort} in recent weeks, with registered address and date",
      "Local employers hiring several people at once",
      "The official record for every lead",
      "The company's phone number and email, a short profile and a sales tip for {beruf} with every lead",
      "A short opening line that refers to {anlass}",
    ],
    sampleTitle: "10 business owners from {region}, free",
    why: {
      new_incorporation: "A new director: questions about pensions, protection and paying themselves tax efficiently come up now.",
      job_open_30d: "An employer that is hiring has to offer a workplace pension to eligible staff.",
      jobs_3plus: "A growing team starts to look at benefits to attract and keep people.",
    },
    revenueTitle: "How {firma} could turn this into new clients",
    revenue: [
      ["The right moment", "Business owners rarely look for an adviser until something changes. The signal would tell {firma} when it has."],
      ["Business and personal", "A director is often a private client too. One relationship can cover the company's pension scheme and the owner's own planning."],
      ["Long relationships", "Pensions, protection and benefits are reviewed year after year. Won once, a client typically stays."],
      ["Local and personal", "{firma} would pick the towns, so every meeting would be within reach."],
    ],
  },
  recruitment: {
    words: { beruf: "recruiters", team: "your agency", zielkunden: "employers that are hiring", leistung: "permanent and temporary staffing", anlass: "a role open for weeks or several hires at once" },
    chips: ["Roles open 30+ days", "Several hires at once", "Reposted roles", "New sites"],
    stepsTitle: "How {firma} could call the right employer first",
    steps: [
      "We read the careers pages of local employers around {ort} every day and note when each role first appeared.",
      "We keep only employers where hiring is hard or growing fast, the moment outside help with {leistung} is welcome.",
      "As a client, {firma} would get the list every Monday, with the roles, how long they have been open and an opening line written for {beruf}.",
    ],
    getsTitle: "What {firma} would receive every Monday",
    gets: [
      "Employers around {ort} with roles open for more than 30 days",
      "Companies hiring several people at the same time",
      "The employer's own careers page as source, with the date we first saw each role",
      "The company's phone number and email, a short profile and a sales tip for {beruf} with every lead",
      "A short opening line that refers to {anlass}",
    ],
    sampleTitle: "10 hiring employers from {region}, free",
    why: {
      job_open_30d: "A role still open after 30 days: the employer has tried alone and is more likely to accept help.",
      jobs_3plus: "Several open roles at once: more work than an internal team can handle, a reason to call about {leistung}.",
      new_incorporation: "A new company that will soon hire its first people.",
    },
    revenueTitle: "How {firma} could turn this into placements",
    revenue: [
      ["Call where it hurts", "An employer with a role open for weeks already knows the cost of the vacancy. The call from {firma} would solve a real problem."],
      ["More than one role", "Companies hiring several people at once can become a client for more than one placement."],
      ["No job board scraping", "The source is the employer's own careers page, so {team} would reach employers competitors find later."],
      ["Your area only", "{firma} would pick the towns. Every lead would be in the market your consultants know."],
    ],
  },
  "web-agencies": {
    words: { beruf: "web agencies", team: "your studio", zielkunden: "new and growing businesses", leistung: "websites, online shops and SEO", anlass: "a new company without a website yet" },
    chips: ["New companies", "No website yet", "Outdated sites", "Growing teams"],
    stepsTitle: "How {firma} could win the first website",
    steps: [
      "We check new company registrations around {ort} every day and look for a live website under the company's name.",
      "We keep businesses without a website or with an outdated one, the moment {leistung} are needed.",
      "As a client, {firma} would get the list every Monday, with date, source and an opening line written for {beruf}.",
    ],
    getsTitle: "What {firma} would receive every Monday",
    gets: [
      "Companies registered around {ort} in recent weeks, with registered address and date",
      "Whether a website was found, and which domains we checked",
      "The official Companies House record for every lead",
      "The company's phone number and email, a short profile and a sales tip for {beruf} with every lead",
      "A short opening line that refers to {anlass}",
    ],
    sampleTitle: "10 new businesses from {region} without a website, free",
    why: {
      new_incorporation: "A company that is just starting: its first website, domain and email are usually still ahead.",
      job_open_30d: "A business hiring for weeks: a better careers page or website could help it find people.",
      jobs_3plus: "A growing business often outgrows the site it started with.",
    },
    revenueTitle: "How {firma} could turn this into projects",
    revenue: [
      ["The first website", "A new company needs a site, a domain and email. Reaching it early would put {firma} in the first conversation."],
      ["Checked, not guessed", "Each lead notes which domains we checked, so {team} would know there is no site yet before calling."],
      ["From build to retainer", "A first site often leads to hosting, updates and SEO, work that continues after launch."],
      ["Local clients", "{firma} would pick the towns, so every lead would be a business nearby."],
    ],
  },
};

const EN_DEFAULT: SegmentCopy = {
  words: { beruf: "service firms", team: "your firm", zielkunden: "new clients", leistung: "your services", anlass: "a new registration or growth" },
  chips: ["Newly registered", "Hiring now", "Growing teams", "Dated and sourced"],
  stepsTitle: "How {firma} could get there first",
  steps: [
    "We watch official registers and local careers pages around {ort} every day.",
    "We keep only businesses with a fresh reason to buy {leistung}.",
    "As a client, {firma} would get the list every Monday, with date, source and an opening line.",
  ],
  getsTitle: "What {firma} would receive every Monday",
  gets: ["Businesses in {region} with a fresh, dated event", "The official source for every lead", "The company's phone number and email, a short profile and a sales tip with every lead", "A short opening line for the first call", "Each lead exclusive to one firm in your industry"],
  sampleTitle: "10 current leads from {region}, free",
  why: {
    new_incorporation: "A new business still choosing its suppliers.",
    job_open_30d: "A role open for weeks: a sign of pressure and a reason to talk.",
    jobs_3plus: "Several hires at once: the business is growing.",
  },
  revenueTitle: "How {firma} could turn this into revenue",
  revenue: [
    ["Be first", "Reach businesses at the moment they choose, not after."],
    ["Less prospecting", "Call companies with a reason to talk, not cold lists."],
    ["Your area only", "{firma} would pick the towns, every lead would be local."],
  ],
};

const FR_DEFAULT: SegmentCopy = {
  words: { beruf: "prestataires", team: "votre cabinet", zielkunden: "nouveaux clients", leistung: "vos services", anlass: "une création ou une croissance" },
  chips: ["Créations récentes", "Recrutements", "Équipes en croissance", "Datées et sourcées"],
  stepsTitle: "Comment {firma} pourrait arriver en premier",
  steps: [
    "Nous suivons chaque jour les registres officiels et les pages carrières autour de {ort}.",
    "Nous ne gardons que les entreprises qui ont une raison récente d'acheter {leistung}.",
    "En tant que client, {firma} recevrait chaque lundi la liste avec date, source et une phrase d'accroche.",
  ],
  getsTitle: "Ce que {firma} recevrait chaque lundi",
  gets: ["Des entreprises de {region} avec un événement récent et daté", "La source officielle de chaque piste", "Le téléphone et l'e-mail de l'entreprise, un court profil et un conseil de vente", "Une phrase d'accroche pour le premier appel", "Chaque piste réservée à une seule entreprise de votre secteur"],
  sampleTitle: "10 pistes récentes de {region}, offertes",
  why: {
    new_incorporation: "Une entreprise nouvelle qui choisit encore ses prestataires.",
    job_open_30d: "Un poste ouvert depuis des semaines : un signe de tension et une raison d'échanger.",
    jobs_3plus: "Plusieurs recrutements à la fois : l'entreprise grandit.",
  },
  revenueTitle: "Comment {firma} pourrait en faire du chiffre d'affaires",
  revenue: [
    ["Arriver en premier", "Contactez les entreprises au moment où elles choisissent, pas après."],
    ["Moins de prospection", "Appelez des entreprises qui ont une raison d'échanger, pas des listes froides."],
    ["Votre zone uniquement", "{firma} choisirait les villes, chaque piste serait locale."],
  ],
};

/** Wortschatz zur Landingpage (Slug "uk/accountants" → "accountants"). */
export function segmentCopy(slug: string, lang: string): SegmentCopy {
  const seg = slug.split("/")[1] ?? "";
  if (lang === "fr") return FR_DEFAULT;
  return EN[seg] ?? EN_DEFAULT;
}

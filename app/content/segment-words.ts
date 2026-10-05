import { segKey } from "@/lib/country";
/**
 * Branchen-Wortschatz für Landingpages. Jede Branche bekommt eigene Platzhalter, die auf der ganzen Seite
 * ersetzt werden (auch in Texten aus der Datenbank):
 *   {beruf}      Berufsbezeichnung der Zielgruppe im Plural ("accountants")
 *   {team}       wie wir den Betrieb ansprechen ("your practice")
 *   {zielkunden} wen der Käufer gewinnen will ("new businesses")
 *   {leistung}   was der Käufer verkauft ("bookkeeping, VAT and payroll")
 *   {anlass}     typische Anlässe ("a first VAT return, payroll set-up or year-end")
 * Dazu kommen {firma}, {branche} aus dem Mail-Link sowie {land} ("the UK", "France") und {register} (Register des Landes).
 * Leads kommen aus dem ganzen Land (Inhaber 27.09.2026), daher keine Orte/Regionen in Texten.
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
      ["Fresh", "Checked every week, not a database that was bought years ago."],
      ["Verified", "Every lead is checked against official registers or the company's own website, with the date we found it."],
      ["Rated", "Each lead is scored for freshness and relevance. Anything below our minimum is never sent."],
      ["Nationwide", "Leads from across {land}, so {firma} is not tied to one town: every lead can be called from anywhere."],
      ["Ready to call", "Phone number and company email, the owner's name where public sources list it, plus an opening line written for {beruf}."],
      ["Exclusive", "Each lead goes to one firm in your industry only. No competitor of {firma} would receive it."],
    ],
  },
  fr: {
    title: "Pourquoi ce sont des pistes premium",
    items: [
      ["Récentes", "Vérifiées chaque semaine, pas une base achetée il y a des années."],
      ["Vérifiées", "Chaque piste est vérifiée dans les registres officiels ou sur le site de l'entreprise, avec la date."],
      ["Notées", "Chaque piste est notée selon sa fraîcheur et sa pertinence. En dessous de notre seuil, elle n'est jamais envoyée."],
      ["Nationales", "Des pistes {land_de} : {firma} n'est pas limitée à une ville, chaque piste peut être appelée de partout."],
      ["Prêtes à appeler", "Téléphone et e-mail de l'entreprise, le nom du dirigeant quand une source publique l'indique, et une phrase d'accroche."],
      ["Exclusives", "Chaque piste ne va qu'à une seule entreprise de votre secteur. Aucun concurrent de {firma} ne la recevrait."],
    ],
  },
};

const EN: Record<string, SegmentCopy> = {
  accountants: {
    words: { beruf: "accountants", team: "your practice", zielkunden: "new businesses", leistung: "bookkeeping, VAT and payroll", anlass: "a first VAT return, payroll set-up or year-end" },
    chips: ["New directors", "No accountant yet", "First payroll", "Owner named"],
    stepsTitle: "How {firma} could win the first call",
    steps: [
      "We monitor public business sources across {land} every day.",
      "We keep only businesses that will soon need {leistung}, and leave out the rest.",
      "As a client, {firma} would get the list every Monday, with date, source and an opening line written for {beruf}.",
    ],
    getsTitle: "What {firma} would receive every Monday",
    gets: [
      "Companies registered across {land} in recent weeks, with registered address and date",
      "The owner or director to ask for, from the public register",
      "The public source for every lead",
      "The company's phone number and email, a short profile and a sales tip for {beruf} with every lead",
      "A short opening line that refers to {anlass}",
    ],
    sampleTitle: "10 new businesses from across {land}, free",
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
      ["The whole country as your market", "Bookkeeping and payroll work remotely, so {firma} can win clients across {land}, not just nearby."],
    ],
  },
  "insurance-brokers": {
    words: { beruf: "brokers", team: "your brokerage", zielkunden: "new and growing businesses", leistung: "liability, property and employer cover", anlass: "first premises, first employees or a growing team" },
    chips: ["Newly trading", "First employees", "Growing teams", "Cover to arrange"],
    stepsTitle: "How {firma} could reach them first",
    steps: [
      "We monitor public business sources across {land} every day.",
      "We keep only businesses at the point where {leistung} is arranged or reviewed.",
      "As a client, {firma} would get the list every Monday, with date, source and an opening line written for {beruf}.",
    ],
    getsTitle: "What {firma} would receive every Monday",
    gets: [
      "Businesses registered across {land} in recent weeks, with registered address and date",
      "Local firms hiring several people or expanding",
      "The official record for every lead",
      "The company's phone number and email, a short profile and a sales tip for {beruf} with every lead",
      "A short opening line that refers to {anlass}",
    ],
    sampleTitle: "10 businesses from across {land} that need cover, free",
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
      ["Nationwide reach", "Commercial cover can be arranged by phone and email, so {firma} can win clients across {land}."],
    ],
  },
  "financial-advisers": {
    words: { beruf: "advisers", team: "your advice firm", zielkunden: "business owners", leistung: "pensions, protection and employee benefits", anlass: "a new company, first hires or a growing team" },
    chips: ["New directors", "Workplace pensions", "Protection needs", "Growing employers"],
    stepsTitle: "How {firma} could start the right conversation",
    steps: [
      "We monitor public business sources across {land} every day.",
      "We keep only owners and employers at the point where {leistung} come up.",
      "As a client, {firma} would get the list every Monday, with date, source and an opening line written for {beruf}.",
    ],
    getsTitle: "What {firma} would receive every Monday",
    gets: [
      "Companies registered across {land} in recent weeks, with registered address and date",
      "Local employers hiring several people at once",
      "The official record for every lead",
      "The company's phone number and email, a short profile and a sales tip for {beruf} with every lead",
      "A short opening line that refers to {anlass}",
    ],
    sampleTitle: "10 business owners from across {land}, free",
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
      ["Personal, wherever they are", "Video calls make every business owner across {land} a realistic client for {firma}."],
    ],
  },
  recruitment: {
    words: { beruf: "recruiters", team: "your agency", zielkunden: "employers that are hiring", leistung: "permanent and temporary staffing", anlass: "a role open for weeks or several hires at once" },
    chips: ["Roles open 30+ days", "Several hires at once", "Reposted roles", "New sites"],
    stepsTitle: "How {firma} could call the right employer first",
    steps: [
      "We monitor hiring activity across {land} every day and note when each role first appeared.",
      "We keep only employers where hiring is hard or growing fast, the moment outside help with {leistung} is welcome.",
      "As a client, {firma} would get the list every Monday, with the roles, how long they have been open and an opening line written for {beruf}.",
    ],
    getsTitle: "What {firma} would receive every Monday",
    gets: [
      "Employers across {land} with roles open for more than 30 days",
      "Companies hiring several people at the same time",
      "The employer's own careers page as source, with the date we first saw each role",
      "The company's phone number and email, a short profile and a sales tip for {beruf} with every lead",
      "A short opening line that refers to {anlass}",
    ],
    sampleTitle: "10 hiring employers from across {land}, free",
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
      ["The whole country", "{firma} is not tied to one town. Your consultants can place candidates with employers across {land}."],
    ],
  },
  "web-agencies": {
    words: { beruf: "web agencies", team: "your studio", zielkunden: "local businesses", leistung: "websites, online shops and SEO", anlass: "a missing, outdated or insecure website" },
    chips: ["No website", "Outdated website", "Not mobile-friendly", "Security gaps"],
    stepsTitle: "How {firma} could win the next website",
    steps: [
      "We check local businesses across {land} every week: is there a website, and does it still hold up?",
      "We keep businesses with no website, an outdated or non-mobile site or security gaps, the moment {leistung} are needed.",
      "As a client, {firma} would get the list every Monday, with phone, email and an opening line written for {beruf}.",
    ],
    getsTitle: "What {firma} would receive every Monday",
    gets: [
      "Local businesses across {land} with no website, an outdated site or security gaps",
      "What we found when we checked their website, and when",
      "The company's phone number and email, the owner's name where public sources list it",
      "A short profile and a sales tip for {beruf} with every lead",
      "A short opening line that refers to {anlass}",
    ],
    sampleTitle: "10 free leads from across {land}",
    why: {
      new_incorporation: "A company that is just starting: its first website, domain and email are usually still ahead.",
      no_website: "Customers search online first. Without a website, this business is hard to find.",
      website_outdated: "An old site that hurts trust and rarely brings in enquiries.",
      website_not_mobile: "Most visitors arrive on a phone, and this site does not work there.",
      no_https: "Browsers warn visitors that this site is not secure, and many leave.",
      website_broken: "The website is down or parked, so customers find nothing.",
      job_open_30d: "A business hiring for weeks: a better careers page or website could help it find people.",
      jobs_3plus: "A growing business often outgrows the site it started with.",
    },
    revenueTitle: "How {firma} could turn this into projects",
    revenue: [
      ["The next website", "A business without a website, or with one that lets it down, needs {leistung}. Reaching it first would put {firma} in the conversation."],
      ["Checked, not guessed", "We check each company's own website, so {team} would know the gap before calling."],
      ["From build to retainer", "A new site often leads to hosting, updates and SEO, work that continues after launch."],
      ["Clients anywhere", "Websites are built remotely, so {firma} can win businesses across {land}."],
    ],
  },
  // Marketing-/SEO-Agenturen (S12, Inhaber 05.10.2026): dieselben Firmen wie Webagenturen (keine oder schwache Website)
  "marketing-agencies": {
    words: { beruf: "marketing agencies", team: "your agency", zielkunden: "local businesses", leistung: "local SEO, Google profiles, ads and social media", anlass: "a missing or weak web presence" },
    chips: ["No website", "Outdated website", "Not mobile-friendly", "Security gaps"],
    stepsTitle: "How {firma} could win the next client",
    steps: [
      "We check local businesses across {land} every week: is there a website, and does it still hold up?",
      "We keep businesses with no website, an outdated or non-mobile site or security gaps: hard to find and hard to trust online.",
      "As a client, {firma} would get the list every Monday, with phone, email and an opening line written for {beruf}.",
    ],
    getsTitle: "What {firma} would receive every Monday",
    gets: [
      "Local businesses across {land} with no website, an outdated site or security gaps",
      "What we found when we checked their website, and when",
      "The company's phone number and email, the owner's name where public sources list it",
      "A short profile and a sales tip for {beruf} with every lead",
      "A short opening line that refers to {anlass}",
    ],
    sampleTitle: "10 free leads from across {land}",
    why: {
      new_incorporation: "A company that is just starting: how it will win its first customers is still open.",
      no_website: "Customers search online first. Without a website, this business is hard to find.",
      website_outdated: "An old site that hurts trust and rarely brings in enquiries.",
      website_not_mobile: "Most visitors arrive on a phone, and this site does not work there.",
      no_https: "Browsers warn visitors that this site is not secure, and many leave.",
      website_broken: "The website is down or parked, so people who search find nothing.",
      job_open_30d: "A business hiring for weeks: better visibility could help it reach people.",
      jobs_3plus: "A growing business usually needs more customers to keep the new team busy.",
    },
    revenueTitle: "How {firma} could turn this into clients",
    revenue: [
      ["A visible gap", "A business that is hard to find online needs {leistung}. Reaching it first would put {firma} in the conversation."],
      ["Checked, not guessed", "We check each company's own website, so {team} would know the gap before calling."],
      ["From setup to retainer", "A Google profile or a first campaign often leads to monthly SEO, ads or social media work."],
      ["Clients anywhere", "Marketing works remotely, so {firma} can win businesses across {land}."],
    ],
  },
};

const EN_DEFAULT: SegmentCopy = {
  words: { beruf: "service firms", team: "your firm", zielkunden: "new clients", leistung: "your services", anlass: "a new registration or growth" },
  chips: ["Newly registered", "Hiring now", "Growing teams", "Dated and sourced"],
  stepsTitle: "How {firma} could get there first",
  steps: [
    "We monitor public business sources across {land} every day.",
    "We keep only businesses with a fresh reason to buy {leistung}.",
    "As a client, {firma} would get the list every Monday, with date, source and an opening line.",
  ],
  getsTitle: "What {firma} would receive every Monday",
  gets: ["Businesses across {land} with a fresh, dated event", "The official source for every lead", "The company's phone number and email, a short profile and a sales tip with every lead", "A short opening line for the first call", "Each lead exclusive to one firm in your industry"],
  sampleTitle: "10 current leads from across {land}, free",
  why: {
    new_incorporation: "A new business still choosing its suppliers.",
    job_open_30d: "A role open for weeks: a sign of pressure and a reason to talk.",
    jobs_3plus: "Several hires at once: the business is growing.",
  },
  revenueTitle: "How {firma} could turn this into revenue",
  revenue: [
    ["Be first", "Reach businesses at the moment they choose, not after."],
    ["Less prospecting", "Call companies with a reason to talk, not cold lists."],
    ["The whole country", "{firma} is not tied to one town: leads come from across {land}."],
  ],
};

const FR_DEFAULT: SegmentCopy = {
  words: { beruf: "prestataires", team: "votre cabinet", zielkunden: "nouveaux clients", leistung: "vos services", anlass: "une création ou une croissance" },
  chips: ["Créations récentes", "Recrutements", "Équipes en croissance", "Datées et sourcées"],
  stepsTitle: "Comment {firma} pourrait arriver en premier",
  steps: [
    "Nous suivons chaque jour des sources publiques sur les entreprises {land_de}.",
    "Nous ne gardons que les entreprises qui ont une raison récente d'acheter {leistung}.",
    "En tant que client, {firma} recevrait chaque lundi la liste avec date, source et une phrase d'accroche.",
  ],
  getsTitle: "Ce que {firma} recevrait chaque lundi",
  gets: ["Des entreprises {land_de} avec un événement récent et daté", "La source officielle de chaque piste", "Le téléphone et l'e-mail de l'entreprise, un court profil et un conseil de vente", "Une phrase d'accroche pour le premier appel", "Chaque piste réservée à une seule entreprise de votre secteur"],
  sampleTitle: "10 pistes récentes {land_de}, offertes",
  why: {
    new_incorporation: "Une entreprise nouvelle qui choisit encore ses prestataires.",
    job_open_30d: "Un poste ouvert depuis des semaines : un signe de tension et une raison d'échanger.",
    jobs_3plus: "Plusieurs recrutements à la fois : l'entreprise grandit.",
  },
  revenueTitle: "Comment {firma} pourrait en faire du chiffre d'affaires",
  revenue: [
    ["Arriver en premier", "Contactez les entreprises au moment où elles choisissent, pas après."],
    ["Moins de prospection", "Appelez des entreprises qui ont une raison d'échanger, pas des listes froides."],
    ["Toute la France", "{firma} n'est pas limitée à une ville : les pistes viennent de toute la France."],
  ],
};

/** Agences web auf Französisch (Inhaber 02.10.2026: wie die englische Seite, ohne „créations récentes“). */
const FR_WEB: SegmentCopy = {
  ...FR_DEFAULT,
  words: { beruf: "agences web", team: "votre agence", zielkunden: "entreprises locales", leistung: "sites web, boutiques en ligne et référencement", anlass: "un site absent, ancien ou non sécurisé" },
  chips: ["Sans site web", "Site ancien", "Pas adapté au mobile", "Failles de sécurité"],
  stepsTitle: "Comment {firma} pourrait décrocher le prochain site",
  steps: [
    "Chaque semaine, nous vérifions les entreprises locales {land_de} : ont-elles un site, et tient-il encore la route ?",
    "Nous gardons celles sans site, avec un site ancien ou non adapté au mobile, ou avec des failles de sécurité.",
    "En tant que client, {firma} recevrait la liste chaque lundi, avec téléphone, e-mail et une phrase d'accroche.",
  ],
  gets: ["Des entreprises locales {land_de} sans site, avec un site ancien ou des failles de sécurité", "Ce que nous avons constaté sur leur site, et quand", "Le téléphone et l'e-mail de l'entreprise, le nom du dirigeant quand une source publique l'indique", "Un court profil et un conseil de vente pour chaque piste", "Une phrase d'accroche pour le premier appel"],
  sampleTitle: "10 pistes gratuites {land_de}",
  why: {
    ...FR_DEFAULT.why,
    no_website: "Les clients cherchent d'abord en ligne. Sans site, cette entreprise est difficile à trouver.",
    website_outdated: "Un site ancien qui inspire peu confiance et apporte peu de demandes.",
    website_not_mobile: "La plupart des visiteurs arrivent sur mobile, et ce site n'y fonctionne pas.",
    no_https: "Les navigateurs signalent ce site comme non sécurisé, et beaucoup de visiteurs repartent.",
    website_broken: "Le site est hors service ou parqué : les clients ne trouvent rien.",
  },
  revenueTitle: "Comment {firma} pourrait en faire des projets",
  revenue: [
    ["Le prochain site", "Une entreprise sans site, ou avec un site qui la dessert, a besoin de {leistung}. La contacter la première place {firma} dans la discussion."],
    ["Vérifié, pas deviné", "Nous vérifions le site de chaque entreprise : {team} connaît le manque avant d'appeler."],
    ["Toute la France", "Les sites se font à distance : {firma} peut gagner des clients partout en France."],
  ],
};

/** Wortschatz zur Landingpage (Slug "uk/accountants" → "accountants"). */
export function segmentCopy(slug: string, lang: string): SegmentCopy {
  const seg = segKey(slug);
  if (lang === "fr") return seg === "web-agencies" ? FR_WEB : FR_DEFAULT;
  return EN[seg] ?? EN_DEFAULT;
}

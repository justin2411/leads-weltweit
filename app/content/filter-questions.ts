/**
 * Wunschprofil nach dem Kauf, je Branche (Inhaber 02.10.2026: „das formular muss für die jeweilige branche angepasst
 * sein … konkretes abfragen, damit wir das so genau wie möglich bedienen können“). Nur Fragen, die die
 * Montagslieferung wirklich auswerten kann: Signale (dieselben Schlüssel wie im Probe-Formular, Zuordnung in
 * scripts/lib/wishes.py), Branchen der Lead-Firmen, Regionen, Ausschlüsse.
 */
import { wishesFor } from "./sample-wishes";

export const SEG_KEY: Record<string, string> = {
  S1: "recruitment", S2: "web-agencies", S4: "insurance-brokers", S5: "accountants", S9: "financial-advisers", S12: "marketing-agencies",
};

type L = { en: string; fr: string };
/** Kurze Erklärung je Signal: woran der Kunde den Lead erkennt und warum er ihn ansprechen kann. */
const DESC: Record<string, L> = {
  no_website: { en: "Reachable by phone and email, but no website of their own.", fr: "Joignables par téléphone et e-mail, mais sans site web." },
  website_outdated: { en: "Old design or technology, ready for a redesign.", fr: "Design ou technique dépassés, prêts pour une refonte." },
  not_mobile: { en: "The site does not work properly on phones.", fr: "Le site ne s'affiche pas correctement sur mobile." },
  security: { en: "No secure connection, browsers warn visitors.", fr: "Pas de connexion sécurisée, les navigateurs alertent les visiteurs." },
  broken: { en: "The site is down, parked or shows errors.", fr: "Le site est en panne, parqué ou affiche des erreurs." },
  new_incorporation: { en: "Newly registered companies choosing their first providers.", fr: "Entreprises nouvellement créées qui choisissent leurs premiers prestataires." },
  job_open_30d: { en: "The internal search has stalled, the classic moment for a recruiter.", fr: "La recherche interne piétine, le bon moment pour un cabinet." },
  jobs_3plus: { en: "Growing teams that need help hiring fast.", fr: "Des équipes en croissance qui doivent recruter vite." },
  new_location: { en: "A new site means new staff to hire.", fr: "Un nouveau site, donc de nouveaux postes à pourvoir." },
  growth: { en: "Companies hiring several people at once.", fr: "Des entreprises qui recrutent plusieurs personnes à la fois." },
  finance_roles: { en: "Open finance or bookkeeping roles they may outsource instead.", fr: "Postes en finance ouverts qu'elles pourraient externaliser." },
  expansion: { en: "New sites or fast hiring, new risks to insure.", fr: "Nouveaux sites ou recrutements rapides, de nouveaux risques à assurer." },
  fleet_warehouse: { en: "Vehicles or warehouse space that need cover.", fr: "Véhicules ou entrepôts à assurer." },
  new_director: { en: "New directors who are setting up their finances.", fr: "Nouveaux dirigeants qui organisent leurs finances." },
};

type Q = { signals: L; signalsHint: L; industries: L; industriesPh: L; exclusionsPh: L };
const GENERIC: Q = {
  signals: { en: "Which signals matter to you?", fr: "Quels signaux vous intéressent ?" },
  signalsHint: { en: "Leave all ticked if you want everything that fits your business.", fr: "Laissez tout coché si vous voulez tout ce qui correspond à votre activité." },
  industries: { en: "Industries to focus on", fr: "Secteurs à privilégier" },
  industriesPh: { en: "e.g. construction, logistics, hospitality", fr: "ex. BTP, logistique, restauration" },
  exclusionsPh: { en: "e.g. your existing clients", fr: "ex. vos clients actuels" },
};
const BY_SEG: Record<string, Partial<Q>> = {
  "web-agencies": {
    signals: { en: "Which website situations do you want to sell into?", fr: "Sur quelles situations web voulez-vous intervenir ?" },
    signalsHint: { en: "Tick what you offer: a first website, a redesign, a mobile fix, security or rescue of a broken site.", fr: "Cochez ce que vous proposez : premier site, refonte, version mobile, sécurité ou réparation d'un site en panne." },
    industries: { en: "Which kinds of businesses are your best clients?", fr: "Quels types d'entreprises sont vos meilleurs clients ?" },
    industriesPh: { en: "e.g. restaurants, trades, salons, dental practices", fr: "ex. restaurants, artisans, salons, cabinets dentaires" },
    exclusionsPh: { en: "e.g. your existing clients, competitors, franchises", fr: "ex. vos clients actuels, concurrents, franchises" },
  },
  "marketing-agencies": {
    signals: { en: "Which online gaps do you want to sell into?", fr: "Sur quels manques en ligne voulez-vous intervenir ?" },
    signalsHint: { en: "Tick what fits your services: no website, an outdated or non-mobile site, security warnings or a broken site.", fr: "Cochez ce qui correspond à vos services : pas de site, site ancien ou non mobile, alertes de sécurité ou site en panne." },
    industries: { en: "Which kinds of businesses are your best clients?", fr: "Quels types d'entreprises sont vos meilleurs clients ?" },
    industriesPh: { en: "e.g. restaurants, trades, salons, dental practices", fr: "ex. restaurants, artisans, salons, cabinets dentaires" },
    exclusionsPh: { en: "e.g. your existing clients, competitors, franchises", fr: "ex. vos clients actuels, concurrents, franchises" },
  },
  recruitment: {
    signals: { en: "Which hiring situations do you want?", fr: "Quelles situations de recrutement vous intéressent ?" },
    industries: { en: "Industries or job types you place", fr: "Secteurs ou métiers que vous placez" },
    industriesPh: { en: "e.g. construction, logistics, finance roles", fr: "ex. BTP, logistique, postes en finance" },
  },
};

export type FilterQuestions = Q & { options: { key: string; label: L; desc?: L }[] };

export function filterQuestions(segmentId: string | undefined): FilterQuestions {
  const key = SEG_KEY[segmentId ?? ""] ?? "";
  const options = wishesFor(key).map((w) => ({ key: w.key, label: { en: w.en, fr: w.fr }, desc: DESC[w.key] }));
  return { ...GENERIC, ...(BY_SEG[key] ?? {}), options };
}

/** Alle Schlüssel, die das Formular senden darf (Speichern prüft dagegen). */
export function allFilterKeys(): string[] {
  const segs = [...Object.keys(SEG_KEY), undefined];
  return [...new Set(segs.flatMap((s) => filterQuestions(s).options.map((o) => o.key)))];
}

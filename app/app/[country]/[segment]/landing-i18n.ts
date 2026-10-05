/**
 * Inhalte der Landingpages im Stil der Startseite (Inhaber 03.10.2026): Hero-Grafik mit Punktkarte des Landes und
 * wechselnden Beispiel-Signalen je Branche, Methode „From public record to your next client“ je Branche und Land,
 * Probe-Formular und Fragen. Beispiel-Signale sind Illustrationen typischer Ereignisse (Firmennamen verdeckt,
 * keine erfundenen Zahlen); Quellen und Signalarten entsprechen den Quellen, aus denen die Werke tatsächlich liefern.
 */
export type LLang = "en" | "fr";
export type Seg = "web-agencies" | "recruitment" | "accountants" | "insurance-brokers" | "financial-advisers" | "marketing-agencies";
/** Branchen mit eigenen Quellen/Beispielen; Marketing-/SEO-Agenturen (S12) nutzen die der Webagenturen (gleiche Leads). */
type BaseSeg = Exclude<Seg, "marketing-agencies">;
export type Cc = "UK" | "US" | "FR";

/** Beispiel-Signal im Hero: Stadt (echte Stadt im Land), Datum, Quelle, Ereignis. */
export type HeroSig = { place: string; date: string; source: string; event: string };

/** Koordinaten der Städte (Breite, Länge) für die Pins der Punktkarte. */
export const CITY: Record<Cc, Record<string, [number, number]>> = {
  UK: {
    London: [51.507, -0.128], Manchester: [53.481, -2.242], Birmingham: [52.486, -1.89], Leeds: [53.8, -1.549], Bristol: [51.454, -2.588],
    Glasgow: [55.864, -4.252], Edinburgh: [55.953, -3.188], Liverpool: [53.408, -2.991], Sheffield: [53.381, -1.47], Nottingham: [52.954, -1.158],
    Cardiff: [51.481, -3.179], Reading: [51.454, -0.978], Norwich: [52.63, 1.297], Newcastle: [54.978, -1.618],
  },
  US: {
    "New York": [40.713, -74.006], Albany: [42.653, -73.757], Buffalo: [42.886, -78.878], Hartford: [41.764, -72.685], Stamford: [41.053, -73.539],
    "New Haven": [41.308, -72.928], Boston: [42.36, -71.059], Chicago: [41.878, -87.63], Dallas: [32.777, -96.797], Houston: [29.76, -95.37],
    Denver: [39.739, -104.99], Phoenix: [33.448, -112.074], Atlanta: [33.749, -84.388], Portland: [45.515, -122.679], Austin: [30.267, -97.743],
    Seattle: [47.606, -122.332], Miami: [25.762, -80.192], Columbus: [39.961, -82.999], Nashville: [36.163, -86.781],
  },
  FR: {
    Paris: [48.857, 2.352], Lyon: [45.764, 4.836], Marseille: [43.296, 5.37], Bordeaux: [44.838, -0.579], Lille: [50.629, 3.057],
    Nantes: [47.218, -1.554], Toulouse: [43.605, 1.444], Rennes: [48.117, -1.678], Strasbourg: [48.573, 7.752], Montpellier: [43.611, 3.877],
    Nice: [43.71, 7.262], Grenoble: [45.188, 5.724], Dijon: [47.322, 5.041],
  },
};

/**
 * Projektion der Punktkarten (content/home-dot-maps.ts) aus den vorhandenen Pins nachgerechnet:
 * UK und FR Mercator, US Albers (Standardparallelen 29,5° / 45,5°). Fehler unter 1 Kartenpixel.
 */
export function project(cc: Cc, lat: number, lon: number): [number, number] {
  const rad = Math.PI / 180;
  const merc = (la: number) => Math.log(Math.tan(Math.PI / 4 + (la * rad) / 2)) / rad;
  if (cc === "UK") return [32.2057 * lon + 653.656, -30.8668 * merc(lat) + 2365.081];
  if (cc === "FR") {
    const m = merc(lat);
    return [25.7486 * lon + 0.0525 * m + 154.3866, -0.0111 * lon - 26.1267 * m + 1574.8333];
  }
  const n = (Math.sin(29.5 * rad) + Math.sin(45.5 * rad)) / 2, C = Math.cos(29.5 * rad) ** 2 + 2 * n * Math.sin(29.5 * rad);
  const r = (la: number) => Math.sqrt(C - 2 * n * Math.sin(la * rad)) / n;
  const th = n * (lon + 96) * rad, ax = r(lat) * Math.sin(th), ay = r(37.5) - r(lat) * Math.cos(th);
  return [584.9417 * ax - 0.0406 * ay + 251.1482, -0.1077 * ax - 585.3931 * ay + 149.6381];
}

const W_UK = "Website check", W_FR = "Contrôle du site";

/** 3–4 typische Signale je Branche und Land (Illustration, Datum Sept./Okt. 2026). */
const HERO_BASE: Record<BaseSeg, Record<Cc, HeroSig[]>> = {
  "web-agencies": {
    UK: [
      { place: "Leeds", date: "3 Oct 2026", source: W_UK, event: "The homepage is not built for phones: it has no mobile viewport setting." },
      { place: "Bristol", date: "2 Oct 2026", source: "Business listing", event: "Has no website: listed with a phone number and an email address, but no own website could be found." },
      { place: "Manchester", date: "3 Oct 2026", source: W_UK, event: "Its website shows an error page (HTTP 404) instead of a homepage." },
      { place: "Glasgow", date: "1 Oct 2026", source: W_UK, event: "Its website uses a self-signed security certificate, so browsers warn visitors before opening it." },
    ],
    US: [
      { place: "Denver", date: "3 Oct 2026", source: W_UK, event: "The homepage still loads an old version of the jQuery library." },
      { place: "Phoenix", date: "2 Oct 2026", source: "Business listing", event: "Has no website: listed with a phone number and an email address, but no own website was found." },
      { place: "Atlanta", date: "3 Oct 2026", source: W_UK, event: "The security certificate does not match the domain, so browsers warn visitors before opening the site." },
      { place: "Portland", date: "1 Oct 2026", source: W_UK, event: "Its website shows an error page (HTTP 404) instead of a homepage." },
    ],
    FR: [
      { place: "Bordeaux", date: "3 oct. 2026", source: W_FR, event: "Le site tourne sous une ancienne version de WordPress." },
      { place: "Lille", date: "3 oct. 2026", source: W_FR, event: "La page d'accueil n'est pas adaptée aux mobiles (pas de réglage viewport)." },
      { place: "Rennes", date: "2 oct. 2026", source: W_FR, event: "Le certificat de sécurité ne correspond pas au domaine : les navigateurs affichent un avertissement." },
      { place: "Montpellier", date: "1 oct. 2026", source: W_FR, event: "Le site indiqué n'affiche qu'une page de domaine parqué, sans contenu propre." },
    ],
  },
  recruitment: {
    UK: [
      { place: "London", date: "2 Oct 2026", source: "Find a Tender", event: "Won a public contract for cleaning services, published on Find a Tender on 2 October 2026." },
      { place: "Birmingham", date: "28 Sep 2026", source: "Careers page", event: "Several roles open at the same time on its own careers page, from sales to engineering." },
      { place: "Edinburgh", date: "1 Oct 2026", source: "Careers page", event: "Role “Customer Support Specialist” open for 30 days, per its own job advert." },
      { place: "Nottingham", date: "30 Sep 2026", source: "Find a Tender", event: "Won a public contract for facilities maintenance, published on Find a Tender on 30 September 2026." },
    ],
    US: [
      { place: "Boston", date: "1 Oct 2026", source: "SEC Form D", event: "Filed an SEC Form D on 1 October 2026 for a new funding round." },
      { place: "New York", date: "28 Sep 2026", source: "Careers page", event: "Role “Administrative Assistant” open for 30 days, per its own job advert." },
      { place: "Austin", date: "30 Sep 2026", source: "US Dept. of Labor", event: "Filed a labor condition application for a new engineering hire." },
      { place: "Chicago", date: "29 Sep 2026", source: "Careers page", event: "Several roles open at the same time on its own careers page." },
    ],
    FR: [
      { place: "Paris", date: "29 sept. 2026", source: "Page carrières", event: "Poste « Chargé de clientèle (F/H) » ouvert depuis 30 jours, selon sa propre offre." },
      { place: "Lyon", date: "28 sept. 2026", source: "Page carrières", event: "Plusieurs postes ouverts en même temps sur sa page carrières, du commercial à l'ingénierie." },
      { place: "Nantes", date: "1 oct. 2026", source: "Page carrières", event: "Poste « Développeur back-end (H/F) » ouvert depuis 30 jours, selon sa propre offre." },
      { place: "Toulouse", date: "30 sept. 2026", source: "Page carrières", event: "Plusieurs postes commerciaux ouverts en même temps sur sa page carrières." },
    ],
  },
  accountants: {
    UK: [
      { place: "Manchester", date: "30 Sep 2026", source: "Companies House", event: "A new software company, incorporated on 30 September 2026." },
      { place: "Leeds", date: "29 Sep 2026", source: "Companies House", event: "A new restaurant business, incorporated on 29 September 2026." },
      { place: "Cardiff", date: "1 Oct 2026", source: "Companies House", event: "A new building contractor, incorporated on 1 October 2026." },
      { place: "Norwich", date: "30 Sep 2026", source: "Companies House", event: "A new property management company, incorporated on 30 September 2026." },
    ],
    US: [
      { place: "New York", date: "29 Sep 2026", source: "NY Department of State", event: "A new corporation, registered in New York on 29 September 2026." },
      { place: "Hartford", date: "30 Sep 2026", source: "Connecticut registry", event: "A new equipment rental company, registered in Connecticut on 30 September 2026." },
      { place: "Albany", date: "29 Sep 2026", source: "NY Department of State", event: "A new limited liability company, registered in New York on 29 September 2026." },
      { place: "Stamford", date: "1 Oct 2026", source: "SEC Form D", event: "A recently formed company that filed an SEC Form D on 1 October 2026." },
    ],
    FR: [
      { place: "Paris", date: "30 sept. 2026", source: "BODACC", event: "Nouvelle entreprise d'installation et de maintenance de climatisation, création publiée au BODACC." },
      { place: "Lyon", date: "29 sept. 2026", source: "BODACC", event: "Nouvelle pizzeria, création publiée au BODACC le 29 septembre 2026." },
      { place: "Lille", date: "27 sept. 2026", source: "BODACC", event: "Nouvelle société civile immobilière, immatriculée le 27 septembre 2026." },
      { place: "Toulouse", date: "30 sept. 2026", source: "BODACC", event: "Nouveau cabinet de conseil, création publiée au BODACC le 30 septembre 2026." },
    ],
  },
  "insurance-brokers": {
    UK: [
      { place: "Liverpool", date: "30 Sep 2026", source: "Companies House", event: "A new hotel business, incorporated on 30 September 2026." },
      { place: "Sheffield", date: "29 Sep 2026", source: "Companies House", event: "A new road haulage company, incorporated on 29 September 2026." },
      { place: "Bristol", date: "1 Oct 2026", source: "Companies House", event: "A new construction firm, incorporated on 1 October 2026." },
      { place: "Newcastle", date: "30 Sep 2026", source: "Companies House", event: "A new warehousing and storage company, incorporated on 30 September 2026." },
    ],
    US: [
      { place: "Chicago", date: "24 Sep 2026", source: "US DOT", event: "Registered with the US DOT on 24 September 2026 as a new private-fleet operator." },
      { place: "Dallas", date: "29 Sep 2026", source: "US DOT", event: "Registered with the US DOT on 29 September 2026 as a new interstate carrier." },
      { place: "Hartford", date: "30 Sep 2026", source: "Connecticut registry", event: "A new home furnishings retailer, registered in Connecticut on 30 September 2026." },
      { place: "Buffalo", date: "29 Sep 2026", source: "NY Department of State", event: "A new limited liability company, registered in New York on 29 September 2026." },
    ],
    FR: [
      { place: "Bordeaux", date: "30 sept. 2026", source: "BODACC", event: "Nouvelle entreprise de transport routier de marchandises, création publiée au BODACC." },
      { place: "Marseille", date: "29 sept. 2026", source: "BODACC", event: "Nouvelle pizzeria avec restauration rapide, création publiée au BODACC le 29 septembre 2026." },
      { place: "Nantes", date: "1 oct. 2026", source: "BODACC", event: "Nouvelle entreprise du bâtiment, création publiée au BODACC le 1er octobre 2026." },
      { place: "Strasbourg", date: "30 sept. 2026", source: "BODACC", event: "Nouvelle entreprise d'entreposage et de stockage, création publiée au BODACC." },
    ],
  },
  "financial-advisers": {
    UK: [
      { place: "London", date: "30 Sep 2026", source: "Companies House", event: "Owner and director named at a new advisory company, incorporated on 30 September 2026." },
      { place: "Reading", date: "29 Sep 2026", source: "Companies House", event: "New director appointed at a newly incorporated IT consultancy." },
      { place: "Birmingham", date: "1 Oct 2026", source: "Companies House", event: "Owner and director named at a new engineering company, incorporated on 1 October 2026." },
      { place: "Edinburgh", date: "30 Sep 2026", source: "Companies House", event: "A new holding company with its directors named, incorporated on 30 September 2026." },
    ],
    US: [
      { place: "New York", date: "29 Sep 2026", source: "NY Department of State", event: "A new corporation, registered in New York on 29 September 2026." },
      { place: "Stamford", date: "30 Sep 2026", source: "Connecticut registry", event: "Owner named in a new business registration in Connecticut on 30 September 2026." },
      { place: "New Haven", date: "30 Sep 2026", source: "Connecticut registry", event: "A new professional services company, registered in Connecticut with its owner named." },
      { place: "Buffalo", date: "29 Sep 2026", source: "NY Department of State", event: "A new limited liability company, registered in New York on 29 September 2026." },
    ],
    FR: [
      { place: "Paris", date: "30 sept. 2026", source: "BODACC", event: "Président nommé à la création d'une nouvelle société, publiée au BODACC le 30 septembre 2026." },
      { place: "Lyon", date: "29 sept. 2026", source: "BODACC", event: "Nouvelle société de conseil avec son dirigeant, création publiée au BODACC." },
      { place: "Nice", date: "1 oct. 2026", source: "BODACC", event: "Gérant nommé à la création d'une nouvelle société, publiée au BODACC le 1er octobre 2026." },
      { place: "Strasbourg", date: "30 sept. 2026", source: "BODACC", event: "Nouvelle société holding avec ses dirigeants, création publiée au BODACC." },
    ],
  },
};
export const HERO_SIGNALS: Record<Seg, Record<Cc, HeroSig[]>> = { ...HERO_BASE, "marketing-agencies": HERO_BASE["web-agencies"] };

type SrcRow = [string, string, string];
/** Quellen je Land und Branche („Checked every day“), ohne Flaggen. [Symbol, Name, Was wir lesen] */
const SOURCES_BASE: Record<BaseSeg, Record<Cc, SrcRow[]>> = {
  "web-agencies": {
    UK: [["globe", "Website checks", "Company homepages"], ["landmark", "Company registers", "Companies House"], ["doc", "Open business listings", "Phone, email, social pages"], ["lock", "Security certificates", "Every website we check"]],
    US: [["globe", "Website checks", "Company homepages"], ["doc", "Open business listings", "Phone, email, social pages"], ["landmark", "State business registers", "New York and Connecticut"], ["lock", "Security certificates", "Every website we check"]],
    FR: [["globe", "Contrôle des sites", "Pages d'accueil des entreprises"], ["landmark", "Registre SIRENE", "INSEE"], ["doc", "BODACC", "Annonces officielles"], ["lock", "Certificats de sécurité", "Chaque site vérifié"]],
  },
  recruitment: {
    UK: [["doc", "Find a Tender", "Public contract awards"], ["users", "Company careers pages", "Job adverts with their dates"], ["landmark", "Companies House", "Company and officer data"]],
    US: [["users", "Company careers pages", "Job adverts with their dates"], ["landmark", "SEC EDGAR", "Form D funding filings"], ["doc", "US Department of Labor", "Labor condition applications"]],
    FR: [["users", "Pages carrières", "Offres d'emploi datées"], ["landmark", "Registre SIRENE", "Données d'entreprise"], ["doc", "BODACC", "Annonces officielles"]],
  },
  accountants: {
    UK: [["landmark", "Companies House", "New incorporations"], ["doc", "Company websites", "Phone and email"], ["users", "Company careers pages", "Finance roles"]],
    US: [["landmark", "NY Department of State", "New registrations"], ["landmark", "Connecticut business registry", "New registrations"], ["doc", "SEC EDGAR", "Form D filings"]],
    FR: [["doc", "BODACC", "Créations d'entreprises"], ["landmark", "Registre SIRENE", "Données d'entreprise"], ["globe", "Sites des entreprises", "Téléphone et e-mail"]],
  },
  "insurance-brokers": {
    UK: [["landmark", "Companies House", "New incorporations"], ["doc", "Company websites", "Phone and email"], ["building", "Industry codes", "Activity of each company"]],
    US: [["doc", "US DOT (FMCSA)", "New fleet registrations"], ["landmark", "NY Department of State", "New registrations"], ["landmark", "Connecticut business registry", "New registrations"]],
    FR: [["doc", "BODACC", "Créations d'entreprises"], ["landmark", "Registre SIRENE", "Données d'entreprise"], ["building", "Codes d'activité", "Activité de chaque entreprise"]],
  },
  "financial-advisers": {
    UK: [["landmark", "Companies House", "New companies and directors"], ["doc", "Company websites", "Phone and email"], ["users", "Company careers pages", "Growing employers"]],
    US: [["landmark", "NY Department of State", "New registrations"], ["landmark", "Connecticut business registry", "Owners named in filings"], ["users", "Company careers pages", "Growing employers"]],
    FR: [["doc", "BODACC", "Créations et dirigeants"], ["landmark", "Registre SIRENE", "Données d'entreprise"], ["globe", "Sites des entreprises", "Téléphone et e-mail"]],
  },
};
export const SOURCES: Record<Seg, Record<Cc, SrcRow[]>> = { ...SOURCES_BASE, "marketing-agencies": SOURCES_BASE["web-agencies"] };

/** Branchentexte der Methode: Schritte (Symbol, Titel, Text), Momente im Radar, Liste am Montag. */
export type MethodText = {
  steps: [string, string, string][]; moments: [string, string][];
  mail: [string, string][]; tag: string;
};

const EN: Record<Seg, MethodText> = {
  "web-agencies": {
    steps: [["search", "We check the websites", "Every day we check company homepages {across}: missing sites, old software, pages that fail on phones, broken certificates."],
      ["target", "We spot the gap", "No website, an outdated or broken one, or a security warning. Each finding is recorded with the date we checked it."],
      ["filter", "We filter and rate", "Only businesses you can reach by phone or email. Every lead is rated for freshness and clarity of the finding, weak ones are left out."],
      ["inbox", "You get the list", "Every Monday: company, phone and email, the website finding, date, source, a sales tip and an opening line. Each lead goes to only one agency."]],
    moments: [["globe", "No website at all"], ["calendar", "An outdated website"], ["lock", "A security warning"]],
    mail: [["globe", "No website"], ["calendar", "Outdated website"], ["lock", "Security gap"]], tag: "Website finding",
  },
  recruitment: {
    steps: [["search", "We read the sources", "Every day we read company careers pages and official notices {across}."],
      ["target", "We spot the moment", "A role open for 30 days, several hires at once, a newly won contract. Each event is recorded with its date and source."],
      ["filter", "We filter and rate", "Small and mid-sized employers only, no large corporations. Every lead is rated for freshness and relevance, weak ones are left out."],
      ["inbox", "You get the list", "Every Monday: employer, phone and email, the open roles or the event, date, source, a sales tip and an opening line. Each lead goes to only one agency."]],
    moments: [["calendar", "A role open for 30 days"], ["users", "Several hires at once"], ["doc", "A newly won contract"]],
    mail: [["calendar", "Role open 30+ days"], ["users", "Several roles open"], ["doc", "Public contract"]], tag: "Hiring signal",
  },
  accountants: {
    steps: [["search", "We read the registers", "Every day we read the official company registers {across}."],
      ["target", "We spot the moment", "A newly registered company, before it has chosen an accountant. Each event is recorded with its date and source."],
      ["filter", "We filter and rate", "Only companies with a phone number or email you can use. Every lead is rated for freshness and completeness, weak ones are left out."],
      ["inbox", "You get the list", "Every Monday: company, phone and email, its activity, date, source, a sales tip and an opening line. Each lead goes to only one firm."]],
    moments: [["building", "A newly registered company"], ["users", "A growing employer"], ["calendar", "A first funding round"]],
    mail: [["building", "New company"], ["building", "New company"], ["users", "Growing employer"]], tag: "New company",
  },
  "insurance-brokers": {
    steps: [["search", "We read the registers", "Every day we read official company and fleet registers {across}."],
      ["target", "We spot the moment", "A new company, a new fleet registration, a new site. The point when cover is arranged. Each event is recorded with its date and source."],
      ["filter", "We filter and rate", "Only businesses with something to insure and contact data you can use. Every lead is rated, weak ones are left out."],
      ["inbox", "You get the list", "Every Monday: company, phone and email, its activity, date, source, a sales tip and an opening line. Each lead goes to only one broker."]],
    moments: [["building", "A newly registered company"], ["zap", "A new fleet registration"], ["pin", "A new site or premises"]],
    mail: [["building", "New company"], ["zap", "New fleet"], ["building", "New company"]], tag: "New company",
  },
  "financial-advisers": {
    steps: [["search", "We read the registers", "Every day we read the official company registers {across}."],
      ["target", "We spot the moment", "New owners and directors, newly formed companies, growing employers. Each event is recorded with its date and source."],
      ["filter", "We filter and rate", "Only leads with a named owner or director and contact data you can use. Every lead is rated, weak ones are left out."],
      ["inbox", "You get the list", "Every Monday: company, owner or director, phone and email, date, source, a sales tip and an opening line. Each lead goes to only one adviser."]],
    moments: [["user", "A new company director"], ["building", "A newly formed company"], ["users", "A growing employer"]],
    mail: [["user", "New director"], ["building", "New company"], ["users", "Growing employer"]], tag: "New director",
  },
  "marketing-agencies": {
    steps: [["search", "We check the websites", "Every day we check company homepages {across}: missing sites, old software, pages that fail on phones, broken certificates."],
      ["target", "We spot the gap", "No website or a weak one: hard to find, hard to trust. Each finding is recorded with the date we checked it."],
      ["filter", "We filter and rate", "Only businesses you can reach by phone or email. Every lead is rated for freshness and clarity of the finding, weak ones are left out."],
      ["inbox", "You get the list", "Every Monday: company, phone and email, the website finding, date, source, a sales tip and an opening line. Each lead goes to only one firm."]],
    moments: [["globe", "No website at all"], ["calendar", "An outdated website"], ["lock", "A security warning"]],
    mail: [["globe", "No website"], ["calendar", "Outdated website"], ["lock", "Security gap"]], tag: "Website finding",
  },
};

const FR: Record<BaseSeg, MethodText> = {
  "web-agencies": {
    steps: [["search", "Nous vérifions les sites", "Chaque jour, nous vérifions les pages d'accueil des entreprises {across} : sites absents, logiciels anciens, pages inadaptées au mobile, certificats défaillants."],
      ["target", "Nous repérons le manque", "Pas de site, un site vieillissant ou en panne, un avertissement de sécurité. Chaque constat est enregistré avec sa date de vérification."],
      ["filter", "Nous filtrons et évaluons", "Uniquement des entreprises joignables par téléphone ou e-mail. Chaque prospect est noté selon sa fraîcheur et la clarté du constat, les plus faibles sont écartés."],
      ["inbox", "Vous recevez la liste", "Chaque lundi : entreprise, téléphone et e-mail, le constat sur le site, date, source, conseil de vente et phrase d'accroche. Chaque prospect ne va qu'à une seule agence."]],
    moments: [["globe", "Aucun site web"], ["calendar", "Un site vieillissant"], ["lock", "Un avertissement de sécurité"]],
    mail: [["calendar", "Site vieillissant"], ["globe", "Pas adapté au mobile"], ["lock", "Faille de sécurité"]], tag: "Constat sur le site",
  },
  recruitment: {
    steps: [["search", "Nous lisons les sources", "Chaque jour, nous lisons les pages carrières des entreprises et les annonces officielles {across}."],
      ["target", "Nous repérons le moment", "Un poste ouvert depuis 30 jours, plusieurs recrutements à la fois. Chaque événement est enregistré avec sa date et sa source."],
      ["filter", "Nous filtrons et évaluons", "Uniquement des PME, pas de grands groupes. Chaque prospect est noté selon sa fraîcheur et sa pertinence, les plus faibles sont écartés."],
      ["inbox", "Vous recevez la liste", "Chaque lundi : employeur, téléphone et e-mail, les postes ouverts, date, source, conseil de vente et phrase d'accroche. Chaque prospect ne va qu'à un seul cabinet."]],
    moments: [["calendar", "Un poste ouvert depuis 30 jours"], ["users", "Plusieurs recrutements à la fois"], ["building", "Une entreprise en croissance"]],
    mail: [["calendar", "Poste ouvert 30+ jours"], ["users", "Plusieurs postes ouverts"], ["calendar", "Poste ouvert 30+ jours"]], tag: "Signal de recrutement",
  },
  accountants: {
    steps: [["search", "Nous lisons les registres", "Chaque jour, nous lisons les annonces officielles et les registres d'entreprises {across}."],
      ["target", "Nous repérons le moment", "Une entreprise tout juste créée, avant qu'elle ait choisi son expert-comptable. Chaque événement est enregistré avec sa date et sa source."],
      ["filter", "Nous filtrons et évaluons", "Uniquement des entreprises avec un téléphone ou un e-mail exploitable. Chaque prospect est noté, les plus faibles sont écartés."],
      ["inbox", "Vous recevez la liste", "Chaque lundi : entreprise, téléphone et e-mail, activité, date, source, conseil de vente et phrase d'accroche. Chaque prospect ne va qu'à un seul cabinet."]],
    moments: [["building", "Une création d'entreprise"], ["users", "Un employeur en croissance"], ["doc", "Une annonce au BODACC"]],
    mail: [["building", "Création récente"], ["building", "Création récente"], ["users", "Employeur en croissance"]], tag: "Création récente",
  },
  "insurance-brokers": {
    steps: [["search", "Nous lisons les registres", "Chaque jour, nous lisons les annonces officielles et les registres d'entreprises {across}."],
      ["target", "Nous repérons le moment", "Une création d'entreprise, un nouveau site, une activité avec véhicules ou stock. Le moment où l'on s'assure. Chaque événement est daté et sourcé."],
      ["filter", "Nous filtrons et évaluons", "Uniquement des entreprises qui ont quelque chose à assurer et des coordonnées exploitables. Chaque prospect est noté, les plus faibles sont écartés."],
      ["inbox", "Vous recevez la liste", "Chaque lundi : entreprise, téléphone et e-mail, activité, date, source, conseil de vente et phrase d'accroche. Chaque prospect ne va qu'à un seul courtier."]],
    moments: [["building", "Une création d'entreprise"], ["pin", "Un nouveau site"], ["zap", "Une activité avec véhicules"]],
    mail: [["building", "Création récente"], ["zap", "Transport routier"], ["building", "Création récente"]], tag: "Création récente",
  },
  "financial-advisers": {
    steps: [["search", "Nous lisons les registres", "Chaque jour, nous lisons les annonces officielles et les registres d'entreprises {across}."],
      ["target", "Nous repérons le moment", "Nouveaux dirigeants, sociétés nouvellement créées, employeurs en croissance. Chaque événement est enregistré avec sa date et sa source."],
      ["filter", "Nous filtrons et évaluons", "Uniquement des prospects avec un dirigeant nommé et des coordonnées exploitables. Chaque prospect est noté, les plus faibles sont écartés."],
      ["inbox", "Vous recevez la liste", "Chaque lundi : entreprise, dirigeant, téléphone et e-mail, date, source, conseil de vente et phrase d'accroche. Chaque prospect ne va qu'à un seul conseiller."]],
    moments: [["user", "Un nouveau dirigeant"], ["building", "Une société nouvellement créée"], ["users", "Un employeur en croissance"]],
    mail: [["user", "Nouveau dirigeant"], ["building", "Création récente"], ["user", "Nouveau dirigeant"]], tag: "Nouveau dirigeant",
  },
};

export const METHOD: Record<LLang, Record<Seg, MethodText>> = { en: EN, fr: { ...FR, "marketing-agencies": FR["web-agencies"] } };

/** Feste Texte der neuen Abschnitte (Rest kommt aus HOME[lang]). */
export const LZ: Record<LLang, {
  heroNote: string; across: Record<Cc, string>; hidden: string;
  stampOfficial: string; stampDated: string; askFor: string;
  howForm: string[]; formIntro: string; commonTitle: string; commonNote: string; signalsTitle: string;
  dotLegend: [string, string]; noGap: string;
}> = {
  en: {
    heroNote: "Illustrative examples of the signals we detect. Company names hidden.",
    across: { UK: "across the UK", US: "across the US", FR: "across France" }, hidden: "Hidden in sample",
    stampOfficial: "OFFICIAL SOURCE", stampDated: "DATED AND SOURCED", askFor: "Ask for",
    howForm: ["You fill in the short form: company, email and which leads you need.", "We prepare ten current leads from {across} that fit your line of work.", "You contact the companies that fit. Once you have, we ask briefly how it went."],
    formIntro: "Tell us which leads you need. You receive ten current leads in the format of the weekly delivery.",
    commonTitle: "What they have in common", commonNote: "One dot = one lead of the sample", signalsTitle: "What we look for",
    dotLegend: ["found", "missing"], noGap: "found",
  },
  fr: {
    heroNote: "Exemples illustratifs des signaux que nous repérons. Noms d'entreprise masqués.",
    across: { UK: "dans tout le Royaume-Uni", US: "dans tous les États-Unis", FR: "partout en France" }, hidden: "Masqué dans l'échantillon",
    stampOfficial: "SOURCE OFFICIELLE", stampDated: "DATÉ ET SOURCÉ", askFor: "Demander",
    howForm: ["Vous remplissez le court formulaire : entreprise, e-mail et les prospects qui vous intéressent.", "Nous préparons dix prospects récents {across}, adaptés à votre métier.", "Vous contactez les entreprises qui vous correspondent. Ensuite, nous vous demandons brièvement comment cela s'est passé."],
    formIntro: "Dites-nous quels prospects vous intéressent. Vous recevez dix prospects récents au format de la livraison hebdomadaire.",
    commonTitle: "Ce qu'ils ont en commun", commonNote: "Un point = un prospect de l'échantillon", signalsTitle: "Ce que nous repérons",
    dotLegend: ["trouvé", "absent"], noGap: "trouvé",
  },
};

/** Branchenschlüssel der Seite (segKey) auf die Inhalte abbilden; unbekannte Branchen wie Neugründungen behandeln. */
export function segOf(key: string): Seg {
  return (["web-agencies", "recruitment", "accountants", "insurance-brokers", "financial-advisers", "marketing-agencies"] as Seg[]).includes(key as Seg) ? key as Seg : "accountants";
}
export function ccOf(c: string): Cc {
  return c === "US" || c === "FR" ? c : "UK";
}

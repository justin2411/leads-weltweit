/**
 * Landingpage im Design der Lead-PDF (Inhaber 02.10.2026: „wenig Text, gute Grafiken, toller Hero pro Land, dann das
 * Video“). Kurze Beschriftungen; Inhalte (Überschrift, FAQ) kommen weiter aus der Datenbank (page_variants).
 * Nur Aussagen, die stimmen: Kennzahlen und Kartenpins stammen aus einer echten Probe (content/maps/{land}.json).
 */
export type LandingText = {
  pill: string; every: string; chips: [string, string][]; kpi: { leads: string; areas: string; industries: string; firm: [string, string] };
  kpiNote: string; where: string; whereNote: string; common: string; presence: Record<string, string>;
  presenceTitle: string; presenceNote: string; opening: string; examples: string; examplesNote: string;
  phone: string; email: string; contact: string; askFor: string; website: string; noneFound: string; detected: string;
  whyNow: string; online: string; howWin: string; ask: string; call: string; hidden: string; unlock: string;
  revenue: string; reasons: [string, string, string][]; howTitle: string; steps: [string, string, string][];
  sampleTitle: [string, string]; get: { title: string; pdf: [string, string]; csv: [string, string]; map: string }; questions: string; video: string; byMail: string;
};

export const LANDING: Record<"en" | "fr", LandingText> = {
  en: {
    pill: "Free sample · {country}",
    every: "In every lead",
    chips: [["phone", "Phone"], ["mail", "Email"], ["pin", "Address"], ["target", "How to win them"], ["bulb", "Sales tips"]],
    kpi: { leads: "Leads", areas: "{areas}", industries: "Industries", firm: ["1", "Firm per lead"] },
    kpiNote: "From a recent free sample · {date}",
    where: "Where your leads are",
    whereNote: "The 10 leads of a recent sample, across {land}",
    common: "What they have in common",
    presence: { phone: "Phone number", email: "Email address", facebook: "Facebook page", website: "Own website" },
    presenceTitle: "Reachable but no website",
    presenceNote: "Checked {date} · one dot = one lead",
    opening: "That gap is your opening.",
    examples: "Two leads from that sample",
    examplesNote: "Name, phone and email are unlocked in your free sample.",
    phone: "Phone", email: "Email", contact: "Contact person", askFor: "Ask for", website: "Website", noneFound: "none found",
    detected: "Detected", whyNow: "Why now", online: "Online check", howWin: "How to win them", ask: "Ask:",
    call: "Pick up the phone", hidden: "(hidden)", unlock: "Unlocked in your free sample",
    revenue: "Why these leads turn into revenue",
    reasons: [
      ["target", "A real reason to buy", "Every company has a concrete reason that creates demand for your service."],
      ["bolt", "You call first", "New leads every week, found while the need is still open."],
      ["lock", "Only for your firm", "Each lead goes to one firm in your field only."],
    ],
    howTitle: "How it works",
    steps: [
      ["focus", "Choose the signals you need", ""],
      ["cal", "New leads every Monday", ""],
      ["phone", "You call them and win new clients", ""],
    ],
    sampleTitle: ["Your 10 free leads", "from across {land}"],
    get: { title: "What you receive", pdf: ["Lead report (PDF)", "Map, overview and a short sales briefing for every lead."], csv: ["Spreadsheet (CSV)", "All contact data, ready for your CRM."], map: "10 companies from across {land}" },
    questions: "Questions",
    video: "The film",
    byMail: "Sent by email",
  },
  fr: {
    pill: "Échantillon gratuit · {country}",
    every: "Pour chaque prospect",
    chips: [["phone", "Téléphone"], ["mail", "E-mail"], ["pin", "Adresse"], ["target", "Comment les convaincre"], ["bulb", "Conseils de vente"]],
    kpi: { leads: "Prospects", areas: "{areas}", industries: "Secteurs", firm: ["1", "Agence par prospect"] },
    kpiNote: "Issu d'un échantillon gratuit récent · {date}",
    where: "Où se trouvent vos prospects",
    whereNote: "Les 10 prospects d'un échantillon récent, partout en France",
    common: "Ce qu'ils ont en commun",
    presence: { phone: "Téléphone", email: "Adresse e-mail", facebook: "Page Facebook", website: "Site web" },
    presenceTitle: "Joignables mais sans site web",
    presenceNote: "Vérifié le {date} · un point = un prospect",
    opening: "Ce manque, c’est votre opportunité.",
    examples: "Deux prospects de cet échantillon",
    examplesNote: "Nom, téléphone et e-mail figurent dans votre échantillon gratuit.",
    phone: "Téléphone", email: "E-mail", contact: "Interlocuteur", askFor: "Demander", website: "Site web", noneFound: "aucun trouvé",
    detected: "Détecté", whyNow: "Pourquoi maintenant", online: "Présence en ligne", howWin: "Comment les convaincre", ask: "Question :",
    call: "Appelez maintenant", hidden: "(masqué)", unlock: "Visible dans votre échantillon gratuit",
    revenue: "Pourquoi ces prospects génèrent du chiffre d'affaires",
    reasons: [
      ["target", "Une vraie raison d'acheter", "Chaque entreprise a une raison concrète d'avoir besoin de votre service."],
      ["bolt", "Vous appelez en premier", "De nouveaux prospects chaque semaine, repérés tant que le besoin est encore ouvert."],
      ["lock", "Réservé à votre agence", "Chaque prospect ne va qu'à une seule entreprise de votre secteur."],
    ],
    howTitle: "Comment ça marche",
    steps: [
      ["focus", "Choisissez vos signaux", ""],
      ["cal", "Nouveaux prospects chaque lundi", ""],
      ["phone", "Vous appelez et gagnez des clients", ""],
    ],
    sampleTitle: ["Vos 10 prospects gratuits", "de toute la France"],
    get: { title: "Ce que vous recevez", pdf: ["Rapport (PDF)", "Carte, vue d’ensemble et un court briefing commercial par prospect."], csv: ["Tableur (CSV)", "Toutes les coordonnées, prêtes pour votre CRM."], map: "10 entreprises de toute la France" },
    questions: "Questions",
    video: "Le film",
    byMail: "Envoyé par e-mail",
  },
};

/** Bezeichnung der Gebiete in den Kennzahlen (wie die PDF-Vorlage). */
export const AREA_LABEL: Record<string, Record<"en" | "fr", string>> = {
  US: { en: "States", fr: "États" }, UK: { en: "Regions", fr: "Régions" }, FR: { en: "Regions", fr: "Régions" },
  IE: { en: "Counties", fr: "Comtés" }, BE: { en: "Provinces", fr: "Provinces" }, NL: { en: "Provinces", fr: "Provinces" },
};
export const COUNTRY_NAME: Record<string, Record<"en" | "fr", string>> = {
  US: { en: "United States", fr: "États-Unis" }, UK: { en: "United Kingdom", fr: "Royaume-Uni" }, FR: { en: "France", fr: "France" },
  IE: { en: "Ireland", fr: "Irlande" }, BE: { en: "Belgium", fr: "Belgique" }, NL: { en: "Netherlands", fr: "Pays-Bas" },
};

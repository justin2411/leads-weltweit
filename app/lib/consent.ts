import { BRAND } from "./site.ts";

/** Einwilligungstext des Probe-Formulars. Wird serverseitig im Wortlaut gespeichert (nie aus dem Formular übernommen). */
export function consentText(lang: string): string {
  if (lang === "fr") {
    return `En cliquant sur le bouton, j'accepte que ${BRAND} m'envoie par e-mail, à l'adresse indiquée, un échantillon gratuit de 10 pistes ` +
      `et un message de suivi à ce sujet. Je peux retirer mon accord à tout moment en répondant « désinscription ».`;
  }
  return `By clicking the button I agree that ${BRAND} may email me a free sample of 10 leads and one follow-up ` +
    `message about it at this address. I can withdraw at any time by replying "unsubscribe".`;
}

export const T = {
  en: {
    examples: "Example leads", examplesNote: "Taken from a real sample. Company data only, each with its official source. Shown as examples.",
    what: "What we flag", how: "How it works",
    steps: ["We check official registers and company careers pages every day.", "Each signal is dated, sourced and rated for urgency.", "Every Monday you receive the new leads for your area as a spreadsheet."],
    pricing: "Plans", perMonth: "per month", subscribe: "Start subscription",
    sampleTitle: "Get 10 free sample leads", company: "Company name", email: "Business email", region: "Your area (towns or counties)",
    send: "Send me 10 free leads", change: "Change details", video: (s: number) => `How it works in ${s} seconds`,
    sendTo: (e: string) => `We will send the sample to ${e}.`, thanks: "Thank you – we will email your sample shortly.", faq: "Questions",
    legal: ["Legal notice", "Privacy policy", "Terms"], example: "Example", source: "Source",
    error: "Please use your business email address.",
  },
  fr: {
    examples: "Exemples de pistes", examplesNote: "Issus d'un échantillon réel. Uniquement des données d'entreprise, chacune avec sa source officielle. Présentés à titre d'exemple.",
    what: "Ce que nous repérons", how: "Comment ça marche",
    steps: ["Nous consultons chaque jour les registres officiels et les pages carrières des entreprises.", "Chaque signal est daté, sourcé et évalué selon son urgence.", "Chaque lundi, vous recevez les nouvelles pistes de votre zone sous forme de tableau."],
    pricing: "Offres", perMonth: "par mois", subscribe: "Démarrer l'abonnement",
    sampleTitle: "Recevez 10 pistes gratuites", company: "Nom de l'entreprise", email: "E-mail professionnel", region: "Votre zone (villes ou départements)",
    send: "Recevoir 10 pistes gratuites", change: "Modifier les informations", video: (s: number) => `Comment ça marche, en ${s} secondes`,
    sendTo: (e: string) => `Nous enverrons l'échantillon à ${e}.`, thanks: "Merci – nous vous envoyons votre échantillon très prochainement.", faq: "Questions",
    legal: ["Mentions légales", "Confidentialité", "CGV"], example: "Exemple", source: "Source",
    error: "Merci d'utiliser votre adresse e-mail professionnelle.",
  },
} as const;

export function t(lang: string) {
  return lang === "fr" ? T.fr : T.en;
}

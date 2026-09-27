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
    stepTitle: "Your 10 free leads – one more click",
    free: "Free of charge.", freeText: "No card, no payment details.",
    noObl: "No obligation.", noOblText: "No subscription, nothing renews.",
    sendsTo: (area: string | undefined, e: string) => `10 current leads${area ? ` from ${area}` : " from your area"}, sent to ${e}.`,
    sendsToUnknown: "10 current leads from your area, sent by email.",
    followUp: "Once you've had a chance to contact the 10 companies, we'll get in touch to hear how it went.",
    confirm: "Yes, send my 10 free leads", back: "Back",
    byMail: "Request by email", mailSubject: "Free sample: 10 leads", mailBody: "Hello,\n\nplease send us the 10 free sample leads.\n\nCompany:\nArea (towns or counties):\n",
    thanksTo: (e: string) => `Done – your 10 free leads are on their way to ${e}.`,
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
    stepTitle: "Vos 10 pistes gratuites – encore un clic",
    free: "Gratuit.", freeText: "Pas de carte, pas de données de paiement.",
    noObl: "Sans engagement.", noOblText: "Aucun abonnement, rien ne se renouvelle.",
    sendsTo: (area: string | undefined, e: string) => `10 pistes récentes${area ? ` de ${area}` : " de votre région"}, envoyées à ${e}.`,
    sendsToUnknown: "10 pistes récentes de votre région, envoyées par e-mail.",
    followUp: "Une fois que vous aurez pu contacter les 10 entreprises, nous reprendrons contact pour savoir comment cela s'est passé.",
    confirm: "Oui, envoyez mes 10 pistes gratuites", back: "Retour",
    byMail: "Demander par e-mail", mailSubject: "Échantillon gratuit : 10 pistes", mailBody: "Bonjour,\n\nmerci de nous envoyer les 10 pistes gratuites.\n\nEntreprise :\nZone (villes ou départements) :\n",
    thanksTo: (e: string) => `C'est fait – vos 10 pistes gratuites sont en route vers ${e}.`,
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

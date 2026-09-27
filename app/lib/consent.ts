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
    examples: "Example leads", examplesNote: "Real signals from a recent sample. Company name, phone and email are unlocked in your free sample.",
    what: "What we flag", how: "How it works",
    steps: ["We check official registers and company careers pages every day.", "Each signal is dated, sourced and rated for urgency.", "Every Monday you receive your new leads as a PDF briefing and a spreadsheet."],
    pricing: "Plans", perMonth: "per month", subscribe: "Start subscription",
    stepTitle: "Your 10 free leads, one more click",
    free: "Free of charge.", freeText: "No card, no payment details.",
    noObl: "No obligation.", noOblText: "No subscription, nothing renews.",
    sendsTo: (land: string | undefined, e: string) => `10 current leads${land ? ` from across ${land}` : ""}, sent to ${e}.`,
    sendsToUnknown: "10 current leads, sent by email.",
    followUp: "Once you've had a chance to contact the 10 companies, we'll get in touch to hear how it went.",
    confirm: "Yes, send my 10 free leads", back: "Back",
    byMail: "Request by email", mailSubject: "Request for a free sample of 10 leads", mailBody: "Dear NextGen Profit team,\n\nwe would like to receive the free sample of 10 current leads.\n\nCompany name:\nOur services:\nCountry:\n\nPlease send the sample to this email address.\n\nKind regards\n",
    thanksTo: (e: string) => `Done. Your 10 free leads are on their way to ${e}.`,
    sampleTitle: "Get 10 free sample leads",
    send: "Send me 10 free leads", video: (s: number) => `How it works in ${s} seconds`,
    thanks: "Thank you. We will email your sample shortly.", faq: "Questions",
    legal: ["Legal notice", "Privacy policy", "Terms"], example: "Example", source: "Source",
    error: "We could not match this link to your company. Please request the sample by email below.",
  },
  fr: {
    examples: "Exemples de pistes", examplesNote: "Signaux réels issus d'un échantillon récent. Nom, téléphone et e-mail figurent dans votre échantillon gratuit.",
    what: "Ce que nous repérons", how: "Comment ça marche",
    steps: ["Nous consultons chaque jour les registres officiels et les pages carrières des entreprises.", "Chaque signal est daté, sourcé et évalué selon son urgence.", "Chaque lundi, vous recevez vos nouvelles pistes en briefing PDF et en tableau."],
    pricing: "Offres", perMonth: "par mois", subscribe: "Démarrer l'abonnement",
    stepTitle: "Vos 10 pistes gratuites, encore un clic",
    free: "Gratuit.", freeText: "Pas de carte, pas de données de paiement.",
    noObl: "Sans engagement.", noOblText: "Aucun abonnement, rien ne se renouvelle.",
    sendsTo: (land: string | undefined, e: string) => `10 pistes récentes${land ? ` de toute ${land}` : ""}, envoyées à ${e}.`,
    sendsToUnknown: "10 pistes récentes, envoyées par e-mail.",
    followUp: "Une fois que vous aurez pu contacter les 10 entreprises, nous reprendrons contact pour savoir comment cela s'est passé.",
    confirm: "Oui, envoyez mes 10 pistes gratuites", back: "Retour",
    byMail: "Demander par e-mail", mailSubject: "Demande d'échantillon gratuit de 10 pistes", mailBody: "Bonjour,\n\nnous souhaitons recevoir l'échantillon gratuit de 10 pistes récentes.\n\nSociété :\nNos prestations :\nPays :\n\nMerci d'envoyer l'échantillon à cette adresse.\n\nBien cordialement\n",
    thanksTo: (e: string) => `C'est fait. Vos 10 pistes gratuites sont en route vers ${e}.`,
    sampleTitle: "Recevez 10 pistes gratuites",
    send: "Recevoir 10 pistes gratuites", video: (s: number) => `Comment ça marche, en ${s} secondes`,
    thanks: "Merci. Nous vous envoyons votre échantillon très prochainement.", faq: "Questions",
    legal: ["Mentions légales", "Confidentialité", "CGV"], example: "Exemple", source: "Source",
    error: "Nous n'avons pas pu associer ce lien à votre entreprise. Merci de demander l'échantillon par e-mail ci-dessous.",
  },
} as const;

export function t(lang: string) {
  return lang === "fr" ? T.fr : T.en;
}

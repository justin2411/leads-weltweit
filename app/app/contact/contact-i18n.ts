/**
 * Kontaktseite (Inhaber 03.10.2026): Interessenten melden sich direkt, mit Branche, Markt und gewünschten Leads.
 * EN = /contact, FR = /fr/contact, DE = /de/kontakt. Überschriften ohne Punkt.
 */
import type { HomeLang } from "../home-i18n";

export const CONTACT_PATH: Record<HomeLang, string> = { en: "/contact", fr: "/fr/contact", de: "/de/kontakt" };

/** Branchen der Interessenten (Schlüssel wie content/sample-wishes.ts, "other" = Standard-Signale). */
export const INDUSTRY_KEYS = ["web-agencies", "recruitment", "accountants", "insurance-brokers", "financial-advisers", "other"] as const;
export const MARKETS = ["US", "UK", "FR", "other"] as const;

export type ContactText = {
  title: string; desc: string; pill: string; h1: string; gold: string[]; sub: string;
  cards: [string, string, string][];
  formH: string; formSub: string;
  f: {
    name: string; company: string; email: string; phone: string; optional: string; industry: string; market: string; choose: string;
    which: string; whichHint: string; message: string; messagePh: string; privacy: string; send: string; sending: string; fine: string;
    done: string; e_company: string; e_email: string; e_consent: string; e_industry: string; e_server: string;
  };
  industries: Record<(typeof INDUSTRY_KEYS)[number], string>;
  markets: Record<(typeof MARKETS)[number], string>;
  consent: string;
  sideH: string; side: [string, string][]; mailH: string;
};

export const CONTACT_TX: Record<HomeLang, ContactText> = {
  en: {
    title: "Contact", desc: "Tell us which leads you need. Your personal contact replies in person.",
    pill: "Contact", h1: "Tell us which leads you need", gold: ["leads", "you", "need"],
    sub: "One short form. Your personal contact replies in person.",
    cards: [["user", "Personal contact", "One person who looks after your account"], ["focus", "Leads to your brief", "Industry, market and signals you choose"], ["mail", "Reply by email", "Straight from your personal contact"]],
    formH: "Your enquiry", formSub: "All fields except phone and message are required.",
    f: {
      name: "Your name", company: "Company name", email: "Business email", phone: "Phone", optional: "optional",
      industry: "What do you sell?", market: "Leads from which country?", choose: "Please choose",
      which: "Which leads do you need?", whichHint: "choose any", message: "Anything else?", messagePh: "e.g. only companies with 5+ staff, or a question",
      privacy: "Privacy policy", send: "Send enquiry", sending: "Sending…", fine: "Free · No obligation",
      done: "Thank you. Your enquiry has arrived, we will reply to",
      e_company: "Please enter your company name.", e_email: "Please enter a valid email address.",
      e_consent: "Please tick the consent box.", e_industry: "Please choose what you sell.", e_server: "Something went wrong. Please try again in a minute.",
    },
    industries: { "web-agencies": "Web design / agency", recruitment: "Recruitment / staffing", accountants: "Accounting / bookkeeping",
      "insurance-brokers": "Business insurance", "financial-advisers": "Financial advice", other: "Something else" },
    markets: { US: "United States", UK: "United Kingdom", FR: "France", other: "Another country" },
    consent: "I agree that NextGen Profit stores my details to answer this enquiry and contacts me about it by email or phone. I can withdraw this at any time.",
    sideH: "What happens next", side: [["1", "We read your brief and check which leads we can find for you."], ["2", "Your personal contact replies with a free sample of 10 leads."], ["3", "If it fits, we refine the leads with you, week by week."]],
    mailH: "Prefer email?",
  },
  fr: {
    title: "Contact", desc: "Dites-nous quels prospects vous cherchez. Votre interlocuteur personnel vous répond.",
    pill: "Contact", h1: "Dites-nous quels prospects vous cherchez", gold: ["prospects", "vous", "cherchez"],
    sub: "Un court formulaire. Votre interlocuteur personnel vous répond lui-même.",
    cards: [["user", "Interlocuteur personnel", "Une seule personne qui s'occupe de vous"], ["focus", "Prospects sur mesure", "Secteur, pays et signaux de votre choix"], ["mail", "Réponse par e-mail", "Directement de votre interlocuteur"]],
    formH: "Votre demande", formSub: "Tous les champs sont obligatoires, sauf téléphone et message.",
    f: {
      name: "Votre nom", company: "Nom de l'entreprise", email: "E-mail professionnel", phone: "Téléphone", optional: "facultatif",
      industry: "Que vendez-vous ?", market: "Prospects de quel pays ?", choose: "Veuillez choisir",
      which: "Quels prospects vous intéressent ?", whichHint: "au choix", message: "Autre chose ?", messagePh: "ex. seulement 5+ salariés, ou une question",
      privacy: "Confidentialité", send: "Envoyer la demande", sending: "Envoi…", fine: "Gratuit · Sans engagement",
      done: "Merci. Votre demande est bien arrivée, nous répondrons à",
      e_company: "Merci d'indiquer le nom de votre entreprise.", e_email: "Merci d'indiquer une adresse e-mail valide.",
      e_consent: "Merci de cocher la case de consentement.", e_industry: "Merci d'indiquer ce que vous vendez.", e_server: "Une erreur s'est produite. Merci de réessayer dans une minute.",
    },
    industries: { "web-agencies": "Création de sites / agence web", recruitment: "Recrutement / intérim", accountants: "Expertise comptable",
      "insurance-brokers": "Assurance entreprises", "financial-advisers": "Conseil financier", other: "Autre activité" },
    markets: { US: "États-Unis", UK: "Royaume-Uni", FR: "France", other: "Autre pays" },
    consent: "J'accepte que NextGen Profit conserve mes données pour répondre à cette demande et me contacte à ce sujet par e-mail ou téléphone. Je peux retirer mon accord à tout moment.",
    sideH: "La suite", side: [["1", "Nous lisons votre demande et vérifions quels prospects nous pouvons trouver pour vous."], ["2", "Votre interlocuteur vous répond avec un échantillon gratuit de 10 prospects."], ["3", "Si cela vous convient, nous affinons les prospects avec vous, semaine après semaine."]],
    mailH: "Plutôt par e-mail ?",
  },
  de: {
    title: "Kontakt", desc: "Sagen Sie uns, welche Leads Sie brauchen. Ihr persönlicher Ansprechpartner antwortet selbst.",
    pill: "Kontakt", h1: "Sagen Sie uns, welche Leads Sie brauchen", gold: ["Leads", "brauchen"],
    sub: "Ein kurzes Formular. Ihr persönlicher Ansprechpartner antwortet selbst.",
    cards: [["user", "Persönlicher Ansprechpartner", "Eine Person, die sich um Sie kümmert"], ["focus", "Leads nach Ihren Wünschen", "Branche, Land und Signale nach Wahl"], ["mail", "Antwort per E-Mail", "Direkt von Ihrem Ansprechpartner"]],
    formH: "Ihre Anfrage", formSub: "Alle Felder außer Telefon und Nachricht sind Pflicht.",
    f: {
      name: "Ihr Name", company: "Firmenname", email: "Geschäftliche E-Mail", phone: "Telefon", optional: "optional",
      industry: "Was verkaufen Sie?", market: "Leads aus welchem Land?", choose: "Bitte wählen",
      which: "Welche Leads brauchen Sie?", whichHint: "beliebig viele", message: "Noch etwas?", messagePh: "z. B. nur Firmen ab 5 Personen, oder eine Frage",
      privacy: "Datenschutz", send: "Anfrage senden", sending: "Wird gesendet…", fine: "Kostenlos · Unverbindlich",
      done: "Danke. Ihre Anfrage ist angekommen, wir antworten an",
      e_company: "Bitte den Firmennamen angeben.", e_email: "Bitte eine gültige E-Mail-Adresse angeben.",
      e_consent: "Bitte die Einwilligung ankreuzen.", e_industry: "Bitte angeben, was Sie verkaufen.", e_server: "Etwas ist schiefgelaufen. Bitte in einer Minute erneut versuchen.",
    },
    industries: { "web-agencies": "Webdesign / Agentur", recruitment: "Personalvermittlung / Zeitarbeit", accountants: "Steuerberatung / Buchhaltung",
      "insurance-brokers": "Gewerbeversicherung", "financial-advisers": "Finanzberatung", other: "Etwas anderes" },
    markets: { US: "USA", UK: "Vereinigtes Königreich", FR: "Frankreich", other: "Anderes Land" },
    consent: "Ich bin einverstanden, dass NextGen Profit meine Angaben speichert, um diese Anfrage zu beantworten, und mich dazu per E-Mail oder Telefon kontaktiert. Ich kann das jederzeit widerrufen.",
    sideH: "So geht es weiter", side: [["1", "Wir lesen Ihre Anfrage und prüfen, welche Leads wir für Sie finden."], ["2", "Ihr Ansprechpartner antwortet mit einer kostenlosen Probe von 10 Leads."], ["3", "Passt es, verfeinern wir die Leads mit Ihnen, Woche für Woche."]],
    mailH: "Lieber per E-Mail?",
  },
};

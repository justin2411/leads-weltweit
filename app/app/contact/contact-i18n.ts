/**
 * Kontaktseite (Inhaber 03.10.2026): Interessenten melden sich direkt, mit Branche, Markt und gewünschten Leads.
 * EN = /contact, FR = /fr/contact, DE = /de/kontakt. Überschriften ohne Punkt.
 */
import type { HomeLang } from "../home-i18n";

export const CONTACT_PATH: Record<HomeLang, string> = { en: "/contact", fr: "/fr/contact", de: "/de/kontakt" };

/* Branchen und Länder wie im Probe-Formular der Startseite (Inhaber 03.10.2026):
   Branchen aus app/industry-options.ts, Länder = LEAD_COUNTRIES (lib/country.ts). */

export type ContactText = {
  title: string; desc: string; pill: string; h1: string; gold: string[]; sub: string;
  cards: [string, string, string][];
  formH: string; formSub: string;
  f: {
    name: string; company: string; email: string; phone: string; optional: string; industry: string; market: string; choose: string;
    which: string; whichHint: string; message: string; messagePh: string; privacy: string; send: string; sending: string; fine: string;
    done: string; e_company: string; e_email: string; e_consent: string; e_industry: string; e_country: string; e_server: string;
  };
  consent: string;
  /** Grafik rechts: Ansprechpartner-Karte, Beispiel-Gespräch, vier Schritte */
  card: { cap: string; role: string; badge: string; ex: string; you: string; ask: string; reply: string; stepsH: string; steps: [string, string][] };
  mailH: string;
};

export const CONTACT_TX: Record<HomeLang, ContactText> = {
  en: {
    title: "Contact", desc: "Tell us which leads you need. Your personal contact replies in person.",
    pill: "Contact", h1: "Tell us which leads you need", gold: ["leads", "you", "need"],
    sub: "One short form. Your personal contact replies in person.",
    cards: [["user", "Personal contact", "One person who looks after your account"], ["focus", "Leads to your brief", "Industry, market and signals you choose"], ["mail", "Reply by email", "Straight from your personal contact"]],
    formH: "Your personal contact", formSub: "All fields except phone and message are required.",
    f: {
      name: "Your name", company: "Company name", email: "Business email", phone: "Phone", optional: "optional",
      industry: "What do you sell?", market: "Leads from which country?", choose: "Please choose",
      which: "Which leads do you need?", whichHint: "choose any", message: "Anything else?", messagePh: "e.g. only companies with 5+ staff, or a question",
      privacy: "Privacy policy", send: "Send enquiry", sending: "Sending…", fine: "Free · No obligation",
      done: "Thank you. Your enquiry has arrived, we will reply to",
      e_company: "Please enter your company name.", e_email: "Please enter a valid email address.",
      e_consent: "Please tick the consent box.", e_industry: "Please choose what you sell.", e_country: "Please choose the country for your leads.", e_server: "Something went wrong. Please try again in a minute.",
    },
    consent: "I agree that NextGen Profit stores my details to answer this enquiry and contacts me about it by email or phone. I can withdraw this at any time.",
    card: { cap: "Your personal contact and how your enquiry continues", role: "Your personal contact", badge: "Replies personally", ex: "Example",
      you: "You", ask: "We build websites. Which businesses need one?", reply: "I will check which leads we can find for you and send you a free sample of 10.",
      stepsH: "How it works", steps: [["Your brief", "Tell us what you sell and which leads you need."], ["We check", "We check which leads we can find for you."],
        ["Free sample of 10 leads", "Your contact sends them to you, free and without obligation."], ["Weekly tuning", "If it fits, we refine your list with you, week by week."]] },
    mailH: "Prefer email?",
  },
  fr: {
    title: "Contact", desc: "Dites-nous quels prospects vous cherchez. Votre interlocuteur personnel vous répond.",
    pill: "Contact", h1: "Dites-nous quels prospects vous cherchez", gold: ["prospects", "vous", "cherchez"],
    sub: "Un court formulaire. Votre interlocuteur personnel vous répond lui-même.",
    cards: [["user", "Interlocuteur personnel", "Une seule personne qui s'occupe de vous"], ["focus", "Prospects sur mesure", "Secteur, pays et signaux de votre choix"], ["mail", "Réponse par e-mail", "Directement de votre interlocuteur"]],
    formH: "Votre interlocuteur personnel", formSub: "Tous les champs sont obligatoires, sauf téléphone et message.",
    f: {
      name: "Votre nom", company: "Nom de l'entreprise", email: "E-mail professionnel", phone: "Téléphone", optional: "facultatif",
      industry: "Que vendez-vous ?", market: "Prospects de quel pays ?", choose: "Veuillez choisir",
      which: "Quels prospects vous intéressent ?", whichHint: "au choix", message: "Autre chose ?", messagePh: "ex. seulement 5+ salariés, ou une question",
      privacy: "Confidentialité", send: "Envoyer la demande", sending: "Envoi…", fine: "Gratuit · Sans engagement",
      done: "Merci. Votre demande est bien arrivée, nous répondrons à",
      e_company: "Merci d'indiquer le nom de votre entreprise.", e_email: "Merci d'indiquer une adresse e-mail valide.",
      e_consent: "Merci de cocher la case de consentement.", e_industry: "Merci d'indiquer ce que vous vendez.", e_country: "Merci de choisir le pays de vos prospects.", e_server: "Une erreur s'est produite. Merci de réessayer dans une minute.",
    },
    consent: "J'accepte que NextGen Profit conserve mes données pour répondre à cette demande et me contacte à ce sujet par e-mail ou téléphone. Je peux retirer mon accord à tout moment.",
    card: { cap: "Votre interlocuteur personnel et la suite de votre demande", role: "Votre interlocuteur personnel", badge: "Répond personnellement", ex: "Exemple",
      you: "Vous", ask: "Nous créons des sites web. Quelles entreprises en ont besoin ?", reply: "Je vérifie quels prospects nous pouvons trouver pour vous et vous envoie un échantillon gratuit de 10.",
      stepsH: "Comment ça marche", steps: [["Votre demande", "Dites-nous ce que vous vendez et quels prospects vous cherchez."], ["Notre vérification", "Nous vérifions quels prospects nous pouvons trouver pour vous."],
        ["Échantillon gratuit de 10 prospects", "Votre interlocuteur vous l'envoie, gratuitement et sans engagement."], ["Ajustement chaque semaine", "Si cela vous convient, nous affinons votre liste avec vous, semaine après semaine."]] },
    mailH: "Plutôt par e-mail ?",
  },
  de: {
    title: "Kontakt", desc: "Sagen Sie uns, welche Leads Sie brauchen. Ihr persönlicher Ansprechpartner antwortet selbst.",
    pill: "Kontakt", h1: "Sagen Sie uns, welche Leads Sie brauchen", gold: ["Leads", "brauchen"],
    sub: "Ein kurzes Formular. Ihr persönlicher Ansprechpartner antwortet selbst.",
    cards: [["user", "Persönlicher Ansprechpartner", "Eine Person, die sich um Sie kümmert"], ["focus", "Leads nach Ihren Wünschen", "Branche, Land und Signale nach Wahl"], ["mail", "Antwort per E-Mail", "Direkt von Ihrem Ansprechpartner"]],
    formH: "Ihr persönlicher Ansprechpartner", formSub: "Alle Felder außer Telefon und Nachricht sind Pflicht.",
    f: {
      name: "Ihr Name", company: "Firmenname", email: "Geschäftliche E-Mail", phone: "Telefon", optional: "optional",
      industry: "Was verkaufen Sie?", market: "Leads aus welchem Land?", choose: "Bitte wählen",
      which: "Welche Leads brauchen Sie?", whichHint: "beliebig viele", message: "Noch etwas?", messagePh: "z. B. nur Firmen ab 5 Personen, oder eine Frage",
      privacy: "Datenschutz", send: "Anfrage senden", sending: "Wird gesendet…", fine: "Kostenlos · Unverbindlich",
      done: "Danke. Ihre Anfrage ist angekommen, wir antworten an",
      e_company: "Bitte den Firmennamen angeben.", e_email: "Bitte eine gültige E-Mail-Adresse angeben.",
      e_consent: "Bitte die Einwilligung ankreuzen.", e_industry: "Bitte angeben, was Sie verkaufen.", e_country: "Bitte das Land für Ihre Leads wählen.", e_server: "Etwas ist schiefgelaufen. Bitte in einer Minute erneut versuchen.",
    },
    consent: "Ich bin einverstanden, dass NextGen Profit meine Angaben speichert, um diese Anfrage zu beantworten, und mich dazu per E-Mail oder Telefon kontaktiert. Ich kann das jederzeit widerrufen.",
    card: { cap: "Ihr persönlicher Ansprechpartner und wie es mit Ihrer Anfrage weitergeht", role: "Ihr persönlicher Ansprechpartner", badge: "Antwortet persönlich", ex: "Beispiel",
      you: "Sie", ask: "Wir bauen Websites. Welche Firmen brauchen eine?", reply: "Ich prüfe, welche Leads wir für Sie finden, und schicke Ihnen eine kostenlose Probe mit 10 Leads.",
      stepsH: "So funktioniert es", steps: [["Ihre Anfrage", "Sagen Sie uns, was Sie verkaufen und welche Leads Sie brauchen."], ["Wir prüfen", "Wir prüfen, welche Leads wir für Sie finden."],
        ["Kostenlose Probe mit 10 Leads", "Ihr Ansprechpartner schickt sie Ihnen, kostenlos und unverbindlich."], ["Feinschliff jede Woche", "Passt es, verfeinern wir Ihre Liste mit Ihnen, Woche für Woche."]] },
    mailH: "Lieber per E-Mail?",
  },
};

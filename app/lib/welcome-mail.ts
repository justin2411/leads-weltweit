import { mailText, renderMail, type MailBlock } from "./mail-html";
import { BRAND, CONTACT, LEGAL_NAME, siteUrl } from "./site";

/** Erste Lieferung: Montag mit mindestens zwei Tagen Vorlauf (Formular + Freigabe der ersten Lieferung). */
export function firstDelivery(now = new Date()): Date {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 2));
  d.setUTCDate(d.getUTCDate() + ((8 - d.getUTCDay()) % 7));
  return d;
}

type W = { lang: "en" | "fr"; company: string; plan: string; weekly?: number; price?: string; formLink: string; test?: boolean };

/** Willkommensmail nach dem Kauf (Einwilligung: Kunde hat gekauft). Text + gestaltete HTML-Version. */
export function welcomeMail(w: W): { subject: string; text: string; html: string } {
  const fr = w.lang === "fr";
  const num = (n: number) => new Intl.NumberFormat(fr ? "fr-FR" : "en-GB").format(n);
  const date = new Intl.DateTimeFormat(fr ? "fr-FR" : "en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(firstDelivery());
  const perMonth = w.weekly ? Math.round((w.weekly * 52) / 12) : 0;
  const t = w.test ? (fr ? " (MODE TEST)" : " (TEST MODE)") : "";
  const subject = fr ? `Bienvenue chez ${BRAND}, ${w.company} – votre abonnement est actif${t}` : `Welcome to ${BRAND}, ${w.company} – your subscription is active${t}`;
  const facts: [string, string][] = fr ? [
    ["Formule", w.plan], ...(w.weekly ? [["Pistes par semaine", `jusqu'à ${num(w.weekly)} (environ ${num(perMonth)} par mois)`] as [string, string]] : []),
    ...(w.price ? [["Prix", `${w.price} par mois`] as [string, string]] : []), ["Première livraison", date],
  ] : [
    ["Plan", w.plan], ...(w.weekly ? [["Leads per week", `up to ${num(w.weekly)} (about ${num(perMonth)} per month)`] as [string, string]] : []),
    ...(w.price ? [["Price", `${w.price} per month`] as [string, string]] : []), ["First delivery", date],
  ];
  const blocks: MailBlock[] = fr ? [
    { p: "Bonjour," },
    { p: `Félicitations et bienvenue chez ${BRAND} ! Merci pour votre confiance – nous sommes ravis de travailler avec ${w.company}. À partir de maintenant, vous recevez chaque semaine des entreprises qui ont, en ce moment précis, une vraie raison d'acheter votre service.` },
    { facts, title: "Votre abonnement" },
    { p: "Si ce n'est pas encore fait, indiquez-nous en deux minutes quelles pistes vous voulez : signaux, secteurs, régions et entreprises à exclure. Nous préparons votre première livraison en conséquence." },
    { button: "Définir mes préférences", href: w.formLink },
    { title: "Ce qui se passe ensuite", steps: [
      "Nous préparons votre première livraison selon vos préférences et la vérifions avant l'envoi.",
      `Le ${date}, vous recevez votre premier briefing PDF et le tableau (prêt pour votre CRM) : chaque entreprise avec téléphone, e-mail, interlocuteur, le déclencheur et un court briefing commercial.`,
      "Ensuite, de nouvelles pistes arrivent chaque lundi. Chaque piste est réservée à votre entreprise.",
    ] },
    { p: "Un conseil pour bien démarrer : appelez en priorité les pistes marquées « haute priorité », tant que le moment est bon. Pour toute question ou pour modifier vos préférences, répondez simplement à cet e-mail." },
  ] : [
    { p: "Hello," },
    { p: `Congratulations and welcome to ${BRAND}! Thank you for your trust – we are delighted to be working with ${w.company}. From now on you receive, every week, companies that have a real reason to buy your service right now.` },
    { facts, title: "Your subscription" },
    { p: "If you haven't done so yet, take two minutes to tell us which leads you want: signals, industries, regions and any companies to leave out. We tailor your first delivery to it." },
    { button: "Set my lead preferences", href: w.formLink },
    { title: "What happens next", steps: [
      "We prepare your first delivery to your preferences and check it before it goes out.",
      `On ${date} you receive your first PDF briefing and spreadsheet (ready for your CRM): every company with phone, email, contact person, the trigger and a short sales briefing.`,
      "After that, fresh leads arrive every Monday. Every lead is exclusive to your firm.",
    ] },
    { p: "A tip to get off to a strong start: call the leads marked high priority first, while the moment is fresh. If you have any questions or want to adjust your preferences, simply reply to this email." },
  ];
  const closing = fr ? "Bien cordialement," : "Kind regards,";
  const signer = [fr ? `L'équipe ${BRAND}` : `The ${BRAND} Team`,
    fr ? "Pistes exclusives au bon moment pour les prestataires B2B" : "Exclusive trigger leads for B2B service firms",
    siteUrl().replace(/^https?:\/\//, ""), CONTACT].join("\n");
  const footer = `${LEGAL_NAME} · Hauptstraße 14a, 06333 Hettstedt, Germany\n${siteUrl().replace(/^https?:\/\//, "")}`;
  const text = mailText(blocks) + `\n\n${closing}\n${signer}\n\n${footer}`;
  return { subject, text, html: renderMail({ lang: w.lang, brand: BRAND, blocks, closing, signer, footer }) };
}

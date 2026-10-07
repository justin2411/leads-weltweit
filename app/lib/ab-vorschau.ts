/**
 * Live-Vorschau der A/B-Tests (Inhaber 05.10.2026: „wenn ich drüber hover einen screenshot auszug sehe was dort genau
 * getestet wird … wie ein livebild“). Reine Funktionen ohne Next/Supabase (testbar, auch im Browser):
 * - Mail-Schritte: Mail im echten Layout (lib/mail-html.ts, Bauplan docs/KALTMAIL-VORLAGE.md) mit Posteingangs-Zeile;
 *   Platzhalter mit neutralem Beispiel gefüllt (nie echte Lead- oder Käuferdaten), getestete Stelle golden markiert.
 * - Seiten-Schritte: Adresse der Inhaber-Vorschau (?vorschau=1, zählt nie) und die Stelle, die markiert wird.
 * - Stripe-Kasse: Nachbau des Hinweistextes (Stripe lässt sich nicht einbetten).
 * Texte wie scripts/drafts.py (S2), scripts/followups.py und scripts/responder.py; nur Anzeige, ändert nichts.
 */
import { renderMail, type MailBlock } from "./mail-html.ts";

export type PeekCountry = "US" | "UK" | "FR";
export type PeekKind = "mail" | "page" | "kasse" | "text";

/** Neutrales Beispiel statt echter Firmen (keine Lead- oder Käuferdaten in der Vorschau). */
export const BEISPIEL: Record<PeekCountry, { firma: string; kurz: string }> = {
  US: { firma: "Example LLC", kurz: "Example" },
  UK: { firma: "Example Ltd", kurz: "Example" },
  FR: { firma: "Exemple SARL", kurz: "Exemple" },
};
const LAND: Record<PeekCountry, string> = { US: "the US", UK: "the UK", FR: "toute la France" };
/** Beleg-Einstieg ({belege}, scripts/lib/belege.py): im Versand 2 echte, freigegebene Premium-Anlässe; hier neutral. */
const BELEG_BEISPIEL: Record<PeekCountry, string> = {
  US: "Two recent examples: Example One LLC (newly registered, no website yet, Oct 1) and Example Two Inc (security certificate about to expire, Oct 4).",
  UK: "Two recent examples: Example One Ltd (newly registered, no website yet, Oct 1) and Example Two Ltd (security certificate about to expire, Oct 4).",
  FR: "Deux exemples récents : Exemple Un SAS (site sans HTTPS, 3 octobre) et Exemple Deux SARL (a déménagé, site avec l'ancienne adresse, 30 septembre).",
};
const cc = (c: string): PeekCountry => (c === "US" || c === "FR" ? c : "UK");
const isFr = (c: string) => cc(c) === "FR";

/** Markierung der getesteten Stelle: Steuerzeichen, die esc() unverändert lässt, danach zu <mark>. */
export const MARK_ON = "\u0001";
export const MARK_OFF = "\u0002";
export const MARK_STYLE = "background:#F6E7C1;color:inherit;border-radius:3px;padding:1px 2px;box-shadow:0 0 0 2px #D8BD8A;";
const mark = (s: string) => `${MARK_ON}${s}${MARK_OFF}`;

/**
 * Platzhalter füllen: {firma}/{firm}/{company}/{name} → Beispiel-Firma, {kurz}/{short} → Kurzname, {land}/{area}/
 * {region}/{ort} → Land; unbekannte Platzhalter → „…“ (nie roh anzeigen).
 */
export function fillPlaceholders(text: string, country: string): string {
  const b = BEISPIEL[cc(country)];
  return String(text ?? "").replace(/\{\s*([a-zA-Z_]+)\s*\}/g, (_m, k: string) => {
    const key = k.toLowerCase();
    if (["firma", "firm", "company", "company_name", "name", "agentur", "agency"].includes(key)) return b.firma;
    if (["kurz", "short", "kurzname"].includes(key)) return b.kurz;
    if (["land", "area", "region", "ort", "country"].includes(key)) return LAND[cc(country)];
    if (key === "belege") return BELEG_BEISPIEL[cc(country)];
    return "…";
  });
}

/** Wandelt die Markierung in gerendertem HTML in <mark> um (vorher von esc() unberührt). */
export function markHtml(html: string): string {
  return html.split(MARK_ON).join(`<mark data-ab-mark style="${MARK_STYLE}">`).split(MARK_OFF).join("</mark>");
}
/** Markierung entfernen (Text-Zeilen ohne HTML, z. B. Betreff in der Posteingangs-Zeile). */
export const stripMark = (s: string) => s.split(MARK_ON).join("").split(MARK_OFF).join("");

export function peekKind(step: string): PeekKind {
  if (["mail_betreff", "mail_einstieg", "nachfass", "probe_mail", "probe_nachfrage", "antwort", "mail_zeit"].includes(step)) return "mail";
  if (step === "landing" || step === "tarif") return "page";
  if (step === "checkout") return "kasse";
  return "text";
}

// ------------------------------------------------------------------------------------------- Standardtexte (S2)
const T = {
  en: {
    from: "Justin · NextGen Profit",
    subject: (c: PeekCountry) => `Local businesses across ${LAND[c]} without a website`,
    greet: (c: PeekCountry) => `Hi ${BEISPIEL[c].kurz} team,`,
    einstieg: (c: PeekCountry) => `I'm writing to the team at ${BEISPIEL[c].firma} directly. I'm Justin, founder of NextGen Profit. We find local businesses across ${LAND[c]} that still have no website, a clear reason for them to talk to a web agency.`,
    core: "Every Monday you get a short PDF briefing and a spreadsheet: company, phone, email, who to ask for and an opening line.",
    offer: (c: PeekCountry) => `I've put together a free sample of 10 current leads from across ${LAND[c]}.`,
    frage: "Shall I send it over?",
    button: "See my 10 free leads",
    bye: "Best regards,",
    signer: "Justin\nFounder, NextGen Profit",
    footer: "NextGen Profit · business address\nWhy you get this: your firm's public business contact.\nNo more emails: reply \"unsubscribe\" or use the link.",
    nachfass: (c: PeekCountry) => `Just a short follow-up on my note about local businesses without a website across ${LAND[c]}.`,
    nachfassCore: "Your free sample of 10 current leads is ready: company, phone, email, who to ask for and an opening line. No obligation, and you will see within a few minutes whether it fits.",
    probeSubject: "Your 10 free leads",
    probe1: (c: PeekCountry) => `Here are your 10 free leads from across ${LAND[c]}, as a short PDF briefing and a spreadsheet for your CRM.`,
    probe2: "Each one is a local business without a website, with phone, email, who to ask for and an opening line.",
    tipp: "My tip: start with the leads marked high priority and use the opening line for the first minute of the call.",
    schluss: "If they work for you, you get fresh leads like these every Monday.",
    plan: "Choose your plan",
    hello: "Hello,",
    nachfrage1: "Did you get a chance to look at the 10 leads I sent over?",
    nachfrage2: (c: PeekCountry) => `If one or two of them caught your eye, you get a fresh list like this every Monday, across ${LAND[c]}, reserved for your firm.`,
    nachfrageFrage: "Shall we start next Monday?",
    faqSubject: "Re: Your question",
    faq1: "Thank you for your question.",
    faqAnswer: "[answer from the fixed FAQ text]",
    faqFrage: "Would you like me to send you the free sample of 10 current leads? A simple \"yes\" is enough.",
    tage: (n: string) => `after ${n} days`,
  },
  fr: {
    from: "Justin · NextGen Profit",
    subject: () => "Entreprises en France sans site web",
    greet: () => "Bonjour,",
    einstieg: (c: PeekCountry) => `Je me permets d'écrire directement à ${BEISPIEL[c].firma}. Je suis Justin, fondateur de NextGen Profit. Nous trouvons des entreprises locales de toute la France qui n'ont toujours pas de site web, une bonne raison pour elles de parler à une agence web.`,
    core: "Chaque lundi, vous recevez un court briefing PDF et un tableau : entreprise, téléphone, e-mail, la personne à demander et une phrase d'accroche.",
    offer: () => "J'ai préparé pour vous un échantillon gratuit de 10 pistes actuelles de toute la France.",
    frage: "Je vous l'envoie ?",
    button: "Voir mes 10 pistes gratuites",
    bye: "Bien cordialement,",
    signer: "Justin\nFondateur, NextGen Profit",
    footer: "NextGen Profit · adresse de l'entreprise\nPourquoi ce message : coordonnées professionnelles publiques de votre entreprise.\nNe plus recevoir d'e-mails : répondez « désinscription » ou utilisez le lien.",
    nachfass: () => "Je reviens brièvement vers vous au sujet des entreprises sans site web de toute la France.",
    nachfassCore: "Votre échantillon gratuit de 10 pistes actuelles est prêt : entreprise, téléphone, e-mail, la personne à demander et une phrase d'accroche. Sans engagement, et vous voyez en quelques minutes si cela vous correspond.",
    probeSubject: "Vos 10 pistes gratuites",
    probe1: () => "Voici vos 10 pistes gratuites de toute la France, en court briefing PDF et en tableau pour votre CRM.",
    probe2: "Chaque piste est une entreprise locale sans site web, avec téléphone, e-mail, la personne à demander et une phrase d'accroche.",
    tipp: "Mon conseil : commencez par les pistes en priorité haute et utilisez la phrase d'accroche pour la première minute de l'appel.",
    schluss: "Si elles vous conviennent, vous recevez de nouvelles pistes comme celles-ci chaque lundi.",
    plan: "Choisissez votre formule",
    hello: "Bonjour,",
    nachfrage1: "Avez-vous pu jeter un œil aux 10 pistes que je vous ai envoyées ?",
    nachfrage2: () => "Si une ou deux entreprises vous ont parlé, vous recevez une nouvelle liste comme celle-ci chaque lundi, de toute la France, réservée à votre entreprise.",
    nachfrageFrage: "On démarre lundi prochain ?",
    faqSubject: "Re: Votre question",
    faq1: "Merci pour votre question.",
    faqAnswer: "[réponse issue des textes FAQ fixes]",
    faqFrage: "Souhaitez-vous recevoir l'échantillon gratuit de 10 pistes actuelles ? Il suffit de répondre « oui ».",
    tage: (n: string) => `après ${n} jours`,
  },
};

export type MailPeek = {
  from: string; subject: string; subjectMarked: boolean; preheader: string;
  chip: string | null; chipMarked: boolean; html: string; marked: boolean;
};

const txt = (v: unknown) => (v === undefined || v === null || String(v).trim() === "" ? null : String(v).replace(/\s+/g, " ").trim());

/**
 * Mail einer Variante. value = Wert des getesteten Elements in dieser Variante (null = heutiger Standard). Die
 * getestete Stelle ist markiert (subjectMarked / chipMarked / <mark> im HTML).
 */
export function mailPeek(step: string, element: string, country: string, value: unknown): MailPeek {
  const c = cc(country), L = isFr(c) ? T.fr : T.en, lang = isFr(c) ? "fr" : "en";
  const v = txt(value) === null ? null : fillPlaceholders(txt(value) as string, c);
  const pick = (el: string, def: string) => (element === el ? mark(v ?? def) : def);
  const btn: MailBlock = { button: L.button, href: "#" };
  let subject = L.subject(c), chip: string | null = null, chipMarked = false;
  let blocks: MailBlock[];
  let closing = L.bye;

  if (step === "nachfass" || step === "probe_nachfrage") {
    const days = element === "tage" && v ? v : step === "nachfass" ? "4" : "3";
    chip = L.tage(days);
    chipMarked = element === "tage";
    if (step === "nachfass") {
      subject = L.subject(c);
      blocks = [{ p: L.greet(c) }, { p: L.nachfass(c) }, { p: L.nachfassCore }, { p: pick("frage", L.frage) }, btn];
    } else {
      subject = L.probeSubject;
      blocks = [{ p: L.hello }, { p: L.nachfrage1 }, { p: L.nachfrage2(c) }, { button: L.plan, href: "#" }, { p: pick("frage", L.nachfrageFrage) }];
    }
  } else if (step === "probe_mail") {
    subject = L.probeSubject;
    blocks = [{ p: L.hello }, { p: L.probe1(c) }, { p: L.probe2 }, { p: pick("tipp", L.tipp) }, { p: pick("schluss", L.schluss) }, { button: L.plan, href: "#" }];
  } else if (step === "antwort") {
    subject = L.faqSubject;
    blocks = [{ p: L.hello }, { p: L.faq1 }, { note: L.faqAnswer }, { p: pick("faq_frage", L.faqFrage) }];
  } else {
    // Kaltmail (mail_betreff, mail_einstieg, mail_zeit)
    if (element === "betreff") subject = mark(v ?? L.subject(c));
    if (element === "fenster") { chip = v === "spaet" ? (isFr(c) ? "envoi : après-midi" : "sent: afternoon") : (isFr(c) ? "envoi : matin" : "sent: morning"); chipMarked = true; }
    blocks = [{ p: L.greet(c) }, { p: pick("einstieg", L.einstieg(c)) }, { p: L.core }, { p: `${L.offer(c)} ${pick("frage", L.frage)}` }, btn];
  }
  const html = markHtml(renderMail({ lang, brand: "NextGen Profit", blocks, closing, signer: L.signer, footer: L.footer }));
  const first = blocks.map((b) => ("p" in b ? stripMark(b.p) : "")).filter(Boolean).slice(1, 2).join(" ");
  return {
    from: L.from, subject: stripMark(subject), subjectMarked: subject.includes(MARK_ON),
    preheader: first.length > 90 ? `${first.slice(0, 89).trimEnd()}…` : first,
    chip, chipMarked, html, marked: html.includes("data-ab-mark"),
  };
}

// ------------------------------------------------------------------------------------------- Seiten
const SLUG: Record<string, { en: string; fr: string }> = { S2: { en: "web-agencies", fr: "agences-web" } };
/** Stelle auf der Seite, die markiert und in den sichtbaren Bereich geholt wird. */
export const PAGE_SELECTOR: Record<string, string> = {
  "landing.headline": "h1", "landing.subheadline": "p.sub", "landing.cta_label": ".ctabox", "landing.value_block": "#wert",
  "tarif.titel": "main h1", "tarif.lede": "main .lede",
};

export type PagePeek = { src: string; selector: string; fallback: string };

/**
 * Inhaber-Vorschau der Seite für eine Variante. Landingpage: ?vorschau=1&v=<Seiten-Variante> (pageKey aus
 * page_variants, sonst A/B); Tarifseite: ?vorschau=1&abv=A|B. Beides zählt nie (Tracker/Beacon aus bei vorschau=1).
 * fallback: Stelle, falls das Element fehlt (z. B. Wertrechnung „aus“ → Bereich davor).
 */
export function pagePeek(step: string, element: string, country: string, segment: string, variant: string, pageKey?: string | null): PagePeek | null {
  const s = SLUG[segment];
  if (!s) return null;
  const c = cc(country);
  const base = `/${c.toLowerCase()}/${isFr(c) ? s.fr : s.en}`;
  const selector = PAGE_SELECTOR[`${step}.${element}`] ?? "h1";
  const key = /^[A-Za-z0-9_-]{1,20}$/.test(String(pageKey ?? "")) ? String(pageKey) : variant;
  if (step === "landing") return { src: `${base}?vorschau=1&v=${encodeURIComponent(key)}`, selector, fallback: "#video, .sec" };
  if (step === "tarif") return { src: `${base}/start?vorschau=1&abv=${variant === "B" ? "B" : "A"}`, selector, fallback: "main h1" };
  return null;
}

/** Stripe-Kasse (nicht einbettbar): schlichter Nachbau mit dem Hinweistext der Variante, markiert. */
export function kassePeek(country: string, value: unknown): string {
  const c = cc(country), fr = isFr(c);
  const v = txt(value);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const hint = v ? `<mark data-ab-mark style="${MARK_STYLE}">${esc(fillPlaceholders(v, c))}</mark>`
    : `<mark data-ab-mark style="${MARK_STYLE}">${fr ? "(aucun texte – état actuel)" : "(no note – current state)"}</mark>`;
  const F = "-apple-system,BlinkMacSystemFont,'Segoe UI',Helvetica,Arial,sans-serif";
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;background:#F6F8FA;font-family:${F};color:#1A1F36">
<div style="display:flex;gap:28px;padding:28px 32px">
<div style="flex:1"><div style="font-size:14px;color:#697386">NextGen Profit</div><div style="font-size:15px;margin-top:14px">${fr ? "Abonnement" : "Subscribe to"} Pro</div>
<div style="font-size:34px;font-weight:700;margin-top:4px">··· <span style="font-size:14px;font-weight:400;color:#697386">${fr ? "par mois" : "per month"}</span></div></div>
<div style="flex:1;background:#fff;border-radius:8px;padding:20px;box-shadow:0 2px 8px rgba(0,0,0,.08)">
<div style="height:34px;border:1px solid #E3E8EE;border-radius:6px;margin-bottom:10px"></div><div style="height:34px;border:1px solid #E3E8EE;border-radius:6px;margin-bottom:14px"></div>
<div style="height:40px;border-radius:6px;background:#0B1428;color:#fff;display:grid;place-items:center;font-weight:600">${fr ? "S'abonner" : "Subscribe"}</div>
<p style="font-size:13px;line-height:1.45;color:#3C4257;margin:14px 0 0">${hint}</p></div></div></body></html>`;
}

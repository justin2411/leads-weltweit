import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { BRAND, CONTACT, LEGAL_NAME, siteUrl } from "./site";

/**
 * Zahlungsbestätigung als PDF im Design der Lead-PDF (Navy/Gold/Creme), Anhang der Willkommensmail.
 * Ausdrücklich KEINE Rechnung (Inhaber 02.10.2026: „Nur Zahlungsbestätigung“) – die Rechnung stellt Stripe aus,
 * so gibt es pro Zahlung nur eine Rechnung (§ 14c UStG).
 */
export type Receipt = {
  lang: "en" | "fr";
  company: string;
  email: string;
  plan: string;
  weekly?: number;
  amount: string;        // bereits formatiert, z. B. „$249“
  tax?: string;          // enthaltene USt., formatiert (nur wenn > 0)
  paidAt: Date;
  reference: string;     // Stripe-Zahlungsreferenz
  test?: boolean;
};

const NAVY = rgb(0x0b / 255, 0x14 / 255, 0x30 / 255);
const GOLD = rgb(0xb0 / 255, 0x8d / 255, 0x57 / 255);
const GOLD2 = rgb(0xd8 / 255, 0xbd / 255, 0x8a / 255);
const CREAM = rgb(0xf7 / 255, 0xf4 / 255, 0xee / 255);
const INK = rgb(0x16 / 255, 0x1b / 255, 0x24 / 255);
const SOFT = rgb(0x5b / 255, 0x63 / 255, 0x72 / 255);
const LINE = rgb(0xe4 / 255, 0xdd / 255, 0xd0 / 255);

const T = {
  en: {
    title: "Payment confirmation", sub: "Thank you for your order.", to: "Confirmed for", details: "Subscription",
    plan: "Plan", leads: "Leads per week", upTo: "up to", period: "Billing", monthly: "Monthly, cancel any time",
    date: "Payment date", ref: "Payment reference", paid: "Amount paid", perMonth: "per month", tax: "of which VAT",
    note: "This is a confirmation of your payment, not a tax invoice. Your invoice is issued separately by our payment provider Stripe.",
    test: "TEST MODE - no real payment",
  },
  fr: {
    title: "Confirmation de paiement", sub: "Merci pour votre commande.", to: "Confirmé pour", details: "Abonnement",
    plan: "Formule", leads: "Pistes par semaine", upTo: "jusqu'à", period: "Facturation", monthly: "Mensuelle, résiliable à tout moment",
    date: "Date du paiement", ref: "Référence du paiement", paid: "Montant payé", perMonth: "par mois", tax: "dont TVA",
    note: "Ce document confirme votre paiement, ce n'est pas une facture. Votre facture est émise séparément par notre prestataire de paiement Stripe.",
    test: "MODE TEST - aucun paiement réel",
  },
};

/** Text auf die Breite umbrechen (Standard-Schrift, WinAnsi). */
function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const out: string[] = [];
  let line = "";
  for (const w of text.split(/\s+/)) {
    const next = line ? `${line} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > width && line) { out.push(line); line = w; } else line = next;
  }
  if (line) out.push(line);
  return out;
}

/** Nur Zeichen, die die Standard-Schriften (WinAnsi) kennen. */
const safe = (s: string) => s.replace(/[  ]/g, " ").replace(/[^\x20-\x7e -ÿ€£–—‘’“”•…]/g, "");

export async function receiptPdf(r: Receipt): Promise<Uint8Array> {
  const t = T[r.lang];
  const doc = await PDFDocument.create();
  doc.setTitle(`${BRAND} – ${t.title}`);
  doc.setAuthor(LEGAL_NAME);
  const page: PDFPage = doc.addPage([595.28, 841.89]);
  const { width: W, height: H } = page.getSize();
  const reg = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const M = 56;
  const text = (s: string, x: number, y: number, size: number, font = reg, color = INK) =>
    page.drawText(safe(s), { x, y, size, font, color });
  const right = (s: string, xr: number, y: number, size: number, font = reg, color = INK) =>
    text(s, xr - font.widthOfTextAtSize(safe(s), size), y, size, font, color);

  // Hintergrund und Kopf
  page.drawRectangle({ x: 0, y: 0, width: W, height: H, color: CREAM });
  page.drawRectangle({ x: 0, y: H - 150, width: W, height: 150, color: NAVY });
  page.drawRectangle({ x: 0, y: H - 153, width: W, height: 3, color: GOLD });
  const [b1, ...rest] = BRAND.split(" ");
  text(b1, M, H - 62, 22, bold, rgb(0.96, 0.94, 0.9));
  if (rest.length) text(" " + rest.join(" "), M + bold.widthOfTextAtSize(b1, 22), H - 62, 22, bold, GOLD2);
  text(t.title.toUpperCase(), M, H - 104, 11, bold, GOLD2);
  text(t.sub, M, H - 124, 12, reg, rgb(0.72, 0.76, 0.84));
  if (r.test) right(t.test, W - M, H - 62, 10, bold, GOLD2);

  // Betragskarte
  let y = H - 200;
  page.drawRectangle({ x: M, y: y - 92, width: W - 2 * M, height: 92, color: rgb(1, 1, 1), borderColor: GOLD, borderWidth: 1.2 });
  text(t.paid.toUpperCase(), M + 24, y - 30, 9, bold, SOFT);
  text(r.amount, M + 24, y - 66, 32, bold, INK);
  text(t.perMonth, M + 30 + bold.widthOfTextAtSize(safe(r.amount), 32), y - 66, 11, reg, SOFT);
  right(t.date.toUpperCase(), W - M - 24, y - 30, 9, bold, SOFT);
  const fmt = new Intl.DateTimeFormat(r.lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
  right(fmt.format(r.paidAt), W - M - 24, y - 50, 13, bold, INK);
  if (r.tax) right(`${t.tax} ${r.tax}`, W - M - 24, y - 68, 10, reg, SOFT);

  // Angaben
  y -= 140;
  const rows: [string, string][] = [
    [t.to, r.company],
    ["E-mail", r.email],
    [t.plan, r.plan],
    ...(r.weekly ? [[t.leads, `${t.upTo} ${new Intl.NumberFormat(r.lang === "fr" ? "fr-FR" : "en-GB").format(r.weekly)}`] as [string, string]] : []),
    [t.period, t.monthly],
    [t.ref, r.reference],
  ];
  text(t.details.toUpperCase(), M, y, 9, bold, GOLD);
  y -= 14;
  for (const [k, v] of rows) {
    page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: LINE });
    y -= 22;
    text(k, M, y, 11, reg, SOFT);
    right(v.length > 60 ? v.slice(0, 57) + "..." : v, W - M, y, 11, bold, INK);
    y -= 12;
  }
  page.drawLine({ start: { x: M, y }, end: { x: W - M, y }, thickness: 0.8, color: LINE });

  // Hinweis „keine Rechnung“
  y -= 40;
  const note = wrap(t.note, reg, 10.5, W - 2 * M - 20);
  page.drawRectangle({ x: M, y: y - note.length * 16 + 4, width: 3, height: note.length * 16 + 8, color: GOLD });
  for (const l of note) { text(l, M + 16, y - 6, 10.5, reg, SOFT); y -= 16; }

  // Fuß
  const host = siteUrl().replace(/^https?:\/\//, "");
  page.drawLine({ start: { x: M, y: 74 }, end: { x: W - M, y: 74 }, thickness: 0.8, color: LINE });
  text(`${LEGAL_NAME} · Nikolaistraße 3-7, 04109 Leipzig, Germany`, M, 56, 9, reg, SOFT);
  text(`${host} · ${CONTACT}`, M, 42, 9, reg, SOFT);
  return doc.save();
}

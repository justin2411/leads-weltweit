/**
 * Testmail: Willkommensmail nach dem Kauf an den Inhaber (Betreff mit [TEST]). Geht nie an Käufer.
 * Aufruf (testmail.yml, art=willkommen): npx tsx scripts/testmail-welcome.ts <an> <US|UK|FR>
 */
import { welcomeMail } from "../lib/welcome-mail";
import { siteUrl } from "../lib/site";
import { receiptPdf } from "../lib/receipt-pdf";

const [to, land = "US"] = process.argv.slice(2);
const fr = land === "FR";
const cur = land === "UK" ? "£" : fr ? "" : "$";
const price = fr ? "249 €" : `${cur}249`;
const m = welcomeMail({ lang: fr ? "fr" : "en", company: "Example Studio", plan: "Pro", weekly: 50, price,
  formLink: `${siteUrl()}/danke?demo=1&seg=S2#focus` });

async function main() {
const pdf = await receiptPdf({ lang: fr ? "fr" : "en", company: "Example Studio", email: to, plan: "Pro", weekly: 50, amount: price,
  paidAt: new Date(), reference: "in_TEST0000000000", test: true });
const r = await fetch("https://api.resend.com/emails", {
  method: "POST",
  headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
  body: JSON.stringify({ from: process.env.MAIL_FROM, to: [to], subject: `[TEST] ${m.subject}`, text: m.text, html: m.html,
    attachments: [{ filename: fr ? "Confirmation-de-paiement.pdf" : "Payment-Confirmation.pdf", content: Buffer.from(pdf).toString("base64") }],
    ...(process.env.REPLY_TO ? { reply_to: process.env.REPLY_TO } : {}) }),
});
if (!r.ok) throw new Error(`Resend ${r.status} ${await r.text()}`);
console.log(`Willkommensmail (Test) an ${to} gesendet`);
}
main().catch((e) => { console.error(e); process.exit(1); });

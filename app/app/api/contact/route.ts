import { sendConsentMail } from "@/lib/mail";
import { mailText, renderMail, type MailBlock } from "@/lib/mail-html";
import { BRAND, LEGAL_NAME, siteUrl } from "@/lib/site";
import { db } from "@/lib/supabase";
import { validEmail, wishesFor } from "@/content/sample-wishes";
import { LEAD_COUNTRIES, leadCountry } from "@/lib/country";
import { CONTACT_PATH, CONTACT_TX } from "../../contact/contact-i18n";
import { CONTACT_INDUSTRY_KEYS } from "../../industry-options";
import { HOME, type HomeLang } from "../../home-i18n";

export const dynamic = "force-dynamic";

const clean = (v: FormDataEntryValue | null, n: number) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);

/**
 * Kontaktanfrage (Inhaber 03.10.2026). Speichert in signalwerk.contact_requests mit Einwilligung (Wortlaut + Zeit),
 * meldet die Anfrage dem Inhaber und bestätigt dem Absender kurz (er hat selbst geschrieben, Resend erlaubt).
 * JSON für das Formular mit JavaScript, sonst Weiterleitung zurück zur Kontaktseite.
 */
export async function POST(req: Request) {
  const f = await req.formData();
  const lang: HomeLang = (["en", "fr", "de"] as const).find((l) => l === f.get("lang")) ?? "en";
  const json = (req.headers.get("accept") ?? "").includes("application/json");
  const answer = (ok: boolean, error = "") => json
    ? Response.json(ok ? { ok: true } : { ok: false, error }, { status: ok ? 200 : 400 })
    : Response.redirect(`${siteUrl()}${CONTACT_PATH[lang]}?${ok ? "gesendet=1" : `fehler=${error}`}#form`, 303);

  // Falle für Bots: verstecktes Feld ausgefüllt -> scheinbar erfolgreich, nichts speichern
  if (clean(f.get("website"), 200)) return answer(true);

  const company = clean(f.get("company"), 200);
  const email = clean(f.get("email"), 200).toLowerCase();
  // Branchen und Länder wie im Probe-Formular der Startseite (Inhaber 03.10.2026)
  const industry = CONTACT_INDUSTRY_KEYS.find((k) => k === f.get("industry"));
  const country = LEAD_COUNTRIES.find((c) => c.code === f.get("country"))?.code ?? null;
  const consented = ["yes", "on", "1", "true"].includes(String(f.get("consent") ?? ""));
  if (company.length < 2) return answer(false, "company");
  if (!validEmail(email)) return answer(false, "email");
  if (!industry) return answer(false, "industry");
  if (!country) return answer(false, "country");
  if (!consented) return answer(false, "consent");
  const allowed = new Set(wishesFor(industry).map((w) => w.key));
  const wishes = [...new Set(f.getAll("signals").map(String))].filter((k) => allowed.has(k)).slice(0, 10);
  const name = clean(f.get("name"), 120) || null;
  const phone = clean(f.get("phone"), 40) || null;
  const message = String(f.get("message") ?? "").trim().slice(0, 1500) || null;

  // Höchstens 3 Anfragen je Adresse in 24 Stunden; darüber scheinbar erfolgreich, nichts speichern
  const day = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
  const { count } = await db().from("contact_requests").select("id", { count: "exact", head: true })
    .eq("email", email).gte("created_at", day);
  if ((count ?? 0) >= 3) return answer(true);

  const T = CONTACT_TX[lang];
  const { data: suppressed } = await db().rpc("is_suppressed", { p_email: email });
  const { error } = await db().from("contact_requests").insert({
    name, company_name: company, email, phone, country, industry, wishes, message, lang,
    consent_text: T.consent, consent_at: new Date().toISOString(),
    status: suppressed ? "rejected" : "new", note: suppressed ? "Adresse/Domain gesperrt – keine Mail" : null,
  });
  if (error) return answer(false, "server");

  // Meldung an den Inhaber (immer, auch bei gesperrter Adresse: er soll die Anfrage sehen)
  const owner = process.env.SALE_NOTIFY_EMAIL?.trim() || process.env.OWNER_EMAIL?.trim();
  if (owner) {
    const wl = (k: string) => wishesFor(industry).find((w) => w.key === k)?.de ?? k;
    const lines = [
      `Neue Kontaktanfrage über die Website (${lang.toUpperCase()})`, "",
      `Firma: ${company}`, `Name: ${name ?? "–"}`, `E-Mail: ${email}`, `Telefon: ${phone ?? "–"}`,
      `Branche: ${HOME.de.industries[industry]?.[0] ?? industry}`, `Leads aus: ${leadCountry(country)?.name.de ?? country}`,
      `Gewünschte Leads: ${wishes.length ? wishes.map(wl).join(", ") : "–"}`, "", `Nachricht:`, message ?? "–",
      ...(suppressed ? ["", "Achtung: Adresse oder Domain steht auf der Sperrliste – keine Bestätigung verschickt."] : []),
    ];
    await sendConsentMail(owner, `Kontaktanfrage: ${company}`, lines.join("\n")).catch(() => null);
  }
  if (!suppressed) {
    const m = confirmation(lang, T.consent);
    await sendConsentMail(email, m.subject, m.text, m.html).catch(() => null); // Anfrage ist gespeichert; Bestätigung optional
  }
  return answer(true);
}

/** Kurze Bestätigung ohne Preise und ohne Zeitversprechen. */
function confirmation(lang: HomeLang, consent: string) {
  const ml: "en" | "fr" = lang === "fr" ? "fr" : "en";
  const TX = {
    en: { subject: "We have received your enquiry", hi: "Hello,", p: "Thank you for getting in touch. Your personal contact will read your enquiry and reply to you in person, usually with a free sample of 10 leads that fit your brief.", rec: "For your records, you agreed as follows:", stop: "To stop hearing from us, simply reply \"unsubscribe\".", closing: "Kind regards," },
    fr: { subject: "Nous avons bien reçu votre demande", hi: "Bonjour,", p: "Merci de nous avoir contactés. Votre interlocuteur personnel lit votre demande et vous répond lui-même, en général avec un échantillon gratuit de 10 prospects adaptés à votre demande.", rec: "Pour vos archives, votre accord :", stop: "Pour ne plus rien recevoir, répondez simplement « désinscription ».", closing: "Bien cordialement," },
    de: { subject: "Wir haben Ihre Anfrage erhalten", hi: "Guten Tag,", p: "Danke für Ihre Nachricht. Ihr persönlicher Ansprechpartner liest Ihre Anfrage und antwortet Ihnen selbst, meist mit einer kostenlosen Probe von 10 Leads, die zu Ihren Wünschen passen.", rec: "Für Ihre Unterlagen, Ihre Einwilligung:", stop: "Wenn Sie nichts mehr von uns hören möchten, antworten Sie einfach „abmelden“.", closing: "Mit freundlichen Grüßen," },
  }[lang];
  const blocks: MailBlock[] = [{ p: TX.hi }, { p: TX.p }, { note: `${TX.rec} „${consent}“ ${TX.stop}` }];
  const footer = `${LEGAL_NAME} · Nikolaistraße 3-7, 04109 Leipzig, Germany\n${siteUrl().replace(/^https?:\/\//, "")}`;
  const text = mailText(blocks) + `\n\n${TX.closing}\n${BRAND}\n\n${footer}`;
  return { subject: TX.subject, text, html: renderMail({ lang: ml, brand: BRAND, blocks, closing: TX.closing, signer: BRAND, footer }) };
}

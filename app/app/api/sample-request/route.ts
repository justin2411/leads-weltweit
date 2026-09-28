import { consentText } from "@/lib/consent";
import { sendConsentMail } from "@/lib/mail";
import { mailText, renderMail, type MailBlock } from "@/lib/mail-html";
import { recordEvent } from "@/lib/page-events";
import { getSettings, isOwner, pageIsPublic } from "@/lib/pages";
import { BRAND, LEGAL_NAME, siteUrl } from "@/lib/site";
import { db } from "@/lib/supabase";
import { isBusinessEmail } from "@/lib/variants";
import { personalFor } from "@/lib/recipient";
import { COUNTRIES, type CountryCode } from "@/lib/country";

export const dynamic = "force-dynamic";

function back(slug: string, q: string, preview = "") {
  return Response.redirect(`${siteUrl()}/${slug}?${preview}${q}#top`, 303);
}

/** Probe-Anfrage aus dem Formular. Speichert Einwilligung mit Wortlaut und Zeitstempel. */
export async function POST(req: Request) {
  const f = await req.formData();
  const variantId = String(f.get("variant_id") ?? "");
  const { data: v } = await db()
    .from("page_variants")
    .select("id, status, variant_key, landing_pages(slug, status, segment_id, country, language)")
    .eq("id", variantId)
    .maybeSingle();
  const page: any = v?.landing_pages;
  if (!v || !page) return new Response("Not found", { status: 404 });
  const isPublic = v.status === "live" && pageIsPublic(page, await getSettings());
  const test = !isPublic && f.get("vorschau") === "1" && (await isOwner());
  if (!isPublic && !test) return new Response("Not found", { status: 404 });
  const rTok = String(f.get("r") ?? "");
  const pv = (test ? `vorschau=1&v=${v.variant_key}&` : "") + (/^[A-Za-z0-9_-]{8,80}$/.test(rTok) ? `r=${rTok}&` : "");
  // Kein Formular mehr: Firma, Adresse und Gebiet kommen serverseitig aus dem Mail-Link, nie aus Eingaben.
  const who = await personalFor(rTok, page);
  const company = (who?.firma ?? "").slice(0, 200);
  const email = (who?.email ?? "").trim().toLowerCase().slice(0, 200);
  const region = (who?.gebiet ?? "").slice(0, 200);
  if (!company || !isBusinessEmail(email) || f.get("consent") !== "yes") return back(page.slug, "fehler=1", pv);

  // Doppelklick oder zweiter Besuch: dieselbe Anfrage (Adresse, Zielgruppe, Land) in 30 Tagen nur einmal
  // speichern und bestätigen; die Seite zeigt trotzdem die Erfolgsmeldung.
  if (!test) {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: dup } = await db().from("sample_requests").select("id")
      .eq("email", email).eq("segment_id", page.segment_id).eq("country", page.country)
      .in("status", ["new", "sent"]).gte("created_at", since).limit(1);
    if (dup?.length) return back(page.slug, "angefragt=1", pv);
  }

  const { data: suppressed } = await db().rpc("is_suppressed", { p_email: email });
  const consent = consentText(page.language);
  // Inhaber-Vorschau (TEST): nie als offene Anfrage speichern (web_samples.py würde sonst dem echten Empfänger
  // aus dem Mail-Link eine Probe schicken) und nie den echten Empfänger anschreiben.
  const { error } = await db().from("sample_requests").insert({
    variant_id: v.id, company_name: company, email, segment_id: page.segment_id, country: page.country,
    region: region || null, consent_text: consent, consent_at: new Date().toISOString(),
    status: suppressed || test ? "rejected" : "new",
    note: [suppressed ? "Adresse/Domain gesperrt – keine Mail" : "", test ? "TEST (Inhaber-Vorschau)" : ""].filter(Boolean).join("; ") || null,
  });
  if (error) return new Response("Fehler", { status: 500 });
  if (!test) await recordEvent(v.id, "sample_request");

  const m = confirmationMail(page.language === "fr" ? "fr" : "en", page.country, consent);
  if (test) {
    // Vorschau: Bestätigung nur an den Inhaber (falls hinterlegt), nie an die Adresse aus dem Mail-Link
    const owner = process.env.SALE_NOTIFY_EMAIL?.trim() || process.env.OWNER_EMAIL?.trim();
    if (owner) await sendConsentMail(owner, `[TEST] ${m.subject}`, m.text, m.html).catch(() => null);
  } else if (!suppressed) {
    await sendConsentMail(email, m.subject, m.text, m.html).catch(() => null); // Anfrage ist gespeichert; Bestätigung ist optional
  }
  return back(page.slug, "angefragt=1", pv);
}

/** Bestätigung der Probe-Anfrage: Text- und HTML-Version, ohne Preise und ohne Zeitversprechen.
 *  Landesweit formuliert (Inhaber 27.09.2026): keine Städte oder Regionen, nur das Land. */
function confirmationMail(lang: "en" | "fr", country: string, consent: string) {
  const fr = lang === "fr";
  const c = COUNTRIES[country as CountryCode];
  const area = c ? (fr ? ` ${c.landDe ?? `pour ${c.name.fr}`}` : ` from across ${c.land}`) : "";
  const subject = fr ? "Votre demande d'échantillon est confirmée" : "Your sample request is confirmed";
  // Kurz, leicht, ohne Druck: was jetzt passiert und warum es sich lohnt, kurz hineinzuschauen
  const blocks: MailBlock[] = fr ? [
    { p: "Bonjour," },
    { p: `C'est noté, merci ! Nous préparons maintenant vos pistes${area} et vous les envoyons à cette adresse.` },
    { title: "Ce que vous recevez", steps: [
      "Un court rapport de pistes : chaque entreprise avec téléphone, e-mail, ce qui vient de se passer et une phrase d'accroche.",
      "Les mêmes pistes en tableau, prêtes pour votre CRM.",
      "Un conseil : appelez les deux ou trois qui vous correspondent le mieux cette semaine, tant que le moment est bon.",
    ] },
    { p: "C'est gratuit et sans engagement. Si cela vous plaît, la même liste peut arriver chaque lundi, réservée à votre entreprise." },
    { note: `Pour vos archives, votre accord : « ${consent} » Pour ne plus rien recevoir, répondez simplement « désinscription ».` },
  ] : [
    { p: "Hello," },
    { p: `Got it, thank you! We are now preparing your leads${area} and will send them to this address.` },
    { title: "What you will receive", steps: [
      "A short lead report: each company with phone, email, what just happened and an opening line.",
      "The same leads as a spreadsheet, ready for your CRM.",
      "A tip: call the two or three that fit you best this week, while the moment is fresh.",
    ] },
    { p: "It's free and there is no obligation. If you like it, the same list can arrive every Monday, reserved for your firm." },
    { note: `For your records, you agreed as follows: "${consent}" To stop hearing from us, simply reply "unsubscribe".` },
  ];
  const closing = fr ? "Bien cordialement," : "Kind regards,";
  const signer = `${BRAND}`;
  const footer = `${LEGAL_NAME} · Poststraße 14-16, 20354 Hamburg, Germany\n${siteUrl().replace(/^https?:\/\//, "")}`;
  const text = mailText(blocks) + `\n\n${closing}\n${signer}\n\n${footer}`;
  return { subject, text, html: renderMail({ lang, brand: BRAND, blocks, closing, signer, footer }) };
}

import { consentText } from "@/lib/consent";
import { sendConsentMail } from "@/lib/mail";
import { renderMail, type MailBlock } from "@/lib/mail-html";
import { recordEvent } from "@/lib/page-events";
import { getSettings, isOwner, pageIsPublic } from "@/lib/pages";
import { BRAND, siteUrl } from "@/lib/site";
import { db } from "@/lib/supabase";
import { isBusinessEmail } from "@/lib/variants";
import { personalFor } from "@/lib/recipient";

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

  const { data: suppressed } = await db().rpc("is_suppressed", { p_email: email });
  const consent = consentText(page.language);
  const { error } = await db().from("sample_requests").insert({
    variant_id: v.id, company_name: company, email, segment_id: page.segment_id, country: page.country,
    region: region || null, consent_text: consent, consent_at: new Date().toISOString(),
    status: suppressed ? "rejected" : "new",
    note: [suppressed ? "Adresse/Domain gesperrt – keine Mail" : "", test ? "TEST (Inhaber-Vorschau)" : ""].filter(Boolean).join("; ") || null,
  });
  if (error) return new Response("Fehler", { status: 500 });
  if (!test) await recordEvent(v.id, "sample_request");

  if (!suppressed) {
    const m = confirmationMail(page.language === "fr" ? "fr" : "en", region, consent);
    await sendConsentMail(email, m.subject, m.text, m.html).catch(() => null); // Anfrage ist gespeichert; Bestätigung ist optional
  }
  return back(page.slug, "angefragt=1", pv);
}

/** Bestätigung der Probe-Anfrage: Text- und HTML-Version, ohne Preise und ohne Zeitversprechen. */
function confirmationMail(lang: "en" | "fr", region: string, consent: string) {
  const fr = lang === "fr";
  const area = region ? (fr ? ` pour ${region}` : ` for ${region}`) : "";
  const subject = fr ? `Votre demande d'échantillon est confirmée${area}` : `Your sample request is confirmed${area}`;
  const blocks: MailBlock[] = fr ? [
    { p: "Bonjour," },
    { p: `Merci pour votre demande. Nous préparons maintenant 10 pistes récentes${area}, issues de sources officielles, et vous les envoyons à cette adresse.` },
    { title: "La suite", steps: [
      "Vous recevez 10 pistes au format de notre livraison hebdomadaire, chacune avec sa date et sa source officielle.",
      "Vous contactez les entreprises qui vous correspondent.",
      "Ensuite, nous vous demandons brièvement comment cela s'est passé.",
    ] },
    { p: "L'échantillon est gratuit et sans engagement." },
    { note: `Pour vos archives, votre accord : « ${consent} » Pour ne plus rien recevoir, répondez simplement « désinscription ».` },
  ] : [
    { p: "Hello," },
    { p: `Thank you for your request. We are now preparing 10 current leads${area} from official sources and will send them to this address.` },
    { title: "What happens next", steps: [
      "You receive 10 leads in the format of our weekly delivery, each with its date and official source.",
      "You contact the companies that fit your firm.",
      "Afterwards we briefly ask how it went.",
    ] },
    { p: "The sample is free of charge and there is no obligation." },
    { note: `For your records, you agreed as follows: "${consent}" To stop hearing from us, simply reply "unsubscribe".` },
  ];
  const closing = fr ? "Bien cordialement," : "Kind regards,";
  const signer = `${BRAND}`;
  const footer = `${BRAND} · Poststraße 14-16, 20354 Hamburg, Germany\n${siteUrl().replace(/^https?:\/\//, "")}`;
  const text = blocks.map((b) => ("p" in b ? b.p : "note" in b ? b.note : `${b.title ? b.title + ":\n" : ""}${b.steps.map((s, i) => `${i + 1}. ${s}`).join("\n")}`))
    .join("\n\n") + `\n\n${closing}\n${signer}\n\n${footer}`;
  return { subject, text, html: renderMail({ lang, brand: BRAND, blocks, closing, signer, footer }) };
}

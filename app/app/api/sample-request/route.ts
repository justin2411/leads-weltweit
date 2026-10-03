import { consentText } from "@/lib/consent";
import { sendConsentMail } from "@/lib/mail";
import { mailText, renderMail, type MailBlock } from "@/lib/mail-html";
import { recordEvent } from "@/lib/page-events";
import { getSettings, isOwner, pageIsPublic } from "@/lib/pages";
import { BRAND, LEGAL_NAME, siteUrl } from "@/lib/site";
import { db } from "@/lib/supabase";
import { personalFor } from "@/lib/recipient";
import { COUNTRIES, segKey, type CountryCode } from "@/lib/country";
import { validEmail, wishNote } from "@/content/sample-wishes";

export const dynamic = "force-dynamic";

function back(slug: string, q: string, preview = "") {
  return Response.redirect(`${siteUrl()}/${slug}?${preview}${q}#probe`, 303);
}

/**
 * Probe-Anfrage aus dem Formular der Landingpage oder der Startseite. Speichert Einwilligung mit Wortlaut und
 * Zeitstempel sowie den Wunsch („welche Leads“) maschinenlesbar in note. Antwortet mit JSON, wenn das Formular
 * per JavaScript sendet, sonst mit Weiterleitung (funktioniert auch ohne JavaScript und für alte Mail-Links).
 */
export async function POST(req: Request) {
  const f = await req.formData();
  const json = (req.headers.get("accept") ?? "").includes("application/json");
  const answer = (ok: boolean, error: string, slug: string, pv: string) =>
    json ? Response.json(ok ? { ok: true } : { ok: false, error }, { status: ok ? 200 : 400 })
      : back(slug, ok ? "angefragt=1" : "fehler=1", pv);

  const variantId = String(f.get("variant_id") ?? "");
  const slugIn = String(f.get("slug") ?? "").toLowerCase();
  const sel = "id, status, variant_key, landing_pages!inner(slug, status, segment_id, country, language)";
  // Startseite: Branche/Land als Seiten-Slug, dort gilt die laufende (live) Variante
  const { data: v }: { data: any } = variantId
    ? await db().from("page_variants").select(sel).eq("id", variantId).maybeSingle()
    : /^[a-z]{2}\/[a-z0-9-]+$/.test(slugIn)
      ? await db().from("page_variants").select(sel).eq("landing_pages.slug", slugIn).eq("status", "live").order("variant_key").limit(1).maybeSingle()
      : { data: null };
  const page: any = v?.landing_pages;
  if (!v || !page) return json ? Response.json({ ok: false, error: "page" }, { status: 404 }) : new Response("Not found", { status: 404 });
  const isPublic = v.status === "live" && pageIsPublic(page, await getSettings());
  const test = !isPublic && f.get("vorschau") === "1" && (await isOwner());
  if (!isPublic && !test) return json ? Response.json({ ok: false, error: "page" }, { status: 404 }) : new Response("Not found", { status: 404 });
  const rTok = String(f.get("r") ?? "");
  const pv = (test ? `vorschau=1&v=${v.variant_key}&` : "") + (/^[A-Za-z0-9_-]{8,80}$/.test(rTok) ? `r=${rTok}&` : "");

  // Falle für Bots: verstecktes Feld ausgefüllt -> scheinbar erfolgreich, nichts speichern, keine Mail
  if (String(f.get("website") ?? "").trim()) return answer(true, "", page.slug, pv);

  // Persönlicher Link (?r=): Firma und Adresse aus der Kaltmail vorbelegt; Eingaben im Formular gehen vor.
  const who = await personalFor(rTok, page);
  const company = (String(f.get("company") ?? "").replace(/\s+/g, " ").trim() || who?.firma || "").slice(0, 200);
  const email = (String(f.get("email") ?? "").trim() || who?.email || "").trim().toLowerCase().slice(0, 200);
  const region = who?.email && who.email.toLowerCase() === email ? (who.gebiet ?? "").slice(0, 200) : "";
  const consented = ["yes", "on", "1", "true"].includes(String(f.get("consent") ?? ""));
  if (company.length < 2) return answer(false, "company", page.slug, pv);
  if (!validEmail(email)) return answer(false, "email", page.slug, pv);
  if (!consented) return answer(false, "consent", page.slug, pv);
  const wish = wishNote(segKey(page.slug), f.getAll("signals").map(String), String(f.get("text") ?? ""));

  // Doppelklick, zweiter Besuch oder viele Anfragen: dieselbe Adresse für dieselbe Zielgruppe und dasselbe Land
  // in 30 Tagen nur einmal, insgesamt höchstens 3 Anfragen je Adresse in 24 Stunden. Die Seite zeigt trotzdem die
  // Erfolgsmeldung (keine Auskunft darüber, ob eine Adresse schon angefragt hat).
  if (!test) {
    const since = new Date(Date.now() - 30 * 24 * 3600 * 1000).toISOString();
    const { data: dup } = await db().from("sample_requests").select("id")
      .eq("email", email).eq("segment_id", page.segment_id).eq("country", page.country)
      .in("status", ["new", "sent"]).gte("created_at", since).limit(1);
    if (dup?.length) return answer(true, "", page.slug, pv);
    const day = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { count } = await db().from("sample_requests").select("id", { count: "exact", head: true })
      .eq("email", email).gte("created_at", day);
    if ((count ?? 0) >= 3) return answer(true, "", page.slug, pv);
  }

  const { data: suppressed } = await db().rpc("is_suppressed", { p_email: email });
  // Wortlaut in der Sprache, in der das Formular angezeigt wurde (Startseite auch Deutsch)
  const formLang = ["en", "fr", "de"].includes(String(f.get("lang"))) ? String(f.get("lang")) : page.language;
  const consent = consentText(formLang);
  // Inhaber-Vorschau (TEST): nie als offene Anfrage speichern (web_samples.py würde sonst dem echten Empfänger
  // aus dem Mail-Link eine Probe schicken) und nie den echten Empfänger anschreiben.
  // Wunsch immer zuletzt ("wunsch:signals=…;text=…"), damit der Freitext nichts anderes überdeckt.
  const note = [suppressed ? "Adresse/Domain gesperrt – keine Mail" : "", test ? "TEST (Inhaber-Vorschau)" : "", wish]
    .filter(Boolean).join("; ") || null;
  const { error } = await db().from("sample_requests").insert({
    variant_id: v.id, company_name: company, email, segment_id: page.segment_id, country: page.country,
    region: region || null, consent_text: consent, consent_at: new Date().toISOString(),
    status: suppressed || test ? "rejected" : "new", note,
  });
  if (error) return json ? Response.json({ ok: false, error: "server" }, { status: 500 }) : new Response("Fehler", { status: 500 });
  if (!test) await recordEvent(v.id, "sample_request");

  const m = confirmationMail(page.language === "fr" ? "fr" : "en", page.country, consent);
  if (test) {
    // Vorschau: Bestätigung nur an den Inhaber (falls hinterlegt), nie an die Adresse aus dem Mail-Link
    const owner = process.env.SALE_NOTIFY_EMAIL?.trim() || process.env.OWNER_EMAIL?.trim();
    if (owner) await sendConsentMail(owner, `[TEST] ${m.subject}`, m.text, m.html).catch(() => null);
  } else if (!suppressed) {
    await sendConsentMail(email, m.subject, m.text, m.html).catch(() => null); // Anfrage ist gespeichert; Bestätigung ist optional
  }
  return answer(true, "", page.slug, pv);
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
  const footer = `${LEGAL_NAME} · Nikolaistraße 3-7, 04109 Leipzig, Germany\n${siteUrl().replace(/^https?:\/\//, "")}`;
  const text = mailText(blocks) + `\n\n${closing}\n${signer}\n\n${footer}`;
  return { subject, text, html: renderMail({ lang, brand: BRAND, blocks, closing, signer, footer }) };
}

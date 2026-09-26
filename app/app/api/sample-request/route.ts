import { consentText } from "@/lib/consent";
import { sendConsentMail } from "@/lib/mail";
import { recordEvent } from "@/lib/page-events";
import { getSettings, pageIsPublic } from "@/lib/pages";
import { BRAND, siteUrl } from "@/lib/site";
import { db } from "@/lib/supabase";
import { isBusinessEmail } from "@/lib/variants";

export const dynamic = "force-dynamic";

function back(slug: string, q: string) {
  return Response.redirect(`${siteUrl()}/${slug}?${q}#sample`, 303);
}

/** Probe-Anfrage aus dem Formular. Speichert Einwilligung mit Wortlaut und Zeitstempel. */
export async function POST(req: Request) {
  const f = await req.formData();
  const variantId = String(f.get("variant_id") ?? "");
  const { data: v } = await db()
    .from("page_variants")
    .select("id, status, landing_pages(slug, status, segment_id, country, language)")
    .eq("id", variantId)
    .maybeSingle();
  const page: any = v?.landing_pages;
  if (!v || !page || v.status !== "live" || !pageIsPublic(page, await getSettings())) {
    return new Response("Not found", { status: 404 });
  }
  if (String(f.get("website") ?? "")) return back(page.slug, "angefragt=1"); // Honeypot: Bots still verwerfen

  const company = String(f.get("company") ?? "").trim().slice(0, 200);
  const email = String(f.get("email") ?? "").trim().toLowerCase().slice(0, 200);
  const region = String(f.get("region") ?? "").trim().slice(0, 200);
  if (!company || !isBusinessEmail(email) || f.get("consent") !== "yes") return back(page.slug, "fehler=1");

  const { data: suppressed } = await db().rpc("is_suppressed", { p_email: email });
  const consent = consentText(page.language);
  const { error } = await db().from("sample_requests").insert({
    variant_id: v.id, company_name: company, email, segment_id: page.segment_id, country: page.country,
    region: region || null, consent_text: consent, consent_at: new Date().toISOString(),
    status: suppressed ? "rejected" : "new", note: suppressed ? "Adresse/Domain gesperrt – keine Mail" : null,
  });
  if (error) return new Response("Fehler", { status: 500 });
  await recordEvent(v.id, "sample_request");

  if (!suppressed) {
    const fr = page.language === "fr";
    await sendConsentMail(
      email,
      fr ? `Votre échantillon gratuit – ${BRAND}` : `Your free sample – ${BRAND}`,
      fr
        ? `Bonjour,\n\nMerci pour votre demande. Nous préparons 10 pistes${region ? ` pour ${region}` : ""} et vous les envoyons sous peu.\n\nVous avez donné votre accord ainsi : « ${consent} »\n\nPour ne plus rien recevoir, répondez simplement « désinscription ».\n\n${BRAND}\n${siteUrl()}`
        : `Hello,\n\nThank you for your request. We are preparing 10 leads${region ? ` for ${region}` : ""} and will send them shortly.\n\nYou agreed as follows: "${consent}"\n\nTo stop hearing from us, simply reply "unsubscribe".\n\n${BRAND}\n${siteUrl()}`,
    ).catch(() => null); // Anfrage ist gespeichert; Bestätigung ist optional
  }
  return back(page.slug, "angefragt=1");
}

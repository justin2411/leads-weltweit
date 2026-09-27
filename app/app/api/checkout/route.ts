import { recordEvent } from "@/lib/page-events";
import { getSettings, isOwner, pageIsPublic } from "@/lib/pages";
import { BRAND, CONTACT, siteUrl } from "@/lib/site";
import { checkoutMode, lineItemFor, stripe, stripeEnabled, type Plan } from "@/lib/stripe";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/**
 * "Abo starten" -> Stripe Checkout (Abo).
 * Öffentliche Seite in Produktion: Live-Schlüssel. Vorschau-Deployments und Inhaber-Vorschau: Test-Schlüssel.
 * Ohne passende Schlüssel deaktiviert.
 */
export async function POST(req: Request) {
  const f = await req.formData();
  const variantId = String(f.get("variant_id") ?? "");
  const pkg = String(f.get("package") ?? "");
  const settings = await getSettings();
  const { data: v } = await db()
    .from("page_variants")
    .select("id, status, variant_key, pricing, landing_pages(slug, status, segment_id, country, language)")
    .eq("id", variantId)
    .maybeSingle();
  const page: any = v?.landing_pages;
  if (!v || !page) return new Response("Not found", { status: 404 });
  const isPublic = v.status === "live" && pageIsPublic(page, settings);
  const ownerPreview = !isPublic && f.get("vorschau") === "1" && (await isOwner());
  if (!isPublic && !ownerPreview) return new Response("Not found", { status: 404 });

  const mode = checkoutMode({ vercelEnv: process.env.VERCEL_ENV, ownerPreview });
  if (!stripeEnabled(mode)) return new Response("Bezahlung ist noch nicht eingerichtet.", { status: 503 });
  // Nur Preise, die der Inhaber hinterlegt hat
  const plan = ((v.pricing ?? settings.pricing ?? []) as Plan[]).find((p) => p.key === pkg);
  const item = lineItemFor(plan, mode, BRAND);
  if (!item) return new Response("Unbekanntes Paket", { status: 400 });

  const meta = { segment_id: page.segment_id, country: page.country, variant_id: v.id, package: pkg, mode,
                 amount_cents: String(plan?.amount_cents ?? ""), currency: plan?.currency ?? "" };
  const back = ownerPreview ? `${siteUrl()}/${page.slug}?vorschau=1&v=${v.variant_key}` : `${siteUrl()}/${page.slug}`;
  let session: any;
  try {
    session = await stripe("checkout/sessions", {
    mode: "subscription",
    line_items: { 0: item },
    success_url: `${siteUrl()}/danke?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${back}#plans`,
    billing_address_collection: "required",
    custom_fields: { 0: { key: "company", label: { type: "custom", custom: page.language === "fr" ? "Entreprise" : "Company name" }, type: "text" } },
    metadata: meta,
    subscription_data: { metadata: meta },
    locale: page.language === "fr" ? "fr" : "en",
  }, mode);
  } catch (e) {
    // Nie eine nackte 500: Fehler protokollieren, Kunde bekommt eine Seite mit E-Mail-Weg
    console.error("checkout", pkg, mode, (e as Error).message);
    return failPage(page.language === "fr" ? "fr" : "en", pkg, page.slug, back);
  }
  if (mode === "live") await recordEvent(v.id, "checkout_started");
  return Response.redirect(session.url, 303);
}

function failPage(lang: "en" | "fr", pkg: string, slug: string, back: string): Response {
  const T = lang === "fr"
    ? { t: "Le paiement en ligne est momentanément indisponible", p: "Aucun montant n'a été débité. Écrivez-nous et nous démarrons votre abonnement par e-mail avec une facture.", b: "Démarrer par e-mail", r: "Retour" }
    : { t: "Online payment is not available right now", p: "Nothing has been charged. Email us and we will start your subscription by email with an invoice.", b: "Start by email", r: "Back" };
  const mail = `mailto:${CONTACT}?subject=${encodeURIComponent(`Start ${pkg} – ${slug}`)}`;
  const esc = (x: string) => x.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
  const html = `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>${BRAND}</title>
<style>body{margin:0;font-family:system-ui,-apple-system,Segoe UI,sans-serif;background:#faf8f4;color:#1a1712}main{max-width:560px;margin:12vh auto;padding:0 20px}h1{font-size:28px;letter-spacing:-.02em;line-height:1.15}p{color:#5b554b;font-size:17px;line-height:1.55}a.b{display:inline-block;margin-top:14px;padding:14px 22px;border-radius:12px;background:linear-gradient(135deg,#e2c894,#b08d57);color:#141008;font-weight:700;text-decoration:none}a.r{display:inline-block;margin:14px 0 0 18px;color:#5b554b}</style></head>
<body><main><h1>${T.t}</h1><p>${T.p}</p><a class="b" href="${esc(mail)}">${T.b} →</a><a class="r" href="${esc(back)}">${T.r}</a><p style="font-size:14px;margin-top:28px">${CONTACT}</p></main></body></html>`;
  return new Response(html, { status: 503, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } });
}

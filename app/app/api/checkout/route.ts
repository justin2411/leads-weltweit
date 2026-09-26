import { recordEvent } from "@/lib/page-events";
import { getSettings, isOwner, pageIsPublic } from "@/lib/pages";
import { siteUrl } from "@/lib/site";
import { checkoutMode, priceFor, stripe, stripeEnabled } from "@/lib/stripe";
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
  const plan = ((v.pricing ?? settings.pricing ?? []) as any[]).find((p) => p.key === pkg);
  const price = priceFor(plan, mode);
  if (!price) return new Response("Unbekanntes Paket", { status: 400 });

  const meta = { segment_id: page.segment_id, country: page.country, variant_id: v.id, package: pkg, mode };
  const back = ownerPreview ? `${siteUrl()}/${page.slug}?vorschau=1&v=${v.variant_key}` : `${siteUrl()}/${page.slug}`;
  const session = await stripe("checkout/sessions", {
    mode: "subscription",
    line_items: { 0: { price, quantity: 1 } },
    success_url: `${siteUrl()}/danke?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${back}#plans`,
    billing_address_collection: "required",
    custom_fields: { 0: { key: "company", label: { type: "custom", custom: page.language === "fr" ? "Entreprise" : "Company name" }, type: "text" } },
    metadata: meta,
    subscription_data: { metadata: meta },
    locale: page.language === "fr" ? "fr" : "en",
  }, mode);
  if (mode === "live") await recordEvent(v.id, "checkout_started");
  return Response.redirect(session.url, 303);
}

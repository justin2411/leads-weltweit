import { recordEvent } from "@/lib/page-events";
import { getSettings, pageIsPublic } from "@/lib/pages";
import { siteUrl } from "@/lib/site";
import { stripe, stripeEnabled } from "@/lib/stripe";
import { db } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** "Abo starten" -> Stripe Checkout (Abo). Ohne Stripe-Schlüssel deaktiviert. */
export async function POST(req: Request) {
  if (!stripeEnabled()) return new Response("Bezahlung ist noch nicht eingerichtet.", { status: 503 });
  const f = await req.formData();
  const variantId = String(f.get("variant_id") ?? "");
  const pkg = String(f.get("package") ?? "");
  const settings = await getSettings();
  const { data: v } = await db()
    .from("page_variants")
    .select("id, status, pricing, landing_pages(slug, status, segment_id, country, language)")
    .eq("id", variantId)
    .maybeSingle();
  const page: any = v?.landing_pages;
  if (!v || !page || v.status !== "live" || !pageIsPublic(page, settings)) return new Response("Not found", { status: 404 });

  // Nur Preise, die der Inhaber hinterlegt hat
  const plan = ((v.pricing ?? settings.pricing ?? []) as any[]).find((p) => p.key === pkg);
  if (!plan?.stripe_price_id) return new Response("Unbekanntes Paket", { status: 400 });

  const meta = { segment_id: page.segment_id, country: page.country, variant_id: v.id, package: pkg };
  const session = await stripe("checkout/sessions", {
    mode: "subscription",
    line_items: { 0: { price: plan.stripe_price_id, quantity: 1 } },
    success_url: `${siteUrl()}/danke?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${siteUrl()}/${page.slug}#plans`,
    billing_address_collection: "required",
    custom_fields: { 0: { key: "company", label: { type: "custom", custom: page.language === "fr" ? "Entreprise" : "Company name" }, type: "text" } },
    metadata: meta,
    subscription_data: { metadata: meta },
    locale: page.language === "fr" ? "fr" : "en",
  });
  await recordEvent(v.id, "checkout_started");
  return Response.redirect(session.url, 303);
}

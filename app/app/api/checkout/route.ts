import { recordEvent } from "@/lib/page-events";
import { getSettings, isOwner, pageIsPublic } from "@/lib/pages";
import { BRAND, CONTACT, siteUrl } from "@/lib/site";
import { checkoutMode, germanVatRate, lineItemFor, stripe, stripeEnabled, type Plan } from "@/lib/stripe";
import { db } from "@/lib/supabase";
import { basePlan, customCents, PER_WEEK, validWeekly } from "@/lib/custom-price";
import { prospectIdFor } from "@/lib/recipient";

export const dynamic = "force-dynamic";

/**
 * "Abo starten" -> Stripe Checkout (Abo).
 * Öffentliche Seite in Produktion: Live-Schlüssel. Vorschau-Deployments und Inhaber-Vorschau: Test-Schlüssel.
 * Ohne passende Schlüssel deaktiviert.
 */
const CHECKOUT_TXT = {
  en: {
    desc: (w: number, m: number) => `Up to ${w.toLocaleString("en-GB")} new trigger leads per week (about ${m.toLocaleString("en-GB")} per month), each exclusive to your firm. Every Monday a PDF briefing and spreadsheet with phone, email, contact person and a short sales briefing per company.`,
    welcome: `Welcome to ${BRAND}. We look forward to working with you. Right after payment you get a short form to set your focus, and your first leads arrive the following Monday.`,
  },
  fr: {
    desc: (w: number, m: number) => `Jusqu'à ${w.toLocaleString("fr-FR")} nouvelles pistes par semaine (environ ${m.toLocaleString("fr-FR")} par mois), chacune réservée à votre entreprise. Chaque lundi un briefing PDF et un tableau avec téléphone, e-mail, interlocuteur et un court briefing commercial par entreprise.`,
    welcome: `Bienvenue chez ${BRAND}. Nous nous réjouissons de travailler avec vous. Juste après le paiement, vous recevez un court formulaire pour définir votre cible, et vos premières pistes arrivent le lundi suivant.`,
  },
};

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
  const plans = (v.pricing ?? settings.pricing ?? []) as Plan[];
  let plan = plans.find((p) => p.key === pkg);
  let weeklyN = PER_WEEK[pkg];
  if (pkg === "custom") {
    // Eigenes Volumen: Preis immer hier neu berechnen, nie aus dem Formular übernehmen
    const n = validWeekly(f.get("weekly"));
    const base = basePlan(plans);
    if (!n || !base) return new Response("Ungültige Menge", { status: 400 });
    weeklyN = n;
    plan = { key: "custom", name: `Custom – ${n.toLocaleString("en-GB")} leads/week`, amount_cents: customCents(base, n), currency: base.currency, interval: "month" };
  }
  const item: any = lineItemFor(plan, mode, BRAND);
  if (!item) return new Response("Unbekanntes Paket", { status: 400 });
  const lang = page.language === "fr" ? "fr" : "en";
  const T = CHECKOUT_TXT[lang];
  const week = weeklyN;
  // Kontingent auf der Stripe-Seite unter dem Paketnamen (nur bei Preis aus der Datenbank möglich)
  if (week && item.price_data) item.price_data.product_data.description = T.desc(week, Math.round(week * 52 / 12));

  const r = String(f.get("r") ?? "");
  // Kauf der Kaltmail zuordnen (?r=<Token der Mail>): der Webhook speichert customers.prospect_id
  const prospectId = await prospectIdFor(r, page).catch(() => null);
  const meta = { segment_id: page.segment_id, country: page.country, variant_id: v.id, package: pkg, mode,
                 amount_cents: String(plan?.amount_cents ?? ""), currency: plan?.currency ?? "", weekly: String(week ?? ""),
                 ...(prospectId ? { prospect_id: prospectId } : {}) };
  // Zurück aus Stripe: auf die Pläne-Seite (/start), nicht auf die Landingpage
  const q = new URLSearchParams();
  if (ownerPreview) { q.set("vorschau", "1"); q.set("v", v.variant_key); }
  if (/^[A-Za-z0-9_-]{8,80}$/.test(r)) q.set("r", r);
  const back = `${siteUrl()}/${page.slug}/start${q.size ? `?${q}` : ""}`;
  let session: any;
  try {
    // 19 % USt. nur bei Rechnungsadresse in Deutschland (Stripe wählt den Satz nach Land), sonst netto
    item.dynamic_tax_rates = { 0: await germanVatRate(mode) };
    session = await stripe("checkout/sessions", {
    mode: "subscription",
    line_items: { 0: item },
    success_url: `${siteUrl()}/danke?session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: back,
    billing_address_collection: "required",
    tax_id_collection: { enabled: true },  // USt-IdNr. für Firmen in der EU (Reverse Charge)
    custom_fields: { 0: { key: "company", label: { type: "custom", custom: page.language === "fr" ? "Entreprise" : "Company name" }, type: "text" } },
    metadata: meta,
    subscription_data: { metadata: meta },
    locale: lang,
    custom_text: { submit: { message: T.welcome } },
  }, mode);
  } catch (e) {
    // Nie eine nackte 500: Fehler protokollieren, Kunde bekommt eine Seite mit E-Mail-Weg
    const msg = (e as Error).message.replace(/\b(sk|rk|pk|whsec)_[A-Za-z0-9_]+/g, "[Schlüssel]").slice(0, 400);
    console.error("checkout", pkg, mode, msg);
    // Grund für den Inhaber sichtbar (Dashboard/Tagescheck), ohne Vercel-Logs
    await db().from("learning_log").insert({ kind: "note", segment_id: page.segment_id,
      text: `checkout_error ${mode} ${page.slug} ${pkg}: ${msg}` }).then(() => null, () => null);
    return failPage(lang, pkg, page.slug, back);
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

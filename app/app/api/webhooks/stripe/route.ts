import { sendConsentMail } from "@/lib/mail";
import { recordEvent } from "@/lib/page-events";
import { BRAND, siteUrl } from "@/lib/site";
import { STATUS_MAP, stripeKeys, verifyStripeSignature } from "@/lib/stripe";
import { db } from "@/lib/supabase";
import { filterToken } from "@/lib/tokens";

export const dynamic = "force-dynamic";

async function log(subject: string, reasoning: string, ok: boolean, metrics: Record<string, unknown> = {}) {
  await db().from("decisions").insert({ type: "webhook", subject, reasoning, metrics, status: ok ? "done" : "rejected" });
}

/** Stripe: Abschluss -> Kunde + Abo + Willkommensmail; Änderungen, Kündigungen, fehlgeschlagene Zahlungen. */
export async function POST(req: Request) {
  const live = stripeKeys("live");
  const test = stripeKeys("test");
  if (!live && !test) return new Response("disabled", { status: 503 });
  const body = await req.text();
  const sig = req.headers.get("stripe-signature");
  const signedLive = !!live && verifyStripeSignature(live.webhook, sig, body);
  const signedTest = !signedLive && !!test && verifyStripeSignature(test.webhook, sig, body);
  if (!signedLive && !signedTest) return new Response("invalid signature", { status: 400 });
  const event = JSON.parse(body) as { id: string; type: string; livemode: boolean; data: { object: any } };
  // Ein Test-Ereignis darf nie über das Live-Secret kommen und umgekehrt
  if (event.livemode !== signedLive) return new Response("mode mismatch", { status: 400 });
  const o = event.data.object;
  try {
    if (event.type === "checkout.session.completed" && o.mode === "subscription") {
      const m = o.metadata ?? {};
      const email = String(o.customer_details?.email ?? "").toLowerCase();
      const company = o.custom_fields?.find((c: any) => c.key === "company")?.text?.value || o.customer_details?.name || email;
      const { data: cust, error: e1 } = await db()
        .from("customers")
        .upsert({ stripe_customer_id: o.customer, company_name: company, country: m.country ?? "UK", billing_email: email,
                  status: event.livemode ? "active" : "trial", notes: event.livemode ? null : "Stripe-Testmodus (kein echter Kunde)",
                  updated_at: new Date().toISOString() }, { onConflict: "stripe_customer_id" })
        .select("id")
        .single();
      if (e1) throw new Error(e1.message);
      const { error: e2 } = await db().from("subscriptions").upsert({
        stripe_subscription_id: o.subscription, customer_id: cust.id, segment_id: m.segment_id, package: m.package,
        page_variant_id: m.variant_id || null, amount_cents: o.amount_total, currency: o.currency, status: "active",
        filters: { country: m.country }, updated_at: new Date().toISOString(),
      }, { onConflict: "stripe_subscription_id" });
      if (e2) throw new Error(e2.message);
      await db().from("customer_filters").upsert({ customer_id: cust.id, segment_id: m.segment_id }, { onConflict: "customer_id", ignoreDuplicates: true });
      if (event.livemode) await recordEvent(m.variant_id, "purchase");
      const link = `${siteUrl()}/kunde/filter?t=${filterToken(cust.id, process.env.SESSION_SECRET?.trim() ?? "")}`;
      await db().from("customers").update({ filter_token_issued_at: new Date().toISOString() }).eq("id", cust.id);
      await sendConsentMail(email, `Welcome to ${BRAND}`,
        `Hello,\n\nthank you for subscribing${event.livemode ? "" : " (TEST MODE)"}.\n\nPlease tell us which areas, signals and industries you want ` +
        `(takes one minute):\n${link}\n\nYour first delivery follows after a quick manual check; after that, new leads arrive every Monday.\n\n${BRAND}`).catch(async (e) => {
        // Kunde und Abo sind gespeichert; Mail-Fehler nicht als Webhook-Fehler werten (sonst doppelte Willkommensmails)
        await log("Willkommensmail fehlgeschlagen", `${company}: ${(e as Error).message}`, true);
      });
      await log(`Neuer Kunde: ${company}`, `Checkout abgeschlossen (${event.livemode ? "live" : "Testmodus"})`, true,
                { segment_id: m.segment_id, country: m.country, package: m.package, amount_cents: o.amount_total, currency: o.currency });
    } else if (event.type === "customer.subscription.updated" || event.type === "customer.subscription.deleted") {
      const status = event.type.endsWith("deleted") ? "cancelled" : (STATUS_MAP[o.status] ?? "incomplete");
      const { data: sub } = await db().from("subscriptions")
        .update({ status, current_period_end: o.current_period_end ? new Date(o.current_period_end * 1000).toISOString() : null,
                  ...(status === "cancelled" ? { cancelled_on: new Date().toISOString().slice(0, 10) } : {}),
                  updated_at: new Date().toISOString() })
        .eq("stripe_subscription_id", o.id).select("customer_id").maybeSingle();
      if (sub && status === "cancelled") {
        const { count } = await db().from("subscriptions").select("id", { count: "exact", head: true })
          .eq("customer_id", sub.customer_id).in("status", ["active", "past_due"]);
        if (!count) await db().from("customers").update({ status: "cancelled" }).eq("id", sub.customer_id);
      }
      await log(`Abo ${status}`, `${event.type} (${o.id})`, true, { stripe_status: o.status });
    } else if (event.type === "invoice.payment_failed") {
      if (o.subscription) await db().from("subscriptions").update({ status: "past_due" }).eq("stripe_subscription_id", o.subscription);
      await log("Zahlung fehlgeschlagen", `Rechnung ${o.id} für Abo ${o.subscription ?? "?"}`, true, { attempt_count: o.attempt_count });
    }
    return new Response("ok", { status: 200 });
  } catch (err) {
    // Fehlschläge zählen für die Abschaltregel (BRAIN.md 7: dreimal hintereinander)
    await log("Stripe-Webhook fehlgeschlagen", `${event.type}: ${(err as Error).message}`, false).catch(() => null);
    return new Response("error", { status: 500 });
  }
}

import "server-only";
import { db } from "@/lib/supabase";

/** Serverseitige Ereignisse (Probe, Checkout, Kauf) – ebenfalls ohne personenbezogene Daten. */
export async function recordEvent(variantId: string | null | undefined, type: "sample_request" | "checkout_started" | "purchase") {
  if (!variantId) return;
  await db().from("page_events").insert({ variant_id: variantId, type });
}

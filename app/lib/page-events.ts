import "server-only";
import { db } from "@/lib/supabase";

/** Serverseitige Ereignisse (Probe, Checkout, Kauf) – ebenfalls ohne personenbezogene Daten. */
export async function recordEvent(variantId: string | null | undefined, type: "sample_request" | "checkout_started" | "purchase",
                                  opts: { test?: boolean } = {}) {
  if (!variantId) return;
  // is_test: automatisierte Tests – bleiben gespeichert, zählen in keiner Auswertung (Sicht page_events_echt)
  await db().from("page_events").insert({ variant_id: variantId, type, ...(opts.test ? { is_test: true } : {}) });
}

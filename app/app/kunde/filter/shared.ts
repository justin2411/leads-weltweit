import { db } from "@/lib/supabase";

export const SIGNAL_KEYS = ["job_open_30d", "jobs_3plus", "new_incorporation", "outdated_website"];

/** Gebuchte Leads pro Woche aus den aktiven Abos. */
export async function booked(customerId: string): Promise<number> {
  const { data } = await db().from("subscriptions").select("filters, package").eq("customer_id", customerId).in("status", ["active", "past_due"]);
  const per: Record<string, number> = { starter: 15, pro: 50 };
  return Math.max(0, ...(data ?? []).map((x: any) => Number(x.filters?.max_per_week) || per[x.package] || 0));
}

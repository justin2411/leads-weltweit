import "server-only";
import { db } from "@/lib/supabase";
import type { Pool, PoolCount, Route, SegmentRow, SubRow } from "@/lib/pools";

/**
 * Daten für „Eigene Speicher“ (/dashboard/speicher): Speicher, Zählung je Speicher/Land (RPC pool_counts), Routen je
 * Zielgruppe+Land, Zielgruppen mit Mail-Ländern und laufende Abos mit Kunde. Nicht zwischengespeichert – nach
 * „Übernehmen“ soll der neue Stand sofort sichtbar sein. Nur Firmenname/Land des Kunden, keine Lead-Daten.
 */
export type PoolsData = { pools: Pool[]; counts: PoolCount[]; routes: Route[]; segments: SegmentRow[]; subs: SubRow[] };

type CustRaw = { company_name: string; country: string; status: string; stripe_customer_id: string | null; notes: string | null };

export async function loadPools(): Promise<PoolsData> {
  const t = () => AbortSignal.timeout(15_000);
  const [p, c, r, s, sub] = await Promise.all([
    db().from("lead_pools").select("id, name, color, note, created_at").order("created_at").abortSignal(t()),
    db().rpc("pool_counts").abortSignal(t()),
    db().from("pool_routes").select("segment_id, country, pool_id").abortSignal(t()),
    db().from("segments").select("id, name, email_countries, status").abortSignal(t()),
    db().from("subscriptions").select("id, segment_id, status, pool_id, package, customer:customers(company_name, country, status, stripe_customer_id, notes)")
      .neq("status", "cancelled").order("created_at", { ascending: false }).limit(300).abortSignal(t()),
  ]);
  for (const [name, x] of [["lead_pools", p], ["pool_counts", c], ["pool_routes", r], ["segments", s], ["subscriptions", sub]] as const) {
    if (x.error) throw new Error(`${name}: ${x.error.message}`);
  }
  const subs: SubRow[] = (sub.data ?? []).map((x) => {
    const raw = (Array.isArray(x.customer) ? x.customer[0] : x.customer) as CustRaw | null | undefined;
    return {
      id: x.id, segment_id: x.segment_id, status: x.status, pool_id: x.pool_id ?? null, package: x.package ?? null,
      customer: raw ? {
        company_name: raw.company_name, country: raw.country, status: raw.status,
        stripe: raw.stripe_customer_id != null, test_note: (raw.notes ?? "").includes("Stripe-Testmodus"),
      } : null,
    };
  });
  return {
    pools: (p.data ?? []) as Pool[],
    counts: ((c.data ?? []) as PoolCount[]).map((x) => ({ ...x, n: Number(x.n) || 0 })),
    routes: (r.data ?? []) as Route[],
    segments: (s.data ?? []) as SegmentRow[],
    subs,
  };
}

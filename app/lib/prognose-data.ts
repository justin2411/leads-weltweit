import "server-only";
import { db } from "@/lib/supabase";
import { COUNTRIES, SEGMENT, loadDaily, loadFunnel } from "@/lib/dashboard-data";
import { berlinDay, type FunnelRow } from "@/lib/dashboard-logic";
import type { DailyRow } from "@/lib/dashboard-periods";
import { PACKAGES } from "@/lib/owner-settings";
import { addDays } from "@/lib/trend";
import { forecast, type Prognose } from "@/lib/prognose";

/**
 * Eingaben der Prognose je Land (S2 × US/UK/FR), nur Zählungen:
 * - Trichter seit Start: experiment_stats (Mails aus messages, Antworten/Proben/Kunden aus email_events)
 * - echte Antworten: signalwerk.inbound_replies (ohne Abwesenheit), der größere Wert zählt
 * - Tempo: gesendete Mails je Tag, Schnitt der letzten 7 vollen Tage (dashboard_daily)
 * - Obergrenze: freie mail-fähige Käufer (kpi_daily kaeufer_frei, neuester Tag)
 * Preis: Starter (Inhaber 29.09.2026: in allen Ländern gleich, Landeswährung). Fehler → null („nicht lesbar“).
 */
export const CURRENCY: Record<string, string> = { US: "$", UK: "£", FR: "€" };
const T = (ms = 5000) => AbortSignal.timeout(ms);

type ReplyRow = { intent: string | null; prospects: { country: string | null; segment_id: string | null } | null };

async function inboundByCountry(): Promise<Record<string, { replies: number; samples: number }> | null> {
  try {
    const { data, error } = await db().from("inbound_replies").select("intent, prospects(country, segment_id)").limit(20000).abortSignal(T());
    if (error) throw new Error(error.message);
    const out: Record<string, { replies: number; samples: number }> = {};
    for (const r of (data ?? []) as unknown as ReplyRow[]) {
      const c = r.prospects?.country, seg = r.prospects?.segment_id;
      if (!c || (seg && seg !== SEGMENT) || r.intent === "out_of_office") continue;
      const x = (out[c] ??= { replies: 0, samples: 0 });
      x.replies++;
      if (r.intent === "sample" || r.intent === "buy") x.samples++;
    }
    return out;
  } catch {
    return null;
  }
}

async function freeBuyers(): Promise<Record<string, number>> {
  try {
    const { data, error } = await db().from("kpi_daily").select("day, country, value").eq("metric", "kaeufer_frei").eq("segment_id", SEGMENT)
      .order("day", { ascending: false }).limit(30).abortSignal(T());
    if (error) throw new Error(error.message);
    const out: Record<string, number> = {};
    for (const r of (data ?? []) as { country: string; value: number }[]) if (!(r.country in out)) out[r.country] = Number(r.value) || 0;
    return out;
  } catch {
    return {};
  }
}

/** Mails je Tag je Land: Schnitt der 7 vollen Tage vor heute. */
export function perDay(daily: DailyRow[], today: string): Record<string, number> {
  const from = addDays(today, -7), to = addDays(today, -1);
  const out: Record<string, number> = {};
  for (const r of daily) if (r.country && r.day >= from && r.day <= to) out[r.country] = (out[r.country] ?? 0) + Number(r.sent ?? 0) / 7;
  return out;
}

/** Eingaben → Prognose je Land (rein, testbar). */
export function build(funnel: FunnelRow[], inbound: Record<string, { replies: number; samples: number }>, pace: Record<string, number>, free: Record<string, number>, countries: readonly string[] = COUNTRIES): Prognose[] {
  return countries.map((c) => {
    const f = funnel.find((x) => x.country === c);
    const ib = inbound[c] ?? { replies: 0, samples: 0 };
    return forecast({
      country: c, sent: f?.sent ?? 0, replies: Math.max(f?.replies ?? 0, ib.replies), samples: Math.max(f?.samples ?? 0, ib.samples),
      customers: f?.customers ?? 0, perDay: pace[c] ?? 0, freeBuyers: c in free ? free[c] : null, price: PACKAGES.starter.price, currency: CURRENCY[c] ?? "€",
    });
  });
}

export async function loadPrognose(now = new Date(), daily?: DailyRow[]): Promise<Prognose[] | null> {
  const today = berlinDay(now);
  const [funnel, inbound, free, d] = await Promise.all([loadFunnel(), inboundByCountry(), freeBuyers(),
    daily ? Promise.resolve(daily) : loadDaily(addDays(today, -8), today).catch(() => null)]);
  if (!funnel || !inbound || !d) return null;
  return build(funnel, inbound, perDay(d, today), free);
}

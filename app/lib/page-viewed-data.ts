import "server-only";
import { db } from "@/lib/supabase";
import { berlinDay } from "@/lib/visitor";
import { countryOfSlug } from "@/lib/website-stats";
import { mailFits, pageViewedKey, scannerReason, validToken, type MailRef } from "@/lib/page-viewed";

/**
 * „Seite angesehen“ speichern (lib/page-viewed.ts): email_events.type = 'page_viewed' an der Mail des Links,
 * höchstens 1 je Firma und Tag (dedupe_key), ohne IP und ohne User-Agent. Fehler werden geschluckt.
 */
export async function recordPageViewed(token: string, slug: string, h: Headers, now = new Date()): Promise<void> {
  if (!validToken(token)) return;
  try {
    const { data } = await db().from("messages").select("id, prospect_id, status, sent_at, prospects(country)")
      .eq("unsubscribe_token", token).maybeSingle();
    const p: any = (data as any)?.prospects;
    const m: MailRef | null = data ? { id: String(data.id), prospect_id: data.prospect_id ?? null, status: data.status ?? null,
                                      sent_at: data.sent_at ?? null, country: p?.country ?? null } : null;
    if (!mailFits(m, countryOfSlug(slug))) return;
    if (scannerReason({ sentAt: m.sent_at, now, ua: h.get("user-agent"), acceptLanguage: h.get("accept-language") })) return;
    await db().from("email_events").upsert(
      { message_id: m.id, type: "page_viewed", occurred_at: now.toISOString(), note: "Landingpage über Mail-Link",
        dedupe_key: pageViewedKey(m.prospect_id, berlinDay(now)) },
      { onConflict: "dedupe_key", ignoreDuplicates: true });
  } catch {
    /* Messung darf die Seite nie stören */
  }
}

import "server-only";
import { cleanFirm, splitRegion, type Personal } from "./personalize";
import { db } from "./supabase";

/** Empfänger aus dem Mail-Link (?r=<Token der Mail>): Firma, Adresse, Gebiet – nur wenn die Mail zu dieser Zielgruppe gehört. */
export type Recipient = Personal & { email?: string; gebiet?: string };

/** Käufer (prospects.id) aus dem Mail-Link – für die Zuordnung eines Kaufs zur Kaltmail (customers.prospect_id). */
export async function prospectIdFor(token: string | undefined | null, page: { segment_id: string; country: string }): Promise<string | null> {
  if (!token || !/^[A-Za-z0-9_-]{8,80}$/.test(token)) return null;
  const { data } = await db().from("messages").select("prospect_id, prospects(segment_id, country)")
    .eq("unsubscribe_token", token).maybeSingle();
  const p: any = data?.prospects;
  if (!data?.prospect_id || !p || p.segment_id !== page.segment_id || p.country !== page.country) return null;
  return String(data.prospect_id);
}

export async function personalFor(token: string | undefined | null, page: { segment_id: string; country: string }): Promise<Recipient | null> {
  if (!token || !/^[A-Za-z0-9_-]{8,80}$/.test(token)) return null;
  const { data } = await db().from("messages").select("to_email, prospects(company_name, region, specialization, segment_id, country)")
    .eq("unsubscribe_token", token).maybeSingle();
  const p: any = data?.prospects;
  if (!p || p.segment_id !== page.segment_id || p.country !== page.country) return null;
  const { ort, region } = splitRegion(p.region);
  const gebiet = [ort, region].filter((x, i, a) => x && a.indexOf(x) === i).join(", ") || undefined;
  return { firma: cleanFirm(p.company_name), ort, region, branche: p.specialization ?? undefined,
    email: data?.to_email ?? undefined, gebiet };
}

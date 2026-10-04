"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { parseChoice, patchFor, validToken } from "@/lib/feedback";

/** Eine Bewertung speichern (Knopf auf /bewerten). Nur Leads, die zu diesem Link gehören. */
export async function rateLead(formData: FormData) {
  const token = String(formData.get("t") ?? "");
  const leadId = String(formData.get("lead") ?? "");
  const choice = parseChoice(formData.get("c"));
  if (!validToken(token)) redirect("/bewerten");
  const back = `/bewerten?t=${encodeURIComponent(token)}`;
  if (!choice || !/^[0-9a-f-]{36}$/i.test(leadId)) redirect(back);
  const { data: link } = await db().from("lead_feedback_links")
    .select("id, kind, lead_ids, customer_id, country").eq("token", token).maybeSingle();
  if (!link || !(link.lead_ids as string[]).includes(leadId)) redirect(back);
  const { data: lead } = await db().from("leads").select("signal_type, country").eq("id", leadId).maybeSingle();
  const now = new Date().toISOString();
  const { error } = await db().from("lead_feedback").upsert({
    link_id: link.id, lead_id: leadId, customer_id: link.customer_id ?? null, kind: link.kind,
    country: lead?.country ?? link.country ?? null, signal_type: lead?.signal_type ?? null,
    ...patchFor(choice!), updated_at: now,
  }, { onConflict: "link_id,lead_id" });
  if (error) throw new Error(error.message);
  await db().from("lead_feedback_links").update({ last_used_at: now }).eq("id", link.id);
  redirect(`${back}&ok=1#l-${leadId}`);
}

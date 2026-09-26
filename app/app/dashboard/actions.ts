"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { db, suppressEmail } from "@/lib/supabase";

export async function requireOwner() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySession(token, process.env.SESSION_SECRET?.trim())) redirect("/login");
}

/** Inhaber gibt einen Entwurf frei (Status draft -> approved). */
export async function approveDraft(formData: FormData) {
  await requireOwner();
  const id = String(formData.get("id"));
  const { error } = await db()
    .from("messages")
    .update({ status: "approved", approved_at: new Date().toISOString(), approved_by: "owner-dashboard" })
    .eq("id", id)
    .eq("status", "draft")
    .eq("check_errors", "{}");
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

export async function rejectDraft(formData: FormData) {
  await requireOwner();
  const id = String(formData.get("id"));
  const reason = String(formData.get("reason") || "vom Inhaber abgelehnt");
  const { error } = await db()
    .from("messages")
    .update({ status: "blocked", blocked_reason: reason })
    .eq("id", id)
    .in("status", ["draft", "approved"]);
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard");
}

const REPLY_TYPES = new Set(["reply", "reply_positive", "reply_negative", "sample_requested"]);

/** Antwort manuell erfassen. "Bitte nicht mehr schreiben" sperrt die Firma dauerhaft. */
export async function logReply(formData: FormData) {
  await requireOwner();
  const email = String(formData.get("email") || "").trim().toLowerCase();
  const type = String(formData.get("type"));
  const note = String(formData.get("note") || "");
  const optout = type === "optout";
  if (!email || (!optout && !REPLY_TYPES.has(type))) throw new Error("ungültige Eingabe");

  const { data: msg } = await db()
    .from("messages")
    .select("id, resend_id")
    .eq("to_email", email)
    .eq("status", "sent")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await db().from("email_events").insert({
    message_id: msg?.id ?? null,
    resend_id: msg?.resend_id ?? null,
    type: optout ? "reply_negative" : type,
    note: optout ? `Abmeldung per Antwort. ${note}` : note,
  });
  if (error) throw new Error(error.message);
  if (optout) await suppressEmail(email, "reply_optout", "dashboard");
  revalidatePath("/dashboard");
}

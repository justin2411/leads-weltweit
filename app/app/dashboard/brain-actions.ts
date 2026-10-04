"use server";

import { revalidatePath } from "next/cache";
import { legalTextsReady } from "@/lib/legal";
import { db } from "@/lib/supabase";
import { requireOwner } from "./actions";

const BOOL_KEYS = new Set(["brain_enabled", "auto_publish_pages", "auto_merge_content", "legal_ready"]);

/** Schalter aus settings – nur der Inhaber. */
export async function updateSetting(formData: FormData) {
  await requireOwner();
  const key = String(formData.get("key"));
  const raw = String(formData.get("value"));
  let value: boolean | number;
  if (BOOL_KEYS.has(key)) {
    value = raw === "true";
    if (key === "legal_ready" && value && !legalTextsReady()) {
      throw new Error("Impressum, Datenschutz und AGB sind noch Platzhalter (app/content/legal.ts).");
    }
  } else if (key === "max_new_pages_per_week") {
    value = Math.min(Math.max(Number(raw) || 0, 0), 20);
  } else {
    throw new Error("unbekannter Schalter");
  }
  const { error } = await db().from("settings").update({ [key]: value, updated_at: new Date().toISOString(), updated_by: "owner-dashboard" }).eq("id", 1);
  if (error) throw new Error(error.message);
  await db().from("decisions").insert({ type: "note", subject: `Schalter ${key} = ${value}`, reasoning: "vom Inhaber im Dashboard gesetzt", status: "done" });
  revalidatePath("/dashboard", "layout");
}

const STATUSES = new Set(["draft", "review", "live", "retired"]);

/** Seite oder Variante freigeben/stilllegen. Live nur mit Rechtstexten (Datenbank-Trigger prüft zusätzlich). */
export async function setStatus(formData: FormData) {
  await requireOwner();
  const table = String(formData.get("table")) === "page" ? "landing_pages" : "page_variants";
  const id = String(formData.get("id"));
  const status = String(formData.get("status"));
  if (!STATUSES.has(status)) throw new Error("ungültiger Status");
  if (status === "live" && !legalTextsReady()) throw new Error("Live-Schalten gesperrt: Rechtstexte fehlen noch.");
  const upd: Record<string, unknown> = { status };
  if (table === "landing_pages" && status === "live") upd.published_at = new Date().toISOString();
  const { error } = await db().from(table).update(upd).eq("id", id);
  if (error) throw new Error(error.message);
  await db().from("decisions").insert({ type: "note", subject: `${table === "landing_pages" ? "Seite" : "Variante"} ${id} -> ${status}`, reasoning: "vom Inhaber im Dashboard gesetzt", status: "done" });
  revalidatePath("/dashboard", "layout");
}

/** Entscheidungsvorschlag des Gehirns annehmen oder ablehnen. */
export async function reviewDecision(formData: FormData) {
  await requireOwner();
  const id = Number(formData.get("id"));
  const status = String(formData.get("status")) === "done" ? "done" : "rejected";
  const { error } = await db().from("decisions").update({ status }).eq("id", id).eq("status", "proposed");
  if (error) throw new Error(error.message);
  revalidatePath("/dashboard", "layout");
}

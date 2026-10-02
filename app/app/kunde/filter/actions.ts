"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { verifyFilterToken } from "@/lib/tokens";
import { SIGNAL_KEYS, booked } from "./shared";
import { allFilterKeys } from "@/content/filter-questions";

// Schlüssel je Branche (filter-questions.ts) plus alte Schlüssel aus gespeicherten Profilen
const ALLOWED = new Set([...allFilterKeys(), ...SIGNAL_KEYS]);

const list = (v: FormDataEntryValue | null) =>
  String(v ?? "").split(/[,\n;]/).map((s) => s.trim()).filter(Boolean).slice(0, 50);

/** Wunschprofil speichern (Danke-Seite und Filter-Link aus der Willkommensmail). */
export async function saveFilters(formData: FormData) {
  const token = String(formData.get("t") ?? "");
  const id = verifyFilterToken(token, process.env.SESSION_SECRET?.trim());
  if (!id) redirect("/kunde/filter?abgelaufen=1");
  const { error } = await db().from("customer_filters").upsert({
    customer_id: id,
    regions: list(formData.get("regions")),
    signals: formData.getAll("signals").map(String).filter((s) => ALLOWED.has(s)),
    industries: list(formData.get("industries")),
    exclusions: list(formData.get("exclusions")),
    // Menge = gebuchtes Paket (1–10.000, wie der Regler auf der Zahlungsseite)
    max_per_week: Math.min(Math.max((await booked(id)) || 15, 1), 10_000),
    updated_at: new Date().toISOString(),
  }, { onConflict: "customer_id" });
  if (error) throw new Error(error.message);
  // Zurück dorthin, wo das Formular stand (nur eigene Seiten)
  const back = String(formData.get("back") ?? "");
  const safe = /^\/(danke\?session_id=cs_(live|test)_[A-Za-z0-9]+|kunde\/filter\?t=[\w.-]+)$/.test(back) ? back : `/kunde/filter?t=${encodeURIComponent(token)}`;
  redirect(`${safe}&ok=1#focus`);
}

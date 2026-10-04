"use server";

/**
 * Seiten-Flow speichern (Inhaber 04.10.2026: „nur für meine anzeige es soll in diesem flow keine änderungen geben“).
 * Schreibt ausschließlich die Anzeige-Anordnung in signalwerk.owner_settings (Schlüssel website_flow) – die Website,
 * Landingpages und alle übrigen Daten bleiben unverändert. requireOwner (sonst 404), Prüfung in lib/website-flow.ts,
 * Protokoll in owner_log.
 */
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { FlowInputError, mergeSetting, validateFlow, type FlowNode } from "@/lib/website-flow";
import { requireOwner } from "../../actions";

const BY = "Inhaber Dashboard";
type R = { ok: true; at: string } | { ok: false; error: string };

export async function saveWebsiteFlow(segment: string, nodes: FlowNode[]): Promise<R> {
  await requireOwner();
  try {
    const clean = validateFlow(nodes);
    const { data: cur, error: e1 } = await db().from("owner_settings").select("value").eq("key", "website_flow").maybeSingle();
    if (e1) throw new Error(e1.message);
    const value = mergeSetting(cur?.value ?? null, String(segment ?? "").toUpperCase(), clean);
    const at = new Date().toISOString();
    const { error } = await db().from("owner_settings").upsert({ key: "website_flow", value, updated_at: at, updated_by: BY });
    if (error) throw new Error(error.message);
    await db().from("owner_log").insert({
      action: "website:flow-speichern", target: segment, old_value: null, new_value: { seiten: clean.length }, created_by: BY,
    });
    revalidatePath("/dashboard/website/flow");
    return { ok: true, at };
  } catch (e) {
    if (e instanceof FlowInputError) return { ok: false, error: e.message };
    const ref = Math.random().toString(36).slice(2, 8);
    console.error(`website flow speichern [${ref}]:`, e);
    return { ok: false, error: `Speichern fehlgeschlagen (Fehler ${ref})` };
  }
}

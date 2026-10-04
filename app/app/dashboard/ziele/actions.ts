"use server";

/**
 * Ziele übernehmen (nur Inhaber, Sitzung geprüft): alle Soll-Werte des Formulars auf einmal, jede Änderung in
 * signalwerk.owner_log. Nur bestehende Ziel-Schlüssel, nichts gelöscht; Titel/Einheit/Richtung bleiben fest.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { loadZiele } from "@/lib/zentrale/data";
import { ZielFehler, pruefeSoll } from "@/lib/zentrale/ziele";
import { requireOwner } from "../actions";

const BY = "Inhaber Dashboard";

export async function saveGoals(f: FormData) {
  await requireOwner();
  const { ziele } = await loadZiele();
  const changes: { key: string; old: number; soll: number; z: (typeof ziele)[number] }[] = [];
  try {
    for (const z of ziele) {
      const raw = f.get(`soll_${z.key}`);
      if (raw === null) continue;
      const soll = pruefeSoll(raw, z.einheit);
      if (soll !== Number(z.soll) || z.quelle !== "inhaber") changes.push({ key: z.key, old: Number(z.soll), soll, z });
    }
  } catch (e) {
    if (e instanceof ZielFehler) redirect(`/dashboard/ziele?fehler=${encodeURIComponent(e.message)}`);
    throw e;
  }
  const at = new Date().toISOString();
  for (const c of changes) {
    const { error } = await db().from("company_goals").upsert({
      key: c.key, titel: c.z.titel, einheit: c.z.einheit, richtung: c.z.richtung, sort: c.z.sort,
      soll: c.soll, quelle: "inhaber", updated_at: at, updated_by: BY,
    });
    if (error) redirect(`/dashboard/ziele?fehler=${encodeURIComponent("Speichern fehlgeschlagen")}`);
    await db().from("owner_log").insert({ action: `ziel:${c.key}`, target: c.key, old_value: c.old, new_value: c.soll, created_by: BY });
  }
  revalidatePath("/dashboard", "layout");
  redirect(`/dashboard/ziele?ok=${encodeURIComponent(changes.length ? "übernommen" : "keine Änderung")}`);
}

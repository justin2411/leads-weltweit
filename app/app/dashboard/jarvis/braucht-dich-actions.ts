"use server";

/**
 * Aktionen der Karte „Braucht dich“: Inhaber-Entscheidung als erledigt markieren (decisions proposed → done,
 * needs_owner bleibt als Nachweis) und die Signatur-Frage entscheiden (behalten oder von einem Agenten ändern lassen).
 * Nur mit Inhaber-Sitzung, alles in owner_log, nichts wird gelöscht.
 */
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { freeAgent, validateTask } from "@/lib/agents";
import { loadAgentTasks } from "@/lib/dashboard-data";
import { insertDecision } from "@/lib/kurz-schreiben";
import { SEED_PLACEMENTS, type SeedPlacement } from "@/lib/braucht-dich";
import { requireOwner } from "../actions";

const BY = "Inhaber Dashboard";
type R = { ok: true; text: string } | { ok: false; error: string };

const fail = (what: string, e: unknown): R => {
  const ref = Math.random().toString(36).slice(2, 8);
  console.error(`braucht-dich ${what} [${ref}]:`, e instanceof Error ? e.message.slice(0, 160) : "Fehler");
  return { ok: false, error: `${what} fehlgeschlagen (Fehler ${ref})` };
};

export async function markDone(id: number): Promise<R> {
  await requireOwner();
  try {
    const n = Number(id);
    if (!Number.isSafeInteger(n) || n <= 0) return { ok: false, error: "unbekannter Punkt" };
    const { data, error } = await db().from("decisions").update({ status: "done" }).eq("id", n).eq("status", "proposed").eq("needs_owner", true).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return { ok: false, error: "schon erledigt" };
    await db().from("owner_log").insert({ action: "braucht-dich:erledigt", target: `decisions #${n}`, old_value: { status: "proposed" }, new_value: { status: "done" }, created_by: BY });
    revalidatePath("/dashboard", "layout");
    return { ok: true, text: "erledigt" };
  } catch (e) {
    return fail("Erledigen", e);
  }
}

export async function decideSignatur(choice: "behalten" | "aendern"): Promise<R> {
  await requireOwner();
  if (choice !== "behalten" && choice !== "aendern") return { ok: false, error: "unbekannte Wahl" };
  try {
    let agent: number | null = null;
    if (choice === "aendern") {
      const brief = "Signatur-Zeile „Exclusive trigger leads for B2B service firms“ (und FR „Pistes exclusives …“) ohne Exklusivitätszusage umformulieren – docs/KALTMAIL-VORLAGE.md §2. Dateien: scripts/drafts.py, scripts/lib/html_email.py, app/lib/welcome-mail.ts. PR mit Tests, selbst mergen.";
      const t = validateTask({ agent: freeAgent(await loadAgentTasks()), kind: "pruefen", market: "", brief });
      const ins = await db().from("agent_tasks").insert({ ...t, created_by: BY }).select("id").single();
      if (ins.error) throw new Error(ins.error.message);
      agent = t.agent;
    }
    const err = await insertDecision(db(), {
      type: "note", status: "done",
      subject: choice === "behalten" ? "Inhaber: Signatur mit Exklusivität behalten" : "Inhaber: Signatur ohne Exklusivität",
      reasoning: choice === "behalten" ? "Inhaber behält die Signatur-Zeile trotz Vorlage §2." : `Inhaber lässt die Signatur ändern (Agent ${agent}).`,
      metrics: { braucht_dich: "signatur", wahl: choice },
    });
    if (err) throw new Error(err.message);
    await db().from("owner_log").insert({ action: "braucht-dich:signatur", target: "Signatur", old_value: null, new_value: { wahl: choice, agent }, created_by: BY });
    revalidatePath("/dashboard", "layout");
    return { ok: true, text: choice === "behalten" ? "bleibt so" : `Agent ${agent} ändert` };
  } catch (e) {
    return fail("Entscheiden", e);
  }
}

/** Kontrollmail einordnen (Posteingangstest): placement nur setzen, wenn noch leer – nichts wird überschrieben. */
export async function setSeedPlacement(id: string, placement: SeedPlacement): Promise<R> {
  await requireOwner();
  if (!/^[0-9a-f-]{36}$/i.test(String(id ?? ""))) return { ok: false, error: "unbekannte Kontrollmail" };
  if (!SEED_PLACEMENTS.includes(placement)) return { ok: false, error: "unbekannte Einordnung" };
  try {
    const { data, error } = await db().from("seed_checks").update({ placement, checked_at: new Date().toISOString() })
      .eq("id", id).is("placement", null).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) return { ok: false, error: "schon eingeordnet" };
    await db().from("owner_log").insert({ action: "braucht-dich:kontrollmail", target: `seed_checks ${id}`, old_value: null, new_value: { placement }, created_by: BY });
    revalidatePath("/dashboard", "layout");
    return { ok: true, text: "eingeordnet" };
  } catch (e) {
    return fail("Einordnen", e);
  }
}

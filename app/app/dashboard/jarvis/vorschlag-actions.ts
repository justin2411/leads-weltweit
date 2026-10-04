"use server";

/**
 * Vorschläge mit Haken/Kreuz (Inhaber 04.10.2026: „verbesserungsvorschläge mit haken annehmen oder kreuz ablehnen“).
 * Haken: decisions.status proposed → done und Auftrag „Vorschlag umsetzen: …“ an den ersten freien Agenten.
 * Kreuz: proposed → rejected, optionaler Grund in metrics.inhaber_grund. Nur offene Vorschläge, nur mit Inhaber-Sitzung,
 * alles in owner_log. Nichts wird gelöscht.
 */
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { freeAgent, inferTask, validateTask } from "@/lib/agents";
import { loadAgentTasks } from "@/lib/dashboard-data";
import { PROPOSAL_PREFIX, acceptBrief, rejectReason } from "@/lib/vorschlaege";
import { requireOwner } from "../actions";

const BY = "Inhaber Dashboard";
type R = { ok: true; text: string } | { ok: false; error: string };

async function loadOpen(id: unknown) {
  const n = Number(id);
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  const { data, error } = await db().from("decisions").select("id, subject, reasoning, metrics, status").eq("id", n).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.status !== "proposed" || !PROPOSAL_PREFIX.test(String(data.subject ?? ""))) return null;
  return data as { id: number; subject: string; reasoning: string | null; metrics: Record<string, unknown> | null; status: string };
}

const fail = (what: string, e: unknown): R => {
  const ref = Math.random().toString(36).slice(2, 8);
  console.error(`vorschlag ${what} [${ref}]:`, e instanceof Error ? e.message.slice(0, 160) : "Fehler");
  return { ok: false, error: `${what} fehlgeschlagen (Fehler ${ref})` };
};

export async function acceptProposal(id: number): Promise<R> {
  await requireOwner();
  try {
    const d = await loadOpen(id);
    if (!d) return { ok: false, error: "Vorschlag ist schon erledigt" };
    const { data: upd, error } = await db().from("decisions").update({ status: "done" }).eq("id", d.id).eq("status", "proposed").select("id");
    if (error) throw new Error(error.message);
    if (!upd?.length) return { ok: false, error: "Vorschlag ist schon erledigt" };
    const brief = acceptBrief(d);
    const tasks = await loadAgentTasks();
    const t = validateTask({ agent: freeAgent(tasks), kind: inferTask(brief).kind ?? "pruefen", market: inferTask(brief).market ?? "", brief });
    const ins = await db().from("agent_tasks").insert({ ...t, created_by: BY }).select("id").single();
    if (ins.error) throw new Error(ins.error.message);
    await db().from("owner_log").insert({ action: "vorschlag:annehmen", target: `decisions #${d.id}`, old_value: { status: "proposed" },
      new_value: { status: "done", agent: t.agent, task: ins.data?.id ?? null }, created_by: BY });
    revalidatePath("/dashboard", "layout");
    return { ok: true, text: `angenommen – Agent ${t.agent} setzt um` };
  } catch (e) {
    return fail("Annehmen", e);
  }
}

export async function rejectProposal(id: number, reason?: string): Promise<R> {
  await requireOwner();
  try {
    const d = await loadOpen(id);
    if (!d) return { ok: false, error: "Vorschlag ist schon erledigt" };
    const grund = rejectReason(reason);
    const metrics = { ...(d.metrics && typeof d.metrics === "object" ? d.metrics : {}), ...(grund ? { inhaber_grund: grund } : {}) };
    const { data: upd, error } = await db().from("decisions").update({ status: "rejected", metrics }).eq("id", d.id).eq("status", "proposed").select("id");
    if (error) throw new Error(error.message);
    if (!upd?.length) return { ok: false, error: "Vorschlag ist schon erledigt" };
    await db().from("owner_log").insert({ action: "vorschlag:ablehnen", target: `decisions #${d.id}`, old_value: { status: "proposed" },
      new_value: { status: "rejected", grund }, created_by: BY });
    revalidatePath("/dashboard", "layout");
    return { ok: true, text: "abgelehnt" };
  } catch (e) {
    return fail("Ablehnen", e);
  }
}

"use server";

/**
 * Aktionen der Kunden-Agenten (Inhaber 04.10.2026, docs/KUNDEN-AGENTEN.md). Jede Aktion: Sitzung prüfen (requireOwner),
 * Eingabe serverseitig prüfen, Agent aus der Datenbank laden (nie Formularwerten vertrauen), in owner_log protokollieren.
 * Server Actions sind von Next gegen CSRF geschützt. Hier wird nichts versendet und nichts gelöscht: ein Hinweis wird als
 * Notiz gespeichert und als Auftrag (agent_tasks kind „kunde“) an die Agenten-Runde (:08/:23/:38/:53) gegeben.
 */
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { MARKETS, agentStartLabel } from "@/lib/agents";
import { KUNDE_TASK_AGENT, cleanNote, fullName, noteBrief, resumeStatus } from "@/lib/customer-agents";
import { isUuid } from "@/lib/antworten";
import { requireOwner } from "../actions";

const BY = "Inhaber Dashboard";
const LIST = "/dashboard/kunden-agenten";
/** Liste ist seit der Zentrale der Reiter „Agenten“ der Kunden-Seite (dort steht die Meldung ok/fehler). */
const LISTE = "/dashboard/kunden?tab=agenten";

function go(path: string, key: "ok" | "fehler", msg: string): never {
  const u = new URL(path, "http://x");
  u.searchParams.set(key, msg);
  redirect(u.pathname + u.search);
}

async function log(action: string, target: string, newValue: unknown, oldValue: unknown = null) {
  await db().from("owner_log").insert({ action, target, old_value: oldValue, new_value: newValue ?? null, created_by: BY });
}

async function loadAgent(raw: unknown) {
  const id = String(raw ?? "");
  if (!isUuid(id)) go(LISTE, "fehler", "Agent unbekannt");
  const { data, error } = await db().from("customer_agents").select("id, customer_id, status, persona, profile, last_contact_at").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) go(LISTE, "fehler", "Agent unbekannt");
  return data as { id: string; customer_id: string; status: string; persona: any; profile: unknown; last_contact_at: string | null };
}

/** Hinweis an den Agenten („mehr Handwerker“): Notiz im Verlauf + Auftrag für die Agenten-Runde. */
export async function addAgentNote(f: FormData) {
  await requireOwner();
  const a = await loadAgent(f.get("id"));
  const back = `${LIST}/${a.id}`;
  const note = cleanNote(f.get("text"));
  if (!note) go(back, "fehler", "Hinweis: 3–800 Zeichen");
  const { error: e1 } = await db().from("customer_agent_messages").insert({
    agent_id: a.id, direction: "notiz", channel: "dashboard", subject: "Hinweis vom Inhaber", body: note, status: "empfangen",
  });
  if (e1) go(back, "fehler", `Hinweis nicht gespeichert: ${e1.message.slice(0, 120)}`);
  const { data: c } = await db().from("customers").select("company_name, country").eq("id", a.customer_id).maybeSingle();
  const cc = String(c?.country ?? "").toUpperCase();
  const task = {
    agent: KUNDE_TASK_AGENT, kind: "kunde", market: (MARKETS as readonly string[]).includes(cc) ? cc : null,
    brief: noteBrief(a.id, fullName(a.persona), c?.company_name ?? "", note), created_by: BY,
  };
  const { error: e2 } = await db().from("agent_tasks").insert(task);
  await log("kunden-agent:hinweis", a.id, { note, task: e2 ? null : task.agent });
  revalidatePath(LIST, "layout");
  if (e2) go(back, "fehler", `Hinweis gespeichert, Auftrag nicht angelegt: ${e2.message.slice(0, 120)}`);
  go(back, "ok", `Hinweis gespeichert – Agent startet um ${agentStartLabel(new Date())}`);
}

/** Pausieren (keine eigenen Mails, Lieferungen laufen weiter) oder fortsetzen. */
export async function setAgentPaused(f: FormData) {
  await requireOwner();
  const a = await loadAgent(f.get("id"));
  const back = `${LIST}/${a.id}`;
  const pause = String(f.get("paused") ?? "") === "1";
  const status = pause ? "pausiert" : resumeStatus(a);
  if (status === a.status) go(back, "ok", pause ? "schon pausiert" : "läuft schon");
  const { error } = await db().from("customer_agents").update({ status, paused_by: pause ? "inhaber" : null, updated_at: new Date().toISOString() }).eq("id", a.id);
  if (error) go(back, "fehler", `nicht gespeichert: ${error.message.slice(0, 120)}`);
  await log("kunden-agent:status", a.id, status, a.status);
  revalidatePath(LIST, "layout");
  go(back, "ok", pause ? "Agent pausiert" : "Agent läuft wieder");
}

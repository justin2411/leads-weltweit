"use server";

/**
 * Gehirn-Routinen im Dashboard (Inhaber 04.10.2026: „beim gehirn mit ihm auch einzelne workflows bauen … jeden tag um
 * 14 uhr sollst du 15min recherchieren …“). Anlegen, ändern, pausieren/fortsetzen, „Jetzt starten“ – nie löschen
 * (ausschalten statt löschen). Jede Aktion: requireOwner, Prüfung wie im Chat-Werkzeug (lib/brain-routines.ts),
 * owner_log. „Jetzt starten“ legt sofort einen Auftrag (agent_tasks, kind 'gehirn') für einen freien Agenten an.
 */
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/supabase";
import { BRAIN_BY, RoutineError, routineBrief, toRoutine, validateRoutine } from "@/lib/brain-routines";
import { freeAgent } from "@/lib/agents";
import { roleBrief, toRolle } from "@/lib/fach-agenten";
import { loadAgentTasks } from "@/lib/dashboard-data";
import { requireOwner } from "../actions";

const BY = "Inhaber Dashboard";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const back = (msg?: string): never => redirect(`/dashboard/gehirn${msg ? `?rfehler=${encodeURIComponent(msg)}` : ""}#routinen`);

async function log(action: string, target: string | null, oldValue: unknown, newValue: unknown) {
  await db().from("owner_log").insert({ action, target, old_value: oldValue ?? null, new_value: newValue ?? null, created_by: BY });
}

/** Neue Routine oder Änderung (Formular: id?, name, aufgabe, uhrzeit, tage, wochentage[], dauer_min). */
export async function saveRoutine(f: FormData) {
  await requireOwner();
  const id = String(f.get("id") ?? "");
  let err: string | null = null;
  try {
    const r = validateRoutine({
      name: f.get("name"), aufgabe: f.get("aufgabe"), uhrzeit: f.get("uhrzeit"), tage: f.get("tage"),
      wochentage: f.getAll("wochentage").map(String), dauer_min: f.get("dauer_min"),
    });
    if (id) {
      if (!UUID.test(id)) throw new RoutineError("Routine unbekannt");
      const { data: old } = await db().from("brain_routines").select("*").eq("id", id).maybeSingle();
      if (!old) throw new RoutineError("Routine unbekannt");
      const { error } = await db().from("brain_routines").update(r).eq("id", id);
      if (error) throw new Error(error.message);
      await log("gehirn:routine-aendern", id, { name: old.name, uhrzeit: old.uhrzeit, tage: old.tage }, r);
    } else {
      const { data, error } = await db().from("brain_routines").insert({ ...r, aktiv: true, created_by: BY }).select("id").single();
      if (error) throw new Error(error.message);
      await log("gehirn:routine", String(data.id), null, r);
    }
    revalidatePath("/dashboard", "layout");
  } catch (e) {
    err = e instanceof RoutineError ? e.message : "nicht gespeichert – bitte gleich noch einmal";
    if (!(e instanceof RoutineError)) console.error("gehirn routine:", e instanceof Error ? e.message.slice(0, 200) : e);
  }
  back(err ?? undefined);
}

/** Pausieren / fortsetzen (aktiv). */
export async function toggleRoutine(f: FormData) {
  await requireOwner();
  const id = String(f.get("id") ?? "");
  const aktiv = f.get("aktiv") === "true";
  if (!UUID.test(id)) back("Routine unbekannt");
  const { error } = await db().from("brain_routines").update({ aktiv }).eq("id", id);
  if (error) { console.error("gehirn routine aktiv:", error.message); back("nicht gespeichert"); }
  await log("gehirn:routine-aktiv", id, null, { aktiv });
  revalidatePath("/dashboard", "layout");
  back();
}

/** Jetzt starten: Auftrag an den ersten freien Agenten (A1–A8), last_run_at = jetzt. */
export async function runRoutineNow(f: FormData) {
  await requireOwner();
  const id = String(f.get("id") ?? "");
  if (!UUID.test(id)) back("Routine unbekannt");
  const { data } = await db().from("brain_routines").select("*").eq("id", id).maybeSingle();
  if (!data) back("Routine unbekannt");
  const r = toRoutine(data as Record<string, unknown>);
  if (r.last_task_id) {
    const { data: t } = await db().from("agent_tasks").select("status").eq("id", r.last_task_id).maybeSingle();
    if (t && (t.status === "offen" || t.status === "laeuft")) back("läuft schon");
  }
  const agent = freeAgent(await loadAgentTasks());
  // Routine eines Fach-Agenten (agent_roles.routine_id): Auftrag mit dessen Text und Zuordnung (JARVIS „Team“)
  const { data: role } = await db().from("agent_roles").select("*").eq("routine_id", id).eq("aktiv", true).maybeSingle()
    .then((x) => x, () => ({ data: null }));
  const brief = role ? roleBrief(toRolle(role), r.dauer_min, r.aufgabe) : routineBrief(r);
  const { data: task, error } = await db().from("agent_tasks").insert({ agent, kind: "gehirn", market: null, brief, created_by: BRAIN_BY, routine_id: id, ...(role ? { rolle: role.slug } : {}) })
    .select("id").single();
  if (error) { console.error("gehirn routine jetzt:", error.message); back("nicht gestartet"); }
  await db().from("brain_routines").update({ last_run_at: new Date().toISOString(), last_task_id: task!.id }).eq("id", id);
  await log("gehirn:routine-jetzt", id, null, { agent, task: task!.id });
  revalidatePath("/dashboard", "layout");
  back();
}

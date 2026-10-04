/**
 * Fach-Agenten (JARVIS „Team“): Datenbank-Zugriffe, nur serverseitig. Jede Quelle einzeln fehlertolerant – fehlt eine
 * Tabelle (z. B. pruef_stats_daily vor dem Merge der Dauerprüfung), zeigt die Karte „noch keine Daten“.
 */
import "server-only";
import { db } from "@/lib/supabase";
import { COUNTRIES, SEGMENT } from "@/lib/dashboard-data";
import { toRoutine, type BrainRoutine } from "@/lib/brain-routines";
import { normalizeKpi, normalizePruef, toRolle, type KpiTag, type PruefTag, type RoleTask, type Rolle } from "@/lib/fach-agenten";

export type TeamData = { roles: Rolle[]; routines: BrainRoutine[]; tasks: RoleTask[]; kpi: KpiTag[]; pruef: PruefTag[] | null };

const T = () => AbortSignal.timeout(5000);

async function soft<X>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>, f: (d: unknown) => X, fallback: X): Promise<X> {
  try {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return f(data);
  } catch {
    return fallback;
  }
}

/** Alles für den Abschnitt „Team“; null = Tabelle agent_roles fehlt (Abschnitt bleibt dann aus). */
export async function loadTeam(): Promise<TeamData | null> {
  const roles = await soft(db().from("agent_roles").select("*").order("sort").abortSignal(T()),
    (d) => (Array.isArray(d) ? d.map((x) => toRolle(x as Record<string, unknown>)) : []), null as Rolle[] | null);
  if (!roles || !roles.length) return null;
  const ids = roles.map((r) => r.routine_id).filter((x): x is string => !!x);
  const since = new Date(Date.now() - 15 * 86_400_000).toISOString().slice(0, 10);
  const [routines, tasks, kpi, pruef] = await Promise.all([
    ids.length ? soft(db().from("brain_routines").select("*").in("id", ids).abortSignal(T()),
      (d) => (Array.isArray(d) ? d.map((x) => toRoutine(x as Record<string, unknown>)) : []), [] as BrainRoutine[]) : Promise.resolve([] as BrainRoutine[]),
    soft(db().from("agent_tasks").select("id, rolle, agent, status, result, created_at, finished_at, wirkung").not("rolle", "is", null)
      .order("created_at", { ascending: false }).limit(80).abortSignal(T()), (d) => (Array.isArray(d) ? d as RoleTask[] : []), [] as RoleTask[]),
    soft(db().rpc("agent_role_kpi", { p_segment: SEGMENT, p_countries: [...COUNTRIES], p_days: 14 }).abortSignal(T()), normalizeKpi, [] as KpiTag[]),
    soft(db().from("pruef_stats_daily").select("*").gte("day", since).limit(500).abortSignal(T()), normalizePruef, null as PruefTag[] | null),
  ]);
  return { roles, routines, tasks, kpi, pruef };
}

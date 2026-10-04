/**
 * Firma (/dashboard/firma): Datenbank-Zugriffe, nur serverseitig mit dem Service-Schlüssel. Jede Quelle einzeln
 * fehlertolerant – fehlt eine Zahl, zeigt die Seite „–“ statt einer erfundenen.
 */
import "server-only";
import { db } from "@/lib/supabase";
import { COUNTRIES, SEGMENT, loadActivity } from "@/lib/dashboard-data";
import type { RolleLite, RoutineLite, TaskLite, WebAgentLite } from "@/lib/office";
import { isLive, type Activity, type WerkId } from "@/lib/werke-live";
import { loadZieleIst } from "@/lib/zentrale/data";
import type { ZielZeile } from "@/lib/zentrale/ziele";
import { toBereich, toUebergabe, type Bereich, type Lage, type Uebergabe } from "@/lib/firma";

const T = (ms = 8000) => AbortSignal.timeout(ms);

async function soft<X>(p: PromiseLike<{ data: unknown; error: { message: string } | null }>, f: (d: unknown) => X, fallback: X): Promise<X> {
  try {
    const { data, error } = await p;
    if (error) throw new Error(error.message);
    return f(data);
  } catch {
    return fallback;
  }
}
const rows = (d: unknown) => (Array.isArray(d) ? (d as Record<string, unknown>[]) : []);

/** Status eines Mitglieds: aktiv (true/false) und letzter Lauf, soweit bekannt. */
export type MitgliedStand = { aktiv: boolean | null; zuletzt: string | null };
export type UebergabeTask = Uebergabe & { task_status: string | null };
export type FirmaDaten = {
  bereiche: Bereich[]; lage: Lage | null; ziele: ZielZeile[] | null; uebergaben: UebergabeTask[];
  stand: Record<string, MitgliedStand>;
};

export async function loadFirma(now = new Date()): Promise<FirmaDaten | null> {
  const bereiche = await soft(db().from("departments").select("*").eq("aktiv", true).order("sort").abortSignal(T()),
    (d) => rows(d).map(toBereich).filter((b): b is Bereich => !!b), null as Bereich[] | null);
  if (!bereiche || !bereiche.length) return null;
  const seit = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const [lage, ziele, ueb, roles, routines, web] = await Promise.all([
    soft(db().rpc("firma_lage", { p_segment: SEGMENT, p_countries: [...COUNTRIES] }).abortSignal(T(12000)),
      (d) => (d && typeof d === "object" && !Array.isArray(d) ? (d as Lage) : null), null as Lage | null),
    loadZieleIst(now).then((z) => z.zeilen).catch(() => null),
    soft(db().from("handoffs").select("id, created_at, regel, von, an, titel, grund, market, status, push_at, task_id")
      .gte("created_at", seit).order("created_at", { ascending: false }).limit(30).abortSignal(T()), rows, [] as Record<string, unknown>[]),
    soft(db().from("agent_roles").select("slug, aktiv").abortSignal(T()), rows, []),
    soft(db().from("brain_routines").select("name, aktiv, last_run_at").abortSignal(T()), rows, []),
    soft(db().from("website_agents").select("name, aktiv, last_run_at").abortSignal(T()), rows, []),
  ]);
  const ids = ueb.map((u) => String(u.task_id ?? "")).filter(Boolean);
  const tasks = ids.length
    ? await soft(db().from("agent_tasks").select("id, status").in("id", ids).abortSignal(T()), rows, [])
    : [];
  const ts = new Map(tasks.map((t) => [String(t.id), String(t.status)]));
  const stand: Record<string, MitgliedStand> = {};
  for (const r of roles) stand[`rolle:${r.slug}`] = { aktiv: r.aktiv !== false, zuletzt: null };
  for (const r of routines) stand[`routine:${r.name}`] = { aktiv: r.aktiv !== false, zuletzt: (r.last_run_at as string) ?? null };
  for (const r of web) stand[`website:${r.name}`] = { aktiv: r.aktiv !== false, zuletzt: (r.last_run_at as string) ?? null };
  return {
    bereiche, lage, ziele,
    uebergaben: ueb.map((u) => ({ ...toUebergabe(u), task_status: u.task_id ? ts.get(String(u.task_id)) ?? null : null })),
    stand,
  };
}

// ------------------------------------------------------------------------------------------- Bereichs-Office

export type OfficeDaten = {
  firma: FirmaDaten; roles: RolleLite[] | null; routines: RoutineLite[] | null; web: WebAgentLite[] | null;
  tasks: TaskLite[] | null; werkLive: Record<string, boolean> | null; act: Activity | null;
};

const WERKE: WerkId[] = ["lead-werk", "kunden-werk", "proben-vorrat", "versand", "antworten", "freigabe"];

/** Office eines Bereichs: Firma-Daten + Arbeitsplätze (Rollen, Routinen, Website-Agenten, Aufträge, Werk-Lebenszeichen). */
export async function loadOffice(now = new Date()): Promise<OfficeDaten | null> {
  const [firma, roles, routines, web, tasks, act] = await Promise.all([
    loadFirma(now),
    soft(db().from("agent_roles").select("slug, name, aktiv, department, takt").abortSignal(T()), (d) => rows(d).map((r) => ({
      slug: String(r.slug), name: String(r.name ?? r.slug), aktiv: r.aktiv === false ? false : true, department: r.department ? String(r.department) : null, takt: r.takt ? String(r.takt) : null,
    })), null as RolleLite[] | null),
    soft(db().from("brain_routines").select("id, name, aktiv, last_run_at, last_task_id, last_result").abortSignal(T()), (d) => rows(d) as unknown as RoutineLite[], null as RoutineLite[] | null),
    soft(db().from("website_agents").select("id, name, aktiv, last_run_at, last_task_id, last_result").abortSignal(T()), (d) => rows(d) as unknown as WebAgentLite[], null as WebAgentLite[] | null),
    soft(db().from("agent_tasks").select("id, created_at, agent, brief, status, result, step, finished_at, rolle, routine_id, grund, kind")
      .order("created_at", { ascending: false }).limit(300).abortSignal(T()), (d) => rows(d).map((t) => ({
      id: String(t.id), created_at: String(t.created_at ?? ""), agent: Number(t.agent ?? 0), brief: String(t.brief ?? ""), status: String(t.status ?? ""),
      result: t.result ? String(t.result) : null, step: t.step ? String(t.step) : null, finished_at: t.finished_at ? String(t.finished_at) : null,
      rolle: t.rolle ? String(t.rolle) : null, routine_id: t.routine_id ? String(t.routine_id) : null, grund: t.grund ? String(t.grund) : null, kind: t.kind ? String(t.kind) : null,
    })), null as TaskLite[] | null),
    loadActivity().catch(() => null),
  ]);
  if (!firma) return null;
  // leere Ersatz-Aktivität (Abfrage fehlgeschlagen) erkennt man an fehlenden Läufen → Werk-Status „–“
  const okAct = act && act.heartbeats && Object.keys(act.last_run ?? {}).length ? act : null;
  const werkLive = okAct ? Object.fromEntries(WERKE.map((w) => [w, isLive(okAct, w, now)])) : null;
  return { firma, roles, routines, web, tasks, werkLive, act: okAct };
}

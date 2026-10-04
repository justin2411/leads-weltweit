/**
 * Firma (/dashboard/firma): Datenbank-Zugriffe, nur serverseitig mit dem Service-Schlüssel. Jede Quelle einzeln
 * fehlertolerant – fehlt eine Zahl, zeigt die Seite „–“ statt einer erfundenen.
 */
import "server-only";
import { db } from "@/lib/supabase";
import { COUNTRIES, SEGMENT } from "@/lib/dashboard-data";
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

import "server-only";
import { db } from "@/lib/supabase";
import {
  ausDecisions, ausLernen, ausOwnerLog, ausPlanLog, ausTasks, ausWissen,
  type DecisionRow, type Eintrag, type NotizRow, type OwnerRow, type PlanRow, type TaskRow, type WissenRow,
} from "./protokoll";

/**
 * Daten des Unternehmens-Protokolls (nur lesen): decisions, agent_tasks (fertig), werk_plan_log, owner_log,
 * learning_log, brain_knowledge. Jede Quelle einzeln: fehlt eine Tabelle oder schlägt eine Abfrage fehl, steht sie in
 * `fehler` und die übrigen Einträge erscheinen trotzdem.
 */
export type ProtokollDaten = { eintraege: Eintrag[]; fehler: string[] };

const T = () => AbortSignal.timeout(6000);
type Res = { data: unknown[] | null; error: { message: string } | null };

export async function loadProtokoll(tage: number): Promise<ProtokollDaten> {
  const since = new Date(Date.now() - tage * 86_400_000).toISOString();
  // Plan-Log: einen Tag mehr, damit der erste Lauf im Fenster einen Vorgänger zum Vergleichen hat
  const sincePlan = new Date(Date.now() - (tage + 1) * 86_400_000).toISOString();
  const sb = db();
  const q: [string, PromiseLike<Res>][] = [
    ["Entscheidungen", sb.from("decisions").select("id, created_at, type, status, subject, reasoning, action, kurz_titel, kurz_grund").gte("created_at", since)
      .order("created_at", { ascending: false }).limit(500).abortSignal(T())],
    ["Agenten", sb.from("agent_tasks").select("id, created_at, finished_at, agent, kind, market, brief, status, result").eq("status", "fertig")
      .gte("created_at", new Date(Date.parse(since) - 7 * 86_400_000).toISOString()).order("created_at", { ascending: false }).limit(300).abortSignal(T())],
    ["Werke", sb.from("werk_plan_log").select("id, werk, at, mode, bremse, plan, reasons").gte("at", sincePlan).order("at", { ascending: false }).limit(2000).abortSignal(T())],
    ["Inhaber", sb.from("owner_log").select("id, action, target, new_value, created_at, created_by").gte("created_at", since)
      .order("created_at", { ascending: false }).limit(500).abortSignal(T())],
    ["Lernnotizen", sb.from("learning_log").select("id, created_at, kind, text").gte("created_at", since).order("created_at", { ascending: false }).limit(200).abortSignal(T())],
    ["Wissen", sb.from("brain_knowledge").select("id, titel, quelle, created_at, updated_at").gte("updated_at", since).order("updated_at", { ascending: false }).limit(200).abortSignal(T())],
  ];
  const res = await Promise.all(q.map(([, p]) => Promise.resolve(p).then((r) => r, (e: unknown) => ({ data: null, error: { message: String(e) } }) as Res)));
  const fehler: string[] = [];
  const rows = <X>(i: number): X[] => {
    if (res[i].error) { fehler.push(q[i][0]); return []; }
    return (res[i].data ?? []) as X[];
  };
  const eintraege = [
    ...ausDecisions(rows<DecisionRow>(0)),
    ...ausTasks(rows<TaskRow>(1)),
    ...ausPlanLog(rows<PlanRow>(2)),
    ...ausOwnerLog(rows<OwnerRow>(3)),
    ...ausLernen(rows<NotizRow>(4)),
    ...ausWissen(rows<WissenRow>(5)),
  ].filter((e) => Date.parse(e.at) >= Date.parse(since));
  return { eintraege, fehler };
}

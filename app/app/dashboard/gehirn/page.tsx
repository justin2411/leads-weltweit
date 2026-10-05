import { CONFIG, loadAgentTasks, loadBrain } from "@/lib/dashboard-data";
import { envStatus } from "@/lib/env";
import { legalTextsReady } from "@/lib/legal";
import { stripeEnabled } from "@/lib/stripe";
import { db } from "@/lib/supabase";
import { loadKnowledge, loadRoutines } from "@/lib/jarvis-context";
import { requireOwner } from "../actions";
import { GehirnView } from "./view";
import { Lernschleife } from "./lernschleife";
import { loadAb } from "@/lib/ab-data";

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Gehirn-Sitzung im JARVIS-Chat (für den Link „Mit dem Gehirn sprechen“); fehlt → null. */
async function gehirnSession(): Promise<string | null> {
  try {
    const { data } = await db().from("jarvis_sessions").select("id").eq("kind", "gehirn").limit(1).abortSignal(AbortSignal.timeout(4000));
    return data?.[0]?.id ? String(data[0].id) : null;
  } catch {
    return null;
  }
}

/** Gehirn: Daten nur serverseitig laden (loadBrain, loadAgentTasks, Routinen, Wissen), Ansicht in view.tsx.
 *  ?rfehler=… Fehler beim Speichern einer Routine · ?wissen=<slug> öffnet diese Notiz. */
export default async function Gehirn({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const sp = await searchParams;
  const [brain, tasks, routines, knowledge, chatId, ab] = await Promise.all([loadBrain(), loadAgentTasks(), loadRoutines(), loadKnowledge(), gehirnSession(),
    loadAb().catch(() => null)]);
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 200) : null);
  return (<>
    <Lernschleife />
    <GehirnView now={new Date()} {...brain} tasks={tasks} workflows={CONFIG.workflows} env={envStatus()}
      legalFiles={legalTextsReady()} stripe={{ live: stripeEnabled("live"), test: stripeEnabled("test") }}
      routines={routines} knowledge={knowledge} routineError={one("rfehler")} openDoc={one("wissen")} chatId={chatId} ab={ab} />
  </>);
}

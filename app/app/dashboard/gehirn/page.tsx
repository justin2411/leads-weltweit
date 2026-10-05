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
import { loadAufbau } from "@/lib/gehirn-aufbau-data";
import { Aufbau } from "./aufbau";
import Link from "next/link";
import { Icon } from "@/app/icons";

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

/** Gehirn: oben der Aufbau (Gehirn → Agenten → Werke → Zeitplan, aufbau.tsx), darunter Lernschleife und Steuerung.
 *  Daten nur serverseitig laden (loadBrain, loadAgentTasks, Routinen, Wissen), Ansicht in view.tsx.
 *  ?rfehler=… Fehler beim Speichern einer Routine · ?wissen=<slug> öffnet diese Notiz. */
export default async function Gehirn({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const sp = await searchParams;
  const [brain, tasks, routines, knowledge, chatId, ab, aufbau] = await Promise.all([loadBrain(), loadAgentTasks(), loadRoutines(), loadKnowledge(), gehirnSession(),
    loadAb().catch(() => null), loadAufbau()]);
  const one = (k: string) => (typeof sp[k] === "string" ? (sp[k] as string).slice(0, 200) : null);
  return (<>
    <nav className="gh-strat" aria-label="Strategie" style={{ display: "flex", justifyContent: "flex-end", margin: "0 0 8px" }}>
      <Link href="/dashboard/strategie" style={{ display: "inline-flex", alignItems: "center", gap: 6, minHeight: 44, padding: "0 12px", border: "1px solid rgba(95,212,255,.35)", borderRadius: 10, textDecoration: "none", color: "#a8ecff" }}>
        <Icon name="stern" size={16} />Strategie und Plan<Icon name="weiter" size={14} />
      </Link>
    </nav>
    <Aufbau d={aufbau} />
    <Lernschleife />
    <GehirnView now={new Date()} {...brain} tasks={tasks} workflows={CONFIG.workflows} env={envStatus()}
      legalFiles={legalTextsReady()} stripe={{ live: stripeEnabled("live"), test: stripeEnabled("test") }}
      routines={routines} knowledge={knowledge} routineError={one("rfehler")} openDoc={one("wissen")} chatId={chatId} ab={ab} />
  </>);
}

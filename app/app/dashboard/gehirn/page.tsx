import { CONFIG, loadAgentTasks, loadBrain } from "@/lib/dashboard-data";
import { envStatus } from "@/lib/env";
import { legalTextsReady } from "@/lib/legal";
import { stripeEnabled } from "@/lib/stripe";
import { requireOwner } from "../actions";
import { GehirnView } from "./view";

/** Gehirn: Daten nur serverseitig laden (loadBrain, loadAgentTasks), Ansicht in view.tsx. */
export default async function Gehirn() {
  await requireOwner();
  const [brain, tasks] = await Promise.all([loadBrain(), loadAgentTasks()]);
  return (
    <GehirnView now={new Date()} {...brain} tasks={tasks} workflows={CONFIG.workflows} env={envStatus()}
      legalFiles={legalTextsReady()} stripe={{ live: stripeEnabled("live"), test: stripeEnabled("test") }} />
  );
}

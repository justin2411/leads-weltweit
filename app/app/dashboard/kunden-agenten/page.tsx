import { redirect } from "next/navigation";
import { requireOwner } from "../actions";

/** Kunden-Agenten sind seit der JARVIS-Zentrale (05.10.2026) ein Reiter der Kunden-Seite; Detailseiten bleiben unter /dashboard/kunden-agenten/[id]. */
export default async function KundenAgenten() {
  await requireOwner();
  redirect("/dashboard/kunden?tab=agenten");
}

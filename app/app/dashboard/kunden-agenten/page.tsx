import { redirect } from "next/navigation";
import { requireOwner } from "../actions";

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Kunden-Agenten sind seit der JARVIS-Zentrale (05.10.2026) ein Reiter der Kunden-Seite; Detailseiten bleiben unter /dashboard/kunden-agenten/[id].
 *  Meldungen (?ok= / ?fehler=) der Aktionen gehen beim Umleiten mit. */
export default async function KundenAgenten({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const sp = await searchParams;
  const q = new URLSearchParams({ tab: "agenten" });
  for (const k of ["ok", "fehler"] as const) if (typeof sp[k] === "string") q.set(k, (sp[k] as string).slice(0, 160));
  redirect(`/dashboard/kunden?${q.toString()}`);
}

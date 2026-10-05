import { redirect } from "next/navigation";
import { requireOwner } from "../actions";

type SP = Promise<Record<string, string | string[] | undefined>>;

/** Organigramm ist seit der JARVIS-Zentrale (05.10.2026) die Startseite: Bereiche als Chips mit Seitenfenster. */
export default async function Firma({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const sp = await searchParams;
  const b = typeof sp.b === "string" && /^[a-z][a-z_]{1,30}$/.test(sp.b) ? sp.b : "strategie";
  redirect(`/dashboard/jarvis?bereich=${b}`);
}

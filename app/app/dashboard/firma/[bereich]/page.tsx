import { redirect } from "next/navigation";
import { requireOwner } from "../../actions";

type P = Promise<{ bereich: string }>;

/** Office eines Bereichs: Seitenfenster der Zentrale (?bereich=…), Details im Büro (/dashboard/buero/bereich/[slug]). */
export default async function FirmaBereich({ params }: { params: P }) {
  await requireOwner();
  const { bereich } = await params;
  redirect(/^[a-z][a-z_]{1,30}$/.test(bereich) ? `/dashboard/jarvis?bereich=${bereich}` : "/dashboard/jarvis");
}

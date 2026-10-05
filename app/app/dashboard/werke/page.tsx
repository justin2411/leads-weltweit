import { redirect } from "next/navigation";
import { requireOwner } from "../actions";

/** Werke stehen seit der JARVIS-Zentrale (05.10.2026) immer sichtbar auf der Startseite; Details im Büro (/dashboard/buero/werke). */
export default async function Werke() {
  await requireOwner();
  redirect("/dashboard/jarvis?s=lead#werke");
}

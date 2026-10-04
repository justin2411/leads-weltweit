import { redirect } from "next/navigation";

/** /finder ohne Land: US (Länder-Umschalter auf der Seite). */
export default function FinderIndex() {
  redirect("/finder/us");
}

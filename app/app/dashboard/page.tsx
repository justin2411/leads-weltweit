import { redirect } from "next/navigation";

// Inhaber 04.10.2026: „nimm bitte die alte ansicht überall raus“ – die frühere Übersicht ist durch JARVIS ersetzt.
export default function Dashboard() {
  redirect("/dashboard/jarvis");
}

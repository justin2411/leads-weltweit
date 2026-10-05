import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CONFIG, loadAgentTasks } from "@/lib/dashboard-data";
import { loadZentrale } from "@/lib/zentrale-data";
import { rechtLaender } from "@/lib/zentrale-modell";
import { agentStartLabel } from "@/lib/agents";
import { requireOwner } from "../actions";
import { AgentDrawer } from "./agents";
import { loadStartChat } from "./chat/start";
import { KOPF_CSS } from "./kopf";
import { Zentrale } from "./zentrale";

export const metadata = { title: "JARVIS" };
export const dynamic = "force-dynamic";
type SP = Promise<Record<string, string | string[] | undefined>>;

/**
 * JARVIS-Zentrale „Organigramm live“ (Inhaber 04.10.2026: „ich will das neue system ganz einfach visuell verstehen …
 * wenig text … große einfache grafiken mit animationen … immer live“). Server: Startdaten aus loadZentrale (eine
 * Lese-Funktion schnell + Zwischenspeicher langsam), danach aktualisiert der Browser selbst (GET /api/jarvis/zentrale).
 * Aufbau und Bedeutung der Bewegungen: docs/JARVIS.md „Zentrale“. ?teil=mehr (frühere Details) → Büro.
 */
export default async function Jarvis({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const sp = await searchParams;
  if (sp.teil === "mehr") redirect("/dashboard/buero");
  // Agenten-Fenster: ?a=1…9 oder ?a=neu (Auftrag erteilen, Vorbelegung k/m/b)
  const ag = typeof sp.a === "string" && /^([1-9]|neu)$/.test(sp.a) ? sp.a : null;
  const [initial, chat, tasks] = await Promise.all([
    loadZentrale("alle"),
    loadStartChat().catch(() => null),
    ag ? loadAgentTasks() : Promise.resolve([]),
  ]);
  // Leitplanke „Kaltmail-Recht“: alle Länder aus countries.yaml / ops-config.json (frei = allowed: true)
  const recht = rechtLaender(CONFIG.countries);
  const agentDrawer = ag ? <AgentDrawer which={ag} tasks={tasks} pre={{ k: sp.k, m: sp.m, b: sp.b, r: sp.r }} startAt={agentStartLabel(new Date())} /> : null;
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: KOPF_CSS }} />
      <Suspense><Zentrale initial={initial} recht={recht} agentDrawer={agentDrawer} chatNeu={chat?.gehirnUnread ?? 0} /></Suspense>
    </>
  );
}

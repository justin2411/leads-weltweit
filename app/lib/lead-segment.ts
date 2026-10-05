/**
 * Lead-Bestand je Käufer-Zielgruppe – Spiegel von scripts/lib/leadsegment.py (Test prüft Gleichheit).
 * Marketing-/SEO-Agenturen (S12) bekommen dieselben Firmen wie Webagenturen (S2): keine oder schwache Website.
 * Exklusiv bleibt es über den Lead-Status (new -> sample/reserved/delivered): jeder Lead geht an genau einen Käufer.
 */
export const LEAD_SEGMENT: Record<string, string> = { S12: "S2" };

/** Zielgruppe, deren Leads diese Käufer-Zielgruppe bekommt (S12 -> S2, sonst unverändert). */
export function leadSegment(seg: string): string {
  return LEAD_SEGMENT[seg] ?? seg;
}

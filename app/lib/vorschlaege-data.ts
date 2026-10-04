import "server-only";
import { db } from "@/lib/supabase";
import { doneRecently, openProposals, type DecisionRow, type Proposal } from "@/lib/vorschlaege";

/**
 * Vorschläge für die JARVIS-Startseite (signalwerk.decisions): offene „Vorschlag: …“ und in 7 Tagen selbst
 * „umgesetzt: …“. select("*") – so kommen kurz_titel/kurz_grund mit, sobald es die Spalten gibt (sonst Kürzung in
 * lib/vorschlaege.ts). Fehler → null (Karte zeigt dann nichts statt falscher Leere).
 */
export async function loadProposals(now = new Date()): Promise<{ open: Proposal[]; done: Proposal[] } | null> {
  try {
    const since = new Date(now.getTime() - 7 * 86_400_000).toISOString();
    const [p, d] = await Promise.all([
      db().from("decisions").select("*").eq("status", "proposed").ilike("subject", "vorschlag:%").order("created_at", { ascending: false }).limit(10)
        .abortSignal(AbortSignal.timeout(4000)),
      db().from("decisions").select("*").eq("status", "done").ilike("subject", "umgesetzt:%").gte("created_at", since).order("created_at", { ascending: false }).limit(10)
        .abortSignal(AbortSignal.timeout(4000)),
    ]);
    if (p.error || d.error) throw new Error((p.error ?? d.error)!.message);
    return { open: openProposals((p.data ?? []) as DecisionRow[]), done: doneRecently((d.data ?? []) as DecisionRow[], now) };
  } catch {
    return null;
  }
}

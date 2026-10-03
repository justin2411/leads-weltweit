/**
 * Agenten (Inhaber 03.10.2026: „einzelne agenten nutzen … ich beauftrage agent 1 neue leads zu holen für den markt“).
 * Reine Funktionen: Arten, Märkte, Prüfung eines Auftrags. Ausgeführt werden Aufträge von der stündlichen
 * Claude-Sitzung „Agenten“ (docs/AGENTEN.md) – immer innerhalb von CLAUDE.md (kein Versand, keine Kosten,
 * keine Regeln aufweichen).
 */
export const AGENT_COUNT = 4;
export const KINDS = {
  leads: { label: "Leads holen", icon: "⛏", hint: "mehr Leads für einen Markt" },
  kaeufer: { label: "Käufer finden", icon: "◎", hint: "mehr mail-fähige Webagenturen" },
  quelle: { label: "Neue Quelle", icon: "✦", hint: "neue kostenlose Quelle suchen und testen" },
  pruefen: { label: "Prüfen", icon: "✓", hint: "Stichprobe/Qualität kontrollieren" },
  frage: { label: "Frage", icon: "?", hint: "Auswertung oder Antwort" },
} as const;
export type Kind = keyof typeof KINDS;
export const MARKETS = ["US", "UK", "FR", "IE", "NL", "BE", "SE"] as const;

export type AgentTask = {
  id: string; created_at: string; agent: number; kind: Kind; market: string | null; brief: string;
  status: "offen" | "laeuft" | "fertig" | "fehler" | "abgebrochen"; progress: number; step: string | null; result: string | null;
  numbers: Record<string, number>; started_at: string | null; finished_at: string | null;
};

export class TaskError extends Error {}

/** Auftrag aus dem Formular prüfen: Agent 1–4, bekannte Art, Markt optional aus der Liste, Text 3–1000 Zeichen. */
export function validateTask(f: { agent?: unknown; kind?: unknown; market?: unknown; brief?: unknown }) {
  const agent = Number(f.agent);
  if (!Number.isInteger(agent) || agent < 1 || agent > AGENT_COUNT) throw new TaskError("Agent wählen");
  const kind = String(f.kind ?? "") as Kind;
  if (!(kind in KINDS)) throw new TaskError("Art wählen");
  const m = String(f.market ?? "").trim().toUpperCase();
  const market = m === "" || m === "ALLE" ? null : m;
  if (market && !(MARKETS as readonly string[]).includes(market)) throw new TaskError("Markt unbekannt");
  const brief = String(f.brief ?? "").trim().replace(/\s+/g, " ") || `${KINDS[kind].label}${market ? ` ${market}` : ""}`;
  if (brief.length < 3 || brief.length > 1000) throw new TaskError("Auftrag: 3–1000 Zeichen");
  return { agent, kind, market, brief };
}

/** Aktueller Zustand je Agent: laufender Auftrag, sonst nächster offener, sonst zuletzt fertiger. */
export function agentBoard(tasks: AgentTask[]) {
  return Array.from({ length: AGENT_COUNT }, (_, i) => {
    const mine = tasks.filter((t) => t.agent === i + 1);
    const run = mine.find((t) => t.status === "laeuft");
    const open = mine.filter((t) => t.status === "offen").sort((a, b) => (a.created_at < b.created_at ? -1 : 1));
    const done = mine.filter((t) => t.status === "fertig" || t.status === "fehler").sort((a, b) => ((a.finished_at ?? "") < (b.finished_at ?? "") ? 1 : -1));
    return { n: i + 1, current: run ?? open[0] ?? done[0] ?? null, queued: open.length - (run ? 0 : open.length ? 1 : 0), done: done.length };
  });
}

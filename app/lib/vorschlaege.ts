/**
 * Vorschläge mit Haken/Kreuz (Inhaber 04.10.2026: „im system sehen und dort die verbesserungsvorschläge mit haken
 * annehmen oder kreuz ablehnen“). Reines Modul (testbar): Zeilen aus signalwerk.decisions → kurze Karten.
 * Vorschlag = status 'proposed', subject beginnt mit „Vorschlag:“; „JARVIS hat umgesetzt“ = status 'done', subject
 * beginnt mit „umgesetzt:“ (letzte 7 Tage). Kurztexte (Inhaber: „wenig Text überall“): decisions.kurz_titel /
 * kurz_grund, wenn vorhanden, sonst hier gekürzt (Titel ≤ 60 Zeichen, Grund = 1 Satz). Volltext nur hinter „Details“.
 */
export type DecisionRow = {
  id: number | string; type?: string; subject: string; reasoning?: string | null; metrics?: unknown; status: string; created_at: string;
  kurz_titel?: string | null; kurz_grund?: string | null;
};
export type Proposal = { id: number; title: string; reason: string; full: string; numbers: [string, string][]; at: string };

export const TITLE_MAX = 60;
export const REASON_MAX = 160;
export const PROPOSAL_PREFIX = /^\s*vorschlag\s*:\s*/i;
export const DONE_PREFIX = /^\s*umgesetzt\s*:\s*/i;

/** Wortgrenze kürzen mit „…“. */
function cut(t: string, max: number): string {
  const s = t.replace(/\s+/g, " ").trim();
  if (s.length <= max) return s;
  const c = s.slice(0, max - 1);
  const sp = c.lastIndexOf(" ");
  return `${(sp > max * 0.5 ? c.slice(0, sp) : c).replace(/[\s,.;:–-]+$/, "")}…`;
}

/** Titel ohne „Vorschlag:“/„umgesetzt:“, höchstens 60 Zeichen. */
export function kurzTitel(subject: unknown): string {
  return cut(String(subject ?? "").replace(PROPOSAL_PREFIX, "").replace(DONE_PREFIX, ""), TITLE_MAX) || "Vorschlag";
}

/** Erster Satz der Begründung, höchstens 140 Zeichen. */
export function kurzGrund(reasoning: unknown): string {
  const s = String(reasoning ?? "").replace(/\s+/g, " ").trim();
  const m = /^(.+?[.!?])(\s|$)/.exec(s);
  return cut(m ? m[1] : s, REASON_MAX);
}

const str = (x: unknown) => (typeof x === "string" && x.trim() ? x.trim() : null);

/** Kennzahlen (metrics) als kurze Paare, höchstens 6, nur Zahlen/kurze Texte. */
export function numbersOf(metrics: unknown): [string, string][] {
  if (!metrics || typeof metrics !== "object" || Array.isArray(metrics)) return [];
  const out: [string, string][] = [];
  for (const [k, v] of Object.entries(metrics as Record<string, unknown>)) {
    if (typeof v === "number" && Number.isFinite(v)) out.push([k.slice(0, 30), String(Math.round(v * 100) / 100).replace(".", ",")]);
    else if (typeof v === "string" && v.length <= 30) out.push([k.slice(0, 30), v]);
    if (out.length >= 6) break;
  }
  return out;
}

export function toProposal(r: DecisionRow): Proposal {
  return {
    id: Number(r.id),
    title: kurzTitel(str(r.kurz_titel) ?? r.subject), // Kurzspalte kann „Vorschlag:“ noch enthalten (Trigger aus subject)
    reason: cut(str(r.kurz_grund) ?? kurzGrund(r.reasoning), REASON_MAX),
    full: String(r.reasoning ?? "").trim(),
    numbers: numbersOf(r.metrics),
    at: r.created_at,
  };
}

/** Offene Vorschläge (neueste zuerst, höchstens n). */
export function openProposals(rows: DecisionRow[], n = 5): Proposal[] {
  return rows.filter((r) => r.status === "proposed" && PROPOSAL_PREFIX.test(r.subject ?? ""))
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, n).map(toProposal);
}

/** Von JARVIS selbst umgesetzt in den letzten 7 Tagen (neueste zuerst, höchstens n). */
export function doneRecently(rows: DecisionRow[], now: Date, n = 5): Proposal[] {
  const since = now.getTime() - 7 * 86_400_000;
  return rows.filter((r) => r.status === "done" && DONE_PREFIX.test(r.subject ?? "") && Date.parse(r.created_at) >= since)
    .sort((a, b) => (a.created_at < b.created_at ? 1 : -1)).slice(0, n).map(toProposal);
}

/** Auftragstext für „Haken“: „Vorschlag umsetzen: …“ (3–1000 Zeichen, für validateTask). */
export function acceptBrief(r: Pick<DecisionRow, "id" | "subject" | "reasoning">): string {
  const t = `Vorschlag umsetzen: ${kurzTitel(r.subject)} (decisions #${r.id}). ${String(r.reasoning ?? "").replace(/\s+/g, " ").trim()}`;
  return t.length > 1000 ? `${t.slice(0, 996)} …` : t;
}

/** Optionaler Grund beim Ablehnen: eine Zeile, höchstens 300 Zeichen. */
export function rejectReason(x: unknown): string | null {
  const s = String(x ?? "").replace(/\s+/g, " ").trim();
  return s ? s.slice(0, 300) : null;
}

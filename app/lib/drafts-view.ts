/**
 * Entwürfe im Versand-Dashboard (Inhaber 05.10.2026: „das sieht ganz verbuggt aus“): Standardansicht nur Fokus-Tests
 * (config/fokus.yaml `tests`, heute S2 × US/UK/FR), alles andere unter „andere (ruhen)“. Nur Anzeige – Status,
 * Prüfregeln und Freigabe bleiben unverändert. Reine Funktionen.
 */
import { testAllowed, type TestScope } from "./test-scope.ts";

export type DraftLike = { created_at?: string | null; prospects?: { country?: string | null } | null; experiments?: { segment_id?: string | null } | null };

/** Gehört der Entwurf zu einem Fokus-Test (Segment × Land der Freigabe-Liste)? Ohne Segment/Land: nein. */
export const draftInFocus = (scope: TestScope, m: DraftLike) => testAllowed(scope, m.experiments?.segment_id, m.prospects?.country);

/** Ab diesem Alter gilt ein offener Entwurf als alt (wie der Proben-Vorrat: 48 h). */
export const DRAFT_OLD_HOURS = 48;

/** „alt · 4 T“ für Entwürfe über 48 h, sonst null. */
export function draftAge(createdAt: string | null | undefined, now: Date): string | null {
  const t = Date.parse(String(createdAt ?? ""));
  if (Number.isNaN(t)) return null;
  const h = (now.getTime() - t) / 3_600_000;
  if (h <= DRAFT_OLD_HOURS) return null;
  return `alt · ${Math.floor(h / 24)} T`;
}

/** Prüfgründe kurz: Präfixe wie „zurückgestellt:“ bleiben, Mehrfaches wird zusammengefasst. */
export function checkReasons(errors: unknown): string[] {
  const list = Array.isArray(errors) ? errors : errors ? [errors] : [];
  return [...new Set(list.map((e) => String(e ?? "").trim()).filter(Boolean))];
}

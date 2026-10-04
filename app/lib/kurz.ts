/**
 * Kurze Titel und Begründungen für die Anzeige (Inhaber 04.10.2026: „ich will einen klaren titel und dann eine kurze
 * knappe und saubere begründung … in möglichst wenigen worten … immer wenig text überall“).
 * Vorrang haben die Spalten decisions.kurz_titel / kurz_grund (beim Schreiben gesetzt, lib/kurz-schreiben.ts bzw.
 * Datenbank-Trigger); fehlen sie (alte Zeilen), kürzt dieselbe Regel den Volltext – keine zweite Regel-Variante.
 * Anzeige: Titel ≤ 60 Zeichen (1 Zeile), Grund ≤ 140 Zeichen (max. 2 Zeilen).
 */
import { TITEL_MAX, kuerzen, kurzGrundText, kurzTitelText } from "./kurz-schreiben.ts";

export { TITEL_MAX };
export const GRUND_MAX = 140;

/** Klarer Titel, höchstens 60 (bzw. max) Zeichen (ohne „Sitzung …:“/„Vorschlag:“, Uhrzeiten, Klammern mit Zahlen). */
export const kurzTitel = (subject: string | null | undefined, max = TITEL_MAX): string => kuerzen(kurzTitelText(subject ?? ""), max);

/** Kurze Begründung, höchstens 140 Zeichen: erster Satz ohne Klammer-Zahlenkaskaden, an Wortgrenze gekürzt. */
export const kurzGrund = (reasoning: string | null | undefined, max = GRUND_MAX): string => kuerzen(kurzGrundText(reasoning ?? ""), max);

type Kurzbar = { subject: string; reasoning?: string | null; action?: string | null; kurz_titel?: string | null; kurz_grund?: string | null };
const glatt = (t: unknown) => String(t ?? "").replace(/\s+/g, " ").trim();

/** Titel einer Entscheidung: Spalte kurz_titel, sonst gekürzter Betreff. */
export const titelVon = (d: Kurzbar) => (glatt(d.kurz_titel) ? kuerzen(d.kurz_titel, TITEL_MAX) : kurzTitel(d.subject));
/** Grund einer Entscheidung: Spalte kurz_grund, sonst gekürzte Begründung. */
export const grundVon = (d: Kurzbar) => (glatt(d.kurz_grund) ? kuerzen(d.kurz_grund, GRUND_MAX) : kurzGrund(d.reasoning));
/** Gibt es mehr als Titel + Grund zu lesen? (dann klein „Details“ zeigen) */
export const hatMehr = (d: Kurzbar) => !!glatt(d.action) || glatt(d.subject) !== titelVon(d) || glatt(d.reasoning) !== grundVon(d);

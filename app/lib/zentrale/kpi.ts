/**
 * Kennzahl einer Abteilung (Kommandozentrale, Inhaber 04.10.2026): JARVIS zeigt je Abteilung (Finanzen, Vertrieb,
 * Ziele) eine Kachel und verlinkt die Seite. Farben nur aus ampel.ts. Titel ≤ 60, Grund ≤ 160 Zeichen.
 */
import type { Ampel } from "../ampel.ts";

export type Trend = "hoch" | "runter" | "gleich" | null;
export type AbteilungKpi = { titel: string; wert: string; ampel: Ampel; trend: Trend; grund: string; href: string };

/** Rückfall, wenn die Daten nicht lesbar sind (grau, keine erfundenen Zahlen). */
export const unlesbar = (titel: string, href: string): AbteilungKpi => ({ titel, wert: "–", ampel: "grey", trend: null, grund: "Gerade nicht lesbar.", href });

export const TITEL_MAX = 60, GRUND_MAX = 160;

export const kurzZahl = (n: number, max = 1): string =>
  (Number.isFinite(n) ? n : 0).toLocaleString("de-DE", { maximumFractionDigits: max });

export const prozent = (q: number | null, max = 1): string => (q === null || !Number.isFinite(q) ? "–" : `${kurzZahl(q * 100, max)} %`);

export const trendVon = (jetzt: number, vorher: number | null): Trend =>
  vorher === null ? null : jetzt > vorher ? "hoch" : jetzt < vorher ? "runter" : "gleich";

export const kuerze = (t: string, max: number): string => (t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`);

/** Kennzahl mit garantierten Längen (Titel ≤ 60, Grund ≤ 160). */
export const abteilung = (k: AbteilungKpi): AbteilungKpi => ({ ...k, titel: kuerze(k.titel, TITEL_MAX), grund: kuerze(k.grund, GRUND_MAX) });

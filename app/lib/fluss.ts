/**
 * Fluss-Karte (Inhaber 03.10.2026: „besser strukturieren … informiert werden, einstellen und überprüfen … wenig text,
 * grafiken die anklickbar sind … sehen was läuft und was wohin läuft“). Reine Funktionen: Stationen, Leitungen,
 * Positionen für Desktop (quer) und Handy (hoch). Werte kommen immer aus echten Zählungen.
 */
import type { IconName } from "../app/icons";

export type StationId = "lead" | "gate" | "bestand" | "proben" | "kwerk" | "kaeufer" | "versand" | "antworten" | "kunden";
export type StationState = "live" | "idle" | "off" | "bad";
export type Station = { id: StationId; label: string; icon: IconName; value: string; unit?: string; sub: string; state: StationState; neck?: boolean; tip: string };
export type Edge = { from: StationId; to: StationId; perHour: number; label: string };

export const ORDER: StationId[] = ["lead", "gate", "bestand", "proben", "kwerk", "kaeufer", "versand", "antworten", "kunden"];

/** Positionen in Prozent der Kartenfläche (x, y). Oben die Ware (Leads), unten die Käufer, rechts treffen sie sich. */
export const POS: Record<"wide" | "tall", Record<StationId, [number, number]>> = {
  wide: {
    lead: [8, 26], gate: [27, 26], bestand: [46, 26], proben: [65, 26],
    kwerk: [8, 76], kaeufer: [27, 76], versand: [46, 76], antworten: [65, 76], kunden: [89, 51],
  },
  tall: {
    lead: [25, 7], gate: [25, 26], bestand: [25, 45], proben: [25, 64],
    kwerk: [75, 7], kaeufer: [75, 26], versand: [75, 45], antworten: [75, 64], kunden: [50, 89],
  },
};
/** Seitenverhältnis der Karte (Breite / Höhe) je Layout – SVG-Leitungen und Stationen liegen auf derselben Fläche. */
export const ASPECT = { wide: 1200 / 470, tall: 400 / 820 };

/** Leitung als SVG-Pfad (Koordinaten in viewBox-Einheiten). Geknickte Leitungen laufen weich um die Ecke. */
export function edgePath(layout: "wide" | "tall", from: StationId, to: StationId): string {
  const W = layout === "wide" ? 1200 : 400, H = layout === "wide" ? 470 : 820;
  const [x1, y1] = POS[layout][from].map((v, i) => (v / 100) * (i ? H : W));
  const [x2, y2] = POS[layout][to].map((v, i) => (v / 100) * (i ? H : W));
  if (Math.abs(y1 - y2) < 1 || Math.abs(x1 - x2) < 1) return `M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}`;
  if (layout === "wide") { const mx = (x1 + x2) / 2; return `M${x1.toFixed(1)} ${y1.toFixed(1)}C${mx.toFixed(1)} ${y1.toFixed(1)} ${mx.toFixed(1)} ${y2.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`; }
  const my = (y1 + y2) / 2;
  return `M${x1.toFixed(1)} ${y1.toFixed(1)}C${x1.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${my.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`;
}

/** Tempo der Punkte: mehr Durchsatz = schneller und dichter; 0 = keine Punkte (Leitung steht). */
export function flow(perHour: number): { dur: number; dots: number } | null {
  if (!perHour || perHour <= 0) return null;
  const dur = Math.max(1.6, Math.min(7, 7 / Math.log10(10 + perHour)));
  const dots = perHour >= 500 ? 4 : perHour >= 50 ? 3 : perHour >= 5 ? 2 : 1;
  return { dur, dots };
}

/** Engpass-Stufe aus chain() (dashboard-logic) auf die Station der Karte. */
export const NECK_TO_STATION: Record<string, StationId> = {
  leads: "bestand", kaeufer: "kaeufer", mails: "versand", antworten: "antworten", proben: "proben", kunden: "kunden", umsatz: "kunden",
};

export type TickerItem = { at: string; icon: IconName; text: string; tone: "cyan" | "gold" | "green" | "red" | "grey"; href?: string };

/** Live-Ticker: Ereignisse verschiedener Quellen, neueste zuerst, höchstens n. */
export function ticker(items: TickerItem[], n = 14): TickerItem[] {
  return [...items].filter((x) => x.at).sort((a, b) => (a.at < b.at ? 1 : -1)).slice(0, n);
}

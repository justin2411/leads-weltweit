/**
 * Fluss-Karte (Inhaber 03.10.2026: „besser strukturieren … informiert werden, einstellen und überprüfen … wenig text,
 * grafiken die anklickbar sind … sehen was läuft und was wohin läuft“). Reine Funktionen: Stationen, Leitungen,
 * Positionen für Desktop (quer) und Handy (hoch). Werte kommen immer aus echten Zählungen.
 */
import type { IconName } from "../app/icons";
import type { WebStationId } from "./website-stats";
import type { Spark } from "./spark";

export type StationId = "lead" | "gate" | "bestand" | "proben" | "kwerk" | "kaeufer" | "versand" | "antworten" | "kunden"
  // Linie „Website“ (Inhaber 04.10.2026: „genau die websiten namen“): Startseite → Landingpage → Tarif → Stripe → Danke → Kunden;
  // Klick öffnet die Auswertung. Stationen und Werte: webLine() in lib/website-stats.ts
  | WebStationId;
export type StationState = "live" | "idle" | "off" | "bad";
export type Station = { id: StationId; label: string; icon: IconName; value: string; unit?: string; sub: string; state: StationState; neck?: boolean; tip: string;
  /** Werk mit Plätzen: Autopilot an/aus (Abzeichen unten rechts am Kreis); undefined = kein Abzeichen */
  auto?: boolean;
  /** festes Zustands-Abzeichen unten rechts (Versand: „24/7“ grün = an, „aus“ rot); kein Schalter */
  badge?: { text: string; on: boolean; tip: string };
  /** 7-Tage-Linie und Trend „7 T vs. Vor-7 T“ (JARVIS-Plan W1-3, lib/spark.ts); fehlt = nur der Wert */
  spark?: Spark };
export type Edge = { from: StationId; to: StationId; perHour: number; label: string };

export const ORDER: StationId[] = ["lead", "gate", "bestand", "proben", "kwerk", "kaeufer", "versand", "antworten", "wstart", "wland", "wtarif", "wstripe", "wdanke", "kunden"];
/** Stationen der Linie „Website“ – öffnen /dashboard/website/auswertung statt eines Seitenfensters. */
export const WEB_STATIONS: StationId[] = ["wstart", "wland", "wtarif", "wstripe", "wdanke"];

/**
 * Positionen in Prozent der Kartenfläche (x, y). Oben die Ware (Leads), in der Mitte die Käufer, unten die Website;
 * rechts (am Handy unten) treffen sich alle bei den Kunden.
 */
export const POS: Record<"wide" | "tall", Record<StationId, [number, number]>> = {
  wide: {
    lead: [8, 16], gate: [27, 16], bestand: [46, 16], proben: [65, 16],
    kwerk: [8, 50], kaeufer: [27, 50], versand: [46, 50], antworten: [65, 50], kunden: [89, 50],
    // fünf Website-Stationen auf derselben Strecke wie die vier oben (8 … 70 %)
    wstart: [8, 84], wland: [23.5, 84], wtarif: [39, 84], wstripe: [54.5, 84], wdanke: [70, 84],
  },
  tall: {
    lead: [17, 7], gate: [17, 26], bestand: [17, 45], proben: [17, 64],
    kwerk: [50, 7], kaeufer: [50, 26], versand: [50, 45], antworten: [50, 64], kunden: [50, 89],
    wstart: [83, 6], wland: [83, 20.5], wtarif: [83, 35], wstripe: [83, 49.5], wdanke: [83, 64],
  },
};
/** Größe der Zeichenfläche (viewBox) je Layout. */
export const VIEW = { wide: [1200, 640], tall: [400, 820] } as const;
/** Seitenverhältnis der Karte (Breite / Höhe) je Layout – SVG-Leitungen und Stationen liegen auf derselben Fläche. */
export const ASPECT = { wide: VIEW.wide[0] / VIEW.wide[1], tall: VIEW.tall[0] / VIEW.tall[1] };

/** Leitung als SVG-Pfad (Koordinaten in viewBox-Einheiten). Geknickte Leitungen laufen weich um die Ecke. */
export function edgePath(layout: "wide" | "tall", from: StationId, to: StationId): string {
  const [W, H] = VIEW[layout];
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

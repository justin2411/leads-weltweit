/**
 * Status-Kopf der JARVIS-Startseite (Inhaber 04.10.2026: „ich will aus 5 metern sehen ob was läuft“): fünf Kernströme
 * (Leads, Käufer, Versand, Antworten, Umsatz) je mit großem Ring und einer Zahl. Grün pulsiert = läuft, gelb = langsam,
 * rot = steht, grau = keine Basis. Reine Funktionen; fehlende Zahl → „–“ und grau, nie erfunden.
 */
import type { Ampel } from "./ampel.ts";

export type StromKey = "leads" | "kaeufer" | "versand" | "antworten" | "umsatz";
export type Strom = { key: StromKey; label: string; icon: string; wert: string; unter: string; ampel: Ampel; href: string; tip: string };
/** Zustand einer Station der Fluss-Karte (lib/fluss.ts). */
export type StationState = "live" | "idle" | "bad" | "off";

export const PULS_TEXT: Record<Ampel, string> = { green: "läuft", gold: "langsam", red: "steht", grey: "keine Basis" };

/** Station → Ampel: läuft = grün, still = gelb, Fehler oder ausgeschaltet = rot. */
export function stromAmpel(s: StationState | null | undefined): Ampel {
  return s === "live" ? "green" : s === "idle" ? "gold" : s === "bad" || s === "off" ? "red" : "grey";
}

const z = (n: number | null) => (n === null || !Number.isFinite(n) ? "–" : n.toLocaleString("de-DE", { maximumFractionDigits: 0 }));

export function stroeme(x: {
  leads24: number | null; leadState: StationState | null;
  kaeufer24: number | null; kaeuferState: StationState | null;
  sentToday: number | null; cap: number | null; versandState: StationState | null; versandAus: string | null;
  replies7: number | null; offen: number | null; antwortState: StationState | null;
  umsatz: string | null; kunden: number | null;
}): Strom[] {
  const s = (key: StromKey, label: string, icon: string, wert: string, unter: string, ampel: Ampel, href: string, tip: string): Strom =>
    ({ key, label, icon, wert, unter, ampel: wert === "–" ? "grey" : ampel, href, tip: `${label}: ${tip} · ${PULS_TEXT[wert === "–" ? "grey" : ampel]}` });
  const offen = x.offen ?? 0;
  return [
    s("leads", "Leads", "lead-werk", z(x.leads24), "neu 24 h", stromAmpel(x.leadState), "/dashboard/jarvis?s=lead#agenten", "neue grüne Leads in 24 h"),
    s("kaeufer", "Käufer", "kaeufer", z(x.kaeufer24), "neu 24 h", stromAmpel(x.kaeuferState), "/dashboard/jarvis?s=kwerk#agenten", "neue mail-fähige Käufer in 24 h"),
    s("versand", "Versand", "versand", z(x.sentToday), x.versandAus ? `aus · ${x.versandAus}` : `heute${x.cap ? ` / ${z(x.cap)}` : ""}`,
      x.versandAus ? "red" : stromAmpel(x.versandState), "/dashboard/versand", "Mails heute"),
    s("antworten", "Antworten", "antworten", offen > 0 ? z(offen) : z(x.replies7), offen > 0 ? "offen" : "7 Tage",
      offen > 0 ? "gold" : x.antwortState === "bad" || x.antwortState === "off" ? "red" : x.replies7 ? "green" : stromAmpel(x.antwortState),
      "/dashboard/antworten", offen > 0 ? "warten auf dich" : "echte Antworten in 7 Tagen"),
    s("umsatz", "Umsatz", "trend-hoch", x.umsatz ?? "–", x.kunden === null ? "pro Monat" : `${z(x.kunden)} Kunden`,
      x.kunden ? "green" : "grey", "/dashboard/finanzen", "netto pro Monat aus Abos"),
  ];
}

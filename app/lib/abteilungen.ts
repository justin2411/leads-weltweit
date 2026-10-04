/**
 * Abteilungs-Übersicht auf /dashboard/jarvis (Inhaber 04.10.2026: „welche Unterseite bzw sektionen noch sinn machen
 * damit jarvis eine komplette kommandozentrale hat und wie in einem unternehmen alles steuern und regeln kann“).
 * Je Abteilung eine Kachel: Icon, Name, eine echte Kennzahl mit Ampel (lib/ampel.ts) und Link zur Unterseite.
 * Reine Funktionen; fehlende Daten (null) → „–“ und grau, nie erfundene Zahlen.
 */
import type { Ampel } from "./ampel.ts";

export type AbteilungKey = "finanzen" | "vertrieb" | "ziele" | "recht" | "betrieb" | "protokoll" | "team" | "gehirn" | "produktion" | "marketing" | "antworten";
export type Kachel = { key: AbteilungKey; name: string; icon: string; wert: string; ampel: Ampel; href: string; tip: string };
/** Kennzahl einer Abteilung, wie sie zentrale/kpi()-Funktionen liefern (null = nicht lesbar). */
export type Kz = { wert: string; ampel: Ampel; grund?: string } | null;

export const ABTEILUNGEN: { key: AbteilungKey; name: string; icon: string; href: string; info: string }[] = [
  { key: "finanzen", name: "Finanzen", icon: "trend-hoch", href: "/dashboard/finanzen", info: "Umsatz pro Monat aus Abos" },
  { key: "vertrieb", name: "Vertrieb", icon: "versand", href: "/dashboard/vertrieb", info: "Trichter Mail → Kunde" },
  { key: "ziele", name: "Ziele", icon: "top", href: "/dashboard/ziele", info: "Soll gegen Ist" },
  { key: "produktion", name: "Produktion", icon: "lead-werk", href: "/dashboard/werke", info: "grüne Leads in 24 h · Werke und Speicher" },
  { key: "marketing", name: "Marketing", icon: "website", href: "/dashboard/website/auswertung", info: "Website-Besucher in 24 h" },
  { key: "antworten", name: "Antworten", icon: "antworten", href: "/dashboard/antworten", info: "offene Antworten im Cockpit" },
  { key: "team", name: "Team", icon: "agent", href: "/dashboard/jarvis#team", info: "Fach-Agenten im grünen Bereich" },
  { key: "gehirn", name: "Gehirn lernt", icon: "gehirn", href: "/dashboard/gehirn", info: "Gehirn-Score (0–100)" },
  { key: "recht", name: "Recht", icon: "recht", href: "/dashboard/recht", info: "Spam-Beschwerden 30 Tage · Abmeldung · Rechtstexte" },
  { key: "betrieb", name: "Betrieb", icon: "einstellungen", href: "/dashboard/betrieb", info: "Bausteine grün" },
  { key: "protokoll", name: "Protokoll", icon: "dokument", href: "/dashboard/protokoll", info: "Einträge in 24 h" },
];

const RANG: Record<Ampel, number> = { red: 3, gold: 2, green: 1, grey: 0 };
/** Schlechteste bewertete Ampel (grau nur, wenn nichts bewertet ist). */
export function schlechteste(a: Ampel[]): Ampel {
  return a.reduce<Ampel>((x, y) => (RANG[y] > RANG[x] ? y : x), "grey");
}

const zahl = (n: number) => n.toLocaleString("de-DE", { maximumFractionDigits: 0 });
const kurz = (t: string, max: number) => (t.length <= max ? t : `${t.slice(0, max - 1).trimEnd()}…`);

/** Kachel aus einer Kennzahl; null → „–“, grau, „gerade nicht lesbar“. */
export function kachel(key: AbteilungKey, k: Kz): Kachel {
  const a = ABTEILUNGEN.find((x) => x.key === key)!;
  const wert = k?.wert && k.wert.trim() ? k.wert : "–";
  const tip = k ? (k.grund ? `${a.info} · ${k.grund}` : a.info) : `${a.info} · gerade nicht lesbar`;
  return { key, name: a.name, icon: a.icon, href: a.href, wert: kurz(wert, 24), ampel: k && wert !== "–" ? k.ampel : "grey", tip: kurz(tip, 160) };
}

/** Team: Fach-Agenten mit Kennzahl; Wert „grün/bewertet“, Ampel = schlechteste. null = nicht lesbar. */
export function teamKz(cards: { kz: { ampel: Ampel } | null }[] | null | undefined): Kz {
  if (!cards) return null;
  const b = cards.map((c) => c.kz?.ampel ?? "grey").filter((x) => x !== "grey");
  if (!cards.length) return { wert: "0 Agenten", ampel: "grey" };
  if (!b.length) return { wert: `${cards.length} Agenten`, ampel: "grey", grund: "noch keine Kennzahlen" };
  return { wert: `${b.filter((x) => x === "green").length}/${b.length} grün`, ampel: schlechteste(b), grund: `${cards.length} Fach-Agenten` };
}

/** Gehirn: Score 0–100 mit Ampel aus gehirn-lernt (≥ 70 grün, ≥ 40 gelb). */
export function gehirnKz(g: { score: number | null; ampel: Ampel } | null | undefined): Kz {
  if (!g) return null;
  return g.score === null ? { wert: "–", ampel: "grey", grund: "noch keine Basis" } : { wert: `${Math.round(g.score)} Punkte`, ampel: g.ampel };
}

/**
 * Produktion: grüne Leads in 24 h (Lead-Werk). Ampel = schlechteste aus Werk-Zustand (Lead- und Kunden-Werk:
 * live grün, still gelb, Fehler rot, aus grau) und Speicher; ohne Bestandszahl „–“.
 */
export function produktionKz(x: { leads24: number | null; kaeufer24: number | null; werke: ("live" | "idle" | "bad" | "off")[]; speicher: Ampel }): Kz {
  if (x.leads24 === null) return null;
  const w: Ampel[] = x.werke.map((s) => (s === "live" ? "green" : s === "bad" ? "red" : s === "idle" ? "gold" : "grey"));
  const ampel = schlechteste([...w, x.speicher, x.leads24 > 0 ? "green" : "gold"]);
  return { wert: `${zahl(x.leads24)} Leads`, ampel, grund: `${x.kaeufer24 === null ? "–" : zahl(x.kaeufer24)} neue Käufer · Speicher ${{ green: "ok", gold: "knapp", red: "voll", grey: "unbekannt" }[x.speicher]}` };
}

/** Marketing: eindeutige Besucher (Startseite + Landingpages) in 24 h; Engpass im Website-Trichter = gelb. */
export function marketingKz(w: { start_24h?: number | null; land_24h?: number | null } | null | undefined, engpass: string | null): Kz {
  if (!w) return null;
  const n = Number(w.start_24h ?? 0) + Number(w.land_24h ?? 0);
  if (!Number.isFinite(n)) return null;
  return { wert: `${zahl(n)} Besucher`, ampel: engpass ? "gold" : n > 0 ? "green" : "grey", grund: engpass ? "Engpass im Website-Trichter" : undefined };
}

/** Antworten: offene im Cockpit (gelb, wenn welche warten), sonst grün mit Antworten der letzten 7 Tage. */
export function antwortenKz(offen: number | null, woche: { replies: number; positive: number } | null): Kz {
  if (offen === null) return null;
  if (offen > 0) return { wert: `${zahl(offen)} offen`, ampel: "gold", grund: "warten auf dich" };
  return { wert: "0 offen", ampel: woche && woche.replies ? "green" : "grey", grund: woche ? `${woche.replies} Antworten, ${woche.positive} positiv in 7 Tagen` : undefined };
}

/** Promise mit Zeitlimit und Fehlerschutz: Ausfall oder Zeitüberschreitung → null (Kachel zeigt „–“). */
export function sicher<T>(p: Promise<T> | (() => Promise<T>), ms = 6000): Promise<T | null> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const run = (async () => (typeof p === "function" ? p() : p))();
  return Promise.race([
    run.catch(() => null),
    new Promise<null>((r) => { timer = setTimeout(() => r(null), ms); }),
  ]).finally(() => clearTimeout(timer));
}

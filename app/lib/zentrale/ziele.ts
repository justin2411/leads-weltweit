/**
 * Abteilung Ziele (Kommandozentrale, Inhaber 04.10.2026): Unternehmensziele mit Soll/Ist/Fortschritt.
 * Soll steht in signalwerk.company_goals (Startwerte = Vorschlag, ändern nur der Inhaber über /dashboard/ziele);
 * Ist kommt aus echten Zahlen (app/lib/zentrale/data.ts). Gehirn und JARVIS lesen die Ziele (docs/JARVIS.md).
 * Ehrlich: fehlt ein Ist (nicht lesbar), bleibt das Ziel grau – keine Annahmen.
 */
import type { Ampel } from "../ampel.ts";
import { abteilung, kurzZahl, type AbteilungKpi } from "./kpi.ts";

export type Richtung = "hoch" | "runter";
export type Ziel = { key: string; titel: string; einheit: string; soll: number; richtung: Richtung; sort: number; quelle: "vorschlag" | "inhaber"; updated_at: string | null; updated_by: string | null };
export type ZielZeile = Ziel & { ist: number | null; fortschritt: number | null; ampel: Ampel; erreicht: boolean; hinweis: string };

/** Startwerte (gleich wie Migration 20261005040000) – falls die Tabelle fehlt oder leer ist. */
export const START: Ziel[] = [
  { key: "mrr", titel: "Umsatz pro Monat (MRR)", einheit: "£/$/€", soll: 1290, richtung: "hoch", sort: 10 },
  { key: "kunden", titel: "Zahlende Kunden", einheit: "", soll: 10, richtung: "hoch", sort: 20 },
  { key: "antwortquote", titel: "Antwortquote", einheit: "%", soll: 3, richtung: "hoch", sort: 30 },
  { key: "lead_fehler", titel: "Lead-Fehlerquote", einheit: "%", soll: 2, richtung: "runter", sort: 40 },
  { key: "gruen_uk", titel: "Grüne Leads/Woche UK", einheit: "", soll: 1000, richtung: "hoch", sort: 50 },
  { key: "gruen_fr", titel: "Grüne Leads/Woche FR", einheit: "", soll: 1000, richtung: "hoch", sort: 60 },
].map((z) => ({ ...z, richtung: z.richtung as Richtung, quelle: "vorschlag" as const, updated_at: null, updated_by: null }));

export const SOLL_MAX = 1_000_000_000;

export class ZielFehler extends Error {}

/** Eingabe des Inhabers prüfen: Zahl ≥ 0 (Komma erlaubt), Prozent ≤ 100. */
export function pruefeSoll(raw: unknown, einheit: string): number {
  const s = String(raw ?? "").trim().replace(/\s/g, "").replace(/\.(?=\d{3}(\D|$))/g, "").replace(",", ".");
  const n = Number(s);
  if (!s || !Number.isFinite(n) || n < 0) throw new ZielFehler("Soll muss eine Zahl ab 0 sein");
  if (einheit === "%" && n > 100) throw new ZielFehler("Prozent höchstens 100");
  if (n > SOLL_MAX) throw new ZielFehler("Soll zu groß");
  return Math.round(n * 100) / 100;
}

/** Fortschritt 0…1: hoch = Ist/Soll; runter = erreicht, solange Ist ≤ Soll, sonst Soll/Ist. */
export function fortschritt(z: Pick<Ziel, "soll" | "richtung">, ist: number | null): number | null {
  if (ist === null || !Number.isFinite(ist)) return null;
  if (z.richtung === "runter") return ist <= z.soll ? 1 : ist > 0 ? Math.max(0, z.soll / ist) : 1;
  if (z.soll <= 0) return 1;
  return Math.max(0, Math.min(1, ist / z.soll));
}

/** ≥ 100 % grün, ≥ 50 % gelb, sonst rot; ohne Ist grau. */
export function ampelZiel(p: number | null): Ampel {
  return p === null ? "grey" : p >= 1 ? "green" : p >= 0.5 ? "gold" : "red";
}

export const zahl = (n: number | null, einheit: string): string =>
  n === null ? "–" : `${kurzZahl(n, einheit === "%" ? 1 : 0)}${einheit === "%" ? " %" : einheit && einheit !== "" ? ` ${einheit}` : ""}`;

export function zeilen(ziele: Ziel[], ist: Record<string, number | null>, hinweise: Record<string, string> = {}): ZielZeile[] {
  return [...ziele].sort((a, b) => a.sort - b.sort || a.key.localeCompare(b.key)).map((z) => {
    // auf 4 Stellen runden: 1 − 0,98 ergibt sonst 2,0000000000000018 % und verfehlt „höchstens 2 %“
    const raw = z.key in ist ? ist[z.key] : null;
    const i = raw === null || !Number.isFinite(raw) ? null : Math.round(raw * 1e4) / 1e4;
    const p = fortschritt(z, i);
    return { ...z, ist: i, fortschritt: p, ampel: ampelZiel(p), erreicht: p === 1, hinweis: hinweise[z.key] ?? (i === null ? "nicht lesbar" : "") };
  });
}

/** Kennzahl für JARVIS: „2/6“ Ziele erreicht. Alle erreicht grün, mindestens die Hälfte gelb, sonst rot. */
export function kpi(z: ZielZeile[]): AbteilungKpi {
  const mess = z.filter((x) => x.ist !== null);
  const ok = mess.filter((x) => x.erreicht).length;
  const ampel: Ampel = !mess.length ? "grey" : ok === mess.length ? "green" : ok * 2 >= mess.length ? "gold" : "red";
  const weit = mess.filter((x) => !x.erreicht).sort((a, b) => (a.fortschritt ?? 0) - (b.fortschritt ?? 0))[0];
  const grund = !mess.length ? "Noch keine Ist-Werte lesbar."
    : weit ? `Am weitesten weg: ${weit.titel} (${zahl(weit.ist, weit.einheit)} von ${zahl(weit.soll, weit.einheit)}).` : "Alle Ziele erreicht.";
  return abteilung({ titel: "Ziele", wert: `${ok}/${z.length}`, ampel, trend: null, grund, href: "/dashboard/ziele" });
}

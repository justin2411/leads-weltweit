/**
 * Abteilung „Betrieb“ der Kommandozentrale (Inhaber 04.10.2026): Gesundheit von Workflows, Postfächern, Speicher,
 * Website und Datenfluss auf einen Blick. Reine Funktionen ohne Datenbank (testbar); Daten: ./betrieb-data.ts,
 * Seite: app/dashboard/betrieb. Schalter werden hier nur angezeigt – ändern nur im Regler.
 */
import type { Ampel } from "../ampel.ts";
import { nextCron, type BoxHealth, type BoxRow, type RunInfo } from "../dashboard-logic.ts";
import type { Still } from "../ueberblick.ts";
import type { Trend, ZKpi } from "./recht.ts";

export type { ZKpi, Trend };

const H = 3_600_000;
const RANG: Record<Ampel, number> = { red: 0, gold: 1, grey: 2, green: 3 };
/** Schlechteste Ampel (rot vor gelb vor grau vor grün). */
export function schlechteste(a: Ampel[]): Ampel {
  return a.length ? a.reduce((x, y) => (RANG[y] < RANG[x] ? y : x)) : "grey";
}

// ------------------------------------------------------------------------------------------------- Workflows
/** Größte Lücke zwischen zwei geplanten Läufen (Stunden) im Fenster der letzten 15 Tage; null ohne Zeitplan. */
export function maxLueckeH(crons: string[], now: Date): number | null {
  if (!crons.length) return null;
  const end = now.getTime(), start = end - 15 * 24 * H;
  // je Cron einzeln vorwärts (jede Minute höchstens einmal geprüft), dann zusammenführen
  const times: number[] = [];
  for (const c of crons) {
    let t = new Date(start);
    for (let i = 0; i < 3000; i++) {
      const n = nextCron(c, t);
      if (!n || n.getTime() > end) break;
      times.push(n.getTime());
      t = n;
    }
  }
  times.sort((a, b) => a - b);
  let gap = 0;
  for (let i = 1; i < times.length; i++) gap = Math.max(gap, times[i] - times[i - 1]);
  return gap ? gap / H : null;
}

export type WfZeile = { file: string; name: string; last: string | null; ampel: Ampel; text: string; quelle: "GitHub" | "Datenbank" | null; url: string | null };

/**
 * Letzter Lauf je Workflow: mit GitHub-Token aus der Actions-API (Erfolg/Fehler/läuft), sonst aus Spuren in der
 * Datenbank (Herzschlag, letzter Lauf, letzte Mail). Überfällig (älter als größte Plan-Lücke + 1 h) = gelb.
 */
export function workflowZeilen(wfs: { file: string; name: string; crons: string[] }[], runs: RunInfo[] | null, dbLast: Record<string, string | null>, now: Date): WfZeile[] {
  return wfs.map((w) => {
    const gap = maxLueckeH(w.crons, now);
    const alt = (iso: string | null) => !!iso && gap !== null && now.getTime() - Date.parse(iso) > (gap + 1) * H;
    const run = runs?.find((r) => r.file === w.file);
    if (run) {
      const base = { file: w.file, name: w.name, last: run.updated_at, quelle: "GitHub" as const, url: run.url };
      if (run.status !== "completed") return { ...base, ampel: "green" as Ampel, text: "läuft" };
      if (run.conclusion === "success") return alt(run.updated_at) ? { ...base, ampel: "gold" as Ampel, text: "überfällig" } : { ...base, ampel: "green" as Ampel, text: "ok" };
      if (run.conclusion === "cancelled" || run.conclusion === "skipped") return { ...base, ampel: "gold" as Ampel, text: "abgebrochen" };
      return { ...base, ampel: "red" as Ampel, text: "Fehler" };
    }
    const last = dbLast[w.file] ?? null;
    if (!last) return { file: w.file, name: w.name, last: null, ampel: "grey" as Ampel, text: runs ? "kein Lauf" : "ohne Token", quelle: null, url: null };
    return { file: w.file, name: w.name, last, ampel: alt(last) ? "gold" : "green", text: alt(last) ? "überfällig" : "aktiv", quelle: "Datenbank", url: null };
  });
}

// ------------------------------------------------------------------------------------------------- Postfächer
export type BoxZeile = { box: string; label: string; heute: number; cap: number; d14: number; bounced: number; rate: number | null; ampel: Ampel };

/** Postfächer: heute gesendet gegen Tageslimit, Bounce-Quote 14 Tage (Ampel aus boxHealth: grau unter 30 Mails). */
export function postfaecher(rows: BoxRow[], health: BoxHealth[] | null): BoxZeile[] {
  const key = (b: string) => (b === "" || b === "main" || b.startsWith("info@") ? "main" : b);
  return rows.map((r) => {
    const h = health?.find((x) => key(x.box) === key(r.box));
    return { box: r.box, label: r.label, heute: r.today, cap: r.cap, d14: h?.sent ?? 0, bounced: h?.bounced ?? 0, rate: h && h.sent ? h.rate : null,
      ampel: (h?.tone ?? "grey") as Ampel };
  });
}

// ------------------------------------------------------------------------------------------------- Speicher
export const DB_GRENZE = 8 * 1024 ** 3;
export type Speicher = { bytes: number | null; anteil: number | null; bremse: string | null; ampel: Ampel };

/** Datenbank gegen 8 GB und Speicher-Bremse (werk_plan_log): stopp rot, Drossel/ohne Rohbestand/Hinweis gelb. */
export function speicher(bytes: number | null, bremse: string | null): Speicher {
  const anteil = bytes === null ? null : bytes / DB_GRENZE;
  const ampel: Ampel = bremse === "stopp" || (anteil ?? 0) >= 7.5 / 8 ? "red"
    : (bremse && bremse !== "aus") || (anteil ?? 0) >= 5.5 / 8 ? "gold" : bytes === null ? "grey" : "green";
  return { bytes, anteil, bremse, ampel };
}

// ------------------------------------------------------------------------------------------------- Website
export type Web = { score: number | null; at: string | null; ampel: Ampel };

/** Letzter Website-Check: ab 80 grün, ab 60 gelb, darunter rot; älter als 36 h mindestens gelb; ohne Check grau. */
export function website(score: number | null, at: string | null, now: Date): Web {
  if (score === null || !at) return { score, at, ampel: "grey" };
  const base: Ampel = score >= 80 ? "green" : score >= 60 ? "gold" : "red";
  const alt = now.getTime() - Date.parse(at) > 36 * H;
  return { score, at, ampel: alt && base === "green" ? "gold" : base };
}

// ------------------------------------------------------------------------------------------------- Stillstand
export function stillAmpel(s: Still["stufe"]): Ampel {
  return s === "rot" ? "red" : s === "gelb" ? "gold" : s === "ok" ? "green" : "grey";
}

// ------------------------------------------------------------------------------------------------- Schalter
export type Schalter = { key: string; name: string; an: boolean; seit: string | null; fest?: boolean };

/**
 * Not-Aus-Schalter (nur Anzeige): Versand, Nachfass, Werke, Lead-/Kunden-Suche, Autopilot, Website-Auto-Fix.
 * Dazu die nie schaltbaren Schutzfunktionen (fest = an, CLAUDE.md „Werke per Klick an/aus“).
 */
export function schalter(o: {
  versandAktiv: boolean; sendPaused: boolean; followup: boolean; werkePaused: Record<string, string>; leadSuche: boolean; kundenSuche: boolean;
  autopilot: boolean; autofix: boolean; notbremse: string | null;
}): Schalter[] {
  const werk = (key: string, name: string): Schalter => ({ key, name, an: !o.werkePaused[key], seit: o.werkePaused[key] ?? null });
  return [
    { key: "versand", name: "Versand", an: o.versandAktiv && !o.sendPaused && !o.notbremse, seit: null },
    { key: "nachfass", name: "Nachfassmails", an: o.followup, seit: null },
    werk("lead-werk", "Lead-Werk"), werk("kunden-werk", "Kunden-Werk"), werk("proben-vorrat", "Proben-Vorrat"),
    { key: "lead-suche", name: "Lead-Suche", an: o.leadSuche, seit: null },
    { key: "kunden-suche", name: "Kunden-Suche", an: o.kundenSuche, seit: null },
    { key: "autopilot", name: "Autopilot Plätze", an: o.autopilot, seit: null },
    { key: "autofix", name: "Website Auto-Fix", an: o.autofix, seit: null },
    { key: "abmeldung", name: "Abmelde-Link", an: true, seit: null, fest: true },
    { key: "sperrliste", name: "Sperrliste", an: true, seit: null, fest: true },
    { key: "notbremse", name: "Notbremse", an: true, seit: null, fest: true },
    { key: "freigabe", name: "Drei-Stufen-Freigabe", an: true, seit: null, fest: true },
  ];
}

// ------------------------------------------------------------------------------------------------- Kennzahl
export type BetriebLage = { workflows: WfZeile[]; boxen: BoxZeile[]; domains?: BoxHealth[]; speicher: Speicher; web: Web; still: Still[]; notbremse: string | null };

/** Ampeln aller Bausteine (für Kopfzeile und Kennzahl); grau zählt nicht als Problem. */
export function bausteine(x: BetriebLage): { name: string; ampel: Ampel }[] {
  return [
    { name: "Workflows", ampel: schlechteste(x.workflows.map((w) => w.ampel).filter((a) => a !== "grey")) },
    { name: "Postfächer", ampel: x.notbremse ? "red" : schlechteste(x.boxen.map((b) => b.ampel).filter((a) => a !== "grey")) },
    { name: "Speicher", ampel: x.speicher.ampel },
    { name: "Website", ampel: x.web.ampel },
    { name: "Datenfluss", ampel: schlechteste(x.still.map((s) => stillAmpel(s.stufe)).filter((a) => a !== "grey")) },
  ];
}

/** Kennzahl „Betrieb“: Wert = Bausteine grün / gesamt, Ampel = schlechtester Baustein (ohne graue). */
export function kpiAus(x: BetriebLage, trend: Trend = null): ZKpi {
  const b = bausteine(x);
  const gruen = b.filter((y) => y.ampel === "green").length;
  const bewertet = b.filter((y) => y.ampel !== "grey");
  return { titel: "Betrieb", wert: `${gruen}/${b.length} grün`, ampel: bewertet.length ? schlechteste(bewertet.map((y) => y.ampel)) : "grey", trend };
}

/** Kennzahl für die JARVIS-Abteilungs-Übersicht (lädt selbst; nur auf dem Server aufrufen). */
export async function kpi(): Promise<ZKpi> {
  try {
    const { loadBetrieb } = await import("./betrieb-data");
    return kpiAus(await loadBetrieb());
  } catch {
    return { titel: "Betrieb", wert: "–", ampel: "grey", trend: null };
  }
}

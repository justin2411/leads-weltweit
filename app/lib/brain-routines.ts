/**
 * Gehirn-Routinen (Inhaber 04.10.2026: „beim gehirn mit ihm auch einzelne workflows bauen können z.b. jeden tag um
 * 14 uhr sollst du 15min recherchieren wie wir unser system verbessern können … jeden tag um 11 uhr sollst du prüfen ob
 * alles glatt läuft“). Reine Funktionen ohne Server-/React-Abhängigkeiten (testbar): Prüfung einer Routine, Fälligkeit
 * und nächster Lauf in deutscher Zeit (Sommer-/Winterzeit über Intl), Anzeige-Texte, Vorlagen.
 * Tabelle signalwerk.brain_routines (Migration 20261004224500). Gleiche Fälligkeitsregel in scripts/brain_routines.py:
 * fällige Routinen legt der Wachhund als Auftrag (agent_tasks, kind 'gehirn') für einen freien Agenten an; die
 * JARVIS-Routine (:08/:23/:38/:53) arbeitet ihn ab und schreibt das Ergebnis als Wissen (brain_knowledge).
 */

export const TAGE = ["taeglich", "werktags", "wochentage"] as const;
export type Tage = (typeof TAGE)[number];
export const TAGE_LABEL: Record<Tage, string> = { taeglich: "täglich", werktags: "Mo–Fr", wochentage: "an Tagen" };
export const WOCHENTAG_KURZ = ["Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"] as const;
export const DAUER_MIN = 5;
export const DAUER_MAX = 60;
/** Höchstens so lange nach der geplanten Zeit wird noch nachgeholt (Wachhund läuft alle 15 min). */
export const CATCH_UP_H = 6;
export const BRAIN_BY = "Gehirn-Routine";

export type BrainRoutine = {
  id: string; name: string; aufgabe: string; uhrzeit: string; tage: Tage; wochentage: number[]; dauer_min: number; aktiv: boolean;
  last_run_at: string | null; last_task_id: string | null; last_result: string | null; created_at: string; updated_at?: string | null;
};
export type RoutineInput = { name: string; aufgabe: string; uhrzeit: string; tage: Tage; wochentage: number[]; dauer_min: number };

export class RoutineError extends Error {}

/** Vorlagen (Inhaber-Beispiele) – nur zum Ausfüllen, nichts wird automatisch angelegt. */
export const TEMPLATES: (RoutineInput & { key: string })[] = [
  { key: "verbessern", name: "System verbessern", uhrzeit: "14:00", tage: "taeglich", wochentage: [], dauer_min: 15,
    aufgabe: "15 min recherchieren, wie wir unser System verbessern können (Zustellbarkeit, Lead-Qualität, Abläufe). Höchstens einen kleinen Test starten, Erkenntnisse als Wissen notieren." },
  { key: "umsatz", name: "Umsatz maximieren", uhrzeit: "14:00", tage: "taeglich", wochentage: [], dauer_min: 15,
    aufgabe: "Recherchieren und aus unseren Zahlen ableiten, wie wir mehr Umsatz machen (Preise, Angebot, Seiten, Zielgruppen). Einen konkreten nächsten Schritt umsetzen oder vorschlagen." },
  { key: "glatt", name: "Alles läuft glatt?", uhrzeit: "11:00", tage: "taeglich", wochentage: [], dauer_min: 10,
    aufgabe: "Prüfen, ob alles glatt läuft: Werke, Versand, Proben-Vorrat, Freigabe-Stichprobe, Antworten, Fehler in den Läufen. Kleines selbst beheben, Rest als Vorschlag." },
];

const clean = (x: unknown) => String(x ?? "").replace(/\s+/g, " ").trim();
const HHMM = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** „9:5“, „9.05“, „14 Uhr“ → „09:05“/„14:00“; ungültig → null. */
export function normTime(x: unknown): string | null {
  const t = clean(x).toLowerCase().replace(/\s*uhr$/, "").replace(".", ":");
  const m = /^(\d{1,2})(?::(\d{1,2}))?$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]), mi = Number(m[2] ?? 0);
  if (h > 23 || mi > 59) return null;
  return `${String(h).padStart(2, "0")}:${String(mi).padStart(2, "0")}`;
}

/** Wochentage 1–7 (Mo–So) – Zahlen oder Kürzel („Di“) –, sortiert, ohne Doppel. */
export function normDays(x: unknown): number[] {
  const arr = Array.isArray(x) ? x : typeof x === "string" ? x.split(/[\s,;]+/) : [];
  const out = new Set<number>();
  for (const v of arr) {
    const s = clean(v);
    if (!s) continue;
    const n = /^\d$/.test(s) ? Number(s) : WOCHENTAG_KURZ.findIndex((k) => k.toLowerCase() === s.slice(0, 2).toLowerCase()) + 1;
    if (Number.isInteger(n) && n >= 1 && n <= 7) out.add(n);
  }
  return [...out].sort((a, b) => a - b);
}

/** Routine prüfen (Formular, Chat-Werkzeug): Name 2–60, Aufgabe 5–1000, Uhrzeit HH:MM, Tage, Dauer 5–60 min. */
export function validateRoutine(f: { name?: unknown; aufgabe?: unknown; uhrzeit?: unknown; tage?: unknown; wochentage?: unknown; dauer_min?: unknown }): RoutineInput {
  const name = clean(f.name);
  if (name.length < 2 || name.length > 60) throw new RoutineError("Name: 2–60 Zeichen");
  const aufgabe = clean(f.aufgabe);
  if (aufgabe.length < 5 || aufgabe.length > 1000) throw new RoutineError("Aufgabe: 5–1000 Zeichen");
  const uhrzeit = normTime(f.uhrzeit);
  if (!uhrzeit) throw new RoutineError("Uhrzeit: HH:MM (deutsche Zeit)");
  const tage = (f.tage === undefined || f.tage === null || f.tage === "" ? "taeglich" : String(f.tage)) as Tage;
  if (!(TAGE as readonly string[]).includes(tage)) throw new RoutineError("Tage: täglich, werktags oder bestimmte Wochentage");
  const wochentage = tage === "wochentage" ? normDays(f.wochentage) : [];
  if (tage === "wochentage" && !wochentage.length) throw new RoutineError("Wochentage wählen (Mo–So)");
  const d = f.dauer_min === undefined || f.dauer_min === null || f.dauer_min === "" ? 15 : Number(f.dauer_min);
  if (!Number.isInteger(d) || d < DAUER_MIN || d > DAUER_MAX) throw new RoutineError(`Dauer: ${DAUER_MIN}–${DAUER_MAX} Minuten`);
  return { name, aufgabe, uhrzeit, tage, wochentage, dauer_min: d };
}

// ------------------------------------------------------------------------------------------- Zeit (Europe/Berlin)
const TZ = "Europe/Berlin";
const PARTS = new Intl.DateTimeFormat("en-GB", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", weekday: "short", hourCycle: "h23" });
const WD: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Datum, Uhrzeit und Wochentag (1 = Mo) in deutscher Zeit. */
export function berlinParts(d: Date): { y: number; mo: number; da: number; h: number; mi: number; wd: number } {
  const p = Object.fromEntries(PARTS.formatToParts(d).map((x) => [x.type, x.value]));
  return { y: Number(p.year), mo: Number(p.month), da: Number(p.day), h: Number(p.hour), mi: Number(p.minute), wd: WD[p.weekday] ?? 1 };
}

/** Zeitpunkt „Tag y-mo-da, HH:MM deutsche Zeit“ als Date (Sommer-/Winterzeit; nicht existierende Zeit → eine Stunde später). */
export function berlinAt(y: number, mo: number, da: number, hhmm: string): Date {
  const [h, mi] = hhmm.split(":").map(Number);
  const want = h * 60 + mi;
  for (const off of [-2, -1, 0]) {
    const c = new Date(Date.UTC(y, mo - 1, da, h, mi) + off * 3_600_000);
    const p = berlinParts(c);
    if (p.da === da && p.h * 60 + p.mi === want) return c;
  }
  return new Date(Date.UTC(y, mo - 1, da, h, mi) - 3_600_000);
}

/** Läuft die Routine an diesem Wochentag (1 = Mo … 7 = So)? */
export function runsOn(r: Pick<BrainRoutine, "tage" | "wochentage">, wd: number): boolean {
  if (r.tage === "werktags") return wd <= 5;
  if (r.tage === "wochentage") return (r.wochentage ?? []).includes(wd);
  return true;
}

/** Geplante Zeitpunkte (heute und die nächsten Tage) ab dem Tag von `from`, aufsteigend. */
function slots(r: Pick<BrainRoutine, "tage" | "wochentage" | "uhrzeit">, from: Date, days: number): Date[] {
  const out: Date[] = [];
  const base = berlinParts(from);
  for (let i = -1; i <= days; i++) {
    const noon = new Date(Date.UTC(base.y, base.mo - 1, base.da, 12) + i * 86_400_000);
    const p = berlinParts(noon);
    if (runsOn(r, p.wd)) out.push(berlinAt(p.y, p.mo, p.da, r.uhrzeit));
  }
  return out;
}

/**
 * Fällig? aktiv, kein offener/laufender Auftrag, letzter geplanter Zeitpunkt ≤ jetzt liegt höchstens 6 h zurück und
 * die Routine wurde seitdem noch nicht beauftragt (last_run_at < geplanter Zeitpunkt). Gibt den Zeitpunkt zurück.
 */
export function dueAt(r: Pick<BrainRoutine, "aktiv" | "tage" | "wochentage" | "uhrzeit" | "last_run_at">, now: Date, taskOpen = false): Date | null {
  if (!r.aktiv || taskOpen || !HHMM.test(r.uhrzeit)) return null;
  const past = slots(r, now, 0).filter((d) => d.getTime() <= now.getTime());
  const slot = past.at(-1);
  if (!slot || now.getTime() - slot.getTime() > CATCH_UP_H * 3_600_000) return null;
  const last = r.last_run_at ? Date.parse(r.last_run_at) : NaN;
  if (Number.isFinite(last) && last >= slot.getTime()) return null;
  return slot;
}

/** Nächster geplanter Lauf nach `now` (oder null, wenn aus). */
export function nextRun(r: Pick<BrainRoutine, "aktiv" | "tage" | "wochentage" | "uhrzeit">, now: Date): Date | null {
  if (!r.aktiv || !HHMM.test(r.uhrzeit)) return null;
  return slots(r, now, 8).find((d) => d.getTime() > now.getTime()) ?? null;
}

/** „täglich 14:00 · 15 min“, „Mo–Fr 11:00 · 10 min“, „Di, Do 09:30 · 5 min“. */
export function scheduleLabel(r: Pick<BrainRoutine, "tage" | "wochentage" | "uhrzeit" | "dauer_min">): string {
  const days = r.tage === "wochentage" ? (r.wochentage ?? []).map((d) => WOCHENTAG_KURZ[d - 1]).filter(Boolean).join(", ") : TAGE_LABEL[r.tage] ?? "täglich";
  return `${days} ${r.uhrzeit} · ${r.dauer_min} min`;
}

/** „heute 14:00“, „morgen 11:00“, „Di 09:30“ (deutsche Zeit). */
export function whenLabel(d: Date | null, now: Date): string {
  if (!d) return "aus";
  const p = berlinParts(d), n = berlinParts(now);
  const hm = `${String(p.h).padStart(2, "0")}:${String(p.mi).padStart(2, "0")}`;
  const dayDiff = Math.round((Date.UTC(p.y, p.mo - 1, p.da) - Date.UTC(n.y, n.mo - 1, n.da)) / 86_400_000);
  if (dayDiff === 0) return `heute ${hm}`;
  if (dayDiff === 1) return `morgen ${hm}`;
  return `${WOCHENTAG_KURZ[p.wd - 1]} ${hm}`;
}

/** Auftragstext für die JARVIS-Routine (≤ 1000 Zeichen). */
export function routineBrief(r: Pick<BrainRoutine, "name" | "aufgabe" | "dauer_min">): string {
  const head = `Gehirn-Routine ${clean(r.name).slice(0, 60)} (${r.dauer_min} min): `;
  const tail = " | Ergebnis als Wissen (brain_knowledge.py add), kurz ins Gehirn (jarvis_chat.py gehirn-update).";
  return `${head}${clean(r.aufgabe).slice(0, 1000 - head.length - tail.length)}${tail}`;
}

/** Datenbank-Zeile → Routine (unbekannte Werte sicher gemacht). */
export function toRoutine(x: Record<string, unknown>): BrainRoutine {
  const tage = (TAGE as readonly string[]).includes(String(x.tage)) ? (x.tage as Tage) : "taeglich";
  return {
    id: String(x.id), name: String(x.name ?? ""), aufgabe: String(x.aufgabe ?? ""), uhrzeit: normTime(x.uhrzeit) ?? "00:00", tage,
    wochentage: normDays(x.wochentage), dauer_min: Number(x.dauer_min) || 15, aktiv: x.aktiv !== false,
    last_run_at: (x.last_run_at as string | null) ?? null, last_task_id: (x.last_task_id as string | null) ?? null,
    last_result: (x.last_result as string | null) ?? null, created_at: String(x.created_at ?? ""), updated_at: (x.updated_at as string | null) ?? null,
  };
}

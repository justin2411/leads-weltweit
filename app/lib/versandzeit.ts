/**
 * Versand rund um die Uhr (Inhaber 04.10.2026: „es sollen immer mails rausgehen nicht nur di-do. sondern jeden tag um
 * jede uhrzeit es soll die ganze zeit laufen“): send.yml startet jeden Tag stündlich zur Minute 37; jeder Lauf sendet
 * seinen Anteil der Tagesmenge. Gleicher Plan wie app/lib/versandzeit.json (gelesen von send.yml, Wachhund und
 * Tagescheck über scripts/lib/versandzeit.py; versandzeit.test.ts prüft, dass beide gleich sind). Reines Modul ohne
 * Imports (testbar). Sommer-/Winterzeit über Intl (Europe/Berlin).
 */
export type SendGroup = { gruppe: string; name: string; laender: string[] };
export type SendPlan = { tz: string; wochentage: number[]; minute: number; dauer_min: number; name: string };

export const PLAN: SendPlan = {
  tz: "Europe/Berlin",
  wochentage: [1, 2, 3, 4, 5, 6, 7],
  minute: 37,
  dauer_min: 45,
  name: "alle Länder · 24/7",
};

const HOUR = 3_600_000;
const group = (plan: SendPlan): SendGroup => ({ gruppe: "alle", name: plan.name, laender: [] });

/** Wanduhr in `tz` als {y, m, d, wd (ISO 1=Mo … 7=So)} für einen Zeitpunkt. */
function wall(t: Date, tz: string): { y: number; m: number; d: number; h: number; mi: number; s: number; wd: number } {
  const p = Object.fromEntries(new Intl.DateTimeFormat("en-GB", {
    timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
    weekday: "short", hourCycle: "h23",
  }).formatToParts(t).map((x) => [x.type, x.value]));
  const wd = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(p.weekday) + 1;
  return { y: +p.year, m: +p.month, d: +p.day, h: +p.hour, mi: +p.minute, s: +p.second, wd };
}

/** Zeitpunkt für Datum (y, m, d) und „HH:MM“ in `tz` (Sommer-/Winterzeit richtig). */
export function atLocal(y: number, m: number, d: number, hhmm: string, tz: string): Date {
  const [h, mi] = hhmm.split(":").map(Number);
  const naive = Date.UTC(y, m - 1, d, h, mi);
  let t = naive;
  for (let i = 0; i < 2; i++) {
    const w = wall(new Date(t), tz);
    const off = Date.UTC(w.y, w.m - 1, w.d, w.h, w.mi, w.s) - t;
    t = naive - off;
  }
  return new Date(t);
}

/** Stündliche Starts eines deutschen Kalendertags (wie scripts/lib/versandzeit.py slots). */
function daySlots(y: number, m: number, d: number, plan: SendPlan): Date[] {
  const c = new Date(Date.UTC(y, m - 1, d));
  if (!plan.wochentage.includes(c.getUTCDay() || 7)) return [];
  const start = atLocal(y, m, d, "00:00", plan.tz).getTime();
  const out: Date[] = [];
  for (let h = 0; h < 26; h++) {
    const t = new Date(start + h * HOUR + plan.minute * 60_000);
    const w = wall(t, plan.tz);
    if (w.y === y && w.m === m && w.d === d) out.push(t);
  }
  return out;
}

/** Starts des i-ten Kalendertags vor/nach `now` (Kalendertage, unabhängig von der Zeitumstellung). */
function slotsOn(now: Date, plan: SendPlan, offset: number): Date[] {
  const w0 = wall(now, plan.tz);
  const c = new Date(Date.UTC(w0.y, w0.m - 1, w0.d + offset));
  return daySlots(c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate(), plan);
}

/** Nächster geplanter Versandstart nach `now` (für „nächster Lauf“ im Dashboard). */
export function nextSendStart(now: Date, plan: SendPlan = PLAN): { g: SendGroup; at: Date } | null {
  for (let i = 0; i < 15; i++) {
    const at = slotsOn(now, plan, i).find((t) => t.getTime() > now.getTime());
    if (at) return { g: group(plan), at };
  }
  return null;
}

/** Letzter geplanter Versandstart, der (Start + Karenz) schon gelaufen sein müsste. */
export function lastSendDue(now: Date, graceMin = 60, plan: SendPlan = PLAN): { g: SendGroup; at: Date } | null {
  for (let i = 0; i < 15; i++) {
    const at = slotsOn(now, plan, -i).filter((t) => t.getTime() + graceMin * 60_000 <= now.getTime()).at(-1);
    if (at) return { g: group(plan), at };
  }
  return null;
}

/** Ist heute (deutsches Datum) ein Versandtag? (rund um die Uhr: jeder Tag) */
export function isSendDay(now: Date, plan: SendPlan = PLAN): boolean {
  return plan.wochentage.includes(wall(now, plan.tz).wd);
}

/** Kurztext für das Dashboard: „täglich 0–24 Uhr · stündlich :37“. */
export function planText(plan: SendPlan = PLAN): string {
  return `täglich 0–24 Uhr · stündlich :${String(plan.minute).padStart(2, "0")}`;
}

/** Erster geplanter Start des Tags des letzten fälligen Laufs („seitdem gesendet?“, wie scripts/lib/versandzeit.py). */
export function sendDayStart(now: Date, graceMin = 60, plan: SendPlan = PLAN): Date | null {
  const due = lastSendDue(now, graceMin, plan);
  if (!due) return null;
  const w = wall(due.at, plan.tz);
  return daySlots(w.y, w.m, w.d, plan)[0] ?? null;
}

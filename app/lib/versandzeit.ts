/**
 * Versandzeit (Inhaber 04.10.2026: „übernimm alle 3 punkte“): Kalt- und Nachfassmails nur Di–Do zur Bürozeit der
 * Empfänger – UK/FR ca. 9–11 Uhr, US ab ca. 15 Uhr deutscher Zeit. Gleicher Plan wie app/lib/versandzeit.json
 * (gelesen von send.yml, Wachhund und Tagescheck über scripts/lib/versandzeit.py; versandzeit.test.ts prüft, dass
 * beide gleich sind). Reines Modul ohne Imports (testbar). Sommer-/Winterzeit über Intl (Europe/Berlin).
 */
export type SendGroup = { gruppe: string; name: string; laender: string[]; start: string; spaetester_start: string; bis: string };
export type SendPlan = { tz: string; wochentage: number[]; laeufe: SendGroup[] };

export const PLAN: SendPlan = {
  tz: "Europe/Berlin",
  wochentage: [2, 3, 4],
  laeufe: [
    { gruppe: "europa", name: "UK/FR", laender: ["UK", "FR", "IE", "NL", "BE", "SE"], start: "08:37", spaetester_start: "10:30", bis: "11:00" },
    { gruppe: "us", name: "US", laender: ["US"], start: "14:37", spaetester_start: "17:30", bis: "19:00" },
  ],
};

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

/** Geplante Starts der nächsten bzw. letzten 15 Tage (aufsteigend). */
function slotsAround(now: Date, plan: SendPlan, dir: 1 | -1): { g: SendGroup; at: Date }[] {
  const out: { g: SendGroup; at: Date }[] = [];
  const w0 = wall(now, plan.tz);
  for (let i = 0; i < 15; i++) {
    const c = new Date(Date.UTC(w0.y, w0.m - 1, w0.d + dir * i));  // Kalendertage, unabhängig von der Zeitumstellung
    if (!plan.wochentage.includes(c.getUTCDay() || 7)) continue;
    for (const g of plan.laeufe) out.push({ g, at: atLocal(c.getUTCFullYear(), c.getUTCMonth() + 1, c.getUTCDate(), g.start, plan.tz) });
  }
  return out.sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** Nächster geplanter Versandstart nach `now` (für „nächster Lauf“ im Dashboard). */
export function nextSendStart(now: Date, plan: SendPlan = PLAN): { g: SendGroup; at: Date } | null {
  return slotsAround(now, plan, 1).find((s) => s.at.getTime() > now.getTime()) ?? null;
}

/** Letzter geplanter Versandstart, der (Start + Karenz) schon gelaufen sein müsste. */
export function lastSendDue(now: Date, graceMin = 60, plan: SendPlan = PLAN): { g: SendGroup; at: Date } | null {
  const due = slotsAround(now, plan, -1).filter((s) => s.at.getTime() + graceMin * 60_000 <= now.getTime());
  return due.at(-1) ?? null;
}

/** Ist heute (deutsches Datum) ein Versandtag? */
export function isSendDay(now: Date, plan: SendPlan = PLAN): boolean {
  return plan.wochentage.includes(wall(now, plan.tz).wd);
}

/** Kurztext für das Dashboard: „Di–Do · UK/FR 08:37 · US 14:37“. */
export function planText(plan: SendPlan = PLAN): string {
  const names = ["", "Mo", "Di", "Mi", "Do", "Fr", "Sa", "So"];
  const days = plan.wochentage.length > 1 ? `${names[plan.wochentage[0]]}–${names[plan.wochentage.at(-1)!]}` : names[plan.wochentage[0]];
  return [days, ...plan.laeufe.map((g) => `${g.name} ${g.start}`)].join(" · ");
}

/** Erster geplanter Start des letzten fälligen Versandtags („seitdem gesendet?“, wie scripts/lib/versandzeit.py). */
export function sendDayStart(now: Date, graceMin = 60, plan: SendPlan = PLAN): Date | null {
  const due = lastSendDue(now, graceMin, plan);
  if (!due) return null;
  const w = wall(due.at, plan.tz);
  return atLocal(w.y, w.m, w.d, plan.laeufe[0].start, plan.tz);
}

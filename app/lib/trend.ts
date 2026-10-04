/**
 * Trends „7 T vs. Vor-7 T“ (JARVIS-Plan W1-4). Reine Funktionen, testbar.
 * Fenster = volle Tage: „7 T“ sind die 7 Tage bis gestern, „Vor-7 T“ die 7 davor (der laufende Tag ist noch nicht fertig).
 */
import type { DailyRow } from "./dashboard-periods.ts";

/** Unter so vielen Ereignissen (beide Fenster zusammen bzw. Nenner je Fenster) gilt der Vergleich als „zu wenig Daten“. */
export const MIN_N = 20;
const DAY = 86_400_000;

export const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * DAY).toISOString().slice(0, 10);

/** Die beiden Fenster zu „heute“ (deutscher Kalendertag): cur = heute−7 … heute−1, prev = heute−14 … heute−8. */
export function windows(today: string) {
  return { cur: { from: addDays(today, -7), to: addDays(today, -1) }, prev: { from: addDays(today, -14), to: addDays(today, -8) } };
}

export type Dir = "up" | "down" | "flat";
export type Trend = { cur: number; prev: number; pct: number | null; dir: Dir; few: boolean };

/** Vergleich zweier Werte. few = zu wenig Daten (n unter minN oder kein Vorwert); pct ganzzahlig gerundet. */
export function trend(cur: number, prev: number, n = cur + prev, minN = MIN_N): Trend {
  const few = n < minN || !(prev > 0);
  const pct = prev > 0 ? Math.round((100 * (cur - prev)) / prev) : null;
  const dir: Dir = pct === null ? (cur > 0 ? "up" : "flat") : pct > 0 ? "up" : pct < 0 ? "down" : "flat";
  return { cur, prev, pct, dir, few };
}

/** „▲ 12 %“, „▼ 5 %“, „±0 %“; bei zu wenig Daten leer. */
export function arrow(t: Trend | null | undefined): string {
  if (!t || t.few || t.pct === null) return "";
  if (t.pct === 0) return "±0 %";
  return `${t.pct > 0 ? "▲" : "▼"} ${Math.abs(t.pct)} %`;
}

type Num = keyof Omit<DailyRow, "day" | "country">;
/** Summe einer Kennzahl in [from, to] für ein Land (oder alle angegebenen Länder). */
export function sumDaily(rows: DailyRow[], from: string, to: string, countries: string[], k: Num): number {
  let s = 0;
  for (const r of rows) if (r.day >= from && r.day <= to && r.country && countries.includes(r.country)) s += Number(r[k] ?? 0);
  return s;
}

const pct1 = (k: number, n: number) => (n ? `${(Math.round((1000 * k) / n) / 10).toString().replace(".", ",")}%` : "–");

/**
 * Eine kompakte Kontext-Zeile je Land: Mails, Bounce-Quote, Antwortquote, positive Antworten, Proben (gesendet),
 * jeweils „7 T (Vor-7 T)“ und bei genug Daten der Pfeil. Bleibt kurz (≈ 25 Tokens je Land).
 */
export function trendLine(rows: DailyRow[], today: string, countries: string[]): string {
  const w = windows(today);
  const parts = countries.map((c) => {
    const g = (k: Num, x: { from: string; to: string }) => sumDaily(rows, x.from, x.to, [c], k);
    const s = g("sent", w.cur), sp = g("sent", w.prev);
    const mails = s + g("followups", w.cur), mailsP = sp + g("followups", w.prev);
    const b = g("bounced", w.cur), bp = g("bounced", w.prev);
    const r = g("replies", w.cur), rp = g("replies", w.prev);
    const pos = g("positive", w.cur), posP = g("positive", w.prev);
    const pr = g("samples_sent", w.cur), prP = g("samples_sent", w.prev);
    if (!mails && !mailsP && !r && !rp && !pr && !prP) return `${c} keine Daten`;
    const few = s < MIN_N || sp < MIN_N;
    const a = arrow(trend(mails, mailsP));
    return `${c} Mails ${mails} (${mailsP})${a ? ` ${a}` : ""}, Bounce ${pct1(b, mails)} (${pct1(bp, mailsP)}), `
      + `Antw. ${pct1(r, s)} (${pct1(rp, sp)}), positiv ${pos} (${posP}), Proben ${pr} (${prP})${few ? ", zu wenig Daten" : ""}`;
  });
  return parts.join("; ");
}

/** „Engpass seit x Läufen“: wie oft dieselbe Station zuletzt ohne Unterbrechung Engpass war (neueste zuerst). */
export function neckStreak(stations: (string | null | undefined)[]): { station: string; runs: number } | null {
  const first = stations[0];
  if (!first) return null;
  let runs = 0;
  for (const s of stations) { if (s !== first) break; runs++; }
  return { station: first, runs };
}

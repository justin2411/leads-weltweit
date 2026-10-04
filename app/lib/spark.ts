/**
 * Sparklines an den JARVIS-Stationen (JARVIS-Plan W1-3): 7-Tage-Reihe je Station und Trend „7 T vs. Vor-7 T“.
 * Quelle: signalwerk.kpi_daily (Momentaufnahmen je Tag, seit 04.10.2026), sonst dashboard_daily (Ereignisse je Tag).
 * kpi_daily: fehlender Tag = null (Reihe bleibt leer statt 0). dashboard_daily zählt Ereignisse: kein Eintrag = 0.
 * Reine Funktionen, testbar; das Zeichnen (reines SVG) macht app/dashboard/jarvis/spark.tsx.
 */
import type { DailyRow } from "./dashboard-periods.ts";
import { MIN_N, addDays, trend, type Trend } from "./trend.ts";

export type Pt = number | null;
export type KpiRow = { day: string; country: string; metric: string; value: number | string | null };
export type Spark = { points: Pt[]; trend: Trend | null; label: string; gold?: boolean; src: "kpi" | "daily" };
type Num = keyof Omit<DailyRow, "day" | "country">;

/** n Tage bis einschließlich today, älteste zuerst. */
export const lastDays = (today: string, n: number) => Array.from({ length: n }, (_, i) => addDays(today, i - n + 1));

/** Tageswerte aus dashboard_daily (Summe der Kennzahlen über die Länder); kein Eintrag = 0. */
export function dailyPoints(rows: DailyRow[], days: string[], countries: string[], keys: Num[], scale = 1): Pt[] {
  return days.map((d) => {
    let s = 0;
    for (const r of rows) if (r.day === d && r.country && countries.includes(r.country)) for (const k of keys) s += Number(r[k] ?? 0);
    return s * scale;
  });
}

/** Tageswerte aus kpi_daily: Summe über die Länder, mit weight als gewichtetes Mittel (z. B. Quote × n); fehlt der Tag → null. */
export function kpiPoints(rows: KpiRow[], days: string[], metric: string, countries: string[], o: { weight?: string; scale?: number } = {}): Pt[] {
  const val = (r: KpiRow) => (r.value === null || r.value === "" ? null : Number(r.value));
  return days.map((d) => {
    const xs = rows.filter((r) => r.day === d && r.metric === metric && countries.includes(r.country) && val(r) !== null && Number.isFinite(val(r)));
    if (!xs.length) return null;
    if (o.weight) {
      let num = 0, den = 0;
      for (const r of xs) {
        const w = Number(rows.find((y) => y.day === d && y.metric === o.weight && y.country === r.country)?.value ?? 0);
        num += val(r)! * w; den += w;
      }
      return den ? (num / den) * (o.scale ?? 1) : null;
    }
    return xs.reduce((a, r) => a + val(r)!, 0) * (o.scale ?? 1);
  });
}

/** Anzahl vorhandener Punkte. */
export const count = (p: Pt[]) => p.filter((x) => x !== null).length;

/**
 * Trend aus 15 Tageswerten (älteste zuerst: 0 = heute−14 … 14 = heute), Fenster wie trend.windows (volle Tage):
 * cur = heute−7 … heute−1, prev = heute−14 … heute−8. flow = Summe je Fenster (n = beide zusammen, unter MIN_N
 * „zu wenig Daten“); level = Mittel je Fenster (ohne Vorwerte „zu wenig Daten“).
 */
export function trendOf(p15: Pt[], kind: "flow" | "level"): Trend | null {
  if (p15.length !== 15) return null;
  const nums = (xs: Pt[]) => xs.filter((x): x is number => x !== null);
  const c = nums(p15.slice(7, 14)), q = nums(p15.slice(0, 7));
  if (!c.length) return null;
  const sum = (xs: number[]) => xs.reduce((s, x) => s + x, 0);
  if (kind === "flow") return trend(sum(c), sum(q), q.length ? sum(c) + sum(q) : 0);
  if (!q.length) return trend(c[c.length - 1], 0, 0);
  return trend(sum(c) / c.length, sum(q) / q.length, MIN_N);
}

/**
 * SVG-Pfad für eine Sparkline (Spanne min … max der 7 Tage): Teilstücke nur über zusammenhängende Punkte, Lücken bleiben leer.
 * Unter 2 Punkten kein Pfad (d = ""). last = Koordinate des letzten vorhandenen Punkts.
 */
export function sparkPath(points: Pt[], w: number, h: number, pad = 2): { d: string; last: [number, number] | null; n: number } {
  const n = count(points);
  if (n < 2) return { d: "", last: null, n };
  const vals = points.filter((x): x is number => x !== null);
  const min = Math.min(...vals), max = Math.max(...vals);
  const dx = points.length > 1 ? (w - 2 * pad) / (points.length - 1) : 0;
  const r = (v: number) => Math.round(v * 10) / 10;
  // Spanne der Woche (min … max); ohne Bewegung eine ruhige Mittellinie
  const xy = (i: number, v: number): [number, number] => [r(pad + i * dx), r(max > min ? h - pad - ((v - min) / (max - min)) * (h - 2 * pad) : h / 2)];
  let d = "", prevOk = false, last: [number, number] | null = null;
  points.forEach((v, i) => {
    if (v === null) { prevOk = false; return; }
    const [x, y] = xy(i, v);
    const nextOk = i + 1 < points.length && points[i + 1] !== null;
    if (prevOk) d += `L${x} ${y}`;
    else if (nextOk) d += `${d ? " " : ""}M${x} ${y}`;
    prevOk = true;
    last = [x, y];
  });
  return { d, last, n };
}

const fmt = (v: number) => (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString("de-DE");
/** aria-label: „Mails je Tag, 7 Tage: 0, 12, 30 …“ (– für fehlende Tage). */
export const sparkAria = (s: Spark) => `${s.label}, 7 Tage: ${s.points.map((x) => (x === null ? "–" : fmt(x))).join(", ")}`;

/**
 * Reihen je Station (Schlüssel = StationId). kpi_daily, wenn dort ≥ 2 Punkte der letzten 7 Tage liegen, sonst
 * dashboard_daily, wenn die Station dort eine Kennzahl hat, sonst kpi_daily (dann ohne Linie, nur der Wert).
 */
export function stationSparks(daily: DailyRow[], kpi: KpiRow[], today: string, countries: string[]): Record<string, Spark> {
  const d15 = lastDays(today, 15);
  const out: Record<string, Spark> = {};
  type K = { metric: string; kind: "flow" | "level"; label: string; weight?: string; scale?: number; all?: boolean };
  type D = { keys: Num[]; kind: "flow" | "level"; label: string; scale?: number };
  const pick = (id: string, k: K | null, d: D | null, gold = false) => {
    const kp = k ? kpiPoints(kpi, d15, k.metric, k.all ? ["ALL"] : countries, { weight: k.weight, scale: k.scale }) : null;
    const k7 = kp ? kp.slice(-7) : null;
    if (kp && k && (count(k7!) >= 2 || !d)) { out[id] = { points: k7!, trend: trendOf(kp, k.kind), label: k.label, gold, src: "kpi" }; return; }
    if (d) {
      const dp = dailyPoints(daily, d15, countries, d.keys, d.scale);
      out[id] = { points: dp.slice(-7), trend: trendOf(dp, d.kind), label: d.label, gold, src: "daily" };
    }
  };
  pick("lead", { metric: "leads_neu", kind: "flow", label: "neue Leads je Tag" }, null);
  pick("gate", { metric: "freigabe_quote", kind: "level", label: "Freigabe-Quote in %", weight: "freigabe_n", scale: 100 }, null);
  pick("bestand", { metric: "leads_lieferbar", kind: "level", label: "lieferbare Leads" }, null);
  pick("proben", { metric: "proben_bereit", kind: "level", label: "Proben bereit" }, { keys: ["samples_sent"], kind: "flow", label: "Proben raus je Tag" });
  pick("kwerk", { metric: "kaeufer_neu", kind: "flow", label: "neue Käufer je Tag" }, null);
  pick("kaeufer", { metric: "kaeufer_frei", kind: "level", label: "freie Käufer" }, null);
  pick("versand", null, { keys: ["sent", "followups"], kind: "flow", label: "Mails je Tag" });
  pick("antworten", null, { keys: ["replies"], kind: "flow", label: "Antworten je Tag" });
  pick("kunden", { metric: "mrr_cents", kind: "level", label: "Umsatz pro Monat", scale: 0.01, all: true }, { keys: ["revenue_cents"], kind: "flow", label: "neuer Umsatz je Tag", scale: 0.01 }, true);
  return out;
}

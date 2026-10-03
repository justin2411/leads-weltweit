/**
 * Zeiträume und Tageswerte für „Versand & Ergebnisse“ (Inhaber 03.10.2026: „jeden tag sehen wv mails gingen raus was
 * sind die ergebnisse und wie war es gestern, die woche, letzte woche letzter monat, letzte 3 monate, ganzes jahr“).
 * Kalenderlogik in deutscher Zeit, Woche Montag–Sonntag. Reine Funktionen, testbar.
 */
export type PeriodKey = "heute" | "gestern" | "woche" | "vorwoche" | "monat" | "3monate" | "jahr";
export const PERIODS: [PeriodKey, string][] = [
  ["heute", "Heute"], ["gestern", "Gestern"], ["woche", "Diese Woche"], ["vorwoche", "Letzte Woche"],
  ["monat", "Letzter Monat"], ["3monate", "Letzte 3 Monate"], ["jahr", "Dieses Jahr"],
];
export type Bucket = "day" | "week" | "month";
export type Period = { key: PeriodKey; label: string; from: string; to: string; prevFrom: string; prevTo: string; bucket: Bucket; prevLabel: string };

const DAY = 86_400_000;
const d = (s: string) => Date.parse(`${s}T00:00:00Z`);
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const add = (s: string, n: number) => iso(d(s) + n * DAY);
const ym = (s: string) => [Number(s.slice(0, 4)), Number(s.slice(5, 7))] as const;
const monthStart = (y: number, m: number) => iso(Date.UTC(y, m - 1, 1));
const monthEnd = (y: number, m: number) => iso(Date.UTC(y, m, 0));
/** Montag der Woche (ISO). */
export const monday = (s: string) => add(s, -((new Date(d(s)).getUTCDay() + 6) % 7));

export function isPeriod(k: string | undefined | null): k is PeriodKey {
  return !!k && PERIODS.some(([p]) => p === k);
}

/** Zeitraum und Vergleichszeitraum (gleiche Länge davor bzw. gleiche Spanne im Vorjahr/Vormonat). */
export function period(key: PeriodKey, today: string): Period {
  const label = PERIODS.find(([k]) => k === key)![1];
  const [y, m] = ym(today);
  switch (key) {
    case "heute":
      return { key, label, from: today, to: today, prevFrom: add(today, -1), prevTo: add(today, -1), bucket: "day", prevLabel: "gestern" };
    case "gestern":
      return { key, label, from: add(today, -1), to: add(today, -1), prevFrom: add(today, -2), prevTo: add(today, -2), bucket: "day", prevLabel: "vorgestern" };
    case "woche": {
      const mo = monday(today);
      const n = (d(today) - d(mo)) / DAY;
      return { key, label, from: mo, to: today, prevFrom: add(mo, -7), prevTo: add(mo, -7 + n), bucket: "day", prevLabel: "gleiche Tage Vorwoche" };
    }
    case "vorwoche": {
      const mo = add(monday(today), -7);
      return { key, label, from: mo, to: add(mo, 6), prevFrom: add(mo, -7), prevTo: add(mo, -1), bucket: "day", prevLabel: "vorletzte Woche" };
    }
    case "monat": {
      const [py, pm] = m === 1 ? [y - 1, 12] : [y, m - 1];
      const [qy, qm] = pm === 1 ? [py - 1, 12] : [py, pm - 1];
      return { key, label, from: monthStart(py, pm), to: monthEnd(py, pm), prevFrom: monthStart(qy, qm), prevTo: monthEnd(qy, qm), bucket: "day", prevLabel: "Vormonat" };
    }
    case "3monate": {
      // die letzten drei vollen Kalendermonate vor dem laufenden Monat, verglichen mit den drei davor
      const back = (k: number) => { const t = new Date(Date.UTC(y, m - 1 - k, 1)); return [t.getUTCFullYear(), t.getUTCMonth() + 1] as const; };
      const [fy, fm] = back(3), [ty, tm] = back(1), [gy, gm] = back(6), [hy, hm] = back(4);
      return { key, label, from: monthStart(fy, fm), to: monthEnd(ty, tm), prevFrom: monthStart(gy, gm), prevTo: monthEnd(hy, hm), bucket: "week", prevLabel: "3 Monate davor" };
    }
    case "jahr": {
      const n = (d(today) - d(`${y}-01-01`)) / DAY;
      return { key, label, from: `${y}-01-01`, to: today, prevFrom: `${y - 1}-01-01`, prevTo: add(`${y - 1}-01-01`, n), bucket: "month", prevLabel: "gleicher Zeitraum Vorjahr" };
    }
  }
}

export type DailyRow = {
  day: string; country: string | null; sent: number; followups: number; bounced: number; replies: number; declined?: number; positive: number;
  samples_requested: number; samples_sent: number; customers: number; revenue_cents: number;
};
export const METRICS = ["sent", "followups", "bounced", "replies", "declined", "positive", "samples_requested", "samples_sent", "customers", "revenue_cents"] as const;
export type Metric = (typeof METRICS)[number];
export type Totals = Record<Metric, number>;

const inRange = (r: DailyRow, from: string, to: string, countries: string[]) =>
  r.day >= from && r.day <= to && !!r.country && countries.includes(r.country);

export function totals(rows: DailyRow[], from: string, to: string, countries: string[]): Totals {
  const t = Object.fromEntries(METRICS.map((k) => [k, 0])) as Totals;
  for (const r of rows) if (inRange(r, from, to, countries)) for (const k of METRICS) t[k] += Number(r[k] ?? 0);
  return t;
}

/** Umsatz (neue Abos) je Währung: US $, UK £, sonst €. */
export function revenueByCurrency(rows: DailyRow[], from: string, to: string, countries: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  for (const r of rows) {
    if (!inRange(r, from, to, countries) || !r.revenue_cents) continue;
    const c = r.country === "US" ? "$" : r.country === "UK" ? "£" : "€";
    out[c] = (out[c] ?? 0) + r.revenue_cents / 100;
  }
  return out;
}

/** Veränderung zum Vorzeitraum: ▲ 12 %, ▼ 30 %, „neu“, „±0“ oder „–“ (beide 0). */
export function delta(cur: number, prev: number): { text: string; dir: "up" | "down" | "flat" } {
  if (!cur && !prev) return { text: "–", dir: "flat" };
  // kleine Zahlen: absolute Änderung statt Prozent (Inhaber 03.10.2026: „▼ 100 %“ bei 1 → 0 wirkt dramatisch)
  if (Math.max(cur, prev) < 5) {
    const d = cur - prev;
    return d === 0 ? { text: "±0", dir: "flat" } : { text: d > 0 ? `+${d}` : `−${-d}`, dir: d > 0 ? "up" : "down" };
  }
  if (!prev) return { text: "neu", dir: "up" };
  const p = Math.round((100 * (cur - prev)) / prev);
  if (p === 0) return { text: "±0 %", dir: "flat" };
  return { text: `${p > 0 ? "▲" : "▼"} ${Math.abs(p)} %`, dir: p > 0 ? "up" : "down" };
}

/** Eimer für das Diagramm: Tage, Wochen (ab Montag) oder Monate zwischen from und to. */
export function buckets(from: string, to: string, bucket: Bucket): { key: string; from: string; to: string; label: string }[] {
  const out: { key: string; from: string; to: string; label: string }[] = [];
  const fmtD = (s: string) => `${s.slice(8, 10)}.${s.slice(5, 7)}.`;
  const MON = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];
  if (bucket === "day") {
    for (let s = from; s <= to; s = add(s, 1)) out.push({ key: s, from: s, to: s, label: fmtD(s) });
  } else if (bucket === "week") {
    for (let s = monday(from); s <= to; s = add(s, 7)) {
      const a = s < from ? from : s, e = add(s, 6) > to ? to : add(s, 6);
      out.push({ key: s, from: a, to: e, label: fmtD(a) });
    }
  } else {
    let [y, m] = ym(from);
    while (monthStart(y, m) <= to) {
      const a = monthStart(y, m), e = monthEnd(y, m) > to ? to : monthEnd(y, m);
      out.push({ key: a, from: a < from ? from : a, to: e, label: MON[m - 1] });
      [y, m] = m === 12 ? [y + 1, 1] : [y, m + 1];
    }
  }
  return out;
}

/** Werte einer Kennzahl je Eimer und Land (für gestapelte Säulen). */
export function series(rows: DailyRow[], from: string, to: string, bucket: Bucket, metric: Metric, countries: string[]) {
  return buckets(from, to, bucket).map((b) => {
    const parts: Record<string, number> = Object.fromEntries(countries.map((c) => [c, 0]));
    for (const r of rows) if (inRange(r, b.from, b.to, countries)) parts[r.country!] += Number(r[metric] ?? 0);
    return { day: b.key, from: b.from, to: b.to, label: b.label, parts, total: Object.values(parts).reduce((a, x) => a + x, 0) };
  });
}

/** Mehrere Kennzahlen je Eimer (über alle gezeigten Länder) – für das kombinierte Diagramm der Übersicht. */
export function multiSeries(rows: DailyRow[], from: string, to: string, bucket: Bucket, metrics: Metric[], countries: string[]) {
  return buckets(from, to, bucket).map((b) => {
    const t = totals(rows, b.from, b.to, countries);
    const parts = Object.fromEntries(metrics.map((m) => [m, t[m]]));
    return { day: b.key, from: b.from, to: b.to, label: b.label, parts, total: metrics.reduce((a, m) => a + t[m], 0) };
  });
}

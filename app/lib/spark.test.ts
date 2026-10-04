import { test } from "node:test";
import assert from "node:assert/strict";
import { count, dailyPoints, kpiPoints, lastDays, sparkAria, sparkPath, stationSparks, trendOf, type KpiRow } from "./spark.ts";
import type { DailyRow } from "./dashboard-periods.ts";

const row = (day: string, country: string, o: Partial<DailyRow> = {}): DailyRow => ({
  day, country, sent: 0, followups: 0, bounced: 0, replies: 0, positive: 0, samples_requested: 0, samples_sent: 0, customers: 0, revenue_cents: 0, ...o,
});
const k = (day: string, country: string, metric: string, value: number | null): KpiRow => ({ day, country, metric, value });

test("lastDays: älteste zuerst, bis heute", () => {
  assert.deepEqual(lastDays("2026-10-02", 3), ["2026-09-30", "2026-10-01", "2026-10-02"]);
});

test("dailyPoints: Summe über Länder und Kennzahlen, fehlender Tag = 0", () => {
  const days = lastDays("2026-10-03", 3);
  const rows = [row("2026-10-01", "US", { sent: 2, followups: 1 }), row("2026-10-03", "UK", { sent: 4 }), row("2026-10-03", "DE", { sent: 50 })];
  assert.deepEqual(dailyPoints(rows, days, ["US", "UK"], ["sent", "followups"]), [3, 0, 4]);
});

test("kpiPoints: fehlender Tag = null, Summe bzw. gewichtetes Mittel", () => {
  const days = lastDays("2026-10-03", 3);
  const rows = [k("2026-10-01", "US", "leads_neu", 10), k("2026-10-01", "UK", "leads_neu", 5), k("2026-10-03", "US", "leads_neu", 7),
    k("2026-10-03", "US", "freigabe_quote", 1), k("2026-10-03", "US", "freigabe_n", 300), k("2026-10-03", "UK", "freigabe_quote", 0.5), k("2026-10-03", "UK", "freigabe_n", 100),
    k("2026-10-02", "US", "freigabe_quote", null)];
  assert.deepEqual(kpiPoints(rows, days, "leads_neu", ["US", "UK"]), [15, null, 7]);
  assert.deepEqual(kpiPoints(rows, days, "freigabe_quote", ["US", "UK"], { weight: "freigabe_n", scale: 100 }), [null, null, 87.5]);
});

test("trendOf: flow vergleicht Summen voller Tage, heute zählt nicht", () => {
  const p = [...Array(7).fill(10), ...Array(7).fill(12), 999];
  const t = trendOf(p, "flow")!;
  assert.equal(t.cur, 84); assert.equal(t.prev, 70); assert.equal(t.pct, 20); assert.equal(t.few, false);
  assert.equal(trendOf(p.slice(1), "flow"), null);
  const lv = trendOf([...Array(7).fill(null), 100, null, null, null, null, null, 110, 120], "level")!;
  assert.equal(lv.few, true); // keine Vorwoche
  assert.equal(trendOf(Array(15).fill(null), "level"), null);
});

test("sparkPath: unter 2 Punkten keine Linie, Lücken bleiben leer", () => {
  assert.deepEqual(sparkPath([null, 3, null], 60, 16), { d: "", last: null, n: 1 });
  const a = sparkPath([0, 10, null, 5, 10], 42, 12, 1);
  assert.equal(a.n, 4);
  assert.equal(a.d, "M1 11L11 1 M31 6L41 1");
  assert.deepEqual(a.last, [41, 1]);
  assert.equal(sparkPath([4, 4, 4], 20, 10, 1).d, "M1 5L10 5L19 5");
  assert.equal(sparkPath([10, 20], 20, 10, 1).d, "M1 9L19 1");
});

test("stationSparks: kpi_daily wenn ≥ 2 Punkte, sonst dashboard_daily; Kunden in Gold", () => {
  const today = "2026-10-15";
  const daily = [row("2026-10-14", "US", { sent: 30, samples_sent: 2 }), row("2026-10-13", "UK", { sent: 10 })];
  const kpi = [k("2026-10-14", "US", "proben_bereit", 50), k("2026-10-14", "US", "leads_neu", 100), k("2026-10-13", "US", "leads_neu", 80),
    k("2026-10-14", "ALL", "mrr_cents", 12900)];
  const s = stationSparks(daily, kpi, today, ["US", "UK", "FR"]);
  assert.equal(s.lead.src, "kpi"); assert.deepEqual(s.lead.points, [null, null, null, null, 80, 100, null]);
  assert.equal(s.proben.src, "daily"); assert.equal(s.proben.label, "Proben raus je Tag"); // kpi nur 1 Punkt
  assert.deepEqual(s.versand.points, [0, 0, 0, 0, 10, 30, 0]);
  assert.equal(s.kunden.gold, true);
  assert.equal(s.bestand.src, "kpi"); assert.equal(count(s.bestand.points), 0); // ohne Linie
  assert.match(sparkAria(s.versand), /^Mails je Tag, 7 Tage: 0, 0, 0, 0, 10, 30, 0$/);
});

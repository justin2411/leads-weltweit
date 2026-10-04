import { test } from "node:test";
import assert from "node:assert/strict";
import { arrow, neckStreak, sumDaily, trend, trendLine, windows } from "./trend.ts";
import type { DailyRow } from "./dashboard-periods.ts";

const row = (day: string, country: string, o: Partial<DailyRow> = {}): DailyRow => ({
  day, country, sent: 0, followups: 0, bounced: 0, replies: 0, positive: 0, samples_requested: 0, samples_sent: 0, customers: 0, revenue_cents: 0, ...o,
});

test("windows: volle Tage bis gestern und die 7 davor", () => {
  assert.deepEqual(windows("2026-10-15"), { cur: { from: "2026-10-08", to: "2026-10-14" }, prev: { from: "2026-10-01", to: "2026-10-07" } });
});

test("trend: Prozent, Richtung, zu wenig Daten", () => {
  assert.deepEqual(trend(120, 100), { cur: 120, prev: 100, pct: 20, dir: "up", few: false });
  assert.equal(trend(80, 100).dir, "down");
  assert.equal(trend(5, 4).few, true); // n = 9 < 20
  assert.equal(trend(30, 0).few, true); // kein Vorwert
  assert.equal(trend(30, 0).pct, null);
  assert.equal(trend(100, 100).dir, "flat");
});

test("arrow: ▲/▼ mit %, leer bei zu wenig Daten", () => {
  assert.equal(arrow(trend(120, 100)), "▲ 20 %");
  assert.equal(arrow(trend(50, 100)), "▼ 50 %");
  assert.equal(arrow(trend(100, 100)), "±0 %");
  assert.equal(arrow(trend(3, 2)), "");
  assert.equal(arrow(null), "");
});

test("sumDaily: nur Zeitraum und Länder", () => {
  const rows = [row("2026-10-01", "US", { sent: 5 }), row("2026-10-02", "UK", { sent: 7 }), row("2026-10-03", "US", { sent: 1 }), { ...row("2026-10-02", "US", { sent: 99 }), country: null }];
  assert.equal(sumDaily(rows, "2026-10-01", "2026-10-02", ["US", "UK"], "sent"), 12);
  assert.equal(sumDaily(rows, "2026-10-01", "2026-10-03", ["US"], "sent"), 6);
});

test("trendLine: je Land 7 T (Vor-7 T), Quoten und Hinweis bei wenig Daten", () => {
  const rows = [
    row("2026-10-10", "US", { sent: 100, bounced: 2, replies: 3, positive: 1, samples_sent: 2 }),
    row("2026-10-03", "US", { sent: 80, bounced: 4, replies: 1 }),
    row("2026-10-15", "US", { sent: 500 }), // heute: zählt nicht
    row("2026-10-10", "UK", { sent: 5 }),
  ];
  const s = trendLine(rows, "2026-10-15", ["US", "UK", "FR"]);
  assert.match(s, /^US Mails 100 \(80\) ▲ 25 %, Bounce 2% \(5%\), Antw\. 3% \(1,3%\), positiv 1 \(0\), Proben 2 \(0\); /);
  assert.match(s, /UK Mails 5 \(0\), .*zu wenig Daten/);
  assert.match(s, /FR keine Daten$/);
  assert.ok(s.length < 400);
});

test("neckStreak: zusammenhängende Läufe derselben Station", () => {
  assert.deepEqual(neckStreak(["versand", "versand", "antworten", "versand"]), { station: "versand", runs: 2 });
  assert.equal(neckStreak([]), null);
  assert.equal(neckStreak([null, "x"]), null);
});

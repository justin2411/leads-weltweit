import { test } from "node:test";
import assert from "node:assert/strict";
import { buckets, delta, monday, period, revenueByCurrency, series, totals, type DailyRow } from "./dashboard-periods.ts";

test("Zeiträume: Kalenderlogik, Woche Mo–So, Vergleichszeitraum", () => {
  const t = "2026-10-03"; // Samstag
  assert.equal(monday(t), "2026-09-28");
  assert.deepEqual(period("heute", t), { key: "heute", label: "Heute", from: t, to: t, prevFrom: "2026-10-02", prevTo: "2026-10-02", bucket: "day", prevLabel: "gestern" });
  const w = period("woche", t);
  assert.deepEqual([w.from, w.to, w.prevFrom, w.prevTo], ["2026-09-28", "2026-10-03", "2026-09-21", "2026-09-26"]);
  const lw = period("vorwoche", t);
  assert.deepEqual([lw.from, lw.to, lw.prevFrom, lw.prevTo], ["2026-09-21", "2026-09-27", "2026-09-14", "2026-09-20"]);
  const m = period("monat", t);
  assert.deepEqual([m.from, m.to, m.prevFrom, m.prevTo], ["2026-09-01", "2026-09-30", "2026-08-01", "2026-08-31"]);
  const q = period("3monate", t);
  assert.deepEqual([q.from, q.to, q.prevFrom, q.prevTo, q.bucket], ["2026-07-01", "2026-09-30", "2026-04-01", "2026-06-30", "week"]);
  const y = period("jahr", t);
  assert.deepEqual([y.from, y.to, y.prevFrom, y.prevTo, y.bucket], ["2026-01-01", t, "2025-01-01", "2025-10-03", "month"]);
  const jan = period("monat", "2026-01-15");
  assert.deepEqual([jan.from, jan.to, jan.prevFrom], ["2025-12-01", "2025-12-31", "2025-11-01"]);
});

test("Summen, Umsatz je Währung, Veränderung, Eimer", () => {
  const z = { followups: 0, bounced: 0, replies: 0, positive: 0, samples_requested: 0, samples_sent: 0, customers: 0, revenue_cents: 0 };
  const rows: DailyRow[] = [
    { ...z, day: "2026-10-03", country: "US", sent: 40, replies: 2, customers: 1, revenue_cents: 12900 },
    { ...z, day: "2026-10-03", country: "UK", sent: 30, revenue_cents: 12900 },
    { ...z, day: "2026-10-02", country: "US", sent: 10 },
    { ...z, day: "2026-10-03", country: "NL", sent: 99 },
  ];
  const t = totals(rows, "2026-10-03", "2026-10-03", ["US", "UK", "FR"]);
  assert.equal(t.sent, 70);
  assert.equal(t.replies, 2);
  assert.deepEqual(revenueByCurrency(rows, "2026-10-01", "2026-10-03", ["US", "UK"]), { $: 129, "£": 129 });
  assert.deepEqual(delta(70, 10), { text: "▲ 600 %", dir: "up" });
  assert.deepEqual(delta(5, 10), { text: "▼ 50 %", dir: "down" });
  assert.equal(delta(3, 0).text, "+3");
  assert.deepEqual(delta(0, 1), { text: "−1", dir: "down" });
  assert.equal(delta(2, 2).text, "±0");
  assert.equal(delta(7, 0).text, "neu");
  assert.equal(delta(0, 0).text, "–");
  assert.deepEqual(buckets("2026-09-30", "2026-10-03", "week").map((b) => [b.from, b.to]), [["2026-09-30", "2026-10-03"]]);
  assert.deepEqual(buckets("2026-01-01", "2026-03-10", "month").map((b) => b.label), ["Jan", "Feb", "Mär"]);
  const s = series(rows, "2026-10-02", "2026-10-03", "day", "sent", ["US", "UK"]);
  assert.deepEqual(s.map((x) => x.total), [10, 70]);
  assert.deepEqual(s[1].parts, { US: 40, UK: 30 });
});

import { board } from "./dashboard-board.ts";

test("Wer ist wo: jede Firma in ihrer weitesten Stufe, Land-Filter, Website-Proben, Testkäufe raus", () => {
  const cols = board(
    {
      counts: [{ stage: "contacted", country: "US", n: 76 }, { stage: "contacted", country: "UK", n: 55 }, { stage: "out", country: "US", n: 1 }, { stage: "replied", country: "FR", n: 2 }],
      cards: [
        { id: "a", stage: "contacted", country: "US", company: "A", last_at: "2026-10-03T10:00:00Z", positive: false },
        { id: "b", stage: "replied", country: "FR", company: "B", last_at: "2026-10-03T11:00:00Z", positive: true },
      ],
    },
    [
      { id: "w1", company_name: "Web", country: "US", status: "sent", created_at: "2026-10-02T16:30:00Z", sent_at: "2026-10-02T21:20:00Z", segment_id: "S2" },
      { id: "w2", company_name: "Offen", country: "UK", status: "new", created_at: "2026-10-03T16:30:00Z", sent_at: null, segment_id: "S2" },
    ],
    [
      { id: "c1", company_name: "Echt", country: "US", created_at: "2026-10-01T00:00:00Z", status: "active", stripe: true, test_note: false },
      { id: "c2", company_name: "Test", country: "US", created_at: "2026-10-01T00:00:00Z", status: "trial", stripe: true, test_note: true },
    ],
    ["US", "UK"],
  );
  const by = Object.fromEntries(cols.map((c) => [c.id, c]));
  assert.deepEqual(cols.map((c) => c.id), ["contacted", "replied", "requested", "sample", "customer", "out"]);
  assert.equal(by.contacted.count, 131);
  assert.equal(by.replied.count, 0);
  assert.equal(by.requested.count, 1);
  assert.equal(by.sample.count, 1);
  assert.equal(by.sample.cards[0].source, "Website");
  assert.deepEqual(by.customer.cards.map((c) => c.company), ["Echt"]);
  assert.equal(by.out.count, 1);
  assert.equal(by.contacted.cards[0].href, "/dashboard/kontakte/a");
});

import { multiSeries } from "./dashboard-periods.ts";
test("Kombiniertes Diagramm: mehrere Kennzahlen je Tag", () => {
  const z = { followups: 0, bounced: 0, positive: 0, samples_requested: 0, samples_sent: 0, customers: 0, revenue_cents: 0 };
  const rows = [{ ...z, day: "2026-10-03", country: "US", sent: 40, replies: 2, positive: 1 }, { ...z, day: "2026-10-03", country: "UK", sent: 10, replies: 0 }];
  const r = multiSeries(rows as any, "2026-10-03", "2026-10-03", "day", ["sent", "replies", "positive"], ["US", "UK"]);
  assert.deepEqual(r[0].parts, { sent: 50, replies: 2, positive: 1 });
  assert.equal(r[0].from, "2026-10-03");
});

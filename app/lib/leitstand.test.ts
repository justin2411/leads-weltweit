import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coach, hall, laneOf, laneStats, utilization, type Beat, type RunRow } from "./leitstand.ts";
import { slotCounts } from "./owner-settings.ts";

const reg = JSON.parse(readFileSync(new URL("./werk-linien.json", import.meta.url), "utf8"));
const NOW = Date.parse("2026-10-03T20:00:00Z");
const at = (minAgo: number) => new Date(NOW - minAgo * 60_000).toISOString();

test("Linie eines Teils", () => {
  assert.equal(laneOf("lead-werk", "web-us-13"), "web-us");
  assert.equal(laneOf("lead-werk", "s1-us-lca-0"), "s1-us-lca");
  assert.equal(laneOf("kunden-werk", "pruefen 2/8"), "kunden");
  assert.equal(laneOf("kunden-werk", "nachpruefen"), null);
  assert.equal(laneOf("proben-vorrat", "run"), null);
});

test("Halle: 40 Plätze, laufende zuerst, dann eingeplante, freie, reservierte", () => {
  const plan = slotCounts(reg, {});
  const beats: Beat[] = [
    { werk: "lead-werk", part: "web-uk-1", started_at: at(20), beat_at: at(1), processed: 500, green: 30, note: null },
    { werk: "lead-werk", part: "web-us-0", started_at: at(20), beat_at: at(2), processed: 400, green: 20, note: null },
    { werk: "lead-werk", part: "web-us-1", started_at: at(30), beat_at: at(20), processed: 1, green: 0, note: null }, // alt -> nicht laufend
    { werk: "lead-werk", part: "web-us-2", started_at: at(30), beat_at: at(1), processed: 9, green: 1, note: "fertig" },
    { werk: "proben-vorrat", part: "run", started_at: at(3), beat_at: at(1), processed: 3, green: 1, note: null },
  ];
  const h = hall(reg, plan, beats, NOW);
  assert.equal(h.length, 40);
  assert.deepEqual(h.slice(0, 2).map((b) => b.part), ["web-us-0", "web-uk-1"]); // Reihenfolge der Linien
  assert.equal(h.filter((b) => b.state === "run").length, 2);
  assert.equal(h.filter((b) => b.state === "plan" && b.lane === "web-us").length, 20); // 21 geplant, 1 läuft
  assert.equal(h.filter((b) => b.state === "plan").length, 36);
  assert.equal(h[38].state, "other"); // Proben-Vorrat auf einem reservierten Platz
  assert.equal(h[39].state, "reserve");
  assert.deepEqual(h.map((b) => b.n), Array.from({ length: 40 }, (_, i) => i + 1));
});

test("Ertrag je Linie und Erschöpfung", () => {
  const rows: RunRow[] = [
    { werk: "lead-werk", part: "web-us-0", country: "US", started_at: at(120), finished_at: at(115), processed: 480, green: 20 },
    { werk: "lead-werk", part: "web-us-1", country: "US", started_at: at(120), finished_at: at(116), processed: 470, green: 22 },
    { werk: "lead-werk", part: "web-uk-0", country: "UK", started_at: at(120), finished_at: at(60), processed: 6000, green: 300 },
    { werk: "lead-werk", part: "web-uk-1", country: "UK", started_at: at(3000), finished_at: at(2000), processed: 1, green: 999 }, // älter als 24 h
  ];
  const s = laneStats(reg, rows, NOW);
  assert.equal(s["web-us"].runs, 2);
  assert.equal(s["web-us"].green, 42);
  assert.ok(s["web-us"].exhausted);
  assert.equal(s["web-uk"].runs, 1);
  assert.equal(s["web-uk"].perSlotH, 300);
  assert.equal(s["web-uk"].exhausted, false);
  assert.equal(s["web-fr"].runs, 0);
});

test("Auslastung: belegte Platz-Minuten / verfügbare", () => {
  const rows: RunRow[] = [{ werk: "lead-werk", part: "web-us-0", country: "US", started_at: at(60), finished_at: at(0), processed: 1, green: 1 }];
  const u = utilization(rows, [], NOW, 40, 2, 30);
  assert.equal(u.buckets.length, 4);
  assert.deepEqual(u.buckets.map((b) => b.slots), [0, 0, 1, 1]);
  assert.ok(Math.abs(u.rate - 60 / (120 * 40)) < 1e-9);
});

test("Coach: leere Plätze, erschöpfte Linie, Käufer knapp, Warteschlange", () => {
  const plan = slotCounts(reg, {});
  const rows: RunRow[] = [
    { werk: "lead-werk", part: "web-us-0", country: "US", started_at: at(120), finished_at: at(115), processed: 480, green: 20 },
    { werk: "lead-werk", part: "web-uk-0", country: "UK", started_at: at(120), finished_at: at(60), processed: 6000, green: 300 },
  ];
  const stats = laneStats(reg, rows, NOW);
  const tips = coach({ reg, plan, stats, util: 0.2, queue: { UK: 1560, US: 1879 }, freeBuyers: { UK: 759, US: 26000 }, leads: { US: 400000 }, capPerDay: 210, kundenNew24h: 0, failed: ["kunden-werk pruefen 2/8: RuntimeError"] });
  const titles = tips.map((t) => t.title);
  assert.equal(tips[0].level, "rot");
  assert.ok(titles.some((t) => t.includes("80 % der Zeit leer")));
  assert.ok(titles.some((t) => t.startsWith("Website-Prüfung USA: Vorrat erschöpft")));
  assert.ok(titles.some((t) => t.startsWith("Ergiebigste Linie: Website-Prüfung UK")));
  assert.ok(titles.includes("UK: Käufer werden knapp"));
  assert.ok(!titles.includes("US: Käufer werden knapp"));
  assert.ok(titles.some((t) => t.startsWith("Versand: Warteschlange reicht 16 Tage")));
  assert.ok(titles.includes("Kunden-Werk findet keine neuen Käufer"));
});

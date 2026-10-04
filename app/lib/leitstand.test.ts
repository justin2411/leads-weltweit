import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { coach, hall, laneOf, laneStats, neckTask, partRuns, utilization, type Beat, type RunRow } from "./leitstand.ts";
import { validateTask } from "./agents.ts";
import type { LaneRegistry } from "./owner-settings.ts";
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
  // jeder Hinweis außer reinen Infos lässt sich als fertiger Auftrag an einen Agenten ziehen (validateTask besteht)
  for (const t of tips.filter((x) => x.level !== "info" || x.task)) {
    assert.ok(t.task, `Auftrag fehlt: ${t.title}`);
    const v = validateTask({ agent: 1, kind: t.task!.kind, market: t.task!.market ?? "", brief: t.task!.brief });
    assert.equal(v.kind, t.task!.kind);
  }
  const usa = tips.find((t) => t.title.startsWith("Website-Prüfung USA"))!;
  assert.equal(usa.task!.kind, "quelle");
  assert.equal(usa.task!.market, "US");
  assert.equal(tips.find((t) => t.title === "UK: Käufer werden knapp")!.task!.market, "UK");
  assert.equal(neckTask("Antworten").kind, "frage");
});

test("partRuns: mehrere Zeilen je Teil (je Zielgruppe/Land) zählen als ein Teil", () => {
  const base = { werk: "lead-werk", part: "web-us-0", run_id: "r1", country: "US", started_at: "2026-10-03T19:00:00Z", finished_at: "2026-10-03T19:30:00Z", processed: 10, green: 2 };
  const rows: RunRow[] = [base, { ...base, country: "UK", green: 1 }, { ...base, country: "FR" }, { ...base, country: "IE", finished_at: "2026-10-03T19:31:00Z" }];
  const parts = partRuns(rows);
  assert.equal(parts.length, 1);
  assert.equal(parts[0].green, 7);
  assert.equal(parts[0].finished_at, "2026-10-03T19:31:00Z");
  const s = laneStats(reg, rows, NOW);
  assert.equal(s["web-us"].runs, 1);
  assert.equal(Math.round(s["web-us"].avgRunMin!), 31);
  // Auslastung: 31 Platz-Minuten, nicht 4 × 31
  const u = utilization(rows, [], NOW, 40, 2, 30);
  const used = u.rate * 120 * 40;  // belegte Platz-Minuten im Fenster
  assert.ok(Math.abs(used - 31) < 0.5, `belegt ${used}`);
});

test("Coach mit Autopilot: Platz-Hinweise nur zur Info, kein Auftrag zum Umstellen", () => {
  const reg = { total_slots: 40, reserve: 2, lanes: [
    { id: "a", werk: "lead-werk", label: "Linie A", short: "A", what: "", max: 20, default: 2, country: "US" },
    { id: "b", werk: "lead-werk", label: "Linie B", short: "B", what: "", max: 20, default: 2, country: "UK" },
  ] } as unknown as LaneRegistry;
  const stats = {
    a: { id: "a", runs: 2, processed: 100, green: 10, slotMin: 40, perSlotH: 15, avgRunMin: 2, perRun: 5, last: null, exhausted: true },
    b: { id: "b", runs: 2, processed: 500, green: 300, slotMin: 120, perSlotH: 150, avgRunMin: 60, perRun: 150, last: null, exhausted: false },
  };
  const base = { reg, plan: { a: 6, b: 1 }, stats, util: 0.1, queue: {}, freeBuyers: {}, leads: {}, capPerDay: 100, kundenNew24h: 5, failed: [] };
  const off = coach(base);
  const on = coach({ ...base, autopilot: true });
  assert.equal(off.find((t) => t.title.startsWith("Plätze"))?.level, "gelb");
  assert.ok(off.find((t) => t.title.startsWith("Plätze"))?.task);
  const util = on.find((t) => t.title.startsWith("Plätze"))!;
  assert.equal(util.level, "info");
  assert.equal(util.task, undefined);
  assert.match(util.text, /Autopilot/);
  const ex = on.find((t) => t.title === "Linie A: Vorrat erschöpft")!;
  assert.equal(ex.level, "info");
  assert.equal(ex.task?.kind, "quelle"); // neue Quelle suchen bleibt ein sinnvoller Auftrag
  assert.doesNotMatch(ex.task!.brief, /Plätze dieser Linie/);
  assert.equal(on.find((t) => t.title.startsWith("Ergiebigste"))?.task, undefined);
});

test("Alarme: offene Antworten und leerer Proben-Vorrat zuerst, nie aus fehlenden Zahlen", async () => {
  const { alarmTips, rankTips } = await import("./leitstand.ts");
  assert.deepEqual(alarmTips({ openReplies: null, samplesReady: null, samplesTarget: 6 }), []);
  assert.deepEqual(alarmTips({ openReplies: 0, samplesReady: 3, samplesTarget: 6 }), []);
  const a = alarmTips({ openReplies: 2, samplesReady: 0, samplesTarget: 6 });
  assert.deepEqual(a.map((t) => t.title), ["2 Antworten offen", "Proben-Vorrat leer"]);
  assert.equal(alarmTips({ openReplies: 1, samplesReady: 1, samplesTarget: 6 })[0].title, "1 Antwort offen");
  // Reihenfolge: rot vor gelb vor grün vor Info, sonst stabil
  const ranked = rankTips([{ level: "info", title: "i" }, { level: "gelb", title: "g1" }, { level: "rot", title: "r" }, { level: "gelb", title: "g2" }, { level: "gruen", title: "gr" }]);
  assert.deepEqual(ranked.map((t) => t.title), ["r", "g1", "g2", "gr", "i"]);
});

test("JARVIS empfiehlt: kurz, mit Auftrag zuerst, Rest für die Chips", async () => {
  const { recommend, shortText } = await import("./leitstand.ts");
  assert.equal(shortText("Erster Satz. Zweiter Satz."), "Erster Satz.");
  assert.equal(shortText("Kein Punkt"), "Kein Punkt");
  const long = shortText("Wort ".repeat(40).trim() + ".", 40);
  assert.ok(long.length <= 40 && long.endsWith("…"), long);
  assert.equal(shortText("Version 1.5 ist da. Mehr"), "Version 1.5 ist da."); // Punkt in Zahl beendet keinen Satz
  const task = { kind: "kaeufer" as const, market: "UK", brief: "Käufer UK" };
  const tips = [
    { level: "info" as const, title: "Noch keine Laufzahlen", text: "x" },
    { level: "gruen" as const, title: "Ergiebig", text: "Mehr Plätze. Sonst nichts.", href: "#pult", task },
    { level: "gelb" as const, title: "Antworten offen", text: "Lesen.", href: "/dashboard/antworten" },
    { level: "gelb" as const, title: "UK knapp", text: "Käufer werden knapp.", task },
    { level: "rot" as const, title: "Teil abgebrochen", text: "lead-werk web-us-1", task: { ...task, kind: "pruefen" as const } },
  ];
  const { recs, rest } = recommend(tips);
  assert.deepEqual(recs.map((r) => r.title), ["Teil abgebrochen", "UK knapp", "Ergiebig"]); // Aufträge zuerst, nach Wichtigkeit
  assert.equal(recs[2].short, "Mehr Plätze.");
  assert.deepEqual(rest.map((r) => r.title), ["Antworten offen", "Noch keine Laufzahlen"]);
  // nur ein Auftrag: mit Hinweisen mit Ziel auffüllen, reine Info nie
  const r2 = recommend([tips[0], tips[1], tips[2]]);
  assert.deepEqual(r2.recs.map((r) => r.title), ["Antworten offen", "Ergiebig"]);
  assert.deepEqual(recommend([tips[0]]).recs, []);
});

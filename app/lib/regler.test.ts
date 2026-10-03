import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULTS, InputError, merge, validateSlotPlan, type LaneRegistry, type OwnerSettings } from "./owner-settings.ts";
import {
  CARDS, LEAD_COUNTRIES, capOf, countryOf, countryOn, diff, draftFrom, fmtBerlin, fmtWhen, laneRoom, leadLanes, leadMax, leadTotal, nextRun,
  presets, scalePlan, setCountry, setLane, status, toSettings, validateValue, versandStopText, type Ack, type ReglerCtx,
} from "./regler.ts";

const reg: LaneRegistry = JSON.parse(readFileSync(new URL("./werk-linien.json", import.meta.url), "utf8"));
const ctx: ReglerCtx = {
  reg, pages: ["S2/US", "S2/UK", "S2/FR", "S4/US"], buyerCountries: ["US", "UK", "FR"],
  proben: { fokus_je_seite: 6, andere_je_seite: 3, max_alter_stunden: 48 }, fokus: ["S2/US", "S2/UK", "S2/FR"],
};
const S = (o: Partial<OwnerSettings> = {}): OwnerSettings => ({ ...DEFAULTS, ...o });
const NOW = new Date("2026-10-03T19:43:00Z"); // 21:43 MESZ
const defaults = () => draftFrom(DEFAULTS, ctx).slot_plan;
const check = (p: Record<string, number>) => {
  for (const l of reg.lanes) assert.ok(Number.isInteger(p[l.id]) && p[l.id] >= 0 && p[l.id] <= l.max, `${l.id}=${p[l.id]}`);
  assert.ok(Object.values(p).reduce((a, b) => a + b, 0) <= capOf(reg));
  assert.deepEqual(validateSlotPlan(p, reg), p);
};

test("Karten: acht Werke, Direktstart nur Lead-/Kunden-Werk und Proben-Vorrat, Zeitpläne aus den Workflows", () => {
  assert.deepEqual(CARDS.map((c) => c.key), ["lead-werk", "kunden-werk", "proben-vorrat", "antworten", "nachfass", "versand", "kundenlieferung", "tagescheck"]);
  assert.deepEqual(CARDS.filter((c) => c.start).map((c) => c.start), ["lead-werk", "kunden-werk", "proben-vorrat"]);
  for (const c of CARDS) {
    const yml = readFileSync(new URL(`../../.github/workflows/${c.file}`, import.meta.url), "utf8");
    assert.ok(yml.includes(`"${c.cron}"`), `${c.file}: ${c.cron}`);
    assert.doesNotThrow(() => nextRun(c.cron, NOW));
  }
  assert.equal(CARDS.find((c) => c.key === "versand")!.start, null);
  assert.equal(versandStopText({ versand: { aktiv: false } }), "gestoppt (config/versand.yaml, deine Entscheidung 28.09.)");
  assert.equal(versandStopText({ versand: { aktiv: true } }), null);
});

test("nächster Lauf: */n, a-b, feste Stunde, Wochentag", () => {
  assert.equal(nextRun("23 */3 * * *", NOW).toISOString(), "2026-10-03T21:23:00.000Z");
  assert.equal(nextRun("41 */2 * * *", NOW).toISOString(), "2026-10-03T20:41:00.000Z");
  assert.equal(nextRun("23 * * * *", NOW).toISOString(), "2026-10-03T20:23:00.000Z");
  assert.equal(nextRun("7 6-21 * * *", NOW).toISOString(), "2026-10-03T20:07:00.000Z");
  assert.equal(nextRun("7 6-21 * * *", new Date("2026-10-03T21:07:00Z")).toISOString(), "2026-10-04T06:07:00.000Z"); // genau jetzt -> nächster
  assert.equal(nextRun("37 17 * * *", NOW).toISOString(), "2026-10-04T17:37:00.000Z");
  assert.equal(nextRun("53 4 * * 1", NOW).toISOString(), "2026-10-05T04:53:00.000Z"); // Sa -> Mo
  assert.equal(nextRun("53 4 * * 1", new Date("2026-10-05T04:52:59Z")).toISOString(), "2026-10-05T04:53:00.000Z");
  assert.throws(() => nextRun("x * * * *", NOW));
});

test("deutsche Zeit: Sommer-/Winterzeit (Umstellung 25.10.2026), heute/morgen/Wochentag", () => {
  assert.equal(fmtBerlin(nextRun("37 17 * * *", new Date("2026-10-24T12:00:00Z"))), "19:37"); // MESZ
  assert.equal(fmtBerlin(nextRun("37 17 * * *", new Date("2026-10-25T12:00:00Z"))), "18:37"); // MEZ
  const n = new Date("2026-10-24T23:30:00Z"); // 01:30 MESZ am 25.10.
  assert.equal(fmtWhen(nextRun("23 */3 * * *", n), n), "02:23"); // 00:23 UTC = 02:23 MESZ
  assert.equal(fmtWhen("2026-10-25T01:23:00Z", n), "02:23"); // 01:23 UTC = 02:23 MEZ (nach der Umstellung)
  assert.equal(fmtWhen("2026-10-25T22:30:00Z", n), "23:30"); // derselbe (25-Stunden-)Tag
  assert.equal(fmtWhen("2026-10-25T23:30:00Z", n), "morgen 00:30");
  assert.equal(fmtWhen(nextRun("37 17 * * *", NOW), NOW), "morgen 19:37");
  assert.equal(fmtWhen(nextRun("53 4 * * 1", NOW), NOW), "Mo 06:53");
  assert.equal(fmtWhen(nextRun("41 */2 * * *", NOW), NOW), "22:41");
  assert.equal(fmtWhen(null, NOW), "–");
});

test("Tempo: Summe ≤ Obergrenze, je Linie ≤ max, ganze Zahlen, anteilig, abgeschaltete Länder bleiben aus", () => {
  const d = defaults();
  assert.equal(leadTotal(d, reg), 30);
  for (let t = -3; t <= 45; t++) {
    const p = scalePlan(d, reg, t);
    check(p);
    assert.equal(leadTotal(p, reg), Math.max(0, Math.min(t, leadMax(d, reg))));
    assert.equal(p.kunden, d.kunden); // Kunden-Linie bleibt
    assert.equal(p["s1-us-lca"], 0); // Gewicht 0 bleibt 0
  }
  const half = scalePlan(d, reg, 15);
  assert.ok(half["web-us"] > half["web-uk"] && half["web-uk"] >= half["web-fr"]);
  // max greift: alles auf UK -> höchstens 21
  const ukOnly = setCountry(setCountry(setCountry(d, reg, "US", false), reg, "FR", false), reg, "Nord", false);
  assert.equal(leadMax(ukOnly, reg), 21);
  assert.equal(scalePlan(ukOnly, reg, 30)["web-uk"], 21);
  assert.equal(countryOn(scalePlan(ukOnly, reg, 30), reg, "US"), false);
  // von 0 wieder hoch -> Standardgewichte
  check(scalePlan(scalePlan(d, reg, 0), reg, 20));
  assert.equal(leadTotal(scalePlan(scalePlan(d, reg, 0), reg, 20), reg), 20);
  // Kunden-Werk voll -> weniger Platz für Leads
  const k16 = setLane(scalePlan(d, reg, 10), reg, "kunden", 16);
  assert.equal(k16.kunden, 16);
  assert.equal(leadMax(k16, reg), 22);
  check(scalePlan(k16, reg, 99));
});

test("Vorgaben Sparsam / Standard / Voll", () => {
  const d = defaults();
  const p = presets(d, reg);
  assert.deepEqual(p.map((x) => x.id), ["sparsam", "standard", "voll"]);
  assert.deepEqual(p.map((x) => x.total), [10, 30, 30]);
  for (const x of p) check(scalePlan(d, reg, x.total));
  const k4 = setLane(d, reg, "kunden", 4);
  assert.deepEqual(presets(k4, reg).map((x) => x.total), [10, 30, 34]);
});

test("Länder-Chips: aus -> 0, an -> Standard, andere rücken bei Enge zusammen", () => {
  const d = defaults();
  assert.deepEqual(LEAD_COUNTRIES.map((c) => c.id), ["US", "UK", "FR", "Nord"]);
  const noUs = setCountry(d, reg, "US", false);
  assert.equal(noUs["web-us"] + noUs["s2-us"] + noUs["s1-us-lca"], 0);
  assert.equal(countryOn(noUs, reg, "US"), false);
  check(noUs);
  const full = scalePlan(noUs, reg, 30); // UK/FR/Nord teilen sich 30
  check(full);
  const back = setCountry(full, reg, "US", true);
  check(back);
  assert.equal(back["web-us"], 21);
  assert.equal(back["s2-us"], 2);
  assert.ok(countryOn(back, reg, "UK") && countryOn(back, reg, "Nord"));
  assert.equal(leadTotal(back, reg), 30);
  const nord = setCountry(setCountry(d, reg, "Nord", false), reg, "Nord", true);
  assert.equal(nord["web-north"], 1);
  assert.throws(() => setCountry(d, reg, "XX" as never, true), InputError);
});

test("Kunden-Plätze: 0 … min(max, frei)", () => {
  const d = defaults();
  assert.equal(laneRoom(d, reg, "kunden"), 8);
  assert.equal(setLane(d, reg, "kunden", 12).kunden, 8);
  const small = scalePlan(d, reg, 10);
  assert.equal(laneRoom(small, reg, "kunden"), 16);
  assert.equal(setLane(small, reg, "kunden", 20).kunden, 16);
  assert.equal(setLane(small, reg, "kunden", -2).kunden, 0);
  check(setLane(small, reg, "kunden", 16));
});

test("diff und toSettings: Hin- und Rückweg", () => {
  const saved = merge([
    { key: "sample_targets", value: { "S2/US": 50, "S2/UK": 30, "S2/FR": 30 } },
    { key: "werke_paused", value: { tagescheck: "2026-10-02T10:00:00.000Z" } },
  ]);
  const d0 = draftFrom(saved, ctx);
  assert.deepEqual(diff(saved, d0, ctx), []);
  assert.equal(d0.sample_targets["S4/US"], 3);
  assert.equal(d0.sample_max_age_hours, 48);
  assert.equal(d0.followup_days, 4);
  assert.equal(d0.on.tagescheck, false);

  const d = structuredClone(d0);
  d.on["lead-werk"] = false;
  d.on.tagescheck = true;
  d.on.versand = false;
  d.on.nachfass = false;
  d.slot_plan = setCountry(scalePlan(d.slot_plan, reg, 20), reg, "Nord", false);
  d.slot_plan = setLane(d.slot_plan, reg, "kunden", 12);
  d.buyer_countries_off = ["FR"];
  d.sample_targets["S2/US"] = 40;
  d.sample_max_age_hours = 72;
  d.followup_days = 6;
  const ch = diff(saved, d, ctx);
  assert.deepEqual(ch.map((c) => c.text), [
    "Lead-Werk an → aus", "Tempo 30 → 19 Plätze", "Leads Nord an → aus", "Plätze 8 → 12", "Käufer FR an → aus",
    "Soll S2/US 50 → 40", "Verfall 48 → 72 h", "Nachfassmails an → aus", "Nachfass nach 4 → 6 Tagen", "Versand an → aus", "Tagescheck aus → an",
  ]);
  const NOW_ISO = "2026-10-03T19:43:00.000Z";
  const next = toSettings(ch, saved, NOW_ISO);
  assert.deepEqual(next.werke_paused, { "lead-werk": NOW_ISO });
  assert.equal(next.send_paused, true);
  assert.equal(next.followup_enabled, false);
  assert.deepEqual(next.sample_targets, { "S2/US": 40, "S2/UK": 30, "S2/FR": 30 }); // nur Geändertes, Rest bleibt
  assert.deepEqual(next.buyer_countries_off, ["FR"]);
  for (const [k, v] of Object.entries(next)) assert.deepEqual(validateValue(k as keyof OwnerSettings, v, ctx), v);
  const after = merge(Object.entries({ ...saved, ...next }).map(([key, value]) => ({ key, value })));
  assert.deepEqual(diff(after, d, ctx), []);
  assert.deepEqual(draftFrom(after, ctx), d);
  // Zeitstempel bleiben beim Umschalten eines anderen Werks
  const p2 = toSettings(diff(saved, { ...d0, on: { ...d0.on, kundenlieferung: false } }, ctx), saved, NOW_ISO);
  assert.deepEqual(p2.werke_paused, { tagescheck: "2026-10-02T10:00:00.000Z", kundenlieferung: NOW_ISO });
});

test("diff: Umverteilung ohne Summen-/Länderänderung wird trotzdem erkannt", () => {
  const d = draftFrom(DEFAULTS, ctx);
  const p = { ...d.slot_plan, "web-us": 20, "web-uk": 6 };
  const ch = diff(DEFAULTS, { ...d, slot_plan: p }, ctx);
  assert.deepEqual(ch.map((c) => c.part), ["belegung"]);
  assert.deepEqual(toSettings(ch, DEFAULTS, "x").slot_plan, p);
});

test("validateValue: so streng wie owner-settings.ts", () => {
  assert.throws(() => validateValue("slot_plan", { ...defaults(), kunden: 17 }, ctx), InputError);
  assert.throws(() => validateValue("slot_plan", { ...defaults(), kunden: 16 }, ctx), /höchstens 38/);
  assert.throws(() => validateValue("sample_targets", { "S2/US": 101 }, ctx), InputError);
  assert.throws(() => validateValue("sample_targets", { "../x": 1 }, ctx), /Seite/);
  assert.throws(() => validateValue("sample_max_age_hours", 23, ctx), InputError);
  assert.throws(() => validateValue("followup_days", 11, ctx), InputError);
  assert.throws(() => validateValue("buyer_countries_off", ["DE"], ctx), /Land/);
  assert.throws(() => validateValue("werke_paused", { versand: "2026-10-03T00:00:00Z" }, ctx), /Werk/);
  assert.throws(() => validateValue("werke_paused", { "lead-werk": "gestern" }, ctx), /Zeit/);
  assert.throws(() => validateValue("send_paused", "false", ctx), InputError);
  assert.throws(() => validateValue("send_country_limits", { US: 5 }, ctx), /nicht im Regler/);
  assert.deepEqual(validateValue("buyer_countries_off", ["UK", "FR", "UK"], ctx), ["FR", "UK"]);
});

test("Zustand: noch nie geändert, wartet, start angefordert, angewandt, pausiert", () => {
  const base = { acks: [] as Ack[], startRequests: [], now: NOW, reg };
  assert.equal(status("antworten", { ...base, updatedAt: {} }).kind, "noch nie geändert");
  const upd = { sample_targets: "2026-10-03T19:40:00Z" };
  const w = status("proben-vorrat", { ...base, updatedAt: upd });
  assert.equal(w.kind, "wartet");
  assert.equal(w.text, "wird angewandt um ca. 22:23");
  assert.equal(w.savedAt, "2026-10-03T19:40:00Z");
  const req = { workflow: "proben-vorrat", status: "offen" as const, created_at: "2026-10-03T19:41:00Z", started_at: null };
  const s = status("proben-vorrat", { ...base, updatedAt: upd, startRequests: [req] });
  assert.equal(s.kind, "start angefordert");
  assert.equal(s.text, "Start angefordert – spätestens 21:56");
  // alter offener Wunsch zählt nicht mehr
  assert.equal(status("proben-vorrat", { ...base, updatedAt: upd, startRequests: [{ ...req, created_at: "2026-10-03T16:00:00Z" }] }).kind, "wartet");
  assert.match(status("proben-vorrat", { ...base, updatedAt: upd, startRequests: [{ ...req, status: "gestartet", started_at: "2026-10-03T19:42:00Z" }] }).text, /^gestartet 21:42/);
  const old: Ack = { werk: "proben-vorrat", key: "sample_targets", seen_at: "2026-10-03T19:23:00Z", value: { "S2/US": 50 } };
  assert.equal(status("proben-vorrat", { ...base, updatedAt: upd, acks: [old] }).kind, "wartet");
  const a = status("proben-vorrat", { ...base, updatedAt: upd, acks: [old, { ...old, seen_at: "2026-10-03T19:42:10Z" }, { ...old, werk: "lead-werk", seen_at: "2026-10-03T19:50:00Z" }] });
  assert.equal(a.kind, "angewandt");
  assert.equal(a.text, "angewandt 21:42 (Proben-Vorrat)");
  assert.equal(a.at, "2026-10-03T19:42:10Z");
  // gemeinsamer Schlüssel: Pause eines anderen Werks ändert updated_at, das Werk liest aber denselben Teil -> angewandt
  const saved = S({ werke_paused: { tagescheck: "2026-10-03T19:40:00Z" } });
  const wpAck: Ack = { werk: "kundenlieferung", key: "werke_paused", seen_at: "2026-10-03T04:53:00Z", value: {} };
  assert.equal(status("kundenlieferung", { ...base, saved, updatedAt: { werke_paused: "2026-10-03T19:40:00Z" }, acks: [wpAck] }).kind, "angewandt");
  assert.equal(status("tagescheck", { ...base, saved, updatedAt: { werke_paused: "2026-10-03T19:40:00Z" }, acks: [{ ...wpAck, werk: "tagescheck" }] }).kind, "wartet");
  // Plan-Teil des Kunden-Werks unverändert -> angewandt, obwohl Lead-Linien geändert wurden
  const plan = scalePlan(defaults(), reg, 12);
  const sp = { ...base, saved: S({ slot_plan: plan }), updatedAt: { slot_plan: "2026-10-03T19:40:00Z" } };
  const spAck = (werk: string): Ack => ({ werk, key: "slot_plan", seen_at: "2026-10-03T18:41:00Z", value: {} });
  assert.equal(status("kunden-werk", { ...sp, acks: [spAck("kunden-werk")] }).kind, "angewandt");
  assert.equal(status("lead-werk", { ...sp, acks: [spAck("lead-werk")] }).kind, "wartet");
  // pausiertes Werk: Plan greift erst nach dem Einschalten
  const paused = S({ slot_plan: plan, werke_paused: { "lead-werk": "2026-10-03T19:00:00Z" } });
  const p = status("lead-werk", { ...base, saved: paused, updatedAt: { slot_plan: "2026-10-03T19:40:00Z", werke_paused: "2026-10-03T19:00:00Z" }, acks: [{ werk: "lead-werk", key: "werke_paused", seen_at: "2026-10-03T19:23:00Z", value: { "lead-werk": "x" } }] });
  assert.equal(p.text, "pausiert – greift nach dem Einschalten");
  // Wochen-Werk: nächster Lauf mit Wochentag
  assert.equal(status("kundenlieferung", { ...base, updatedAt: { werke_paused: "2026-10-03T19:40:00Z" } }).text, "wird angewandt um ca. Mo 06:53");
});

test("Lead-Linien je Land wie werk-linien.json", () => {
  const by = Object.fromEntries(LEAD_COUNTRIES.map((c) => [c.id, leadLanes(reg).filter((l) => countryOf(l) === c.id).map((l) => l.id)]));
  assert.deepEqual(by, { US: ["web-us", "s2-us", "s1-us-lca"], UK: ["web-uk", "s1-uk-tender"], FR: ["web-fr"], Nord: ["web-north"] });
});

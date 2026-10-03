import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DEFAULTS, merge, type LaneRegistry } from "./owner-settings.ts";
import { diff, draftFrom, scalePlan, validateValue, type ReglerCtx } from "./regler.ts";
import { REGLER_KEYS, entryOf, isReglerKey, undoValue, type LogRow } from "./regler-verlauf.ts";

const reg: LaneRegistry = JSON.parse(readFileSync(new URL("./werk-linien.json", import.meta.url), "utf8"));
const ctx: ReglerCtx = {
  reg, pages: ["S2/US", "S2/UK", "S2/FR"], buyerCountries: ["US", "UK", "FR"],
  proben: { fokus_je_seite: 6, andere_je_seite: 3, max_alter_stunden: 48 }, fokus: ["S2/US", "S2/UK", "S2/FR"],
};
const row = (key: string, oldV: unknown, newV: unknown, target: string | null = null): LogRow =>
  ({ id: 7, action: `setting:${key}`, target, old_value: oldV, new_value: newV, created_at: "2026-10-03T19:43:00Z", created_by: "Inhaber Dashboard" });
const NOW = "2026-10-03T20:00:00.000Z";

test("Regler-Schlüssel: ohne Versand-Limits und Versand-Länder", () => {
  assert.ok(REGLER_KEYS.includes("slot_plan") && REGLER_KEYS.includes("send_paused") && REGLER_KEYS.includes("followup_days"));
  assert.ok(!isReglerKey("send_country_limits") && !isReglerKey("send_countries_off") && !isReglerKey("x"));
});

test("Verlauf: kurze Texte je Änderung, Rückgängig nur für Regler-Schlüssel", () => {
  const e = entryOf(row("sample_targets", null, { "S2/US": 50, "S2/UK": 30, "S2/FR": 30 }), ctx)!;
  assert.deepEqual(e.texts, ["Soll S2/US 6 → 50", "Soll S2/UK 6 → 30", "Soll S2/FR 6 → 30"]);
  assert.equal(e.undo, true);
  const w = entryOf(row("werke_paused", {}, { "lead-werk": "2026-10-03T19:00:00Z" }), ctx)!;
  assert.deepEqual(w.texts, ["Lead-Werk an → aus"]);
  const sp = entryOf(row("send_paused", false, true), ctx)!;
  assert.deepEqual(sp.texts, ["Versand an → aus"]);
  const lim = entryOf(row("send_country_limits", {}, { US: 40 }), ctx)!;
  assert.deepEqual(lim.texts, ["Mails pro Tag geändert"]);
  assert.equal(lim.undo, false);
  const plan = scalePlan(draftFrom(DEFAULTS, ctx).slot_plan, reg, 10);
  assert.equal(entryOf(row("slot_plan", null, plan), ctx)!.texts[0], "Tempo 30 → 10 Plätze");
  assert.equal(entryOf(row("slot_plan", plan, plan), ctx)!.undo, false);
  assert.equal(entryOf({ ...row("x", 1, 2), action: "workflow:start" }, ctx), null);
  assert.equal(entryOf(row("followup_days", 4, 6, "rückgängig #3"), ctx)!.undone, true);
});

test("Rückgängig: werke_paused nur die Werke dieser Änderung, andere bleiben", () => {
  const cur = { "lead-werk": "2026-10-03T19:00:00Z", tagescheck: "2026-10-03T19:30:00Z" };
  const v = undoValue("werke_paused", {}, { "lead-werk": "2026-10-03T19:00:00Z" }, cur, NOW);
  assert.deepEqual(v, { tagescheck: "2026-10-03T19:30:00Z" });
  const back = undoValue("werke_paused", { antworten: "x" }, {}, {}, NOW);
  assert.deepEqual(back, { antworten: NOW });
  assert.doesNotThrow(() => validateValue("werke_paused", back, ctx));
});

test("Rückgängig: Proben-Soll nur die Seiten dieser Änderung, Standard = Schlüssel weg", () => {
  const v = undoValue("sample_targets", { "S2/US": 20 }, { "S2/US": 50, "S2/UK": 30 }, { "S2/US": 50, "S2/UK": 30, "S2/FR": 9 }, NOW);
  assert.deepEqual(v, { "S2/US": 20, "S2/FR": 9 });
  assert.deepEqual(validateValue("sample_targets", v, ctx), { "S2/US": 20, "S2/FR": 9 });
});

test("Rückgängig: einfache Werte, leer = Standard; Ergebnis besteht die Prüfung", () => {
  assert.equal(undoValue("send_paused", null, true, true, NOW), false);
  assert.equal(undoValue("followup_enabled", null, false, false, NOW), true);
  assert.equal(undoValue("followup_days", null, 6, 6, NOW), null);
  assert.equal(undoValue("sample_max_age_hours", 36, 48, 48, NOW), 36);
  assert.deepEqual(undoValue("buyer_countries_off", null, ["FR"], ["FR"], NOW), []);
  assert.deepEqual(undoValue("slot_plan", null, { kunden: 4 }, { kunden: 4 }, NOW), {});
  assert.throws(() => undoValue("send_country_limits", {}, { US: 1 }, {}, NOW));
  // Runde: ändern -> zurück ergibt wieder keinen Unterschied zum Ausgangsstand
  const before = merge([{ key: "buyer_countries_off", value: ["UK"] }]);
  const after = merge([{ key: "buyer_countries_off", value: ["UK", "FR"] }]);
  const undone = merge([{ key: "buyer_countries_off", value: undoValue("buyer_countries_off", ["UK"], ["UK", "FR"], after.buyer_countries_off, NOW) }]);
  assert.deepEqual(diff(before, draftFrom(undone, ctx), ctx), []);
});

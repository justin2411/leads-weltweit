import { test } from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULTS, InputError, effectiveLimit, merge, toggleIn, validateCountryLimits, validateCustomer, validateFollowupDays,
  validateMaxAge, validateNote, validateReplyKind, validateSampleTargets,
} from "./owner-settings.ts";

const YAML = { US: { allowed: true, daily_limit: 110 }, UK: { allowed: true, daily_limit: 100 }, FR: { allowed: true, daily_limit: 60 }, DE: { allowed: false, daily_limit: 20 } };

test("Mails pro Tag je Land: nie über countries.yaml, nur Mail-Länder, leer = Standard", () => {
  assert.deepEqual(validateCountryLimits({ US: "40", UK: "", FR: "60" }, YAML, ["US", "UK", "FR"]), { US: 40, FR: 60 });
  assert.throws(() => validateCountryLimits({ FR: "61" }, YAML, ["FR"]), InputError);
  assert.throws(() => validateCountryLimits({ US: "-1" }, YAML, ["US"]), InputError);
  assert.throws(() => validateCountryLimits({ US: "4.5" }, YAML, ["US"]), InputError);
  assert.throws(() => validateCountryLimits({ DE: "5" }, YAML, ["DE"]), /kein Mail-Land/);
  const s = { ...DEFAULTS, send_country_limits: { US: 40, UK: 500 }, send_countries_off: ["FR"] };
  assert.equal(effectiveLimit(110, s, "US"), 40);
  assert.equal(effectiveLimit(100, s, "UK"), 100);
  assert.equal(effectiveLimit(60, s, "FR"), 0);
});

test("Proben-Soll 0–100, Verfall 24–96 h, Nachfass 3–10 Tage", () => {
  assert.deepEqual(validateSampleTargets({ "S2/US": "20", "S2/UK": "" }, ["S2/US", "S2/UK"]), { "S2/US": 20 });
  assert.throws(() => validateSampleTargets({ "S2/US": "101" }, ["S2/US"]), InputError);
  assert.deepEqual(validateSampleTargets({ "S9/XX": "5" }, ["S2/US"]), {}); // unbekannte Seiten werden ignoriert
  assert.equal(validateMaxAge("72"), 72);
  assert.throws(() => validateMaxAge("12"));
  assert.throws(() => validateMaxAge("200"));
  assert.equal(validateFollowupDays("5"), 5);
  assert.throws(() => validateFollowupDays("2"));
});

test("Länder-Schalter, Kunde anlegen, Antwort, Notiz, Einstellungen zusammenführen", () => {
  assert.deepEqual(toggleIn([], "UK", ["US", "UK", "FR"]), ["UK"]);
  assert.deepEqual(toggleIn(["UK"], "UK", ["US", "UK", "FR"]), []);
  assert.throws(() => toggleIn([], "DE", ["US", "UK", "FR"]), InputError);
  assert.deepEqual(validateCustomer({ company: "Acme Web", email: "Ops@Acme.com", country: "uk", pkg: "pro" }, ["US", "UK", "FR"]),
    { company: "Acme Web", email: "ops@acme.com", country: "UK", pkg: "pro", currency: "gbp", amount_cents: 24900 });
  assert.throws(() => validateCustomer({ company: "A", email: "x@y.de", country: "UK", pkg: "pro" }, ["UK"]), /Firma/);
  assert.throws(() => validateCustomer({ company: "Acme", email: "kein", country: "UK", pkg: "pro" }, ["UK"]), /E-Mail/);
  assert.throws(() => validateCustomer({ company: "Acme", email: "a@b.de", country: "DE", pkg: "pro" }, ["UK"]), /Land/);
  assert.throws(() => validateCustomer({ company: "Acme", email: "a@b.de", country: "UK", pkg: "gold" }, ["UK"]), /Paket/);
  assert.equal(validateReplyKind("reply_positive"), "reply_positive");
  assert.throws(() => validateReplyKind("unsubscribed"));
  assert.throws(() => validateNote(""));
  assert.equal(validateNote(" Ruft Montag an "), "Ruft Montag an");
  const m = merge([{ key: "send_paused", value: true }, { key: "x", value: 1 }]);
  assert.equal(m.send_paused, true);
  assert.equal((m as any).x, undefined);
});

test("Belegungsplan: je Linie 0 … max, Summe höchstens 38, gleiche Regeln wie scripts/werk_plan.py", async () => {
  const { slotCounts, validateSlotPlan } = await import("./owner-settings.ts");
  const { readFileSync } = await import("node:fs");
  const reg = JSON.parse(readFileSync(new URL("./werk-linien.json", import.meta.url), "utf8"));
  const def = slotCounts(reg, {});
  assert.equal(def["web-us"], 21);
  assert.equal(Object.values(def).reduce((a: number, b: number) => a + b, 0), 38);
  const p = validateSlotPlan({ "web-us": "10", "web-uk": "", kunden: "4" }, reg);
  assert.equal(p["web-us"], 10);
  assert.equal(p["web-uk"], 5); // leer = Standard
  assert.equal(p.kunden, 4);
  assert.throws(() => validateSlotPlan({ "web-us": "22" }, reg), InputError); // über max
  assert.throws(() => validateSlotPlan({ "web-uk": "21" }, reg), InputError); // Summe 54 > 38
  assert.throws(() => validateSlotPlan({ "web-us": "-1" }, reg), InputError);
  assert.deepEqual(slotCounts(reg, { "web-us": 99 }), { ...def, "web-us": 21 }); // gekappt wie in Python
  assert.deepEqual(slotCounts(reg, { "web-uk": 21 }), def); // Summe zu hoch -> Standard
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { InputError, toggleIn, validateCountryLimits, validateSampleTargets, validateFollowupDays } from "./owner-settings.ts";

/** Regler = einzige Schaltstelle (Zentrale 05.10.2026): Server-Aktionen begrenzen hart, lockern nie. */
const ACTIONS = readFileSync(new URL("../app/dashboard/control-actions.ts", import.meta.url), "utf8");
const OPS = JSON.parse(readFileSync(new URL("./ops-config.json", import.meta.url), "utf8")) as { countries: Record<string, { allowed: boolean; daily_limit: number }> };

test("Mails pro Tag: höchstens das Limit aus countries.yaml, nur Mail-Länder", () => {
  const lim = OPS.countries.US.daily_limit;
  assert.deepEqual(validateCountryLimits({ US: String(lim) }, OPS.countries, ["US"]), { US: lim });
  assert.throws(() => validateCountryLimits({ US: String(lim + 1) }, OPS.countries, ["US"]), InputError);
  assert.throws(() => validateCountryLimits({ NL: "1" }, OPS.countries, ["NL"]), InputError);
  assert.equal(OPS.countries.NL?.allowed ?? false, false);
});

test("Proben-Soll und Nachfass-Tage begrenzt", () => {
  assert.throws(() => validateSampleTargets({ "S2/US": "101" }, ["S2/US"]), InputError);
  assert.throws(() => validateFollowupDays("1"), InputError);
});

test("Länder an/aus: nur bekannte Mail-Länder; Käufer- und Versand-Länder nie außerhalb allowed", () => {
  assert.throws(() => toggleIn([], "IE", ["US", "UK", "FR"]), InputError);
  assert.deepEqual(toggleIn([], "US", ["US"]), ["US"]);
  assert.match(ACTIONS, /const mailLaender = \(\) => COUNTRIES\.filter\(\(c\) => CONFIG\.countries\[c\]\?\.allowed === true\);/);
  assert.match(ACTIONS, /buyer_countries_off", toggleIn\(s\.buyer_countries_off, String\(f\.get\("country"\)\), mailLaender\(\)\)/);
  assert.match(ACTIONS, /send_countries_off", toggleIn\(s\.send_countries_off, String\(f\.get\("country"\)\), mailLaender\(\)\)/);
  assert.match(ACTIONS, /validateCountryLimits\(input, CONFIG\.countries, COUNTRIES\)/);
});

test("keine Aktion für Notbremse, Sperrliste aufheben oder Freigabe", () => {
  const namen = [...ACTIONS.matchAll(/export async function (\w+)/g)].map((m) => m[1]);
  for (const n of namen) assert.doesNotMatch(n, /notbremse|brake|freigabe|gate|pruefregel|unsuppress|entsperr|sperreAufheben|threshold|schwelle/i, n);
  assert.doesNotMatch(ACTIONS, /from\("suppression"\)\s*\.delete/);
  assert.doesNotMatch(ACTIONS, /notbremse_ab|bounce_stop|BOUNCE_STOP/);
});

test("Versand-Pause aus der Zentrale kann nur stoppen", () => {
  const sf = readFileSync(new URL("../app/dashboard/jarvis/seitenfenster.tsx", import.meta.url), "utf8");
  assert.match(sf, /<form action=\{setPaused\}>[\s\S]{0,200}name="paused" value="1"/);
  assert.doesNotMatch(sf, /name="paused" value="0"/);
});

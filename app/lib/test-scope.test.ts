import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { proposalInScope, servableVariants, splitByScope, testAllowed, type TestScope } from "./test-scope.ts";
// @ts-expect-error – Erzeuger ist .mjs ohne Typen
import { parseTests } from "../scripts/ops-config.mjs";

const scope: TestScope = { segmente: ["S2"], laender: ["US", "UK", "FR"] };

test("Freigabe-Liste: nur Webagenturen US/UK/FR", () => {
  assert.equal(testAllowed(scope, "S2", "US"), true);
  assert.equal(testAllowed(scope, "s2", "fr"), true);
  assert.equal(testAllowed(scope, "S2", "IE"), false);
  assert.equal(testAllowed(scope, "S4", "UK"), false);
  assert.equal(testAllowed({ segmente: [], laender: [] }, "S2", "US"), false);
});

test("ops-config.json spiegelt config/fokus.yaml tests (gleiche Liste wie Python)", () => {
  const yaml = readFileSync(new URL("../../config/fokus.yaml", import.meta.url), "utf8");
  const json = JSON.parse(readFileSync(new URL("./ops-config.json", import.meta.url), "utf8"));
  assert.deepEqual(json.tests, parseTests(yaml));
  assert.deepEqual(parseTests(yaml), scope);
  assert.deepEqual(parseTests("fokus:\n  - S2/US\n"), { segmente: [], laender: [] });
});

test("Seiten teilen: S2 US/UK/FR mit Tests, Rest ohne", () => {
  const rows = [
    { slug: "uk/web-agencies", segment_id: "S2", country: "UK" }, { slug: "fr/agences-web", segment_id: "S2" },
    { slug: "us/accountants", segment_id: "S5", country: "US" }, { slug: "ie/web-agencies", segment_id: "S2", country: "IE" },
  ];
  const { tested, other } = splitByScope(scope, rows);
  assert.deepEqual(tested.map((r) => r.slug), ["uk/web-agencies", "fr/agences-web"]);
  assert.deepEqual(other.map((r) => r.slug), ["us/accountants", "ie/web-agencies"]);
});

test("Varianten: außerhalb der Liste nur die Kontrolle", () => {
  const vs = [{ variant_key: "B", traffic_share: 50 }, { variant_key: "A", traffic_share: 50 }];
  assert.equal(servableVariants(scope, { segment_id: "S2", country: "US" }, vs).length, 2);
  assert.deepEqual(servableVariants(scope, { segment_id: "S5", country: "US" }, vs).map((v) => v.variant_key), ["A"]);
  assert.deepEqual(servableVariants(scope, { segment_id: "S5", slug: "uk/accountants" },
    [{ variant_key: "B", traffic_share: 30 }, { variant_key: "C", traffic_share: 70 }]).map((v) => v.variant_key), ["C"]);
  assert.deepEqual(servableVariants(scope, { segment_id: "S5", country: "US" }, []), []);
});

test("Vorschläge anderer Zielgruppen erkennen", () => {
  const map = { "us/accountants": "S5", "uk/web-agencies": "S2" };
  assert.equal(proposalInScope(scope, "us/accountants: neue Variante nötig", map), false);
  assert.equal(proposalInScope(scope, "uk/web-agencies: Variante B gewinnt", map), true);
  assert.equal(proposalInScope(scope, "S4/US: stoppen (unter 2 % positiv)", map), false);
  assert.equal(proposalInScope(scope, "S2/FR: ausbauen", map), true);
  assert.equal(proposalInScope(scope, "Tagesnotiz 04.10.2026", map), true);
  assert.equal(proposalInScope(scope, "xx/unbekannt: etwas", map), true);
});

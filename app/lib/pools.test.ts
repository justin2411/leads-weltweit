import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL_POOL, PoolInputError, cleanColor, cleanPoolName, effectivePool, isTestSub, matrixRows, nextColor, poolChanges, poolDraft,
  poolTotals, validateChanges, type Pool, type SubRow,
} from "./pools.ts";

// Erfundene Werte – keine echten Daten im Repo.
const P1 = "11111111-1111-4111-8111-111111111111", P2 = "22222222-2222-4222-8222-222222222222";
const S1 = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const pools: Pool[] = [{ id: P1, name: "Top US", color: "#5fd4ff", note: null }, { id: P2, name: "Rest", color: null, note: null }];
const sub = (o: Partial<SubRow> = {}): SubRow => ({
  id: S1, segment_id: "S2", status: "active", pool_id: null, package: "starter",
  customer: { company_name: "Muster", country: "US", status: "active", stripe: true, test_note: false }, ...o,
});

test("Name: getrimmt, 1–40 Zeichen, Gesamtbestand reserviert", () => {
  assert.equal(cleanPoolName("  Top   US "), "Top US");
  assert.throws(() => cleanPoolName(""), PoolInputError);
  assert.throws(() => cleanPoolName("x".repeat(41)), PoolInputError);
  assert.throws(() => cleanPoolName("gesamtBestand"), PoolInputError);
});

test("Farbe: #rrggbb klein, leer = null, sonst Fehler", () => {
  assert.equal(cleanColor("#AABBCC"), "#aabbcc");
  assert.equal(cleanColor(""), null);
  assert.throws(() => cleanColor("red"), PoolInputError);
  assert.equal(nextColor(pools), "#e2c68f");
});

test("Zählung je Speicher und Land, optional je Zielgruppe", () => {
  const t = poolTotals(pools, [
    { pool_id: P1, country: "US", segment: "S2", n: 5 }, { pool_id: P1, country: "UK", segment: "S2", n: 7 },
    { pool_id: P1, country: "US", segment: "S4", n: 2 }, { pool_id: "fremd", country: "US", segment: "S2", n: 99 },
  ]);
  assert.equal(t.get(P1)!.total, 14);
  assert.deepEqual(t.get(P1)!.byCountry, [["UK", 7], ["US", 7]]);
  assert.equal(t.get(P2)!.total, 0);
  assert.equal(poolTotals(pools, [{ pool_id: P1, country: "US", segment: "S4", n: 2 }], "S2").get(P1)!.total, 0);
});

test("Matrix: nur Zielgruppen mit Mail-Ländern, gestoppte nur mit Route, sortiert S2 vor S10", () => {
  const rows = matrixRows([
    { id: "S10", name: "Neu", email_countries: ["US"], status: "idea" },
    { id: "S2", name: "Web", email_countries: ["US", "FR"], status: "testing" },
    { id: "S8", name: "DE", email_countries: [], status: "testing" },
    { id: "S7", name: "Reinigung", email_countries: ["UK"], status: "killed" },
    { id: "S6", name: "Büro", email_countries: ["UK"], status: "killed" },
  ], [{ segment_id: "S6", country: "NL", pool_id: P1 }]);
  assert.deepEqual(rows.map((r) => r.id), ["S2", "S6", "S10"]);
  assert.deepEqual(rows[0].countries, ["FR", "US"]);
  assert.deepEqual(rows[1].countries, ["NL", "UK"]);
});

test("Entwurf-Abgleich: Route setzen, auf Gesamtbestand zurück, Kunde übersteuern", () => {
  const saved = poolDraft([{ segment_id: "S2", country: "US", pool_id: P1 }], [sub()]);
  assert.deepEqual(poolChanges(saved, saved), []);
  const draft = { routes: { "S2/US": ALL_POOL, "S2/UK": P2 }, subs: { [S1]: P1 } };
  assert.deepEqual(poolChanges(saved, draft), [
    { kind: "route", segment: "S2", country: "UK", pool_id: P2 },
    { kind: "route", segment: "S2", country: "US", pool_id: null },
    { kind: "sub", id: S1, pool_id: P1 },
  ]);
});

test("Prüfung: nur bekannte Speicher, Abos und Zielgruppe+Land", () => {
  const ctx = { pools: new Set([P1]), subs: new Set([S1]), cells: new Set(["S2/US"]) };
  assert.deepEqual(validateChanges([{ kind: "route", segment: "S2", country: "US", pool_id: "" }], ctx), [{ kind: "route", segment: "S2", country: "US", pool_id: null }]);
  assert.throws(() => validateChanges([], ctx), PoolInputError);
  assert.throws(() => validateChanges([{ kind: "route", segment: "S2", country: "DE", pool_id: P1 }], ctx), PoolInputError);
  assert.throws(() => validateChanges([{ kind: "route", segment: "S2", country: "US", pool_id: P2 }], ctx), PoolInputError);
  assert.throws(() => validateChanges([{ kind: "sub", id: P2, pool_id: P1 }], ctx), PoolInputError);
  assert.throws(() => validateChanges([{ kind: "x" }], ctx), PoolInputError);
});

test("Kunde vor Route vor Gesamtbestand; Testkauf erkannt", () => {
  const routes = { "S2/US": P2 };
  assert.deepEqual(effectivePool({ segment_id: "S2", pool_id: P1, country: "US" }, routes), { pool_id: P1, via: "kunde" });
  assert.deepEqual(effectivePool({ segment_id: "S2", pool_id: null, country: "US" }, routes), { pool_id: P2, via: "route" });
  assert.deepEqual(effectivePool({ segment_id: "S2", pool_id: null, country: "UK" }, routes), { pool_id: null, via: "gesamt" });
  assert.equal(isTestSub(sub()), false);
  assert.equal(isTestSub(sub({ customer: { company_name: "T", country: "US", status: "trial", stripe: true, test_note: false } })), true);
});

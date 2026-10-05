import { test } from "node:test";
import assert from "node:assert/strict";
import { checkReasons, draftAge, draftInFocus } from "./drafts-view.ts";

const scope = { segmente: ["S2"], laender: ["US", "UK", "FR"] };

test("Fokus: nur Segment × Land der Liste", () => {
  assert.equal(draftInFocus(scope, { experiments: { segment_id: "S2" }, prospects: { country: "us" } }), true);
  assert.equal(draftInFocus(scope, { experiments: { segment_id: "S4" }, prospects: { country: "US" } }), false);
  assert.equal(draftInFocus(scope, { experiments: { segment_id: "S2" }, prospects: { country: "IE" } }), false);
  assert.equal(draftInFocus(scope, { experiments: null, prospects: null }), false);
});

test("Alter: erst über 48 h alt", () => {
  const now = new Date("2026-10-05T12:00:00Z");
  assert.equal(draftAge("2026-10-04T12:00:00Z", now), null);
  assert.equal(draftAge("2026-10-01T21:49:00Z", now), "alt · 3 T");
  assert.equal(draftAge(null, now), null);
});

test("Prüfgründe: leer, doppelt, einzeln", () => {
  assert.deepEqual(checkReasons(null), []);
  assert.deepEqual(checkReasons(["a", "a", " b ", ""]), ["a", "b"]);
  assert.deepEqual(checkReasons("x"), ["x"]);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { BUCKETS, bucketRand } from "./landing-buckets.ts";
import { pickVariant } from "./variants.ts";

const share = (vs: { id: string; traffic_share: number; status: string }[]) => {
  const n: Record<string, number> = {};
  for (let b = 0; b < BUCKETS; b++) { const v = pickVariant(vs, bucketRand(b))!; n[v.id] = (n[v.id] ?? 0) + 1; }
  return n;
};

test("statische Eimer verteilen Varianten nach traffic_share (10-%-Schritte)", () => {
  assert.deepEqual(share([{ id: "A", traffic_share: 100, status: "live" }]), { A: 10 });
  assert.deepEqual(share([{ id: "A", traffic_share: 100, status: "live" }, { id: "B", traffic_share: 100, status: "live" }]), { A: 5, B: 5 });
  assert.deepEqual(share([{ id: "A", traffic_share: 70, status: "live" }, { id: "B", traffic_share: 30, status: "live" }]), { A: 7, B: 3 });
  assert.deepEqual(share([{ id: "A", traffic_share: 100, status: "live" }, { id: "B", traffic_share: 0, status: "live" }]), { A: 10 });
  for (let b = 0; b < BUCKETS; b++) assert.ok(bucketRand(b) > 0 && bucketRand(b) < 1);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { isOwnerAddress } from "./owner-address.ts";

test("Inhaber-Adresse aus der Umgebung erkennt Testproben (Prüfung 04.10.2026)", () => {
  const env = { OWNER_EMAIL: " Chef@Example.org ", SALE_NOTIFY_EMAIL: "verkauf@example.org" };
  assert.equal(isOwnerAddress("chef@example.org", env), true);
  assert.equal(isOwnerAddress("VERKAUF@example.org ", env), true);
  assert.equal(isOwnerAddress("kunde@example.org", env), false);
  assert.equal(isOwnerAddress("", env), false);
  assert.equal(isOwnerAddress("chef@example.org", {}), false);
  assert.equal(isOwnerAddress("", { OWNER_EMAIL: "" }), false);
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { ankerId, hashZiel, linkZiel, trifft } from "./anker.ts";

test("Anker-ID aus Namen", () => {
  assert.equal(ankerId("Vorschläge"), "vorschlaege");
  assert.equal(ankerId("Abläufe"), "ablaeufe");
  assert.equal(ankerId("Umgebung (Vercel)"), "umgebung-vercel");
  assert.equal(ankerId("  Größe  "), "groesse");
  assert.equal(ankerId("Café"), "cafe");
});

test("Hash und Link", () => {
  assert.equal(hashZiel("#vorschlaege"), "vorschlaege");
  assert.equal(hashZiel("#Vorschl%C3%A4ge"), "vorschlaege");
  assert.equal(hashZiel("#%E0%A4%A"), "e0-a4-a");
  assert.equal(hashZiel("#"), null);
  assert.equal(hashZiel(""), null);
  assert.equal(linkZiel("#seiten", "/dashboard/gehirn"), "seiten");
  assert.equal(linkZiel("/dashboard/gehirn#seiten", "/dashboard/gehirn"), "seiten");
  assert.equal(linkZiel("/dashboard/gehirn?x=1#seiten", "/dashboard/gehirn"), "seiten");
  assert.equal(linkZiel("/dashboard/jarvis#seiten", "/dashboard/gehirn"), null);
  assert.equal(linkZiel("/dashboard/jarvis", "/dashboard/gehirn"), null);
});

test("Ziel trifft Abschnitt oder Alias", () => {
  assert.ok(trifft("vorschlaege", "vorschlaege"));
  assert.ok(trifft("entscheidungen", "vorschlaege", ["entscheidungen"]));
  assert.ok(trifft("ablaeufe", "gehirn", ["Abläufe"]));
  assert.ok(!trifft("seiten", "vorschlaege"));
  assert.ok(!trifft(null, "seiten"));
});

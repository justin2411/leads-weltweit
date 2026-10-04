import { test } from "node:test";
import assert from "node:assert/strict";
import { ABTEILUNGEN, antwortenKz, gehirnKz, kachel, marketingKz, produktionKz, schlechteste, sicher, teamKz } from "./abteilungen.ts";

test("Abteilungen: alle 11 mit Link, Name kurz, ohne Dubletten", () => {
  assert.equal(ABTEILUNGEN.length, 11);
  assert.equal(new Set(ABTEILUNGEN.map((a) => a.key)).size, 11);
  for (const a of ABTEILUNGEN) {
    assert.ok(a.href.startsWith("/dashboard/"), a.key);
    assert.ok(a.name.length <= 60);
  }
});

test("Kachel: null → „–“ und grau, Tipp ≤ 160", () => {
  const k = kachel("recht", null);
  assert.equal(k.wert, "–");
  assert.equal(k.ampel, "grey");
  assert.match(k.tip, /nicht lesbar/);
  assert.equal(kachel("finanzen", { wert: "129 £", ampel: "green", grund: "x".repeat(300) }).tip.length, 160);
  assert.equal(kachel("ziele", { wert: "–", ampel: "red" }).ampel, "grey");
});

test("schlechteste Ampel: rot vor gelb vor grün, grau nur ohne Bewertung", () => {
  assert.equal(schlechteste(["green", "gold", "grey"]), "gold");
  assert.equal(schlechteste(["green", "red"]), "red");
  assert.equal(schlechteste(["grey"]), "grey");
  assert.equal(schlechteste([]), "grey");
});

test("Team, Gehirn, Produktion, Marketing, Antworten aus echten Werten", () => {
  assert.equal(teamKz(null), null);
  assert.deepEqual(teamKz([{ kz: { ampel: "green" } }, { kz: { ampel: "gold" } }, { kz: null }]), { wert: "1/2 grün", ampel: "gold", grund: "3 Fach-Agenten" });
  assert.equal(gehirnKz({ score: 72.4, ampel: "green" })!.wert, "72 Punkte");
  assert.equal(gehirnKz({ score: null, ampel: "grey" })!.wert, "–");
  assert.equal(produktionKz({ leads24: null, kaeufer24: 3, werke: ["live"], speicher: "green" }), null);
  const p = produktionKz({ leads24: 1200, kaeufer24: 40, werke: ["live", "live"], speicher: "red" })!;
  assert.equal(p.ampel, "red");
  assert.equal(p.wert, "1.200 Leads");
  assert.equal(produktionKz({ leads24: 5, kaeufer24: 0, werke: ["live", "off"], speicher: "green" })!.ampel, "green");
  assert.equal(marketingKz(null, null), null);
  assert.deepEqual(marketingKz({ start_24h: 3, land_24h: 4 }, null), { wert: "7 Besucher", ampel: "green", grund: undefined });
  assert.equal(marketingKz({ start_24h: 3, land_24h: 4 }, "wtarif")!.ampel, "gold");
  assert.equal(antwortenKz(null, null), null);
  assert.equal(antwortenKz(2, { replies: 5, positive: 1 })!.ampel, "gold");
  assert.equal(antwortenKz(0, { replies: 0, positive: 0 })!.ampel, "grey");
});

test("sicher: Fehler und Zeitüberschreitung → null, sonst Wert", async () => {
  assert.equal(await sicher(Promise.resolve(5)), 5);
  assert.equal(await sicher(Promise.reject(new Error("x"))), null);
  assert.equal(await sicher(() => { throw new Error("sync"); }), null);
  assert.equal(await sicher(new Promise((r) => setTimeout(() => r(1), 200)), 20), null);
});

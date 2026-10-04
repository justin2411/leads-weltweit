import { test } from "node:test";
import assert from "node:assert/strict";
import { clean, hintsKurz, line, probenKurz } from "./kontext-kurz.ts";

test("clean: leere Felder weg, Nullen und false bleiben", () => {
  assert.deepEqual(clean({ a: null, b: 0, c: "", d: [], e: {}, f: false, g: [{ x: null, y: 1 }] }), { b: 0, f: false, g: [{ y: 1 }] });
  assert.equal(line("X", { a: null, b: 2 }), 'X: {"b":2}');
  assert.equal(line("X", "text"), "X: text");
});

test("hintsKurz: nur Platzhalter → ein Satz, echte Hinweise bleiben", () => {
  assert.equal(hintsKurz(["Abbruch: noch zu wenig Daten: …", "Ladezeit: noch keine Messung: …"]), "noch zu wenig Besucher für Hinweise");
  assert.deepEqual(hintsKurz(["Abbruch: Tarif → Stripe 80 %", "Quelle: noch zu wenig Daten"]), ["Abbruch: Tarif → Stripe 80 %"]);
  assert.equal(hintsKurz("nicht lesbar"), "nicht lesbar");
});

test("probenKurz: Fokus einzeln, übrige nur bei Lücke", () => {
  const r = probenKurz([
    { seite: "S2/US", bereit: 50, soll: 6, raus_24h: 2 }, { seite: "S2/FR", bereit: 3, soll: 6, raus_24h: 0 },
    { seite: "S1/FR", bereit: 0, soll: 3, raus_24h: 0 }, { seite: "S4/UK", bereit: 3, soll: 3, raus_24h: 0 },
  ], "S2");
  assert.deepEqual(r, { fokus: ["S2/US 50/6 (24 h raus 2)", "S2/FR 3/6"], luecken: ["S1/FR 0/3"], uebrige_voll: 1 });
});

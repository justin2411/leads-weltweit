import { test } from "node:test";
import assert from "node:assert/strict";
import { bereichsZiel, bilder, geschaeftsbericht, toBereich, toUebergabe, wirkungText, type Bereich } from "./firma.ts";
import { zeilen, START } from "./zentrale/ziele.ts";

const roh = (o: Record<string, unknown> = {}) => ({
  slug: "kundenservice", name: "Kundenservice", icon: "antworten", zweck: "Antworten", leitung_rolle: null, leitung_name: "Antwort-Assistent",
  leitung_takt: "alle 10 min", mitglieder: [{ art: "workflow", ref: "antworten.yml", name: "Antwort-Assistent", takt: "alle 10 min" }, { art: "kaputt", name: "x" }],
  ziel_key: "heiss_offen", ziel_titel: "Kaufinteresse offen", ziel_soll: 0, ziel_richtung: "runter", wirkung_key: "heiss_offen", wirkung_titel: "offen", sort: 50, ...o,
});

test("toBereich prüft Zeilen und Mitglieder", () => {
  const b = toBereich(roh())!;
  assert.equal(b.mitglieder.length, 1);
  assert.equal(b.ziel_richtung, "runter");
  assert.equal(toBereich(roh({ slug: "Böse Zeile" })), null);
  assert.equal(toBereich(roh({ ziel_soll: null }))!.ziel_soll, null);
});

test("eigene Kennzahl: höchstens 0 → grün bei 0, gelb sonst, grau ohne Zahl", () => {
  const b = toBereich(roh())!;
  assert.equal(bereichsZiel(b, { heiss_offen: 0 }, null).ampel, "green");
  assert.equal(bereichsZiel(b, { heiss_offen: 2 }, null).ampel, "gold");
  assert.equal(bereichsZiel(b, null, null).ampel, "grey");
  assert.equal(bereichsZiel(b, null, null).text, "– / 0");
});

test("hoch-Ziel mit Soll: Fortschritt-Ampel", () => {
  const b = toBereich(roh({ ziel_key: "proben_7d", ziel_soll: 4, ziel_richtung: "hoch" }))!;
  assert.equal(bereichsZiel(b, { proben_7d: 4 }, null).ampel, "green");
  assert.equal(bereichsZiel(b, { proben_7d: 2 }, null).ampel, "gold");
  assert.equal(bereichsZiel(b, { proben_7d: 1 }, null).ampel, "red");
});

test("company_goals hat Vorrang (Soll vom Inhaber)", () => {
  const b = toBereich(roh({ ziel_key: "mrr", ziel_soll: null, ziel_richtung: "hoch" }))!;
  const z = zeilen(START, { mrr: 645 });
  const r = bereichsZiel(b, { mrr: 1 }, z);
  assert.equal(r.ist, 645);
  assert.equal(r.soll, 1290);
  assert.equal(r.ampel, "gold");
  assert.equal(r.quelle, "vorschlag");
});

test("Wirkung: Quote als Prozent, fehlend = –", () => {
  const b = toBereich(roh({ wirkung_key: "bestanden" }))!;
  assert.equal(wirkungText(b, { bestanden: 0.9699 }), "97 %");
  assert.equal(wirkungText(b, {}), "–");
});

test("bilder: sortiert und zählt Übergaben je Richtung", () => {
  const a = toBereich(roh())!, v = toBereich(roh({ slug: "vertrieb", sort: 10 }))!;
  const u = [toUebergabe({ id: "1", von: "vertrieb", an: "kundenservice", titel: "Kaufinteresse: X", status: "beauftragt" })];
  const out = bilder([a, v] as Bereich[], {}, null, u);
  assert.deepEqual(out.map((x) => x.slug), ["vertrieb", "kundenservice"]);
  assert.equal(out[0].raus, 1);
  assert.equal(out[1].rein, 1);
});

test("Geschäftsbericht: Titel ≤ 60, 5 Zeilen, je eine Zahl", () => {
  const g = geschaeftsbericht({ mrr: 1290, kunden: 3, mails_24h: 83, antworten_7d: 2, proben_7d: 1 });
  assert.ok(g.titel.length <= 60);
  assert.equal(g.titel, "Geschäft heute: 1.290 Umsatz/Monat");
  assert.equal(g.zeilen.length, 5);
  assert.deepEqual(g.zeilen.map((z) => z.wert), ["83", "2", "1", "3", "1.290"]);
  assert.ok(geschaeftsbericht(null).zeilen.every((z) => z.wert === "–"));
});

import { test } from "node:test";
import assert from "node:assert/strict";
import { abrechnungen, finanzen, geldText, kpiAus as finKpi, plusMonate, wochenStart, type AboIn } from "./zentrale/finanzen.ts";
import { heiss, inboundJeLand, kpiAus as verKpi, vertrieb } from "./zentrale/vertrieb.ts";
import { START, ZielFehler, fortschritt, kpiAus as zielKpi, pruefeSoll, zeilen } from "./zentrale/ziele.ts";
import { abteilung } from "./zentrale/kpi.ts";

// Erfundene Zahlen – keine echten Kunden oder Firmen.
const abo = (x: Partial<AboIn>): AboIn => ({ id: "a", status: "active", package: "starter", amount_cents: 12900, currency: "gbp", price_eur_month: null,
  started_on: "2026-09-10", cancelled_on: null, country: "UK", test: false, ...x });

test("plusMonate kappt am Monatsende, wochenStart = Montag", () => {
  assert.equal(plusMonate("2026-01-31", 1), "2026-02-28");
  assert.equal(plusMonate("2026-10-04", -1), "2026-09-04");
  assert.equal(wochenStart("2026-10-04"), "2026-09-28");  // Sonntag → Montag davor
  assert.equal(wochenStart("2026-09-28"), "2026-09-28");
});

test("abrechnungen: Start + volle Monate, nie nach heute, nicht ab Kündigung", () => {
  const s = { status: "active", started_on: "2026-07-15", cancelled_on: null };
  assert.deepEqual(abrechnungen(s, "2026-07-01", "2026-12-31", "2026-10-04"), ["2026-07-15", "2026-08-15", "2026-09-15"]);
  assert.deepEqual(abrechnungen({ ...s, status: "cancelled", cancelled_on: "2026-09-01" }, "2026-01-01", "2026-12-31", "2026-10-04"), ["2026-07-15", "2026-08-15"]);
  assert.deepEqual(abrechnungen({ ...s, status: "incomplete" }, "2026-01-01", "2026-12-31", "2026-10-04"), []);
});

test("finanzen: ehrlich 0 ohne Kunden, Testkäufe zählen nie", () => {
  const f = finanzen([abo({ test: true, amount_cents: 83300 })], "2026-10-04");
  assert.equal(f.aktiv, 0);
  assert.equal(f.mrrSumme, 0);
  assert.equal(geldText(f.mrr), "0");
  assert.equal(f.testkaeufe, 1);
  assert.equal(f.kostenFest, 0);
  const k = finKpi(f, 1290);
  assert.equal(k.ampel, "red");
  assert.equal(k.wert, "0");
  assert.match(k.grund, /Noch kein zahlender Kunde/);
  assert.equal(finKpi(f).ampel, "grey");
});

test("finanzen: MRR je Währung, Umsatz Monat/Woche, Kündigungen", () => {
  const f = finanzen([
    abo({ id: "1", started_on: "2026-09-01" }),                                                       // UK 129 £, bucht 01.09. und 01.10.
    abo({ id: "2", country: "US", currency: "usd", amount_cents: 24900, package: "pro", started_on: "2026-09-30" }),  // 249 $, Woche
    abo({ id: "3", status: "cancelled", started_on: "2026-08-05", cancelled_on: "2026-09-20" }),       // gekündigt
  ], "2026-10-04");
  assert.equal(f.aktiv, 2);
  assert.equal(geldText(f.mrr), "249 $ + 129 £");
  assert.equal(geldText(f.umsatzMonat), "129 £");             // nur 01.10.
  assert.equal(geldText(f.umsatzWoche), "249 $ + 129 £");     // 30.09. und 01.10. liegen in der Woche ab 28.09.
  assert.equal(geldText(f.umsatzVormonat), "258 £ + 249 $");  // Sept: 01.09. + 05.09. (Abo 3) bzw. 30.09.
  assert.equal(f.kuendigungen30, 1);
  assert.deepEqual(f.jePaket, [{ paket: "starter", n: 1 }, { paket: "pro", n: 1 }]);
  const k = finKpi(f, 300);
  assert.equal(k.ampel, "green");   // 378 ≥ 300
  assert.equal(k.trend, "gleich");  // 1 neues (30.09.), 1 Kündigung
  assert.ok(k.titel.length <= 60 && k.grund.length <= 160);
});

const W = (week: string, country: string, sent: number, delivered: number, replies = 0, samples = 0) =>
  ({ week, country, sent, delivered, replies, positive: replies, samples, customers: 0 });

test("vertrieb: Pipeline je Land, Antwort-Ampel nur aus reifen Wochen", () => {
  const today = "2026-10-04";
  const jung = vertrieb([W("2026-W40", "UK", 80, 79), W("2026-W40", "US", 77, 73)], {}, {}, ["US", "UK", "FR"], today);
  assert.equal(jung.gesamt.angeschrieben, 157);
  assert.equal(jung.schritte[0].ampel, "grey");
  assert.equal(jung.schritte[0].jung, true);
  assert.equal(jung.laender.find((l) => l.land === "FR")!.angeschrieben, 0);
  const k = verKpi(jung);
  assert.equal(k.wert, "0 %");
  assert.equal(k.ampel, "grey");
  assert.match(k.grund, /laufen noch/);

  const reif = vertrieb([W("2026-W36", "UK", 200, 200, 8, 3), W("2026-W37", "UK", 200, 200, 2, 0)],
    { UK: { replies: 12, samples: 4, buy: 1 } }, { UK: 1 }, ["UK"], today);
  assert.equal(reif.gesamt.geantwortet, 12);         // inbound größer als Kohorte
  assert.equal(reif.gesamt.kauf, 1);
  assert.equal(reif.gesamt.kunde, 1);
  assert.equal(reif.schritte[0].ampel, "gold");      // 10/400 = 2,5 % (reife Wochen) → knapp
  assert.equal(reif.trend, "runter");                // W37 1 % < W36 4 %
  assert.equal(verKpi(reif, 2).ampel, "gold");
});

test("vertrieb: inbound je Land und heiße Kontakte", () => {
  const ib = inboundJeLand([{ intent: "buy", country: "UK" }, { intent: "sample", country: "UK" }, { intent: "out_of_office", country: "UK" }, { intent: "question", country: null }]);
  assert.deepEqual(ib, { UK: { replies: 2, samples: 2, buy: 1 } });
  const r = (id: string, intent: string, status = "offen", at = "2026-10-04T08:00:00Z") => ({ id, intent, status, received_at: at, processed_at: at });
  const h = heiss([r("a", "sample"), r("b", "buy"), r("c", "not_interested"), r("d", "question", "erledigt"), r("e", "question", "spaeter")]);
  assert.deepEqual(h.map((x) => x.id), ["b", "a", "e"]);
});

test("ziele: Eingabe prüfen, Fortschritt hoch/runter, Kennzahl", () => {
  assert.equal(pruefeSoll("1.290", ""), 1290);
  assert.equal(pruefeSoll("2,5", "%"), 2.5);
  assert.throws(() => pruefeSoll("-1", ""), ZielFehler);
  assert.throws(() => pruefeSoll("abc", ""), ZielFehler);
  assert.throws(() => pruefeSoll("120", "%"), ZielFehler);
  assert.equal(fortschritt({ soll: 10, richtung: "hoch" }, 5), 0.5);
  assert.equal(fortschritt({ soll: 2, richtung: "runter" }, 1.5), 1);
  assert.equal(fortschritt({ soll: 2, richtung: "runter" }, 4), 0.5);
  assert.equal(fortschritt({ soll: 2, richtung: "runter" }, null), null);

  const z = zeilen(START, { mrr: 0, kunden: 0, antwortquote: null, lead_fehler: 1.3, gruen_uk: 1200, gruen_fr: 300 });
  assert.equal(z[0].key, "mrr");
  assert.equal(z.find((x) => x.key === "antwortquote")!.ampel, "grey");
  assert.equal(z.find((x) => x.key === "lead_fehler")!.ampel, "green");
  assert.equal(z.find((x) => x.key === "gruen_fr")!.ampel, "red");
  const k = zielKpi(z);
  assert.equal(k.wert, "2/6");
  assert.equal(k.ampel, "red");     // 2 von 5 messbaren erreicht
  assert.match(k.grund, /Am weitesten weg/);
  assert.equal(zielKpi(zeilen(START, {})).ampel, "grey");
  assert.equal(zeilen(START, { lead_fehler: (1 - 0.98) * 100 }).find((x) => x.key === "lead_fehler")!.ampel, "green");
});

test("abteilung kürzt Titel ≤ 60 und Grund ≤ 160", () => {
  const k = abteilung({ titel: "x".repeat(80), wert: "1", ampel: "grey", trend: null, grund: "y".repeat(300), href: "/dashboard/ziele" });
  assert.equal(k.titel.length, 60);
  assert.equal(k.grund.length, 160);
});

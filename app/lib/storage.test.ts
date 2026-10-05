import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ALL, DB_LIMIT_BYTES, baukastenHref, big, buyerTanks, checkRows, dbFill, fmtBytes, layerOf, layerShares, leadTanks,
  logHeight, probenSummary, scaleTop, ticks, type StorageData, dbRing, premiumFree, premiumProben, premiumTanks,
} from "./storage.ts";

// Erfundene Zählungen – keine echten Lead-Daten im Repo.
const D: StorageData = {
  at: "2026-10-03T20:00:00Z",
  db_bytes: 4 * 1024 ** 3,
  tables: [{ name: "observations", bytes: 2 * 1024 ** 3 }, { name: "leads", bytes: 1024 ** 3 }],
  leads: [
    { segment: "S2", country: "US", status: "new", n: 1000 },
    { segment: "S2", country: "US", status: "reserved", n: 50 },
    { segment: "S2", country: "US", status: "sample", n: 20 },
    { segment: "S2", country: "US", status: "held", n: 3 },
    { segment: "S2", country: "US", status: "expired", n: 2 },
    { segment: "S2", country: "US", status: "weird", n: 1 },
    { segment: "S4", country: "US", status: "new", n: 500 },
    { segment: "S4", country: "DE", status: "new", n: 7 },
    { segment: "S2", country: null, status: "new", n: 9 },
  ],
  buyers: [
    { segment: "S2", country: "US", check_status: "ok", n: 100, sent: 30 },
    { segment: "S2", country: "US", check_status: "call_only", n: 40, sent: 0 },
    { segment: "S2", country: "US", check_status: "rejected", n: 5, sent: 0 },
    { segment: "S2", country: "DE", check_status: "ok", n: 11, sent: 0 },   // kein Mail-Land -> nur Anruf/Brief
    { segment: "S4", country: "US", check_status: "ok", n: 70, sent: 0 },
    { segment: "S4", country: "FR", check_status: "ok", n: 8, sent: 99 },   // sent > n wird gekappt
  ],
  stock: [],
  checks: [
    { segment: "S2", country: "US", released: 90, failed: 2 }, { segment: "S4", country: "US", released: 8, failed: 0 },
    { segment: "S2", country: "FR", released: 10, failed: 0 }, { segment: "S2", country: null, released: 1, failed: 1 },
  ],
};
const SEGS = [{ id: "S2", email_countries: ["US", "UK", "FR"] }, { id: "S4", email_countries: ["UK", "FR"] }];

test("log. Skala: Höhen und Teilstriche", () => {
  assert.equal(logHeight(0), 0);
  assert.equal(logHeight(-5), 0);
  assert.ok(Math.abs(logHeight(999) - 0.5) < 1e-9);          // log10(1000)/6
  assert.ok(Math.abs(logHeight(999_999) - 1) < 1e-9);
  assert.equal(logHeight(5e7), 1);                           // gekappt
  assert.ok(logHeight(10) < logHeight(100) && logHeight(100) < logHeight(1000));
  assert.equal(scaleTop(0), 6);
  assert.equal(scaleTop(352_743), 6);
  assert.equal(scaleTop(2_500_000), 7);
  assert.deepEqual(ticks().map((t) => t.label), ["1 Tsd", "10 Tsd", "100 Tsd", "1 Mio"]);
  assert.deepEqual(ticks().map((t) => t.at), [0.5, 4 / 6, 5 / 6, 1]);
  assert.deepEqual(ticks(7).map((t) => t.label), ["1 Tsd", "10 Tsd", "100 Tsd", "1 Mio", "10 Mio"]);
  // Teilstrich und Füllhöhe passen zusammen: 10.000 Leads stehen genau auf „10 Tsd“
  assert.ok(Math.abs(logHeight(9999) - ticks()[1].at) < 1e-9);
});

test("Schichten: Mindestanteil, Summe 1, leere bleiben 0", () => {
  assert.deepEqual(layerShares([0, 0]), [0, 0]);
  const s = layerShares([350_000, 300, 0, 2]);
  assert.ok(Math.abs(s.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  assert.equal(s[2], 0);
  assert.ok(Math.abs(s[1] - 0.03) < 1e-9 && Math.abs(s[3] - 0.03) < 1e-9);
  assert.ok(Math.abs(s[0] - 0.94) < 1e-9);
  const even = layerShares([50, 50]);
  assert.deepEqual(even, [0.5, 0.5]);
  const many = layerShares([1, 1, 1, 1, 1, 1], 0.5); // Mindestanteil wird auf 1/n begrenzt
  assert.ok(Math.abs(many.reduce((a, b) => a + b, 0) - 1) < 1e-9);
});

test("Lead-Tanks: Status → Schichten, Zielgruppe, Länder", () => {
  assert.equal(layerOf("new"), "frei");
  assert.equal(layerOf("reserved"), "proben");
  assert.equal(layerOf("delivered"), "geliefert");
  assert.equal(layerOf("sample"), "geliefert");
  assert.equal(layerOf("held"), "zurueck");
  assert.equal(layerOf("expired"), "abgelaufen");
  assert.equal(layerOf("xyz"), "sonst");
  const s2 = leadTanks(D, "S2");
  assert.deepEqual(s2.map((t) => t.country), ["US", "UK", "FR", "SE", "FI", "SG", "HK", "MX", "BR"]);
  const us = s2[0];
  assert.equal(us.total, 1076);
  assert.deepEqual(us.layers, { frei: 1000, proben: 50, geliefert: 20, zurueck: 3, abgelaufen: 2, sonst: 1 });
  const all = leadTanks(D, ALL);
  assert.equal(all[0].layers.frei, 1500);
  assert.equal(all.at(-1)!.country, "DE"); // weiteres Land mit Leads hinten
});

test("Käufer: nur ok im Mail-Land zählt, Anruf/Brief getrennt", () => {
  const s2 = buyerTanks(D, SEGS, "S2");
  const us = s2.find((t) => t.country === "US")!;
  assert.deepEqual(us, { country: "US", mail: 100, sent: 30, queued: 0, free: 70, callOnly: 40, mailCountry: true });   // ohne used: wie bisher
  const de = s2.find((t) => t.country === "DE")!;
  assert.equal(de.mail, 0);
  assert.equal(de.callOnly, 11);
  assert.equal(de.mailCountry, false);
  assert.equal(s2.find((t) => t.country === "IE"), undefined); // nie-Länder ausgeblendet
  // alle Zielgruppen: S4/US ist kein Mail-Land von S4 -> nur Anruf/Brief; S4/FR zählt, sent gekappt
  const all = buyerTanks(D, SEGS, ALL);
  const usAll = all.find((t) => t.country === "US")!;
  assert.equal(usAll.mail, 100);
  assert.equal(usAll.callOnly, 110);
  const fr = all.find((t) => t.country === "FR")!;
  assert.deepEqual([fr.mail, fr.sent, fr.free], [8, 8, 0]);
});

test("Käufer frei = mail-fähig − Käufer mit Mail (wie JARVIS, Prüfung 04.10.2026)", () => {
  const d: StorageData = { ...D, buyers: [
    { segment: "S2", country: "UK", check_status: "ok", n: 3000, sent: 600, used: 2241 },
    { segment: "S2", country: "US", check_status: "ok", n: 10, sent: 4, used: 50 },   // used > n wird gekappt
    { segment: "S2", country: "FR", check_status: "ok", n: 10, sent: 4, used: 2 },    // used < sent: nie negativ
  ] };
  const t = buyerTanks(d, SEGS, "S2");
  const uk = t.find((x) => x.country === "UK")!;
  assert.deepEqual([uk.mail, uk.sent, uk.queued, uk.free], [3000, 600, 1641, 759]);
  const us = t.find((x) => x.country === "US")!;
  assert.deepEqual([us.sent, us.queued, us.free], [4, 6, 0]);
  const fr = t.find((x) => x.country === "FR")!;
  assert.deepEqual([fr.sent, fr.queued, fr.free], [4, 0, 6]);
});

test("Proben, Freigabe, Datenbank", () => {
  const p = probenSummary([{ key: "S2/US", ready: 6, target: 6 }, { key: "S2/UK", ready: 1, target: 4 }, { key: "S4/US", ready: 3, target: 3 }], "S2");
  assert.equal(p.rows.length, 2);
  assert.deepEqual([p.ready, p.target], [7, 10]);
  assert.equal(p.pct, 0.7);
  assert.equal(p.rows[1].pct, 0.25);
  assert.equal(probenSummary([], "S2").pct, 0);
  assert.equal(probenSummary([{ key: "S2/US", ready: 2, target: 0 }], ALL).rows[0].pct, 1);
  const c = checkRows(D);
  assert.deepEqual(c.map((x) => x.country), ["US", "FR"]);
  assert.deepEqual([c[0].released, c[0].failed, c[0].failPct], [98, 2, 0.02]);
  const c2 = checkRows(D, "S2");
  assert.deepEqual([c2[0].released, c2[0].failed], [90, 2]);
  assert.deepEqual(checkRows(D, "S4").map((x) => x.country), ["US"]);
  const f = dbFill(D);
  assert.equal(f.limit, DB_LIMIT_BYTES);
  assert.equal(f.pct, 0.5);
  assert.equal(f.level, "gruen");
  assert.equal(f.tables[0].label, "Beobachtungen");
  assert.equal(f.tables[0].pct, 0.5);
  assert.equal(dbFill({ db_bytes: 7.5 * 1024 ** 3, tables: [] }).level, "rot");
  assert.equal(dbFill({ db_bytes: 6.5 * 1024 ** 3, tables: [] }).level, "gelb");
  assert.equal(fmtBytes(3.47 * 1024 ** 3), "3,5 GB");
  assert.equal(fmtBytes(13.3 * 1024 ** 2), "13 MB");
  assert.equal(big(352_743), "353 Tsd");
  assert.equal(big(1_250_000), "1,3 Mio");
  assert.equal(big(9_999), "9.999");
  assert.equal(baukastenHref("US", "S2"), "/dashboard/baukasten?land=US&seg=S2");
  assert.equal(baukastenHref("UK", ALL, "kaeufer"), "/dashboard/baukasten?land=UK&quelle=kaeufer");
});

// --------------------------------------------------------------------------------------------- Premium (05.10.2026)

const P: StorageData = {
  ...D,
  premium: [
    { segment: "S2", country: "US", status: "new", n: 120, firms: 110 },     // frei = Firmen (wie premium_status)
    { segment: "S2", country: "US", status: "reserved", n: 30, firms: 30 },
    { segment: "S2", country: "US", status: "delivered", n: 4, firms: 4 },
    { segment: "S2", country: "US", status: "sample", n: 6, firms: 6 },
    { segment: "S2", country: "US", status: "held", n: 2, firms: 2 },
    { segment: "S4", country: "US", status: "new", n: 9, firms: 9 },         // andere Zielgruppe -> zusammengefasst
    { segment: "S4", country: "UK", status: "reserved", n: 5, firms: 5 },    // andere, nicht frei -> zählt nicht
    { segment: "S2", country: "SE", status: "new", n: 12 },                  // weiteres Land mit Bestand, ohne firms
    { segment: "S2", country: "NL", status: "new", n: 50, firms: 50 },       // ausgeblendetes Land
  ],
  stock_premium: [
    { segment: "S2", country: "US", ready: 50, premium: 25 },
    { segment: "S2", country: "UK", ready: 30, premium: 31 },                // premium > ready wird gekappt
    { segment: "S4", country: "US", ready: 3, premium: 1 },
  ],
};

test("premiumTanks: S2-Fokus, frei = Firmen, andere Zielgruppen zusammengefasst, Proben davon Premium", () => {
  const t = premiumTanks(P, "S2");
  assert.deepEqual(t.map((x) => x.country), ["US", "UK", "FR", "SE"]);
  const us = t[0];
  assert.equal(us.frei, 110);
  assert.equal(us.proben, 30);
  assert.equal(us.geliefert, 10);
  assert.equal(us.zurueck, 2);
  assert.equal(us.andere, 9);
  assert.deepEqual([us.probenFertig, us.probenPremium], [50, 25]);
  assert.deepEqual([t[1].probenFertig, t[1].probenPremium, t[1].frei, t[1].andere], [30, 30, 0, 0]);
  assert.equal(t[3].frei, 12);
});

test("premiumTanks: alle Zielgruppen ohne „andere“; ohne Feld (alter Stand) leer statt Fehler", () => {
  const t = premiumTanks(P, ALL);
  assert.equal(t[0].frei, 119);
  assert.equal(t[0].andere, 0);
  assert.equal(t[0].probenFertig, 53);
  const old = premiumTanks(D, "S2");
  assert.deepEqual(old.map((x) => [x.country, x.frei]), [["US", 0], ["UK", 0], ["FR", 0]]);
});

test("premiumFree zählt Leads mit Status new (Schicht im Tank), premiumProben je Seite", () => {
  assert.equal(premiumFree(P, "S2", "US"), 120);
  assert.equal(premiumFree(P, ALL, "US"), 129);
  assert.equal(premiumProben(P, "S2/US"), 25);
  assert.equal(premiumProben(P, "S2/UK"), 30);
  assert.equal(premiumProben(P, "S2/FR"), 0);
  assert.equal(premiumProben(D, "S2/US"), null);
});

test("dbRing: Marken 6 / 7,5 / 8 GB, Stufen grün/gelb/rot", () => {
  const g = 1024 ** 3;
  const r = dbRing(4 * g);
  assert.equal(r.pct, 0.5);
  assert.equal(r.level, "gruen");
  assert.deepEqual(r.marks.map((m) => m.at), [0.75, 0.9375, 1]);
  assert.equal(r.toBrake, 2 * g);
  assert.equal(dbRing(6 * g).level, "gelb");
  assert.equal(dbRing(7.5 * g).level, "rot");
  assert.equal(dbRing(9 * g).pct, 1);
  assert.equal(dbRing(9 * g).toBrake, 0);
  assert.equal(DB_LIMIT_BYTES, 8 * g);
});

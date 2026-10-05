import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PRO_PREIS, ZIEL_MRR, kpiLeiste, quotenTon, stufenBreite, trichterAus, trichterPaket, zielWeg } from "./jarvis-kpi.ts";
import { pulsStatus } from "./zentrale-logik.ts";
import { werkeBild } from "./zentrale-modell.ts";
import type { WebsiteStats } from "./website-stats.ts";
import type { Extra, Langsam, Schnell } from "./zentrale-typen.ts";

const NOW = Date.parse("2026-10-05T10:00:00Z");
const ago = (min: number) => new Date(NOW - min * 60_000).toISOString();

const st: WebsiteStats = {
  now: "2026-10-05T10:00:00Z", days: 7, since: "2026-09-29", today: "2026-10-05", heat: [], sent: [], pages: [],
  rows: [
    { d: "2026-09-28", s: "us/web-agencies", m: "pe", k: "view", n: 999 },          // vor dem Zeitraum: zählt nicht
    { d: "2026-10-01", s: "us/web-agencies", m: "uv", k: "landing", n: 40 },
    { d: "2026-10-01", s: "us/web-agencies", m: "pe", k: "view", n: 60 },
    { d: "2026-10-01", s: "us/web-agencies", m: "pe", k: "cta_click", n: 10 },
    { d: "2026-10-01", s: "us/web-agencies", m: "pe", k: "sample_request", n: 4 },
    { d: "2026-10-01", s: "us/web-agencies", m: "pe", k: "checkout_started", n: 2 },
    { d: "2026-10-01", s: "us/web-agencies", m: "src", k: "mail", n: 30 },
    { d: "2026-10-02", s: "uk/web-agencies", m: "uv", k: "landing", n: 10 },
    { d: "2026-10-02", s: "uk/web-agencies", m: "pe", k: "view", n: 12 },
    { d: "2026-10-02", s: "uk/web-agencies", m: "pe", k: "purchase", n: 1 },
    { d: "2026-10-02", s: "uk/web-agencies", m: "src", k: "direkt", n: 5 },
  ],
};

test("Trichter: Stufen, Quoten, Zeitraum und Land", () => {
  const a = trichterAus(st, { US: 1 }, 7, "alle");
  assert.deepEqual(a.stufen.map((s) => s.n), [50, 10, 4, 2, 2]);
  assert.equal(a.stufen[0].quote, null);
  assert.equal(a.stufen[1].quote, 10 / 50);
  assert.equal(a.aufrufe, 72);
  assert.deepEqual(a.quellen, [{ k: "mail", n: 30 }, { k: "direkt", n: 5 }]);
  assert.equal(a.seiten[0].k, "us/web-agencies");
  const us = trichterAus(st, { US: 1 }, 7, "US");
  assert.deepEqual(us.stufen.map((s) => s.n), [40, 10, 4, 2, 1]);
  const uk = trichterAus(st, {}, 7, "UK");
  assert.equal(uk.stufen[4].n, 1, "purchase zählt auch ohne Stripe-Cache");
  assert.equal(uk.stufen[2].quote, null, "vorige Stufe 0 → keine Quote");
  assert.deepEqual(a.laender.map((x) => [x.c, x.besucher]), [["US", 40], ["UK", 10], ["FR", 0]]);
});

test("Trichter: Link-Scanner (< 2 min nach Versand) abgezogen und getrennt ausgewiesen, nie unter 0", () => {
  const sc = [{ s: "us/web-agencies", besuche: 12, views: 12, klick: 1, anfrage: 0, checkout: 0 }, { s: "uk/web-agencies", besuche: 50, views: 50, klick: 0, anfrage: 0, checkout: 0 }];
  const us = trichterAus(st, {}, 7, "US", sc);
  assert.deepEqual(us.stufen.map((s) => s.n).slice(0, 4), [28, 9, 4, 2]);
  assert.equal(us.aufrufe, 48);
  assert.deepEqual(us.scanner, { besuche: 12, klicks: 1, ereignisse: 13 });
  assert.equal(us.quellen.find((q) => q.k === "mail")!.n, 18);
  const uk = trichterAus(st, {}, 7, "UK", sc);
  assert.equal(uk.stufen[0].n, 0, "nie negativ");
  assert.equal(uk.aufrufe, 0);
  assert.equal(trichterAus(st, {}, 7, "alle", sc).scanner!.besuche, 62);
  assert.equal(trichterAus(st, {}, 7, "US").scanner, null, "ohne Messung nichts abgezogen");
  const sql = readFileSync(new URL("../../supabase/migrations/20261005160000_signalwerk_jarvis_kpi.sql", import.meta.url), "utf8");
  assert.match(sql, /m\.sent_at between w\.created_at - interval '120 seconds' and w\.created_at/);
});

test("Trichter ohne Messung: alles 0, kein Fehler", () => {
  const p = trichterPaket(null, null, 30, null);
  assert.equal(p.tage, 30);
  assert.ok(Object.values(p.je).every((t) => t.stufen.every((s) => s.n === 0 && s.quote === null)));
  assert.deepEqual(stufenBreite([{ n: 0 }, { n: 0 }]), [0, 0]);
  assert.deepEqual(stufenBreite([{ n: 100 }, { n: 1 }, { n: 0 }]), [100, 3, 0]);
});

test("Ziel-Ring 25.000 €: Anteil, Lücke, Kunden bei Pro", () => {
  assert.equal(ZIEL_MRR, 25_000);
  assert.equal(PRO_PREIS, 249);
  const w = zielWeg(0, 0);
  assert.equal(w.kundenGesamt, 101);
  assert.equal(w.kundenNoch, 101);
  assert.equal(w.anteil, 0);
  const h = zielWeg(12_450, 50);
  assert.equal(h.anteil, 0.498);
  assert.equal(h.kundenNoch, 51);
  assert.equal(zielWeg(30_000, 130).anteil, 1);
  assert.equal(zielWeg(30_000, 130).kundenNoch, 0);
  assert.equal(zielWeg(null, null).ist, null);
});

const extra: Extra = {
  at: ago(5), premium: 7322, premium_land: { US: 7300, UK: 22 }, radar_24h: 182, bewertet_24h: 24565, premium_24h: 141,
  feedback: { n_7d: 0, links_7d: 16, letzte: ago(60) },
  p: { "7": { sent: 368, bounced: 19, complained: 0, antworten: 0, positiv: 0, proben: 2 }, "30": { sent: 508, bounced: 25, complained: 0, antworten: 3, positiv: 1, proben: 3 } },
};

test("KPI-Leiste: zehn Kacheln, Zeitraum, Ampel nur für Status, Gold nur Geld", () => {
  const k = kpiLeiste({ tage: 7, extra, mrr: 0, kunden: 0, bestanden: 0.9732, laufend: 31, gesamt: 40 });
  assert.deepEqual(k.map((x) => x.id), ["mails", "zustellung", "rueck", "antworten", "proben", "kunden", "mrr", "premium", "qualitaet", "werke"]);
  const by = Object.fromEntries(k.map((x) => [x.id, x]));
  assert.equal(by.mails.wert, "368");
  assert.equal(by.rueck.wert, "19");
  assert.equal(by.rueck.ton, "rot", "5,2 % Rückläufer = rot (Notbremse 5 %)");
  assert.equal(by.zustellung.ton, "rot", "94,8 % < 95 %");
  assert.equal(by.qualitaet.ton, "gruen");
  assert.equal(by.werke.wert, "31/40");
  assert.equal(by.premium.wert, "7.322");
  assert.equal(by.mrr.ton, "gold");
  assert.deepEqual(k.filter((x) => x.ton === "gold").map((x) => x.id), ["mrr"]);
  const m = kpiLeiste({ tage: 30, extra, mrr: 0, kunden: 0, bestanden: null, laufend: null, gesamt: 40 });
  assert.equal(m.find((x) => x.id === "antworten")!.wert, "3");
  assert.equal(m.find((x) => x.id === "qualitaet")!.ton, "grau");
  assert.equal(m.find((x) => x.id === "werke")!.wert, "–");
});

test("KPI-Leiste ohne Daten: „–“ und grau, nie erfundene 0", () => {
  const k = kpiLeiste({ tage: 7, extra: null, mrr: null, kunden: null, bestanden: null, laufend: null, gesamt: 40 });
  for (const x of k) { assert.equal(x.wert, "–", x.id); assert.equal(x.ton, "grau", x.id); }
  assert.equal(quotenTon(0.01, 0.02, 0.05, false), "gruen");
  assert.equal(quotenTon(0.06, 0.02, 0.05, false), "rot");
});

test("Werke-Karte: Radar, Premium, Kontakt, Feedback live aus Herzschlag bzw. Ersatzquelle", () => {
  const s = { now: new Date(NOW).toISOString(), beats: [
    { werk: "lead-werk", last_beat: ago(2), plaetze: 10, processed_60m: 100, green_60m: 90 },
    { werk: "proben-vorrat", last_beat: ago(3), plaetze: 1, processed_60m: 1, green_60m: 1 },
    { werk: "kontakt-werk", last_beat: ago(30), plaetze: 0, processed_60m: 0, green_60m: 0 },
  ], tasks: [], plan_log: [], owner: {}, msg: { sent_60m: 0, sent_24h: 0, sent_heute: 0, last_sent_at: null, blocked_60m: 0 }, acks: {}, replies: { offen: 0, heiss: 0 } } as unknown as Schnell;
  const l = { runs: {}, extra, stand: ago(5) } as unknown as Langsam;
  const w = werkeBild(s, l, NOW);
  assert.equal(w.radar.puls, "live");
  assert.equal(w.radar.zahl, "182");
  assert.equal(w.premium.puls, "live");
  assert.equal(w.premium.zahl, "7.322");
  assert.equal(w.kontakt.puls, "still");
  assert.equal(w.feedback.fehlt, false);
  assert.equal(w.feedback.puls, "live~");
  assert.equal(w.feedback.zahl, "0");
  assert.equal(pulsStatus({ id: "feedback", status: "laeuft" }, NOW, { beats: {}, feedback: ago(9 * 1440) }), "still");
  assert.equal(pulsStatus({ id: "feedback", status: "laeuft" }, NOW, { beats: {} }), "grau");
});

test("Trichter-Endpunkt: Inhaber-Sitzung, nur lesen, kein Zwischenspeicher", () => {
  const route = readFileSync(new URL("../app/api/jarvis/trichter/route.ts", import.meta.url), "utf8");
  const data = readFileSync(new URL("./jarvis-trichter-data.ts", import.meta.url), "utf8");
  assert.match(route, /verifySession\(token, process\.env\.SESSION_SECRET/);
  assert.match(route, /status: 404/);
  assert.match(route, /Cache-Control": "no-store/);
  for (const src of [route, data]) assert.doesNotMatch(src, /\.(insert|update|upsert|delete)\(/);
  // Zusatz-Zahlen nur im Zwischenspeicher (Wachhund), nie live im Abruf
  const sql = readFileSync(new URL("../../supabase/migrations/20261005160000_signalwerk_jarvis_kpi.sql", import.meta.url), "utf8");
  assert.match(sql, /v := v \|\| jsonb_build_object\('extra', x\)/);
  assert.doesNotMatch(sql, /\bdrop\b|\bdelete\b|\btruncate\b/i);
});

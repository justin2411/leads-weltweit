import { test } from "node:test";
import assert from "node:assert/strict";
import {
  analyticsBrief, channels, delta, eventsByStage, fmtTile, hints, pageLabel, ranked, rateVital, scrollByStage, slice, tiles, weekHour,
  type AnalyticsCache,
} from "./website-analytics.ts";
import { browserOf, parseBeacon, utmKey } from "./website-stats.ts";
import type { FunnelCache } from "./website-funnel.ts";

const PV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const V = "11111111-2222-4333-8444-555555555555";

const CUR = {
  k: { visitors: 100, views: 160, engaged: 55, eng_s: 4200, tarif: 20, stripe: 5, danke: 2, ttc_s: 300, scroll_n: 120, scroll75: 30,
       cta: 16, forms: 10, formd: 4, vid: 8, vidd: 2, lcp: 3100, inp: 180, cls: 260, vit_n: 40 },
  ch: [
    { s: "mail", r: "-", m: "email", c: "s2-us", n: 40, t: 14, k: 4 },
    { s: "suche", r: "google.com", m: "-", c: "-", n: 30, t: 3, k: 0 },
    { s: "andere", r: "linkedin.com", m: "-", c: "-", n: 2, t: 2, k: 1 },
  ],
  en: { "start|-": 50, "landing|us/web-agencies": 40 }, ex: { "landing|us/web-agencies": 60, "tarif|us/web-agencies": 15 },
  br: { chrome: 60, safari: 30, "-": 10 }, dv: { desktop: 70, mobil: 30 }, co: { US: 80, UK: 20 },
  wh: [[1, 9, 5], [1, 10, 9], [7, 23, 1], [9, 1, 99]] as [number, number, number][],
  sc: [{ st: "landing", s: 25, n: 10 }, { st: "landing", s: 75, n: 6 }, { st: "landing", s: 100, n: 4 }],
  ev: [{ st: "landing", k: "cta", n: 12 }, { st: "landing", k: "form_start", n: 10 }, { st: "landing", k: "form_submit", n: 4 }, { st: "start", k: "video_start", n: 3 }],
  vi: [{ p: "landing|us/web-agencies", n: 20, lcp: 4400, inp: 300, cls: 120 }, { p: "start|-", n: 15, lcp: 1900, inp: 90, cls: 20 }, { p: "tarif|uk/x", n: 1, lcp: 9000, inp: null, cls: null }],
  ab: [],
};
const PREV = { visitors: 80, views: 120, engaged: 50, eng_s: 3000, tarif: 10, stripe: 2, danke: 2, ttc_s: 400, scroll_n: 100, scroll75: 30, cta: 10, forms: 0, formd: 0, vid: 0, vidd: 0, lcp: 2800, inp: 220, cls: 260, vit_n: 30 };
const A: AnalyticsCache = { at: "2026-10-04T12:00:00Z", since: "2026-10-04T10:00:00Z", c: { ALL: { "7d": { cur: CUR, prev: PREV } } } };
const F: FunnelCache = { p: { "7d": { rows: [
  { st: "start", c: "US", dv: "desktop", sr: "direkt", uv: 50, v: 60, b: 20, dw: 100, dn: 40, nx: 30 },
  { st: "landing", c: "US", dv: "desktop", sr: "mail", uv: 60, v: 70, b: 20, dw: 100, dn: 40, nx: 6 },
  { st: "tarif", c: "US", dv: "desktop", sr: "mail", uv: 20, v: 30, b: 2, dw: 100, dn: 20, nx: 5 },
  { st: "stripe", c: "US", dv: "desktop", sr: "mail", uv: 5, v: 5, b: 0, dw: 0, dn: 0, nx: 2 },
], tot: { US: 100 }, all: 100 } } };

test("Kacheln: Kennzahlen wie GA4 und Vergleich zum Vorzeitraum", () => {
  const ts = tiles(CUR.k, PREV);
  const by = Object.fromEntries(ts.map((t) => [t.id, t]));
  assert.equal(by.visitors.value, 100);
  assert.equal(by.eng.value, 0.55);
  assert.equal(by.time.value, 42);
  assert.equal(by.ppv.value, 1.6);
  assert.equal(by.scroll.value, 0.25);
  assert.equal(by.cta.value, 0.1);
  assert.equal(by.form.value, 0.4);
  assert.equal(by.form.prev, null); // Vorzeitraum ohne Formular → kein Vergleich
  assert.equal(by.conv.value, 0.02);
  assert.equal(by.lcp.rating, "mittel");
  assert.equal(by.inp.rating, "gut");
  assert.equal(by.cls.rating, "schlecht");
  assert.deepEqual(delta(by.visitors), { dir: "up", tone: "good", text: "+25 %" });
  assert.deepEqual(delta(by.tarif), { dir: "up", tone: "good", text: "+7,5 Pp" });
  assert.deepEqual(delta(by.lcp), { dir: "up", tone: "bad", text: "+11 %" }); // langsamer = schlecht
  assert.deepEqual(delta(by.ttc), { dir: "down", tone: "good", text: "−25 %" });
  assert.equal(delta(by.form), null);
  assert.equal(tiles(undefined, undefined).find((t) => t.id === "visitors")!.prev, null);
});

test("Formate", () => {
  assert.equal(fmtTile(null, "int"), "–");
  assert.equal(fmtTile(1234, "int"), "1.234");
  assert.equal(fmtTile(3100, "ms"), "3,1 s");
  assert.equal(fmtTile(180, "ms"), "180 ms");
  assert.equal(fmtTile(260, "cls"), "0,26");
  assert.equal(fmtTile(1.6, "dec"), "1,6");
  assert.equal(rateVital("lcp", 2500), "gut");
  assert.equal(rateVital("inp", 501), "schlecht");
  assert.equal(rateVital("cls", null), null);
});

test("Aufschlüsselungen: Kanäle, Seiten, Wochentag × Stunde, Scrolltiefe, Ereignisse", () => {
  const ch = channels(CUR);
  assert.deepEqual(ch[0], { label: "Mail", sub: "email / s2-us", n: 40, tarif: 0.35, checkout: 4 });
  assert.equal(ch[1].label, "Suche · google.com");
  assert.equal(pageLabel("landing|us/web-agencies"), "Landingpage us/web-agencies");
  assert.equal(pageLabel("start|-"), "Startseite");
  assert.deepEqual(ranked(CUR.en, pageLabel).map((x) => x.label), ["Startseite", "Landingpage us/web-agencies"]);
  const wh = weekHour(CUR.wh);
  assert.equal(wh.m[0][10], 9);
  assert.equal(wh.m[6][23], 1);
  assert.equal(wh.total, 15); // ungültiger Wochentag 9 verworfen
  assert.equal(wh.max, 9);
  const sc = scrollByStage(CUR.sc);
  assert.equal(sc[0].st, "landing");
  assert.deepEqual(sc[0].at, [1, 0.5, 0.5, 0.2]);
  const ev = eventsByStage(CUR.ev);
  assert.deepEqual(ev.map((r) => r.st), ["start", "landing"]);
  assert.equal(ev[1].cta, 12);
  assert.equal(ev[1].fd, 4);
});

test("Hinweise: größter Abbruch, beste Quelle, langsamste Seite – kurz (Titel ≤ 60, Grund ≤ 160)", () => {
  const h = hints(A, F, "7d");
  assert.deepEqual(h.map((x) => x.id), ["abbruch", "quelle", "langsam"]);
  assert.equal(h[0].title, "Größter Abbruch: Landingpage → Tarif");
  assert.match(h[0].grund, /^Nur 10 % der 60 Besucher/);
  assert.equal(h[1].title, "Beste Quelle: Mail"); // linkedin hat nur 2 Besucher → zählt nicht
  assert.equal(h[2].title, "Langsamste Seite: Landingpage us/web-agencies"); // tarif|uk/x nur 1 Messung
  assert.equal(h[2].tone, "red");
  for (const x of h) { assert.ok(x.title.length <= 60, x.title); assert.ok(x.grund.length <= 160, x.grund); }
  const empty = hints(null, null, "24h");
  assert.deepEqual(empty.map((x) => x.tone), ["grey", "grey", "grey"]);
  assert.match(empty[0].title, /noch zu wenig Daten/);
});

test("JARVIS-Kurzfassung und Ausschnitt", () => {
  assert.deepEqual(analyticsBrief(null, null), { fehler: "noch keine Messung" });
  const b = analyticsBrief(A, F) as { kennzahlen: string[]; hinweise: string[]; kanaele: string[] };
  assert.ok(b.kennzahlen.includes("Besucher 100 (+25 %)"));
  assert.equal(b.hinweise.length, 3);
  assert.match(b.kanaele[0], /^Mail \[email \/ s2-us\]: 40 Besucher, Tarif 35 %/);
  assert.deepEqual(slice(A, "24h", "UK"), { cur: {}, prev: null });
});

test("Beacons: Ereignisse und Web Vitals streng geprüft, UTM und Browser nur als Klasse", () => {
  assert.deepEqual(parseBeacon({ type: "ev", st: "landing", pv: PV, k: "form_start", variant_id: V }), { kind: "ev", stage: "landing", variant_id: V, pv: PV, ev: "form_start" });
  assert.deepEqual(parseBeacon({ type: "ev", st: "start", pv: PV, k: "cta" }), { kind: "ev", stage: "start", variant_id: null, pv: PV, ev: "cta" });
  assert.equal(parseBeacon({ type: "ev", st: "landing", pv: PV, k: "cta" }), null); // Landingpage braucht Variante
  assert.equal(parseBeacon({ type: "ev", st: "start", pv: PV, k: "open" }), null);
  assert.deepEqual(parseBeacon({ type: "vitals", st: "start", pv: PV, dev: "mobil", lcp: 2100, inp: null, cls: 50 }),
    { kind: "vitals", stage: "start", variant_id: null, pv: PV, device: "mobil", lcp: 2100, inp: null, cls: 50 });
  assert.equal((parseBeacon({ type: "vitals", st: "start", pv: PV, dev: "mobil", lcp: 999999 }) as { lcp: number }).lcp, 60000);
  assert.equal(parseBeacon({ type: "vitals", st: "start", pv: PV, dev: "mobil" }), null);
  const h = parseBeacon({ type: "hit", st: "start", pv: PV, dev: "desktop", src: "mail", um: "email", uc: "s2-us", ref: null }) as { um?: string; uc?: string };
  assert.equal(h.um, "email");
  assert.equal(h.uc, "s2-us");
  assert.equal((parseBeacon({ type: "hit", st: "start", pv: PV, dev: "desktop", src: "mail", um: "a b@c" }) as { um?: string }).um, undefined);
  assert.equal(utmKey("Kaltmail UK/Okt?x=1"), "kaltmailukoktx1");
  assert.equal(utmKey(""), null);
  assert.equal(browserOf("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"), "chrome");
  assert.equal(browserOf("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"), "safari");
  assert.equal(browserOf("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36 Edg/129.0"), "edge");
  assert.equal(browserOf("Mozilla/5.0 (X11; Linux x86_64; rv:131.0) Gecko/20100101 Firefox/131.0"), "firefox");
  assert.equal(browserOf(""), "andere");
});

import { test } from "node:test";
import assert from "node:assert/strict";
import {
  RateLimiter, bin2, buildView, cleanLabel, density, depthBucket, deviceOf, dwellBucket, heatCells, isBot, parseBeacon,
  refHost, sourceOf, subjectOf, topTargets, webLine, webNeck, EMPTY_WEBSITE, WEB_INFO, WEB_LINE, type WebsiteStats,
} from "./website-stats.ts";

const V = "11111111-2222-4333-8444-555555555555";
const PV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";

test("Herkunft: src=mail, Webmail, Suche, direkt, andere – nur aus Domain", () => {
  assert.equal(sourceOf("mail", "", "www.nextgen-profit.de"), "mail");
  assert.equal(sourceOf("MAIL", "www.google.com", "www.nextgen-profit.de"), "mail");
  assert.equal(sourceOf(null, "mail.google.com", "www.nextgen-profit.de"), "mail");
  assert.equal(sourceOf(null, "outlook.live.com", "nextgen-profit.de"), "mail");
  assert.equal(sourceOf(null, "www.google.co.uk", "nextgen-profit.de"), "suche");
  assert.equal(sourceOf(null, "duckduckgo.com", "nextgen-profit.de"), "suche");
  assert.equal(sourceOf(null, "www.bing.com", "nextgen-profit.de"), "suche");
  assert.equal(sourceOf(null, "", "nextgen-profit.de"), "direkt");
  assert.equal(sourceOf(null, "nextgen-profit.de", "www.nextgen-profit.de:443"), "direkt");
  assert.equal(sourceOf(null, "news.ycombinator.com", "nextgen-profit.de"), "andere");
  assert.equal(sourceOf("x", "googleusercontent.example.com", "nextgen-profit.de"), "andere");
});

test("Referrer: nur Hostname, nie Pfad/Parameter", () => {
  assert.equal(refHost("https://www.google.com/search?q=geheim"), "www.google.com");
  assert.equal(refHost("kaputt"), "");
  assert.equal(refHost(""), "");
});

test("Betreff-Variante, Gerät, Raster, Tiefe, Verweildauer", () => {
  assert.equal(subjectOf("a"), "A");
  assert.equal(subjectOf("B"), "B");
  assert.equal(subjectOf("C"), null);
  assert.equal(deviceOf(390, true), "mobil");
  assert.equal(deviceOf(1440, false), "desktop");
  assert.equal(deviceOf(700, false), "mobil");
  assert.equal(bin2(0, 1000), 0);
  assert.equal(bin2(33, 1000), 2);
  assert.equal(bin2(999, 1000), 98);
  assert.equal(bin2(5000, 1000), 98);
  assert.equal(bin2(-5, 1000), 0);
  assert.equal(bin2(10, 0), 0);
  assert.equal(depthBucket(100, 1000), 0);
  assert.equal(depthBucket(250, 1000), 25);
  assert.equal(depthBucket(740, 1000), 50);
  assert.equal(depthBucket(800, 1000), 75);
  assert.equal(depthBucket(975, 1000), 100);
  assert.equal(dwellBucket(3_000), "0-10");
  assert.equal(dwellBucket(45_000), "30-60");
  assert.equal(dwellBucket(600_000), "180+");
});

test("Beschriftung: kurz, ohne Mail-Adressen, Nummern, Links", () => {
  assert.equal(cleanLabel("  Get my   10 free leads → "), "Get my 10 free leads →");
  assert.equal(cleanLabel("Send to max@firma.co.uk"), null);
  assert.equal(cleanLabel("Call 0207 123 4567"), null);
  assert.equal(cleanLabel("www.example.com"), null);
  assert.equal(cleanLabel(""), null);
  assert.equal(cleanLabel("x".repeat(60))!.length, 40);
});

test("Bots: Suchmaschinen, Link-Prüfer, Skripte, leerer User-Agent", () => {
  assert.equal(isBot("Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"), true);
  assert.equal(isBot("Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/120.0 Safari/537.36"), true);
  assert.equal(isBot("python-requests/2.31"), true);
  assert.equal(isBot("Barracuda Sentinel (EE)"), true);
  assert.equal(isBot(""), true);
  assert.equal(isBot(null), true);
  assert.equal(isBot("Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"), false);
  assert.equal(isBot("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0 Safari/537.36"), false);
});

test("Ereignisse streng prüfen", () => {
  assert.deepEqual(parseBeacon({ variant_id: V, type: "view" }), { kind: "legacy", variant_id: V, type: "view" });
  assert.deepEqual(parseBeacon({ variant_id: V, pv: PV, type: "view", src: "mail", sv: "b", dev: "mobil" }),
    { kind: "view", variant_id: V, pv: PV, src: "mail", subj: "B", device: "mobil", ref: null });
  // Betreff-Variante nur bei Mail-Herkunft
  assert.equal((parseBeacon({ variant_id: V, pv: PV, type: "view", src: "direkt", sv: "A", dev: "desktop" }) as { subj: unknown }).subj, null);
  assert.equal(parseBeacon({ variant_id: V, pv: PV, type: "view", src: "facebook", dev: "desktop" }), null);
  assert.equal(parseBeacon({ variant_id: "x", type: "view" }), null);
  assert.equal(parseBeacon([1]), null);
  assert.equal(parseBeacon(null), null);
  const c = parseBeacon({ variant_id: V, pv: PV, type: "click", x: 10, y: 98, el: "cta", label: "Get leads", dev: "desktop" });
  assert.deepEqual(c, { kind: "click", variant_id: V, pv: PV, x: 10, y: 98, el: "cta", label: "Get leads", device: "desktop", cta: true });
  assert.equal(parseBeacon({ variant_id: V, pv: PV, type: "click", x: 11, y: 10, el: "link", dev: "desktop" }), null); // nicht im 2-%-Raster
  assert.equal(parseBeacon({ variant_id: V, pv: PV, type: "click", x: 100, y: 10, el: "link", dev: "desktop" }), null);
  assert.equal(parseBeacon({ variant_id: V, pv: PV, type: "click", x: 10, y: 10, el: "img", dev: "desktop" }), null);
  // Formularfelder: nie eine Beschriftung (keine Eingaben)
  const f = parseBeacon({ variant_id: V, pv: PV, type: "click", x: 10, y: 10, el: "feld", label: "Acme Ltd", dev: "mobil" });
  assert.equal((f as { label: unknown }).label, null);
  assert.deepEqual(parseBeacon({ variant_id: V, pv: PV, type: "end", depth: 75, dwell: "30-60" }), { kind: "end", variant_id: V, pv: PV, depth: 75, dwell: "30-60", ds: null });
  assert.equal(parseBeacon({ variant_id: V, pv: PV, type: "end", depth: 70, dwell: "30-60" }), null);
  assert.equal(parseBeacon({ variant_id: V, pv: PV, type: "cta_click" }), null);
});

test("Begrenzung je Seitenaufruf und je Sekunde", () => {
  const r = new RateLimiter(3, 5, 1000);
  assert.equal(r.allow("a", 0), true);
  assert.equal(r.allow("a", 1), true);
  assert.equal(r.allow("a", 2), true);
  assert.equal(r.allow("a", 3), false);
  assert.equal(r.allow("b", 4), true);
  assert.equal(r.allow(null, 5), false); // 6. Ereignis in derselben Sekunde
  assert.equal(r.allow("a", 1500), true); // neues Fenster
});

// Erfundene Zählungen – keine echten Daten
const ST: WebsiteStats = {
  now: "2026-10-04T18:00:00Z", days: 3, since: "2026-10-02", today: "2026-10-04",
  rows: [
    { d: "2026-10-02", s: "uk/web-agencies", m: "pe", k: "view", n: 10 },
    { d: "2026-10-04", s: "uk/web-agencies", m: "pe", k: "view", n: 5 },
    { d: "2026-10-04", s: "us/web-agencies", m: "pe", k: "view", n: 20 },
    { d: "2026-10-04", s: "us/web-agencies", m: "pe", k: "cta_click", n: 4 },
    { d: "2026-10-04", s: "us/web-agencies", m: "pe", k: "sample_request", n: 2 },
    { d: "2026-10-04", s: "us/web-agencies", m: "pe", k: "purchase", n: 1 },
    { d: "2026-10-04", s: "us/web-agencies", m: "tv", k: "all", n: 20 },
    { d: "2026-10-04", s: "us/web-agencies", m: "src", k: "mail", n: 12 },
    { d: "2026-10-04", s: "us/web-agencies", m: "src", k: "suche", n: 8 },
    { d: "2026-10-04", s: "us/web-agencies", m: "dev", k: "mobil", n: 15 },
    { d: "2026-10-04", s: "us/web-agencies", m: "dev", k: "desktop", n: 5 },
    { d: "2026-10-04", s: "us/web-agencies", m: "depth", k: "0", n: 2 },
    { d: "2026-10-04", s: "us/web-agencies", m: "depth", k: "25", n: 8 },
    { d: "2026-10-04", s: "us/web-agencies", m: "depth", k: "75", n: 6 },
    { d: "2026-10-04", s: "us/web-agencies", m: "depth", k: "100", n: 4 },
    { d: "2026-10-04", s: "us/web-agencies", m: "dwell", k: "10-30", n: 9 },
    { d: "2026-10-04", s: "us/web-agencies", m: "mail", k: "A", n: 7 },
    { d: "2026-10-04", s: "us/web-agencies", m: "mail", k: "B", n: 5 },
    { d: "2026-09-01", s: "us/web-agencies", m: "pe", k: "view", n: 999 }, // vor dem Zeitraum
  ],
  heat: [
    { s: "us/web-agencies", m: "hm", k: "mobil|10|20", n: 4 },
    { s: "us/web-agencies", m: "hm", k: "mobil|12|20", n: 2 },
    { s: "us/web-agencies", m: "hm", k: "desktop|50|50", n: 9 },
    { s: "uk/web-agencies", m: "hm", k: "mobil|10|20", n: 1 },
    { s: "us/web-agencies", m: "tg", k: "mobil|cta|Get my 10 free leads", n: 5 },
    { s: "us/web-agencies", m: "tg", k: "mobil|faq|How does it work?", n: 2 },
    { s: "us/web-agencies", m: "tg", k: "mobil|flaeche|", n: 1 },
    { s: "us/web-agencies", m: "tg", k: "desktop|link|Privacy", n: 3 },
  ],
  sent: [
    { c: "US", g: "S2", v: "A", n: 100 }, { c: "US", g: "S2", v: "B", n: 100 }, { c: "UK", g: "S2", v: "A", n: 40 },
  ],
  pages: [{ s: "us/web-agencies", g: "S2", c: "US", st: "live" }, { s: "uk/web-agencies", g: "S2", c: "UK", st: "live" }],
};

test("Auswertung: Tage, Länder, Trichter, Herkunft, Treppe, Mail A/B", () => {
  const v = buildView(ST, { country: null, page: null, device: "mobil" });
  assert.deepEqual(v.days, ["2026-10-02", "2026-10-03", "2026-10-04"]);
  assert.deepEqual(v.perDay.map((d) => d.total), [10, 0, 25]);
  assert.deepEqual(v.countries, ["US", "UK"]);
  assert.deepEqual(v.funnel, { views: 35, cta: 4, req: 2, buy: 1, checkout: 0, land: 0, tarif: 0, tarifViews: 0 });
  assert.equal(v.tracked, 20);
  // Probe-Weg je Land: Summe = Gesamt, Reihenfolge US, UK
  assert.deepEqual(v.byCountry.map((c) => c.country), ["US", "UK"]);
  assert.equal(v.byCountry.reduce((a, c) => a + c.views, 0), 35);
  assert.equal(v.byCountry.reduce((a, c) => a + c.cta, 0), 4);
  assert.equal(v.byCountry.reduce((a, c) => a + c.req, 0), 2);
  assert.equal(v.sources.mail, 12);
  assert.equal(v.devices.mobil, 15);
  assert.deepEqual(v.depth.map((d) => d.n), [18, 10, 10, 4]);
  assert.equal(v.depth[0].share, 0.9);
  const us = v.mail.find((m) => m.country === "US")!;
  assert.deepEqual([us.A, us.B, us.sentA, us.sentB], [7, 5, 100, 100]);
  assert.equal(v.mail.find((m) => m.country === "UK")!.sentA, 40);
  // Heatmap nur für das Gerät, über alle Seiten
  assert.equal(v.heatTotal, 7);
  assert.equal(v.heatMax, 5); // mobil|10|20 aus US (4) + UK (1)
});

test("Filter Land/Seite", () => {
  const v = buildView(ST, { country: "UK", page: null, device: "mobil" });
  assert.equal(v.funnel.views, 15);
  assert.deepEqual(v.byCountry.map((c) => c.country), ["UK"]);
  assert.equal(v.byCountry[0].views, 15);
  assert.equal(v.tracked, 0);
  assert.deepEqual(v.mail.map((m) => m.country), ["UK"]);
  const p = buildView(ST, { country: null, page: "us/web-agencies", device: "desktop" });
  assert.equal(p.funnel.views, 20);
  assert.equal(p.heatTotal, 9);
  assert.deepEqual(p.targets.map((t) => t.label), ["Privacy"]);
});

test("Heatmap: Raster, Dichte, Klickziele", () => {
  const { cells, max, total } = heatCells(ST.heat, { country: "US", page: null, device: "mobil" });
  assert.equal(total, 6);
  assert.equal(max, 4);
  const d = density(cells);
  const top = d.find((c) => c.x === 10)!, side = d.find((c) => c.x === 12)!;
  assert.equal(top.w, 1);
  assert.ok(side.w > 0 && side.w < 1);
  assert.deepEqual(density([]), []);
  const t = topTargets(ST.heat, { country: null, page: null, device: "mobil" });
  assert.deepEqual(t.map((x) => [x.el, x.label, x.n]), [["cta", "Get my 10 free leads", 5], ["faq", "How does it work?", 2], ["flaeche", "", 1]]);
  assert.equal(Math.round(t[0].share * 100), 63);
});

test("Engpass der Website nach festen Schwellen: Landingpage → Tarif → Stripe → Danke", () => {
  assert.equal(webNeck(EMPTY_WEBSITE), null);
  assert.equal(webNeck({ ...EMPTY_WEBSITE, mails_30d: 300, mail_views_30d: 2 }), "wland");
  assert.equal(webNeck({ ...EMPTY_WEBSITE, mails_30d: 300, mail_views_30d: 9, land_30d: 100, tarif_30d: 2 }), "wtarif");
  assert.equal(webNeck({ ...EMPTY_WEBSITE, land_30d: 100, tarif_30d: 30, co_30d: 1 }), "wstripe");
  assert.equal(webNeck({ ...EMPTY_WEBSITE, land_30d: 100, tarif_30d: 30, co_30d: 6, buy_30d: 0 }), "wdanke");
  assert.equal(webNeck({ ...EMPTY_WEBSITE, land_30d: 100, tarif_30d: 30, co_30d: 6, buy_30d: 1 }), null);
  // unter den Mindestmengen nie ein Engpass
  assert.equal(webNeck({ ...EMPTY_WEBSITE, land_30d: 49, tarif_30d: 0 }), null);
});

test("JARVIS-Linie Website: genau Startseite, Landingpage, Tarif, Stripe, Danke → Kunden (kein „Kauf“)", () => {
  assert.deepEqual(WEB_LINE.map((x) => x.label), ["Startseite", "Landingpage", "Tarif", "Stripe", "Danke"]);
  const w = { ...EMPTY_WEBSITE, land_24h: 40, land_60m: 3, views_24h: 90, tarif_24h: 7, tarif_60m: 0, co_24h: 2, co_60m: 1, buy_24h: 1, buy_30d: 4, buy_60m: 0 };
  const { stations, edges } = webLine(w);
  assert.deepEqual(stations.map((s) => s.label), ["Startseite", "Landingpage", "Tarif", "Stripe", "Danke"]);
  assert.ok(!stations.some((s) => /Kauf/.test(s.label)));
  assert.deepEqual(stations.map((s) => s.value), ["0", "40", "7", "2", "1"]);
  assert.deepEqual(stations.map((s) => s.state), ["idle", "live", "idle", "live", "idle"]);
  assert.match(stations[1].tip, /90 Aufrufe gesamt/);
  assert.ok(stations[0].tip.includes(WEB_INFO) && stations[1].tip.includes(WEB_INFO) && stations[2].tip.includes(WEB_INFO));
  assert.deepEqual(edges.map((e) => `${e.from}>${e.to}`), ["wstart>wland", "wland>wtarif", "wtarif>wstripe", "wstripe>wdanke", "wdanke>kunden"]);
  assert.deepEqual(edges.map((e) => e.perHour), [0, 0, 1, 0, 0]);
  assert.match(WEB_INFO, /eindeutig je Tag/);
  assert.match(WEB_INFO, /ohne Cookies/);
  assert.match(WEB_INFO, /Inhaber ausgeblendet/);
});

test("Tarif-Beacon: nur Variante + Seitenart, alles andere verworfen", () => {
  assert.deepEqual(parseBeacon({ variant_id: V, type: "visit", pg: "tarif" }), { kind: "visit", variant_id: V, page: "tarif" });
  assert.equal(parseBeacon({ variant_id: V, type: "visit", pg: "landing" }), null);
  assert.equal(parseBeacon({ variant_id: V, type: "visit" }), null);
  assert.equal(parseBeacon({ variant_id: "x", type: "visit", pg: "tarif" }), null);
  // A/B je Schritt: nur Marken „<test>.<A|B>“, sonst weg (keine Person, keine freien Texte)
  const M = "4f0c3a8e-1b2d-4c5e-9f00-112233445566";
  const hit = { type: "hit", st: "tarif", pv: PV, dev: "desktop", src: "direkt", variant_id: V };
  assert.deepEqual(parseBeacon({ ...hit, ab: `${M.toUpperCase()}.b`, abc: `${M}.A` }),
    { kind: "hit", stage: "tarif", variant_id: V, pv: PV, src: "direkt", ref: null, device: "desktop", ab: `${M}.B`, abc: `${M}.A` });
  assert.deepEqual(parseBeacon({ ...hit, ab: "x@y.de", abc: `${M}.C` }),
    { kind: "hit", stage: "tarif", variant_id: V, pv: PV, src: "direkt", ref: null, device: "desktop" });
  // nur auf der Tarifseite
  assert.equal((parseBeacon({ ...hit, st: "danke", ab: `${M}.A` }) as { ab?: string }).ab, undefined);
});

test("Auswertung: eindeutige Besucher (uv) und Tarif-Aufrufe (av) im Trichter", () => {
  const st: WebsiteStats = { ...ST, rows: [
    ...ST.rows,
    { d: "2026-10-03", s: "us/web-agencies", m: "uv", k: "landing", n: 8 },
    { d: "2026-10-04", s: "us/web-agencies", m: "uv", k: "landing", n: 5 },
    { d: "2026-10-04", s: "uk/web-agencies", m: "uv", k: "landing", n: 2 },
    { d: "2026-10-04", s: "us/web-agencies", m: "uv", k: "tarif", n: 3 },
    { d: "2026-10-04", s: "us/web-agencies", m: "av", k: "tarif", n: 6 },
    { d: "2026-10-04", s: "us/web-agencies", m: "pe", k: "checkout_started", n: 2 },
  ] };
  const all = buildView(st, { country: null, page: null, device: "mobil" }).funnel;
  assert.deepEqual([all.land, all.tarif, all.tarifViews, all.checkout, all.buy], [15, 3, 6, 2, 1]);
  const uk = buildView(st, { country: "UK", page: null, device: "mobil" }).funnel;
  assert.deepEqual([uk.land, uk.tarif], [2, 0]);
});

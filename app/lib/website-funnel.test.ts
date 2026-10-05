import { test } from "node:test";
import assert from "node:assert/strict";
import { FUNNEL_PERIODS, fmtDwell, fmtRate, funnelBrief, funnelView, geoCountry, nextStage, stageWidths, startLive, type FunnelCache } from "./website-funnel.ts";
import { parseBeacon, refKey, webLine, EMPTY_WEBSITE } from "./website-stats.ts";

const PV = "aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee";
const V = "11111111-2222-4333-8444-555555555555";

// 7 Tage: US 10 Start-Besucher (4 weiter), 8 Landing (3 weiter), UK 5 Landing; 2 Tarif, 1 Stripe, 1 Danke
const CACHE: FunnelCache = {
  at: "2026-10-04T20:00:00Z", since: "2026-10-04T18:00:00Z",
  p: {
    "7d": {
      rows: [
        { st: "start", c: "US", dv: "desktop", sr: "direkt", uv: 6, v: 9, b: 3, dw: 300, dn: 6, nx: 3 },
        { st: "start", c: "US", dv: "mobil", sr: "suche", uv: 4, v: 4, b: 2, dw: 40, dn: 4, nx: 1 },
        { st: "landing", c: "US", dv: "desktop", sr: "mail", uv: 8, v: 10, b: 4, dw: 400, dn: 8, nx: 3 },
        { st: "landing", c: "UK", dv: "mobil", sr: "mail", uv: 5, v: 5, b: 5, dw: 0, dn: 0, nx: 0 },
        { st: "tarif", c: "US", dv: "desktop", sr: "mail", uv: 2, v: 3, b: 0, dw: 120, dn: 2, nx: 1 },
        { st: "stripe", c: "US", dv: "desktop", sr: "mail", uv: 1, v: 1, b: 0, dw: 0, dn: 0, nx: 1 },
        { st: "danke", c: "US", dv: "desktop", sr: "mail", uv: 1, v: 2, b: 0, dw: 30, dn: 1, nx: 0 },
      ],
      refs: [{ st: "start", c: "US", r: "google.com", n: 4 }, { st: "landing", c: "UK", r: "linkedin.com", n: 2 }],
      tot: { US: 20, UK: 5 }, all: 24,
    },
  },
  buy: { "7d": { US: 1 } },
  live: { start_60m: 3, start_land_60m: 1 },
};

test("Trichter: Besucher, Aufrufe, Absprung, Ø Zeit und Weiter-Quote je Stufe", () => {
  const v = funnelView(CACHE, "7d", null);
  assert.deepEqual(v.stages.map((s) => s.id), ["start", "landing", "tarif", "stripe", "danke"]);
  const [start, land, tarif, stripe, danke] = v.stages;
  assert.equal(start.uv, 10);
  assert.equal(start.views, 13);
  assert.equal(start.bounce, 0.5);
  assert.equal(start.dwell, 34);
  assert.equal(start.next, 0.4);
  assert.equal(land.uv, 13);
  assert.equal(land.bounce, 9 / 13);
  assert.equal(land.dwell, 50); // ohne Messung (dn 0) zählt nicht in die Ø Zeit
  assert.equal(tarif.next, 0.5);
  assert.equal(stripe.bounce, null); // Stripe: kein Absprung, keine Zeit
  assert.equal(stripe.dwell, null);
  assert.equal(danke.next, null);
  assert.equal(v.total, 24);
  assert.equal(v.conv, 1 / 24);
  assert.equal(v.buys, 1);
});

test("Trichter: Filter Land, Details nach Land/Gerät/Herkunft/Domain", () => {
  const uk = funnelView(CACHE, "7d", "UK");
  assert.equal(uk.stages[0].uv, 0);
  assert.equal(uk.stages[1].uv, 5);
  assert.equal(uk.stages[0].bounce, null);
  assert.equal(uk.total, 5);
  assert.equal(uk.buys, 0);
  assert.deepEqual(uk.stages[1].refs, [{ k: "linkedin.com", n: 2 }]);
  const all = funnelView(CACHE, "7d", null);
  assert.deepEqual(all.stages[1].countries, [{ k: "US", n: 8 }, { k: "UK", n: 5 }]);
  assert.deepEqual(all.stages[0].devices, [{ k: "desktop", n: 6 }, { k: "mobil", n: 4 }]);
  assert.deepEqual(all.stages[0].sources, [{ k: "direkt", n: 6 }, { k: "suche", n: 4 }]);
});

test("Trichter: ohne Messung ehrlich leer (keine erfundenen Zahlen)", () => {
  for (const c of [null, undefined, {}]) {
    const v = funnelView(c as FunnelCache, "24h", null);
    assert.equal(v.total, 0);
    assert.equal(v.conv, null);
    assert.ok(v.stages.every((s) => s.uv === 0 && s.bounce === null && s.next === null && s.dwell === null));
  }
  assert.deepEqual(funnelBrief(null), { fehler: "noch keine Messung" });
});

test("Formate und Hilfen", () => {
  assert.equal(fmtDwell(null), "–");
  assert.equal(fmtDwell(42.4), "42 s");
  assert.equal(fmtDwell(185), "3:05 min");
  assert.equal(fmtRate(null), "–");
  assert.equal(fmtRate(0), "0 %");
  assert.equal(fmtRate(0.0417), "4,2 %");
  assert.equal(fmtRate(0.5), "50 %");
  assert.deepEqual(stageWidths([{ uv: 100 }, { uv: 50 }, { uv: 1 }, { uv: 0 }]), [100, 50, 2, 0]);
  assert.deepEqual(stageWidths([{ uv: 0 }, { uv: 0 }]), [0, 0]);
  assert.equal(geoCountry("GB"), "UK");
  assert.equal(geoCountry("us"), "US");
  assert.equal(geoCountry(""), "XX");
  assert.equal(geoCountry("EU1"), "XX");
  assert.equal(nextStage("tarif"), "stripe");
  assert.equal(nextStage("danke"), null);
});

test("JARVIS: Kurzfassung und Station Startseite", () => {
  const b = funnelBrief({ ...CACHE, p: { "30d": CACHE.p!["7d"], "24h": CACHE.p!["7d"] } }) as Record<string, unknown>;
  assert.match((b["30_tage"] as string[])[0], /^Startseite: 10 Besucher\/13 Aufrufe, Absprung 50 %, Ø 34 s, weiter 40 %$/);
  assert.equal(b.conversion_start_danke_30_tage, "4,2 %");
  const s = startLive({ ...CACHE, p: { "24h": CACHE.p!["7d"] } });
  assert.deepEqual(s, { start_60m: 3, start_24h: 10, start_30d: 0, start_land_60m: 1 });
  const line = webLine({ ...EMPTY_WEBSITE, ...s }, String);
  assert.equal(line.stations[0].id, "wstart");
  assert.equal(line.stations[0].value, "10");
  assert.equal(line.stations[0].state, "live");
  assert.deepEqual(line.edges[0], { from: "wstart", to: "wland", perHour: 1, label: "zur Landingpage" });
  assert.equal(webLine(EMPTY_WEBSITE).stations[0].value, "0");
});

test("Beacon Trichter: Stufe, Gerät, Herkunft streng geprüft; Startseite ohne Variante", () => {
  assert.deepEqual(parseBeacon({ type: "hit", st: "start", pv: PV, dev: "mobil", src: "suche", ref: "google.com" }),
    { kind: "hit", stage: "start", variant_id: null, pv: PV, src: "suche", ref: "google.com", device: "mobil" });
  assert.deepEqual(parseBeacon({ type: "hit", st: "tarif", pv: PV, dev: "desktop", src: "direkt", variant_id: V }),
    { kind: "hit", stage: "tarif", variant_id: V, pv: PV, src: "direkt", ref: null, device: "desktop" });
  assert.equal(parseBeacon({ type: "hit", st: "tarif", pv: PV, dev: "desktop", src: "direkt" }), null); // Tarif braucht Variante
  assert.equal(parseBeacon({ type: "hit", st: "stripe", pv: PV, dev: "desktop", src: "direkt" }), null); // Stripe nur Server
  assert.equal(parseBeacon({ type: "hit", st: "start", pv: "x", dev: "desktop", src: "direkt" }), null);
  assert.equal(parseBeacon({ type: "hit", st: "start", pv: PV, dev: "tv", src: "direkt" }), null);
  // Pfad/Parameter in ref werden verworfen
  assert.equal((parseBeacon({ type: "hit", st: "start", pv: PV, dev: "desktop", src: "andere", ref: "evil.com/path?mail=a@b.c" }) as { ref: unknown }).ref, null);
  assert.deepEqual(parseBeacon({ type: "hit_end", pv: PV, ds: 4000, depth: 50 }), { kind: "hit_end", pv: PV, ds: 1800, depth: 50 });
  assert.equal(parseBeacon({ type: "hit_end", pv: PV, ds: -1, depth: 50 }), null);
  assert.equal(parseBeacon({ type: "hit_end", pv: PV, ds: 5, depth: 40 }), null);
  assert.equal((parseBeacon({ variant_id: V, pv: PV, type: "end", depth: 75, dwell: "30-60", ds: 42 }) as { ds: unknown }).ds, 42);
});

test("Herkunft: nur Domain oder utm_source, eigene Domain zählt nicht", () => {
  assert.equal(refKey(null, "www.google.com", "www.nextgen-profit.de"), "google.com");
  assert.equal(refKey("Newsletter Okt", "www.google.com", "nextgen-profit.de"), "newsletterokt");
  assert.equal(refKey(null, "www.nextgen-profit.de", "nextgen-profit.de"), null);
  assert.equal(refKey(null, "", "nextgen-profit.de"), null);
  assert.ok((refKey("x".repeat(200), "", "a.de") ?? "").length <= 60);
});

test("Trichter-Zeitraum „Heute“: erster Chip, eigener Cache-Eimer, ohne Eimer ehrlich leer", () => {
  assert.deepEqual(FUNNEL_PERIODS.map((x) => x.id), ["heute", "24h", "7d", "30d"]);
  assert.equal(FUNNEL_PERIODS[0].label, "Heute");
  const h = funnelView({ ...CACHE, p: { heute: CACHE.p!["7d"] } }, "heute", null);
  assert.equal(h.total, funnelView(CACHE, "7d", null).total);
  assert.equal(funnelView({ ...CACHE, p: { "7d": CACHE.p!["7d"] } }, "heute", null).total, 0);
});

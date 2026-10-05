import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mailFits, pageViewedKey, scannerReason, SCANNER_SEK } from "./page-viewed.ts";
import { isAutomatedCheckout, parseBeacon } from "./website-stats.ts";
import { STAGES, board, viewedTotal } from "./dashboard-board.ts";

const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/129.0.0.0 Safari/537.36";
const SENT = "2026-10-05T10:00:00Z";
const at = (sek: number) => new Date(Date.parse(SENT) + sek * 1000);

test("Seite angesehen: Link-Scanner gefiltert (< 2 min, Scanner-UA, Rechenzentrum ohne Accept-Language)", () => {
  assert.equal(scannerReason({ sentAt: SENT, now: at(SCANNER_SEK + 5), ua: CHROME, acceptLanguage: "en-US,en;q=0.9" }), null);
  assert.equal(scannerReason({ sentAt: SENT, now: at(30), ua: CHROME, acceptLanguage: "en-US" }), "zu_frueh");
  assert.equal(scannerReason({ sentAt: SENT, now: at(119), ua: CHROME, acceptLanguage: "en-US" }), "zu_frueh");
  assert.equal(scannerReason({ sentAt: SENT, now: at(3600), ua: "Mozilla/5.0 (compatible; Barracuda Sentinel)", acceptLanguage: "en" }), "ua");
  assert.equal(scannerReason({ sentAt: SENT, now: at(3600), ua: CHROME.replace("Chrome/", "HeadlessChrome/"), acceptLanguage: "en" }), "ua");
  assert.equal(scannerReason({ sentAt: SENT, now: at(3600), ua: CHROME, acceptLanguage: "" }), "rechenzentrum");
  assert.equal(scannerReason({ sentAt: null, now: at(3600), ua: CHROME, acceptLanguage: "en" }), "kein_versand");
});

test("Seite angesehen: nur verschickte Mails aus US/UK/FR und passendes Land, 1 je Firma und Tag", () => {
  const m = { id: "m1", prospect_id: "p1", status: "sent", sent_at: SENT, country: "UK" };
  assert.equal(mailFits(m, "UK"), true);
  assert.equal(mailFits(m, "US"), false);
  assert.equal(mailFits({ ...m, status: "approved" }, "UK"), false);
  assert.equal(mailFits({ ...m, country: "IE" }, "IE"), false);
  assert.equal(mailFits(null, "UK"), false);
  assert.equal(pageViewedKey("p1", "2026-10-05"), "page_viewed:p1:2026-10-05");
});

test("Beacon „seen“: nur mit gültigem Token", () => {
  const base = { type: "seen", variant_id: "56a4fb83-3796-4abe-a39f-a47fdac512ab", pv: "11111111-2222-4333-8444-555555555555" };
  assert.deepEqual(parseBeacon({ ...base, r: "abcdef0123456789" }), { kind: "seen", variant_id: base.variant_id, pv: base.pv, r: "abcdef0123456789" });
  assert.equal(parseBeacon({ ...base, r: "x" }), null);
  assert.equal(parseBeacon({ ...base }), null);
});

test("Kontakte: Stufe „Seite angesehen“ zwischen Angeschrieben und Geantwortet, Abzeichen auf höheren Stufen", () => {
  assert.deepEqual(STAGES.slice(0, 3).map(([k]) => k), ["contacted", "viewed", "replied"]);
  const cols = board({
    counts: [{ stage: "viewed", country: "US", n: 3 }, { stage: "replied", country: "US", n: 1 }],
    cards: [
      { id: "v", stage: "viewed", country: "US", company: "V", last_at: "2026-10-05T10:00:00Z", positive: false, viewed: true },
      { id: "r", stage: "replied", country: "US", company: "R", last_at: "2026-10-05T11:00:00Z", positive: false, viewed: true },
      { id: "c", stage: "contacted", country: "US", company: "C", last_at: "2026-10-05T09:00:00Z", positive: false },
    ],
  }, [], [], ["US"]);
  const by = Object.fromEntries(cols.map((c) => [c.id, c]));
  assert.equal(by.viewed.count, 3);
  assert.equal(by.viewed.cards[0].company, "V");
  assert.equal(by.replied.cards[0].viewed, true);
  assert.equal(by.contacted.cards[0].viewed, false);
  assert.equal(viewedTotal([{ country: "US", n: 4 }, { country: "FR", n: 2 }], ["US", "UK"]), 4);
});

test("Test-Checkouts: Kennzeichen auto=1 oder Headless/Bot zählen nicht", () => {
  assert.equal(isAutomatedCheckout("1", CHROME), true);
  assert.equal(isAutomatedCheckout(null, CHROME.replace("Chrome/", "HeadlessChrome/")), true);
  assert.equal(isAutomatedCheckout(null, "Mozilla/5.0 Playwright/1.48"), true);
  assert.equal(isAutomatedCheckout(null, CHROME), false);
});

test("Migration: genau 12 Test-Checkouts, alle Auswertungen lesen page_events_echt (is_test ausgeschlossen)", () => {
  const sql = readFileSync(new URL("../../supabase/migrations/20261005200000_signalwerk_seite_angesehen.sql", import.meta.url), "utf8");
  assert.match(sql, /add column if not exists is_test boolean not null default false/);
  assert.match(sql, /if n not in \(0, 12\) then raise exception/);
  assert.match(sql, /56a4fb83-3796-4abe-a39f-a47fdac512ab/);
  assert.match(sql, /page_events_echt[\s\S]*where not is_test/);
  assert.match(sql, /'page_viewed'\)\)/);
  assert.doesNotMatch(sql, /delete from signalwerk\.page_events/i);
});

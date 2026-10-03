import { test } from "node:test";
import assert from "node:assert/strict";
import {
  alerts, berlin, brake, countBounces, distinctReplies, extraBoxCap, funnel, mailboxes, mainBoxCap, nextCron, nextRun,
  pipeline, sampleStock, type Live, type OpsConfig, type Stock,
} from "./dashboard-logic.ts";

const cfg: OpsConfig = {
  versand: {
    aktiv: true, notbremse_ab: "2026-10-03T06:52:00Z", tagesziel: 90, tagesziel_ab: "2026-10-03", tagesziel_schritt: 15,
    tagesziel_max: 150, anbieter_tageslimit: 160, postfach_start: 60, postfach_schritt: 15, postfach_tageslimit: 150, gesamtgrenze: 5000,
  },
  proben: { fokus_je_seite: 6, andere_je_seite: 3, max_alter_stunden: 48 },
  fokus: ["S2/US", "S2/UK"],
  nur_fokus: true, lead_suche: true, kunden_suche: true,
  countries: { US: { allowed: true, daily_limit: 110 }, UK: { allowed: true, daily_limit: 100 } },
  workflows: [{ file: "send.yml", name: "Versand", crons: ["23 14 * * *"] }, { file: "taeglich.yml", name: "Automatiklauf", crons: ["17 12 * * *"] }],
};

function live(over: Partial<Live> = {}): Live {
  return {
    now: "2026-10-03T16:00:00Z", today: "2026-10-03", db_size: 3.5 * 1024 ** 3, legal_ready: true,
    segments: [{ id: "S2", name: "Webagenturen", email_countries: ["US", "UK"], status: "testing" }],
    msg: [
      { segment_id: "S2", country: "US", status: "sent", kind: "initial", n: 60, today: 30, d7: 50 },
      { segment_id: "S2", country: "US", status: "approved", kind: "initial", n: 2000, today: 0, d7: 0 },
      { segment_id: "S2", country: "UK", status: "sent", kind: "initial", n: 40, today: 20, d7: 40 },
      { segment_id: "S2", country: "UK", status: "approved", kind: "initial", n: 50, today: 0, d7: 0 },
    ],
    sent_days: [
      { day: "2026-10-03", country: "US", box: "info@nextgen-profit.de", n: 30 },
      { day: "2026-10-03", country: "UK", box: "leads@nextgen-profit.de", n: 20 },
    ],
    boxes: [
      { box: "", first_sent: "2026-09-26T14:00:00Z", last_sent: "2026-09-27T20:00:00Z", n: 140 },
      { box: "info@nextgen-profit.de", first_sent: "2026-10-03T07:00:00Z", last_sent: "2026-10-03T15:00:00Z", n: 30 },
      { box: "leads@nextgen-profit.de", first_sent: "2026-10-03T08:00:00Z", last_sent: "2026-10-03T15:30:00Z", n: 20 },
    ],
    last_sent_at: "2026-10-03T15:30:00Z", window_sent: 50,
    events: [],
    followups_due: { n: 0, rows: [] },
    sample_requests: [],
    stock: [{ segment_id: "S2", country: "US", ready: 6, oldest: "2026-10-03T14:00:00Z", newest: "2026-10-03T15:00:00Z", sent24: 0, failed24: 0 }],
    stock_last_built: "2026-10-03T15:00:00Z",
    pages: [
      { slug: "us/web-agencies", segment_id: "S2", country: "US", status: "live", views: 10, clicks: 1, requests: 0, checkouts: 0, purchases: 0 },
      { slug: "uk/web-agencies", segment_id: "S2", country: "UK", status: "live", views: 5, clicks: 0, requests: 0, checkouts: 0, purchases: 0 },
    ],
    customers: [], subscriptions: [], deliveries: [], suppression: {}, contact_requests: [], later_msgs: [],
    last_lead_at: "2026-10-03T15:50:00Z", last_prospect_at: "2026-10-03T15:00:00Z",
    experiments: [{ id: "e1", segment_id: "S2", country: "US", variant: "v1", status: "running", decision: null, started_on: null, last_sent_on: null }],
    ...over,
  };
}

const stock: Stock = {
  at: "2026-10-03T16:00:00Z",
  leads: [{ segment_id: "S2", country: "US", status: "new", n: 5000 }, { segment_id: "S2", country: "UK", status: "new", n: 50 }],
  leads_24h: [],
  prospects: [
    { check_status: "ok", segment_id: "S2", country: "US", n: 20000, unused: 18000 },
    { check_status: "call_only", segment_id: "S2", country: "US", n: 999, unused: 0 },
    { check_status: "ok", segment_id: "S2", country: "UK", n: 300, unused: 30 },
  ],
  prospects_24h: [],
};

const ev = (o: Partial<Live["events"][number]> & { type: string }) => ({
  id: Math.random().toString(36), occurred_at: "2026-10-03T12:00:00Z", created_at: "2026-10-03T12:00:00Z", segment_id: "S2", country: "US", ...o,
});

test("Cron: nächster Lauf in UTC, Listen, Bereiche, Schritte, Wochentag", () => {
  const from = new Date("2026-10-03T16:00:00Z"); // Samstag
  assert.equal(nextCron("23 14 * * *", from)?.toISOString(), "2026-10-04T14:23:00.000Z");
  assert.equal(nextCron("23 */3 * * *", from)?.toISOString(), "2026-10-03T18:23:00.000Z");
  assert.equal(nextCron("7 6-21 * * *", from)?.toISOString(), "2026-10-03T16:07:00.000Z");
  assert.equal(nextCron("53 4 * * 1", from)?.toISOString(), "2026-10-05T04:53:00.000Z");
  assert.equal(nextRun(["11,41 * * * *", "26,56 * * * *"], from)?.toISOString(), "2026-10-03T16:11:00.000Z");
  assert.equal(nextCron("kaputt", from), null);
});

test("Zeitangaben in deutscher Zeit (MESZ/MEZ)", () => {
  assert.equal(berlin("2026-10-03T14:23:00Z"), "03.10. 16:23");
  assert.equal(berlin("2026-12-01T14:23:00Z"), "01.12. 15:23");
});

test("Postfach-Kapazität wie deliverability/mailboxes", () => {
  assert.equal(mainBoxCap(cfg.versand, "2026-10-03"), 90);
  assert.equal(mainBoxCap(cfg.versand, "2026-10-05"), 120);
  assert.equal(mainBoxCap(cfg.versand, "2026-10-20"), 150);
  assert.equal(extraBoxCap(cfg.versand, "2026-10-03", "2026-10-03"), 60);
  assert.equal(extraBoxCap(cfg.versand, "2026-10-03", "2026-10-04"), 75);
  assert.equal(extraBoxCap(cfg.versand, "2026-10-03", "2026-10-30"), 150);
  const rows = mailboxes(live(), cfg);
  assert.equal(rows.length, 2);
  assert.deepEqual(rows.map((r) => [r.cap, r.today, r.total]), [[90, 30, 170], [60, 20, 20]]);
});

test("Bounces je Adresse, vorübergehende erst ab Wiederholung; Notbremse ab 100 Mails", () => {
  const evs = [
    { type: "bounced", to_email: "a@x.com" }, { type: "bounced", to_email: "A@x.com" },
    { type: "bounced", to_email: "b@x.com", bounce_type: "Transient" },
    { type: "bounced", to_email: "c@x.com", bounce_type: "transient" }, { type: "bounced", to_email: "c@x.com", bounce_type: "transient" },
    { type: "complained", to_email: "d@x.com" },
  ];
  assert.deepEqual(countBounces(evs), { bounced: 2, complained: 1 });

  const six = Array.from({ length: 6 }, (_, i) => ev({ type: "bounced", to_email: `b${i}@x.com` }));
  assert.equal(brake(live({ events: six, window_sent: 99 }), cfg).stop, null);
  assert.match(brake(live({ events: six, window_sent: 100 }), cfg).stop ?? "", /Bounce-Quote 6\/100/);
  // Bounces vor notbremse_ab zählen nicht
  const old = six.map((e) => ({ ...e, created_at: "2026-10-02T12:00:00Z" }));
  assert.equal(brake(live({ events: old, window_sent: 100 }), cfg).bounced, 0);
  assert.match(brake(live({ events: [ev({ type: "complained", to_email: "z@x.com" })] }), cfg).stop ?? "", /Spam-Beschwerde/);
});

test("Antworten: je eingehender Mail nur das aussagekräftigste Ereignis", () => {
  const r = distinctReplies([
    { id: "1", type: "reply", dedupe_key: "imap:<m1>", message_id: "m" },
    { id: "2", type: "reply_positive", dedupe_key: "reply:<m1>", message_id: "m" },
    { id: "3", type: "reply", dedupe_key: "imap:<m2>", message_id: "m" },
    { id: "4", type: "bounced", dedupe_key: null, message_id: "m" },
  ]);
  assert.deepEqual(r.map((e) => e.type).sort(), ["reply", "reply_positive"]);
});

test("Trichter: Käufer nur mail-fähig, call_only getrennt, zugestellt = gesendet − Bounces, Testkäufe zählen nicht", () => {
  const l = live({
    events: [
      ev({ type: "bounced", to_email: "x@y.com" }),
      ev({ type: "reply_positive", prospect_id: "p1", message_id: "m1" }),
      ev({ type: "sample_requested", prospect_id: "p2", message_id: "m2" }),
      ev({ type: "reply_negative", prospect_id: "p3", message_id: "m3" }),
    ],
    sample_requests: [{ id: "r1", company_name: "Web Co", domain: "web.co", segment_id: "S2", country: "US", status: "sent", created_at: "2026-10-03T10:00:00Z", sent_at: "2026-10-03T10:01:00Z", claimed_at: null, note: null }],
    customers: [
      { id: "c1", company_name: "Echt", country: "US", status: "active", created_at: "2026-10-01T00:00:00Z", prospect_id: null, stripe: true, test_note: false },
      { id: "c2", company_name: "Test", country: "US", status: "trial", created_at: "2026-10-01T00:00:00Z", prospect_id: null, stripe: true, test_note: true },
    ],
    subscriptions: [
      { id: "s1", customer_id: "c1", segment_id: "S2", status: "active", package: "starter", amount_cents: 12900, currency: "usd", price_eur_month: null, started_on: "2026-10-01", current_period_end: null, first_delivery_approved: true, filters: {} },
      { id: "s2", customer_id: "c2", segment_id: "S2", status: "active", package: "custom", amount_cents: 83300, currency: "usd", price_eur_month: null, started_on: "2026-10-01", current_period_end: null, first_delivery_approved: false, filters: {} },
    ],
  });
  const f = funnel(l, stock, "S2", "US");
  assert.equal(f.buyersOk, 20000);
  assert.equal(f.callOnly, 999);
  assert.equal(f.queue, 2000);
  assert.equal(f.sent, 60);
  assert.equal(f.sentToday, 30);
  assert.equal(f.delivered, 59);
  assert.equal(f.replies, 3);
  assert.equal(f.positive, 2);
  assert.equal(f.samplesRequested, 2);
  assert.equal(f.samplesSent, 2);
  assert.equal(f.customers, 1);
  assert.equal(f.revenue, 129);
  assert.equal(f.currency, "$");
  // kein Mail-Land der Zielgruppe -> keine mail-fähigen Käufer
  const de = funnel(live({ segments: [{ id: "S2", name: "W", email_countries: ["UK"], status: "testing" }] }), stock, "S2", "US");
  assert.equal(de.buyersOk, 0);
});

test("Proben-Vorrat je Live-Seite: Soll Fokus 6, sonst 3; ohne Rechtstexte keine Seiten", () => {
  const now = new Date("2026-10-03T16:00:00Z");
  const rows = sampleStock(live(), cfg, now);
  assert.deepEqual(rows.map((r) => [r.key, r.ready, r.target]), [["S2/UK", 0, 6], ["S2/US", 6, 6]]);
  assert.deepEqual(sampleStock(live({ legal_ready: false }), cfg, now), []);
});

test("Ampel: leerer Vorrat, wartende Probe-Anfrage, Kaufinteresse, knappe Leads und Käufer", () => {
  const now = new Date("2026-10-03T16:00:00Z");
  const l = live({
    sample_requests: [{ id: "r1", company_name: "Wartet GmbH", domain: "w.de", segment_id: "S2", country: "UK", status: "new", created_at: "2026-10-03T15:30:00Z", sent_at: null, claimed_at: null, note: null }],
    events: [ev({ type: "reply_positive", prospect_id: "p1", company_name: "Heiß Ltd", message_id: "m1" })],
  });
  const a = alerts(l, stock, cfg, now, null);
  const titles = a.map((x) => `${x.level}:${x.title}`);
  assert.ok(titles.some((t) => t.startsWith("rot:Proben-Vorrat leer: S2/UK")), titles.join("\n"));
  assert.ok(titles.some((t) => t.startsWith("rot:1 Probe-Anfrage(n) seit über 10 min")));
  assert.ok(titles.some((t) => t.startsWith("rot:1 Kaufinteresse")));
  assert.ok(titles.some((t) => t.startsWith("gelb:S2/UK: nur 50 lieferbare Leads")));
  assert.ok(titles.some((t) => t.startsWith("rot:S2/UK: nur 30 mail-fähige Käufer")));
  assert.ok(titles.some((t) => t.startsWith("gruen:Bounce-Quote 0 %")));
  // Reihenfolge: rot vor gelb vor grün
  const order = a.map((x) => x.level);
  assert.deepEqual(order, [...order].sort((x, y) => ["rot", "gelb", "gruen"].indexOf(x) - ["rot", "gelb", "gruen"].indexOf(y)));
});

test("Ampel: Versand unter Ziel erst am Abend, Werke zu alt, Versand aus", () => {
  const late = new Date("2026-10-03T20:00:00Z"); // 22:00 MESZ
  const a = alerts(live({ now: late.toISOString(), last_lead_at: "2026-10-03T06:00:00Z" }), stock, cfg, late, null);
  assert.ok(a.some((x) => x.level === "gelb" && x.title === "Versand heute unter Ziel: 50 von 150"));
  assert.ok(a.some((x) => x.level === "rot" && x.title.startsWith("Lead-Werk: seit 14 h")));
  const early = new Date("2026-10-03T10:00:00Z");
  assert.ok(!alerts(live({ now: early.toISOString() }), stock, cfg, early, null).some((x) => x.title.startsWith("Versand heute unter Ziel")));
  const off = alerts(live(), stock, { ...cfg, versand: { ...cfg.versand, aktiv: false } }, early, null);
  assert.ok(off.some((x) => x.title === "Versand ist ausgeschaltet"));
});

test("Wer ist wo: Stufe und nächster Schritt", () => {
  const now = new Date("2026-10-03T16:00:00Z");
  const p = pipeline(live({
    events: [
      ev({ type: "reply", dedupe_key: "imap:<a>", prospect_id: "p1", company_name: "Eins", message_id: "m1" }),
      ev({ type: "sample_requested", dedupe_key: "reply:<a>", prospect_id: "p1", company_name: "Eins", message_id: "m1" }),
      ev({ type: "unsubscribed", prospect_id: "p2", company_name: "Zwei", message_id: "m2" }),
    ],
    followups_due: { n: 1, rows: [{ prospect_id: "p3", segment_id: "S2", country: "US", sent_at: "2026-09-28T10:00:00Z", to_email: "a@drei.com", company_name: "Drei", domain: "drei.com" }] },
  }), cfg, now);
  const by = Object.fromEntries(p.map((x) => [x.company, x]));
  assert.equal(by.Eins.stage, "Probe erhalten");
  assert.match(by.Eins.next, /Nachfrage zur Probe automatisch ab 06\.10\. 14:00/);
  assert.equal(by.Zwei.stage, "Abgemeldet");
  assert.equal(by.Drei.stage, "Nachfass fällig");
  assert.match(by.Drei.next, /04\.10\. 14:17/);
  assert.deepEqual(p.map((x) => x.company), ["Eins", "Drei", "Zwei"]);
});

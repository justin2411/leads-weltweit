// Erfundene Testdaten für den Layout-Wächter (keine echten Firmen, keine Lead-Inhalte – das Repo ist öffentlich).
// Zeiten relativ zu „jetzt“, damit Werke „live“ wirken und alle Abzeichen (Auto, 24/7) gerendert werden.
const C = ["US", "UK", "FR"];

export function makeFixtures(nowMs = Date.now()) {
  const iso = (minAgo) => new Date(nowMs - minAgo * 60_000).toISOString();
  const day = (dAgo) => new Date(nowMs - dAgo * 86_400_000).toISOString().slice(0, 10);
  const days = Array.from({ length: 15 }, (_, i) => day(14 - i));
  const live = {
    now: iso(0), today: day(0), db_size: 3.2e9, legal_ready: true,
    segments: [{ id: "S2", name: "Webagenturen", email_countries: ["US", "UK", "FR"], status: "testing" }],
    msg: C.flatMap((c, i) => [
      { segment_id: "S2", country: c, status: "approved", kind: "initial", n: 120 + i * 40, today: 0, d7: 0 },
      { segment_id: "S2", country: c, status: "sent", kind: "initial", n: 300 + i * 50, today: 20 + i, d7: 180 },
    ]),
    sent_days: days.flatMap((d) => C.map((c) => ({ day: d, country: c, box: "box1", n: 25 }))),
    boxes: [{ box: "box1", first_sent: iso(60 * 24 * 10), last_sent: iso(20), n: 900 }],
    last_sent_at: iso(20), window_sent: 900,
    events: [
      { id: "e1", type: "reply_positive", occurred_at: iso(90), created_at: iso(90), segment_id: "S2", country: "UK", prospect_id: "p1", company_name: "Beispiel Studio Ltd" },
      { id: "e2", type: "reply", occurred_at: iso(300), created_at: iso(300), segment_id: "S2", country: "US", prospect_id: "p2", company_name: "Muster Webdesign LLC" },
    ],
    followups_due: { n: 0, rows: [] },
    sample_requests: [],
    stock: C.map((c) => ({ segment_id: "S2", country: c, ready: 4, oldest: iso(600), newest: iso(30), sent24: 1, failed24: 0 })),
    stock_last_built: iso(30),
    pages: C.map((c) => ({ slug: `${c.toLowerCase()}/webagenturen`, segment_id: "S2", country: c, status: "live", views: 120, clicks: 14, requests: 3, checkouts: 1, purchases: 0 })),
    customers: [], subscriptions: [], deliveries: [], suppression: { email: 3, domain: 1 }, contact_requests: [], later_msgs: [],
    last_lead_at: iso(5), last_prospect_at: iso(8),
    experiments: C.map((c) => ({ id: `x-${c}`, segment_id: "S2", country: c, variant: "A", status: "running", decision: null, started_on: day(10), last_sent_on: day(0) })),
  };
  const stock = {
    at: iso(2),
    leads: C.map((c, i) => ({ segment_id: "S2", country: c, status: "new", n: 12000 + i * 3500 })),
    leads_24h: C.map((c) => ({ segment_id: "S2", country: c, n: 410 })),
    prospects: C.map((c, i) => ({ check_status: "ok", segment_id: "S2", country: c, n: 5000 + i * 900, unused: 3100 + i * 500, sent: 400, queued: 120 })),
    prospects_24h: C.map((c) => ({ check_status: "ok", segment_id: "S2", country: c, n: 110 })),
  };
  const beat = (werk, part, min) => ({ werk, part, run_id: "1", started_at: iso(min + 20), beat_at: iso(min), processed: 500, green: 40, note: null });
  const activity = {
    now: iso(0),
    heartbeats: [beat("lead-werk", "s2-us 1/4", 1), beat("lead-werk", "s2-uk 2/4", 2), beat("kunden-werk", "s2 1/2", 1)],
    last_run: { "lead-werk.yml": iso(30), "kunden-werk.yml": iso(40) },
    last_lead_at: iso(1), leads_15m: 120, leads_60m: 1240, last_prospect_at: iso(2), last_prospect_checked_at: iso(2), buyers_ok_60m: 320,
    last_sent_at: iso(10), sent_15m: 4, sent_60m: 12, last_reply_at: iso(90), replies_60m: 1,
    stock_last_built: iso(30), stock_built_60m: 3, stock_sent_60m: 1, last_stock_sent_at: iso(45),
    last_request_at: iso(200), last_gate_at: iso(3), gate_60m: { released: 140, failed: 3 },
    stichprobe: C.map((c) => ({ country: c, finished_at: iso(300), candidates: 100, green: 98, red: 2, reasons: { website_down: 2 } })),
  };
  const daily = days.flatMap((d, i) => C.map((c) => ({ day: d, country: c, sent: 25 + i, followups: 3, bounced: 1, replies: i % 4 === 0 ? 1 : 0, declined: 0,
    positive: i % 8 === 0 ? 1 : 0, samples_requested: i % 8 === 0 ? 1 : 0, samples_sent: i % 8 === 0 ? 1 : 0, customers: 0, revenue_cents: 0 })));
  const kpi = days.flatMap((d, i) => C.flatMap((c) => [
    { day: d, country: c, metric: "leads_new", value: 380 + i * 5 }, { day: d, country: c, metric: "buyers_ok", value: 100 + i },
    { day: d, country: c, metric: "sent", value: 25 + i }, { day: d, country: c, metric: "replies", value: i % 4 === 0 ? 1 : 0 },
  ]));
  const website = { at: iso(2), land_60m: 6, land_24h: 120, land_30d: 2400, tarif_60m: 1, tarif_24h: 20, tarif_30d: 380, tarif_views_30d: 420, co_60m: 0, co_24h: 2, co_30d: 18,
    views_60m: 9, cta_60m: 1, req_60m: 0, buy_60m: 0, views_24h: 160, cta_24h: 12, req_24h: 2, buy_24h: 0, views_30d: 3100, cta_30d: 210, req_30d: 26, buy_30d: 1, mail_views_30d: 700, mails_30d: 2700 };
  const expStats = C.map((c, i) => ({ segment_id: "S2", country: c, sent: 300 + i * 50, delivered: 0, bounced: 8, replies: 4 + i, positive: 1, samples: 1, customers: 0 }));
  return {
    rpc: {
      dashboard_live: live, dashboard_stock_refresh: stock, dashboard_activity: activity, dashboard_daily: daily,
      dashboard_days: { sent: days.flatMap((d) => C.map((c) => ({ day: d, country: c, segment_id: "S2", n: 25 }))), events: [] },
      dashboard_contacts: { counts: C.map((c) => ({ stage: "sent", country: c, n: 300 })), cards: [] },
      dashboard_production: { leads: days.flatMap((d) => C.map((c) => ({ day: d, country: c, source: "overture", n: 400 }))), prospects: days.flatMap((d) => C.map((c) => ({ day: d, country: c, status: "ok", n: 100 }))),
        buyer_reasons: [], runs: [], run_reasons: [], run_stages: [] },
      dashboard_storage_refresh: { at: iso(5), db_bytes: 3.2e9, tables: [{ name: "observations", bytes: 1.4e9 }, { name: "leads", bytes: 0.9e9 }],
        leads: C.map((c) => ({ segment: "S2", country: c, status: "new", n: 14000 })), buyers: C.map((c) => ({ segment: "S2", country: c, check_status: "ok", n: 5000, sent: 400 })),
        stock: C.map((c) => ({ segment: "S2", country: c, status: "ready", n: 4 })), checks: C.map((c) => ({ segment: "S2", country: c, released: 900, failed: 20 })) },
      pool_counts: [],
      datenfluss_stand: [
        { station: "leads", last_at: iso(5), active_hours: 140, extra: null }, { station: "kaeufer", last_at: iso(30), active_hours: 90, extra: null },
        { station: "proben", last_at: iso(600), active_hours: 20, extra: 0 }, { station: "mails", last_at: iso(10), active_hours: 40, extra: null },
        { station: "antworten", last_at: iso(90), active_hours: 30, extra: null },
      ],
      website_refresh: website, dashboard_raw_stock: { at: iso(10), by_country: { US: 90000, UK: 40000, FR: 52000 } },
    },
    tables: {
      dashboard_cache: [{ name: "stock", value: stock, updated_at: iso(1) }, { name: "website", value: website, updated_at: iso(1) }],
      kpi_daily: kpi, experiment_stats: expStats,
      // Abteilungs-Seiten Recht, Betrieb, Protokoll (Kommandozentrale 04.10.2026)
      suppression: [
        ...Array.from({ length: 12 }, (_, i) => ({ reason: "bounce", created_at: iso(60 * 24 * i + 30) })),
        ...Array.from({ length: 5 }, (_, i) => ({ reason: "unsubscribe", created_at: iso(60 * 30 * i + 90) })),
      ],
      settings: [{ id: 1, legal_ready: true }],
      website_checks: [{ at: iso(60 * 5), site: "https://www.example.com", scores: { technik: 92, inhalt: 84, recht: 100 }, funde: [], seiten: 12 }],
      werk_plan_log: [
        { id: 3, werk: "lead-werk", at: iso(40), mode: "autopilot", bremse: "aus", db_bytes: 3.2e9, plan: { "web-us": 4, "web-uk": 3, "web-fr": 3 }, reasons: { "web-us": "mehr grüne Leads je Lauf" } },
        { id: 2, werk: "kunden-werk", at: iso(100), mode: "autopilot", bremse: "aus", db_bytes: 3.2e9, plan: { kunden: 1 }, reasons: {} },
        { id: 1, werk: "lead-werk", at: iso(220), mode: "autopilot", bremse: "aus", db_bytes: 3.2e9, plan: { "web-us": 2, "web-uk": 4, "web-fr": 4 }, reasons: {} },
      ],
      decisions: [
        { id: 11, created_at: iso(50), type: "note", status: "done", subject: "Betreff-Test UK gestartet", reasoning: "Antwortquote stagniert seit drei Tagen. Variante B mit kürzerem Betreff.", action: "experiment B", kurz_titel: "Betreff-Test UK gestartet", kurz_grund: "Antwortquote stagniert seit drei Tagen." },
        { id: 10, created_at: iso(60 * 26), type: "daily_note", status: "done", subject: "Tagesnotiz", reasoning: "Alles im Plan.", action: null, kurz_titel: null, kurz_grund: null },
      ],
      agent_tasks: [
        { id: "t1", created_at: iso(200), finished_at: iso(120), agent: 2, kind: "leads", market: "UK", brief: "Neue Leads für UK holen", status: "fertig", result: "380 neue grüne Leads aus zwei Quellen.", progress: 100, step: null, numbers: {} },
        // vom Gehirn beauftragt, läuft: Abzeichen „vom Gehirn“ darf am Handy den Kugel-Text nicht überdecken
        { id: "t2", created_at: iso(30), finished_at: null, agent: 1, kind: "leads", market: "US", brief: "Leads US nachfüllen", started_at: iso(20), status: "laeuft", result: null, progress: 40, step: "Quellen prüfen", numbers: {}, created_by: "Gehirn", grund: "Vorrat US knapp" },
      ],
      owner_log: [{ id: 7, action: "setting:followup_enabled", target: null, new_value: true, created_at: iso(300), created_by: "Inhaber Dashboard" }],
    },
  };
}

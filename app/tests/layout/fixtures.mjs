// Erfundene Testdaten für den Layout-Wächter (keine echten Firmen, keine Lead-Inhalte – das Repo ist öffentlich).
// Zeiten relativ zu „jetzt“, damit Werke „live“ wirken und alle Abzeichen (Auto, 24/7) gerendert werden.
const C = ["US", "UK", "FR"];

/** ISO-Woche „2026-W40“ (deutsche Zeit genügt hier: Mittag UTC). */
function isoWeek(ms) {
  const d = new Date(ms);
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const wd = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - wd + 3);
  const y = t.getUTCFullYear();
  const w = 1 + Math.round((t.getTime() - Date.UTC(y, 0, 4)) / 604_800_000 - 3 / 7 + ((new Date(Date.UTC(y, 0, 4)).getUTCDay() + 6) % 7) / 7);
  return `${y}-W${String(w).padStart(2, "0")}`;
}

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
  // Kommandozentrale (Finanzen, Vertrieb, Ziele): erfundene Firmen, ein Testkauf zählt nie
  const goals = [["mrr", "Umsatz pro Monat (MRR)", "£/$/€", 1290, "hoch"], ["kunden", "Zahlende Kunden", "", 10, "hoch"], ["antwortquote", "Antwortquote", "%", 3, "hoch"],
    ["lead_fehler", "Lead-Fehlerquote", "%", 2, "runter"], ["gruen_uk", "Grüne Leads/Woche UK", "", 1000, "hoch"], ["gruen_fr", "Grüne Leads/Woche FR", "", 1000, "hoch"]]
    .map(([key, titel, einheit, soll, richtung], i) => ({ key, titel, einheit, soll, richtung, sort: i * 10, quelle: i ? "vorschlag" : "inhaber", updated_at: iso(600), updated_by: "Inhaber Dashboard" }));
  const customers = [
    { id: "c1", country: "UK", status: "active", notes: null, stripe_customer_id: "cus_x" },
    { id: "c2", country: "US", status: "active", notes: null, stripe_customer_id: "cus_y" },
    { id: "c3", country: "UK", status: "trial", notes: "Stripe-Testmodus", stripe_customer_id: "cus_t" },
  ];
  const subscriptions = [
    { id: "s1", customer_id: "c1", status: "active", package: "starter", amount_cents: 12900, currency: "gbp", price_eur_month: null, started_on: day(40), cancelled_on: null },
    { id: "s2", customer_id: "c2", status: "active", package: "pro", amount_cents: 24900, currency: "usd", price_eur_month: null, started_on: day(3), cancelled_on: null },
    { id: "s3", customer_id: "c3", status: "active", package: "custom", amount_cents: 83300, currency: "gbp", price_eur_month: null, started_on: day(7), cancelled_on: null },
  ];
  const replies = [
    { id: "00000000-0000-4000-8000-000000000001", received_at: iso(45), processed_at: iso(44), status: "offen", intent: "buy", summary_de: "Will Preise wissen",
      prospects: { company_name: "Beispiel Studio Ltd", country: "UK", segment_id: "S2" } },
    { id: "00000000-0000-4000-8000-000000000002", received_at: iso(300), processed_at: iso(299), status: "offen", intent: "question", summary_de: "Frage zur Quelle",
      prospects: { company_name: "Muster Webdesign LLC mit sehr langem Firmennamen für den Test", country: "US", segment_id: "S2" } },
    { id: "00000000-0000-4000-8000-000000000003", received_at: iso(2000), processed_at: iso(1999), status: "spaeter", intent: "sample", summary_de: "Probe gewünscht",
      prospects: { company_name: "Agence Exemple SARL", country: "FR", segment_id: "S2" } },
  ];
  const website = { at: iso(2), land_60m: 6, land_24h: 120, land_30d: 2400, tarif_60m: 1, tarif_24h: 20, tarif_30d: 380, tarif_views_30d: 420, co_60m: 0, co_24h: 2, co_30d: 18,
    views_60m: 9, cta_60m: 1, req_60m: 0, buy_60m: 0, views_24h: 160, cta_24h: 12, req_24h: 2, buy_24h: 0, views_30d: 3100, cta_30d: 210, req_30d: 26, buy_30d: 1, mail_views_30d: 700, mails_30d: 2700 };
  // Website-Auswertung (website_stats): Tagessummen je Landingpage, Klickdichte, gesendete Mails
  const slug = (c) => `${c.toLowerCase()}/web-agencies`;
  const webStats = {
    now: iso(0), days: 30, since: days[0], today: day(0),
    rows: days.flatMap((d, i) => C.flatMap((c, j) => [
      { d, s: slug(c), m: "pe", k: "view", n: 6 + ((i + j) % 5) }, { d, s: slug(c), m: "pe", k: "cta_click", n: (i + j) % 3 === 0 ? 1 : 0 },
      { d, s: slug(c), m: "pe", k: "sample_request", n: (i + j) % 7 === 0 ? 1 : 0 }, { d, s: slug(c), m: "pe", k: "checkout_started", n: (i + j) % 5 === 0 ? 1 : 0 },
      { d, s: slug(c), m: "tv", k: "all", n: 3 }, { d, s: slug(c), m: "src", k: "mail", n: 2 }, { d, s: slug(c), m: "dev", k: "desktop", n: 3 },
      { d, s: slug(c), m: "depth", k: "75", n: 1 }, { d, s: slug(c), m: "dwell", k: "10-30", n: 2 }, { d, s: slug(c), m: "mail", k: i % 2 ? "A" : "B", n: 1 },
    ])),
    heat: C.flatMap((c) => [{ s: slug(c), m: "hm", k: "desktop|40|14", n: 4 }, { s: slug(c), m: "tg", k: "desktop|cta|Get my free sample", n: 4 }]),
    sent: C.flatMap((c) => [{ c, g: "S2", v: "A", n: 200 }, { c, g: "S2", v: "B", n: 200 }]),
    pages: C.map((c) => ({ s: slug(c), g: "S2", c, st: "live" })),
  };
  const expStats = C.map((c, i) => ({ segment_id: "S2", country: c, sent: 300 + i * 50, delivered: 0, bounced: 8, replies: 4 + i, positive: 1, samples: 1, customers: 0 }));
  // Fach-Agenten (JARVIS „Team“): erfundene Kennzahlen, je ein Auftrag
  const role = (slug, name, gruppe, typ, kennzahl, richtung, einheit, gut, knapp, min_n, takt, sort, routine_id = null) => ({ slug, name, gruppe, typ,
    rolle: `${name}: Rolle in einer Zeile`, kennzahl, richtung, einheit, gut, knapp, min_n, takt, werkzeuge: [], grenzen: [], auftrag: `${name}: Auftrag`, routine_id, sort, aktiv: true });
  const roles = [
    role("test", "Test-Agent", "testing", "llm", "Antwortquote", "hoch", "quote", 0.03, 0.01, 50, "täglich 18:20", 10, "r-test"),
    role("trichter", "Trichter-Agent", "testing", "llm", "Engpass-Quote", "hoch", "quote", 0.03, 0.01, 50, "täglich 07:40", 20, "r-trichter"),
    role("qualitaet", "Qualitäts-Agent", "qualitaet", "llm", "Fehlerquote Stichprobe", "tief", "quote", 0.02, 0.05, 50, "täglich 07:50", 30, "r-qual"),
    role("lead_pruefer", "Lead-Prüfer", "qualitaet", "python", "bestanden", "hoch", "quote", 0.95, 0.9, 20, "Dauerlauf", 40),
    role("kaeufer_pruefer", "Käufer-Prüfer", "qualitaet", "python", "bestanden", "hoch", "quote", 0.9, 0.8, 20, "Dauerlauf", 50),
    role("zustellung", "Zustell-Agent", "qualitaet", "llm", "Bounce-Quote", "tief", "quote", 0.02, 0.05, 50, "täglich 06:30", 60, "r-zust"),
    role("quellen", "Quellen-Agent", "qualitaet", "llm", "grüne Leads/Platz-Std.", "hoch", "zahl", 20, 5, 1, "täglich 12:10", 70, "r-quell"),
  ];
  const routine = (id, name, uhrzeit) => ({ id, name, aufgabe: `${name} prüfen`, uhrzeit, tage: "taeglich", wochentage: [], dauer_min: 15, aktiv: true,
    last_run_at: iso(600), last_task_id: null, last_result: null, created_at: iso(9000) });
  const roleKpi = days.flatMap((d, i) => [
    { rolle: "test", day: d, k: i % 3 === 0 ? 2 : 1, n: 60 }, { rolle: "zustellung", day: d, k: 2, n: 70 + i },
    { rolle: "qualitaet", day: d, k: 3, n: 300 }, { rolle: "quellen", day: d, k: 4000 + i * 40, n: 20 },
  ]);
  const pruef = days.flatMap((d, i) => C.flatMap((c) => [
    { tag: d, art: "lead", segment_id: "S2", country: c, geprueft: 1300 + i * 10, bestanden: 1260 + i * 10, gehalten: 40 },
    { tag: d, art: "kaeufer", segment_id: "S2", country: c, geprueft: 500, bestanden: 430, gehalten: 70 },
  ]));
  const roleTask = (id, rolle, status, result, minAgo, wirkung = null) => ({ id, rolle, agent: 1, kind: "gehirn", market: null, brief: `${rolle} Auftrag`, status, progress: status === "laeuft" ? 40 : 100,
    step: null, result, numbers: {}, created_at: iso(minAgo), started_at: iso(minAgo - 2), finished_at: status === "fertig" ? iso(minAgo - 20) : null, created_by: "Gehirn-Routine", wirkung });
  const tasks = [
    roleTask("rt1", "test", "fertig", "Kein Test reif: Variante B 2,1 % vs. A 1,8 % bei 140 Mails, Mindestmenge 200 fehlt.", 300, { bewertung: "neutral" }),
    roleTask("rt2", "trichter", "fertig", "Engpass Antwort: 0,9 % in 3 reifen Wochen, Betreff als nächster Test.", 700),
    roleTask("rt3", "zustellung", "laeuft", null, 30),
    roleTask("rt4", "qualitaet", "fertig", "Ausreißer: 2 Quellen mit toter Website, Feld website korrigiert.", 1500, { bewertung: "wirkt" }),
  ];
  const cohorts = [3, 2, 1, 0].flatMap((w) => C.map((c, i) => ({ week: isoWeek(nowMs - w * 7 * 86_400_000), country: c, sent: 80 + i * 10, delivered: 78 + i * 10, replies: 1, positive: 0, samples: 0, customers: 0 })));
  return {
    rpc: {
      agent_role_kpi: roleKpi, cohort_funnel: cohorts, pruef_kpi: { now: iso(0), tage: pruef, leads: [], kaeufer: [], ausreisser: [] },
      pruef_bestand: [{ art: "lead", geprueft: 42000, score_avg: 71.4, mehrfach: 13000 }, { art: "kaeufer", geprueft: 9000, score_avg: 64.2, mehrfach: 1100 }],
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
      website_refresh: website, website_stats: webStats, dashboard_raw_stock: { at: iso(10), by_country: { US: 90000, UK: 40000, FR: 52000 } },
    },
    tables: {
      dashboard_cache: [{ name: "stock", value: stock, updated_at: iso(1) }, { name: "website", value: website, updated_at: iso(1) }],
      kpi_daily: kpi, experiment_stats: expStats, company_goals: goals, customers, subscriptions, inbound_replies: replies,
      agent_roles: roles,
      brain_routines: [routine("r-test", "A/B-Prüfung", "18:20"), routine("r-trichter", "KPI-Diagnose", "07:40"), routine("r-qual", "Qualität", "07:50"),
        routine("r-zust", "Zustellung", "06:30"), routine("r-quell", "Quellen", "12:10")],
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
        ...tasks,
        { id: "t1", created_at: iso(200), finished_at: iso(120), agent: 2, kind: "leads", market: "UK", brief: "Neue Leads für UK holen", status: "fertig", result: "380 neue grüne Leads aus zwei Quellen.", progress: 100, step: null, numbers: {} },
      ],
      owner_log: [{ id: 7, action: "setting:followup_enabled", target: null, new_value: true, created_at: iso(300), created_by: "Inhaber Dashboard" }],
    },
  };
}

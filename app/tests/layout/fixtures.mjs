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
  // Gehirn-Score (scripts/brain_meta.py, Land ALL) für die Karte „Gehirn lernt“
  kpi.push(...days.map((d, i) => ({ day: d, country: "ALL", metric: "gehirn_score", value: 40 + i })));
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
  // JARVIS-Zentrale (05.10.2026): schneller Teil (zentrale_schnell) und Zwischenspeicher 'zentrale' – erfundene Zahlen
  const zSchnell = {
    now: iso(0),
    beats: [
      { werk: "lead-werk", last_beat: iso(2), plaetze: 10, processed_60m: 50000, green_60m: 4200 },
      { werk: "pruefer-werk", last_beat: iso(1), plaetze: 1, processed_60m: 8000, green_60m: 7900 },
      { werk: "kunden-werk", last_beat: iso(3), plaetze: 1, processed_60m: 900, green_60m: 300 },
      { werk: "proben-vorrat", last_beat: iso(30), plaetze: 0, processed_60m: 15, green_60m: 0 },
      { werk: "dauerpruefung", last_beat: iso(20), plaetze: 0, processed_60m: 500, green_60m: 480 },
      { werk: "kontakt-werk", last_beat: iso(2), plaetze: 4, processed_60m: 120, green_60m: 6 },
    ],
    tasks: [
      { id: "z1", agent: 1, rolle: "quellen", kind: "leads", market: "US", brief: "Leads US nachfüllen", status: "laeuft", progress: 40, step: "Quellen prüfen", created_by: "Abteilungs-Motor", created_at: iso(8), started_at: iso(5), finished_at: null, grund: "Vorrat knapp" },
      { id: "z2", agent: 5, rolle: "trichter", kind: "gehirn", market: "UK", brief: "Antwortquote UK heben", status: "offen", progress: 0, step: null, created_by: "Gehirn", created_at: iso(4), started_at: null, finished_at: null, grund: "Umsatz: Antworten fehlen" },
      { id: "z3", agent: 3, rolle: null, kind: "frage", market: null, brief: "Kontakt-Werk bauen", status: "laeuft", progress: 70, step: "Tests", created_by: "Inhaber Dashboard", created_at: iso(90), started_at: iso(60), finished_at: null, grund: null },
    ],
    handoffs: [{ id: "h2", created_at: iso(90), regel: "kaufinteresse", von: "vertrieb", an: "kundenservice", titel: "Kaufinteresse: Beispiel Studio Ltd", status: "wartet", market: "UK" }],
    gaps: [
      { slug: "vertrieb", ziel_key: "antwortquote", ist: 0, soll: 3, luecke: 1, rang: 1, titel: "Antwortquote 0 % → 3 % heben", grund: "Vertrieb: 100 % Lücke zum Ziel.", modus: "auftrag", updated_at: iso(20) },
      { slug: "marketing", ziel_key: "proben_7d", ist: 2, soll: 5, luecke: 0.6, rang: 2, titel: "Proben 2/Woche → 5", grund: "Marketing: 60 % Lücke.", modus: "auftrag", updated_at: iso(20) },
      { slug: "finanzen", ziel_key: "mrr", ist: 0, soll: 1290, luecke: 1, rang: 3, titel: "Umsatz 0 → 1.290/Monat", grund: "Finanzen: 100 % Lücke.", modus: "auftrag", updated_at: iso(20) },
      { slug: "qualitaet", ziel_key: "lead_fehler", ist: 3.14, soll: 2, luecke: 0.36, rang: 5, titel: "Lead-Fehler 3,1 % → 2 %", grund: "Qualität: 36 % Lücke.", modus: "auftrag", updated_at: iso(20) },
      { slug: "premium_labor", ziel_key: "premium_leads_7d", ist: null, soll: null, luecke: null, rang: 6, titel: null, grund: null, modus: "auftrag", updated_at: iso(20) },
      { slug: "produktion", ziel_key: "gruen_7d", ist: 93615, soll: 3000, luecke: 0, rang: 7, titel: null, grund: null, modus: "auftrag", updated_at: iso(20) },
    ],
    owner: { send_paused: false, werke_paused: {}, followup_enabled: true, slot_plan: {}, sample_targets: {}, slot_autopilot: { on: true } },
    brain_enabled: true,
    plan_log: [
      { werk: "lead-werk", at: iso(40), mode: "autopilot", bremse: "aus", plan: { "web-us": 4, "web-uk": 3, "web-fr": 3 }, reasons: { "web-us": "mehr grüne Leads je Lauf" } },
      { werk: "lead-werk", at: iso(220), mode: "autopilot", bremse: "aus", plan: { "web-us": 2, "web-uk": 4, "web-fr": 4 }, reasons: {} },
      { werk: "kunden-werk", at: iso(50), mode: "autopilot", bremse: "aus", plan: { kunden: 4 }, reasons: null },
      { werk: "kontakt-werk", at: iso(30), mode: "inhaber", bremse: "aus", plan: { kontakt: 4 }, reasons: null },
    ],
    scout_last: iso(30),
    msg: { sent_60m: 6, sent_24h: 153, sent_heute: 20, last_sent_at: iso(12), blocked_60m: 4, freigegeben: 9389 },
    ev24: { sent: 156, bounced: 11, unsubscribed: 7, delivered: 3 },
    replies: { offen: 2, heiss: 1 },
    acks: { antworten: iso(5), "lead-werk": iso(1), kundenlieferung: iso(60 * 24) },
    starts: [],
    subs: { aktiv: 1, neueste: iso(60 * 24 * 7) },
    held_60m: 3,
    ticker: [
      { at: iso(12), art: "decision", titel: "Betreff-Test UK gestartet", ref: "11" },
      { at: iso(30), art: "task", titel: "380 neue grüne Leads", ref: "2" },
      { at: iso(90), art: "positiv", titel: "Positive Antwort", ref: "e1" },
    ],
  };
  const zLangsam = {
    at: iso(3), lage: { mrr: 0, kunden: 0, mails_24h: 153, antworten_7d: 0, proben_7d: 2, gruen_7d: 93615, vorrat: 110 },
    runs: {
      "lead-werk": { processed_60m: 50000, green_60m: 4200, processed_24h: 2600000, green_24h: 241000, red_24h: 38000, last: iso(25) },
      "pruefer-werk": { processed_60m: 8000, green_60m: 7900, processed_24h: 8100, green_24h: 8000, red_24h: 100, last: iso(2) },
      "kunden-werk": { processed_60m: 0, green_60m: 0, processed_24h: 4200, green_24h: 1970, red_24h: 130, last: iso(160) },
      "kontakt-werk": { processed_60m: 120, green_60m: 6, processed_24h: 2400, green_24h: 310, red_24h: 12, last: iso(20) },
      stichprobe: { processed_60m: 0, green_60m: 0, processed_24h: 592, green_24h: 584, red_24h: 8, last: iso(600) },
    },
    tank: { US: 50, UK: 30, FR: 30 }, tank_24h: 3,
    kpi: [0, 1, 2].flatMap((d) => [{ day: day(d), metric: "gehirn_score", value: 46.7 - d, updated_at: iso(60 * 24 * d + 30) }, { day: day(d), metric: "mrr_cents", value: 0, updated_at: iso(60 * 24 * d + 30) }]),
    goals: [
      { key: "mrr", titel: "Umsatz pro Monat", einheit: "€", soll: 1290, richtung: "hoch", sort: 1, quelle: "vorschlag", updated_at: iso(600) },
      { key: "kunden", titel: "Kunden", einheit: "", soll: 10, richtung: "hoch", sort: 2, quelle: "vorschlag", updated_at: iso(600) },
      { key: "antwortquote", titel: "Antwortquote", einheit: "%", soll: 3, richtung: "hoch", sort: 3, quelle: "inhaber", updated_at: iso(600) },
      { key: "lead_fehler", titel: "Lead-Fehlerquote", einheit: "%", soll: 2, richtung: "runter", sort: 4, quelle: "vorschlag", updated_at: iso(600) },
    ],
    deliv: { day: day(0), at: iso(300), status: "gelb", gruende: ["Bounce-Quote 7 T 3.9 %"] },
    lern: { messen: 0, lehre: 1, erwartungen: 2, eval: { created_at: iso(60), faelle: 32, richtig: 32, score: 100 }, last_decision: iso(12), messen_liste: [],
      lehre_liste: [{ at: iso(40), titel: "Premium-Punktzahl sinkt mit dem Ereignisalter", vertrauen: 0.8 }] },
    storage: { db_bytes: 5.16e9, at: iso(30) }, llm_heute: 0.17, sperre: { gesamt: 68, neu_24h: 7 }, cache_wachhund: iso(30),
  };
  return {
    rpc: {
      zentrale_schnell: zSchnell, zentrale_langsam: zLangsam,
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
      // Firma (Organigramm 04.10.2026)
      firma_lage: { at: iso(0), mrr: 1290, kunden: 3, mails_24h: 90, antworten_7d: 6, positiv_7d: 2, proben_7d: 3, gruen_7d: 9000, vorrat: 12,
        vorrat_land: { US: 4, UK: 4, FR: 4 }, bestanden: 0.97, bestanden_n: 130, spam_30d: 0, spam_neu: [], heiss_offen: 1, heiss: [],
        laender: { US: { erstmails: 40, antworten: 2 } }, leer: [], ausreisser: [] },
      website_refresh: website, website_stats: webStats, dashboard_raw_stock: { at: iso(10), by_country: { US: 90000, UK: 40000, FR: 52000 } },
    },
    tables: {
      dashboard_cache: [{ name: "zentrale", value: zLangsam, updated_at: iso(3) }, { name: "stock", value: stock, updated_at: iso(1) }, { name: "website", value: website, updated_at: iso(1) }],
      kpi_daily: kpi, experiment_stats: expStats, company_goals: goals, customers, subscriptions, inbound_replies: replies,
      agent_roles: roles,
      // Feedback-Werk (Büro Qualität): erfundene Testzahlen
      lead_feedback_stats: [
        { signal_type: "no_website", country: "US", bewertungen: 9, gut: 7, schlecht: 2, gewonnen: 1, gut_pct: 77.8 },
        { signal_type: "no_website", country: "UK", bewertungen: 3, gut: 1, schlecht: 2, gewonnen: 0, gut_pct: 33.3 },
        { signal_type: "relocation", country: "FR", bewertungen: 6, gut: 1, schlecht: 5, gewonnen: 0, gut_pct: 16.7 },
      ],
      departments: [
        { slug: "vertrieb", name: "Vertrieb", icon: "versand", zweck: "Zweck Vertrieb", leitung_rolle: null, leitung_name: "Trichter-Agent", leitung_takt: "täglich 07:40", aktiv: true,
          mitglieder: [{ art: "rolle", ref: "test", name: "Trichter-Agent", takt: "täglich 07:40" }, { art: "workflow", ref: "x.yml", name: "Werk Vertrieb", takt: "stündlich" }, { art: "routine", ref: "A/B-Prüfung", name: "Routine", takt: "18:20" }],
          ziel_key: "antwortquote", ziel_titel: "Ziel Vertrieb", ziel_soll: null, ziel_richtung: "hoch", wirkung_key: "positiv_7d", wirkung_titel: "Wirkung Vertrieb", sort: 10 },
        { slug: "marketing", name: "Marketing", icon: "website", zweck: "Zweck Marketing", leitung_rolle: null, leitung_name: "Test-Agent", leitung_takt: "täglich 07:40", aktiv: true,
          mitglieder: [{ art: "rolle", ref: "test", name: "Test-Agent", takt: "täglich 07:40" }, { art: "workflow", ref: "x.yml", name: "Werk Marketing", takt: "stündlich" }, { art: "routine", ref: "A/B-Prüfung", name: "Routine", takt: "18:20" }],
          ziel_key: "proben_7d", ziel_titel: "Ziel Marketing", ziel_soll: 5, ziel_richtung: "hoch", wirkung_key: "proben_7d", wirkung_titel: "Wirkung Marketing", sort: 20 },
        { slug: "produktion", name: "Produktion", icon: "lead-werk", zweck: "Zweck Produktion", leitung_rolle: null, leitung_name: "Quellen-Agent", leitung_takt: "täglich 07:40", aktiv: true,
          mitglieder: [{ art: "rolle", ref: "test", name: "Quellen-Agent", takt: "täglich 07:40" }, { art: "workflow", ref: "x.yml", name: "Werk Produktion", takt: "stündlich" }, { art: "routine", ref: "A/B-Prüfung", name: "Routine", takt: "18:20" }],
          ziel_key: "gruen_7d", ziel_titel: "Ziel Produktion", ziel_soll: 3000, ziel_richtung: "hoch", wirkung_key: "vorrat", wirkung_titel: "Wirkung Produktion", sort: 30 },
        { slug: "qualitaet", name: "Qualität", icon: "freigabe", zweck: "Zweck Qualität", leitung_rolle: null, leitung_name: "Qualitäts-Agent", leitung_takt: "täglich 07:40", aktiv: true,
          mitglieder: [{ art: "rolle", ref: "test", name: "Qualitäts-Agent", takt: "täglich 07:40" }, { art: "workflow", ref: "x.yml", name: "Werk Qualität", takt: "stündlich" }, { art: "routine", ref: "A/B-Prüfung", name: "Routine", takt: "18:20" }],
          ziel_key: "lead_fehler", ziel_titel: "Ziel Qualität", ziel_soll: null, ziel_richtung: "runter", wirkung_key: "bestanden", wirkung_titel: "Wirkung Qualität", sort: 40 },
        { slug: "kundenservice", name: "Kundenservice", icon: "antworten", zweck: "Zweck Kundenservice", leitung_rolle: null, leitung_name: "Antwort-Assistent", leitung_takt: "täglich 07:40", aktiv: true,
          mitglieder: [{ art: "rolle", ref: "test", name: "Antwort-Assistent", takt: "täglich 07:40" }, { art: "workflow", ref: "x.yml", name: "Werk Kundenservice", takt: "stündlich" }, { art: "routine", ref: "A/B-Prüfung", name: "Routine", takt: "18:20" }],
          ziel_key: "heiss_offen", ziel_titel: "Ziel Kundenservice", ziel_soll: 0, ziel_richtung: "runter", wirkung_key: "heiss_offen", wirkung_titel: "Wirkung Kundenservice", sort: 50 },
        { slug: "finanzen", name: "Finanzen", icon: "trend-hoch", zweck: "Zweck Finanzen", leitung_rolle: null, leitung_name: "Finanz-Wache", leitung_takt: "täglich 07:40", aktiv: true,
          mitglieder: [{ art: "rolle", ref: "test", name: "Finanz-Wache", takt: "täglich 07:40" }, { art: "workflow", ref: "x.yml", name: "Werk Finanzen", takt: "stündlich" }, { art: "routine", ref: "A/B-Prüfung", name: "Routine", takt: "18:20" }],
          ziel_key: "mrr", ziel_titel: "Ziel Finanzen", ziel_soll: null, ziel_richtung: "hoch", wirkung_key: "mrr", wirkung_titel: "Wirkung Finanzen", sort: 60 },
        { slug: "recht", name: "Recht", icon: "recht", zweck: "Zweck Recht", leitung_rolle: null, leitung_name: "Recht-Wache", leitung_takt: "täglich 07:40", aktiv: true,
          mitglieder: [{ art: "rolle", ref: "test", name: "Recht-Wache", takt: "täglich 07:40" }, { art: "workflow", ref: "x.yml", name: "Werk Recht", takt: "stündlich" }, { art: "routine", ref: "A/B-Prüfung", name: "Routine", takt: "18:20" }],
          ziel_key: "spam_30d", ziel_titel: "Ziel Recht", ziel_soll: 0, ziel_richtung: "runter", wirkung_key: "spam_30d", wirkung_titel: "Wirkung Recht", sort: 70 },
        { slug: "strategie", name: "Strategie", icon: "gehirn", zweck: "Zweck Strategie", leitung_rolle: null, leitung_name: "Gehirn", leitung_takt: "täglich 07:40", aktiv: true,
          mitglieder: [{ art: "rolle", ref: "test", name: "Gehirn", takt: "täglich 07:40" }, { art: "workflow", ref: "x.yml", name: "Werk Strategie", takt: "stündlich" }, { art: "routine", ref: "A/B-Prüfung", name: "Routine", takt: "18:20" }],
          ziel_key: "kunden", ziel_titel: "Ziel Strategie", ziel_soll: null, ziel_richtung: "hoch", wirkung_key: "kunden", wirkung_titel: "Wirkung Strategie", sort: 80 },
      ],
      handoffs: [
        { id: "h1", created_at: iso(40), regel: "fehlerquote", von: "qualitaet", an: "produktion", titel: "Käufer FR: Fehlerquote 7,1 %", grund: "Dauerprüfung: 84 geprüft.", market: "FR", status: "beauftragt", task_id: "t1", push_at: null },
        { id: "h2", created_at: iso(90), regel: "kaufinteresse", von: "vertrieb", an: "kundenservice", titel: "Kaufinteresse: Beispiel Studio Ltd", grund: "Antwort wartet.", market: "UK", status: "wartet", task_id: null, push_at: iso(90) },
        { id: "h3", created_at: iso(300), regel: "vorrat_leer", von: "produktion", an: "strategie", titel: "Vorrat leer: Linie s2-us", grund: "Keine Kandidaten.", market: "US", status: "gemeldet", task_id: null, push_at: null },
      ],
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
        { id: 12, created_at: iso(30), type: "note", status: "done", subject: "Meta: Routine Takt", reasoning: "0 von 5 Läufen mit Wirkung; jetzt jeden 2. Tag.", action: null, kurz_titel: "Routine „Markt-Recherche Webagenturen“ seltener", kurz_grund: "0 von 5 Läufen mit Wirkung; jetzt jeden 2. Tag." },
        { id: 10, created_at: iso(60 * 26), type: "daily_note", status: "done", subject: "Tagesnotiz", reasoning: "Alles im Plan.", action: null, kurz_titel: null, kurz_grund: null },
      ],
      brain_improvements: [{ id: "i1", status: "offen" }, { id: "i2", status: "offen" }],
      // Selbstoptimierung (scripts/selbstopt.py) für die Karte „Optimiert sich selbst“: Titel ≤ 60 + Pfeil der Wirkung
      selbstopt_changes: [
        { id: "so1", created_at: iso(20), schraube: "versand_menge", status: "offen", kurz_titel: "Versand weniger: Menge × 0,9", kurz_grund: "Bounce-Quote 3,4 % bei 260 Mails (3 Tage); nie über das Tagesziel." },
        { id: "so2", created_at: iso(60 * 30), schraube: "kaeufer_kategorien", status: "wirkt", kurz_titel: "Käufer: „e commerce service“ zuletzt prüfen", kurz_grund: "ok-Quote 32,4 % statt Schnitt 41,0 % (3290 geprüft, 14 Tage)." },
        { id: "so3", created_at: iso(60 * 80), schraube: "dauerpruefung", status: "zurueck", kurz_titel: "Prüfung zurück Richtung Standard (× 1)", kurz_grund: "Lead-Fehlerquote 0,8 % bei 640 Prüfungen (3 Tage)." },
      ],
      agent_tasks: [
        ...tasks,
        { id: "t1", created_at: iso(200), finished_at: iso(120), agent: 2, kind: "leads", market: "UK", brief: "Neue Leads für UK holen", status: "fertig", result: "380 neue grüne Leads aus zwei Quellen.", progress: 100, step: null, numbers: {} },
        // vom Gehirn beauftragt, läuft: Abzeichen „vom Gehirn“ darf am Handy den Kugel-Text nicht überdecken
        { id: "t2", created_at: iso(30), finished_at: null, agent: 1, kind: "leads", market: "US", brief: "Leads US nachfüllen", started_at: iso(20), status: "laeuft", result: null, progress: 40, step: "Quellen prüfen", numbers: {}, created_by: "Gehirn", grund: "Vorrat US knapp", rolle: "test" },
      ],
      owner_log: [{ id: 7, action: "setting:followup_enabled", target: null, new_value: true, created_at: iso(300), created_by: "Inhaber Dashboard" }],
    },
  };
}

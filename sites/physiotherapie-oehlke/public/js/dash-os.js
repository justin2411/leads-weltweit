/* Oehlke Business OS · Phase 1: Fundament und Dashboard
   - zentrales Datenmodell mit Herkunft und Aktualität je Datensatz
   - Kennzahlen-Register: jede Zahl mit Formel, Eingangswerten, Quelle, Vergleich und Datenqualität
   - Datenquellen mit Sync-Protokoll und Import-Prüfung (MediFox: Schnittstelle in Prüfung)
   - Rollen und Rechte, Protokoll (Audit-Log)
   - Automations-Engine: Auslöser, Regel, Aktion, Kontrolle, Stufe 1–3, Freigaben
   Demo: alle Werte sind Beispieldaten und werden im Browser berechnet. */
(function () {
  "use strict";
  var P = window.PC, $ = P.$, $$ = P.$$, esc = P.esc, icon = P.icon, store = P.store, V = P.V;
  var OS = P.OS = {};
  var eur0 = function (n) { return Math.round(n).toLocaleString("de-DE") + " €"; };
  var pctf = function (n) { return (Math.round(n * 10) / 10).toLocaleString("de-DE") + " %"; };
  var MONTHS = ["Jan", "Feb", "Mär", "Apr", "Mai", "Jun", "Jul", "Aug", "Sep", "Okt", "Nov", "Dez"];

  // ------------------------------------------------------------ Rollen und Rechte
  /* Zugriffsstufen je Modul: voll, lesen, eigene (nur eigene Daten), aggregiert (ohne Einzelwerte), kein */
  OS.ROLES = [
    { id: "inhaber", name: "Inhaber", desc: "alle Module, alle Finanzen, Rechte vergeben" },
    { id: "teamleitung", name: "Teamleitung", desc: "Team, Touren, Anfragen; Finanzen nur zusammengefasst, keine Gehälter" },
    { id: "therapeut", name: "Therapeut:in", desc: "eigene Touren, eigene Auslastung, eigene Aufgaben" },
    { id: "verwaltung", name: "Verwaltung", desc: "Anfragen, Rechnungen und Zahlungen, Partner, keine Gehälter" },
    { id: "extern", name: "Extern (z. B. Steuerberatung)", desc: "nur freigegebene Berichte, nur lesen, zeitlich begrenzt" }
  ];
  OS.PERM = {
    inhaber: { dashboard: "voll", nachfrage: "voll", personal: "voll", touren: "voll", finanzen: "voll", marketing: "voll", partner: "voll", auto: "voll", berichte: "voll", system: "voll", gehaelter: "voll" },
    teamleitung: { dashboard: "voll", nachfrage: "voll", personal: "voll", touren: "voll", finanzen: "aggregiert", marketing: "lesen", partner: "voll", auto: "voll", berichte: "lesen", system: "kein", gehaelter: "kein" },
    therapeut: { dashboard: "eigene", nachfrage: "kein", personal: "eigene", touren: "eigene", finanzen: "kein", marketing: "kein", partner: "kein", auto: "eigene", berichte: "kein", system: "kein", gehaelter: "kein" },
    verwaltung: { dashboard: "voll", nachfrage: "voll", personal: "lesen", touren: "lesen", finanzen: "voll", marketing: "lesen", partner: "voll", auto: "voll", berichte: "lesen", system: "kein", gehaelter: "kein" },
    extern: { dashboard: "kein", nachfrage: "kein", personal: "kein", touren: "kein", finanzen: "aggregiert", marketing: "kein", partner: "kein", auto: "kein", berichte: "lesen", system: "kein", gehaelter: "kein" }
  };
  OS.role = function () { return store.get("role", "inhaber"); };
  P.can = function (area) { var r = OS.PERM[OS.role()] || OS.PERM.inhaber; return r[area] || "kein"; };
  OS.ME = { inhaber: "ro", teamleitung: "ro", therapeut: "ls", verwaltung: null, extern: null };
  OS.seesMoney = function () { return P.can("finanzen") === "voll" || P.can("finanzen") === "aggregiert"; };

  // ------------------------------------------------------------ Protokoll (Audit-Log)
  OS.audit = function (action, detail, kind) {
    var l = store.get("audit", []);
    l.unshift({ ts: Date.now(), role: OS.role(), action: action, detail: detail || "", kind: kind || "info" });
    store.set("audit", l.slice(0, 300));
  };

  // ------------------------------------------------------------ Datenquellen und Synchronisierung
  /* mode: api, export (Datei-Import), formular, manuell, keine */
  OS.SOURCES = [
    { id: "medifox", name: "MediFox DAN", role: "führend für Patienten, Termine, Dokumentation, Abrechnung", mode: "export", status: "pruefung", domains: ["Termine", "Behandlungen", "Ausfälle", "Mitarbeiter-Stammdaten", "Leistungen/Erlöse"], note: "Schnittstelle wird geprüft. Bis zur Klärung: Demo-Daten, danach geplanter Datei-Export (CSV) mit Prüfung." },
    { id: "website", name: "Website-Kontaktformular", role: "neue Anfragen", mode: "formular", status: "demo", domains: ["Anfragen"], note: "Formular öffnet heute das E-Mail-Programm. Direkte Übernahme in Phase 3." },
    { id: "buchhaltung", name: "Buchhaltung (z. B. DATEV / lexoffice)", role: "tatsächliche Kosten", mode: "keine", status: "offen", domains: ["Kosten", "Gemeinkosten"], note: "Ohne echte Kosten keine belastbare Gewinnprognose. Anbindung oder monatlicher Export in Phase 2." },
    { id: "bank", name: "Bankkonto", role: "Zahlungseingänge, Liquidität", mode: "keine", status: "offen", domains: ["Zahlungseingang", "Kontostand"], note: "Über Buchhaltung oder Kontoauszug-Export (CAMT/CSV), Phase 2." },
    { id: "gsc", name: "Google Search Console", role: "Suchanfragen, Positionen", mode: "api", status: "offen", domains: ["Rankings", "Klicks"], note: "Offizielle API, Zugang durch Inhaber, Phase 5." },
    { id: "ga4", name: "Google Analytics 4 / Web-Statistik", role: "Besucher, Conversions", mode: "api", status: "offen", domains: ["Besucher", "Anfragen je Kanal"], note: "Cookie-freie Alternative prüfen (Datenschutz), Phase 5." },
    { id: "gbp", name: "Google-Unternehmensprofil", role: "Bewertungen", mode: "api", status: "offen", domains: ["Bewertungen"], note: "Phase 5." },
    { id: "ads", name: "Google Ads", role: "Werbekosten, Klicks", mode: "api", status: "offen", domains: ["Kosten je Kanal"], note: "Nur falls Anzeigen geschaltet werden, Phase 5." }
  ];
  OS.STATUS = { ok: ["verbunden", "good"], demo: ["Demo-Daten", "info"], pruefung: ["in Prüfung", "warn"], offen: ["nicht verbunden", "plain"], fehler: ["Fehler", "bad"] };
  OS.syncLog = function () {
    var l = store.get("synclog", null);
    if (l) return l;
    var t = Date.now(), h = 3600000;
    l = [
      { ts: t - 2.5 * h, src: "medifox", kind: "Demo-Daten geladen", rows: 412, ok: 412, err: 0, status: "ok", msg: "Beispieldaten, keine echte Verbindung" },
      { ts: t - 26.5 * h, src: "medifox", kind: "Testimport CSV (Termine)", rows: 388, ok: 381, err: 7, status: "teilweise", msg: "7 Zeilen ohne Mitarbeiterkürzel, in Klärungsliste" },
      { ts: t - 4 * h, src: "website", kind: "Anfragen", rows: 2, ok: 2, err: 0, status: "ok", msg: "" },
      { ts: t - 50 * h, src: "buchhaltung", kind: "Kosten September (manuell)", rows: 14, ok: 14, err: 0, status: "ok", msg: "manuell erfasst, Demo" }
    ];
    store.set("synclog", l); return l;
  };
  OS.lastSync = function (src) { var l = OS.syncLog().filter(function (x) { return x.src === src; }); return l.length ? l.sort(function (a, b) { return b.ts - a.ts; })[0] : null; };
  OS.ago = function (ts) { var m = Math.round((Date.now() - ts) / 60000); return m < 60 ? "vor " + m + " Min." : m < 48 * 60 ? "vor " + Math.round(m / 60) + " Std." : "vor " + Math.round(m / 1440) + " Tagen"; };

  /* Datei-Import mit Prüfung (Grundlage für den MediFox-Export) */
  OS.IMPORT_COLS = ["datum", "uhrzeit", "mitarbeiter", "patient_id", "plz", "leistung", "dauer_min", "status", "kostentraeger"];
  OS.validateCsv = function (text) {
    var lines = text.replace(/\r/g, "").split("\n").filter(function (l) { return l.trim(); });
    if (!lines.length) return { error: "Datei ist leer." };
    var sep = lines[0].indexOf(";") >= 0 ? ";" : ",";
    var head = lines[0].split(sep).map(function (h) { return h.trim().toLowerCase(); });
    var missing = OS.IMPORT_COLS.filter(function (c) { return head.indexOf(c) < 0; });
    var rows = [], errors = [], seen = {}, dup = 0;
    lines.slice(1).forEach(function (l, i) {
      var v = l.split(sep), r = {}; head.forEach(function (h, k) { r[h] = (v[k] || "").trim(); });
      var e = [];
      if (!/^\d{2}\.\d{2}\.\d{4}$|^\d{4}-\d{2}-\d{2}$/.test(r.datum || "")) e.push("Datum ungültig");
      if (!r.mitarbeiter) e.push("Mitarbeiter fehlt");
      if (!/^\d{5}$/.test(r.plz || "")) e.push("PLZ ungültig");
      if (!(+r.dauer_min > 0)) e.push("Dauer fehlt");
      if (r.status && ["geplant", "erbracht", "ausgefallen", "abgesagt"].indexOf(r.status.toLowerCase()) < 0) e.push("Status unbekannt");
      var key = [r.datum, r.uhrzeit, r.mitarbeiter, r.patient_id].join("|");
      if (seen[key]) { e.push("Doppelter Termin"); dup++; } seen[key] = 1;
      if (e.length) errors.push({ line: i + 2, msg: e.join(", ") }); else rows.push(r);
    });
    return { head: head, missing: missing, total: lines.length - 1, ok: rows.length, errors: errors, dup: dup, sample: rows.slice(0, 5) };
  };
  OS.SAMPLE_CSV = "datum;uhrzeit;mitarbeiter;patient_id;plz;leistung;dauer_min;status;kostentraeger\n06.10.2026;08:15;LS;P-1042;68766;KG;60;geplant;privat\n06.10.2026;09:30;LS;P-1043;68723;MLD;60;geplant;beihilfe\n06.10.2026;08:15;JK;P-1051;68775;MT;60;geplant;privat\n06.10.2026;10:40;JK;P-1051;68775;MT;60;geplant;privat\n06.10.2026;10:40;JK;P-1051;68775;MT;60;geplant;privat\n06.10.2026;11:00;;P-1060;6876;KG;60;geplant;selbst\n";

  // ------------------------------------------------------------ Finanz- und Kapazitätsmodell (Demo)
  /* Arbeitszeitmodell je Mitarbeiter:in: Vertragsstunden, Anteil Leitung/Organisation, Monatskosten Arbeitgeber */
  OS.STAFF = {
    ro: { hours: 45, lead: 0.15, cost: 0, since: "2021", note: "Inhaber: kein Gehalt in den direkten Kosten (Unternehmerlohn separat)" },
    ls: { hours: 40, lead: 0, cost: 4720, since: "2023" },
    jk: { hours: 40, lead: 0, cost: 4480, since: "2024" },
    mw: { hours: 26, lead: 0, cost: 3020, since: "2025" }
  };
  OS.DOKU = 0.12;           // Anteil Dokumentation und Organisation an der Arbeitszeit
  OS.PAUSE_DAY = 0.5;       // Stunden Pause je Arbeitstag
  OS.TARGET = { revenue: 32000, utilization: 85, driveShare: 25, waitDays: 10 };
  OS.OVERHEAD = [["Verwaltung (Minijob)", 603], ["Büro und Lager", 650], ["Software (MediFox, Website)", 280], ["Versicherungen und Beiträge", 310], ["Marketing", 400], ["Telefon, Sonstiges", 450]];
  OS.VEHICLE_PER_KM = 0.32;
  /* 13 Monate: Index 0 = aktueller Monat, 12 = Vorjahresmonat */
  OS.months = function () {
    var base = 30500, out = [], now = new Date(P.today.getFullYear(), P.today.getMonth(), 1);
    for (var i = 12; i >= 0; i--) {
      var d = new Date(now.getFullYear(), now.getMonth() - i, 1), mo = d.getMonth();
      var season = [0.94, 0.97, 1.02, 1.0, 0.98, 0.96, 0.86, 0.84, 0.98, 1.03, 1.04, 0.9][mo];
      var growth = 0.8 + 0.2 * (12 - i) / 12, wobble = 1 + Math.sin(i * 1.7) * 0.025;
      out.push({ d: d, label: MONTHS[mo] + " " + String(d.getFullYear()).slice(2), rev: Math.round(base * growth * season * wobble / 10) * 10 });
    }
    out.forEach(function (m, k) {
      var prev = out[k - 1] ? out[k - 1].rev : m.rev;
      m.pay = Math.round(0.34 * m.rev + 0.63 * prev);
      var staff = OS.STAFF.ls.cost + OS.STAFF.jk.cost + (k >= 3 ? OS.STAFF.mw.cost : 0);
      m.direct = Math.round(staff * (k >= 10 ? 1 : 0.97) + m.rev / 100 * 22 * OS.VEHICLE_PER_KM * 4.3);
      m.overhead = OS.OVERHEAD.reduce(function (s, o) { return s + o[1]; }, 0);
      m.db = m.rev - m.direct; m.result = m.db - m.overhead;
    });
    return out;
  };
  /* aktueller Monat bis heute (Werktage) */
  OS.mtd = function () {
    var y = P.today.getFullYear(), mo = P.today.getMonth(), all = 0, done = 0;
    for (var d = 1; d <= new Date(y, mo + 1, 0).getDate(); d++) { var wd = new Date(y, mo, d).getDay(); if (wd && wd !== 6) { all++; if (d <= P.today.getDate()) done++; } }
    return { all: all, done: done, share: all ? done / all : 0 };
  };
  /* Kapazität der kommenden Woche je Mitarbeiter:in (nachvollziehbarer Nenner) */
  OS.capacity = function () {
    var rows = P.TEAM.map(function (t) {
      var st = OS.STAFF[t.id], days = 0, treat = 0, drive = 0, n = 0;
      for (var di = 0; di < 5; di++) { var s = P.schedule(t.id, di); treat += s.treat / 60; drive += s.drive / 60; n += s.n; if (s.n) days++; }
      var lead = st.hours * st.lead, doku = (st.hours - lead) * OS.DOKU, pause = days * OS.PAUSE_DAY;
      var net = Math.max(0, st.hours - lead - doku - pause - drive);
      return { t: t, hours: st.hours, lead: lead, doku: doku, pause: pause, drive: drive, net: net, treat: treat, n: n, util: net ? treat / net * 100 : 0, free: Math.max(0, net - treat) };
    });
    var sum = function (k) { return rows.reduce(function (s, r) { return s + r[k]; }, 0); };
    var net = sum("net"), treat = sum("treat");
    return { rows: rows, net: net, treat: treat, free: Math.max(0, net - treat), util: net ? treat / net * 100 : 0, open: net ? Math.max(0, 100 - treat / net * 100) : 0, drive: sum("drive") };
  };

  // ------------------------------------------------------------ Kennzahlen-Register
  /* Jede Kennzahl: Wert, Einheit, Vergleiche, Qualität, Quelle, Formel, Eingangswerte */
  OS.metric = function (id) {
    var M = OS.months(), cur = M[12], prev = M[11], ly = M[0], mtd = OS.mtd(), cap = OS.capacity();
    var forecast = Math.round(cur.rev), mtdRev = Math.round(cur.rev * mtd.share);
    var reqs = P.requests(), open = reqs.filter(function (r) { return r.status === "neu" || r.status === "warteliste"; });
    var approvals = OS.approvals().length, tasks = (store.get("tasks", null) || { todo: [1, 2, 3] }).todo.length;
    var demo = { level: "demo", txt: "Demo-Daten" };
    var defs = {
      umsatz: { label: "Monatsumsatz", value: mtdRev, fmt: eur0, sub: "erbracht bis heute · Prognose " + eur0(forecast), cmp: [["Vormonat (gleicher Stand)", prev.rev * mtd.share], ["Vorjahresmonat", ly.rev * mtd.share], ["Ziel anteilig", OS.TARGET.revenue * mtd.share]], q: demo,
        src: "MediFox DAN: erbrachte Behandlungen (Leistungsdatum) × Preis je Leistung", formula: "Summe der Erlöse aller erbrachten Behandlungen im laufenden Monat, nach Leistungsdatum. Kein Zahlungseingang, kein Gewinn.",
        inputs: [["Werktage im Monat", mtd.all], ["davon vergangen", mtd.done], ["Erbrachter Umsatz bisher", eur0(mtdRev)], ["Hochrechnung Monatsende", eur0(forecast)]], go: "#controlling" },
      kapazitaet: { label: "Offene Kapazität", pp: true, value: cap.open, fmt: function (v) { return pctf(v); }, sub: "nächste 5 Werktage · " + String(Math.round(cap.free)).replace(".", ",") + " Std. frei", invert: true, cmp: [["Zielkorridor", 100 - OS.TARGET.utilization]], q: demo,
        src: "MediFox DAN: geplante Termine; Arbeitszeitmodelle aus Personal", formula: "1 − geplante Behandlungsstunden ÷ behandlungsfähige Nettozeit. Nettozeit = Vertragsstunden − Leitung/Organisation − Dokumentation (" + OS.DOKU * 100 + " %) − Pausen − Fahrtzeit.",
        inputs: cap.rows.map(function (r) { return [r.t.name, String(Math.round(r.treat * 10) / 10).replace(".", ",") + " von " + String(Math.round(r.net * 10) / 10).replace(".", ",") + " Std. netto (" + Math.round(r.util) + " %)"]; }), go: "#kapazitaet" },
      therapeuten: { label: "Aktive Therapeut:innen", value: P.TEAM.length, fmt: function (v) { return v; }, sub: Object.keys(OS.STAFF).reduce(function (s, k) { return s + OS.STAFF[k].hours; }, 0) + " Std. pro Woche laut Vertrag", cmp: [["Vorjahr", P.TEAM.length - 1]], q: demo,
        src: "Personalstammdaten (MediFox oder Business OS)", formula: "Mitarbeiter:innen mit aktivem Vertrag und Behandlungsanteil.", inputs: P.TEAM.map(function (t) { return [t.name, OS.STAFF[t.id].hours + " Std./Woche"]; }), go: "#team" },
      aufgaben: { label: "Offene Aufgaben", value: approvals + tasks, fmt: function (v) { return v; }, sub: approvals + " Freigaben, " + tasks + " Aufgaben", invert: true, cmp: [], q: { level: "ok", txt: "vollständig" },
        src: "Business OS: Freigaben und Aufgaben", formula: "Offene Freigaben der Automationen plus offene Aufgaben im Team.", inputs: [["Freigaben", approvals], ["Aufgaben", tasks]], go: "#freigaben" },
      zahlung: { label: "Zahlungseingang", value: Math.round(cur.pay * mtd.share), fmt: eur0, sub: "eingegangen im Monat bis heute", cmp: [["Vormonat (gleicher Stand)", prev.pay * mtd.share], ["Vorjahresmonat", ly.pay * mtd.share]], q: { level: "missing", txt: "Bank nicht verbunden" },
        src: "Bank bzw. Buchhaltung (noch nicht verbunden)", formula: "Tatsächlich eingegangene Zahlungen nach Valutadatum. Unterscheidet sich vom Umsatz durch Zahlungsziel und Erstattung.", inputs: [["Offene Forderungen (Demo)", eur0(P.invoices().filter(function (i) { return i.status !== "bezahlt"; }).reduce(function (s, i) { return s + i.sum; }, 0))]], go: "#rechnungen" },
      db: { label: "Deckungsbeitrag", value: Math.round(cur.db * mtd.share), fmt: eur0, sub: "Umsatz minus direkte Kosten, bis heute", cmp: [["Vormonat (gleicher Stand)", prev.db * mtd.share], ["Vorjahresmonat", ly.db * mtd.share]], q: { level: "missing", txt: "Kosten geschätzt" },
        src: "Umsatz (MediFox) − direkte Kosten (Personal Therapeut:innen, Fahrzeug)", formula: "Direkte Kosten = Arbeitgeberkosten der angestellten Therapeut:innen + Fahrzeugkosten je km. Personalkosten erscheinen nur hier, nicht nochmals in den Gemeinkosten.",
        inputs: [["Umsatz Monat (Prognose)", eur0(cur.rev)], ["Direkte Kosten Monat", eur0(cur.direct)], ["DB-Quote", pctf(cur.db / cur.rev * 100)]], go: "#controlling" },
      ergebnis: { label: "Ergebnis (Prognose)", value: Math.round(cur.result), fmt: eur0, sub: "Monatsende, vor Steuern und Unternehmerlohn", cmp: [["Vormonat", prev.result], ["Vorjahresmonat", ly.result]], q: { level: "missing", txt: "Kosten geschätzt" },
        src: "Deckungsbeitrag − Gemeinkosten (Buchhaltung, noch nicht verbunden)", formula: "Deckungsbeitrag minus Gemeinkosten (Verwaltung, Büro, Software, Versicherungen, Marketing). Ohne Unternehmerlohn des Inhabers.", inputs: OS.OVERHEAD.map(function (o) { return [o[0], eur0(o[1])]; }), go: "#controlling" },
      auslastung: { label: "Auslastung", pp: true, value: cap.util, fmt: function (v) { return pctf(v); }, sub: "nächste 5 Werktage, Ziel " + OS.TARGET.utilization + " %", cmp: [["Ziel", OS.TARGET.utilization]], q: demo,
        src: "MediFox DAN: geplante Termine; Arbeitszeitmodelle", formula: "Geplante Behandlungsstunden ÷ behandlungsfähige Nettozeit (siehe Offene Kapazität).", inputs: cap.rows.map(function (r) { return [r.t.name, Math.round(r.util) + " %"]; }), go: "#kapazitaet" },
      freie: { label: "Freie Behandlungsstunden", value: cap.free, fmt: function (v) { return String(Math.round(v * 10) / 10).replace(".", ",") + " Std."; }, sub: "nächste 5 Werktage", cmp: [], q: demo,
        src: "wie Auslastung", formula: "Behandlungsfähige Nettozeit minus geplante Behandlungsstunden.", inputs: cap.rows.map(function (r) { return [r.t.name, String(Math.round(r.free * 10) / 10).replace(".", ",") + " Std."]; }), go: "#kapazitaet" },
      fahrzeit: { label: "Fahrzeit-Anteil", pp: true, value: cap.drive / (cap.drive + cap.treat) * 100, fmt: function (v) { return pctf(v); }, sub: "Ziel unter " + OS.TARGET.driveShare + " %", invert: true, cmp: [["Ziel", OS.TARGET.driveShare]], q: demo,
        src: "Touren (Entfernungen geschätzt, Luftlinie × 1,3)", formula: "Fahrtzeit ÷ (Fahrtzeit + Behandlungszeit).", inputs: [["Fahrtzeit", String(Math.round(cap.drive * 10) / 10).replace(".", ",") + " Std."], ["Behandlungszeit", String(Math.round(cap.treat * 10) / 10).replace(".", ",") + " Std."]], go: "#touren" },
      warteliste: { label: "Warteliste", value: open.length, fmt: function (v) { return v; }, sub: "Ø " + (open.length ? Math.round(open.reduce(function (s, r) { return s + r.since; }, 0) / open.length) : 0) + " Tage Wartezeit", invert: true, cmp: [["Ziel Wartezeit (Tage)", OS.TARGET.waitDays]], q: { level: "ok", txt: "vollständig" },
        src: "Business OS: Anfragen und Warteliste", formula: "Anfragen mit Status neu oder Warteliste.", inputs: open.map(function (r) { return [r.name, r.town + ", seit " + r.since + " Tagen"]; }), go: "#patienten" },
      hausbesuche: { label: "Hausbesuche " + P.dayLabel(0), value: P.TEAM.reduce(function (s, t) { return s + P.schedule(t.id, 0).n; }, 0), fmt: function (v) { return v; }, sub: "geplant, ohne Absagen", cmp: [], q: demo,
        src: "MediFox DAN: Termine", formula: "Geplante, nicht abgesagte Hausbesuche am nächsten Werktag.", inputs: P.TEAM.map(function (t) { return [t.name, P.schedule(t.id, 0).n + " Besuche"]; }), go: "#touren" },
      ausfaelle: { label: "Ausfälle", value: Object.keys(store.get("cancel", {})).length, fmt: function (v) { return v; }, sub: "erfasste Absagen", invert: true, cmp: [], q: demo,
        src: "MediFox DAN: abgesagte Termine", formula: "Abgesagte Termine im Planungszeitraum.", inputs: [], go: "#touren" },
      sync: { label: "Datenabgleich", value: OS.syncLog().filter(function (x) { return x.err > 0; }).length, fmt: function (v) { return v ? v + " offen" : "ok"; }, sub: "Fehler und Klärungsfälle", invert: true, cmp: [], q: { level: "ok", txt: "vollständig" },
        src: "Business OS: Sync-Protokoll", formula: "Importläufe mit fehlerhaften oder unklaren Zeilen.", inputs: OS.syncLog().map(function (x) { return [x.kind, x.ok + " ok, " + x.err + " Fehler"]; }), go: "#datenquellen" }
    };
    var m = defs[id]; m.id = id; return m;
  };
  /* Vergleich: Abweichung in Prozent, richtungsabhängig gefärbt */
  function cmpLine(m) {
    if (!m.cmp.length) return "";
    var c = m.cmp[0], ref = c[1];
    if (typeof ref !== "number" || !ref) return '<span class="cmp">' + c[0] + ": " + m.fmt(ref) + "</span>";
    var d = m.pp ? m.value - ref : (m.value - ref) / Math.abs(ref) * 100, good = m.invert ? d <= 0 : d >= 0;
    var amt = m.pp ? String(Math.round(Math.abs(d) * 10) / 10).replace(".", ",") + " Pp." : pctf(Math.abs(d));
    return '<span class="cmp ' + (Math.abs(d) < 1 ? "" : good ? "up" : "down") + '">' + (d >= 0 ? "▲ " : "▼ ") + amt + " ggü. " + c[0] + "</span>";
  }
  function tile(id) {
    var m = OS.metric(id), money = /umsatz|zahlung|db|ergebnis/.test(id);
    if (money && !OS.seesMoney()) return '<div class="card kpi kpi--locked"><div class="lbl">' + m.label + '</div><div class="val">—</div><div class="delta">keine Berechtigung</div></div>';
    if (money && P.can("finanzen") === "aggregiert") m.inputs = [];
    return '<button class="card kpi kpi--btn" data-metric="' + id + '"><span class="q q--' + m.q.level + '" title="Datenqualität">' + m.q.txt + '</span><div class="lbl">' + m.label + '</div><div class="val">' + m.fmt(m.value) + '</div><div class="delta">' + m.sub + "</div>" + cmpLine(m) + "</button>";
  }
  OS.drill = function (id) {
    var m = OS.metric(id), q = { demo: "Diese Zahl beruht auf Demo-Daten. Im Echtbetrieb wird sie aus der verbundenen Quelle berechnet.", missing: "Unvollständig: Eine benötigte Datenquelle ist noch nicht verbunden, Teile sind geschätzt. Die Zahl ist daher nur eine Orientierung.", ok: "Vollständig aus den verbundenen Daten berechnet." }[m.q.level];
    P.modal({ title: m.label, body: '<div class="drill__val">' + m.fmt(m.value) + '<small>' + esc(m.sub) + "</small></div>" +
      '<div class="note note--' + (m.q.level === "ok" ? "ok" : "warn") + '">' + icon("eye") + "<div>" + q + "</div></div>" +
      "<h4>So kommt die Zahl zustande</h4><p>" + esc(m.formula) + "</p>" +
      (m.inputs.length ? '<table class="tbl"><tbody>' + m.inputs.map(function (r) { return "<tr><td>" + esc(r[0]) + '</td><td class="num">' + esc(r[1]) + "</td></tr>"; }).join("") + "</tbody></table>" : "") +
      (m.cmp.length ? '<h4>Vergleich</h4><table class="tbl"><tbody>' + m.cmp.map(function (c) { var d = typeof c[1] === "number" && c[1] ? (m.pp ? m.value - c[1] : (m.value - c[1]) / Math.abs(c[1]) * 100) : null; return "<tr><td>" + esc(c[0]) + '</td><td class="num">' + m.fmt(c[1]) + '</td><td class="num">' + (d === null ? "" : (d >= 0 ? "+" : "−") + (m.pp ? String(Math.round(Math.abs(d) * 10) / 10).replace(".", ",") + " Pp." : pctf(Math.abs(d)))) + "</td></tr>"; }).join("") + "</tbody></table>" : "") +
      '<h4>Datenquelle</h4><p class="hint">' + esc(m.src) + "</p>",
      actions: [{ label: "Zum Modul", cls: "btn--ghost", fn: function () { location.hash = m.go; } }, { label: "Schließen", fn: function () {} }] });
  };

  // ------------------------------------------------------------ Automations-Engine
  /* Stufe 1 vollautomatisch, 2 Vorschlag mit Freigabe, 3 kontrollierte Autonomie */
  OS.AUTOMATIONS = [
    { id: "kpi", name: "Kennzahlen aktualisieren", trigger: "täglich 05:45 und nach jedem erfolgreichen Import", rule: "Import vollständig geprüft, keine offenen Konflikte in Pflichtfeldern", action: "Alle Kennzahlen neu berechnen, Zeitstempel setzen", control: "Plausibilitätsprüfung: Abweichung über 30 % zum Vortag erzeugt Warnung", level: 1, status: "aktiv", phase: 1 },
    { id: "import", name: "MediFox-Export übernehmen", trigger: "neue Exportdatei im Eingang (geplant täglich 05:30)", rule: "Pflichtspalten vorhanden, keine Duplikate, Datumsformat gültig", action: "Termine, Behandlungen, Ausfälle übernehmen; fehlerhafte Zeilen in die Klärungsliste", control: "Sync-Protokoll mit Zeilenzahl; Fehler über 2 % stoppen den Lauf und erzeugen eine Aufgabe", level: 1, status: "pausiert", reason: "Schnittstelle in Prüfung", phase: 1 },
    { id: "anfrage24", name: "Unbearbeitete Anfrage erinnern", trigger: "Anfrage seit 24 Std. im Status neu", rule: "keine Rückruf-Notiz vorhanden", action: "Erinnerung an Verwaltung, nach 48 Std. an Inhaber", control: "Anfrage wechselt Status oder Eskalation wird protokolliert", level: 1, status: "aktiv", phase: 3 },
    { id: "zuweisung", name: "Zuweisungsvorschlag für Warteliste", trigger: "neue Anfrage auf der Warteliste oder Absage eines Termins", rule: "Ort im Einsatzgebiet, passende Qualifikation, Kapazität frei", action: "Bester Therapeut und Tag vorschlagen (kürzester Umweg)", control: "Zuweisung erst nach Freigabe, Ergebnis im Protokoll", level: 2, status: "aktiv", phase: 3 },
    { id: "frist", name: "Verordnungsfristen überwachen", trigger: "täglich 06:00", rule: "Beginn-, Unterbrechungs- oder Ablauffrist in 7 Tagen", action: "Hinweis im Dashboard und Aufgabe an zuständige Therapeut:in", control: "Aufgabe erledigt oder Frist eingehalten", level: 1, status: "aktiv", phase: 3 },
    { id: "mahnung", name: "Zahlungserinnerung vorbereiten", trigger: "Rechnung 7 Tage nach Fälligkeit offen", rule: "kein Zahlungseingang, keine Kulanz-Notiz", action: "Erinnerung als PDF vorbereiten", control: "Versand nur nach Freigabe, Mahnstufe im Protokoll", level: 2, status: "aktiv", phase: 2 },
    { id: "bericht", name: "Wochenbericht an Inhaber", trigger: "montags 07:00", rule: "Kennzahlen der Vorwoche vollständig", action: "Bericht mit Umsatz, Auslastung, Warteliste, Auffälligkeiten erstellen", control: "Zustellung bestätigt; bei Fehler erneuter Versuch nach 1 Std.", level: 1, status: "fehler", reason: "E-Mail-Versand noch nicht eingerichtet", phase: 2 },
    { id: "beitrag", name: "KI-Beitrag veröffentlichen", trigger: "geplanter Termin erreicht", rule: "fachlich freigegeben, keine Hinweise aus dem Heilmittelwerbegesetz", action: "Beitrag auf der Website veröffentlichen", control: "Seite erreichbar, sonst zurück in Prüfung", level: 2, status: "aktiv", phase: 5 },
    { id: "partner", name: "Partner nachfassen", trigger: "vereinbarter Nachfass-Termin erreicht", rule: "Kooperation aktiv oder in Anbahnung", action: "Aufgabe mit Gesprächsnotizen anlegen", control: "Kontakt im CRM dokumentiert", level: 1, status: "geplant", phase: 5 },
    { id: "bewertung", name: "Bewertung anfragen", trigger: "Behandlungsserie abgeschlossen", rule: "Einwilligung zur Kontaktaufnahme liegt vor", action: "Nachricht mit Bewertungslink vorbereiten", control: "Versand nur nach Freigabe", level: 2, status: "geplant", phase: 5 }
  ];
  OS.AUTO_STATUS = { aktiv: ["aktiv", "good"], pausiert: ["pausiert", "warn"], fehler: ["fehlgeschlagen", "bad"], freigabe: ["Freigabe nötig", "info"], geplant: ["geplant", "plain"] };
  OS.autoState = function () { var s = store.get("autos", {}); return OS.AUTOMATIONS.map(function (a) { var o = Object.assign({}, a); if (s[a.id]) Object.assign(o, s[a.id]); return o; }); };
  OS.setAuto = function (id, patch) { var s = store.get("autos", {}); s[id] = Object.assign(s[id] || {}, patch); store.set("autos", s); };
  /* Freigaben (Stufe 2) */
  OS.approvals = function () {
    var done = store.get("approvals_done", {}), out = [];
    var autos = {}; OS.autoState().forEach(function (a) { autos[a.id] = a; });
    var canReq = P.can("nachfrage") === "voll", canFin = P.can("finanzen") === "voll", canMkt = P.can("marketing") === "voll";
    if (autos.zuweisung.status === "aktiv" && canReq) P.requests().filter(function (r) { return r.status === "warteliste" && P.TOWNS.indexOf(r.town) >= 0; }).forEach(function (r) {
      var b = P.bestSlots(r.town, 1)[0]; if (!b) return;
      var id = "zw-" + r.id + "-" + b.t + "-" + b.di; if (done[id]) return;
      var d = P.workdays(5)[b.di];
      out.push({ id: id, auto: "zuweisung", prio: r.since >= 7 ? "hoch" : "mittel", title: r.name + " → " + P.person(b.t).name, sub: r.topic + " · " + r.town + " · " + P.wd(d) + " " + P.dstr(d) + ", " + String(b.km).replace(".", ",") + " km Umweg", run: function () { P.planRequest(r.id, b); } });
    });
    if (autos.mahnung.status === "aktiv" && canFin) P.invoices().forEach(function (inv) {
      var st = P.invState(inv); if (st.days < 7 || inv.dun >= 3) return;
      var id = "mh-" + inv.no + "-" + inv.dun; if (done[id]) return;
      var p = P.patient(inv.pid);
      out.push({ id: id, auto: "mahnung", prio: st.days > 14 ? "hoch" : "mittel", title: ["Zahlungserinnerung", "1. Mahnung", "2. Mahnung"][inv.dun] + " " + inv.no, sub: (p ? p.full : "") + " · " + P.eur(inv.sum) + " · " + st.days + " Tage überfällig", run: function () { var l = P.invoices(); l.forEach(function (x) { if (x.no === inv.no) x.dun++; }); P.saveInvoices(l); P.pdf(l.filter(function (x) { return x.no === inv.no; })[0], inv.dun + 1); } });
    });
    (canMkt ? store.get("articles", []) || [] : []).filter(function (a) { return a.status === "pruefung"; }).forEach(function (a) {
      var id = "kb-" + a.id; if (done[id]) return;
      out.push({ id: id, auto: "beitrag", prio: "niedrig", title: "KI-Beitrag prüfen: " + a.title.split(":")[0], sub: "fachliche Freigabe vor dem Veröffentlichen", run: function () { location.hash = "studio/" + a.id; }, open: true });
    });
    return out;
  };
  P.badges.freigaben = function () { return OS.approvals().length; };
  P.badges.automationen = function () { return OS.autoState().filter(function (a) { return a.status === "fehler"; }).length; };
  P.badges.datenquellen = function () { return OS.syncLog().filter(function (x) { return x.err > 0 && !x.resolved; }).length; };

  // ------------------------------------------------------------ Diagramm: Umsatz, Zahlungseingang, Ziel
  function trendChart(M) {
    var W = 760, H = 250, L = 52, R = 14, T = 14, B = 28, max = Math.max.apply(null, M.map(function (m) { return Math.max(m.rev, m.pay); }).concat([OS.TARGET.revenue])) * 1.08;
    var x = function (i) { return L + i * (W - L - R) / (M.length - 1); }, y = function (v) { return H - B - v / max * (H - T - B); };
    var line = function (k) { return M.map(function (m, i) { return (i ? "L" : "M") + x(i).toFixed(1) + " " + y(m[k]).toFixed(1); }).join(" "); };
    var g = ""; for (var k = 0; k <= 4; k++) { var v = max / 4 * k; g += '<line class="grid-l" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '"/><text class="axis" x="' + (L - 8) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + Math.round(v / 1000) + " T€</text>"; }
    M.forEach(function (m, i) { if (i % 2 === 0 || i === M.length - 1) g += '<text class="axis" x="' + x(i) + '" y="' + (H - 8) + '" text-anchor="middle">' + m.label + "</text>"; });
    var last = M.length - 1;
    return '<div class="chart tchart"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Umsatz und Zahlungseingang der letzten 13 Monate">' + g +
      '<line class="tgt" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(OS.TARGET.revenue) + '" y2="' + y(OS.TARGET.revenue) + '"/>' +
      '<path class="ln ln--pay" d="' + line("pay") + '"/><path class="ln ln--rev" d="' + line("rev") + '"/>' +
      '<circle class="mk mk--rev" cx="' + x(last) + '" cy="' + y(M[last].rev) + '" r="4.5"/>' +
      M.map(function (m, i) { return '<rect class="hitc" x="' + (x(i) - 15) + '" y="0" width="30" height="' + H + '" data-i="' + i + '"/>'; }).join("") +
      '</svg><div class="tip"></div></div><div class="legend"><span><i style="background:var(--navy)"></i>Umsatz (erbracht)</span><span><i style="background:#46b2d0"></i>Zahlungseingang</span><span><i style="background:repeating-linear-gradient(90deg,#80c53f 0 6px,transparent 6px 10px)"></i>Ziel ' + eur0(OS.TARGET.revenue) + '</span><span class="q q--demo">Demo-Daten</span></div>';
  }
  function bindChart(M) {
    var el = $(".tchart"); if (!el) return; var tip = $(".tip", el), svg = $("svg", el);
    $$(".hitc", el).forEach(function (h) {
      h.addEventListener("mouseenter", function () {
        var m = M[+h.dataset.i], r = svg.getBoundingClientRect(), bx = h.getBBox();
        tip.innerHTML = "<b>" + m.label + "</b><br>Umsatz " + eur0(m.rev) + "<br>Zahlungseingang " + eur0(m.pay) + (OS.seesMoney() && P.can("finanzen") === "voll" ? "<br>Ergebnis " + eur0(m.result) : "");
        tip.style.left = ((bx.x + 15) / 760 * r.width) + "px"; tip.style.top = "30%"; tip.style.opacity = 1;
      });
      h.addEventListener("mouseleave", function () { tip.style.opacity = 0; });
    });
  }

  // ------------------------------------------------------------ Dashboard
  P.TITLES.dashboard = [function () { return "Mobile Physiotherapie Oehlke"; }, function () { return "Unternehmensübersicht · " + P.today.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }); }];
  var SETS = { heute: ["umsatz", "kapazitaet", "therapeuten", "aufgaben"], woche: ["auslastung", "freie", "fahrzeit", "warteliste"], monat: ["umsatz", "zahlung", "db", "ergebnis"] };
  function prioOf(a) { return a.sev === "bad" ? "hoch" : a.sev === "warn" ? "mittel" : "niedrig"; }
  V.dashboard = function () {
    var per = V.dashboard.per || "heute", role = OS.role();
    var set = SETS[per].slice(0);
    if (role === "therapeut") set = ["hausbesuche", "auslastung", "fahrzeit", "aufgaben"];
    var me = OS.ME[role] && P.person(OS.ME[role]);
    var acts = P.actions().filter(function (a) {
      if (a.ico === "euro" && P.can("finanzen") !== "voll") return false;
      if (a.ico === "spark" && P.can("marketing") !== "voll") return false;
      if (a.ico === "inbox" && P.can("nachfrage") !== "voll") return false;
      if (role === "therapeut") return me && (a.s + a.t).indexOf(me.name) >= 0;
      return true;
    }).map(function (a) { return { t: a.t, s: a.s, prio: prioOf(a), btn: a.btn }; });
    OS.approvals().slice(0, 3).forEach(function (f) { acts.unshift({ t: "Freigabe: " + f.title, s: f.sub, prio: f.prio, btn: ["Prüfen", "#freigaben"] }); });
    if (P.can("auto") === "voll") OS.autoState().filter(function (a) { return a.status === "fehler"; }).forEach(function (a) { acts.unshift({ t: "Automation fehlgeschlagen: " + a.name, s: a.reason || "", prio: "hoch", btn: ["Ansehen", "#automationen"] }); });
    var rank = { hoch: 0, mittel: 1, niedrig: 2 }; acts.sort(function (a, b) { return rank[a.prio] - rank[b.prio]; });
    V.dashboard._acts = acts;
    var M = OS.months(), mf = OS.lastSync("medifox");
    var srcRows = OS.SOURCES.slice(0, 4).map(function (s) { var l = OS.lastSync(s.id), st = OS.STATUS[s.status]; return '<li><span class="dot dot--' + st[1] + '"></span><div class="t">' + s.name + "<small>" + st[0] + (l ? " · " + OS.ago(l.ts) + (l.err ? " · " + l.err + " Klärungsfälle" : "") : "") + "</small></div></li>"; }).join("");
    return '<div class="dash-head"><div class="seg">' + [["heute", "Heute"], ["woche", "Diese Woche"], ["monat", "Dieser Monat"]].map(function (s) { return '<button data-per="' + s[0] + '" class="' + (per === s[0] ? "on" : "") + '">' + s[1] + "</button>"; }).join("") + '</div><span class="datastate">' + icon("eye") + "Datenstand: " + (mf ? OS.ago(mf.ts) : "–") + ' · <b>Demo-Daten</b>, MediFox-Schnittstelle in Prüfung</span></div>' +
      '<div class="grid g4">' + set.map(tile).join("") + "</div>" +
      '<div class="grid g-21" style="margin-top:18px"><div class="stack"><div class="card"><div class="card__head"><div><h3>Handlungsbedarf</h3><p class="hint">nach Priorität, aus allen Modulen und Automationen</p></div><a class="btn btn--ghost btn--sm" href="#freigaben">Alle Freigaben</a></div>' +
      (acts.length ? '<ul class="actions">' + acts.slice(0, 6).map(function (a, i) { return '<li class="act act--' + (a.prio === "hoch" ? "bad" : a.prio === "mittel" ? "warn" : "info") + '"><span class="prio prio--' + a.prio + '">' + a.prio + '</span><div class="t">' + esc(a.t) + "<small>" + esc(a.s) + "</small></div>" + (a.btn ? '<button class="btn btn--sm btn--ghost" data-dact="' + i + '">' + a.btn[0] + "</button>" : "") + "</li>"; }).join("") + "</ul>" : P.empty("Nichts offen", "Gerade braucht nichts Ihre Aufmerksamkeit.")) + "</div>" +
      (OS.seesMoney() && P.can("finanzen") !== "kein" && role !== "therapeut" ? '<div class="card fill"><div class="card__head"><div><h3>Umsatzentwicklung</h3><p class="hint">letzte 13 Monate · Umsatz ist nicht Zahlungseingang und nicht Gewinn</p></div><a class="btn btn--ghost btn--sm" href="#controlling">Controlling</a></div>' + trendChart(M) + "</div>" : '<div class="card fill"><h3>Umsatzentwicklung</h3>' + P.empty("Keine Berechtigung", "Finanzzahlen sind für diese Rolle nicht freigegeben.") + "</div>") + "</div>" +
      '<div class="stack"><div class="card"><div class="card__head"><div><h3>Prognose Monatsende</h3><p class="hint">Umsatz, mit offengelegten Annahmen</p></div></div>' + (OS.seesMoney() ? forecastBox(M) : P.empty("Keine Berechtigung", "")) + "</div>" +
      '<div class="card fill"><div class="card__head"><div><h3>Datenabgleich</h3><p class="hint">letzter Stand je Quelle</p></div><a class="btn btn--ghost btn--sm" href="#datenquellen">Details</a></div><ul class="list srclist">' + srcRows + "</ul></div></div></div>";
  };
  function forecastBox(M) {
    var cur = M[12], mtd = OS.mtd(), done = cur.rev * mtd.share, rest = cur.rev - done;
    var sc = [["konservativ", done + rest * 0.88], ["realistisch", cur.rev], ["optimistisch", done + rest * 1.06]];
    return '<div class="fc">' + sc.map(function (s) { return '<div class="fc__s' + (s[0] === "realistisch" ? " on" : "") + '"><span>' + s[0] + "</span><b>" + eur0(s[1]) + "</b><small>" + (s[1] >= OS.TARGET.revenue ? "Ziel erreicht" : Math.round(s[1] / OS.TARGET.revenue * 100) + " % vom Ziel") + "</small></div>"; }).join("") + "</div>" +
      '<details class="assume"><summary>Annahmen anzeigen</summary><ul><li>Bisher erbracht: ' + eur0(done) + " (" + mtd.done + " von " + mtd.all + " Werktagen)</li><li>Restliche Werktage wie geplant, Ausfallquote " + Math.round(P.TEAM.reduce(function (s, t) { return s + t.ausfall; }, 0) / P.TEAM.length) + " %</li><li>konservativ: 12 % weniger als geplant, optimistisch: 6 % mehr</li><li>Durchschnittserlös je Hausbesuch laut Preisliste</li><li>Grundlage Demo-Daten, keine verbundene Quelle</li></ul></details>";
  }
  V.dashboard.after = function () {
    $$("[data-per]").forEach(function (b) { b.onclick = function () { V.dashboard.per = b.dataset.per; P.rerender(); }; });
    $$("[data-metric]").forEach(function (b) { b.onclick = function () { OS.drill(b.dataset.metric); }; });
    $$("[data-dact]").forEach(function (b) { b.onclick = function () { var a = V.dashboard._acts[+b.dataset.dact].btn[1]; if (typeof a === "function") a(); else location.hash = a; }; });
    bindChart(OS.months());
  };

  // ------------------------------------------------------------ Automationen
  P.TITLES.automationen = ["Automationen", "Jede Automation: Auslöser, Regel, Aktion, Kontrolle. Stufe 1 läuft allein, Stufe 2 braucht eine Freigabe."];
  V.automationen = function () {
    var A = OS.autoState(), lv = { 1: "Stufe 1 · automatisch", 2: "Stufe 2 · mit Freigabe", 3: "Stufe 3 · kontrolliert autonom" };
    return '<div class="grid g4">' + P.kpi("Aktiv", A.filter(function (a) { return a.status === "aktiv"; }).length, "laufen nach Plan", "bolt") + P.kpi("Pausiert", A.filter(function (a) { return a.status === "pausiert"; }).length, "bewusst angehalten", "cal") + P.kpi("Fehlgeschlagen", A.filter(function (a) { return a.status === "fehler"; }).length, "brauchen Aufmerksamkeit", "eye") + P.kpi("Freigaben offen", OS.approvals().length, '<a href="#freigaben">jetzt prüfen →</a>', "check") + "</div>" +
      '<div class="autos">' + A.map(function (a) {
        var st = OS.AUTO_STATUS[a.status], editable = P.can("auto") === "voll" && a.status !== "geplant";
        return '<div class="card auto auto--' + a.status + '"><div class="card__head"><div><h3>' + esc(a.name) + '</h3><p class="hint">' + lv[a.level] + " · Phase " + a.phase + '</p></div><span class="pill pill--' + st[1] + '">' + st[0] + "</span></div>" +
          '<dl class="arule"><dt>Auslöser</dt><dd>' + esc(a.trigger) + "</dd><dt>Regel</dt><dd>" + esc(a.rule) + "</dd><dt>Aktion</dt><dd>" + esc(a.action) + "</dd><dt>Kontrolle</dt><dd>" + esc(a.control) + "</dd></dl>" +
          (a.reason ? '<p class="note note--' + (a.status === "fehler" ? "bad" : "warn") + '">' + esc(a.reason) + "</p>" : "") +
          (editable ? '<div class="btns-h" style="justify-content:flex-start">' + (a.status === "aktiv" ? '<button class="btn btn--sm btn--ghost" data-pause="' + a.id + '">Pausieren</button>' : '<button class="btn btn--sm" data-resume="' + a.id + '">' + (a.status === "fehler" ? "Erneut versuchen" : "Fortsetzen") + "</button>") + '<button class="btn btn--sm btn--ghost" data-runlog="' + a.id + '">Protokoll</button></div>' : "") + "</div>";
      }).join("") + "</div>";
  };
  V.automationen.after = function () {
    $$("[data-pause]").forEach(function (b) { b.onclick = function () { OS.setAuto(b.dataset.pause, { status: "pausiert", reason: "manuell pausiert" }); OS.audit("Automation pausiert", b.dataset.pause); P.rerender(); P.toast("Automation pausiert", function () { OS.setAuto(b.dataset.pause, { status: "aktiv", reason: "" }); P.rerender(); }); }; });
    $$("[data-resume]").forEach(function (b) { b.onclick = function () {
      var a = OS.autoState().filter(function (x) { return x.id === b.dataset.resume; })[0];
      if (a.id === "import") { P.toast("Erst möglich, wenn die MediFox-Schnittstelle geklärt ist"); return; }
      if (a.status === "fehler") { OS.audit("Automation erneut versucht", a.name, "warn"); P.toast("Erneuter Versuch fehlgeschlagen: " + a.reason); return; }
      OS.setAuto(a.id, { status: "aktiv", reason: "" }); OS.audit("Automation fortgesetzt", a.name); P.rerender();
    }; });
    $$("[data-runlog]").forEach(function (b) { b.onclick = function () { var l = store.get("audit", []).filter(function (x) { return x.detail === b.dataset.runlog || x.detail.indexOf(b.dataset.runlog) >= 0; }); location.hash = "protokoll"; }; });
  };

  // ------------------------------------------------------------ Freigaben
  P.TITLES.freigaben = ["Freigaben", "Vorschläge der Automationen (Stufe 2): erst nach Ihrer Bestätigung wird etwas ausgeführt"];
  V.freigaben = function () {
    var F = OS.approvals(); V.freigaben._F = F;
    return '<div class="card"><div class="card__head"><div><h3>Offene Freigaben</h3><p class="hint">jede Entscheidung wird im Protokoll festgehalten</p></div></div>' +
      (F.length ? '<ul class="actions">' + F.map(function (f, i) { return '<li class="act act--' + (f.prio === "hoch" ? "bad" : f.prio === "mittel" ? "warn" : "info") + '"><span class="prio prio--' + f.prio + '">' + f.prio + '</span><div class="t">' + esc(f.title) + "<small>" + esc(f.sub) + " · aus „" + esc(OS.AUTOMATIONS.filter(function (a) { return a.id === f.auto; })[0].name) + '“</small></div><div class="btns-h">' + (f.open ? '<button class="btn btn--sm" data-ok="' + i + '">Öffnen</button>' : '<button class="btn btn--sm btn--lime" data-ok="' + i + '">Freigeben</button><button class="btn btn--sm btn--ghost" data-no="' + i + '">Ablehnen</button>') + "</div></li>"; }).join("") + "</ul>" : P.empty("Keine offenen Freigaben", "Neue Vorschläge erscheinen hier automatisch.")) + "</div>";
  };
  V.freigaben.after = function () {
    var F = V.freigaben._F;
    function mark(f, how) { var d = store.get("approvals_done", {}); d[f.id] = how; store.set("approvals_done", d); OS.audit(how === "ok" ? "Freigabe erteilt" : "Freigabe abgelehnt", f.title, how === "ok" ? "good" : "warn"); }
    $$("[data-ok]").forEach(function (b) { b.onclick = function () { var f = F[+b.dataset.ok]; if (!f.open) mark(f, "ok"); f.run(); if (!f.open) P.rerender(); }; });
    $$("[data-no]").forEach(function (b) { b.onclick = function () { var f = F[+b.dataset.no]; mark(f, "no"); P.rerender(); P.toast("Vorschlag abgelehnt", function () { var d = store.get("approvals_done", {}); delete d[f.id]; store.set("approvals_done", d); P.rerender(); }); }; });
  };

  // ------------------------------------------------------------ Datenquellen
  P.TITLES.datenquellen = ["Datenquellen & Synchronisierung", "Woher jede Zahl kommt, wie aktuell sie ist und wo es hakt"];
  V.datenquellen = function () {
    var L = OS.syncLog().slice().sort(function (a, b) { return b.ts - a.ts; });
    return '<div class="note note--warn">' + icon("eye") + '<div><b>MediFox DAN bleibt das führende System</b> für Patienten, Termine, Dokumentation und Abrechnung. Das Business OS liest nur, schreibt nichts zurück. Ob es eine offizielle Schnittstelle gibt, wird geprüft. Bis dahin: Demo-Daten und Test des Datei-Imports.</div></div>' +
      '<div class="grid g2">' + OS.SOURCES.map(function (s) { var st = OS.STATUS[s.status], l = OS.lastSync(s.id); return '<div class="card src"><div class="card__head"><div><h3>' + s.name + '</h3><p class="hint">' + esc(s.role) + '</p></div><span class="pill pill--' + st[1] + '">' + st[0] + '</span></div><div class="kw-chips">' + s.domains.map(function (d) { return "<button disabled>" + d + "</button>"; }).join("") + '</div><p class="hint" style="margin:12px 0 0">' + esc(s.note) + (l ? "<br>Letzter Lauf: " + OS.ago(l.ts) + ", " + l.ok + " Datensätze" + (l.err ? ", " + l.err + " Klärungsfälle" : "") : "") + "</p></div>"; }).join("") + "</div>" +
      '<div class="grid g-12" style="margin-top:18px"><div class="card"><h3>Datei-Import testen</h3><p class="hint">So wird ein MediFox-Export geprüft, bevor er übernommen wird: Pflichtspalten, Datumsformat, PLZ, Duplikate. Nichts wird gespeichert.</p><label class="btn btn--sm" style="margin-bottom:10px"><input type="file" id="csvIn" accept=".csv,text/csv" hidden>' + icon("dl") + ' CSV auswählen</label> <button class="btn btn--sm btn--ghost" id="csvDemo">Beispieldatei prüfen</button> <button class="btn btn--sm btn--ghost" id="csvTpl">Vorlage herunterladen</button><div id="csvOut"></div></div>' +
      '<div class="card"><h3>Sync-Protokoll</h3><p class="hint">jeder Lauf mit Zeilenzahl, Fehlern und Status</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Zeit</th><th>Quelle</th><th>Lauf</th><th class="num">ok</th><th class="num">Fehler</th><th>Status</th><th></th></tr></thead><tbody>' +
      L.map(function (x, i) { var s = OS.SOURCES.filter(function (q) { return q.id === x.src; })[0]; return "<tr><td>" + OS.ago(x.ts) + "</td><td>" + (s ? s.name.split(" (")[0] : x.src) + "</td><td>" + esc(x.kind) + (x.msg ? '<small class="sub">' + esc(x.msg) + "</small>" : "") + '</td><td class="num">' + x.ok + '</td><td class="num">' + x.err + '</td><td><span class="pill pill--' + (x.resolved ? "good" : x.err ? "warn" : "good") + '">' + (x.resolved ? "geklärt" : x.status) + '</span></td><td class="num">' + (x.err && !x.resolved ? '<button class="btn btn--sm btn--ghost" data-fix="' + i + '">Als geklärt markieren</button>' : "") + "</td></tr>"; }).join("") + "</tbody></table></div></div></div>";
  };
  function showCsv(res, name) {
    var o = $("#csvOut");
    if (res.error) { o.innerHTML = '<p class="note note--bad">' + res.error + "</p>"; return; }
    o.innerHTML = '<div class="note note--' + (res.missing.length || res.errors.length ? "warn" : "ok") + '"><div><b>' + esc(name) + ":</b> " + res.total + " Zeilen, " + res.ok + " gültig, " + res.errors.length + " fehlerhaft" + (res.dup ? " (davon " + res.dup + " Duplikate)" : "") + (res.missing.length ? "<br>Fehlende Spalten: " + res.missing.join(", ") : "") + "</div></div>" +
      (res.errors.length ? '<table class="tbl"><thead><tr><th>Zeile</th><th>Problem</th></tr></thead><tbody>' + res.errors.slice(0, 8).map(function (e) { return "<tr><td>" + e.line + "</td><td>" + esc(e.msg) + "</td></tr>"; }).join("") + "</tbody></table>" : "") +
      '<p class="hint" style="margin-top:10px">Im Echtbetrieb: gültige Zeilen werden übernommen, fehlerhafte landen in der Klärungsliste. Liegt die Fehlerquote über 2 %, stoppt der Lauf.</p>';
    var log = OS.syncLog(); log.push({ ts: Date.now(), src: "medifox", kind: "Testimport " + name, rows: res.total, ok: res.ok, err: res.errors.length, status: res.errors.length ? "teilweise" : "ok", msg: "nur geprüft, nicht übernommen" }); store.set("synclog", log);
    OS.audit("Import geprüft", name + ": " + res.ok + "/" + res.total + " gültig");
  }
  V.datenquellen.after = function () {
    $("#csvIn").onchange = function () { var f = this.files[0]; if (!f) return; var r = new FileReader(); r.onload = function () { showCsv(OS.validateCsv(r.result), f.name); }; r.readAsText(f, "utf-8"); };
    $("#csvDemo").onclick = function () { showCsv(OS.validateCsv(OS.SAMPLE_CSV), "beispiel-termine.csv"); };
    $("#csvTpl").onclick = function () { var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([OS.IMPORT_COLS.join(";") + "\n"], { type: "text/csv" })); a.download = "vorlage-termine.csv"; a.click(); };
    var L = OS.syncLog().slice().sort(function (a, b) { return b.ts - a.ts; });
    $$("[data-fix]").forEach(function (b) { b.onclick = function () { var x = L[+b.dataset.fix], all = OS.syncLog(); all.forEach(function (y) { if (y.ts === x.ts) y.resolved = true; }); store.set("synclog", all); OS.audit("Klärungsfälle erledigt", x.kind, "good"); P.rerender(); }; });
  };

  // ------------------------------------------------------------ Rollen & Rechte
  P.TITLES.rechte = ["Rollen & Rechte", "Wer was sehen und ändern darf. Granular je Modul, Gehälter getrennt."];
  V.rechte = function () {
    var areas = P.MODULES.map(function (m) { return [m.id, m.name]; }).concat([["gehaelter", "Gehälter einzelner Mitarbeiter:innen"]]);
    var cls = { voll: "good", lesen: "info", eigene: "info", aggregiert: "warn", kein: "plain" };
    return '<div class="card"><div class="card__head"><div><h3>Berechtigungen je Rolle</h3><p class="hint">voll = sehen und ändern · lesen · eigene = nur eigene Daten · zusammengefasst = Summen ohne Einzelwerte · kein Zugriff</p></div></div><div class="tbl-wrap"><table class="tbl perm"><thead><tr><th>Bereich</th>' + OS.ROLES.map(function (r) { return "<th>" + r.name + "</th>"; }).join("") + "</tr></thead><tbody>" +
      areas.map(function (a) { return "<tr><td>" + a[1] + "</td>" + OS.ROLES.map(function (r) { var v = OS.PERM[r.id][a[0]]; return '<td><span class="pill pill--' + cls[v] + ' pill--plain">' + { voll: "voll", lesen: "lesen", eigene: "eigene", aggregiert: "zusammengefasst", kein: "–" }[v] + "</span></td>"; }).join("") + "</tr>"; }).join("") + "</tbody></table></div></div>" +
      '<div class="grid g2" style="margin-top:18px"><div class="card"><h3>Rollen</h3><ul class="list">' + OS.ROLES.map(function (r) { return '<li><div class="t"><b>' + r.name + "</b><small>" + r.desc + "</small></div>" + (OS.role() === r.id ? '<span class="pill pill--good">aktuelle Ansicht</span>' : '<button class="btn btn--sm btn--ghost" data-role="' + r.id + '">Ansicht testen</button>') + "</li>"; }).join("") + '</ul></div><div class="card fill"><h3>Sicherheit im Echtbetrieb</h3><ul class="rules"><li><b>Anmeldung</b> mit persönlichem Konto und Zwei-Faktor-Bestätigung</li><li><b>Rechte</b> werden im Server geprüft, nicht nur in der Oberfläche</li><li><b>Protokoll</b> jeder Änderung und jedes Zugriffs auf Finanzen</li><li><b>Externe</b> erhalten zeitlich begrenzte, nur lesende Zugänge</li><li><b>Patientendaten</b> nur pseudonymisiert (Kennung, PLZ, Leistung), keine Diagnosen im Business OS</li></ul><p class="hint" style="margin-top:12px">Demo: Die Anmeldung schützt hier noch nichts. Die Ansicht je Rolle lässt sich oben rechts umschalten.</p></div></div>';
  };
  V.rechte.after = function () { $$("[data-role]").forEach(function (b) { b.onclick = function () { OS.switchRole(b.dataset.role); }; }); };
  OS.switchRole = function (r) { store.set("role", r); OS.audit("Ansicht gewechselt", "Rolle: " + OS.ROLES.filter(function (x) { return x.id === r; })[0].name); P.toast("Ansicht: " + OS.ROLES.filter(function (x) { return x.id === r; })[0].name); var m = P.moduleOf(P.route().view); if (m && P.can(m.id) === "kein") location.hash = r === "extern" ? "prognosen" : "dashboard"; P.render(); };

  // ------------------------------------------------------------ Protokoll
  P.TITLES.protokoll = ["Protokoll", "Wer hat wann was getan: Freigaben, Automationen, Importe, Rollenwechsel"];
  V.protokoll = function () {
    var L = store.get("audit", []);
    return '<div class="card"><div class="card__head"><div><h3>Protokoll</h3><p class="hint">die letzten ' + L.length + ' Einträge in diesem Browser · im Echtbetrieb unveränderbar auf dem Server</p></div><button class="btn btn--sm btn--ghost" id="auditCsv">' + icon("dl") + " Export (CSV)</button></div>" +
      (L.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Zeit</th><th>Rolle</th><th>Aktion</th><th>Details</th></tr></thead><tbody>' + L.map(function (x) { var d = new Date(x.ts); return "<tr><td>" + P.dstr(d) + " " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + "</td><td>" + (OS.ROLES.filter(function (r) { return r.id === x.role; })[0] || { name: x.role }).name + '</td><td><span class="dot dot--' + x.kind + '"></span> ' + esc(x.action) + "</td><td>" + esc(x.detail) + "</td></tr>"; }).join("") + "</tbody></table></div>" : P.empty("Noch keine Einträge", "Freigaben, Importe und Änderungen an Automationen erscheinen hier.")) + "</div>";
  };
  V.protokoll.after = function () {
    $("#auditCsv").onclick = function () { var L = store.get("audit", []), csv = "zeit;rolle;aktion;details\n" + L.map(function (x) { return [new Date(x.ts).toISOString(), x.role, x.action, x.detail].map(function (v) { return '"' + String(v).replace(/"/g, '""') + '"'; }).join(";"); }).join("\n"); var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = "protokoll.csv"; a.click(); };
  };

  // ------------------------------------------------------------ Module späterer Phasen (Platzhalter mit Plan)
  OS.PHASES = {
    2: { name: "Dashboard und Controlling", ziel: "Umsatz, Zahlungseingang, Kosten, Deckungsbeitrag und Ergebnis getrennt und nachvollziehbar" },
    3: { name: "Patientenanfragen und Personalplanung", ziel: "Anfragen gehen nicht verloren, Kapazität und Einstellungsbedarf sind sichtbar" },
    4: { name: "Tourenoptimierung", ziel: "weniger Fahrzeit, mehr Behandlungszeit" },
    5: { name: "Marketing und Partner-CRM", ziel: "messen, welche Kanäle und Partner Patient:innen bringen" },
    6: { name: "Erweiterte KI und Unternehmensplanung", ziel: "Prognosen, Szenarien, Empfehlungen, kontrollierte autonome Abläufe" }
  };
  function phaseView(ph, items, accept, extra) {
    var p = OS.PHASES[ph];
    return '<div class="card phase"><div class="card__head"><div><span class="pill pill--info">Phase ' + ph + " · " + p.name + "</span><h3 style=\"margin-top:10px\">Ziel: " + p.ziel + '</h3><p class="hint">Dieses Modul wird nach dem Fundament gebaut. So ist es geplant:</p></div></div>' +
      '<div class="grid g2"><div><h4 class="sub-h">Funktionen</h4><ul class="rules">' + items.map(function (i) { return "<li>" + i + "</li>"; }).join("") + '</ul></div><div><h4 class="sub-h">Abnahmekriterien</h4><ul class="checks">' + accept.map(function (a) { return '<li class="w"><span class="st">○</span><div>' + a + "</div></li>"; }).join("") + "</ul></div></div>" + (extra || "") + "</div>";
  }
  P.TITLES.controlling = ["Controlling & Finanzen", "Umsatz, Zahlungseingang, Kosten, Deckungsbeitrag, Liquidität"];
  V.controlling = function () {
    var M = OS.months().slice(-6), full = P.can("finanzen") === "voll";
    if (!OS.seesMoney()) return P.empty("Keine Berechtigung", "");
    return phaseView(2, ["Umsatz nach Leistungsdatum, getrennt von Zahlungseingang und Forderungen", "Direkte Kosten und Gemeinkosten nach einheitlichen, dokumentierten Regeln (Personalkosten nur einmal)", "Deckungsbeitrag je Therapeut:in, Leistung, Region und Kostenträger", "Liquiditätsvorschau 13 Wochen", "Zielwerte und Abweichungen mit Ursache"],
      ["Jede Zahl lässt sich bis zur Quelle zurückverfolgen", "Umsatz, Zahlungseingang, Kosten und Ergebnis sind getrennt und stimmen mit der Buchhaltung überein (Abweichung unter 1 %)", "Unvollständige Monate sind gekennzeichnet", "Teamleitung sieht nur Summen, keine Gehälter"],
      '<h4 class="sub-h">Vorschau mit Demo-Daten</h4><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Monat</th><th class="num">Umsatz</th><th class="num">Zahlungseingang</th>' + (full ? '<th class="num">Direkte Kosten</th><th class="num">Deckungsbeitrag</th><th class="num">Gemeinkosten</th><th class="num">Ergebnis</th>' : "") + "</tr></thead><tbody>" + M.map(function (m, i) { return "<tr><td>" + m.label + (i === M.length - 1 ? ' <span class="pill pill--warn">läuft</span>' : "") + '</td><td class="num">' + eur0(m.rev) + '</td><td class="num">' + eur0(m.pay) + "</td>" + (full ? '<td class="num">' + eur0(m.direct) + '</td><td class="num">' + eur0(m.db) + '</td><td class="num">' + eur0(m.overhead) + '</td><td class="num"><b>' + eur0(m.result) + "</b></td>" : "") + "</tr>"; }).join("") + '</tbody></table></div><p class="hint" style="margin-top:10px">Ergebnis vor Steuern und ohne Unternehmerlohn. Kosten geschätzt, bis die Buchhaltung angebunden ist.</p>');
  };
  P.TITLES.kapazitaet = ["Kapazität & Einstellungen", "Auslastung nachvollziehbar berechnen, Personalbedarf früh erkennen"];
  V.kapazitaet = function () {
    var cap = OS.capacity(), wait = P.requests().filter(function (r) { return r.status === "warteliste" || r.status === "neu"; }).length;
    var rows = cap.rows.map(function (r) { var f = function (v) { return String(Math.round(v * 10) / 10).replace(".", ","); }; return "<tr><td>" + P.who(r.t) + '</td><td class="num">' + r.hours + '</td><td class="num">' + f(r.lead) + '</td><td class="num">' + f(r.doku) + '</td><td class="num">' + f(r.pause) + '</td><td class="num">' + f(r.drive) + '</td><td class="num"><b>' + f(r.net) + '</b></td><td class="num">' + f(r.treat) + '</td><td class="num"><span class="pill pill--' + (r.util > 92 ? "bad" : r.util >= 75 ? "good" : "warn") + '">' + Math.round(r.util) + " %</span></td></tr>"; }).join("");
    var hireRev = 22 * 4.33 * 0.92 * (P.price("KG") + P.price("HB") + 4), hireCost = 4600;
    return phaseView(3, ["Arbeitszeitmodelle mit Leitungs-, Dokumentations- und Fahrtanteil", "Auslastung je Person und Woche, 4 bis 12 Wochen voraus", "Abwesenheiten und geplante Änderungen (Eintritt, Stundenänderung)", "Einstellungsrechner: Nachfrage, Umsatz, Kosten, Deckungsbeitrag", "Warnung, wenn Warteliste wächst und Auslastung dauerhaft über Ziel liegt"],
      ["Auslastung je Person bis zur einzelnen Stunde nachvollziehbar", "Engpass wird mindestens 4 Wochen vorher angezeigt", "Einstellungsrechner legt alle Annahmen offen", "Therapeut:innen sehen nur ihre eigenen Werte"],
      '<h4 class="sub-h">Vorschau: nächste 5 Werktage (Demo-Daten)</h4><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Person</th><th class="num">Vertrag</th><th class="num">Leitung</th><th class="num">Doku/Orga</th><th class="num">Pausen</th><th class="num">Fahrt</th><th class="num">Netto</th><th class="num">geplant</th><th class="num">Auslastung</th></tr></thead><tbody>' + rows + '</tbody></table></div><p class="hint" style="margin-top:8px">Stunden pro Woche. Auslastung = geplante Behandlungsstunden ÷ Netto.</p>' +
      (P.can("gehaelter") === "voll" ? '<div class="note note--ok" style="margin-top:14px"><div><b>Einstellungsrechner (Beispiel, Vollzeit):</b> ca. 22 Behandlungen/Woche bei 8 % Ausfall ≈ ' + eur0(hireRev) + " Umsatz/Monat, Arbeitgeberkosten ≈ " + eur0(hireCost) + ", Deckungsbeitrag ≈ " + eur0(hireRev - hireCost) + "/Monat nach Einarbeitung. Aktuell " + wait + " Anfragen offen, Auslastung " + Math.round(cap.util) + " %.</div></div>" : ""));
  };
  P.TITLES.marketing = ["Marketing & Wachstum", "Welche Kanäle bringen wirklich Patient:innen"];
  V.marketing = function () {
    return phaseView(5, ["Anfragen, Erstgespräche und gewonnene Patient:innen je Kanal (Website, Google, Ärzte, Partner, Empfehlung)", "Kosten je Kanal und Kosten pro Neupatient:in", "Search Console, Web-Statistik, Google-Profil und Bewertungen", "Hinweis bei auffälligen Veränderungen, z. B. viele Klicks, wenig Anfragen", "Beiträge und Budgetänderungen nur mit Freigabe"],
      ["Jede Anfrage hat eine Quelle", "Kosten pro Neupatient:in je Kanal monatlich berechnet", "Datenschutzkonforme Messung ohne Cookie-Zwang geprüft"],
      '<p class="hint" style="margin-top:12px">Bereits als Prototyp nutzbar: <a href="#beitraege">Beiträge mit KI</a>, <a href="#analyse">SEO-Analyse</a>, <a href="#rankings">Rankings</a>, <a href="#besucher">Besucher</a>.</p>');
  };
  P.TITLES.partner = ["Partner & Zuweiser", "Pflegedienste, Kliniken, Arztpraxen: Kontakte, Vereinbarungen, Ergebnisse"];
  V.partner = function () {
    return phaseView(5, ["Organisation, Ansprechpartner:in, Zuständigkeit, Kontaktdaten", "Letzter Kontakt, nächster Schritt, Gespräche und Vereinbarungen", "Anfragen je Partner, soweit sauber messbar", "Automatische Erinnerung an Nachfass-Termine", "Monatsübersicht: welche Partner Anfragen bringen"],
      ["Keine Patientendaten im CRM", "Jeder Partner hat einen nächsten Schritt mit Datum", "Monatsauswertung entsteht automatisch"]);
  };
  P.TITLES.prognosen = ["Berichte & Prognosen", "Was voraussichtlich passiert, mit offengelegten Annahmen"];
  V.prognosen = function () {
    return phaseView(6, ["Umsatz bis Monatsende und Folgemonate (konservativ, realistisch, optimistisch)", "Auslastung 4 bis 12 Wochen, Personalbedarf je Region", "Entwicklung der Warteliste", "Szenarien: Neueinstellung, Arbeitszeitänderung, neue Region, bessere Touren", "Wochen- und Monatsberichte in verständlicher Sprache"],
      ["Jede Prognose zeigt ihre Annahmen", "Abweichung Prognose zu Ist wird gemessen und angezeigt", "Unvollständige Daten werden als solche ausgewiesen statt scheinbar genau gerechnet"],
      '<p class="hint" style="margin-top:12px">Erste Monatsprognose mit Szenarien steht bereits im <a href="#dashboard">Dashboard</a>.</p>');
  };

  // ------------------------------------------------------------ Rollen-Umschalter oben rechts
  P.afterRender = function () {
    var m = P.moduleOf((P.TITLES[P.route().view] && P.TITLES[P.route().view].nav) || P.route().view), lvl = m ? P.can(m.id) : "voll";
    if (m && (lvl === "eigene" || lvl === "lesen" || lvl === "aggregiert") && !$(".rights-note")) $("#view").insertAdjacentHTML("afterbegin", '<div class="note note--warn rights-note">' + icon("eye") + "<div><b>Ansicht " + OS.ROLES.filter(function (r) { return r.id === OS.role(); })[0].name + ":</b> " + { eigene: "nur eigene Daten", lesen: "nur lesen", aggregiert: "nur zusammengefasste Werte" }[lvl] + ". Im Prototyp ist das in Dashboard, Freigaben und Finanzen umgesetzt; in den übrigen Modulen setzt der Server es im Echtbetrieb durch.</div></div>");
    var box = $(".top__r"); if (!box) return;
    var sel = $("#roleSel");
    if (!sel) { box.insertAdjacentHTML("afterbegin", '<label class="rolesel" title="Ansicht als (Demo)"><span>Ansicht</span><select id="roleSel">' + OS.ROLES.map(function (r) { return '<option value="' + r.id + '">' + r.name.split(" (")[0] + "</option>"; }).join("") + "</select></label>"); sel = $("#roleSel"); sel.onchange = function () { OS.switchRole(sel.value); }; }
    sel.value = OS.role();
  };
})();

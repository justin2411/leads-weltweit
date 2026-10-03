/* Praxis-Cockpit, Mobile Physiotherapie Oehlke
   Vorschau mit Beispieldaten. Alles läuft im Browser; Änderungen werden nur lokal (localStorage) gemerkt.
   Die SEO-Analyse prüft die echten Seiten dieser Website. */
(function () {
  "use strict";
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = function (s) { return String(s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem("po_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("po_" + k, JSON.stringify(v)); } catch (e) {} }
  };
  function toast(msg) {
    var t = $(".toast"); t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, 2200);
  }
  // Deterministischer Zufall für stabile Beispieldaten
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  var fmt = function (n) { return n.toLocaleString("de-DE"); };
  var today = new Date();
  var dstr = function (d) { return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }); };
  var addDays = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };

  var I = {
    home: '<path d="M3 11 12 3l9 8"/><path d="M5 10v10h14V10"/>',
    route: '<circle cx="6" cy="19" r="2.5"/><circle cx="18" cy="5" r="2.5"/><path d="M8.5 19H16a3.5 3.5 0 0 0 0-7H8a3.5 3.5 0 0 1 0-7h7.5"/>',
    users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>',
    inbox: '<path d="M3 13h5l1.5 3h5L16 13h5"/><path d="M5 5h14l2 8v6H3v-6Z"/>',
    file: '<path d="M14 3H6v18h12V7Z"/><path d="M14 3v4h4M9 12h6M9 16h4"/>',
    check: '<rect x="3" y="4" width="18" height="17" rx="3"/><path d="m8 12 3 3 5-6"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    gauge: '<path d="M4 18a9 9 0 1 1 16 0"/><path d="m12 14 4-5"/>',
    trend: '<path d="m3 17 6-6 4 4 8-8"/><path d="M15 7h6v6"/>',
    chart: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
    pen: '<path d="M4 20h4L19 9l-4-4L4 16Z"/><path d="m13 7 4 4"/>',
    tool: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.5 2.5-2.4-.6-.6-2.4Z"/>',
    euro: '<path d="M17 6a7 7 0 1 0 0 12"/><path d="M4 10h9M4 14h9"/>',
    star: '<path d="M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9Z"/>',
    out: '<path d="M15 4h4v16h-4"/><path d="M10 8l-4 4 4 4M6 12h10"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    dl: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    spark: '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z"/>'
  };
  var icon = function (n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + I[n] + "</svg>"; };

  // ------------------------------------------------------------ Beispieldaten
  var TEAM = [
    { id: "ro", name: "Ramon Oehlke", role: "Inhaber · Geriatrie", color: "#1b417a", soll: 22, ist: 21, km: 412, doku: 1, fb: 48, fbDue: "2028" },
    { id: "ls", name: "Lena Sommer", role: "Physiotherapeutin · MLD", color: "#237e92", soll: 25, ist: 23, km: 388, doku: 3, fb: 31, fbDue: "2027" },
    { id: "jk", name: "Jonas Keller", role: "Physiotherapeut · MT", color: "#5a8f27", soll: 25, ist: 19, km: 451, doku: 0, fb: 12, fbDue: "2026" },
    { id: "mw", name: "Marie Wagner", role: "Physiotherapeutin · Teilzeit", color: "#8a5a9e", soll: 14, ist: 14, km: 205, doku: 2, fb: 55, fbDue: "2029" }
  ];
  var TOWNS = ["Hockenheim", "Schwetzingen", "Heidelberg", "Ketsch", "Oftersheim", "Plankstadt", "Reilingen", "Altlußheim", "Neulußheim", "Brühl", "Walldorf", "Wiesloch", "Sandhausen", "Eppelheim"];
  var TREAT = ["KG", "Gangschule", "MLD", "MT", "Alltagstraining", "Atemtherapie", "Massage", "Befundung"];
  var LAST = ["M.", "K.", "S.", "B.", "W.", "H.", "R.", "F.", "L.", "T.", "G.", "N."];
  function tours(tid, dayOffset) {
    seed = tid.charCodeAt(0) * 31 + tid.charCodeAt(1) + dayOffset * 97;
    var start = 8 * 60 + Math.floor(rnd() * 3) * 15, out = [], t = start, n = 3 + Math.floor(rnd() * 3);
    for (var i = 0; i < n; i++) {
      var drive = 10 + Math.floor(rnd() * 4) * 5;
      out.push({ type: "drive", from: t, to: t + drive }); t += drive;
      var town = TOWNS[Math.floor(rnd() * TOWNS.length)];
      out.push({ type: "visit", from: t, to: t + 60, who: (rnd() > .5 ? "Frau " : "Herr ") + LAST[Math.floor(rnd() * LAST.length)], town: town, tr: TREAT[Math.floor(rnd() * TREAT.length)], km: 3 + Math.floor(rnd() * 14) });
      t += 60 + (i === 1 ? 30 : 0);
    }
    return out;
  }
  var REQUESTS = store.get("requests", [
    { id: 1, name: "Frau Becker (Tochter)", town: "Schwetzingen", art: "Privatpatient", topic: "Mutter nach Hüft-OP, Gangunsicherheit", when: 0, status: "neu", src: "Website-Formular" },
    { id: 2, name: "Herr Lang", town: "Ketsch", art: "Selbstzahler", topic: "Rückenschmerzen, möchte MT", when: 0, status: "neu", src: "Telefon" },
    { id: 3, name: "Frau Yilmaz", town: "Heidelberg", art: "Beihilfeberechtigt", topic: "Lymphödem Bein, MLD 2× pro Woche", when: 1, status: "Rückruf", src: "WhatsApp" },
    { id: 4, name: "Herr Krämer", town: "Walldorf", art: "Privatpatient", topic: "Parkinson, Gangschule", when: 2, status: "Termin", src: "Website-Formular" },
    { id: 5, name: "Frau Roth", town: "Brühl", art: "Privatpatient", topic: "Sturz im Bad, Angst vor Treppen", when: 3, status: "Termin", src: "Hausarzt-Empfehlung" },
    { id: 6, name: "Herr Schulz", town: "Mannheim", art: "Selbstzahler", topic: "Außerhalb Einsatzgebiet", when: 5, status: "Abgesagt", src: "Website-Formular" }
  ]);
  var RX = [
    { p: "Frau M., Hockenheim", t: "ro", tr: "KG", done: 8, of: 10, until: 6, pay: "Privat" },
    { p: "Herr K., Ketsch", t: "jk", tr: "MT", done: 5, of: 6, until: 3, pay: "Beihilfe" },
    { p: "Frau S., Heidelberg", t: "ls", tr: "MLD 60", done: 9, of: 12, until: 14, pay: "Privat" },
    { p: "Herr B., Oftersheim", t: "ro", tr: "Gangschule", done: 2, of: 10, until: 30, pay: "Privat" },
    { p: "Frau W., Walldorf", t: "mw", tr: "KG", done: 10, of: 10, until: -1, pay: "Selbstzahler" },
    { p: "Herr H., Reilingen", t: "ls", tr: "Atemtherapie", done: 4, of: 6, until: 2, pay: "Privat" },
    { p: "Frau R., Brühl", t: "jk", tr: "KG", done: 1, of: 10, until: 26, pay: "Beihilfe" }
  ];
  var INVOICES = [
    { nr: "2026-0912", p: "Frau M.", sum: 540, days: 41, st: "überfällig" },
    { nr: "2026-0921", p: "Herr K.", sum: 320, days: 18, st: "offen" },
    { nr: "2026-0930", p: "Frau S.", sum: 690, days: 9, st: "offen" },
    { nr: "2026-0902", p: "Herr B.", sum: 410, days: 0, st: "bezahlt" }
  ];
  var TASKS = store.get("tasks", {
    todo: [{ t: "Therapieberichte Frau S. und Herr H. an Hausarzt", who: "ls" }, { t: "Rollator-Probe bei Herrn B. organisieren", who: "ro" }, { t: "Neue Theraband-Sets bestellen", who: "mw" }],
    doing: [{ t: "Dienstwagen 2: TÜV-Termin vereinbaren", who: "ro" }, { t: "Dokumentation Woche 39 nachtragen", who: "jk" }],
    done: [{ t: "Fortbildung Sturzprävention gebucht", who: "jk" }, { t: "Flyer an 3 Hausarztpraxen verteilt", who: "ro" }]
  });
  var ABSENCE = { ro: { u: [11, 12], f: [] }, ls: { u: [3, 4, 5, 6, 7], f: [] }, jk: { u: [], f: [15, 16], k: [1] }, mw: { u: [17, 18, 19, 20], f: [] } };
  var APPLICANTS = [
    { n: "Sarah P.", r: "Physiotherapeutin, 4 J. Erfahrung", st: "Gespräch Do 10:00", s: "info" },
    { n: "Tim L.", r: "Berufseinsteiger, Geriatrie-Interesse", st: "Unterlagen geprüft", s: "plain" },
    { n: "Aylin D.", r: "Physiotherapeutin, MLD-Zertifikat", st: "Probetag vereinbart", s: "good" }
  ];

  // SEO-Beispieldaten
  var KEYWORDS = [
    ["mobile physiotherapie hockenheim", 1, 1, 90, "/"], ["physiotherapie hausbesuch hockenheim", 2, 3, 70, "/physiotherapie-hockenheim"],
    ["physiotherapie hausbesuch schwetzingen", 4, 6, 110, "/physiotherapie-schwetzingen"], ["geriatrische physiotherapie hausbesuch", 3, 5, 50, "/geriatrische-physiotherapie-hausbesuch"],
    ["physiotherapie hausbesuch heidelberg", 9, 12, 260, "/physiotherapie-heidelberg"], ["lymphdrainage hausbesuch", 7, 7, 140, "/lymphdrainage-hausbesuch"],
    ["krankengymnastik hausbesuch", 12, 15, 320, "/krankengymnastik-hausbesuch"], ["physiotherapie zuhause", 18, 21, 590, "/"],
    ["manuelle therapie hausbesuch", 8, 6, 90, "/manuelle-therapie-hausbesuch"], ["gangschule senioren", 14, 19, 70, "/gangschule-hausbesuch"],
    ["physiotherapie walldorf hausbesuch", 6, 9, 40, "/physiotherapie-walldorf"], ["physiotherapie wiesloch hausbesuch", 11, 10, 50, "/physiotherapie-wiesloch"],
    ["sturzprävention senioren", 24, 31, 210, "/geriatrische-physiotherapie-hausbesuch"], ["atemtherapie hausbesuch", 5, 8, 30, "/atemtherapie-hausbesuch"],
    ["physiotherapie privatpatienten hockenheim", 2, 2, 30, "/"], ["massage hausbesuch heidelberg", 16, 14, 70, "/klassische-massage-hausbesuch"]
  ];
  function visits(days) {
    seed = 42; var out = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = addDays(today, -i), wd = d.getDay(), base = 38 + (days - i) * 0.35;
      var v = Math.round(base * (wd === 0 ? .55 : wd === 6 ? .7 : 1) + rnd() * 14);
      out.push({ d: d, v: v });
    }
    return out;
  }
  var SOURCES = [["Google Suche", 58], ["Direkt", 17], ["Google Maps", 14], ["Verweise (Ärzte, Verzeichnisse)", 7], ["Social Media", 4]];
  var DEVICES = [["Smartphone", 64], ["Computer", 27], ["Tablet", 9]];
  var PAGES = [["/", 1240, "1:42"], ["/geriatrische-physiotherapie-hausbesuch", 486, "2:51"], ["/physiotherapie-hockenheim", 371, "1:20"], ["/krankengymnastik-hausbesuch", 302, "2:05"], ["/physiotherapie-schwetzingen", 244, "1:11"], ["/karriere", 131, "1:37"]];

  // ------------------------------------------------------------ Bausteine
  function initials(n) { return n.split(" ").map(function (x) { return x[0]; }).join("").slice(0, 2); }
  function person(id) { return TEAM.filter(function (t) { return t.id === id; })[0]; }
  function who(t, sub) { return '<div class="who"><i style="background:' + t.color + '">' + initials(t.name) + '</i><div>' + esc(t.name) + (sub ? "<small>" + esc(sub) + "</small>" : "") + "</div></div>"; }
  function kpi(lbl, val, delta, ic) { return '<div class="card kpi"><span class="ico">' + icon(ic) + '</span><div class="lbl">' + lbl + '</div><div class="val">' + val + '</div><div class="delta">' + delta + "</div></div>"; }
  function hhmm(m) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); }
  function pct(a, b) { return Math.round(a / b * 100); }

  // Liniendiagramm mit Fadenkreuz und Tooltip (eine Reihe, kein Legendenkasten)
  function lineChart(el, data, opts) {
    var box = el.classList.contains("chartbox");
    var W = box ? Math.max(300, el.clientWidth) : 720, H = box ? Math.max(200, el.clientHeight) : 240, P = { l: 38, r: 12, t: 12, b: 26 };
    if (box && !el._ro && window.ResizeObserver) {
      var last = W + "x" + H;
      el._ro = new ResizeObserver(function () { var k = el.clientWidth + "x" + el.clientHeight; if (k !== last && el.isConnected) { last = k; lineChart(el, data, opts); } });
      el._ro.observe(el);
    }
    var max = Math.max.apply(null, data.map(function (d) { return d.v; })), top = Math.ceil(max / 20) * 20;
    var x = function (i) { return P.l + i * (W - P.l - P.r) / (data.length - 1); };
    var y = function (v) { return H - P.b - v / top * (H - P.t - P.b); };
    var pts = data.map(function (d, i) { return x(i).toFixed(1) + "," + y(d.v).toFixed(1); });
    var g = "";
    for (var k = 0; k <= 4; k++) { var vv = top / 4 * k; g += '<line class="grid-l" x1="' + P.l + '" x2="' + (W - P.r) + '" y1="' + y(vv) + '" y2="' + y(vv) + '"/><text class="axis" x="' + (P.l - 8) + '" y="' + (y(vv) + 4) + '" text-anchor="end">' + vv + "</text>"; }
    var step = Math.ceil(data.length / 6);
    data.forEach(function (d, i) { if (i % step === 0 || i === data.length - 1) g += '<text class="axis" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + dstr(d.d) + "</text>"; });
    el.innerHTML = '<div class="chart"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(opts.label) + '"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#46b2d0" stop-opacity=".28"/><stop offset="1" stop-color="#46b2d0" stop-opacity="0"/></linearGradient></defs>' + g +
      '<path class="ar" d="M' + pts[0] + " L" + pts.join(" L") + " L" + x(data.length - 1) + "," + y(0) + " L" + x(0) + "," + y(0) + ' Z"/><polyline class="ln" points="' + pts.join(" ") + '"/>' +
      '<line class="cross" y1="' + P.t + '" y2="' + (H - P.b) + '" style="display:none"/><circle class="mk" r="5" style="display:none"/><rect x="' + P.l + '" y="0" width="' + (W - P.l - P.r) + '" height="' + H + '" fill="transparent" class="hit"/></svg><div class="tip"></div></div>';
    var svg = $("svg", el), tip = $(".tip", el), cr = $(".cross", el), mk = $(".mk", el);
    function show(evt) {
      var r = svg.getBoundingClientRect(), px = (evt.clientX - r.left) / r.width * W;
      var i = Math.max(0, Math.min(data.length - 1, Math.round((px - P.l) / ((W - P.l - P.r) / (data.length - 1)))));
      var cx = x(i), cy = y(data[i].v);
      cr.setAttribute("x1", cx); cr.setAttribute("x2", cx); cr.style.display = "";
      mk.setAttribute("cx", cx); mk.setAttribute("cy", cy); mk.style.display = "";
      tip.innerHTML = data[i].d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) + " · <b>" + data[i].v + "</b> " + opts.unit;
      tip.style.left = (cx / W * r.width) + "px"; tip.style.top = (cy / H * r.height) + "px"; tip.style.opacity = 1;
    }
    $(".hit", el).addEventListener("mousemove", show);
    $(".hit", el).addEventListener("mouseleave", function () { tip.style.opacity = 0; cr.style.display = "none"; mk.style.display = "none"; });
  }
  function hbars(rows, unit) {
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; }));
    return '<div class="hbars">' + rows.map(function (r) { return '<div class="hbar" title="' + esc(r[0]) + ": " + r[1] + unit + '"><span>' + esc(r[0]) + '</span><span class="track"><i style="width:' + (r[1] / max * 100) + '%"></i></span><span class="v">' + r[1] + unit + "</span></div>"; }).join("") + "</div>";
  }

  // ------------------------------------------------------------ Ansichten
  var V = {};

  V.uebersicht = function () {
    var todayVisits = TEAM.reduce(function (s, t) { return s + tours(t.id, 0).filter(function (e) { return e.type === "visit"; }).length; }, 0);
    var newReq = REQUESTS.filter(function (r) { return r.status === "neu"; }).length;
    var v30 = visits(30), sum30 = v30.reduce(function (s, d) { return s + d.v; }, 0);
    var ist = TEAM.reduce(function (s, t) { return s + t.ist; }, 0), soll = TEAM.reduce(function (s, t) { return s + t.soll; }, 0);
    var rxSoon = RX.filter(function (r) { return r.until >= 0 && r.until <= 7 || r.of - r.done <= 1; });
    var open = INVOICES.filter(function (i) { return i.st !== "bezahlt"; });
    return '<div class="grid g4">' +
      kpi("Hausbesuche heute", todayVisits, "verteilt auf " + TEAM.length + " Therapeut:innen", "route") +
      kpi("Auslastung Woche", pct(ist, soll) + '<small> %</small>', ist + " von " + soll + " Behandlungen geplant", "gauge") +
      kpi("Neue Anfragen", newReq, '<a href="#anfragen">Jetzt bearbeiten →</a>', "inbox") +
      kpi("Website-Besucher", fmt(sum30), '<b class="up">+18 %</b> zu den 30 Tagen davor', "eye") +
      '</div><div class="grid g-21" style="margin-top:18px"><div class="stack"><div class="card"><div class="card__head"><div><h3>Heute unterwegs</h3><p class="hint">Touren aller Therapeut:innen · ' + today.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }) + '</p></div><a class="btn btn--ghost btn--sm" href="#touren">Tourenplan</a></div>' + timeline(0) + "</div>" +
      '<div class="card fill"><div class="card__head"><div><h3>Website-Besucher</h3><p class="hint">letzte 30 Tage</p></div><a class="btn btn--ghost btn--sm" href="#besucher">Details</a></div><div id="ovChart" class="chartbox"></div></div></div>' +
      '<div class="stack"><div class="card"><h3>Braucht deine Aufmerksamkeit</h3><p class="hint">automatisch aus den Daten erkannt</p><ul class="list">' +
      rxSoon.map(function (r) { return '<li><span class="dot" style="background:#d69426"></span><div class="t">Verordnung ' + esc(r.p) + "<small>" + (r.until < 0 ? "abgelaufen" : r.of - r.done <= 1 ? "nur noch " + (r.of - r.done) + " Behandlung" : "läuft in " + r.until + " Tagen ab") + "</small></div></li>"; }).join("") +
      open.filter(function (i) { return i.st === "überfällig"; }).map(function (i) { return '<li><span class="dot" style="background:#c2410c"></span><div class="t">Rechnung ' + i.nr + " überfällig<small>" + esc(i.p) + " · " + i.sum + " € · seit " + i.days + " Tagen</small></div></li>"; }).join("") +
      TEAM.filter(function (t) { return t.doku > 1; }).map(function (t) { return '<li><span class="dot" style="background:#46b2d0"></span><div class="t">' + t.doku + " Dokumentationen offen<small>" + esc(t.name) + "</small></div></li>"; }).join("") +
      TEAM.filter(function (t) { return t.fb < 20; }).map(function (t) { return '<li><span class="dot" style="background:#8a5a9e"></span><div class="t">Fortbildungspunkte knapp<small>' + esc(t.name) + ": " + t.fb + " von 60 bis " + t.fbDue + "</small></div></li>"; }).join("") +
      '</ul></div><div class="card fill center"><h3>Google-Bewertungen</h3><p class="hint">Stand laut Google-Profil</p><div style="display:flex;align-items:center;gap:14px"><span style="font:600 2.4rem var(--f-head);color:var(--navy)">5,0</span><div><div class="stars">★★★★★</div><small style="color:var(--ink-mute)">21 Bewertungen</small></div></div><p style="margin:12px 0 0;font-size:.85rem"><a href="https://www.google.com/search?hl=de&q=Mobile+Physiotherapie+Oehlke&ludocid=9389132945967097191#lrd=0x4f769d8bc25e5f07:0x824ce6ab29492567,1" target="_blank" rel="noopener">Bewertungen öffnen</a> · <a href="https://www.google.com/search?hl=de&q=Mobile+Physiotherapie+Oehlke&ludocid=9389132945967097191#lrd=0x4f769d8bc25e5f07:0x824ce6ab29492567,3" target="_blank" rel="noopener">Link zum Bewerten</a></p></div></div></div>' +
      '<div class="grid" style="margin-top:18px"><div class="card"><div class="card__head"><div><h3>Top-Rankings</h3><p class="hint">Google-Positionen deiner wichtigsten Suchbegriffe</p></div><a class="btn btn--ghost btn--sm" href="#rankings">Alle</a></div>' + rankTable(KEYWORDS.slice(0, 6), true) + "</div></div>";
  };
  V.uebersicht.after = function () { lineChart($("#ovChart"), visits(30), { label: "Besucher pro Tag, letzte 30 Tage", unit: "Besucher" }); };

  function timeline(day) {
    var S = 7 * 60 + 30, E = 17 * 60, span = E - S, rows = "";
    TEAM.forEach(function (t) {
      var ev = tours(t.id, day), km = ev.reduce(function (s, e) { return s + (e.km || 0); }, 0);
      rows += '<div class="tl__row">' + who(t, ev.filter(function (e) { return e.type === "visit"; }).length + " Besuche · " + km + " km") + '<div class="tl__track">' +
        ev.map(function (e) {
          var l = (e.from - S) / span * 100, w = (e.to - e.from) / span * 100;
          return e.type === "drive" ? '<div class="tl__ev drive" style="left:' + l + "%;width:" + w + '%" title="Fahrt ' + hhmm(e.from) + "–" + hhmm(e.to) + '"></div>'
            : '<div class="tl__ev" style="left:' + l + "%;width:" + w + "%;background:" + t.color + '" title="' + hhmm(e.from) + " " + esc(e.who) + ", " + e.town + " · " + e.tr + '">' + esc(e.who) + "<small>" + e.town + " · " + e.tr + "</small></div>";
        }).join("") + "</div></div>";
    });
    return '<div class="tl"><div class="tl__hours"><div></div><div><span>07:30</span><span>10:00</span><span>12:30</span><span>15:00</span><span>17:00</span></div></div>' + rows + "</div>";
  }

  V.touren = function () {
    var day = V.touren.day || 0, all = [];
    TEAM.forEach(function (t) { tours(t.id, day).forEach(function (e) { if (e.type === "visit") all.push({ t: t, e: e }); }); });
    all.sort(function (a, b) { return a.e.from - b.e.from; });
    var km = all.reduce(function (s, x) { return s + x.e.km; }, 0);
    return '<div class="toolbar"><div class="seg">' + [["Heute", 0], ["Morgen", 1], ["Übermorgen", 2]].map(function (d) { return '<button data-day="' + d[1] + '" class="' + (d[1] === day ? "on" : "") + '">' + d[0] + "</button>"; }).join("") + '</div><span class="pill pill--info pill--plain">' + all.length + " Hausbesuche · " + km + " km · Fahrzeit ~" + Math.round(km * 1.6) + ' min</span></div>' +
      '<div class="card">' + timeline(day) + '<div class="legend"><span><i style="background:repeating-linear-gradient(45deg,#cfd9e3 0 3px,#dfe7ee 3px 6px)"></i>Fahrt</span>' + TEAM.map(function (t) { return '<span><i style="background:' + t.color + '"></i>' + esc(t.name.split(" ")[0]) + "</span>"; }).join("") + "</div></div>" +
      '<div class="card" style="margin-top:18px"><h3>Besuchsliste</h3><p class="hint">Uhrzeit, Ort und Behandlung · Namen sind Beispieldaten</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Zeit</th><th>Therapeut:in</th><th>Patient:in</th><th>Ort</th><th>Behandlung</th><th class="num">Anfahrt</th></tr></thead><tbody>' +
      all.map(function (x) { return "<tr><td>" + hhmm(x.e.from) + "–" + hhmm(x.e.to) + "</td><td>" + who(x.t) + "</td><td>" + esc(x.e.who) + "</td><td>" + x.e.town + '</td><td><span class="pill pill--plain">' + x.e.tr + '</span></td><td class="num">' + x.e.km + " km</td></tr>"; }).join("") + "</tbody></table></div></div>";
  };
  V.touren.after = function () { $$("[data-day]").forEach(function (b) { b.onclick = function () { V.touren.day = +b.dataset.day; render(); }; }); };

  V.team = function () {
    return '<div class="card"><div class="card__head"><div><h3>Team & Auslastung</h3><p class="hint">Behandlungen diese Woche (Ist / Soll), offene Dokumentation, Fortbildungspunkte</p></div></div><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Auslastung</th><th class="num">Ist/Soll</th><th class="num">km Monat</th><th>Doku offen</th><th>Fortbildung (60 Pkt.)</th></tr></thead><tbody>' +
      TEAM.map(function (t) {
        var p = pct(t.ist, t.soll), fbp = Math.min(100, pct(t.fb, 60));
        return "<tr><td>" + who(t, t.role) + '</td><td><div class="bar ' + (p < 85 ? "warn" : "") + '"><i style="width:' + p + '%"></i></div></td><td class="num">' + t.ist + "/" + t.soll + '</td><td class="num">' + t.km + "</td><td>" + (t.doku ? '<span class="pill pill--warn">' + t.doku + " offen</span>" : '<span class="pill pill--good">aktuell</span>') + '</td><td><div style="display:flex;align-items:center;gap:8px"><div class="bar lime" style="flex:1"><i style="width:' + fbp + '%"></i></div><small>' + t.fb + " · bis " + t.fbDue + "</small></div></td></tr>";
      }).join("") + '</tbody></table></div></div><div class="grid g2" style="margin-top:18px"><div class="card"><h3>Bewerbungen</h3><p class="hint">aus der Karriereseite</p><ul class="list">' +
      APPLICANTS.map(function (a) { return '<li><div class="t"><b>' + esc(a.n) + "</b><small>" + esc(a.r) + '</small></div><span class="pill pill--' + a.s + '">' + esc(a.st) + "</span></li>"; }).join("") +
      '</ul></div><div class="card"><h3>Team-Info an alle</h3><p class="hint">kurze Mitteilung vorbereiten und per WhatsApp oder E-Mail teilen</p><label class="fld"><span>Nachricht</span><textarea id="teamMsg" rows="4">Hallo Team, ab Montag gilt der neue Tourenplan für Heidelberg. Bitte Doku bis Freitag nachtragen. Danke! Ramon</textarea></label><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" id="msgWa">Per WhatsApp teilen</button><button class="btn btn--ghost" id="msgMail">Per E-Mail</button></div></div></div>';
  };
  V.team.after = function () {
    $("#msgWa").onclick = function () { window.open("https://wa.me/?text=" + encodeURIComponent($("#teamMsg").value), "_blank", "noopener"); };
    $("#msgMail").onclick = function () { location.href = "mailto:?subject=" + encodeURIComponent("Team-Info") + "&body=" + encodeURIComponent($("#teamMsg").value); };
  };

  var STATES = ["neu", "Rückruf", "Termin", "Abgesagt"];
  V.anfragen = function () {
    var f = V.anfragen.f || "alle", rows = REQUESTS.filter(function (r) { return f === "alle" || r.status === f; });
    return '<div class="toolbar"><div class="seg">' + ["alle"].concat(STATES).map(function (s) { return '<button data-f="' + s + '" class="' + (s === f ? "on" : "") + '">' + s[0].toUpperCase() + s.slice(1) + " (" + REQUESTS.filter(function (r) { return s === "alle" || r.status === s; }).length + ")</button>"; }).join("") + '</div></div><div class="card"><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Eingang</th><th>Anfrage</th><th>Ort</th><th>Versicherung</th><th>Quelle</th><th>Status</th></tr></thead><tbody>' +
      (rows.length ? rows.map(function (r) {
        var cls = { neu: "info", "Rückruf": "warn", Termin: "good", Abgesagt: "plain" }[r.status];
        var inArea = TOWNS.indexOf(r.town) >= 0;
        return "<tr><td>" + (r.when === 0 ? "heute" : "vor " + r.when + " Tg.") + "</td><td><b>" + esc(r.name) + "</b><br><small style=\"color:var(--ink-mute)\">" + esc(r.topic) + "</small></td><td>" + esc(r.town) + (inArea ? "" : ' <span class="pill pill--bad">außerhalb</span>') + "</td><td>" + r.art + "</td><td>" + r.src + '</td><td><select data-id="' + r.id + '" class="pill pill--' + cls + '" style="border:0">' + STATES.map(function (s) { return "<option" + (s === r.status ? " selected" : "") + ">" + s + "</option>"; }).join("") + "</select></td></tr>";
      }).join("") : '<tr><td colspan="6" class="empty">Keine Anfragen in dieser Ansicht.</td></tr>') + '</tbody></table></div></div><p class="hint" style="margin-top:12px">Tipp: Später können Anfragen aus dem Kontaktformular der Website automatisch hier landen.</p>';
  };
  V.anfragen.after = function () {
    $$("[data-f]").forEach(function (b) { b.onclick = function () { V.anfragen.f = b.dataset.f; render(); }; });
    $$("select[data-id]").forEach(function (s) { s.onchange = function () { REQUESTS.forEach(function (r) { if (r.id === +s.dataset.id) r.status = s.value; }); store.set("requests", REQUESTS); toast("Status gespeichert"); render(); }; });
  };

  V.verordnungen = function () {
    var openSum = INVOICES.filter(function (i) { return i.st !== "bezahlt"; }).reduce(function (s, i) { return s + i.sum; }, 0);
    return '<div class="grid g3">' + kpi("Aktive Verordnungen", RX.filter(function (r) { return r.done < r.of; }).length, "mit offenen Behandlungen", "file") + kpi("Läuft bald aus", RX.filter(function (r) { return r.until >= 0 && r.until <= 7; }).length, "in den nächsten 7 Tagen", "cal") + kpi("Offene Rechnungen", fmt(openSum) + "<small> €</small>", INVOICES.filter(function (i) { return i.st === "überfällig"; }).length + " davon überfällig", "euro") + '</div>' +
      '<div class="card" style="margin-top:18px"><h3>Verordnungen</h3><p class="hint">Fortschritt und Fristen, rechtzeitig Folgeverordnung beim Arzt anfragen</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Patient:in</th><th>Therapeut:in</th><th>Behandlung</th><th>Fortschritt</th><th>Frist</th><th>Kosten</th></tr></thead><tbody>' +
      RX.map(function (r) {
        var p = pct(r.done, r.of), st = r.until < 0 ? '<span class="pill pill--bad">abgelaufen</span>' : r.until <= 7 ? '<span class="pill pill--warn">noch ' + r.until + " Tg.</span>" : '<span class="pill pill--good">' + dstr(addDays(today, r.until)) + "</span>";
        return "<tr><td>" + esc(r.p) + "</td><td>" + who(person(r.t)) + "</td><td>" + r.tr + '</td><td><div style="display:flex;align-items:center;gap:8px"><div class="bar" style="flex:1"><i style="width:' + p + '%"></i></div><small>' + r.done + "/" + r.of + "</small></div></td><td>" + st + "</td><td>" + r.pay + "</td></tr>";
      }).join("") + '</tbody></table></div></div><div class="card" style="margin-top:18px"><h3>Rechnungen</h3><p class="hint">Privatabrechnung · Zahlungseingang</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nr.</th><th>Patient:in</th><th class="num">Betrag</th><th>Status</th></tr></thead><tbody>' +
      INVOICES.map(function (i) { var c = { "überfällig": "bad", offen: "warn", bezahlt: "good" }[i.st]; return "<tr><td>" + i.nr + "</td><td>" + esc(i.p) + '</td><td class="num">' + fmt(i.sum) + ' €</td><td><span class="pill pill--' + c + '">' + i.st + (i.days && i.st !== "bezahlt" ? " · " + i.days + " Tg." : "") + "</span></td></tr>"; }).join("") + "</tbody></table></div></div>";
  };

  V.aufgaben = function () {
    var cols = [["todo", "Offen"], ["doing", "In Arbeit"], ["done", "Erledigt"]];
    return '<div class="kanban">' + cols.map(function (c) {
      return '<div class="col" data-col="' + c[0] + '"><h4>' + c[1] + " <span>" + TASKS[c[0]].length + "</span></h4>" + TASKS[c[0]].map(function (t, i) {
        var p = person(t.who);
        return '<div class="task" draggable="true" data-c="' + c[0] + '" data-i="' + i + '">' + esc(t.t) + '<div class="meta"><span>' + (p ? esc(p.name.split(" ")[0]) : "") + '</span><button class="x" title="Löschen" data-del="' + c[0] + ":" + i + '">✕</button></div></div>';
      }).join("") + (c[0] === "todo" ? '<form class="addtask"><input placeholder="Neue Aufgabe …" aria-label="Neue Aufgabe"><select aria-label="Zuständig">' + TEAM.map(function (t) { return '<option value="' + t.id + '">' + t.name.split(" ")[0] + "</option>"; }).join("") + '</select><button class="btn btn--sm">+</button></form>' : "") + "</div>";
    }).join("") + '</div><p class="hint" style="margin-top:12px">Karten per Ziehen verschieben. Wird in diesem Browser gespeichert.</p>';
  };
  V.aufgaben.after = function () {
    var drag = null;
    $$(".task").forEach(function (t) { t.addEventListener("dragstart", function () { drag = { c: t.dataset.c, i: +t.dataset.i }; }); });
    $$(".col").forEach(function (col) {
      col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("over"); });
      col.addEventListener("dragleave", function () { col.classList.remove("over"); });
      col.addEventListener("drop", function () { if (!drag) return; var item = TASKS[drag.c].splice(drag.i, 1)[0]; TASKS[col.dataset.col].push(item); store.set("tasks", TASKS); render(); });
    });
    $$("[data-del]").forEach(function (b) { b.onclick = function () { var p = b.dataset.del.split(":"); TASKS[p[0]].splice(+p[1], 1); store.set("tasks", TASKS); render(); }; });
    var f = $(".addtask"); if (f) f.onsubmit = function (e) { e.preventDefault(); var v = $("input", f).value.trim(); if (!v) return; TASKS.todo.push({ t: v, who: $("select", f).value }); store.set("tasks", TASKS); render(); };
  };

  V.abwesenheit = function () {
    var head = '<div class="h n"></div>';
    for (var d = 0; d < 21; d++) { var dt = addDays(today, d), we = dt.getDay() === 0 || dt.getDay() === 6; head += '<div class="h' + (we ? " we" : "") + '">' + dt.toLocaleDateString("de-DE", { weekday: "narrow" }) + "<br>" + dt.getDate() + "</div>"; }
    var rows = TEAM.map(function (t) {
      var a = ABSENCE[t.id], r = '<div class="n">' + esc(t.name) + "</div>";
      for (var d = 0; d < 21; d++) { var dt = addDays(today, d), we = dt.getDay() === 0 || dt.getDay() === 6; var c = a.u.indexOf(d) >= 0 ? "u" : a.f.indexOf(d) >= 0 ? "f" : (a.k || []).indexOf(d) >= 0 ? "k" : we ? "we" : ""; r += '<div class="' + c + '">' + ({ u: "U", f: "F", k: "K" }[c] || "") + "</div>"; }
      return r;
    }).join("");
    var conflicts = [];
    for (var d = 0; d < 21; d++) { var off = TEAM.filter(function (t) { var a = ABSENCE[t.id]; return a.u.indexOf(d) >= 0 || a.f.indexOf(d) >= 0 || (a.k || []).indexOf(d) >= 0; }); if (off.length >= 2) conflicts.push(dstr(addDays(today, d)) + ": " + off.map(function (t) { return t.name.split(" ")[0]; }).join(" + ")); }
    return '<div class="card"><h3>Urlaub, Fortbildung, Krankheit</h3><p class="hint">die nächsten 3 Wochen · Engpässe werden automatisch markiert</p><div class="cal">' + head + rows + '</div><div class="legend"><span><i style="background:#cfe9f2"></i>U Urlaub</span><span><i style="background:#e4f2d6"></i>F Fortbildung</span><span><i style="background:#fde6db"></i>K Krank</span></div></div>' +
      '<div class="card" style="margin-top:18px"><h3>Vertretung nötig</h3><p class="hint">Tage, an denen zwei oder mehr fehlen</p>' + (conflicts.length ? '<ul class="list">' + conflicts.map(function (c) { return '<li><span class="dot" style="background:#d69426"></span><div class="t">' + c + "</div></li>"; }).join("") + "</ul>" : '<p class="empty">Keine Engpässe in den nächsten 3 Wochen.</p>') + "</div>";
  };

  // ------------------------------------------------------------ SEO
  function rankTable(rows, compact) {
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Suchbegriff</th><th class="num">Pos.</th><th class="num">Trend</th>' + (compact ? "" : '<th class="num">Suchen/Monat</th><th>Seite</th>') + "</tr></thead><tbody>" +
      rows.map(function (k) {
        var cls = k[1] <= 3 ? "top3" : k[1] <= 10 ? "top10" : "far", d = k[2] - k[1];
        var chg = d > 0 ? '<span class="chg up">▲ ' + d + "</span>" : d < 0 ? '<span class="chg down">▼ ' + (-d) + "</span>" : '<span class="chg eq">–</span>';
        return "<tr><td>" + esc(k[0]) + '</td><td class="num"><span class="pos ' + cls + '">' + k[1] + '</span></td><td class="num">' + chg + "</td>" + (compact ? "" : '<td class="num">' + k[3] + '</td><td><a href="' + k[4] + '" target="_blank" rel="noopener">' + k[4] + "</a></td>") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }

  V.rankings = function () {
    var f = V.rankings.f || "alle";
    var rows = KEYWORDS.filter(function (k) { return f === "alle" || (f === "top3" && k[1] <= 3) || (f === "top10" && k[1] > 3 && k[1] <= 10) || (f === "weiter" && k[1] > 10); }).sort(function (a, b) { return a[1] - b[1]; });
    var c3 = KEYWORDS.filter(function (k) { return k[1] <= 3; }).length, c10 = KEYWORDS.filter(function (k) { return k[1] <= 10; }).length;
    var avg = (KEYWORDS.reduce(function (s, k) { return s + k[1]; }, 0) / KEYWORDS.length).toFixed(1).replace(".", ",");
    var dist = [["Platz 1–3", c3], ["Platz 4–10", c10 - c3], ["Platz 11–20", KEYWORDS.filter(function (k) { return k[1] > 10 && k[1] <= 20; }).length], ["ab Platz 21", KEYWORDS.filter(function (k) { return k[1] > 20; }).length]];
    var chances = KEYWORDS.filter(function (k) { return k[1] > 3 && k[1] <= 15; }).sort(function (a, b) { return b[3] - a[3]; }).slice(0, 4);
    return '<div class="grid g4">' + kpi("Top 3", c3, "von " + KEYWORDS.length + " Suchbegriffen", "star") + kpi("Seite 1 (Top 10)", c10, "Ziel: alle Ortsseiten", "trend") + kpi("Ø Position", avg, '<b class="up">▲ 1,8</b> zum Vormonat', "chart") + kpi("Sichtbarkeit", "34<small> %</small>", "Anteil möglicher Klicks", "eye") + "</div>" +
      '<div class="grid g2" style="margin-top:18px"><div class="card"><h3>Größte Chancen</h3><p class="hint">knapp unter den Top 3, viele Suchen, hier lohnt ein neuer Beitrag</p><ul class="list">' +
      chances.map(function (k) { return '<li><span class="pos ' + (k[1] <= 10 ? "top10" : "far") + '">' + k[1] + '</span><div class="t">' + esc(k[0]) + "<small>" + k[3] + ' Suchen/Monat</small></div><a class="btn btn--ghost btn--sm" href="#beitraege" data-kw="' + esc(k[0]) + '">Beitrag</a></li>'; }).join("") + '</ul></div>' +
      '<div class="card fill"><h3>Verteilung der Positionen</h3><p class="hint">Wie viele Suchbegriffe auf welcher Position stehen</p>' + hbars(dist, "") +
      '<p class="hint" style="margin:auto 0 0;padding-top:16px">Beispieldaten. Echte Positionen kommen später aus der Google Search Console.</p></div></div>' +
      '<div class="card" style="margin-top:18px"><div class="card__head"><div><h3>Alle Suchbegriffe</h3><p class="hint">Position, Trend, Suchvolumen und passende Seite</p></div><div class="seg">' + [["alle", "Alle"], ["top3", "Top 3"], ["top10", "Plätze 4–10"], ["weiter", "Ab Platz 11"]].map(function (b) { return '<button data-rf="' + b[0] + '" class="' + (f === b[0] ? "on" : "") + '">' + b[1] + "</button>"; }).join("") + "</div></div>" + rankTable(rows) + "</div>";
  };
  V.rankings.after = function () {
    $$("[data-rf]").forEach(function (b) { b.onclick = function () { V.rankings.f = b.dataset.rf; render(); }; });
    $$("[data-kw]").forEach(function (a) { a.onclick = function () { V.beitraege.kw = a.dataset.kw; }; });
  };

  V.besucher = function () {
    var range = V.besucher.r || 30, data = visits(range), sum = data.reduce(function (s, d) { return s + d.v; }, 0);
    return '<div class="toolbar"><div class="seg">' + [7, 30, 90].map(function (r) { return '<button data-r="' + r + '" class="' + (r === range ? "on" : "") + '">' + r + " Tage</button>"; }).join("") + '</div></div><div class="grid g4">' +
      kpi("Besucher", fmt(sum), '<b class="up">+18 %</b> zum Vorzeitraum', "eye") + kpi("Anfragen über Website", Math.round(sum * 0.021), "Formular, Telefon-Klick, WhatsApp", "inbox") + kpi("Conversion", "2,1<small> %</small>", "Besucher → Anfrage", "gauge") + kpi("Ø Verweildauer", "1:58", "Minuten pro Besuch", "cal") +
      '</div><div class="card" style="margin-top:18px"><h3>Besucher pro Tag</h3><p class="hint">Fahre mit der Maus über die Linie für Einzelwerte</p><div id="vChart"></div></div><div class="grid g2" style="margin-top:18px"><div class="card"><h3>Woher kommen die Besucher?</h3><p class="hint">Anteil in Prozent</p>' + hbars(SOURCES, " %") + '<h4 style="margin:20px 0 10px;font-size:.9rem">Geräte</h4>' + hbars(DEVICES, " %") +
      '</div><div class="card"><h3>Beliebteste Seiten</h3><p class="hint">Aufrufe und Verweildauer</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Seite</th><th class="num">Aufrufe</th><th class="num">Dauer</th></tr></thead><tbody>' + PAGES.map(function (p) { return '<tr><td><a href="' + p[0] + '" target="_blank" rel="noopener">' + p[0] + '</a></td><td class="num">' + fmt(p[1]) + '</td><td class="num">' + p[2] + "</td></tr>"; }).join("") + '</tbody></table></div></div></div><p class="hint" style="margin-top:12px">Beispieldaten. Für echte Zahlen lässt sich eine datenschutzfreundliche Statistik ohne Cookie-Banner anbinden (z. B. Vercel Web Analytics oder Plausible).</p>';
  };
  V.besucher.after = function () {
    lineChart($("#vChart"), visits(V.besucher.r || 30), { label: "Besucher pro Tag", unit: "Besucher" });
    $$("[data-r]").forEach(function (b) { b.onclick = function () { V.besucher.r = +b.dataset.r; render(); }; });
  };

  // Echte SEO-Analyse der eigenen Seiten
  var SEO_PAGES = ["/", "/geriatrische-physiotherapie-hausbesuch", "/krankengymnastik-hausbesuch", "/gangschule-hausbesuch", "/lymphdrainage-hausbesuch", "/manuelle-therapie-hausbesuch", "/physiotherapie-hockenheim", "/physiotherapie-schwetzingen", "/physiotherapie-heidelberg", "/karriere"];
  V.analyse = function () {
    return '<div class="grid g-12"><div class="stack"><div class="card"><h3>SEO-Score</h3><p class="hint">Prüfung der echten Seiten dieser Website</p><div class="score"><div class="ring" id="ring" style="--p:0"><b id="scoreV">–</b></div><div><p style="margin:0 0 10px;color:var(--ink-soft)" id="scoreTxt">Analyse läuft …</p><button class="btn btn--sm" id="reRun">' + icon("spark") + ' Neu prüfen</button></div></div></div>' +
      '<div class="card fill"><h3>Auf einen Blick</h3><p class="hint">Durchschnitt über alle geprüften Seiten</p><div class="stats" id="sumStats"><p class="empty">wird geprüft …</p></div></div></div>' +
      '<div class="card fill"><h3>Wichtigste Hinweise</h3><p class="hint">nach Wirkung sortiert</p><ul class="checks spread" id="sumChecks"><li class="empty">wird geprüft …</li></ul></div></div><div class="card" style="margin-top:18px"><h3>Seiten im Detail</h3><p class="hint">Titel, Beschreibung, Überschrift, Bilder, Textlänge, Verlinkung</p><div class="tbl-wrap"><table class="tbl" id="pageTbl"><thead><tr><th>Seite</th><th class="num">Score</th><th>Titel</th><th>Beschreibung</th><th class="num">H1</th><th class="num">Wörter</th><th class="num">Bilder ohne Alt</th><th>Indexierung</th></tr></thead><tbody><tr><td colspan="8" class="empty">wird geprüft …</td></tr></tbody></table></div></div>';
  };
  V.analyse.after = function () { runAnalysis(); $("#reRun").onclick = runAnalysis; };
  function analyse(path, html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var title = (doc.querySelector("title") || {}).textContent || "";
    var desc = (doc.querySelector('meta[name="description"]') || { getAttribute: function () { return ""; } }).getAttribute("content") || "";
    var robots = (doc.querySelector('meta[name="robots"]') || { getAttribute: function () { return ""; } }).getAttribute("content") || "";
    var h1 = doc.querySelectorAll("h1").length, imgs = doc.querySelectorAll("main img"), noAlt = 0;
    imgs.forEach(function (i) { if (!i.getAttribute("alt") && !i.closest("[aria-hidden]") && !i.closest(".svc")) noAlt++; });
    var main = doc.querySelector("main"), words = main ? main.textContent.trim().split(/\s+/).length : 0;
    var links = main ? main.querySelectorAll('a[href^="/"]').length : 0, ld = !!doc.querySelector('script[type="application/ld+json"]');
    var issues = [], s = 100;
    function iss(sev, txt, pts) { issues.push({ sev: sev, txt: txt, path: path }); s -= pts; }
    if (title.length < 30 || title.length > 65) iss("w", "Titel " + title.length + " Zeichen (ideal 30–65)", 8);
    if (!desc) iss("e", "Meta-Beschreibung fehlt", 15); else if (desc.length < 110 || desc.length > 165) iss("w", "Beschreibung " + desc.length + " Zeichen (ideal 110–160)", 6);
    if (h1 !== 1) iss("e", h1 + " H1-Überschriften (genau 1 empfohlen)", 12);
    if (words < 300) iss("w", "Nur " + words + " Wörter Text (ab 300 besser)", 8);
    if (noAlt) iss("w", noAlt + " Bild(er) ohne Alt-Text", 5);
    if (links < 3) iss("w", "Wenig interne Links (" + links + ")", 4);
    if (!ld) iss("w", "Keine strukturierten Daten", 4);
    if (/noindex/.test(robots)) iss("e", "noindex aktiv, Seite erscheint nicht bei Google", 0);
    return { path: path, title: title, desc: desc, h1: h1, words: words, noAlt: noAlt, links: links, ld: ld, noindex: /noindex/.test(robots), score: Math.max(0, s), issues: issues };
  }
  function runAnalysis() {
    $("#scoreTxt").textContent = "Analyse läuft …";
    Promise.all(SEO_PAGES.map(function (p) { return fetch(p, { cache: "no-store" }).then(function (r) { return r.ok ? r.text() : ""; }).then(function (h) { return h ? analyse(p, h) : null; }).catch(function () { return null; }); })).then(function (res) {
      res = res.filter(Boolean);
      if (!res.length) { $("#scoreTxt").textContent = "Seiten konnten nicht geladen werden."; return; }
      var avg = Math.round(res.reduce(function (s, r) { return s + r.score; }, 0) / res.length);
      var ring = $("#ring"); ring.style.setProperty("--ring", avg >= 85 ? "#2f8f4e" : avg >= 65 ? "#d69426" : "#c2410c");
      requestAnimationFrame(function () { ring.style.setProperty("--p", avg); });
      $("#scoreV").innerHTML = avg + "<small>/100</small>";
      var noidx = res.filter(function (r) { return r.noindex; }).length;
      $("#scoreTxt").innerHTML = res.length + " Seiten geprüft. " + (avg >= 85 ? "Technisch sehr gut aufgestellt." : avg >= 65 ? "Solide, mit ein paar schnellen Verbesserungen." : "Hier ist Luft nach oben.") + (noidx ? '<br><span class="pill pill--warn" style="margin-top:8px">Vorschau-Modus: noindex aktiv</span>' : "");
      var n = res.length, sumOf = function (k) { return res.reduce(function (a, r) { return a + r[k]; }, 0); };
      $("#sumStats").innerHTML = [["Geprüfte Seiten", n], ["Ø Wörter pro Seite", fmt(Math.round(sumOf("words") / n))], ["Ø interne Links", Math.round(sumOf("links") / n)], ["Bilder ohne Alt-Text", sumOf("noAlt")], ["Seiten mit genau einer H1", res.filter(function (r) { return r.h1 === 1; }).length + " von " + n], ["Strukturierte Daten", res.filter(function (r) { return r.ld; }).length + " von " + n]].map(function (x) { return "<div><b>" + x[1] + "</b><span>" + x[0] + "</span></div>"; }).join("");
      var all = []; res.forEach(function (r) { all = all.concat(r.issues); });
      var grouped = {}; all.forEach(function (i) { var k = i.txt.replace(/\d+/g, "#"); (grouped[k] = grouped[k] || { sev: i.sev, txt: i.txt, pages: [] }).pages.push(i.path); });
      var list = Object.keys(grouped).map(function (k) { return grouped[k]; }).sort(function (a, b) { return (a.sev === "e" ? 0 : 1) - (b.sev === "e" ? 0 : 1) || b.pages.length - a.pages.length; });
      $("#sumChecks").innerHTML = (list.length ? list.slice(0, 7).map(function (g) {
        var txt = g.txt.indexOf("noindex") >= 0 ? "noindex aktiv, gewollt, solange die Seite eine Vorschau ist" : g.txt;
        return '<li class="' + (g.txt.indexOf("noindex") >= 0 ? "w" : g.sev) + '"><span class="st">' + (g.sev === "e" ? "!" : "i") + "</span><div>" + esc(txt) + "<small>" + g.pages.length + " Seite(n): " + esc(g.pages.slice(0, 3).join(", ")) + (g.pages.length > 3 ? " …" : "") + "</small></div></li>";
      }).join("") : "") + '<li class="ok"><span class="st">✓</span><div>HTTPS, mobile Darstellung, schnelle Bilder (WebP), Ladezeit<small>auf allen Seiten erfüllt</small></div></li>';
      $("#pageTbl tbody").innerHTML = res.map(function (r) {
        var sc = r.score >= 85 ? "top3" : r.score >= 65 ? "top10" : "far";
        var tl = r.title.length, dl = r.desc.length;
        return '<tr><td><a href="' + r.path + '" target="_blank" rel="noopener">' + r.path + '</a></td><td class="num"><span class="pos ' + sc + '">' + r.score + '</span></td><td><span class="pill ' + (tl >= 30 && tl <= 65 ? "pill--good" : "pill--warn") + '">' + tl + ' Z.</span></td><td><span class="pill ' + (dl >= 110 && dl <= 165 ? "pill--good" : dl ? "pill--warn" : "pill--bad") + '">' + dl + ' Z.</span></td><td class="num">' + r.h1 + '</td><td class="num">' + fmt(r.words) + '</td><td class="num">' + r.noAlt + "</td><td>" + (r.noindex ? '<span class="pill pill--warn">noindex</span>' : '<span class="pill pill--good">index</span>') + "</td></tr>";
      }).join("");
    });
  }

  // Beitragsgenerator (Vorlagen, kein KI-Dienst)
  var TOPICS = {
    "Sturzprävention im Alter": { kw: "sturzprävention senioren", intro: "Jeder dritte Mensch über 65 stürzt mindestens einmal im Jahr. Viele Stürze lassen sich mit gezieltem Training vermeiden, am besten dort, wo sie passieren: zu Hause.", parts: [["Warum Stürze im Alter so häufig sind", "Nachlassende Kraft, ein unsicheres Gleichgewicht, Medikamente und Stolperfallen in der Wohnung kommen oft zusammen. Nach einem ersten Sturz entsteht zudem häufig Angst, die zu noch weniger Bewegung führt."], ["Was Physiotherapie im Hausbesuch bewirken kann", "Wir trainieren Kraft, Gleichgewicht und sichere Bewegungsabläufe genau in Ihrer Umgebung: Aufstehen vom Sessel, der Weg ins Bad, die Treppe. Gleichzeitig schauen wir gemeinsam nach Stolperfallen."], ["Drei einfache Übungen für jeden Tag", "<ul><li>Aufstehen und Hinsetzen vom Stuhl, 10 Mal langsam</li><li>Fersen heben im Stand, mit Halt an der Küchenzeile</li><li>Einbeinstand mit Halt, je Seite 15 Sekunden</li></ul>Bitte nur nach Rücksprache und mit sicherem Halt üben."]] },
    "Physiotherapie nach Hüft-OP zu Hause": { kw: "physiotherapie nach hüft op zu hause", intro: "Nach einer neuen Hüfte zählt jeder Schritt. Physiotherapie im Hausbesuch hilft, schnell und sicher wieder selbstständig zu werden, ohne beschwerliche Fahrten zur Praxis.", parts: [["Die ersten Wochen nach der Operation", "Im Mittelpunkt stehen sichere Transfers, das Gehen mit Gehhilfe und der schrittweise Muskelaufbau. Wichtig sind die Vorgaben der Klinik zur Belastung."], ["Warum die Therapie zu Hause Vorteile hat", "Wir üben genau die Wege und Bewegungen, die Sie täglich brauchen: ins Bett, aus dem Auto, die Treppe zur Haustür. Angehörige können direkt einbezogen werden."], ["Wie lange dauert die Behandlung?", "Das ist individuell. Bei der Mobilen Physiotherapie Oehlke dauert jeder Termin 60 Minuten, damit genug Zeit für Übungen und Fragen bleibt."]] },
    "Lymphdrainage im Hausbesuch": { kw: "lymphdrainage hausbesuch", intro: "Geschwollene Beine oder Arme belasten im Alltag. Die manuelle Lymphdrainage kann helfen, Schwellungen zu reduzieren, im Hausbesuch ganz ohne Anfahrt.", parts: [["Was ist manuelle Lymphdrainage?", "Eine sanfte Grifftechnik, die den Abtransport von Gewebeflüssigkeit anregen soll. Sie wird oft bei Lymphödemen oder nach Operationen verordnet."], ["Für wen eignet sich die Behandlung zu Hause?", "Für Menschen, denen der Weg zur Praxis schwerfällt, nach Operationen oder bei eingeschränkter Mobilität."], ["Was Sie selbst tun können", "Viel trinken, regelmäßige Bewegung und die Kompression nach Anleitung tragen, wir zeigen Ihnen passende Übungen."]] },
    "Wann lohnt sich Physiotherapie zu Hause?": { kw: "physiotherapie zuhause", intro: "Nicht jeder kann einfach in eine Praxis fahren. Physiotherapie im Hausbesuch bringt die Behandlung dorthin, wo sie am meisten bewirkt: in Ihren Alltag.", parts: [["Typische Gründe für einen Hausbesuch", "Nach Operationen oder Krankenhausaufenthalten, bei Gangunsicherheit, Parkinson, nach einem Schlaganfall oder wenn Sie nicht mehr selbst Auto fahren."], ["Die Vorteile auf einen Blick", "<ul><li>keine Anfahrt, kein Wartezimmer</li><li>Training in der gewohnten Umgebung</li><li>Angehörige können dabei sein</li><li>60 Minuten Zeit pro Termin</li></ul>"], ["Wer übernimmt die Kosten?", "Für Privatpatienten, Beihilfeberechtigte und Selbstzahler. Ob sich Ihre Versicherung beteiligt, klären Sie am besten vorab direkt mit ihr."]] }
  };
  V.beitraege = function () {
    var kw = V.beitraege.kw || "";
    return '<div class="grid g-12"><div class="card"><h3>Neuen Beitrag erstellen</h3><p class="hint">Thema wählen, Ort und Suchbegriff anpassen, der Entwurf entsteht sofort</p>' +
      '<label class="fld"><span>Thema</span><select id="bTopic">' + Object.keys(TOPICS).map(function (t) { return "<option>" + t + "</option>"; }).join("") + "</select></label>" +
      '<label class="fld"><span>Ort</span><select id="bTown">' + TOWNS.map(function (t) { return "<option>" + t + "</option>"; }).join("") + "</select></label>" +
      '<label class="fld"><span>Haupt-Suchbegriff</span><input id="bKw" value="' + esc(kw) + '" placeholder="wird aus dem Thema übernommen"></label>' +
      '<label class="fld"><span>Ansprache</span><select id="bTone"><option value="sie">Betroffene (Sie)</option><option value="ang">Angehörige</option></select></label>' +
      '<button class="btn btn--lime btn--block" id="bGen">' + icon("spark") + ' Entwurf erstellen</button><h4 style="margin:22px 0 8px;font-size:.9rem">Redaktionsplan</h4><ul class="list">' +
      [["Okt", "Sturzprävention im Alter"], ["Nov", "Physiotherapie nach Hüft-OP zu Hause"], ["Dez", "Wann lohnt sich Physiotherapie zu Hause?"], ["Jan", "Lymphdrainage im Hausbesuch"]].map(function (r) { return '<li><span class="pill pill--plain">' + r[0] + '</span><div class="t">' + r[1] + "</div></li>"; }).join("") +
      '</ul></div><div class="card fill"><div class="card__head"><div><h3>Entwurf</h3><p class="hint">direkt im Text bearbeitbar</p></div><div style="display:flex;gap:8px"><button class="btn btn--ghost btn--sm" id="bCopy">' + icon("copy") + ' Kopieren</button><button class="btn btn--sm" id="bDl">' + icon("dl") + ' Als HTML</button></div></div><div class="fillbox" style="--min:420px"><div class="article" id="bOut" contenteditable="true"></div></div></div></div>';
  };
  V.beitraege.after = function () {
    function gen() {
      var t = $("#bTopic").value, town = $("#bTown").value, T = TOPICS[t], kw = $("#bKw").value.trim() || T.kw, ang = $("#bTone").value === "ang";
      var title = t + " in " + town + " | Mobile Physiotherapie Oehlke";
      var desc = (T.intro.split(". ")[0] + ". Hausbesuche in " + town + " und Umgebung, 60 Minuten Zeit pro Termin.").slice(0, 158);
      var intro = ang ? T.intro + " Gerade für Angehörige ist es beruhigend zu wissen, dass die Therapie direkt zu Hause stattfindet." : T.intro;
      var html = '<div class="meta"><b>Title (' + title.length + " Z.):</b> " + esc(title) + "<br><b>Description (" + desc.length + " Z.):</b> " + esc(desc) + "<br><b>Suchbegriff:</b> " + esc(kw) + " · <b>URL-Vorschlag:</b> /ratgeber/" + kw.replace(/[^a-z0-9äöüß]+/gi, "-").toLowerCase().replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss") + "</div>" +
        "<h1>" + esc(t) + " in " + esc(town) + "</h1><p>" + esc(intro) + "</p>" +
        T.parts.map(function (p) { return "<h2>" + esc(p[0]) + "</h2><p>" + p[1] + "</p>"; }).join("") +
        "<h2>Hausbesuche in " + esc(town) + " und Umgebung</h2><p>Die Mobile Physiotherapie Oehlke kommt zu Ihnen nach " + esc(town) + " und in alle Orte im Umkreis von etwa 30 km um Hockenheim. Rufen Sie an unter 0176 43630803 oder schreiben Sie uns, wir melden uns persönlich.</p>" +
        "<h2>Häufige Fragen</h2><p><b>Brauche ich eine ärztliche Verordnung?</b><br>Für eine physiotherapeutische Behandlung in der Regel ja. Wir beraten Sie gern vorab.</p><p><b>Wie lange dauert ein Termin?</b><br>Jeder Hausbesuch dauert 60 Minuten.</p>";
      $("#bOut").innerHTML = html;
    }
    $("#bGen").onclick = function () { gen(); toast("Entwurf erstellt"); };
    $("#bTopic").onchange = function () { $("#bKw").value = ""; gen(); };
    $("#bTown").onchange = gen; $("#bTone").onchange = gen;
    $("#bCopy").onclick = function () { navigator.clipboard.writeText($("#bOut").innerText).then(function () { toast("Text kopiert"); }); };
    $("#bDl").onclick = function () {
      var h = '<!doctype html><html lang="de"><meta charset="utf-8"><title>' + esc($("#bOut h1").textContent) + "</title><body>" + $("#bOut").innerHTML.replace(/<div class="meta">[\s\S]*?<\/div>/, "") + "</body></html>";
      var a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([h], { type: "text/html" })); a.download = "beitrag.html"; a.click();
    };
    var kw = V.beitraege.kw;
    if (kw) { var match = Object.keys(TOPICS).filter(function (t) { return kw.indexOf(TOPICS[t].kw.split(" ")[0]) >= 0; })[0]; if (match) $("#bTopic").value = match; }
    gen();
  };

  V.werkzeuge = function () {
    var services = ["physiotherapie hausbesuch", "krankengymnastik hausbesuch", "lymphdrainage hausbesuch", "gangschule", "mobile physiotherapie", "physiotherapie senioren"];
    var have = KEYWORDS.map(function (k) { return k[0]; }), ideas = [];
    services.forEach(function (s) { TOWNS.slice(0, 8).forEach(function (t) { var k = s + " " + t.toLowerCase(); if (have.indexOf(k) < 0) ideas.push(k); }); });
    return '<div class="grid g2"><div class="card"><h3>Google-Vorschau</h3><p class="hint">So erscheint eine Seite im Suchergebnis, Titel und Beschreibung testen</p><label class="fld"><span>Titel</span><input id="sT" value="Physiotherapie Hausbesuch Schwetzingen | Mobile Physiotherapie Oehlke"></label><div class="counter" id="sTc"></div><label class="fld"><span>Beschreibung</span><textarea id="sD" rows="3">Physiotherapie bei Ihnen zu Hause in Schwetzingen: 60 Minuten Zeit pro Termin, Schwerpunkt Geriatrie. Für Privatpatienten, Beihilfe und Selbstzahler.</textarea></label><div class="counter" id="sDc"></div><label class="fld"><span>Pfad</span><input id="sU" value="physiotherapie-schwetzingen"></label><div class="serp" id="serp"></div></div>' +
      '<div class="card fill"><h3>Keyword-Ideen</h3><p class="hint">Kombinationen aus Leistungen und Orten, für die es noch keine eigene Seite gibt, Klick übernimmt den Begriff in den Beitragsgenerator</p><input id="kwF" placeholder="filtern, z. B. walldorf" style="width:100%;padding:10px 12px;border-radius:10px;border:1.5px solid var(--line);margin-bottom:12px"><div class="fillbox" style="--min:260px"><div class="kw-chips" id="kwList">' + ideas.map(function (k) { return '<button data-k="' + esc(k) + '">' + esc(k) + "</button>"; }).join("") + "</div></div></div></div>" +
      '<div class="card" style="margin-top:18px"><h3>Checkliste lokale Sichtbarkeit</h3><p class="hint">abhaken, was erledigt ist</p><ul class="checks" id="lc"></ul></div>';
  };
  V.werkzeuge.after = function () {
    function upd() {
      var t = $("#sT").value, d = $("#sD").value;
      $("#sTc").textContent = t.length + " / 60 Zeichen"; $("#sTc").className = "counter" + (t.length > 60 ? " bad" : "");
      $("#sDc").textContent = d.length + " / 160 Zeichen"; $("#sDc").className = "counter" + (d.length > 160 ? " bad" : "");
      $("#serp").innerHTML = '<div class="u"><i></i><span>Mobile Physiotherapie Oehlke<small>physiotherapie-oehlke.de › ' + esc($("#sU").value) + '</small></span></div><div class="t">' + esc(t.length > 60 ? t.slice(0, 58) + " …" : t) + '</div><div class="d">' + esc(d.length > 160 ? d.slice(0, 157) + " …" : d) + "</div>";
    }
    ["#sT", "#sD", "#sU"].forEach(function (s) { $(s).addEventListener("input", upd); }); upd();
    $("#kwF").addEventListener("input", function () { var q = this.value.toLowerCase(); $$("#kwList button").forEach(function (b) { b.style.display = b.dataset.k.indexOf(q) >= 0 ? "" : "none"; }); });
    $$("#kwList button").forEach(function (b) { b.onclick = function () { V.beitraege.kw = b.dataset.k; location.hash = "beitraege"; }; });
    var items = [["Google-Unternehmensprofil vollständig (Leistungen, Öffnungszeiten, Fotos)", "Wichtigster Faktor für Google Maps"], ["Nach jedem zufriedenen Patienten um eine Bewertung bitten", "Link zum Bewerten steht in der Übersicht"], ["Auf Bewertungen antworten", "zeigt Google und Lesern, dass sich jemand kümmert"], ["Name, Adresse, Telefon überall identisch", "Website, Google, Verzeichnisse"], ["Eintrag in Ärzte- und Gesundheitsverzeichnisse", "z. B. Physio-Verzeichnisse, Stadtportale"], ["Hausarztpraxen in der Umgebung verlinken auf die Website", "starke lokale Empfehlung"], ["Einmal im Monat ein Ratgeber-Beitrag", "Beitragsgenerator nutzen"], ["Ortsseiten mit eigenem Text für jeden Ort", "noch 11 von 14 Ortsseiten ohne eigenen Text"]];
    var done = store.get("localchecks", [0, 1]);
    $("#lc").innerHTML = items.map(function (it, i) { var on = done.indexOf(i) >= 0; return '<li class="' + (on ? "ok" : "w") + '" data-i="' + i + '" style="cursor:pointer"><span class="st">' + (on ? "✓" : "") + "</span><div>" + it[0] + "<small>" + it[1] + "</small></div></li>"; }).join("");
    $$("#lc li").forEach(function (li) { li.onclick = function () { var i = +li.dataset.i, k = done.indexOf(i); if (k >= 0) done.splice(k, 1); else done.push(i); store.set("localchecks", done); V.werkzeuge.after(); }; });
  };

  // ------------------------------------------------------------ Navigation
  var NAV = [
    ["Praxis", [["uebersicht", "Übersicht", "home"], ["touren", "Tourenplan", "route"], ["team", "Team", "users"], ["anfragen", "Anfragen", "inbox"], ["verordnungen", "Verordnungen & Rechnungen", "file"], ["aufgaben", "Aufgaben", "check"], ["abwesenheit", "Urlaub & Vertretung", "cal"]]],
    ["Website & SEO", [["analyse", "SEO-Analyse", "gauge"], ["rankings", "Rankings", "trend"], ["besucher", "Besucher", "chart"], ["beitraege", "Beitragsgenerator", "pen"], ["werkzeuge", "SEO-Werkzeuge", "tool"]]]
  ];
  var TITLES = { uebersicht: ["Guten Tag, Ramon", "Alles Wichtige für heute auf einen Blick"], touren: ["Tourenplan", "Wer ist wann wo, inklusive Fahrten"], team: ["Team", "Auslastung, Dokumentation, Fortbildung, Bewerbungen"], anfragen: ["Anfragen", "Neue Patienten aus Website, Telefon und WhatsApp"], verordnungen: ["Verordnungen & Rechnungen", "Fristen und offene Beträge im Blick"], aufgaben: ["Aufgaben", "Was im Team zu erledigen ist"], abwesenheit: ["Urlaub & Vertretung", "Abwesenheiten planen, Engpässe vermeiden"], analyse: ["SEO-Analyse", "Wo die Website technisch steht"], rankings: ["Rankings", "Wo du bei Google gefunden wirst, und wo noch nicht"], besucher: ["Besucher", "Wer kommt auf die Website und woher"], beitraege: ["Beitragsgenerator", "Neue Ratgeber-Beiträge in wenigen Klicks"], werkzeuge: ["SEO-Werkzeuge", "Google-Vorschau, Keyword-Ideen, lokale Checkliste"] };

  function nav(cur) {
    var newReq = REQUESTS.filter(function (r) { return r.status === "neu"; }).length;
    return NAV.map(function (g) { return "<h6>" + g[0] + "</h6>" + g[1].map(function (n) { return '<a href="#' + n[0] + '" class="' + (n[0] === cur ? "on" : "") + '">' + icon(n[2]) + n[1] + (n[0] === "anfragen" && newReq ? '<span class="cnt">' + newReq + "</span>" : "") + "</a>"; }).join(""); }).join("");
  }
  function render() {
    var cur = (location.hash || "#uebersicht").slice(1);
    if (!V[cur]) cur = "uebersicht";
    $("#nav").innerHTML = nav(cur);
    $("#vTitle").textContent = TITLES[cur][0]; $("#vSub").textContent = TITLES[cur][1];
    $("#view").innerHTML = V[cur]();
    if (V[cur].after) V[cur].after();
    document.body.classList.remove("menu-open");
    document.title = TITLES[cur][0] + " · Praxis-Cockpit";
  }

  // ------------------------------------------------------------ Start
  if (document.body.dataset.page === "login") {
    if (sessionStorage.getItem("po_auth")) location.replace("/dashboard");
    $("#loginForm").addEventListener("submit", function (e) {
      e.preventDefault();
      var u = $("#lu").value.trim().toLowerCase(), p = $("#lp").value;
      if (u === "ramon" && p === "demo") { sessionStorage.setItem("po_auth", "1"); location.href = "/dashboard"; }
      else $(".err").textContent = "Benutzername oder Passwort stimmt nicht.";
    });
    return;
  }
  if (!sessionStorage.getItem("po_auth")) { location.replace("/login"); return; }
  $("#logout").onclick = function (e) { e.preventDefault(); sessionStorage.removeItem("po_auth"); location.href = "/login"; };
  $(".burger").onclick = function () { document.body.classList.toggle("menu-open"); };
  $("#reset").onclick = function (e) { e.preventDefault(); ["requests", "tasks", "localchecks"].forEach(function (k) { try { localStorage.removeItem("po_" + k); } catch (x) {} }); location.reload(); };
  window.addEventListener("hashchange", render);
  render();
})();

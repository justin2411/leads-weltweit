/* Praxis-Cockpit, Mobile Physiotherapie Oehlke · Grundgerüst
   Demo mit Beispieldaten. Alles läuft im Browser, Änderungen bleiben in diesem Browser (localStorage).
   Die SEO-Analyse prüft die echten Seiten dieser Website. */
(function () {
  "use strict";
  var P = window.PC = {};
  var $ = P.$ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = P.$$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var esc = P.esc = function (s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); };
  P.store = {
    get: function (k, d) { try { var v = localStorage.getItem("po_" + k); return v ? JSON.parse(v) : d; } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem("po_" + k, JSON.stringify(v)); } catch (e) {} },
    del: function (k) { try { localStorage.removeItem("po_" + k); } catch (e) {} }
  };
  /* Hinweis unten, optional mit „Rückgängig“ */
  P.toast = function (msg, undo) {
    var t = $(".toast"); if (!t) return;
    t.innerHTML = esc(msg) + (undo ? ' <button type="button">Rückgängig</button>' : "");
    t.classList.add("show");
    if (undo) $("button", t).onclick = function () { undo(); t.classList.remove("show"); };
    clearTimeout(t._h); t._h = setTimeout(function () { t.classList.remove("show"); }, undo ? 6000 : 2400);
  };
  var seed = 7;
  P.seed = function (s) { seed = s; };
  P.rnd = function () { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  P.fmt = function (n) { return Number(n).toLocaleString("de-DE"); };
  P.eur = function (n) { return Number(n).toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " €"; };
  P.today = new Date(); P.today.setHours(0, 0, 0, 0);
  P.addDays = function (d, n) { var x = new Date(d); x.setDate(x.getDate() + n); return x; };
  P.dstr = function (d) { return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit" }); };
  P.dlong = function (d) { return d.toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }); };
  P.wd = function (d) { return d.toLocaleDateString("de-DE", { weekday: "short" }); };
  P.hhmm = function (m) { return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0"); };
  P.pct = function (a, b) { return b ? Math.round(a / b * 100) : 0; };
  P.plural = function (n, one, many) { return n + " " + (n === 1 ? one : many); };
  /* Werktage ab heute (Mo–Fr), Index 0 = heute bzw. nächster Werktag */
  P.dayLabel = function (di) { var d = P.workdays(di + 1)[di]; return d.getTime() === P.today.getTime() ? "heute" : P.wd(d) + " " + P.dstr(d); };
  P.workdays = function (n) {
    var out = [], d = new Date(P.today);
    while (out.length < n) { if (d.getDay() !== 0 && d.getDay() !== 6) out.push(new Date(d)); d = P.addDays(d, 1); }
    return out;
  };

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
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3"/>',
    dl: '<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>',
    spark: '<path d="M12 3c.6 4.2 2.8 6.4 7 7-4.2.6-6.4 2.8-7 7-.6-4.2-2.8-6.4-7-7 4.2-.6 6.4-2.8 7-7Z"/>',
    gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
    bolt: '<path d="M13 2 4 14h7l-1 8 9-12h-7Z"/>',
    send: '<path d="M22 2 11 13M22 2l-7 20-4-9-9-4Z"/>',
    pin: '<path d="M12 21s-7-6.2-7-11.5A7 7 0 0 1 19 9.5C19 14.8 12 21 12 21Z"/><circle cx="12" cy="9.5" r="2.5"/>',
    x: '<path d="M18 6 6 18M6 6l12 12"/>',
    back: '<path d="M15 18l-6-6 6-6"/>',
    next: '<path d="M9 18l6-6-6-6"/>',
    globe: '<circle cx="12" cy="12" r="9"/><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"/>',
    phone: '<path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2"/>',
    mobile: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/>',
    desktop: '<rect x="2" y="4" width="20" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>'
  };
  P.icon = function (n) { return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (I[n] || "") + "</svg>"; };

  // ------------------------------------------------------------ Orte und Entfernungen
  P.PRAXIS_POS = [49.3218, 8.5476];
  P.COORDS = {
    Hockenheim: [49.3218, 8.5476], Schwetzingen: [49.3833, 8.5667], Heidelberg: [49.3988, 8.6724], Ketsch: [49.3667, 8.5333],
    Oftersheim: [49.3667, 8.5833], Plankstadt: [49.3944, 8.5967], Reilingen: [49.2967, 8.5650], "Altlußheim": [49.3017, 8.4997],
    "Neulußheim": [49.2950, 8.5183], "Brühl": [49.4000, 8.5333], Walldorf: [49.3064, 8.6436], Wiesloch: [49.2942, 8.6983],
    Sandhausen: [49.3436, 8.6586], Eppelheim: [49.4019, 8.6336], Mannheim: [49.4875, 8.4660], Speyer: [49.3170, 8.4310]
  };
  P.TOWNS = ["Hockenheim", "Schwetzingen", "Heidelberg", "Ketsch", "Oftersheim", "Plankstadt", "Reilingen", "Altlußheim", "Neulußheim", "Brühl", "Walldorf", "Wiesloch", "Sandhausen", "Eppelheim"];
  P.TOWN_SLUG = function (t) { return "/physiotherapie-" + t.toLowerCase().replace(/ß/g, "ss").replace(/ü/g, "ue").replace(/ö/g, "oe").replace(/ä/g, "ae"); };
  /* Straßen-km ≈ Luftlinie × 1,3; innerhalb eines Ortes 2 km */
  P.km = function (a, b) {
    var A = Array.isArray(a) ? a : P.COORDS[a], B = Array.isArray(b) ? b : P.COORDS[b];
    if (!A || !B) return 0;
    var R = 6371, dLa = (B[0] - A[0]) * Math.PI / 180, dLo = (B[1] - A[1]) * Math.PI / 180;
    var h = Math.sin(dLa / 2) * Math.sin(dLa / 2) + Math.cos(A[0] * Math.PI / 180) * Math.cos(B[0] * Math.PI / 180) * Math.sin(dLo / 2) * Math.sin(dLo / 2);
    var d = 2 * R * Math.asin(Math.sqrt(h)) * 1.3;
    return Math.round(Math.max(d, 2) * 10) / 10;
  };
  /* Fahrzeit bei ~35 km/h im Umland, auf 5 Minuten gerundet, mindestens 5 */
  P.driveMin = function (km) { return Math.max(5, Math.round(km / 35 * 60 / 5) * 5); };

  // ------------------------------------------------------------ Einstellungen und Preise
  P.SETTINGS_DEFAULT = {
    name: "Mobile Physiotherapie Oehlke", owner: "Ramon Oehlke", street: "Leopoldstraße 5", zip: "68766", city: "Hockenheim",
    phone: "0176 43630803", mail: "info@physiotherapie-oehlke.de", taxno: "", iban: "", bic: "", bank: "",
    due: 14, prefix: new Date().getFullYear() + "-", nextNo: 47, cancelHours: 24, dunFee: 5
  };
  P.settings = function () { var s = P.store.get("settings", {}); var o = {}; for (var k in P.SETTINGS_DEFAULT) o[k] = s[k] != null ? s[k] : P.SETTINGS_DEFAULT[k]; return o; };
  P.saveSettings = function (o) { P.store.set("settings", o); };
  /* Beispielpreise, frei vereinbar (Orientierung: GebüTh / Beihilfe). Inhaber passt sie in den Einstellungen an. */
  P.PRICES_DEFAULT = [
    { k: "KG", name: "Krankengymnastik (KG)", min: 60, price: 78 },
    { k: "MT", name: "Manuelle Therapie (MT)", min: 60, price: 86 },
    { k: "MLD", name: "Manuelle Lymphdrainage (MLD)", min: 60, price: 92 },
    { k: "GS", name: "Gangschule und Gangtraining", min: 60, price: 78 },
    { k: "AT", name: "Alltagstraining", min: 60, price: 78 },
    { k: "ATM", name: "Atemtherapie", min: 60, price: 78 },
    { k: "KM", name: "Klassische Massage", min: 60, price: 70 },
    { k: "BEF", name: "Befundung und Erstberatung", min: 60, price: 65 },
    { k: "HB", name: "Hausbesuchspauschale", min: 0, price: 18 },
    { k: "WG", name: "Wegegeld je km", min: 0, price: 0.6 },
    { k: "AUS", name: "Ausfallhonorar (Absage unter 24 Std., nur mit Vereinbarung)", min: 0, price: 50 }
  ];
  P.prices = function () { return P.store.get("prices", P.PRICES_DEFAULT); };
  P.price = function (k) { var p = P.prices().filter(function (x) { return x.k === k; })[0]; return p ? p.price : 0; };
  P.pname = function (k) { var p = P.prices().filter(function (x) { return x.k === k; })[0]; return p ? p.name : k; };
  P.PAY = { privat: "Privat", beihilfe: "Beihilfe", selbst: "Selbstzahler" };

  // ------------------------------------------------------------ Team
  P.TEAM = [
    { id: "ro", name: "Ramon Oehlke", role: "Inhaber · Geriatrie", color: "#1b417a", soll: 22, doku: 1, fb: 48, ausfall: 3 },
    { id: "ls", name: "Lena Sommer", role: "Physiotherapeutin · MLD", color: "#237e92", soll: 24, doku: 3, fb: 31, ausfall: 6 },
    { id: "jk", name: "Jonas Keller", role: "Physiotherapeut · MT", color: "#5a8f27", soll: 24, doku: 0, fb: 12, ausfall: 2 },
    { id: "mw", name: "Marie Wagner", role: "Physiotherapeutin · Teilzeit", color: "#8a5a9e", soll: 14, doku: 2, fb: 55, ausfall: 4 }
  ];
  P.FB_DUE = "31.07.2029";
  P.person = function (id) { return P.TEAM.filter(function (t) { return t.id === id; })[0]; };
  P.initials = function (n) { return n.split(" ").map(function (x) { return x[0]; }).join("").slice(0, 2); };
  P.who = function (t, sub) { return t ? '<div class="who"><i style="background:' + t.color + '">' + P.initials(t.name) + '</i><div>' + esc(t.name) + (sub ? "<small>" + sub + "</small>" : "") + "</div></div>" : ""; };

  // ------------------------------------------------------------ Patient:innen (Beispieldaten)
  var FIRST_F = ["Margarete", "Ingrid", "Helga", "Ursula", "Renate", "Gisela", "Elke", "Brigitte", "Hannelore", "Christa", "Erika", "Monika", "Waltraud", "Irmgard"];
  var FIRST_M = ["Werner", "Klaus", "Günter", "Horst", "Dieter", "Manfred", "Heinz", "Gerhard", "Rolf", "Peter", "Bernd", "Helmut", "Karl", "Walter"];
  var LAST = ["Müller", "Kraus", "Schäfer", "Bauer", "Wolf", "Hofmann", "Richter", "Fischer", "Lehmann", "Trautmann", "Graf", "Neumann", "Becker", "Seitz", "Vogel", "Engel", "Roth", "Ziegler", "Heller", "Kuhn", "Arnold", "Brandt", "Keil", "Busch", "Lang", "Peters", "Jung", "Haas"];
  var DOCS = ["Dr. med. A. Schneider, Hockenheim", "Dr. med. B. Weiß, Schwetzingen", "Dr. med. C. Hartmann, Heidelberg", "Dr. med. D. Krüger, Walldorf", "Dr. med. E. Sauer, Ketsch"];
  var DIAG = [
    ["GS", "Gangunsicherheit, Sturzneigung", "R26.8"], ["KG", "Z. n. Hüft-TEP rechts", "Z96.64"], ["MLD", "Lymphödem Bein links", "I89.0"],
    ["KG", "Morbus Parkinson, Bewegungsstörung", "G20.1"], ["MT", "Chronische Lumbalgie", "M54.5"], ["AT", "Z. n. Schlaganfall, Alltagseinschränkung", "I69.4"],
    ["ATM", "COPD, Belastungsdyspnoe", "J44.9"], ["KG", "Z. n. Knie-TEP links", "Z96.65"], ["GS", "Polyneuropathie, Gangstörung", "G62.9"], ["KM", "Verspannungen HWS", "M54.2"]
  ];
  P.STATIC = (function () {
    P.seed(19);
    var plan = { ro: 11, ls: 12, jk: 12, mw: 7 }, pats = [], id = 1, towns = P.TOWNS.slice(0);
    Object.keys(plan).forEach(function (tid) {
      for (var i = 0; i < plan[tid]; i++) {
        var fem = P.rnd() > .45, last = LAST[(id * 7) % LAST.length], first = (fem ? FIRST_F : FIRST_M)[(id * 5) % 14];
        var dg = DIAG[(id * 3 + i) % DIAG.length], payR = P.rnd(), pay = payR < .55 ? "privat" : payR < .85 ? "beihilfe" : "selbst";
        var town = towns[Math.floor(P.rnd() * towns.length)];
        var units = [6, 10, 10, 12, 6, 10][id % 6], freq = units >= 10 ? 2 : 1 + (id % 2);
        var done = 1 + Math.floor(P.rnd() * (units - 2)), lastAgo = 1 + Math.floor(P.rnd() * 5);
        /* gezielte Fristfälle für die Demo */
        if (id === 3) done = 0;
        if (id === 9) lastAgo = 12;
        if (id === 14) done = units - 1;
        if (id === 20) done = 0;
        if (id === 27) done = units;
        var visits = [];
        for (var v = 0; v < done; v++) visits.push(-lastAgo - Math.round((done - 1 - v) * 7 / freq));
        var issued = done ? Math.min.apply(null, visits) - 4 - Math.floor(P.rnd() * 6) : (id === 3 ? -23 : -9);
        var billed = id % 3 === 0 ? Math.max(0, done - 1 - (id % 3 === 0 ? id % 4 : 0)) : done;
        pats.push({
          id: id, sex: fem ? "f" : "m", n: (fem ? "Frau " : "Herr ") + last[0] + ".", full: first + " " + last, last: last,
          addr: ["Lindenweg", "Gartenstraße", "Schillerstraße", "Am Bach", "Rosenweg", "Bergstraße", "Mühlweg"][id % 7] + " " + (2 + (id * 3) % 30), town: town,
          pay: pay, t: tid, tr: dg[0], diag: dg[1], icd: dg[2], freq: freq,
          rx: pay === "selbst" && id % 2 ? null : { issued: issued, urgent: id === 20, units: units, hb: id !== 11, doc: DOCS[id % DOCS.length] },
          visits: visits, billed: Math.min(billed, visits.length), days: freq === 1 ? [1 + (id % 5)] : [1 + (id % 5), 1 + ((id + 2) % 5)].concat(units >= 12 ? [1 + ((id + 4) % 5)] : [])
        });
        id++;
      }
    });
    return { patients: pats };
  })();
  P.patients = function () { return P.STATIC.patients; };
  P.patient = function (id) { return P.STATIC.patients.filter(function (p) { return p.id === id; })[0]; };

  /* Fristen (angelehnt an die Heilmittel-Richtlinie; bei Privat/Beihilfe Orientierung, keine Pflicht) */
  P.rxState = function (p) {
    if (!p.rx) return { level: "none", label: "ohne Verordnung", items: [] };
    var r = p.rx, done = p.visits.length, items = [], level = "good";
    function add(l, txt, days) { items.push({ level: l, txt: txt, days: days }); if (l === "bad") level = "bad"; else if (level === "good") level = "warn"; }
    if (!done) {
      var lim = r.urgent ? 14 : 28, left = r.issued + lim;
      if (left < 0) add("bad", "Behandlungsbeginn verpasst (" + lim + " Tage)", left);
      else if (left <= 7) add("warn", "Behandlung muss bis " + P.dstr(P.addDays(P.today, left)) + " beginnen" + (r.urgent ? " (dringlich, 14 Tage)" : " (28 Tage)"), left);
    } else {
      var last = Math.max.apply(null, p.visits), gap = -last, gleft = 14 - gap;
      if (gleft < 0) add("bad", "Unterbrechung über 14 Tage, Begründung (F/K/T) nötig", gleft);
      else if (gleft <= 4) add("warn", "Spätestens " + P.dstr(P.addDays(P.today, gleft)) + " nächste Behandlung (14-Tage-Grenze)", gleft);
    }
    var rest = r.units - done;
    if (rest <= 1) add(rest <= 0 ? "bad" : "warn", rest <= 0 ? "Alle Einheiten erbracht, Folgeverordnung anfragen" : "Noch 1 Einheit, Folgeverordnung anfragen", rest);
    if (!r.hb) add("warn", "Hausbesuch nicht auf der Verordnung vermerkt, beim Arzt ergänzen lassen", 0);
    return { level: level, items: items, rest: rest };
  };

  // ------------------------------------------------------------ Touren
  /* Besuche je Therapeut:in und Werktag-Index. Reihenfolge: gespeichert (optimiert) oder nach Aufnahme. */
  P.dayVisits = function (tid, di) {
    var day = P.workdays(di + 1)[di], wdNum = day.getDay();
    var list = P.patients().filter(function (p) { return p.t === tid && p.days.indexOf(wdNum) >= 0 && (!p.rx || p.rx.units - p.visits.length > 0 || p.pay === "selbst"); })
      .map(function (p) { return { pid: p.id, town: p.town, tr: p.tr, n: p.n }; });
    P.store.get("added", []).forEach(function (a) { if (a.t === tid && a.di === di) list.push({ pid: "w" + a.rid, town: a.town, tr: a.tr, n: a.n, added: true }); });
    var order = P.store.get("order", {})[tid + "@" + di];
    if (order) list.sort(function (a, b) { var ia = order.indexOf(String(a.pid)), ib = order.indexOf(String(b.pid)); return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib); });
    return list;
  };
  P.isCancelled = function (tid, di, pid) { return !!P.store.get("cancel", {})[tid + "@" + di + "@" + pid]; };
  /* Zeitplan mit Fahrten ab/bis Praxis Hockenheim, 60 Min. je Besuch, 30 Min. Pause nach dem 3. Besuch */
  P.schedule = function (tid, di) {
    var vs = P.dayVisits(tid, di), t = 8 * 60, pos = P.PRAXIS_POS, ev = [], km = 0, drive = 0, treat = 0, n = 0;
    vs.forEach(function (v) {
      var cancelled = P.isCancelled(tid, di, v.pid);
      var k = P.km(pos, v.town), d = P.driveMin(k);
      ev.push({ type: "drive", from: t, to: t + d, km: k }); t += d; km += k; drive += d;
      ev.push({ type: "visit", from: t, to: t + 60, pid: v.pid, town: v.town, tr: v.tr, n: v.n, km: k, cancelled: cancelled, added: v.added });
      t += 60; if (!cancelled) { treat += 60; n++; }
      pos = v.town;
      if (n === 3 && !ev.some(function (e) { return e.type === "break"; })) { ev.push({ type: "break", from: t, to: t + 30 }); t += 30; }
    });
    if (vs.length) { var kb = P.km(pos, P.PRAXIS_POS), db = P.driveMin(kb); ev.push({ type: "drive", from: t, to: t + db, km: kb, home: true }); km += kb; drive += db; t += db; }
    return { ev: ev, km: Math.round(km * 10) / 10, drive: drive, treat: treat, n: n, end: t };
  };
  /* Route optimieren: nächster Nachbar ab Praxis, danach 2-opt */
  P.optimize = function (tid, di) {
    var vs = P.dayVisits(tid, di); if (vs.length < 3) return null;
    var before = P.schedule(tid, di);
    var rest = vs.slice(0), route = [], pos = P.PRAXIS_POS;
    while (rest.length) { rest.sort(function (a, b) { return P.km(pos, a.town) - P.km(pos, b.town); }); var nx = rest.shift(); route.push(nx); pos = nx.town; }
    function len(r) { var s = 0, p = P.PRAXIS_POS; r.forEach(function (v) { s += P.km(p, v.town); p = v.town; }); return s + P.km(p, P.PRAXIS_POS); }
    var improved = true;
    while (improved) {
      improved = false;
      for (var i = 0; i < route.length - 1; i++) for (var j = i + 1; j < route.length; j++) {
        var c = route.slice(0, i).concat(route.slice(i, j + 1).reverse(), route.slice(j + 1));
        if (len(c) < len(route) - 0.05) { route = c; improved = true; }
      }
    }
    var order = P.store.get("order", {}); order[tid + "@" + di] = route.map(function (v) { return String(v.pid); }); P.store.set("order", order);
    var after = P.schedule(tid, di);
    return { before: before, after: after };
  };

  // ------------------------------------------------------------ Anfragen und Warteliste
  P.REQUESTS_DEFAULT = [
    { id: 1, name: "Frau Becker (Tochter)", town: "Schwetzingen", pay: "privat", tr: "GS", topic: "Mutter nach Hüft-OP, Gangunsicherheit", since: 0, status: "neu", src: "Website-Formular", hb: true },
    { id: 2, name: "Herr Lang", town: "Ketsch", pay: "selbst", tr: "MT", topic: "Rückenschmerzen, möchte Manuelle Therapie", since: 0, status: "neu", src: "Telefon", hb: true },
    { id: 3, name: "Frau Yilmaz", town: "Heidelberg", pay: "beihilfe", tr: "MLD", topic: "Lymphödem Bein, MLD 2× pro Woche", since: 4, status: "warteliste", src: "WhatsApp", hb: true },
    { id: 4, name: "Herr Krämer", town: "Walldorf", pay: "privat", tr: "KG", topic: "Parkinson, Gangschule", since: 9, status: "warteliste", src: "Hausarzt-Empfehlung", hb: true },
    { id: 5, name: "Frau Roth", town: "Brühl", pay: "privat", tr: "AT", topic: "Sturz im Bad, Angst vor Treppen", since: 12, status: "warteliste", src: "Website-Formular", hb: true },
    { id: 6, name: "Herr Schulz", town: "Mannheim", pay: "selbst", tr: "KG", topic: "Rücken, außerhalb des Einsatzgebiets", since: 6, status: "abgesagt", src: "Website-Formular", hb: false }
  ];
  P.requests = function () { return P.store.get("requests", P.REQUESTS_DEFAULT); };
  P.saveRequests = function (r) { P.store.set("requests", r); };
  /* Bester freier Platz: Therapeut:in + Tag mit dem kürzesten Umweg zu einem bestehenden Termin, max. 6 Besuche/Tag */
  P.bestSlots = function (town, max) {
    var out = [];
    for (var di = 0; di < 5; di++) P.TEAM.forEach(function (t) {
      var vs = P.dayVisits(t.id, di).filter(function (v) { return !P.isCancelled(t.id, di, v.pid); });
      var cap = t.id === "mw" ? 4 : 6; if (vs.length >= cap) return;
      var near = vs.length ? Math.min.apply(null, vs.map(function (v) { return P.km(v.town, town); })) : P.km(P.PRAXIS_POS, town);
      out.push({ t: t.id, di: di, km: near, load: vs.length });
    });
    out.sort(function (a, b) { return a.km - b.km || a.load - b.load || a.di - b.di; });
    return out.slice(0, max || 3);
  };

  // ------------------------------------------------------------ Rechnungen
  P.invoices = function () { return P.store.get("invoices", null) || P.seedInvoices(); };
  P.saveInvoices = function (l) { P.store.set("invoices", l); };
  /* Positionen aus noch nicht abgerechneten Behandlungen einer Patientin */
  P.invoiceLines = function (p, visits) {
    var lines = [], kmOne = P.km(P.PRAXIS_POS, p.town);
    visits.slice().sort(function (a, b) { return a - b; }).forEach(function (off) {
      var d = P.dlong(P.addDays(P.today, off));
      lines.push({ date: d, k: p.tr, txt: P.pname(p.tr) + ", 60 Min.", qty: 1, unit: P.price(p.tr) });
      lines.push({ date: d, k: "HB", txt: "Hausbesuchspauschale", qty: 1, unit: P.price("HB") });
      lines.push({ date: d, k: "WG", txt: "Wegegeld, " + String(kmOne).replace(".", ",") + " km", qty: kmOne, unit: P.price("WG") });
    });
    return lines;
  };
  P.sumLines = function (lines) { return Math.round(lines.reduce(function (s, l) { return s + l.qty * l.unit; }, 0) * 100) / 100; };
  P.nextInvoiceNo = function () { var s = P.settings(), no = s.prefix + String(s.nextNo).padStart(4, "0"); s.nextNo++; P.saveSettings(s); return no; };
  P.seedInvoices = function () {
    var list = [], s = P.settings(), n = s.nextNo - 4;
    [[2, 41, "offen", 1], [5, 23, "offen", 0], [8, 12, "offen", 0], [12, 30, "bezahlt", 0]].forEach(function (x) {
      var p = P.patient(x[0]); if (!p) return;
      var vis = p.visits.slice(0, Math.min(3, p.visits.length)); if (!vis.length) vis = [-x[1] - 10, -x[1] - 6];
      var lines = P.invoiceLines(p, vis);
      list.push({ no: s.prefix + String(n++).padStart(4, "0"), pid: p.id, date: -x[1], lines: lines, sum: P.sumLines(lines), status: x[2], dun: x[3], paid: x[2] === "bezahlt" ? -x[1] + 9 : null, seeded: true });
    });
    P.saveInvoices(list);
    return list;
  };
  P.unbilled = function (p) { return p.visits.slice().sort(function (a, b) { return a - b; }).slice(p.billed + (P.store.get("billedExtra", {})[p.id] || 0)); };
  P.invState = function (inv) {
    var s = P.settings(), dueIn = inv.date + s.due;
    if (inv.status === "bezahlt") return { cls: "good", txt: "bezahlt", days: 0 };
    if (dueIn >= 0) return { cls: "info", txt: "offen, fällig " + P.dstr(P.addDays(P.today, dueIn)), days: 0 };
    var over = -dueIn, step = ["", "Erinnerung verschickt", "1. Mahnung verschickt", "2. Mahnung verschickt"][inv.dun] || "";
    return { cls: over > 14 ? "bad" : "warn", txt: over + " Tg. überfällig" + (step ? " · " + step : ""), days: over };
  };

  // ------------------------------------------------------------ Diagramme
  P.lineChart = function (el, data, opts) {
    var box = el.classList.contains("chartbox");
    var W = box ? Math.max(300, el.clientWidth) : 720, H = box ? Math.max(200, el.clientHeight) : 240, PD = { l: 38, r: 12, t: 12, b: 26 };
    if (box && !el._ro && window.ResizeObserver) {
      var last = W + "x" + H;
      el._ro = new ResizeObserver(function () { var k = el.clientWidth + "x" + el.clientHeight; if (k !== last && el.isConnected) { last = k; P.lineChart(el, data, opts); } });
      el._ro.observe(el);
    }
    var max = Math.max.apply(null, data.map(function (d) { return d.v; })), top = Math.ceil(max / 20) * 20;
    var x = function (i) { return PD.l + i * (W - PD.l - PD.r) / (data.length - 1); };
    var y = function (v) { return H - PD.b - v / top * (H - PD.t - PD.b); };
    var pts = data.map(function (d, i) { return x(i).toFixed(1) + "," + y(d.v).toFixed(1); });
    var g = "";
    for (var k = 0; k <= 4; k++) { var vv = top / 4 * k; g += '<line class="grid-l" x1="' + PD.l + '" x2="' + (W - PD.r) + '" y1="' + y(vv) + '" y2="' + y(vv) + '"/><text class="axis" x="' + (PD.l - 8) + '" y="' + (y(vv) + 4) + '" text-anchor="end">' + vv + "</text>"; }
    var step = Math.ceil(data.length / 6);
    data.forEach(function (d, i) { if (i % step === 0 || i === data.length - 1) g += '<text class="axis" x="' + x(i) + '" y="' + (H - 6) + '" text-anchor="middle">' + P.dstr(d.d) + "</text>"; });
    el.innerHTML = '<div class="chart"><svg viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="' + esc(opts.label) + '"><defs><linearGradient id="chartFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#46b2d0" stop-opacity=".28"/><stop offset="1" stop-color="#46b2d0" stop-opacity="0"/></linearGradient></defs>' + g +
      '<path class="ar" d="M' + pts[0] + " L" + pts.join(" L") + " L" + x(data.length - 1) + "," + y(0) + " L" + x(0) + "," + y(0) + ' Z"/><polyline class="ln" points="' + pts.join(" ") + '"/>' +
      '<line class="cross" y1="' + PD.t + '" y2="' + (H - PD.b) + '" style="display:none"/><circle class="mk" r="5" style="display:none"/><rect x="' + PD.l + '" y="0" width="' + (W - PD.l - PD.r) + '" height="' + H + '" fill="transparent" class="hit"/></svg><div class="tip"></div></div>';
    var svg = $("svg", el), tip = $(".tip", el), cr = $(".cross", el), mk = $(".mk", el);
    function show(evt) {
      var r = svg.getBoundingClientRect(), px = (evt.clientX - r.left) / r.width * W;
      var i = Math.max(0, Math.min(data.length - 1, Math.round((px - PD.l) / ((W - PD.l - PD.r) / (data.length - 1)))));
      var cx = x(i), cy = y(data[i].v);
      cr.setAttribute("x1", cx); cr.setAttribute("x2", cx); cr.style.display = "";
      mk.setAttribute("cx", cx); mk.setAttribute("cy", cy); mk.style.display = "";
      tip.innerHTML = data[i].d.toLocaleDateString("de-DE", { weekday: "short", day: "2-digit", month: "2-digit" }) + " · <b>" + data[i].v + "</b> " + opts.unit;
      tip.style.left = (cx / W * r.width) + "px"; tip.style.top = (cy / H * r.height) + "px"; tip.style.opacity = 1;
    }
    $(".hit", el).addEventListener("mousemove", show);
    $(".hit", el).addEventListener("mouseleave", function () { tip.style.opacity = 0; cr.style.display = "none"; mk.style.display = "none"; });
  };
  P.hbars = function (rows, unit) {
    var max = Math.max.apply(null, rows.map(function (r) { return r[1]; })) || 1;
    return '<div class="hbars">' + rows.map(function (r) { return '<div class="hbar" title="' + esc(r[0]) + ": " + r[1] + unit + '"><span>' + esc(r[0]) + '</span><span class="track"><i style="width:' + (r[1] / max * 100) + '%"></i></span><span class="v">' + r[1] + unit + "</span></div>"; }).join("") + "</div>";
  };
  P.kpi = function (lbl, val, delta, ic) { return '<div class="card kpi"><span class="ico">' + P.icon(ic) + '</span><div class="lbl">' + lbl + '</div><div class="val">' + val + '</div><div class="delta">' + delta + "</div></div>"; };
  P.empty = function (title, text, btn) { return '<div class="empty-state"><b>' + title + "</b><p>" + text + "</p>" + (btn || "") + "</div>"; };

  // ------------------------------------------------------------ Router und Rahmen
  P.V = {};
  /* Module nach geschäftlicher Aufgabe (Oehlke Business OS). phase = Entwicklungsphase laut Konzept */
  P.MODULES = [
    { id: "dashboard", nr: "01", name: "Dashboard", icon: "home", phase: 1, views: [["dashboard", "Übersicht"]] },
    { id: "nachfrage", nr: "02", name: "Patienten & Nachfrage", icon: "inbox", phase: 3, views: [["patienten", "Anfragen & Warteliste"], ["verordnungen", "Verordnungen"]] },
    { id: "personal", nr: "03", name: "Personal & Kapazitäten", icon: "users", phase: 3, views: [["kapazitaet", "Kapazität & Einstellungen"], ["team", "Team"], ["abwesenheit", "Urlaub & Vertretung"]] },
    { id: "touren", nr: "04", name: "Touren & Einsatzplanung", icon: "route", phase: 4, views: [["touren", "Touren"]] },
    { id: "finanzen", nr: "05", name: "Controlling & Finanzen", icon: "euro", phase: 2, views: [["controlling", "Controlling"], ["rechnungen", "Rechnungen & Zahlungen"]] },
    { id: "marketing", nr: "06", name: "Marketing & Wachstum", icon: "trend", phase: 5, views: [["marketing", "Kanäle & Ergebnisse"], ["beitraege", "Beiträge mit KI"], ["analyse", "SEO-Analyse"], ["rankings", "Rankings"], ["besucher", "Besucher"], ["werkzeuge", "Werkzeuge"]] },
    { id: "partner", nr: "07", name: "Partner & Zuweiser", icon: "star", phase: 5, views: [["partner", "Partner-CRM"]] },
    { id: "auto", nr: "08", name: "Aufgaben & Automationen", icon: "bolt", phase: 1, views: [["automationen", "Automationen"], ["freigaben", "Freigaben"], ["aufgaben", "Aufgaben"]] },
    { id: "berichte", nr: "09", name: "Berichte & Prognosen", icon: "chart", phase: 6, views: [["prognosen", "Prognosen & Szenarien"]] },
    { id: "system", nr: "10", name: "System & Einstellungen", icon: "gear", phase: 1, views: [["datenquellen", "Datenquellen & Sync"], ["rechte", "Rollen & Rechte"], ["protokoll", "Protokoll"], ["einstellungen", "Praxisdaten & Preise"]] }
  ];
  P.moduleOf = function (view) { return P.MODULES.filter(function (m) { return m.views.some(function (v) { return v[0] === view; }); })[0]; };
  P.TITLES = {};
  P.badges = {};
  P.can = function () { return true; };
  function nav(cur) {
    var mod = P.moduleOf(cur) || P.MODULES[0];
    return '<h6>Oehlke Business OS</h6>' + P.MODULES.filter(function (m) { return P.can(m.id) !== "kein"; }).map(function (m) {
      var b = m.views.reduce(function (s, v) { return s + (P.badges[v[0]] ? P.badges[v[0]]() : 0); }, 0);
      var first = m.views.filter(function (v) { return P.V[v[0]]; })[0] || m.views[0];
      return '<a href="#' + first[0] + '" class="' + (m === mod ? "on" : "") + '">' + P.icon(m.icon) + '<span class="nav-nr">' + m.nr + "</span>" + m.name + (b ? '<span class="cnt">' + b + "</span>" : "") + "</a>";
    }).join("");
  }
  function tabs(cur) {
    var m = P.moduleOf(cur); if (!m || m.views.length < 2) return "";
    return '<nav class="mtabs" aria-label="' + esc(m.name) + '">' + m.views.map(function (v) { var b = P.badges[v[0]] ? P.badges[v[0]]() : 0; return '<a href="#' + v[0] + '" class="' + (v[0] === cur ? "on" : "") + '">' + v[1] + (b ? ' <span class="cnt">' + b + "</span>" : "") + "</a>"; }).join("") + "</nav>";
  }
  P.route = function () { var h = (location.hash || "#dashboard").slice(1).split("/"); return { view: h[0] === "heute" ? "dashboard" : h[0], arg: h[1] }; };
  P.render = function () {
    var r = P.route(), cur = P.V[r.view] ? r.view : "dashboard";
    var navKey = P.TITLES[cur] && P.TITLES[cur].nav || cur, mod = P.moduleOf(navKey);
    $("#nav").innerHTML = nav(navKey);
    var t = P.TITLES[cur] || ["", ""];
    $("#vTitle").textContent = typeof t[0] === "function" ? t[0](r.arg) : t[0];
    $("#vSub").textContent = typeof t[1] === "function" ? t[1](r.arg) : t[1];
    var allowed = !mod || P.can(mod.id) !== "kein";
    $("#view").innerHTML = allowed ? tabs(navKey) + P.V[cur](r.arg) : P.empty("Keine Berechtigung", "Dieser Bereich ist für die gewählte Rolle nicht freigegeben.");
    if (allowed && P.V[cur].after) P.V[cur].after(r.arg);
    document.body.classList.remove("menu-open");
    document.title = $("#vTitle").textContent + " · Oehlke Business OS";
    document.body.classList.toggle("has-foot", !!$(".studio__foot"));
    $$("[data-go]").forEach(function (b) { b.addEventListener("click", function () { location.hash = b.dataset.go; }); });
    if (P.afterRender) P.afterRender();
  };
  P.rerender = function () { var y = window.scrollY; P.render(); window.scrollTo(0, y); };

  P.start = function () {
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
    $("#reset").onclick = function (e) {
      e.preventDefault();
      if (!confirm("Alle Beispieldaten und Änderungen in diesem Browser zurücksetzen?")) return;
      Object.keys(localStorage).forEach(function (k) { if (k.indexOf("po_") === 0) P.store.del(k.slice(3)); });
      location.hash = "dashboard"; location.reload();
    };
    if (P.onStart) P.onStart.forEach(function (f) { f(); });
    window.addEventListener("hashchange", P.render);
    P.render();
  };
  document.addEventListener("DOMContentLoaded", function () { setTimeout(P.start, 0); });
})();

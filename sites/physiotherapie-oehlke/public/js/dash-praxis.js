/* Praxis-Cockpit · Praxis: Heute, Touren, Anfragen, Verordnungen, Rechnungen, Team, Aufgaben, Urlaub, Einstellungen */
(function () {
  "use strict";
  var P = window.PC, $ = P.$, $$ = P.$$, esc = P.esc, icon = P.icon, store = P.store, V = P.V;
  var GOOGLE_REVIEW = "https://www.google.com/search?hl=de&q=Mobile+Physiotherapie+Oehlke&ludocid=9389132945967097191#lrd=0x4f769d8bc25e5f07:0x824ce6ab29492567,3";
  var GOOGLE_READ = "https://www.google.com/search?hl=de&q=Mobile+Physiotherapie+Oehlke&ludocid=9389132945967097191#lrd=0x4f769d8bc25e5f07:0x824ce6ab29492567,1";
  var PLZ = { Hockenheim: "68766", Schwetzingen: "68723", Heidelberg: "69115", Ketsch: "68775", Oftersheim: "68723", Plankstadt: "68723", Reilingen: "68799", "Altlußheim": "68804", "Neulußheim": "68809", "Brühl": "68782", Walldorf: "69190", Wiesloch: "69168", Sandhausen: "69207", Eppelheim: "69214" };
  var PAYCLS = { privat: "info", beihilfe: "plain", selbst: "good" };
  function pay(k) { return '<span class="pill pill--' + PAYCLS[k] + ' pill--plain">' + P.PAY[k] + "</span>"; }
  function revenueVisit(town, tr) { return P.price(tr) + P.price("HB") + P.price("WG") * P.km(P.PRAXIS_POS, town); }

  // ------------------------------------------------------------ Dialog
  P.modal = function (o) {
    var m = document.createElement("div");
    m.className = "modal"; m.setAttribute("role", "dialog"); m.setAttribute("aria-modal", "true");
    m.innerHTML = '<div class="modal__box"><div class="modal__head"><h3>' + o.title + '</h3><button class="modal__x" aria-label="Schließen">' + icon("x") + "</button></div>" +
      '<div class="modal__body">' + o.body + '</div><div class="modal__foot">' + (o.actions || []).map(function (a, i) { return '<button class="btn ' + (a.cls || "") + '" data-a="' + i + '">' + a.label + "</button>"; }).join("") + "</div></div>";
    document.body.appendChild(m);
    function close() { m.remove(); document.removeEventListener("keydown", key); }
    function key(e) { if (e.key === "Escape") close(); }
    document.addEventListener("keydown", key);
    m.addEventListener("click", function (e) { if (e.target === m) close(); });
    $(".modal__x", m).onclick = close;
    $$("[data-a]", m).forEach(function (b) { b.onclick = function () { var a = o.actions[+b.dataset.a]; if (a.fn(m) !== false) close(); }; });
    var f = $("textarea,input", m); if (f) f.focus();
    return m;
  };
  P.textModal = function (title, hint, text, extra) {
    P.modal({
      title: title, body: '<p class="hint">' + hint + '</p><textarea class="modal__text" rows="14">' + esc(text) + "</textarea>",
      actions: (extra || []).concat([{ label: icon("copy") + " Kopieren", cls: "btn--ghost", fn: function (m) { navigator.clipboard.writeText($("textarea", m).value).then(function () { P.toast("Text kopiert"); }); return false; } }, { label: "Fertig", fn: function () {} }])
    });
  };

  // ------------------------------------------------------------ Texte
  function doctorRequest(p) {
    var t = P.person(p.t), r = p.rx;
    return "Sehr geehrte Damen und Herren,\n\nfür " + (p.sex === "f" ? "Ihre Patientin Frau " : "Ihren Patienten Herrn ") + p.full + " (" + p.town + ") " +
      (r && r.units - p.visits.length <= 1 ? "bitten wir um eine Folgeverordnung:\n\n" : "bitten wir um Ergänzung der Verordnung:\n\n") +
      "Heilmittel: " + P.pname(p.tr) + "\nAnzahl: " + (r ? r.units : 10) + " Einheiten, " + p.freq + "× wöchentlich\nHausbesuch: ja (bitte auf der Verordnung vermerken)\nDiagnose: " + p.diag + " (" + p.icd + ")\n\n" +
      "Kurz zum Verlauf: Bisher " + p.visits.length + " Behandlungen. [Fortschritt in 1–2 Sätzen, z. B. Gehstrecke, Sicherheit beim Aufstehen]\n" +
      "Weiteres Ziel: [z. B. sicheres Gehen mit Rollator in der Wohnung und bis zum Briefkasten]\n\n" +
      "Gern schicken wir Ihnen einen ausführlichen Therapiebericht.\n\nMit freundlichen Grüßen\n" + t.name + "\nMobile Physiotherapie Oehlke · 0176 43630803";
  }
  function therapyReport(p) {
    var t = P.person(p.t), r = p.rx, first = p.visits.length ? P.dlong(P.addDays(P.today, Math.min.apply(null, p.visits))) : "[Datum]";
    return "Therapiebericht\n\nPatient:in: " + p.full + ", " + p.town + "\nVerordnung: " + (r ? r.doc + ", vom " + P.dlong(P.addDays(P.today, r.issued)) : "Selbstzahler, ohne Verordnung") +
      "\nDiagnose: " + p.diag + " (" + p.icd + ")\nHeilmittel: " + P.pname(p.tr) + ", Hausbesuch\nBehandlungen: " + p.visits.length + (r ? " von " + r.units : "") + ", seit " + first + "\n\n" +
      "Befund zu Beginn:\n[z. B. Gehstrecke 20 m mit Rollator, Aufstehen nur mit Hilfe, Timed-Up-and-Go 24 s]\n\n" +
      "Verlauf und Maßnahmen:\n[Kraft- und Gleichgewichtstraining, Gangschule im Wohnumfeld, Transfertraining, Anleitung der Angehörigen]\n\n" +
      "Aktueller Stand:\n[z. B. Gehstrecke 80 m mit Rollator, Aufstehen selbstständig, TUG 16 s]\n\n" +
      "Empfehlung:\n[z. B. Fortsetzung 2× wöchentlich für weitere 10 Einheiten, Ziel: Treppe mit Geländer]\n\n" +
      t.name + ", " + t.role.split(" · ")[0] + "\nMobile Physiotherapie Oehlke";
  }
  function priceInfo() {
    var pr = P.prices();
    return "Information zu den Kosten (vor Behandlungsbeginn)\n\nWir behandeln Sie zu folgenden Preisen:\n" +
      pr.filter(function (x) { return ["KG", "MT", "MLD", "GS", "HB", "WG", "AUS"].indexOf(x.k) >= 0; }).map(function (x) { return "• " + x.name + (x.min ? ", " + x.min + " Min." : "") + ": " + P.eur(x.price); }).join("\n") +
      "\n\nBitte beachten Sie: Private Krankenversicherung und Beihilfe erstatten oft nicht den vollen Betrag. Den Eigenanteil tragen Sie selbst. Fragen Sie im Zweifel vorab bei Ihrer Versicherung nach.\n\n" +
      "Termine, die nicht mindestens " + P.settings().cancelHours + " Stunden vorher abgesagt werden, können wir nach Vereinbarung in Rechnung stellen. Sie dürfen nachweisen, dass uns kein oder ein geringerer Schaden entstanden ist.\n\nMobile Physiotherapie Oehlke · Ramon Oehlke";
  }
  function reviewText() { return "Liebe Frau …, vielen Dank für Ihr Vertrauen! Wenn Sie mit der Behandlung zufrieden waren, würden wir uns sehr über eine kurze Google-Bewertung freuen. Das hilft anderen bei der Suche nach Physiotherapie zu Hause:\n" + GOOGLE_REVIEW + "\n\nHerzliche Grüße, Ramon Oehlke"; }
  P.reviewModal = function () {
    P.textModal("Bewertung anfragen", "Am besten nach einer abgeschlossenen Behandlungsserie schicken. Bewertungen helfen bei Google Maps am meisten.", reviewText(), [
      { label: "Per WhatsApp", cls: "btn--lime", fn: function (m) { window.open("https://wa.me/?text=" + encodeURIComponent($("textarea", m).value), "_blank", "noopener"); store.set("review_sent", 1); return false; } }
    ]);
  };

  // ------------------------------------------------------------ Nächste Schritte
  P.seoActions = P.seoActions || [];
  P.actions = function () {
    var out = [];
    P.patients().forEach(function (p) {
      var s = P.rxState(p); if (s.level === "good" || s.level === "none") return;
      s.items.forEach(function (it) {
        var isRx = /Folgeverordnung|Hausbesuch nicht/.test(it.txt);
        out.push({ sev: it.level, ico: "file", t: p.n + ", " + p.town + ": " + it.txt, s: P.person(p.t).name + " · " + P.pname(p.tr) + " · " + P.PAY[p.pay],
          btn: isRx ? ["Arzt anfragen", function () { P.textModal("Anfrage an den Arzt", "Entwurf, bitte prüfen und per Fax, E-Mail oder Telefon weitergeben.", doctorRequest(p)); }] : ["Tour ansehen", "#touren"] });
      });
    });
    var ub = 0, ubSum = 0, ubP = 0;
    P.patients().forEach(function (p) { var u = P.unbilled(p); if (u.length) { ub += u.length; ubP++; ubSum += P.sumLines(P.invoiceLines(p, u)); } });
    if (ub) out.push({ sev: "warn", ico: "euro", t: P.plural(ub, "Behandlung", "Behandlungen") + " bei " + ubP + " Patient:innen noch nicht abgerechnet", s: "zusammen " + P.eur(ubSum), btn: ["Rechnungen erstellen", "#rechnungen"] });
    P.invoices().forEach(function (inv) {
      var st = P.invState(inv); if (!st.days) return;
      var p = P.patient(inv.pid);
      out.push({ sev: st.days > 14 ? "bad" : "warn", ico: "euro", t: "Rechnung " + inv.no + " (" + (p ? p.n : "") + ") " + st.days + " Tage überfällig", s: P.eur(inv.sum) + (inv.dun ? " · " + st.txt.split(" · ")[1] : " · noch nicht erinnert"), btn: ["Mahnstufe erstellen", "#rechnungen"] });
    });
    P.requests().forEach(function (r) {
      if (r.status === "neu") out.push({ sev: "warn", ico: "inbox", t: "Neue Anfrage: " + r.name + ", " + r.town, s: r.topic + " · " + r.src, btn: ["Ansehen", "#patienten"] });
      if (r.status === "warteliste" && r.since >= 7 && P.TOWNS.indexOf(r.town) >= 0) {
        var b = P.bestSlots(r.town, 1)[0];
        if (b) out.push({ sev: "info", ico: "pin", t: r.name + " wartet seit " + r.since + " Tagen", s: "Freier Platz: " + P.person(b.t).name.split(" ")[0] + ", " + P.wd(P.workdays(5)[b.di]) + " " + P.dstr(P.workdays(5)[b.di]) + ", " + String(b.km).replace(".", ",") + " km vom nächsten Termin", btn: ["Einplanen", function () { P.planRequest(r.id, b); }] });
      }
    });
    P.TEAM.forEach(function (t) {
      var s = P.schedule(t.id, 0); if (s.n < 3 || store.get("order", {})[t.id + "@0"]) return;
      var cur = s.km, opt = P.previewOpt(t.id, 0);
      if (opt && cur - opt >= 4) out.push({ sev: "info", ico: "route", t: "Route " + t.name.split(" ")[0] + " " + P.dayLabel(0) + ": " + String(Math.round((cur - opt) * 10) / 10).replace(".", ",") + " km sparen", s: "Reihenfolge der Besuche optimieren, " + P.plural(s.n, "Besuch", "Besuche"), btn: ["Optimieren", function () { var r = P.optimize(t.id, 0); P.toast("Route optimiert: " + r.before.km + " → " + r.after.km + " km"); P.rerender(); }] });
    });
    P.TEAM.forEach(function (t) { if (t.doku > 1) out.push({ sev: "info", ico: "pen", t: t.doku + " Dokumentationen offen", s: t.name, btn: ["Team", "#team"] }); });
    P.TEAM.forEach(function (t) { var exp = expectedFb(); if (t.fb < exp - 8) out.push({ sev: "info", ico: "star", t: "Fortbildung: " + t.name + " liegt zurück", s: t.fb + " von 60 Punkten, Soll heute etwa " + exp + " (Frist " + P.FB_DUE + ")", btn: ["Team", "#team"] }); });
    P.seoActions.forEach(function (f) { var a = f(); if (a) out = out.concat(a); });
    var rank = { bad: 0, warn: 1, info: 2 };
    return out.sort(function (a, b) { return rank[a.sev] - rank[b.sev]; });
  };
  P.previewOpt = function (tid, di) {
    var vs = P.dayVisits(tid, di); if (vs.length < 3) return null;
    var rest = vs.slice(0), pos = P.PRAXIS_POS, s = 0;
    while (rest.length) { rest.sort(function (a, b) { return P.km(pos, a.town) - P.km(pos, b.town); }); var nx = rest.shift(); s += P.km(pos, nx.town); pos = nx.town; }
    return Math.round((s + P.km(pos, P.PRAXIS_POS)) * 10) / 10;
  };
  function expectedFb() { var start = new Date(2025, 7, 1), end = new Date(2029, 6, 31); return Math.round(60 * (P.today - start) / (end - start)); }
  function actionList(list, limit) {
    if (!list.length) return P.empty("Alles erledigt", "Gerade gibt es nichts, das Aufmerksamkeit braucht.");
    return '<ul class="actions">' + list.slice(0, limit).map(function (a, i) {
      return '<li class="act act--' + a.sev + '"><span class="act__ico">' + icon(a.ico) + '</span><div class="t">' + esc(a.t) + "<small>" + esc(a.s) + "</small></div>" +
        (a.btn ? '<button class="btn btn--sm ' + (a.sev === "bad" ? "" : "btn--ghost") + '" data-act="' + i + '">' + a.btn[0] + "</button>" : "") + "</li>";
    }).join("") + "</ul>";
  }
  function bindActions(list) {
    $$("[data-act]").forEach(function (b) { b.onclick = function () { var a = list[+b.dataset.act].btn[1]; if (typeof a === "function") a(); else location.hash = a; }; });
  }

  // ------------------------------------------------------------ Einrichtung (Erste Schritte)
  function onboarding() {
    var s = P.settings(), arts = store.get("articles", []);
    return [
      { t: "Praxisdaten für Rechnungen ergänzen", s: "Steuernummer und Bankverbindung, damit Rechnungen vollständig sind", done: !!(s.taxno && s.iban), go: "#einstellungen" },
      { t: "Preise prüfen und bestätigen", s: "Beispielpreise durch eigene ersetzen", done: !!store.get("prices_ok"), go: "#einstellungen" },
      { t: "Eine Tour optimieren", s: "Reihenfolge der Hausbesuche automatisch sortieren", done: Object.keys(store.get("order", {})).length > 0, go: "#touren" },
      { t: "Ersten Beitrag mit der KI erstellen", s: "Vorschlag wählen, prüfen, veröffentlichen", done: arts.some(function (a) { return a.user; }), go: "#beitraege" },
      { t: "Bewertung bei Patient:innen anfragen", s: "Link per WhatsApp schicken", done: !!store.get("review_sent"), fn: P.reviewModal }
    ];
  }

  // ------------------------------------------------------------ Heute
  P.TITLES.heute = [function () { var h = new Date().getHours(); return (h < 11 ? "Guten Morgen" : h < 18 ? "Guten Tag" : "Guten Abend") + ", Ramon"; }, function () { return P.today.toLocaleDateString("de-DE", { weekday: "long", day: "numeric", month: "long" }) + " · was heute wichtig ist"; }];
  V.heute = function () {
    var acts = P.actions(); V.heute._acts = acts;
    var sch = P.TEAM.map(function (t) { return P.schedule(t.id, 0); });
    var n = sch.reduce(function (s, x) { return s + x.n; }, 0), dr = sch.reduce(function (s, x) { return s + x.drive; }, 0), tr = sch.reduce(function (s, x) { return s + x.treat; }, 0);
    var ubSum = 0; P.patients().forEach(function (p) { var u = P.unbilled(p); if (u.length) ubSum += P.sumLines(P.invoiceLines(p, u)); });
    var open = P.invoices().filter(function (i) { return i.status !== "bezahlt"; }), openSum = open.reduce(function (s, i) { return s + i.sum; }, 0);
    var onb = onboarding(), onbDone = onb.filter(function (x) { return x.done; }).length, showOnb = !store.get("onb_hide") && onbDone < onb.length;
    var crit = acts.filter(function (a) { return a.sev === "bad"; }).length;
    return '<div class="grid g4">' +
      P.kpi("Hausbesuche " + P.dayLabel(0), n, "Team gesamt, " + P.fmt(Math.round(sch.reduce(function (s, x) { return s + x.km; }, 0))) + " km", "route") +
      P.kpi("Fahrzeit-Anteil", P.pct(dr, dr + tr) + "<small> %</small>", dr + " Min. Fahrt, " + tr + " Min. Behandlung", "gauge") +
      P.kpi("Abrechnungsbereit", P.fmt(Math.round(ubSum)) + "<small> €</small>", '<a href="#rechnungen">Rechnungen erstellen →</a>', "euro") +
      P.kpi("Offene Posten", P.fmt(Math.round(openSum)) + "<small> €</small>", P.plural(open.length, "Rechnung", "Rechnungen") + " offen", "file") +
      '</div><div class="grid g-21" style="margin-top:18px"><div class="stack"><div class="card"><div class="card__head"><div><h3>Nächste Schritte</h3><p class="hint">automatisch aus Verordnungen, Touren, Rechnungen und Anfragen erkannt, das Wichtigste zuerst</p></div>' +
      (crit ? '<span class="pill pill--bad">' + crit + " dringend</span>" : '<span class="pill pill--good">nichts Dringendes</span>') + "</div>" + actionList(acts, 7) +
      (acts.length > 7 ? '<button class="btn btn--ghost btn--sm" id="moreActs" style="margin-top:10px">Alle ' + acts.length + " anzeigen</button>" : "") + "</div>" +
      '<div class="card fill"><div class="card__head"><div><h3>' + (P.dayLabel(0) === "heute" ? "Heute unterwegs" : "Unterwegs am " + P.dayLabel(0)) + '</h3><p class="hint">Touren aller Therapeut:innen mit Fahrzeiten</p></div><a class="btn btn--ghost btn--sm" href="#touren">Touren planen</a></div>' + P.timeline(0) + "</div></div>" +
      '<div class="stack">' + (showOnb ? '<div class="card onb"><div class="card__head"><div><h3>Erste Schritte</h3><p class="hint">' + onbDone + " von " + onb.length + ' erledigt</p></div><button class="btn btn--ghost btn--sm" id="onbHide">Ausblenden</button></div><div class="bar lime" style="margin-bottom:12px"><i style="width:' + P.pct(onbDone, onb.length) + '%"></i></div><ol class="onb__list">' +
        onb.map(function (x, i) { return '<li class="' + (x.done ? "done" : "") + '"><span class="st">' + (x.done ? "✓" : i + 1) + '</span><div class="t">' + x.t + "<small>" + x.s + "</small></div>" + (x.done ? "" : '<button class="btn btn--sm btn--ghost" data-onb="' + i + '">Los</button>') + "</li>"; }).join("") + "</ol></div>" : "") +
      '<div class="card"><h3>Google-Bewertungen</h3><p class="hint">Stand laut Google-Profil</p><div style="display:flex;align-items:center;gap:14px"><span style="font:600 2.4rem var(--f-head);color:var(--navy)">5,0</span><div><div class="stars">★★★★★</div><small style="color:var(--ink-mute)">21 Bewertungen</small></div></div><div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px"><button class="btn btn--sm btn--lime" id="askReview">Bewertung anfragen</button><a class="btn btn--sm btn--ghost" href="' + GOOGLE_READ + '" target="_blank" rel="noopener">Ansehen</a></div></div>' +
      '<div class="card fill"><div class="card__head"><div><h3>Website</h3><p class="hint">letzte 30 Tage</p></div><a class="btn btn--ghost btn--sm" href="#besucher">Details</a></div><div id="ovChart" class="chartbox" style="min-height:160px"></div>' + (P.seoMini ? P.seoMini() : "") + "</div></div></div>";
  };
  V.heute.after = function () {
    bindActions(V.heute._acts);
    var more = $("#moreActs"); if (more) more.onclick = function () { more.parentNode.querySelector(".actions").outerHTML = actionList(V.heute._acts, 99); more.remove(); bindActions(V.heute._acts); };
    var h = $("#onbHide"); if (h) h.onclick = function () { store.set("onb_hide", 1); P.rerender(); P.toast("Erste Schritte ausgeblendet", function () { store.del("onb_hide"); P.rerender(); }); };
    var onb = onboarding(); $$("[data-onb]").forEach(function (b) { b.onclick = function () { var x = onb[+b.dataset.onb]; if (x.fn) x.fn(); else location.hash = x.go; }; });
    $("#askReview").onclick = P.reviewModal;
    if (P.visits) P.lineChart($("#ovChart"), P.visits(30), { label: "Besucher pro Tag, letzte 30 Tage", unit: "Besucher" });
  };

  // ------------------------------------------------------------ Zeitleiste
  P.timeline = function (di, onlyT) {
    var S = 7 * 60 + 30, E = 17 * 60 + 30, span = E - S, rows = "";
    P.TEAM.filter(function (t) { return !onlyT || t.id === onlyT; }).forEach(function (t) {
      var s = P.schedule(t.id, di);
      rows += '<div class="tl__row">' + P.who(t, P.plural(s.n, "Besuch", "Besuche") + " · " + String(s.km).replace(".", ",") + " km") + '<div class="tl__track">' +
        s.ev.map(function (e) {
          var l = Math.max(0, (e.from - S) / span * 100), w = (e.to - e.from) / span * 100;
          if (e.type === "drive") return '<div class="tl__ev drive" style="left:' + l + "%;width:" + w + '%" title="Fahrt ' + P.hhmm(e.from) + "–" + P.hhmm(e.to) + ", " + e.km + ' km"></div>';
          if (e.type === "break") return '<div class="tl__ev brk" style="left:' + l + "%;width:" + w + '%" title="Pause"></div>';
          return '<div class="tl__ev' + (e.cancelled ? " cxl" : "") + '" style="left:' + l + "%;width:" + w + "%;background:" + t.color + '" title="' + P.hhmm(e.from) + " " + esc(e.n) + ", " + e.town + " · " + P.pname(e.tr) + (e.cancelled ? " (abgesagt)" : "") + '">' + esc(e.town) + "<small>" + esc(e.n) + "</small></div>";
        }).join("") + "</div></div>";
    });
    return '<div class="tl"><div class="tl__hours"><div></div><div><span>07:30</span><span>10:00</span><span>12:30</span><span>15:00</span><span>17:30</span></div></div>' + rows + "</div>";
  };

  // ------------------------------------------------------------ Touren
  P.TITLES.touren = ["Touren", "Reihenfolge optimieren, Absagen erfassen, Lücken aus der Warteliste füllen"];
  function routeMap(di) {
    var lon0 = 8.48, lat0 = 49.415, kx = 111.32 * Math.cos(49.35 * Math.PI / 180) * 28, ky = 111.32 * 28;
    function xy(t) { var c = Array.isArray(t) ? t : P.COORDS[t]; return [(c[1] - lon0) * kx + 10, (lat0 - c[0]) * ky + 10]; }
    var W = Math.round((8.72 - lon0) * kx + 90), H = Math.round((lat0 - 49.285) * ky + 20);
    var lines = P.TEAM.map(function (t, ti) {
      var pts = [xy(P.PRAXIS_POS)], off = (ti - 1.5) * 2.2;
      P.dayVisits(t.id, di).filter(function (v) { return !P.isCancelled(t.id, di, v.pid); }).forEach(function (v) { pts.push(xy(v.town)); });
      pts.push(xy(P.PRAXIS_POS));
      return '<polyline points="' + pts.map(function (p) { return (p[0] + off).toFixed(1) + "," + (p[1] + off).toFixed(1); }).join(" ") + '" stroke="' + t.color + '" />';
    }).join("");
    var dots = P.TOWNS.map(function (n) { var p = xy(n), home = n === "Hockenheim"; return '<g class="mt' + (home ? " home" : "") + '"><circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="' + (home ? 9 : 6) + '"/><text x="' + (p[0] + 11).toFixed(1) + '" y="' + (p[1] + 5).toFixed(1) + '">' + n + "</text></g>"; }).join("");
    return '<svg class="rmap" viewBox="0 0 ' + W + " " + H + '" role="img" aria-label="Karte der Touren">' + '<g class="rl">' + lines + "</g>" + dots + "</svg>";
  }
  V.touren = function () {
    var di = V.touren.di || 0, days = P.workdays(5);
    var sch = P.TEAM.map(function (t) { return { t: t, s: P.schedule(t.id, di), opt: P.previewOpt(t.id, di), done: !!store.get("order", {})[t.id + "@" + di] }; });
    var km = sch.reduce(function (a, x) { return a + x.s.km; }, 0), dr = sch.reduce(function (a, x) { return a + x.s.drive; }, 0), tr = sch.reduce(function (a, x) { return a + x.s.treat; }, 0);
    var save = sch.reduce(function (a, x) { return a + (x.opt && !x.done ? Math.max(0, x.s.km - x.opt) : 0); }, 0);
    var rows = [];
    sch.forEach(function (x) { x.s.ev.forEach(function (e) { if (e.type === "visit") rows.push({ t: x.t, e: e }); }); });
    rows.sort(function (a, b) { return a.e.from - b.e.from; });
    var gap = V.touren.gap;
    return '<div class="toolbar"><div class="seg">' + days.map(function (d, i) { return '<button data-di="' + i + '" class="' + (i === di ? "on" : "") + '">' + (i === 0 && d.getTime() === P.today.getTime() ? "Heute" : P.wd(d) + " " + P.dstr(d)) + "</button>"; }).join("") + "</div>" +
      '<span class="pill pill--info pill--plain">' + P.plural(rows.filter(function (r) { return !r.e.cancelled; }).length, "Hausbesuch", "Hausbesuche") + " · " + P.fmt(Math.round(km)) + " km · Fahrzeit-Anteil " + P.pct(dr, dr + tr) + " %</span></div>" +
      '<div class="grid g-12"><div class="stack"><div class="card"><div class="card__head"><div><h3>Routen optimieren</h3><p class="hint">kürzeste Reihenfolge ab Praxis Hockenheim und zurück</p></div>' + (save >= 1 ? '<button class="btn btn--sm btn--lime" id="optAll">' + icon("bolt") + " Alle optimieren</button>" : "") + '</div><ul class="list">' +
      sch.map(function (x) {
        var can = x.opt && !x.done && x.s.km - x.opt >= 0.5;
        return '<li>' + P.who(x.t, P.plural(x.s.n, "Besuch", "Besuche") + " · " + String(x.s.km).replace(".", ",") + " km · " + x.s.drive + " Min. Fahrt · fertig " + P.hhmm(x.s.end)) + '<span style="margin-left:auto"></span>' +
          (can ? '<button class="btn btn--sm btn--ghost" data-opt="' + x.t.id + '">−' + String(Math.round((x.s.km - x.opt) * 10) / 10).replace(".", ",") + " km</button>" : x.done ? '<span class="pill pill--good">optimiert</span>' : '<span class="pill pill--plain">passt</span>') + "</li>";
      }).join("") + '</ul><p class="hint" style="margin:10px 0 0">Fahrzeiten geschätzt (Straße ≈ Luftlinie × 1,3, ~35 km/h). Mit Kartendienst-Anbindung später genauer.</p></div>' +
      '<div class="card fill"><div class="rmap-wrap"><div class="rmap-sticky"><h3>Karte</h3><p class="hint">Linien zeigen die Reihenfolge der Touren</p>' + routeMap(di) + '<div class="legend">' + P.TEAM.map(function (t) { return '<span><i style="background:' + t.color + '"></i>' + esc(t.name.split(" ")[0]) + "</span>"; }).join("") + "</div></div></div></div></div>" +
      '<div class="stack"><div class="card">' + P.timeline(di) + '<div class="legend"><span><i style="background:repeating-linear-gradient(45deg,#cfd9e3 0 3px,#dfe7ee 3px 6px)"></i>Fahrt</span><span><i style="background:#eef2f6;box-shadow:inset 0 0 0 1px #cfd9e3"></i>Pause</span><span><i style="background:#fde6db"></i>Abgesagt</span></div></div>' +
      (gap ? gapCard(gap) : "") +
      '<div class="card fill"><h3>Besuche</h3><p class="hint">Absage erfassen: Die Lücke wird mit passenden Patient:innen aus der Warteliste gefüllt.</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Zeit</th><th>Therapeut:in</th><th>Patient:in</th><th>Ort</th><th>Behandlung</th><th></th></tr></thead><tbody>' +
      rows.map(function (r) {
        return '<tr class="' + (r.e.cancelled ? "cxl" : "") + '"><td>' + P.hhmm(r.e.from) + "</td><td>" + P.who(r.t) + "</td><td>" + esc(r.e.n) + (r.e.added ? ' <span class="pill pill--info">neu</span>' : "") + "</td><td>" + esc(r.e.town) + '</td><td><span class="pill pill--plain">' + r.e.tr + '</span></td><td class="num">' +
          (r.e.cancelled ? '<button class="btn btn--sm btn--ghost" data-undo="' + r.t.id + "@" + di + "@" + r.e.pid + '">Wiederherstellen</button>' : '<button class="btn btn--sm btn--ghost" data-cxl="' + r.t.id + "@" + di + "@" + r.e.pid + '">Absage</button>') + "</td></tr>";
      }).join("") + "</tbody></table></div></div></div></div>";
  };
  function gapCard(g) {
    var reqs = P.requests().filter(function (r) { return r.status === "warteliste" && P.TOWNS.indexOf(r.town) >= 0; })
      .map(function (r) { return { r: r, km: P.km(r.town, g.town) }; }).sort(function (a, b) { return a.km - b.km; }).slice(0, 3);
    return '<div class="card gap"><div class="card__head"><div><h3>Lücke füllen</h3><p class="hint">' + esc(g.label) + "</p></div>" + '<button class="btn btn--sm btn--ghost" id="gapClose">Schließen</button></div>' +
      (reqs.length ? '<ul class="list">' + reqs.map(function (x) { return "<li><div class=\"t\"><b>" + esc(x.r.name) + "</b><small>" + esc(x.r.town) + " · " + esc(x.r.topic) + " · wartet " + x.r.since + " Tage</small></div><span class=\"pill pill--info\">" + String(x.km).replace(".", ",") + ' km</span><button class="btn btn--sm btn--lime" data-fill="' + x.r.id + '">Einplanen</button></li>'; }).join("") + "</ul>" : P.empty("Warteliste leer", "Niemand wartet gerade auf einen Termin.")) + "</div>";
  }
  P.planRequest = function (rid, slot) {
    var reqs = P.requests(), r = reqs.filter(function (x) { return x.id === rid; })[0]; if (!r) return;
    var added = store.get("added", []); added.push({ rid: rid, t: slot.t, di: slot.di, town: r.town, tr: r.tr, n: r.name.replace(/ \(.*\)/, "") }); store.set("added", added);
    r.status = "eingeplant"; r.slot = slot; P.saveRequests(reqs);
    var d = P.workdays(5)[slot.di];
    P.toast(r.name + " eingeplant: " + P.person(slot.t).name.split(" ")[0] + ", " + P.wd(d) + " " + P.dstr(d), function () {
      var a2 = store.get("added", []).filter(function (a) { return a.rid !== rid; }); store.set("added", a2);
      var rq = P.requests(); rq.forEach(function (x) { if (x.id === rid) { x.status = "warteliste"; delete x.slot; } }); P.saveRequests(rq); P.rerender();
    });
    P.rerender();
  };
  V.touren.after = function () {
    var di = V.touren.di || 0;
    $$("[data-di]").forEach(function (b) { b.onclick = function () { V.touren.di = +b.dataset.di; V.touren.gap = null; P.render(); }; });
    $$("[data-opt]").forEach(function (b) { b.onclick = function () { var r = P.optimize(b.dataset.opt, di); P.toast("Route optimiert: " + String(r.before.km).replace(".", ",") + " → " + String(r.after.km).replace(".", ",") + " km", function () { var o = store.get("order", {}); delete o[b.dataset.opt + "@" + di]; store.set("order", o); P.rerender(); }); P.rerender(); }; });
    var oa = $("#optAll"); if (oa) oa.onclick = function () { var b = 0, a = 0; P.TEAM.forEach(function (t) { var r = P.optimize(t.id, di); if (r) { b += r.before.km; a += r.after.km; } }); P.toast("Alle Routen optimiert: " + Math.round(b - a) + " km gespart"); P.rerender(); };
    $$("[data-cxl]").forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.cxl.split("@"), pid = k[2], p = /^\d+$/.test(pid) ? P.patient(+pid) : null;
        var short = di === 0, feeOk = p && p.pay !== "beihilfe" && short;
        P.modal({ title: "Absage erfassen", body: '<label class="fld"><span>Grund</span><select id="cxR"><option>Krankheit</option><option>Klinikaufenthalt</option><option>Termin vergessen</option><option>Sonstiges</option></select></label>' +
          (short ? '<label class="chk"><input type="checkbox" id="cxFee"' + (feeOk ? "" : " disabled") + '> Ausfallhonorar berechnen (' + P.eur(P.price("AUS")) + ")</label><p class=\"hint\">Nur wenn kürzer als " + P.settings().cancelHours + " Std. vorher abgesagt und vorher schriftlich vereinbart. Bei Krankheit oder Klinikaufenthalt besser aus Kulanz verzichten.</p>" : '<p class="hint">Frühzeitige Absage, kein Ausfallhonorar.</p>'),
          actions: [{ label: "Abbrechen", cls: "btn--ghost", fn: function () {} }, { label: "Absage speichern", fn: function (m) {
            var c = store.get("cancel", {}); c[b.dataset.cxl] = { reason: $("#cxR", m).value, fee: !!($("#cxFee", m) && $("#cxFee", m).checked) }; store.set("cancel", c);
            var town = p ? p.town : (P.dayVisits(k[0], di).filter(function (v) { return String(v.pid) === pid; })[0] || {}).town;
            V.touren.gap = { t: k[0], di: di, town: town, label: P.person(k[0]).name.split(" ")[0] + ", " + town + ": passende Wartende in der Nähe" };
            P.rerender();
          } }] });
      };
    });
    $$("[data-undo]").forEach(function (b) { b.onclick = function () { var c = store.get("cancel", {}); delete c[b.dataset.undo]; store.set("cancel", c); P.rerender(); }; });
    var gc = $("#gapClose"); if (gc) gc.onclick = function () { V.touren.gap = null; P.rerender(); };
    $$("[data-fill]").forEach(function (b) { b.onclick = function () { var g = V.touren.gap; V.touren.gap = null; P.planRequest(+b.dataset.fill, { t: g.t, di: g.di, km: 0 }); }; });
  };

  // ------------------------------------------------------------ Anfragen & Warteliste
  P.TITLES.patienten = ["Anfragen & Warteliste", "Neue Patient:innen aufnehmen und passend in die Touren einplanen"];
  P.badges.patienten = function () { return P.requests().filter(function (r) { return r.status === "neu"; }).length; };
  var RSTATES = [["neu", "Neu", "info"], ["warteliste", "Warteliste", "warn"], ["eingeplant", "Eingeplant", "good"], ["abgesagt", "Abgesagt", "plain"]];
  V.patienten = function () {
    var reqs = P.requests(), f = V.patienten.f || "offen";
    var rows = reqs.filter(function (r) { return f === "alle" || (f === "offen" ? (r.status === "neu" || r.status === "warteliste") : r.status === f); }).sort(function (a, b) { return a.since - b.since; });
    var wait = reqs.filter(function (r) { return r.status === "warteliste"; }), avg = wait.length ? Math.round(wait.reduce(function (s, r) { return s + r.since; }, 0) / wait.length) : 0;
    return '<div class="grid g4">' + P.kpi("Neue Anfragen", reqs.filter(function (r) { return r.status === "neu"; }).length, "noch nicht bearbeitet", "inbox") + P.kpi("Warteliste", wait.length, "Ø " + avg + " Tage Wartezeit", "cal") +
      P.kpi("Eingeplant", reqs.filter(function (r) { return r.status === "eingeplant"; }).length, "in den nächsten 5 Werktagen", "check") + P.kpi("Außerhalb", reqs.filter(function (r) { return P.TOWNS.indexOf(r.town) < 0; }).length, "nicht im Einsatzgebiet", "pin") + "</div>" +
      '<div class="grid g-21" style="margin-top:18px"><div class="card"><div class="card__head"><div class="seg">' + [["offen", "Offen"], ["eingeplant", "Eingeplant"], ["abgesagt", "Abgesagt"], ["alle", "Alle"]].map(function (s) { return '<button data-f="' + s[0] + '" class="' + (f === s[0] ? "on" : "") + '">' + s[1] + "</button>"; }).join("") + "</div></div>" +
      (rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Anfrage</th><th>Ort</th><th>Kosten</th><th>Bester Platz</th><th>Status</th><th></th></tr></thead><tbody>' + rows.map(function (r) {
        var inArea = P.TOWNS.indexOf(r.town) >= 0, best = inArea && (r.status === "neu" || r.status === "warteliste") ? P.bestSlots(r.town, 1)[0] : null, d = best ? P.workdays(5)[best.di] : null;
        var slot = r.slot ? P.person(r.slot.t).name.split(" ")[0] + ", " + P.wd(P.workdays(5)[r.slot.di]) + " " + P.dstr(P.workdays(5)[r.slot.di]) : "";
        return "<tr><td><b>" + esc(r.name) + '</b><small class="sub">' + esc(r.topic) + " · " + esc(r.src) + " · " + (r.since ? "vor " + r.since + " Tg." : "heute") + "</small></td><td>" + esc(r.town) + (inArea ? "" : ' <span class="pill pill--bad">außerhalb</span>') + "</td><td>" + pay(r.pay) + "</td><td>" +
          (best ? P.who(P.person(best.t), P.wd(d) + " " + P.dstr(d) + " · " + String(best.km).replace(".", ",") + " km Umweg") : slot ? '<span class="pill pill--good">' + slot + "</span>" : "–") + '</td><td><select data-id="' + r.id + '" class="sel">' + RSTATES.map(function (s) { return '<option value="' + s[0] + '"' + (s[0] === r.status ? " selected" : "") + ">" + s[1] + "</option>"; }).join("") + '</select></td><td class="num">' +
          (best ? '<button class="btn btn--sm btn--lime" data-plan="' + r.id + '">Einplanen</button>' : "") + "</td></tr>";
      }).join("") + "</tbody></table></div>" : P.empty("Keine Anfragen in dieser Ansicht", "Neue Anfragen aus Website, Telefon und WhatsApp erscheinen hier.")) + "</div>" +
      '<div class="stack"><div class="card"><h3>Anfrage erfassen</h3><p class="hint">z. B. nach einem Anruf</p><form id="reqForm"><label class="fld"><span>Name</span><input name="name" required placeholder="z. B. Frau Weber"></label><div class="fld2"><label class="fld"><span>Ort</span><select name="town">' + P.TOWNS.concat(["Mannheim", "Speyer"]).map(function (t) { return "<option>" + t + "</option>"; }).join("") + '</select></label><label class="fld"><span>Kosten</span><select name="pay"><option value="privat">Privat</option><option value="beihilfe">Beihilfe</option><option value="selbst">Selbstzahler</option></select></label></div><label class="fld"><span>Anliegen</span><input name="topic" required placeholder="z. B. nach Knie-OP, Gangschule"></label><label class="fld"><span>Behandlung</span><select name="tr">' + P.prices().filter(function (x) { return x.min; }).map(function (x) { return '<option value="' + x.k + '">' + x.name + "</option>"; }).join("") + '</select></label><button class="btn btn--block">Auf die Warteliste</button></form></div>' +
      '<div class="card fill"><h3>Vor dem ersten Termin</h3><p class="hint">Pflicht: Patient:innen vorab in Textform über die Kosten informieren, wenn die Versicherung evtl. nicht alles erstattet (§ 630c Abs. 3 BGB).</p><button class="btn btn--ghost btn--sm" id="priceInfo">' + icon("file") + ' Preisinfo-Text erstellen</button></div></div></div>';
  };
  V.patienten.after = function () {
    $$("[data-f]").forEach(function (b) { b.onclick = function () { V.patienten.f = b.dataset.f; P.rerender(); }; });
    $$("select[data-id]").forEach(function (s) { s.onchange = function () { var reqs = P.requests(); reqs.forEach(function (r) { if (r.id === +s.dataset.id) r.status = s.value; }); P.saveRequests(reqs); P.toast("Status gespeichert"); P.rerender(); }; });
    $$("[data-plan]").forEach(function (b) { b.onclick = function () { var r = P.requests().filter(function (x) { return x.id === +b.dataset.plan; })[0]; P.planRequest(r.id, P.bestSlots(r.town, 1)[0]); }; });
    $("#reqForm").onsubmit = function (e) {
      e.preventDefault(); var f = e.target, reqs = P.requests();
      var r = { id: Math.max.apply(null, reqs.map(function (x) { return x.id; }).concat([0])) + 1, name: f.name.value.trim(), town: f.town.value, pay: f.pay.value, tr: f.tr.value, topic: f.topic.value.trim(), since: 0, status: P.TOWNS.indexOf(f.town.value) >= 0 ? "warteliste" : "abgesagt", src: "Telefon", hb: true };
      reqs.push(r); P.saveRequests(reqs); P.toast(r.status === "abgesagt" ? "Außerhalb des Einsatzgebiets, als abgesagt gespeichert" : "Auf die Warteliste gesetzt"); V.patienten.f = "offen"; P.rerender();
    };
    $("#priceInfo").onclick = function () { P.textModal("Preisinformation für Patient:innen", "Vor Behandlungsbeginn mitgeben oder per E-Mail schicken. Preise aus den Einstellungen.", priceInfo()); };
  };

  // ------------------------------------------------------------ Verordnungen
  P.TITLES.verordnungen = ["Verordnungen", "Fristen-Ampel, Folgeverordnungen und Therapieberichte"];
  P.badges.verordnungen = function () { return P.patients().filter(function (p) { return P.rxState(p).level === "bad"; }).length; };
  V.verordnungen = function () {
    var list = P.patients().filter(function (p) { return p.rx; }).map(function (p) { return { p: p, s: P.rxState(p) }; });
    var f = V.verordnungen.f || "bedarf", rank = { bad: 0, warn: 1, good: 2 };
    var rows = list.filter(function (x) { return f === "alle" || (f === "bedarf" ? x.s.level !== "good" : x.s.level === "good"); }).sort(function (a, b) { return rank[a.s.level] - rank[b.s.level]; });
    var bad = list.filter(function (x) { return x.s.level === "bad"; }).length, warn = list.filter(function (x) { return x.s.level === "warn"; }).length;
    return '<div class="grid g4">' + P.kpi("Laufende Verordnungen", list.length, "mit Hausbesuch", "file") + P.kpi("Dringend", bad, "Frist verpasst oder Einheiten aufgebraucht", "bolt") + P.kpi("Bald fällig", warn, "in den nächsten Tagen handeln", "cal") +
      P.kpi("Offene Einheiten", list.reduce(function (s, x) { return s + Math.max(0, x.s.rest); }, 0), "noch zu behandeln", "check") + "</div>" +
      '<div class="grid g-21" style="margin-top:18px"><div class="card"><div class="card__head"><div class="seg">' + [["bedarf", "Handlungsbedarf"], ["ok", "In Ordnung"], ["alle", "Alle"]].map(function (s) { return '<button data-f="' + s[0] + '" class="' + (f === s[0] ? "on" : "") + '">' + s[1] + "</button>"; }).join("") + "</div></div>" +
      (rows.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Patient:in</th><th>Heilmittel</th><th>Fortschritt</th><th>Ampel</th><th></th></tr></thead><tbody>' + rows.map(function (x) {
        var p = x.p, done = p.visits.length;
        return '<tr><td><b>' + esc(p.n) + ", " + esc(p.town) + '</b><small class="sub">' + P.person(p.t).name + " · " + P.PAY[p.pay] + " · vom " + P.dstr(P.addDays(P.today, p.rx.issued)) + (p.rx.urgent ? " · dringlich" : "") + "</small></td><td>" + P.pname(p.tr) + '<small class="sub">' + esc(p.diag) + "</small></td>" +
          '<td><div style="display:flex;align-items:center;gap:8px;min-width:110px"><div class="bar" style="flex:1"><i style="width:' + P.pct(done, p.rx.units) + '%"></i></div><small>' + done + "/" + p.rx.units + "</small></div></td><td>" +
          (x.s.items.length ? x.s.items.map(function (it) { return '<span class="pill pill--' + it.level + ' pill--wrap">' + esc(it.txt) + "</span>"; }).join(" ") : '<span class="pill pill--good">in Ordnung</span>') + '</td><td class="num"><div class="btns-v">' +
          '<button class="btn btn--sm ' + (x.s.level === "good" ? "btn--ghost" : "") + '" data-doc="' + p.id + '">Arzt anfragen</button><button class="btn btn--sm btn--ghost" data-rep="' + p.id + '">Therapiebericht</button></div></td></tr>';
      }).join("") + "</tbody></table></div>" : P.empty("Keine Einträge", "In dieser Ansicht ist nichts zu tun.")) + "</div>" +
      '<div class="stack"><div class="card"><h3>So rechnet die Ampel</h3><p class="hint">angelehnt an die Heilmittel-Richtlinie. Für Kassenpatienten Pflicht, bei Privat und Beihilfe eine sichere Orientierung.</p><ul class="rules">' +
      "<li><b>28 Tage</b> ab Ausstellung bis zur ersten Behandlung, bei „dringlich“ 14 Tage</li><li><b>14 Tage</b> Unterbrechung höchstens, sonst Begründung (F Ferien, K Krankheit, T therapeutisch)</li><li><b>Folgeverordnung</b> rechtzeitig anfragen, wenn noch 1 Einheit offen ist</li><li><b>Hausbesuch</b> muss auf der Verordnung vermerkt sein</li></ul></div>" +
      '<div class="card fill"><h3>Selbstzahler ohne Verordnung</h3><p class="hint">laufen ohne Fristen, werden aber in Touren und Rechnungen berücksichtigt</p><ul class="list">' + P.patients().filter(function (p) { return !p.rx; }).map(function (p) { return "<li><div class=\"t\">" + esc(p.n) + ", " + esc(p.town) + "<small>" + P.pname(p.tr) + " · " + P.plural(p.visits.length, "Behandlung", "Behandlungen") + "</small></div>" + P.who(P.person(p.t)) + "</li>"; }).join("") + "</ul></div></div></div>";
  };
  V.verordnungen.after = function () {
    $$("[data-f]").forEach(function (b) { b.onclick = function () { V.verordnungen.f = b.dataset.f; P.rerender(); }; });
    $$("[data-doc]").forEach(function (b) { b.onclick = function () { P.textModal("Anfrage an den Arzt", "Entwurf, bitte prüfen und per Fax, E-Mail oder Telefon weitergeben.", doctorRequest(P.patient(+b.dataset.doc))); }; });
    $$("[data-rep]").forEach(function (b) { b.onclick = function () { P.textModal("Therapiebericht (Entwurf)", "Aus den Verordnungsdaten vorbereitet. Die Felder in [Klammern] fachlich ergänzen.", therapyReport(P.patient(+b.dataset.rep))); }; });
  };

  // ------------------------------------------------------------ Rechnungen
  P.TITLES.rechnungen = ["Rechnungen", "Aus erledigten Behandlungen erstellen, als PDF herunterladen, Zahlungen und Mahnungen verfolgen"];
  P.badges.rechnungen = function () { return P.patients().filter(function (p) { return P.unbilled(p).length; }).length; };
  V.rechnungen = function () {
    var s = P.settings(), invs = P.invoices().slice().reverse();
    var ready = P.patients().map(function (p) { var u = P.unbilled(p); return { p: p, u: u, sum: u.length ? P.sumLines(P.invoiceLines(p, u)) : 0 }; }).filter(function (x) { return x.u.length; });
    var open = invs.filter(function (i) { return i.status !== "bezahlt"; }), over = open.filter(function (i) { return P.invState(i).days > 0; });
    var paid30 = invs.filter(function (i) { return i.status === "bezahlt" && i.paid >= -30; });
    var missing = !s.taxno || !s.iban;
    return (missing ? '<div class="note note--warn">' + icon("file") + '<div><b>Für vollständige Rechnungen fehlen noch Steuernummer und Bankverbindung.</b> Bis dahin steht ein Platzhalter im PDF. <a href="#einstellungen">Jetzt in den Einstellungen ergänzen</a></div></div>' : "") +
      '<div class="grid g4">' + P.kpi("Abrechnungsbereit", P.fmt(Math.round(ready.reduce(function (a, x) { return a + x.sum; }, 0))) + "<small> €</small>", P.plural(ready.length, "Patient:in", "Patient:innen"), "euro") +
      P.kpi("Offen", P.fmt(Math.round(open.reduce(function (a, i) { return a + i.sum; }, 0))) + "<small> €</small>", P.plural(open.length, "Rechnung", "Rechnungen"), "file") +
      P.kpi("Überfällig", P.fmt(Math.round(over.reduce(function (a, i) { return a + i.sum; }, 0))) + "<small> €</small>", P.plural(over.length, "Rechnung", "Rechnungen"), "bolt") +
      P.kpi("Bezahlt (30 Tage)", P.fmt(Math.round(paid30.reduce(function (a, i) { return a + i.sum; }, 0))) + "<small> €</small>", P.plural(paid30.length, "Rechnung", "Rechnungen"), "check") + "</div>" +
      '<div class="card" style="margin-top:18px"><div class="card__head"><div><h3>Abrechnungsbereit</h3><p class="hint">Erledigte Behandlungen, die noch auf keiner Rechnung stehen. Pro Patient:in entsteht eine Rechnung mit allen Pflichtangaben.</p></div>' +
      (ready.length ? '<button class="btn btn--lime" id="billSel">' + icon("bolt") + " Ausgewählte abrechnen</button>" : "") + "</div>" +
      (ready.length ? '<div class="tbl-wrap"><table class="tbl"><thead><tr><th><input type="checkbox" id="billAll" checked aria-label="Alle auswählen"></th><th>Patient:in</th><th>Kosten</th><th>Behandlungen</th><th>Zeitraum</th><th class="num">Betrag</th><th></th></tr></thead><tbody>' + ready.map(function (x) {
        var a = Math.min.apply(null, x.u), b = Math.max.apply(null, x.u);
        return '<tr><td><input type="checkbox" class="billChk" value="' + x.p.id + '" checked aria-label="auswählen"></td><td><b>' + esc(x.p.full) + '</b><small class="sub">' + esc(x.p.town) + " · " + P.person(x.p.t).name + "</small></td><td>" + pay(x.p.pay) + "</td><td>" + x.u.length + " × " + x.p.tr + "</td><td>" + P.dstr(P.addDays(P.today, a)) + (a !== b ? "–" + P.dstr(P.addDays(P.today, b)) : "") + '</td><td class="num"><b>' + P.eur(x.sum) + '</b></td><td class="num"><button class="btn btn--sm btn--ghost" data-prev="' + x.p.id + '">' + icon("eye") + " Vorschau</button></td></tr>";
      }).join("") + "</tbody></table></div>" : P.empty("Alles abgerechnet", "Neue Behandlungen erscheinen hier automatisch, sobald sie erledigt sind.")) + "</div>" +
      '<div class="card" style="margin-top:18px"><div class="card__head"><div><h3>Rechnungen</h3><p class="hint">Zahlungsziel ' + s.due + " Tage · Mahnstufen: Zahlungserinnerung, 1. Mahnung, 2. Mahnung (+" + P.eur(s.dunFee) + ")</p></div></div>" +
      '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Nr.</th><th>Patient:in</th><th>Datum</th><th class="num">Betrag</th><th>Status</th><th></th></tr></thead><tbody>' + invs.map(function (i) {
        var p = P.patient(i.pid), st = P.invState(i), nextDun = i.status !== "bezahlt" && st.days > 0 && i.dun < 3;
        return "<tr><td><b>" + i.no + "</b></td><td>" + (p ? esc(p.full) : "") + "</td><td>" + P.dstr(P.addDays(P.today, i.date)) + '</td><td class="num">' + P.eur(i.sum) + '</td><td><span class="pill pill--' + st.cls + ' pill--wrap">' + st.txt + '</span></td><td class="num"><div class="btns-h">' +
          '<button class="btn btn--sm btn--ghost" data-pdf="' + i.no + '">' + icon("dl") + " PDF</button>" +
          (nextDun ? '<button class="btn btn--sm" data-dun="' + i.no + '">' + ["Erinnerung", "1. Mahnung", "2. Mahnung"][i.dun] + "</button>" : "") +
          (i.dun ? '<button class="btn btn--sm btn--ghost" data-dunpdf="' + i.no + '">' + icon("dl") + " Mahnung</button>" : "") +
          (i.status !== "bezahlt" ? '<button class="btn btn--sm btn--ghost" data-paid="' + i.no + '">bezahlt</button>' : "") + "</div></td></tr>";
      }).join("") + "</tbody></table></div></div>" +
      '<p class="hint" style="margin-top:12px">Das PDF entsteht direkt im Browser, es werden keine Daten verschickt. Umsatzsteuerfrei nach § 4 Nr. 14 a UStG. Rechnungen 8 Jahre aufbewahren.</p>';
  };
  function createInvoices(ids) {
    var list = P.invoices(), extra = store.get("billedExtra", {}), made = [];
    ids.forEach(function (id) {
      var p = P.patient(id), u = P.unbilled(p); if (!u.length) return;
      var lines = P.invoiceLines(p, u), inv = { no: P.nextInvoiceNo(), pid: id, date: 0, lines: lines, sum: P.sumLines(lines), status: "offen", dun: 0, paid: null, period: [Math.min.apply(null, u), Math.max.apply(null, u)] };
      list.push(inv); extra[id] = (extra[id] || 0) + u.length; made.push(inv);
    });
    P.saveInvoices(list); store.set("billedExtra", extra);
    return made;
  }
  V.rechnungen.after = function () {
    var all = $("#billAll"); if (all) all.onchange = function () { $$(".billChk").forEach(function (c) { c.checked = all.checked; }); };
    var bs = $("#billSel"); if (bs) bs.onclick = function () {
      var ids = $$(".billChk").filter(function (c) { return c.checked; }).map(function (c) { return +c.value; }); if (!ids.length) { P.toast("Bitte mindestens eine Patient:in auswählen"); return; }
      var before = { inv: P.invoices().slice(), extra: Object.assign({}, store.get("billedExtra", {})), s: P.settings() };
      var made = createInvoices(ids);
      P.rerender();
      P.toast(P.plural(made.length, "Rechnung", "Rechnungen") + " erstellt: " + made.map(function (i) { return i.no; }).join(", "), function () { P.saveInvoices(before.inv); store.set("billedExtra", before.extra); P.saveSettings(before.s); P.rerender(); });
      if (made.length === 1) P.pdf(made[0], 0);
      else P.modal({ title: P.plural(made.length, "Rechnung", "Rechnungen") + " erstellt", body: '<ul class="list">' + made.map(function (i) { return "<li><div class=\"t\"><b>" + i.no + "</b><small>" + esc(P.patient(i.pid).full) + "</small></div><b>" + P.eur(i.sum) + '</b><button class="btn btn--sm btn--ghost" data-mpdf="' + i.no + '">' + icon("dl") + " PDF</button></li>"; }).join("") + "</ul>",
        actions: [{ label: icon("dl") + " Alle als PDF", cls: "btn--lime", fn: function () { made.forEach(function (i, k) { setTimeout(function () { P.pdf(i, 0); }, k * 400); }); } }, { label: "Fertig", cls: "btn--ghost", fn: function () {} }] });
      $$("[data-mpdf]").forEach(function (b) { b.onclick = function () { P.pdf(made.filter(function (i) { return i.no === b.dataset.mpdf; })[0], 0); }; });
    };
    $$("[data-prev]").forEach(function (b) { b.onclick = function () { var p = P.patient(+b.dataset.prev), u = P.unbilled(p); P.pdf({ no: "VORSCHAU", pid: p.id, date: 0, lines: P.invoiceLines(p, u), sum: P.sumLines(P.invoiceLines(p, u)), dun: 0, period: [Math.min.apply(null, u), Math.max.apply(null, u)] }, 0, true); }; });
    function find(no) { return P.invoices().filter(function (i) { return i.no === no; })[0]; }
    $$("[data-pdf]").forEach(function (b) { b.onclick = function () { P.pdf(find(b.dataset.pdf), 0); }; });
    $$("[data-dunpdf]").forEach(function (b) { b.onclick = function () { var i = find(b.dataset.dunpdf); P.pdf(i, i.dun); }; });
    $$("[data-dun]").forEach(function (b) { b.onclick = function () {
      var l = P.invoices(), i = l.filter(function (x) { return x.no === b.dataset.dun; })[0]; i.dun++; i.dunDate = 0; P.saveInvoices(l); P.rerender(); P.pdf(i, i.dun);
      P.toast(["", "Zahlungserinnerung", "1. Mahnung", "2. Mahnung"][i.dun] + " erstellt", function () { var l2 = P.invoices(); l2.forEach(function (x) { if (x.no === i.no) x.dun--; }); P.saveInvoices(l2); P.rerender(); });
    }; });
    $$("[data-paid]").forEach(function (b) { b.onclick = function () {
      var l = P.invoices(); l.forEach(function (x) { if (x.no === b.dataset.paid) { x.status = "bezahlt"; x.paid = 0; } }); P.saveInvoices(l); P.rerender();
      P.toast("Als bezahlt markiert", function () { var l2 = P.invoices(); l2.forEach(function (x) { if (x.no === b.dataset.paid) { x.status = "offen"; x.paid = null; } }); P.saveInvoices(l2); P.rerender(); });
    }; });
  };

  // ------------------------------------------------------------ PDF (jsPDF, lokal)
  var jsPDFp = null, logoP = null;
  function loadJsPDF() {
    if (jsPDFp) return jsPDFp;
    jsPDFp = new Promise(function (res, rej) { var s = document.createElement("script"); s.src = "/js/vendor/jspdf.umd.min.js"; s.onload = function () { res(window.jspdf.jsPDF); }; s.onerror = rej; document.head.appendChild(s); });
    return jsPDFp;
  }
  function loadLogo() {
    if (logoP) return logoP;
    logoP = fetch("/assets/img/logo.png").then(function (r) { return r.blob(); }).then(function (b) { return new Promise(function (res) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.readAsDataURL(b); }); }).catch(function () { return null; });
    return logoP;
  }
  P.pdf = function (inv, kind, preview) {
    P.toast("PDF wird erstellt …");
    Promise.all([loadJsPDF(), loadLogo()]).then(function (r) { buildPdf(r[0], r[1], inv, kind || 0, preview); }).catch(function () { P.toast("PDF konnte nicht erstellt werden"); });
  };
  function buildPdf(jsPDF, logo, inv, kind, preview) {
    var s = P.settings(), p = P.patient(inv.pid), doc = new jsPDF({ unit: "mm", format: "a4" });
    var NAVY = [27, 65, 122], INK = [30, 38, 52], MUTE = [100, 110, 125], L = 20, R = 190;
    var title = ["Rechnung", "Zahlungserinnerung", "1. Mahnung", "2. Mahnung"][kind];
    var invDate = P.addDays(P.today, inv.date), dueDate = P.addDays(invDate, s.due);
    doc.setFont("helvetica", "normal");
    if (logo) doc.addImage(logo, "PNG", R - 46, 14, 46, 17.6);
    doc.setTextColor.apply(doc, MUTE); doc.setFontSize(7.5);
    doc.text(s.name + " · " + s.street + " · " + s.zip + " " + s.city, L, 47);
    doc.setDrawColor(200, 206, 214); doc.line(L, 48.2, L + 85, 48.2);
    doc.setTextColor.apply(doc, INK); doc.setFontSize(10.5);
    [p.full, p.addr, (PLZ[p.town] || "") + " " + p.town].forEach(function (t, i) { doc.text(t, L, 55 + i * 5.2); });
    doc.setFontSize(9);
    var info = [["Rechnungsnummer", inv.no], ["Rechnungsdatum", P.dlong(invDate)]];
    if (inv.period) info.push(["Leistungszeitraum", P.dlong(P.addDays(P.today, inv.period[0])) + (inv.period[0] !== inv.period[1] ? " – " + P.dlong(P.addDays(P.today, inv.period[1])) : "")]);
    if (kind) info.push([title + " vom", P.dlong(P.today)]);
    info.push(["Kostenträger", P.PAY[p.pay]]);
    info.forEach(function (row, i) { doc.setTextColor.apply(doc, MUTE); doc.text(row[0], 128, 55 + i * 5); doc.setTextColor.apply(doc, INK); doc.text(row[1], R, 55 + i * 5, { align: "right" }); });
    var y = 92;
    doc.setFont("helvetica", "bold"); doc.setFontSize(17); doc.setTextColor.apply(doc, NAVY); doc.text(title + (preview ? " (Vorschau)" : ""), L, y);
    doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor.apply(doc, INK); y += 9;
    var salutation = (p.sex === "f" ? "Sehr geehrte Frau " : "Sehr geehrter Herr ") + p.last + ",";
    doc.text(salutation, L, y); y += 6;
    var intro = kind === 0 ? "für die physiotherapeutische Behandlung im Hausbesuch berechne ich Ihnen folgende Leistungen:"
      : kind === 1 ? "sicher ist es Ihrer Aufmerksamkeit entgangen: Die Rechnung " + inv.no + " vom " + P.dlong(invDate) + " ist noch offen. Falls Sie die Erstattung Ihrer Versicherung oder Beihilfe abwarten, geben Sie gern kurz Bescheid."
      : kind === 2 ? "leider konnten wir zur Rechnung " + inv.no + " vom " + P.dlong(invDate) + " noch keinen Zahlungseingang feststellen. Bitte überweisen Sie den offenen Betrag bis zum " + P.dlong(P.addDays(P.today, 10)) + "."
      : "trotz Erinnerung und Mahnung ist die Rechnung " + inv.no + " vom " + P.dlong(invDate) + " weiterhin offen. Bitte überweisen Sie den Betrag bis spätestens " + P.dlong(P.addDays(P.today, 10)) + ". Danach müssen wir weitere Schritte einleiten.";
    doc.splitTextToSize(intro, R - L).forEach(function (l) { doc.text(l, L, y); y += 5; });
    y += 2;
    if (kind === 0) {
      if (p.rx) {
        doc.setFontSize(8.5); doc.setTextColor.apply(doc, MUTE);
        doc.splitTextToSize("Ärztliche Verordnung: " + p.rx.doc + ", vom " + P.dlong(P.addDays(P.today, p.rx.issued)) + " · Diagnose: " + p.diag + " (ICD-10 " + p.icd + ") · Hausbesuch", R - L).forEach(function (l) { doc.text(l, L, y); y += 4.2; });
        y += 2;
      }
      doc.setFillColor(238, 243, 248); doc.rect(L, y - 4.5, R - L, 7, "F");
      doc.setFont("helvetica", "bold"); doc.setFontSize(8.5); doc.setTextColor.apply(doc, NAVY);
      doc.text("Datum", L + 2, y); doc.text("Leistung", L + 26, y); doc.text("Menge", 136, y, { align: "right" }); doc.text("Einzelpreis", 162, y, { align: "right" }); doc.text("Betrag", R - 2, y, { align: "right" });
      doc.setFont("helvetica", "normal"); doc.setTextColor.apply(doc, INK); y += 7;
      var lastDate = "";
      inv.lines.forEach(function (l) {
        if (y > 262) { doc.addPage(); y = 24; }
        if (l.date !== lastDate && lastDate) { doc.setDrawColor(230, 234, 240); doc.line(L, y - 4.2, R, y - 4.2); }
        doc.text(l.date !== lastDate ? l.date : "", L + 2, y); lastDate = l.date;
        doc.text(l.txt, L + 26, y);
        doc.text(l.k === "WG" ? String(l.qty).replace(".", ",") + " km" : String(l.qty), 136, y, { align: "right" });
        doc.text(P.eur(l.unit), 162, y, { align: "right" }); doc.text(P.eur(l.qty * l.unit), R - 2, y, { align: "right" });
        y += 5.4;
      });
      doc.setDrawColor.apply(doc, NAVY); doc.line(120, y - 2.5, R, y - 2.5); y += 3;
      doc.setFont("helvetica", "bold"); doc.setFontSize(10.5); doc.text("Gesamtbetrag", 122, y); doc.text(P.eur(inv.sum), R - 2, y, { align: "right" });
      doc.setFont("helvetica", "normal"); doc.setFontSize(9); y += 10;
      var notes = ["Umsatzsteuerfrei gemäß § 4 Nr. 14 Buchst. a UStG.",
        "Bitte überweisen Sie den Betrag bis zum " + P.dlong(dueDate) + " unter Angabe der Rechnungsnummer.",
        "Sie kommen spätestens 30 Tage nach Fälligkeit und Zugang dieser Rechnung in Verzug (§ 286 Abs. 3 BGB).",
        "Hinweis: Private Krankenversicherung oder Beihilfe erstatten unter Umständen nicht den vollen Betrag."];
      notes.forEach(function (n) { doc.splitTextToSize(n, R - L).forEach(function (l) { if (y > 270) { doc.addPage(); y = 24; } doc.text(l, L, y); y += 4.6; }); });
    } else {
      var fee = kind >= 2 ? s.dunFee * (kind - 1) : 0;
      [["Rechnung " + inv.no + " vom " + P.dlong(invDate), inv.sum], fee ? ["Mahngebühr", fee] : null].filter(Boolean).forEach(function (r) { doc.text(r[0], L, y); doc.text(P.eur(r[1]), R, y, { align: "right" }); y += 6; });
      doc.setDrawColor.apply(doc, NAVY); doc.line(120, y - 3, R, y - 3); y += 2;
      doc.setFont("helvetica", "bold"); doc.text("Offener Betrag", 122, y); doc.text(P.eur(inv.sum + fee), R, y, { align: "right" }); doc.setFont("helvetica", "normal"); y += 10;
      doc.splitTextToSize("Sollte sich Ihre Zahlung mit diesem Schreiben überschnitten haben, betrachten Sie es bitte als gegenstandslos.", R - L).forEach(function (l) { doc.text(l, L, y); y += 5; });
    }
    y += 6; doc.text("Mit freundlichen Grüßen", L, y); y += 6; doc.text(s.owner, L, y);
    var pages = doc.getNumberOfPages();
    for (var pg = 1; pg <= pages; pg++) {
      doc.setPage(pg); doc.setDrawColor(200, 206, 214); doc.line(L, 276, R, 276); doc.setFontSize(7.3); doc.setTextColor.apply(doc, MUTE);
      [[s.name, s.owner + ", Physiotherapeut", s.street + ", " + s.zip + " " + s.city], ["Telefon " + s.phone, s.mail, "www.physiotherapie-oehlke.de"],
        ["Steuernummer: " + (s.taxno || "[in den Einstellungen eintragen]"), "IBAN: " + (s.iban || "[in den Einstellungen eintragen]"), (s.bic ? "BIC: " + s.bic : "") + (s.bank ? " · " + s.bank : "")]].forEach(function (col, ci) {
        col.forEach(function (t, ri) { doc.text(t, L + ci * 60, 280.5 + ri * 3.6); });
      });
      if (pages > 1) doc.text("Seite " + pg + " von " + pages, R, 292, { align: "right" });
    }
    var name = (["Rechnung", "Zahlungserinnerung", "Mahnung-1", "Mahnung-2"][kind]) + "_" + inv.no + "_" + p.last.replace(/[^A-Za-z]/g, "") + ".pdf";
    if (preview) { window.open(doc.output("bloburl"), "_blank"); P.toast("Vorschau geöffnet"); }
    else { doc.save(name); P.toast(name + " gespeichert"); }
  }

  // ------------------------------------------------------------ Team
  P.TITLES.team = ["Team", "Kennzahlen je Therapeut:in, Fortbildung, Bewerbungen"];
  var APPLICANTS = [
    { n: "Sarah P.", r: "Physiotherapeutin, 4 J. Erfahrung", st: "Gespräch Do 10:00", s: "info" },
    { n: "Tim L.", r: "Berufseinsteiger, Geriatrie-Interesse", st: "Unterlagen geprüft", s: "plain" },
    { n: "Aylin D.", r: "Physiotherapeutin, MLD-Zertifikat", st: "Probetag vereinbart", s: "good" }
  ];
  function teamStats(t) {
    var n = 0, dr = 0, tr = 0, km = 0, rev = 0, days = 0;
    for (var di = 0; di < 5; di++) { var s = P.schedule(t.id, di); if (s.n) days++; n += s.n; dr += s.drive; tr += s.treat; km += s.km; s.ev.forEach(function (e) { if (e.type === "visit" && !e.cancelled) rev += revenueVisit(e.town, e.tr); }); }
    return { n: n, perDay: days ? Math.round(n / days * 10) / 10 : 0, share: P.pct(dr, dr + tr), km: Math.round(km), revH: dr + tr ? Math.round(rev / ((dr + tr) / 60)) : 0, load: P.pct(n, t.soll) };
  }
  V.team = function () {
    var st = P.TEAM.map(function (t) { return { t: t, s: teamStats(t) }; }), exp = expectedFb();
    var tot = st.reduce(function (a, x) { a.n += x.s.n; a.km += x.s.km; return a; }, { n: 0, km: 0 });
    return '<div class="grid g4">' + P.kpi("Hausbesuche (5 Werktage)", tot.n, "geplant im ganzen Team", "route") + P.kpi("Ø Umsatz pro Stunde", P.fmt(Math.round(st.reduce(function (a, x) { return a + x.s.revH; }, 0) / st.length)) + "<small> €</small>", "inkl. Fahrzeit, nach Preisliste", "euro") +
      P.kpi("Fahrzeit-Anteil", Math.round(st.reduce(function (a, x) { return a + x.s.share; }, 0) / st.length) + "<small> %</small>", "Ziel: unter 25 %", "gauge") + P.kpi("Kilometer", P.fmt(tot.km), "in den nächsten 5 Werktagen", "pin") + "</div>" +
      '<div class="card" style="margin-top:18px"><h3>Kennzahlen je Therapeut:in</h3><p class="hint">aus den geplanten Touren der nächsten 5 Werktage</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Name</th><th>Auslastung</th><th class="num">Besuche/Tag</th><th class="num">Fahrzeit</th><th class="num">€/Std.</th><th class="num">Ausfälle</th><th>Doku</th><th>Fortbildung bis ' + P.FB_DUE + "</th></tr></thead><tbody>" +
      st.map(function (x) {
        var t = x.t, s = x.s, fbp = Math.min(100, P.pct(t.fb, 60));
        return "<tr><td>" + P.who(t, t.role) + '</td><td><div style="display:flex;align-items:center;gap:8px;min-width:120px"><div class="bar ' + (s.load < 80 ? "warn" : "") + '" style="flex:1"><i style="width:' + Math.min(100, s.load) + '%"></i></div><small>' + s.n + "/" + t.soll + '</small></div></td><td class="num">' + String(s.perDay).replace(".", ",") + '</td><td class="num"><span class="pill pill--' + (s.share > 25 ? "warn" : "good") + '">' + s.share + ' %</span></td><td class="num">' + s.revH + ' €</td><td class="num">' + t.ausfall + " %</td><td>" +
          (t.doku ? '<span class="pill pill--warn">' + t.doku + " offen</span>" : '<span class="pill pill--good">aktuell</span>') + '</td><td><div style="display:flex;align-items:center;gap:8px;min-width:150px"><div class="bar lime" style="flex:1"><i style="width:' + fbp + '%"></i></div><small class="' + (t.fb < exp - 8 ? "bad" : "") + '">' + t.fb + "/60</small></div></td></tr>";
      }).join("") + '</tbody></table></div><p class="hint" style="margin:12px 0 0">Fortbildung: 60 Punkte in 4 Jahren (aktueller Zeitraum bis ' + P.FB_DUE + "). Soll heute etwa " + exp + " Punkte, rot = deutlich dahinter.</p></div>" +
      '<div class="grid g2" style="margin-top:18px"><div class="card"><h3>Bewerbungen</h3><p class="hint">aus der Karriereseite</p><ul class="list">' +
      APPLICANTS.map(function (a) { return '<li><div class="t"><b>' + esc(a.n) + "</b><small>" + esc(a.r) + '</small></div><span class="pill pill--' + a.s + '">' + esc(a.st) + "</span></li>"; }).join("") +
      '</ul></div><div class="card fill"><h3>Team-Info an alle</h3><p class="hint">kurze Mitteilung vorbereiten und per WhatsApp oder E-Mail teilen</p><label class="fld" style="flex:1;display:flex;flex-direction:column"><span>Nachricht</span><textarea id="teamMsg" rows="4" style="flex:1">Hallo Team, ab Montag gilt der neue Tourenplan. Bitte offene Dokumentationen bis Freitag nachtragen. Danke! Ramon</textarea></label><div style="display:flex;gap:10px;flex-wrap:wrap"><button class="btn" id="msgWa">Per WhatsApp teilen</button><button class="btn btn--ghost" id="msgMail">Per E-Mail</button></div></div></div>';
  };
  V.team.after = function () {
    $("#msgWa").onclick = function () { window.open("https://wa.me/?text=" + encodeURIComponent($("#teamMsg").value), "_blank", "noopener"); };
    $("#msgMail").onclick = function () { location.href = "mailto:?subject=" + encodeURIComponent("Team-Info") + "&body=" + encodeURIComponent($("#teamMsg").value); };
  };

  // ------------------------------------------------------------ Aufgaben
  P.TITLES.aufgaben = ["Aufgaben", "Was im Team zu erledigen ist"];
  var TASKS_DEFAULT = {
    todo: [{ t: "Therapieberichte Frau S. und Herr H. an Hausarzt", who: "ls" }, { t: "Rollator-Probe bei Herrn B. organisieren", who: "ro" }, { t: "Neue Theraband-Sets bestellen", who: "mw" }],
    doing: [{ t: "Dienstwagen 2: TÜV-Termin vereinbaren", who: "ro" }, { t: "Dokumentation Woche 39 nachtragen", who: "jk" }],
    done: [{ t: "Fortbildung Sturzprävention gebucht", who: "jk" }, { t: "Flyer an 3 Hausarztpraxen verteilt", who: "ro" }]
  };
  V.aufgaben = function () {
    var T = store.get("tasks", TASKS_DEFAULT), cols = [["todo", "Offen"], ["doing", "In Arbeit"], ["done", "Erledigt"]];
    return '<div class="kanban">' + cols.map(function (c) {
      return '<div class="col" data-col="' + c[0] + '"><h4>' + c[1] + " <span>" + T[c[0]].length + "</span></h4>" + T[c[0]].map(function (t, i) {
        var p = P.person(t.who);
        return '<div class="task" draggable="true" data-c="' + c[0] + '" data-i="' + i + '">' + esc(t.t) + '<div class="meta"><span>' + (p ? esc(p.name.split(" ")[0]) : "") + "</span><span>" +
          (c[0] !== "done" ? '<button class="x" title="Weiter" data-mv="' + c[0] + ":" + i + '">→</button>' : "") + '<button class="x" title="Löschen" data-del="' + c[0] + ":" + i + '">✕</button></span></div></div>';
      }).join("") + (c[0] === "todo" ? '<form class="addtask"><input placeholder="Neue Aufgabe …" aria-label="Neue Aufgabe"><select aria-label="Zuständig">' + P.TEAM.map(function (t) { return '<option value="' + t.id + '">' + t.name.split(" ")[0] + "</option>"; }).join("") + '</select><button class="btn btn--sm">+</button></form>' : "") + "</div>";
    }).join("") + '</div><p class="hint" style="margin-top:12px">Karten ziehen oder mit → weiterschieben. Wird in diesem Browser gespeichert.</p>';
  };
  V.aufgaben.after = function () {
    var T = store.get("tasks", TASKS_DEFAULT), drag = null, nextCol = { todo: "doing", doing: "done" };
    function save() { store.set("tasks", T); P.rerender(); }
    $$(".task").forEach(function (t) { t.addEventListener("dragstart", function () { drag = { c: t.dataset.c, i: +t.dataset.i }; }); });
    $$(".col").forEach(function (col) {
      col.addEventListener("dragover", function (e) { e.preventDefault(); col.classList.add("over"); });
      col.addEventListener("dragleave", function () { col.classList.remove("over"); });
      col.addEventListener("drop", function () { if (!drag) return; T[col.dataset.col].push(T[drag.c].splice(drag.i, 1)[0]); save(); });
    });
    $$("[data-mv]").forEach(function (b) { b.onclick = function () { var p = b.dataset.mv.split(":"); T[nextCol[p[0]]].push(T[p[0]].splice(+p[1], 1)[0]); save(); }; });
    $$("[data-del]").forEach(function (b) { b.onclick = function () { var p = b.dataset.del.split(":"), item = T[p[0]].splice(+p[1], 1)[0]; save(); P.toast("Aufgabe gelöscht", function () { T[p[0]].splice(+p[1], 0, item); save(); }); }; });
    var f = $(".addtask"); if (f) f.onsubmit = function (e) { e.preventDefault(); var v = $("input", f).value.trim(); if (!v) return; T.todo.push({ t: v, who: $("select", f).value }); save(); };
  };

  // ------------------------------------------------------------ Urlaub & Vertretung
  P.TITLES.abwesenheit = ["Urlaub & Vertretung", "Abwesenheiten planen, Engpässe früh sehen"];
  var ABSENCE = { ro: { u: [11, 12], f: [] }, ls: { u: [3, 4, 5, 6, 7], f: [] }, jk: { u: [], f: [15, 16], k: [1] }, mw: { u: [17, 18, 19, 20], f: [] } };
  V.abwesenheit = function () {
    var head = '<div class="h n"></div>';
    for (var d = 0; d < 21; d++) { var dt = P.addDays(P.today, d), we = dt.getDay() === 0 || dt.getDay() === 6; head += '<div class="h' + (we ? " we" : "") + '">' + dt.toLocaleDateString("de-DE", { weekday: "narrow" }) + "<br>" + dt.getDate() + "</div>"; }
    var rows = P.TEAM.map(function (t) {
      var a = ABSENCE[t.id], r = '<div class="n">' + esc(t.name) + "</div>";
      for (var d = 0; d < 21; d++) { var dt = P.addDays(P.today, d), we = dt.getDay() === 0 || dt.getDay() === 6; var c = a.u.indexOf(d) >= 0 ? "u" : a.f.indexOf(d) >= 0 ? "f" : (a.k || []).indexOf(d) >= 0 ? "k" : we ? "we" : ""; r += '<div class="' + c + '">' + ({ u: "U", f: "F", k: "K" }[c] || "") + "</div>"; }
      return r;
    }).join("");
    var conflicts = [];
    for (var d2 = 0; d2 < 21; d2++) {
      var dd = P.addDays(P.today, d2); if (dd.getDay() === 0 || dd.getDay() === 6) continue;
      var off = P.TEAM.filter(function (t) { var a = ABSENCE[t.id]; return a.u.indexOf(d2) >= 0 || a.f.indexOf(d2) >= 0 || (a.k || []).indexOf(d2) >= 0; });
      if (off.length) conflicts.push({ d: dd, off: off, sev: off.length >= 2 ? "warn" : "info" });
    }
    return '<div class="card"><h3>Urlaub, Fortbildung, Krankheit</h3><p class="hint">die nächsten 3 Wochen · Engpässe werden automatisch markiert</p><div class="cal">' + head + rows + '</div><div class="legend"><span><i style="background:#cfe9f2"></i>U Urlaub</span><span><i style="background:#e4f2d6"></i>F Fortbildung</span><span><i style="background:#fde6db"></i>K Krank</span></div></div>' +
      '<div class="card" style="margin-top:18px"><h3>Vertretung planen</h3><p class="hint">an Tagen mit Abwesenheit: wer die Hausbesuche übernehmen kann (wenigste Besuche zuerst)</p>' +
      (conflicts.length ? '<ul class="list">' + conflicts.slice(0, 8).map(function (c) {
        var free = P.TEAM.filter(function (t) { return c.off.indexOf(t) < 0; }).sort(function (a, b) { return a.soll - b.soll; });
        return '<li><span class="dot" style="background:' + (c.sev === "warn" ? "#d69426" : "#46b2d0") + '"></span><div class="t">' + P.wd(c.d) + " " + P.dstr(c.d) + ": " + c.off.map(function (t) { return t.name.split(" ")[0]; }).join(" + ") + " fehlt<small>Vertretung möglich: " + free.map(function (t) { return t.name.split(" ")[0]; }).join(", ") + "</small></div>" + (c.sev === "warn" ? '<span class="pill pill--warn">Engpass</span>' : "") + "</li>";
      }).join("") + "</ul>" : P.empty("Keine Abwesenheiten", "In den nächsten 3 Wochen sind alle da.")) + "</div>";
  };

  // ------------------------------------------------------------ Einstellungen
  P.TITLES.einstellungen = ["Einstellungen", "Praxisdaten für Rechnungen, Preise, Regeln"];
  V.einstellungen = function () {
    var s = P.settings(), pr = P.prices();
    function fld(k, label, ph) { return '<label class="fld"><span>' + label + '</span><input name="' + k + '" value="' + esc(s[k]) + '" placeholder="' + (ph || "") + '"></label>'; }
    return '<div class="grid g2"><div class="card"><h3>Praxisdaten für Rechnungen</h3><p class="hint">Pflichtangaben nach § 14 UStG. Bleiben in diesem Browser.</p><form id="setForm">' +
      fld("name", "Praxisname") + '<div class="fld2">' + fld("owner", "Inhaber") + fld("phone", "Telefon") + "</div>" + fld("street", "Straße") + '<div class="fld2">' + fld("zip", "PLZ") + fld("city", "Ort") + "</div>" + fld("mail", "E-Mail") +
      '<div class="fld2">' + fld("taxno", "Steuernummer", "z. B. 32/123/45678") + fld("iban", "IBAN", "DE…") + '</div><div class="fld2">' + fld("bic", "BIC") + fld("bank", "Bank") + "</div>" +
      '<div class="fld2">' + fld("due", "Zahlungsziel (Tage)") + fld("nextNo", "Nächste Rechnungsnummer") + '</div><div class="fld2">' + fld("dunFee", "Mahngebühr (€)") + fld("cancelHours", "Absagefrist (Std.)") + '</div><button class="btn">Speichern</button></form></div>' +
      '<div class="card"><div class="card__head"><div><h3>Preisliste</h3><p class="hint">Beispielpreise, frei vereinbar. Orientierung: GebüTh bzw. Beihilfe-Höchstsätze (Hausbesuch 12,10 €, 0,30 €/km).</p></div>' + (store.get("prices_ok") ? '<span class="pill pill--good">bestätigt</span>' : "") + '</div><form id="priceForm"><div class="tbl-wrap"><table class="tbl"><tbody>' +
      pr.map(function (x, i) { return "<tr><td>" + esc(x.name) + (x.min ? ", " + x.min + " Min." : "") + '</td><td class="num"><input class="num-in" name="p' + i + '" value="' + String(x.price).replace(".", ",") + '" inputmode="decimal"> €</td></tr>'; }).join("") +
      '</tbody></table></div><button class="btn" style="margin-top:12px">Preise bestätigen</button></form></div></div>';
  };
  V.einstellungen.after = function () {
    $("#setForm").onsubmit = function (e) {
      e.preventDefault(); var s = P.settings(), f = e.target;
      Object.keys(s).forEach(function (k) { if (f[k]) s[k] = ["due", "nextNo", "dunFee", "cancelHours"].indexOf(k) >= 0 ? (+String(f[k].value).replace(",", ".") || s[k]) : f[k].value.trim(); });
      P.saveSettings(s); P.toast("Praxisdaten gespeichert"); P.rerender();
    };
    $("#priceForm").onsubmit = function (e) {
      e.preventDefault(); var pr = P.prices();
      pr.forEach(function (x, i) { var v = parseFloat(String(e.target["p" + i].value).replace(",", ".")); if (!isNaN(v)) x.price = v; });
      store.set("prices", pr); store.set("prices_ok", 1); P.toast("Preise gespeichert"); P.rerender();
    };
  };
})();

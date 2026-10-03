/* Praxis-Cockpit · Website & SEO: Beiträge mit KI, SEO-Analyse, Rankings, Besucher, Werkzeuge */
(function () {
  "use strict";
  var P = window.PC, $ = P.$, $$ = P.$$, esc = P.esc, icon = P.icon, store = P.store, V = P.V, TOPICS = window.PC_TOPICS || [];

  // ------------------------------------------------------------ Beispieldaten SEO
  var KEYWORDS = [
    ["mobile physiotherapie hockenheim", 1, 1, 90, "/"], ["physiotherapie hausbesuch hockenheim", 2, 3, 70, "/physiotherapie-hockenheim"],
    ["physiotherapie hausbesuch schwetzingen", 4, 6, 110, "/physiotherapie-schwetzingen"], ["geriatrische physiotherapie hausbesuch", 3, 5, 50, "/geriatrische-physiotherapie-hausbesuch"],
    ["physiotherapie hausbesuch heidelberg", 9, 12, 260, "/physiotherapie-heidelberg"], ["lymphdrainage hausbesuch", 7, 7, 140, "/lymphdrainage-hausbesuch"],
    ["krankengymnastik hausbesuch", 12, 15, 320, "/krankengymnastik-hausbesuch"], ["physiotherapie zuhause", 18, 21, 590, "/"],
    ["manuelle therapie hausbesuch", 8, 6, 90, "/manuelle-therapie-hausbesuch"], ["gangschule senioren", 14, 19, 70, "/gangschule-hausbesuch"],
    ["physiotherapie walldorf hausbesuch", 6, 9, 40, "/physiotherapie-walldorf"], ["physiotherapie wiesloch hausbesuch", 11, 10, 50, "/physiotherapie-wiesloch"],
    ["sturzprävention senioren", 24, 31, 210, "/geriatrische-physiotherapie-hausbesuch"], ["atemtherapie hausbesuch", 5, 8, 30, "/atemtherapie-hausbesuch"],
    ["physiotherapie privatpatienten hockenheim", 2, 2, 30, "/"], ["physiotherapie hausbesuch kosten", 15, 17, 260, "/"]
  ];
  P.visits = function (days) {
    P.seed(42); var out = [];
    for (var i = days - 1; i >= 0; i--) {
      var d = P.addDays(P.today, -i), wd = d.getDay(), base = 38 + (days - i) * 0.35;
      out.push({ d: d, v: Math.round(base * (wd === 0 ? .55 : wd === 6 ? .7 : 1) + P.rnd() * 14) });
    }
    return out;
  };
  var SOURCES = [["Google Suche", 58], ["Direkt", 17], ["Google Maps", 14], ["Verweise (Ärzte, Verzeichnisse)", 7], ["Social Media", 4]];
  var DEVICES = [["Smartphone", 64], ["Computer", 27], ["Tablet", 9]];
  var PAGES = [["/", 1240, "1:42"], ["/geriatrische-physiotherapie-hausbesuch", 486, "2:51"], ["/physiotherapie-hockenheim", 371, "1:20"], ["/krankengymnastik-hausbesuch", 302, "2:05"], ["/physiotherapie-schwetzingen", 244, "1:11"], ["/karriere", 131, "1:37"]];
  var SERVICES = [["/geriatrische-physiotherapie-hausbesuch", "Geriatrische Physiotherapie"], ["/krankengymnastik-hausbesuch", "Krankengymnastik"], ["/gangschule-hausbesuch", "Gangschule"], ["/alltagstraining-hausbesuch", "Alltagstraining"], ["/manuelle-therapie-hausbesuch", "Manuelle Therapie"], ["/lymphdrainage-hausbesuch", "Lymphdrainage"], ["/atemtherapie-hausbesuch", "Atemtherapie"], ["/klassische-massage-hausbesuch", "Klassische Massage"]];

  // ------------------------------------------------------------ Beiträge: Speicher
  function arts() { return store.get("articles", []); }
  function saveArts(a) { store.set("articles", a); }
  function art(id) { return arts().filter(function (a) { return String(a.id) === String(id); })[0]; }
  function putArt(x) { var l = arts(), i = l.map(function (a) { return String(a.id); }).indexOf(String(x.id)); if (i < 0) l.push(x); else l[i] = x; saveArts(l); }
  function topic(id) { return TOPICS.filter(function (t) { return t.id === id; })[0]; }
  P.ARTICLE_STATUS = { entwurf: ["Entwurf", "plain"], pruefung: ["Wartet auf Prüfung", "warn"], geplant: ["Geplant", "info"], live: ["Veröffentlicht", "good"] };
  function autopilot() { return store.get("autopilot", { on: true, perMonth: 2, autoDraft: true, autoPublish: true }); }

  // ------------------------------------------------------------ KI-Vorschläge
  P.suggestions = function () {
    var m = P.today.getMonth() + 1, used = arts().map(function (a) { return a.topic; }), hidden = store.get("sugg_hidden", []);
    var reqText = P.requests().map(function (r) { return r.topic; }).join(" ") + " " + P.patients().map(function (p) { return p.diag; }).join(" ");
    return TOPICS.filter(function (t) { return used.indexOf(t.id) < 0 && hidden.indexOf(t.id) < 0; }).map(function (t) {
      var why = [], f = 1;
      if (t.rank && t.rank > 3) { f *= t.rank <= 10 ? 1.3 : t.rank <= 20 ? 1.6 : 1.4; why.push(["trend", "Platz " + t.rank + " für „" + t.kw + "“, ein Beitrag mit Link auf die Leistungsseite kann nach oben helfen"]); }
      else if (!t.rank) { f *= 1.2; why.push(["globe", "Noch keine Seite zu „" + t.kw + "“, " + t.vol + " Suchen pro Monat"]); }
      if (t.season.indexOf(m) >= 0) { f *= 1.6; why.push(["cal", "Saison: Das Thema wird gerade häufiger gesucht"]); }
      var hits = t.match ? (reqText.match(new RegExp(t.match.source, "gi")) || []).length : 0;
      if (hits) { f *= 1 + Math.min(hits, 4) * .12; why.push(["inbox", P.plural(hits, "aktuelle Anfrage bzw. Patient:in", "aktuelle Anfragen bzw. Patient:innen") + " zu diesem Thema"]); }
      return { t: t, score: Math.round(t.vol * f), why: why };
    }).sort(function (a, b) { return b.score - a.score; });
  };

  // ------------------------------------------------------------ Entwurf erzeugen (Vorlagen-KI)
  var PLACE_ALL = "in Hockenheim, Schwetzingen, Heidelberg und Umgebung";
  function ortTxt(town) { return town ? "nach " + town + " und in die Umgebung" : PLACE_ALL; }
  function fillOrt(s, town) { return s.replace(/\{ort\}/g, town ? "nach " + town + " und Umgebung" : PLACE_ALL).replace("Wir kommen zu Ihnen in Hockenheim", "Wir kommen zu Ihnen nach Hockenheim").replace("Wir kommen zu Ihnen in ", "Wir kommen zu Ihnen in "); }
  function newArticle(t, auto) {
    var town = "";
    return {
      id: Date.now() + Math.floor(Math.random() * 1000), topic: t.id, user: !auto, auto: !!auto, title: t.title, kw: t.kw, also: t.also.slice(0, 3), tone: "sie", town: town, len: "normal",
      outline: Object.keys(t.body).concat(["Häufige Fragen"]), links: [t.page[0], t.link2[0]], step: 1, maxStep: 1, status: "entwurf", created: Date.now(), reviewer: "", reviewed: false, html: "", metaTitle: "", metaDesc: "", variant: 0, img: t.img
    };
  }
  function generate(a) {
    var t = topic(a.topic), town = a.town, html = "", sec = 0;
    var intro = t.intro[a.tone] || t.intro.sie;
    if (a.variant % 2) intro = intro.replace(/^(.+?\.)\s(.+)$/, "$2 $1");
    html += '<p class="lead">' + intro + "</p>";
    var outline = a.len === "kurz" ? a.outline.filter(function (h) { return h !== "Häufige Fragen"; }).slice(0, 3).concat(a.outline.indexOf("Häufige Fragen") >= 0 ? ["Häufige Fragen"] : []) : a.outline;
    var linkMap = {}; SERVICES.concat([["/", "Startseite"]]).forEach(function (s) { linkMap[s[0]] = s[1]; });
    if (town) linkMap[P.TOWN_SLUG(town)] = "Physiotherapie in " + town;
    var linksLeft = a.links.slice(0);
    outline.forEach(function (h) {
      if (h === "Häufige Fragen") {
        html += "<h2>Häufige Fragen</h2>" + t.faq.map(function (q) { return "<h3>" + q[0] + "</h3><p>" + q[1] + "</p>"; }).join("");
        return;
      }
      html += "<h2>" + esc(h) + "</h2>";
      var paras = t.body[h];
      if (!paras) { html += "<p>[KI-Hinweis: Dieser Abschnitt wurde in der Gliederung ergänzt. Bitte 2 bis 3 Sätze aus der Praxis schreiben.]</p>"; return; }
      paras.forEach(function (p, i) { html += p.charAt(0) === "<" ? p : "<p>" + fillOrt(p, town) + "</p>"; });
      sec++;
      if (linksLeft.length && (sec === 2 || sec === 3)) { var l = linksLeft.shift(); html += '<p>Mehr dazu: <a href="' + l + '">' + esc(linkMap[l] || l) + "</a>.</p>"; }
    });
    if (a.len !== "kurz") {
      html += "<h2>So arbeiten wir im Hausbesuch</h2><p>Jeder Termin dauert bei uns 60 Minuten. So bleibt Zeit für Übungen, Fragen und eine Anleitung, die Sie zwischen den Terminen umsetzen können. Unser Schwerpunkt ist die Arbeit mit älteren Menschen. Angehörige sind gern dabei, wenn Sie das möchten.</p>" +
        "<p>Wir behandeln Privatpatienten, Beihilfeberechtigte und Selbstzahler. Vor dem ersten Termin erhalten Sie eine Preisinformation, damit Sie wissen, welche Kosten entstehen können.</p>" +
        "<h2>Wann Sie ärztlichen Rat einholen sollten</h2><p>Physiotherapie ersetzt keine ärztliche Untersuchung. Bei neuen oder stärker werdenden Beschwerden, nach einem Sturz mit Schmerzen oder bei plötzlicher Schwäche sprechen Sie bitte zuerst mit Ihrer Ärztin oder Ihrem Arzt.</p>";
    }
    if (a.len === "lang" && t.check) html += "<h2>Checkliste zum Ausdrucken</h2><ul>" + t.check.map(function (c) { return "<li>" + c + "</li>"; }).join("") + "</ul>";
    if (linksLeft.length) html += "<p>Passend dazu: " + linksLeft.map(function (l) { return '<a href="' + l + '">' + esc(linkMap[l] || l) + "</a>"; }).join(" und ") + ".</p>";
    html += '<p class="cta-line">Sie möchten wissen, ob ein Hausbesuch für Sie oder Ihre Angehörigen passt? Rufen Sie an unter <a href="tel:+4917643630803">0176 43630803</a> oder <a href="/#kontakt">fragen Sie einen Termin an</a>. Wir kommen ' + ortTxt(town) + ".</p>";
    a.html = html;
    var base = a.title.split(":")[0] + (town && a.title.indexOf(town) < 0 ? " in " + town : "");
    a.metaTitle = (base + " | Physiotherapie Oehlke").length <= 65 ? base + " | Physiotherapie Oehlke" : (base + " | Physio Oehlke").length <= 65 ? base + " | Physio Oehlke" : base.slice(0, 62);
    var d = intro.replace(/<[^>]+>/g, "").split(". ").slice(0, 2).join(". ");
    a.metaDesc = (d.length > 150 ? d.slice(0, d.lastIndexOf(" ", 147)) + " …" : d.replace(/\.?$/, "."));
    return a;
  }

  // ------------------------------------------------------------ Prüfung (HWG, SEO, Lesbarkeit)
  var HWG = [
    { re: /\b(heilt|heilen|geheilt)\b/gi, sev: "e", why: "Heilversprechen sind in der Gesundheitswerbung verboten (§ 3 HWG).", fix: "kann unterstützen" },
    { re: /\bgarantier\w*/gi, sev: "e", why: "Garantien für einen Behandlungserfolg sind unzulässig.", fix: "" },
    { re: /\bschmerzfrei\b/gi, sev: "e", why: "Verspricht ein Ergebnis (§ 3 HWG).", fix: "mit weniger Beschwerden" },
    { re: /\b100\s?%/g, sev: "e", why: "Absolute Aussage, die nicht belegbar ist.", fix: "" },
    { re: /\b(ohne (jedes )?risiko|risikolos|nebenwirkungsfrei)\b/gi, sev: "e", why: "Aussage zur Risikofreiheit ist irreführend (§ 3 HWG).", fix: "gut verträglich" },
    { re: /\bwunder\w*/gi, sev: "e", why: "Übertreibung, wirkt wie ein Heilversprechen.", fix: "" },
    { re: /\bsofort(ige[nrs]?)? (besser|hilf\w*|wirk\w*|linder\w*)/gi, sev: "e", why: "Sofortiger Erfolg darf nicht versprochen werden.", fix: "Schritt für Schritt" },
    { re: /\b(hilft|wirkt)\b/gi, sev: "w", why: "Wirkaussage. Vorsichtiger: „kann helfen“ bzw. „kann wirken“.", fix: function (m) { return "kann " + (m.toLowerCase() === "hilft" ? "helfen" : "wirken"); } },
    { re: /\b(beste[nmrs]?|einzige[nmrs]?|führende[nmrs]?)\b/gi, sev: "w", why: "Spitzenstellung nur mit Beleg verwenden.", fix: "erfahrene" },
    { re: /\b(lebensgefahr|lebensgefährlich|gefährliche[nmrs]? folgen|bevor es zu spät)\b/gi, sev: "e", why: "Angst erzeugen ist in der Gesundheitswerbung unzulässig (§ 11 HWG).", fix: "" },
    { re: /\bvorher[- ]nachher\b/gi, sev: "e", why: "Vorher-nachher-Darstellungen sind gegenüber Laien unzulässig (§ 11 HWG).", fix: "" },
    { re: /\bstudien (zeigen|belegen|beweisen)\b/gi, sev: "w", why: "Studien nur mit Quellenangabe nennen.", fix: "Studien deuten darauf hin" }
  ];
  function textOf(html) { var d = document.createElement("div"); d.innerHTML = html; return d.textContent.replace(/\s+/g, " ").trim(); }
  function runChecks(a) {
    var txt = textOf(a.html), lower = txt.toLowerCase(), kw = a.kw.toLowerCase(), legal = [], seo = [], read = [];
    HWG.forEach(function (r) { var m = txt.match(r.re); if (m) { var uniq = m.filter(function (v, i) { return m.indexOf(v) === i; }); legal.push({ sev: r.sev, txt: "„" + uniq.slice(0, 3).join("“, „") + "“", why: r.why, rule: r, words: uniq }); } });
    var words = txt.split(/\s+/).length, d = document.createElement("div"); d.innerHTML = a.html;
    var links = d.querySelectorAll('a[href^="/"]').length, h2 = d.querySelectorAll("h2").length, firstP = (d.querySelector("p") || { textContent: "" }).textContent.toLowerCase();
    var kwParts = kw.split(" ").filter(function (w) { return w.length > 3; });
    var kwIn = function (s) { s = s.toLowerCase(); return kwParts.filter(function (w) { return s.indexOf(w.slice(0, Math.max(4, w.length - 2))) >= 0; }).length >= Math.ceil(kwParts.length * .6); };
    function c(ok, warn, label, hint) { return { sev: ok ? "ok" : warn ? "w" : "e", txt: label, why: hint }; }
    seo.push(c(kwIn(a.title), false, "Suchbegriff im Titel", "„" + a.kw + "“ sollte in der Überschrift vorkommen."));
    seo.push(c(kwIn(firstP), true, "Suchbegriff im ersten Absatz", "Hilft Google und Lesern, das Thema sofort zu erkennen."));
    seo.push(c(a.metaTitle.length >= 30 && a.metaTitle.length <= 65, true, "Seitentitel " + a.metaTitle.length + " Zeichen", "Ideal 30 bis 65 Zeichen."));
    seo.push(c(a.metaDesc.length >= 110 && a.metaDesc.length <= 160, true, "Beschreibung " + a.metaDesc.length + " Zeichen", "Ideal 110 bis 160 Zeichen."));
    seo.push(c(words >= 350, words >= 250, P.fmt(words) + " Wörter", "Ratgeber ab etwa 350 Wörtern beantworten Fragen gründlicher."));
    seo.push(c(links >= 2, links >= 1, P.plural(links, "interner Link", "interne Links"), "Mindestens 2 Links auf Leistungs- oder Ortsseiten."));
    seo.push(c(h2 >= 3, false, P.plural(h2, "Zwischenüberschrift", "Zwischenüberschriften"), "Gliederung mit mindestens 3 Abschnitten."));
    seo.push(c(/häufige fragen/i.test(txt), true, "Häufige Fragen", "FAQ-Abschnitt beantwortet typische Suchanfragen direkt."));
    var sents = txt.split(/[.!?]+\s/).filter(function (s) { return s.split(" ").length > 2; }), avg = sents.length ? Math.round(words / sents.length) : 0;
    read.push(c(avg <= 18, avg <= 23, "Ø " + avg + " Wörter pro Satz", "Kurze Sätze lesen sich leichter, Ziel höchstens 18."));
    read.push(c(!/\[KI-Hinweis|\[[^\]]{3,}\]/.test(txt), false, "Keine offenen Platzhalter", "Abschnitte mit [Hinweis] noch ausformulieren."));
    read.push(c(!!a.reviewed, false, "Fachlich geprüft", "Gesundheitsthemen vor dem Veröffentlichen von einer Fachperson prüfen lassen (Google: YMYL, E-E-A-T)."));
    var all = legal.concat(seo, read), errs = all.filter(function (x) { return x.sev === "e"; }).length, warns = all.filter(function (x) { return x.sev === "w"; }).length;
    var score = Math.max(0, 100 - errs * 15 - warns * 5);
    return { legal: legal, seo: seo, read: read, errs: errs, legalErrs: legal.filter(function (x) { return x.sev === "e"; }).length, warns: warns, score: score, words: words };
  }

  // ------------------------------------------------------------ Zeitplanung, Autopilot
  function nextSlot() { var d = P.addDays(P.today, 1); while (d.getDay() !== 2) d = P.addDays(d, 1); d.setHours(8, 0, 0, 0); var taken = arts().filter(function (a) { return a.status === "geplant"; }).map(function (a) { return new Date(a.pubAt).toDateString(); }); while (taken.indexOf(d.toDateString()) >= 0) d = P.addDays(d, 7); return d; }
  function isoLocal(d) { var z = new Date(d.getTime() - d.getTimezoneOffset() * 60000); return z.toISOString().slice(0, 16); }
  P.onStart = P.onStart || [];
  P.onStart.push(function () {
    var list = arts(), changed = false, now = Date.now();
    if (!store.get("articles_seeded")) {
      var t1 = topic("kg"); if (t1) { var a1 = generate(newArticle(t1, true)); a1.id = 1001; a1.status = "live"; a1.reviewed = true; a1.reviewer = "ro"; a1.pubAt = P.addDays(P.today, -12).toISOString(); a1.step = 6; a1.maxStep = 6; a1.auto = false; list.push(a1); }
      store.set("articles_seeded", 1); changed = true;
    }
    list.forEach(function (a) { if (a.status === "geplant" && new Date(a.pubAt).getTime() <= now) { a.status = "live"; changed = true; } });
    var ap = autopilot();
    if (ap.on && ap.autoDraft) {
      var monthStart = new Date(P.today.getFullYear(), P.today.getMonth(), 1).getTime();
      var thisMonth = list.filter(function (a) { return a.created >= monthStart && a.auto; }).length;
      var waiting = list.filter(function (a) { return a.status === "pruefung" && a.auto; }).length;
      if (thisMonth < ap.perMonth && waiting < 2) {
        store.set("articles", list);
        P.suggestions().slice(0, ap.perMonth - thisMonth).forEach(function (s) { var a = generate(newArticle(s.t, true)); a.status = "pruefung"; a.step = 4; a.maxStep = 4; a.why = s.why.map(function (w) { return w[1]; }); list.push(a); });
        changed = true;
      }
    }
    if (changed) saveArts(list);
  });

  // ------------------------------------------------------------ Hinweise für „Heute“
  P.badges.beitraege = function () { return arts().filter(function (a) { return a.status === "pruefung"; }).length; };
  P.seoActions.push(function () {
    var out = [], wait = arts().filter(function (a) { return a.status === "pruefung"; });
    if (wait.length) out.push({ sev: "warn", ico: "spark", t: P.plural(wait.length, "KI-Entwurf wartet", "KI-Entwürfe warten") + " auf Ihre Prüfung", s: wait.map(function (a) { return "„" + a.title.split(":")[0] + "“"; }).join(", "), btn: ["Prüfen", "#studio/" + wait[0].id] });
    var plan = arts().filter(function (a) { return a.status === "geplant"; }).sort(function (a, b) { return new Date(a.pubAt) - new Date(b.pubAt); })[0];
    if (plan) out.push({ sev: "info", ico: "cal", t: "Beitrag geht " + P.wd(new Date(plan.pubAt)) + " " + P.dstr(new Date(plan.pubAt)) + " automatisch online", s: plan.title, btn: ["Ansehen", "#studio/" + plan.id] });
    if (!wait.length && !plan) { var s = P.suggestions()[0]; if (s) out.push({ sev: "info", ico: "spark", t: "KI-Vorschlag: „" + s.t.title.split(":")[0] + "“", s: s.why.map(function (w) { return w[1]; })[0] || "", btn: ["Beitrag erstellen", function () { startFrom(s.t); }] }); }
    return out;
  });
  P.seoMini = function () {
    var live = arts().filter(function (a) { return a.status === "live"; }).length, plan = arts().filter(function (a) { return a.status === "geplant"; }).length;
    return '<p class="hint" style="margin:10px 0 0">' + P.fmt(P.visits(30).reduce(function (s, d) { return s + d.v; }, 0)) + " Besucher · " + P.plural(live, "Beitrag", "Beiträge") + " online" + (plan ? " · " + plan + " geplant" : "") + "</p>";
  };
  function startFrom(t) { var a = newArticle(t, false); putArt(a); location.hash = "studio/" + a.id; }

  // ------------------------------------------------------------ Beiträge: Übersicht
  P.TITLES.beitraege = ["Beiträge mit KI", "Die KI schlägt Themen vor und schreibt Entwürfe. Sie prüfen, sehen die Vorschau und veröffentlichen."];
  V.beitraege = function () {
    var sug = P.suggestions(), list = arts(), ap = autopilot();
    var cols = [["entwurf", "Entwurf"], ["pruefung", "Wartet auf Prüfung"], ["geplant", "Geplant"], ["live", "Veröffentlicht"]];
    return '<div class="flow">' + [["spark", "KI schlägt vor"], ["file", "Briefing"], ["pen", "Entwurf"], ["check", "Prüfung"], ["eye", "Vorschau"], ["globe", "Online"]].map(function (s, i) { return '<div class="flow__s"><span>' + icon(s[0]) + "</span><b>" + (i + 1) + ". " + s[1] + "</b></div>"; }).join('<i class="flow__a"></i>') + "</div>" +
      '<div class="grid g-21" style="margin-top:18px"><div class="card"><div class="card__head"><div><h3>KI-Themenvorschläge</h3><p class="hint">aus Rankings, Suchvolumen, Saison und den Anliegen Ihrer Patient:innen berechnet</p></div></div>' +
      (sug.length ? '<ul class="sugg">' + sug.slice(0, 5).map(function (s, i) {
        var max = sug[0].score;
        return '<li><div class="sugg__main"><b>' + esc(s.t.title) + '</b><div class="sugg__meta"><span class="pill pill--plain">' + esc(s.t.kw) + "</span><span>" + s.t.vol + " Suchen/Monat</span>" + (s.t.rank ? "<span>aktuell Platz " + s.t.rank + "</span>" : "<span>noch nicht gefunden</span>") + '</div><ul class="sugg__why">' + s.why.map(function (w) { return "<li>" + icon(w[0]) + esc(w[1]) + "</li>"; }).join("") + '</ul></div><div class="sugg__side"><div class="sugg__score" title="Potenzial"><i style="width:' + Math.round(s.score / max * 100) + '%"></i></div><button class="btn btn--sm ' + (i === 0 ? "btn--lime" : "") + '" data-start="' + s.t.id + '">' + icon("spark") + ' Beitrag erstellen</button><button class="btn btn--sm btn--ghost" data-hide="' + s.t.id + '">Später</button></div></li>';
      }).join("") + "</ul>" : P.empty("Alle Vorschläge umgesetzt", "Neue Vorschläge entstehen, sobald sich Rankings oder Anfragen ändern.", '<button class="btn btn--sm btn--ghost" id="unhide">Ausgeblendete zeigen</button>')) + "</div>" +
      '<div class="stack"><div class="card"><div class="card__head"><div><h3>KI-Redaktion</h3><p class="hint">läuft automatisch im Hintergrund</p></div><label class="switch"><input type="checkbox" id="apOn"' + (ap.on ? " checked" : "") + '><span></span></label></div>' +
      '<ul class="ap' + (ap.on ? "" : " off") + '"><li><label class="chk"><input type="checkbox" id="apDraft"' + (ap.autoDraft ? " checked" : "") + "> Jeden Monat " + '<select id="apN"><option' + (ap.perMonth === 1 ? " selected" : "") + ">1</option><option" + (ap.perMonth === 2 ? " selected" : "") + ">2</option><option" + (ap.perMonth === 4 ? " selected" : "") + ">4</option></select> Entwürfe zu den besten Themen vorbereiten</label></li>" +
      '<li><label class="chk"><input type="checkbox" id="apPub"' + (ap.autoPublish ? " checked" : "") + "> Geprüfte Beiträge am geplanten Tag automatisch veröffentlichen</label></li>" +
      '<li class="locked"><label class="chk"><input type="checkbox" disabled> Ohne Prüfung veröffentlichen</label><small>bewusst gesperrt: Gesundheitstexte brauchen eine fachliche Freigabe (Heilmittelwerbegesetz, Google-Qualitätsrichtlinien)</small></li></ul>' +
      '<p class="hint" style="margin:12px 0 0">Demo: Die Texte stammen aus fachlich vorbereiteten Bausteinen. Mit angebundenem KI-Dienst schreibt die KI jeden Beitrag neu (Kosten etwa 2 bis 5 Cent pro Beitrag).</p></div>' +
      '<div class="card fill"><h3>Redaktionsplan</h3><p class="hint">ein Beitrag alle 2 Wochen ist für eine lokale Praxis ein gutes Tempo</p><ul class="list">' +
      list.filter(function (a) { return a.status === "geplant" || a.status === "live"; }).sort(function (a, b) { return new Date(b.pubAt) - new Date(a.pubAt); }).slice(0, 4).map(function (a) { var d = new Date(a.pubAt); return '<li><span class="pill pill--' + P.ARTICLE_STATUS[a.status][1] + '">' + P.dstr(d) + '</span><div class="t">' + esc(a.title.split(":")[0]) + "<small>" + P.ARTICLE_STATUS[a.status][0] + "</small></div></li>"; }).join("") +
      '<li><span class="pill pill--plain">' + P.dstr(nextSlot()) + '</span><div class="t">Nächster freier Termin<small>Dienstag, 8:00 Uhr</small></div></li></ul></div></div></div>' +
      '<div class="kanban kanban--4" style="margin-top:18px">' + cols.map(function (c) {
        var items = list.filter(function (a) { return a.status === c[0]; });
        return '<div class="col"><h4>' + c[1] + " <span>" + items.length + "</span></h4>" + (items.length ? items.map(function (a) {
          var ch = runChecks(a);
          return '<a class="task art" href="#studio/' + a.id + '"><b>' + esc(a.title.split(":")[0]) + '</b><div class="meta"><span>' + (a.auto ? "von der KI vorbereitet" : "eigener Beitrag") + "</span><span>" + (a.status === "live" || a.status === "geplant" ? P.dstr(new Date(a.pubAt)) : "Score " + ch.score) + "</span></div></a>";
        }).join("") : '<p class="col__empty">' + { entwurf: "Starten Sie mit einem Vorschlag oben.", pruefung: "Nichts zu prüfen.", geplant: "Nichts geplant.", live: "Noch nichts veröffentlicht." }[c[0]] + "</p>") + "</div>";
      }).join("") + '</div><p class="hint" style="margin-top:12px"><a href="/ratgeber" target="_blank" rel="noopener">Ratgeber auf der Website ansehen</a> · Demo: Veröffentlichte Beiträge erscheinen dort in diesem Browser.</p>';
  };
  V.beitraege.after = function () {
    $$("[data-start]").forEach(function (b) { b.onclick = function () { startFrom(topic(b.dataset.start)); }; });
    $$("[data-hide]").forEach(function (b) { b.onclick = function () { var h = store.get("sugg_hidden", []); h.push(b.dataset.hide); store.set("sugg_hidden", h); P.rerender(); P.toast("Vorschlag ausgeblendet", function () { store.set("sugg_hidden", h.filter(function (x) { return x !== b.dataset.hide; })); P.rerender(); }); }; });
    var u = $("#unhide"); if (u) u.onclick = function () { store.del("sugg_hidden"); P.rerender(); };
    function apSave() { var ap = { on: $("#apOn").checked, perMonth: +$("#apN").value, autoDraft: $("#apDraft").checked, autoPublish: $("#apPub").checked }; store.set("autopilot", ap); $(".ap").classList.toggle("off", !ap.on); P.toast(ap.on ? "KI-Redaktion gespeichert" : "KI-Redaktion pausiert"); }
    ["#apOn", "#apDraft", "#apPub", "#apN"].forEach(function (s) { $(s).onchange = apSave; });
  };

  // ------------------------------------------------------------ Studio (geführter Ablauf)
  var STEPS = ["Thema", "Briefing", "Entwurf", "Prüfung", "Vorschau", "Veröffentlichen"];
  P.TITLES.studio = [function (id) { var a = art(id); return a ? a.title.split(":")[0] : "Beitrag"; }, function (id) { var a = art(id); return a ? "Schritt " + a.step + " von 6 · " + STEPS[a.step - 1] + " · " + P.ARTICLE_STATUS[a.status][0] : ""; }];
  P.TITLES.studio.nav = "beitraege";
  V.studio = function (id) {
    var a = art(id);
    if (!a) return P.empty("Beitrag nicht gefunden", "Vielleicht wurde er in einem anderen Browser angelegt.", '<a class="btn btn--sm" href="#beitraege">Zur Übersicht</a>');
    var stepper = '<ol class="stepper">' + STEPS.map(function (s, i) { var n = i + 1; return '<li class="' + (n === a.step ? "on" : n <= a.maxStep ? "done" : "") + '"><button ' + (n <= a.maxStep ? 'data-step="' + n + '"' : "disabled") + "><span>" + (n < a.maxStep && n !== a.step ? "✓" : n) + "</span>" + s + "</button></li>"; }).join("") + "</ol>";
    var body = [s1, s2, s3, s4, s5, s6][a.step - 1](a);
    return '<div class="studio">' + stepper + body + "</div>";
  };
  function foot(a, nextLabel, nextDisabled, hint) {
    return '<div class="studio__foot"><a class="btn btn--ghost" href="#beitraege">' + icon("back") + ' Übersicht</a><span class="saved">' + icon("check") + " automatisch gespeichert</span><span style=\"flex:1\"></span>" + (hint ? '<span class="studio__hint">' + hint + "</span>" : "") +
      (a.step > 1 ? '<button class="btn btn--ghost" id="prevStep">Zurück</button>' : "") + (nextLabel ? '<button class="btn btn--lime" id="nextStep"' + (nextDisabled ? " disabled" : "") + ">" + nextLabel + " " + icon("next") + "</button>" : "") + "</div>";
  }
  // 1 Thema
  function s1(a) {
    var t = topic(a.topic), why = a.why || (P.suggestions().concat([]).filter(function (s) { return s.t.id === a.topic; })[0] || { why: [] }).why.map(function (w) { return w[1]; });
    return '<div class="grid g-21"><div class="card"><h3>Worum geht es?</h3><p class="hint">Titel und Suchbegriff kann die KI später anpassen. Sie können beides hier ändern.</p>' +
      '<label class="fld"><span>Überschrift</span><input id="aTitle" value="' + esc(a.title) + '"></label><label class="fld"><span>Hauptsuchbegriff</span><input id="aKw" value="' + esc(a.kw) + '"></label>' +
      '<div class="fld2"><label class="fld"><span>Für wen?</span><select id="aTone"><option value="sie"' + (a.tone === "sie" ? " selected" : "") + '>Betroffene</option><option value="ang"' + (a.tone === "ang" ? " selected" : "") + '>Angehörige</option></select></label><label class="fld"><span>Ortsbezug</span><select id="aTown"><option value="">ganzes Einsatzgebiet</option>' + P.TOWNS.map(function (x) { return "<option" + (a.town === x ? " selected" : "") + ">" + x + "</option>"; }).join("") + "</select></label></div></div>" +
      '<div class="card fill"><h3>Warum dieses Thema?</h3><p class="hint">Daten hinter dem Vorschlag</p><div class="stats"><div><b>' + t.vol + "</b><span>Suchen pro Monat</span></div><div><b>" + (t.rank ? "Platz " + t.rank : "–") + "</b><span>aktuelle Position</span></div></div>" +
      (why.length ? '<ul class="sugg__why" style="margin-top:14px">' + why.map(function (w) { return "<li>" + icon("spark") + esc(w) + "</li>"; }).join("") + "</ul>" : "") + '<p class="hint" style="margin:14px 0 0">Suchabsicht: ' + esc(t.intent) + "</p></div></div>" + foot(a, "Weiter zum Briefing");
  }
  // 2 Briefing
  function s2(a) {
    var t = topic(a.topic), linkOpts = SERVICES.concat(a.town ? [[P.TOWN_SLUG(a.town), "Ortsseite " + a.town]] : []).concat([["/", "Startseite"]]);
    return '<div class="grid g-21"><div class="card"><h3>Gliederung</h3><p class="hint">Die KI schreibt zu jeder Zwischenüberschrift einen Abschnitt. Reihenfolge ändern, löschen oder eigene ergänzen.</p><ol class="outline" id="outline">' +
      a.outline.map(function (h, i) { return '<li><input value="' + esc(h) + '" data-o="' + i + '"><button class="x" data-up="' + i + '" title="Nach oben"' + (i ? "" : " disabled") + '>↑</button><button class="x" data-rm="' + i + '" title="Entfernen">✕</button></li>'; }).join("") +
      '</ol><button class="btn btn--sm btn--ghost" id="addH">+ Abschnitt</button>' +
      '<h4 class="sub-h">Länge</h4><div class="seg" id="aLen">' + [["kurz", "Kurz (≈250 Wörter)"], ["normal", "Normal (≈400)"], ["lang", "Ausführlich mit Checkliste"]].map(function (x) { return '<button data-len="' + x[0] + '" class="' + (a.len === x[0] ? "on" : "") + '">' + x[1] + "</button>"; }).join("") + "</div></div>" +
      '<div class="stack"><div class="card"><h3>Interne Links</h3><p class="hint">Verweise auf Ihre Seiten stärken die Leistungsseiten bei Google</p><div class="chklist">' +
      linkOpts.map(function (l) { return '<label class="chk"><input type="checkbox" data-link="' + l[0] + '"' + (a.links.indexOf(l[0]) >= 0 ? " checked" : "") + "> " + esc(l[1]) + "</label>"; }).join("") + "</div></div>" +
      '<div class="card fill"><h3>Verwandte Suchbegriffe</h3><p class="hint">die KI baut sie natürlich in den Text ein</p><div class="kw-chips">' + t.also.map(function (k) { return "<button disabled>" + esc(k) + "</button>"; }).join("") + "</div></div></div></div>" + foot(a, icon("spark") + " Entwurf mit KI schreiben");
  }
  // 3 Entwurf
  function s3(a) {
    return '<div class="grid g-21"><div class="card fill"><div class="card__head"><div><h3>Entwurf</h3><p class="hint">direkt im Text bearbeiten, Änderungen werden gespeichert</p></div><button class="btn btn--sm btn--ghost" id="regen">' + icon("spark") + ' Neu schreiben</button></div>' +
      '<div id="genBox"></div><div class="article" id="aHtml" contenteditable="true">' + a.html + "</div></div>" +
      '<div class="stack"><div class="card"><h3>Für Google</h3><p class="hint">Titel und Beschreibung im Suchergebnis</p><label class="fld"><span>Seitentitel</span><input id="mT" value="' + esc(a.metaTitle) + '"></label><div class="counter" id="mTc"></div><label class="fld"><span>Beschreibung</span><textarea id="mD" rows="4">' + esc(a.metaDesc) + '</textarea></label><div class="counter" id="mDc"></div></div>' +
      '<div class="card fill"><h3>Bild</h3><p class="hint">aus Ihren Website-Fotos</p><div class="imgpick">' + ["geriatrie-aufstehen", "geriatrie-gangtraining", "geriatrie", "hero-hausbesuch", "leistung-krankengymnastik", "leistung-gangschule", "leistung-lymphdrainage", "leistung-alltagstraining"].map(function (im) { return '<button data-img="' + im + '" class="' + (a.img === im ? "on" : "") + '"><img src="/assets/img/' + im + '-800.webp" alt="" loading="lazy"></button>'; }).join("") + "</div></div></div></div>" + foot(a, "Weiter zur Prüfung");
  }
  // 4 Prüfung
  function s4(a) {
    var ch = runChecks(a);
    function li(x, i, kind) {
      var fixable = kind === "legal" ? '<button class="btn btn--sm btn--ghost" data-fix="' + i + '" title="' + (x.rule.fix === "" ? "Wort aus dem Text entfernen" : "ersetzen durch: " + (typeof x.rule.fix === "function" ? "kann …" : x.rule.fix)) + '">' + (x.rule.fix === "" ? "Streichen" : "Ersetzen") + "</button>" : "";
      return '<li class="' + x.sev + '"><span class="st">' + (x.sev === "ok" ? "✓" : x.sev === "e" ? "!" : "i") + "</span><div>" + esc(x.txt) + "<small>" + esc(x.why) + "</small></div>" + fixable + "</li>";
    }
    return '<div class="grid g-21"><div class="stack"><div class="card"><h3>Rechtlich (Heilmittelwerbegesetz)</h3><p class="hint">keine Heilversprechen, keine Angst, keine Garantien</p><ul class="checks">' + (ch.legal.length ? ch.legal.map(function (x, i) { return li(x, i, "legal"); }).join("") : '<li class="ok"><span class="st">✓</span><div>Keine kritischen Formulierungen gefunden<small>Trotzdem bitte inhaltlich gegenlesen.</small></div></li>') + "</ul></div>" +
      '<div class="card"><h3>Auffindbarkeit (SEO)</h3><ul class="checks">' + ch.seo.map(function (x) { return li(x); }).join("") + "</ul></div>" +
      '<div class="card fill"><h3>Lesbarkeit</h3><ul class="checks">' + ch.read.map(function (x) { return li(x); }).join("") + "</ul></div></div>" +
      '<div class="stack"><div class="card"><h3>Qualität</h3><div class="score"><div class="ring" style="--p:' + ch.score + ";--ring:" + (ch.score >= 85 ? "#2f8f4e" : ch.score >= 65 ? "#d69426" : "#c2410c") + '"><b>' + ch.score + "<small>/100</small></b></div><div><p style=\"margin:0;color:var(--ink-soft)\">" + (ch.legalErrs ? "Bitte die rot markierten Formulierungen ändern." : ch.score >= 85 ? "Sehr gut, bereit für die Freigabe." : "Gut, ein paar Punkte lassen sich verbessern.") + "</p></div></div></div>" +
      '<div class="card fill review"><h3>Fachliche Freigabe</h3><p class="hint">Pflicht vor dem Veröffentlichen. Der Name erscheint als „fachlich geprüft von“ unter dem Beitrag.</p><label class="fld"><span>Geprüft von</span><select id="rev"><option value="">bitte wählen</option>' + P.TEAM.map(function (t) { return '<option value="' + t.id + '"' + (a.reviewer === t.id ? " selected" : "") + ">" + t.name + "</option>"; }).join("") + '</select></label><label class="chk"><input type="checkbox" id="revOk"' + (a.reviewed ? " checked" : "") + "> Ich habe den Text fachlich geprüft. Er enthält keine Heilversprechen und ist für Laien verständlich.</label></div></div></div>" +
      foot(a, "Weiter zur Vorschau", ch.legalErrs > 0 || !a.reviewed, ch.legalErrs ? "Erst rechtliche Hinweise beheben" : !a.reviewed ? "Fachliche Freigabe fehlt" : "");
  }
  // 5 Vorschau
  function s5(a) {
    var dev = V.studio.dev || "desktop", url = "/ratgeber/beitrag?id=" + a.id + "&vorschau=1";
    return '<div class="grid g-21"><div class="card fill"><div class="card__head"><div><h3>So sieht der Beitrag auf Ihrer Website aus</h3><p class="hint">echte Seite im Design der Website</p></div><div class="seg">' +
      '<button data-dev="desktop" class="' + (dev === "desktop" ? "on" : "") + '">' + icon("desktop") + ' Computer</button><button data-dev="mobile" class="' + (dev === "mobile" ? "on" : "") + '">' + icon("mobile") + " Smartphone</button></div></div>" +
      '<div class="frame frame--' + dev + '"><iframe src="' + url + '" title="Vorschau des Beitrags" loading="lazy"></iframe></div><p class="hint" style="margin:10px 0 0"><a href="' + url + '" target="_blank" rel="noopener">In neuem Tab öffnen</a></p></div>' +
      '<div class="stack"><div class="card"><h3>Bei Google</h3><div class="serp"><div class="u"><i></i><span>Mobile Physiotherapie Oehlke<small>physiotherapie-oehlke.de › ratgeber</small></span></div><div class="t">' + esc(a.metaTitle.length > 60 ? a.metaTitle.slice(0, 58) + " …" : a.metaTitle) + '</div><div class="d">' + esc(a.metaDesc) + "</div></div></div>" +
      '<div class="card fill"><h3>Beitrag im Google-Profil</h3><p class="hint">passender Kurztext für Ihr Google-Unternehmensprofil</p><textarea id="gbp" rows="6" class="modal__text">' + esc(gbpText(a)) + '</textarea><button class="btn btn--sm btn--ghost" id="gbpCopy" style="margin-top:8px">' + icon("copy") + " Kopieren</button></div></div></div>" + foot(a, "Weiter zum Veröffentlichen");
  }
  function gbpText(a) { return a.title.split(":")[0] + "\n\n" + textOf(a.html).split(". ").slice(0, 2).join(". ") + ".\n\nMehr dazu in unserem Ratgeber. Wir kommen zu Ihnen nach Hause, Termin unter 0176 43630803."; }
  // 6 Veröffentlichen
  function s6(a) {
    var ch = runChecks(a), ap = autopilot();
    if (a.status === "live" || a.status === "geplant") {
      var d = new Date(a.pubAt);
      return '<div class="card done-card"><div class="done-card__ico">' + icon(a.status === "live" ? "globe" : "cal") + "</div><h2>" + (a.status === "live" ? "Der Beitrag ist online" : "Der Beitrag ist eingeplant") + "</h2><p>" + (a.status === "live" ? "Veröffentlicht am " + P.dlong(d) + "." : "Er geht am " + P.dlong(d) + " um " + d.toLocaleTimeString("de-DE", { hour: "2-digit", minute: "2-digit" }) + " Uhr automatisch online" + (ap.autoPublish ? "." : ", sobald die KI-Redaktion aktiv ist.")) + "</p>" +
        '<div class="btns-h" style="justify-content:center"><a class="btn btn--lime" href="/ratgeber/beitrag?id=' + a.id + '" target="_blank" rel="noopener">' + icon("eye") + ' Auf der Website ansehen</a><a class="btn btn--ghost" href="#beitraege">Zur Übersicht</a><button class="btn btn--ghost" id="unpub">' + (a.status === "live" ? "Zurückziehen" : "Planung aufheben") + '</button></div><p class="hint" style="margin-top:16px">Demo: Der Beitrag erscheint in diesem Browser unter /ratgeber. Für die echte Veröffentlichung wird der Knopf mit der Website verbunden.</p></div>';
    }
    var slot = nextSlot();
    return '<div class="grid g-21"><div class="card"><h3>Wann soll der Beitrag online gehen?</h3><div class="pubopts"><label class="opt"><input type="radio" name="when" value="now"> <span><b>Jetzt veröffentlichen</b><small>erscheint sofort im Ratgeber auf Ihrer Website</small></span></label>' +
      '<label class="opt"><input type="radio" name="when" value="plan" checked> <span><b>Einplanen</b><small>empfohlen: Dienstag 8:00 Uhr, regelmäßige Abstände wirken besser als viele Beiträge auf einmal</small><input type="datetime-local" id="pubAt" value="' + isoLocal(slot) + '"></span></label></div>' +
      '<label class="chk" style="margin-top:14px"><input type="checkbox" id="gbpTask" checked> Aufgabe anlegen: Beitrag im Google-Profil teilen</label></div>' +
      '<div class="card fill"><h3>Zusammenfassung</h3><ul class="checks"><li class="' + (ch.legalErrs ? "e" : "ok") + '"><span class="st">' + (ch.legalErrs ? "!" : "✓") + "</span><div>Rechtlich geprüft<small>Heilmittelwerbegesetz</small></div></li>" +
      '<li class="' + (a.reviewed ? "ok" : "e") + '"><span class="st">' + (a.reviewed ? "✓" : "!") + "</span><div>Fachlich freigegeben<small>" + (a.reviewer ? P.person(a.reviewer).name : "–") + "</small></div></li>" +
      '<li class="' + (ch.score >= 75 ? "ok" : "w") + '"><span class="st">' + (ch.score >= 75 ? "✓" : "i") + "</span><div>Qualität " + ch.score + "/100<small>" + P.fmt(ch.words) + " Wörter</small></div></li></ul></div></div>" +
      foot(a, "", false) .replace('<span style="flex:1"></span>', '<span style="flex:1"></span><button class="btn btn--lime" id="publish"' + (ch.legalErrs || !a.reviewed ? " disabled" : "") + ">" + icon("globe") + " Bestätigen</button>");
  }

  V.studio.after = function (id) {
    var a = art(id); if (!a) return;
    function save(re) { putArt(a); if (re) P.rerender(); }
    function go(n) { a.step = n; a.maxStep = Math.max(a.maxStep, n); save(true); window.scrollTo(0, 0); }
    $$("[data-step]").forEach(function (b) { b.onclick = function () { go(+b.dataset.step); }; });
    var prev = $("#prevStep"); if (prev) prev.onclick = function () { go(a.step - 1); };
    var next = $("#nextStep");
    if (a.step === 1) {
      ["#aTitle", "#aKw"].forEach(function (s) { $(s).oninput = function () { a.title = $("#aTitle").value; a.kw = $("#aKw").value; save(); }; });
      $("#aTone").onchange = function () { a.tone = this.value; a.html = ""; save(); };
      $("#aTown").onchange = function () { a.town = this.value; var sl = P.TOWN_SLUG(a.town); if (a.town && a.links.indexOf(sl) < 0) a.links.push(sl); a.html = ""; save(); };
      next.onclick = function () { go(2); };
    }
    if (a.step === 2) {
      $$("[data-o]").forEach(function (i) { i.oninput = function () { a.outline[+i.dataset.o] = i.value; a.html = ""; save(); }; });
      $$("[data-up]").forEach(function (b) { b.onclick = function () { var i = +b.dataset.up, x = a.outline.splice(i, 1)[0]; a.outline.splice(i - 1, 0, x); a.html = ""; save(true); }; });
      $$("[data-rm]").forEach(function (b) { b.onclick = function () { var i = +b.dataset.rm, x = a.outline.splice(i, 1)[0]; a.html = ""; save(true); P.toast("Abschnitt entfernt", function () { a.outline.splice(i, 0, x); save(true); }); }; });
      $("#addH").onclick = function () { a.outline.splice(a.outline.length - (a.outline[a.outline.length - 1] === "Häufige Fragen" ? 1 : 0), 0, "Neuer Abschnitt"); a.html = ""; save(true); };
      $$("[data-len]").forEach(function (b) { b.onclick = function () { a.len = b.dataset.len; a.html = ""; save(true); }; });
      $$("[data-link]").forEach(function (c) { c.onchange = function () { var l = c.dataset.link; a.links = c.checked ? a.links.concat([l]) : a.links.filter(function (x) { return x !== l; }); a.html = ""; save(); }; });
      next.onclick = function () { a.html = ""; go(3); };
    }
    if (a.step === 3) {
      var box = $("#genBox"), ed = $("#aHtml");
      function counters() { var t = $("#mT").value.length, d = $("#mD").value.length; $("#mTc").textContent = t + " / 65 Zeichen"; $("#mTc").className = "counter" + (t > 65 || t < 30 ? " bad" : ""); $("#mDc").textContent = d + " / 160 Zeichen"; $("#mDc").className = "counter" + (d > 160 || d < 110 ? " bad" : ""); }
      function runGen() {
        ed.style.display = "none"; next.disabled = true;
        var steps = ["Suchabsicht und Fragen der Leser analysiert", "Gliederung übernommen", "Abschnitte geschrieben", "Interne Links gesetzt", "Titel und Beschreibung für Google erstellt"];
        box.innerHTML = '<div class="gen"><div class="gen__spark">' + icon("spark") + '</div><b>KI schreibt Ihren Entwurf …</b><ul>' + steps.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ul></div>";
        var lis = $$(".gen li", box);
        lis.forEach(function (li, i) { setTimeout(function () { li.classList.add("on"); }, 260 * (i + 1)); });
        setTimeout(function () { generate(a); a.reviewed = false; save(); box.innerHTML = ""; ed.innerHTML = a.html; ed.style.display = ""; $("#mT").value = a.metaTitle; $("#mD").value = a.metaDesc; counters(); next.disabled = false; P.toast("Entwurf fertig, bitte lesen und anpassen"); }, 260 * (steps.length + 1) + 150);
      }
      if (!a.html) runGen();
      $("#regen").onclick = function () { a.variant++; runGen(); };
      var tmr; ed.oninput = function () { clearTimeout(tmr); tmr = setTimeout(function () { a.html = ed.innerHTML; a.reviewed = false; save(); }, 400); };
      $("#mT").oninput = $("#mD").oninput = function () { a.metaTitle = $("#mT").value; a.metaDesc = $("#mD").value; counters(); save(); };
      $$("[data-img]").forEach(function (b) { b.onclick = function () { a.img = b.dataset.img; $$("[data-img]").forEach(function (x) { x.classList.toggle("on", x === b); }); save(); }; });
      counters();
      next.onclick = function () { a.html = ed.innerHTML; if (a.status === "entwurf") a.status = "pruefung"; go(4); };
    }
    if (a.step === 4) {
      var ch = runChecks(a);
      $$("[data-fix]").forEach(function (b) {
        b.onclick = function () {
          var x = ch.legal[+b.dataset.fix], before = a.html;
          a.html = a.html.replace(x.rule.re, function (m) { return typeof x.rule.fix === "function" ? x.rule.fix(m) : x.rule.fix; }).replace(/ {2,}/g, " ").replace(/ ([.,!?])/g, "$1");
          a.reviewed = false; save(true); P.toast("Formulierung ersetzt", function () { a.html = before; save(true); });
        };
      });
      $("#rev").onchange = function () { a.reviewer = this.value; if (!a.reviewer) a.reviewed = false; save(true); };
      $("#revOk").onchange = function () { if (this.checked && !a.reviewer) { this.checked = false; P.toast("Bitte zuerst auswählen, wer geprüft hat"); return; } a.reviewed = this.checked; save(true); };
      if (next) next.onclick = function () { go(5); };
    }
    if (a.step === 5) {
      $$("[data-dev]").forEach(function (b) { b.onclick = function () { V.studio.dev = b.dataset.dev; P.rerender(); }; });
      var fr = $(".frame"), ifr = $(".frame iframe");
      function fit() { if (!fr.isConnected) return; if (!fr.classList.contains("frame--desktop")) { ifr.style.cssText = ""; return; } var w = fr.clientWidth - 28, k = Math.min(1, w / 1280), h = fr.clientHeight - 28; ifr.style.width = "1280px"; ifr.style.height = Math.round(h / k) + "px"; ifr.style.transform = "scale(" + k + ")"; ifr.style.transformOrigin = "0 0"; ifr.parentNode.style.height = ""; }
      fit(); if (window.ResizeObserver) new ResizeObserver(fit).observe(fr);
      $("#gbpCopy").onclick = function () { navigator.clipboard.writeText($("#gbp").value).then(function () { P.toast("Text kopiert"); }); };
      next.onclick = function () { go(6); };
    }
    if (a.step === 6) {
      var pub = $("#publish");
      if (pub) pub.onclick = function () {
        var when = $('input[name="when"]:checked').value;
        a.pubAt = when === "now" ? new Date().toISOString() : new Date($("#pubAt").value).toISOString();
        a.status = when === "now" || new Date(a.pubAt) <= new Date() ? "live" : "geplant";
        if ($("#gbpTask").checked) { var T = store.get("tasks", null); if (T) { T.todo.push({ t: "Google-Profil: Beitrag „" + a.title.split(":")[0] + "“ teilen", who: "ro" }); store.set("tasks", T); } }
        save(true); P.toast(a.status === "live" ? "Veröffentlicht" : "Eingeplant für " + P.dlong(new Date(a.pubAt)));
      };
      var un = $("#unpub"); if (un) un.onclick = function () { var old = { s: a.status, p: a.pubAt }; a.status = "pruefung"; a.pubAt = null; save(true); P.toast("Beitrag zurückgezogen", function () { a.status = old.s; a.pubAt = old.p; save(true); }); };
    }
  };

  // ------------------------------------------------------------ Rankings
  function rankTable(rows, compact) {
    return '<div class="tbl-wrap"><table class="tbl"><thead><tr><th>Suchbegriff</th><th class="num">Pos.</th><th class="num">Trend</th>' + (compact ? "" : '<th class="num">Suchen/Monat</th><th>Seite</th>') + "</tr></thead><tbody>" +
      rows.map(function (k) {
        var cls = k[1] <= 3 ? "top3" : k[1] <= 10 ? "top10" : "far", d = k[2] - k[1];
        var chg = d > 0 ? '<span class="chg up">▲ ' + d + "</span>" : d < 0 ? '<span class="chg down">▼ ' + (-d) + "</span>" : '<span class="chg eq">–</span>';
        return "<tr><td>" + esc(k[0]) + '</td><td class="num"><span class="pos ' + cls + '">' + k[1] + '</span></td><td class="num">' + chg + "</td>" + (compact ? "" : '<td class="num">' + k[3] + '</td><td><a href="' + k[4] + '" target="_blank" rel="noopener">' + k[4] + "</a></td>") + "</tr>";
      }).join("") + "</tbody></table></div>";
  }
  P.TITLES.rankings = ["Rankings", "Wo Sie bei Google gefunden werden, und wo noch nicht"];
  V.rankings = function () {
    var f = V.rankings.f || "alle";
    var rows = KEYWORDS.filter(function (k) { return f === "alle" || (f === "top3" && k[1] <= 3) || (f === "top10" && k[1] > 3 && k[1] <= 10) || (f === "weiter" && k[1] > 10); }).sort(function (a, b) { return a[1] - b[1]; });
    var c3 = KEYWORDS.filter(function (k) { return k[1] <= 3; }).length, c10 = KEYWORDS.filter(function (k) { return k[1] <= 10; }).length;
    var avg = (KEYWORDS.reduce(function (s, k) { return s + k[1]; }, 0) / KEYWORDS.length).toFixed(1).replace(".", ",");
    var dist = [["Platz 1–3", c3], ["Platz 4–10", c10 - c3], ["Platz 11–20", KEYWORDS.filter(function (k) { return k[1] > 10 && k[1] <= 20; }).length], ["ab Platz 21", KEYWORDS.filter(function (k) { return k[1] > 20; }).length]];
    var chances = KEYWORDS.filter(function (k) { return k[1] > 3 && k[1] <= 25; }).sort(function (a, b) { return b[3] - a[3]; }).slice(0, 4);
    return '<div class="grid g4">' + P.kpi("Top 3", c3, "von " + KEYWORDS.length + " Suchbegriffen", "star") + P.kpi("Seite 1 (Top 10)", c10, "Ziel: alle Ortsseiten", "trend") + P.kpi("Ø Position", avg, '<b class="up">▲ 1,8</b> zum Vormonat', "chart") + P.kpi("Sichtbarkeit", "34<small> %</small>", "Anteil möglicher Klicks", "eye") + "</div>" +
      '<div class="grid g2" style="margin-top:18px"><div class="card"><h3>Größte Chancen</h3><p class="hint">knapp unter den Top 3, viele Suchen: Hier lohnt ein Beitrag</p><ul class="list">' +
      chances.map(function (k) { var t = TOPICS.filter(function (x) { return x.kw === k[0]; })[0]; return '<li><span class="pos ' + (k[1] <= 10 ? "top10" : "far") + '">' + k[1] + '</span><div class="t">' + esc(k[0]) + "<small>" + k[3] + " Suchen/Monat</small></div>" + (t ? '<button class="btn btn--ghost btn--sm" data-start="' + t.id + '">' + icon("spark") + " Beitrag</button>" : '<a class="btn btn--ghost btn--sm" href="#beitraege">Ideen</a>') + "</li>"; }).join("") + "</ul></div>" +
      '<div class="card fill"><h3>Verteilung der Positionen</h3><p class="hint">Wie viele Suchbegriffe auf welcher Position stehen</p>' + P.hbars(dist, "") + '<p class="hint" style="margin:auto 0 0;padding-top:16px">Beispieldaten. Echte Positionen kommen nach Anbindung aus der Google Search Console.</p></div></div>' +
      '<div class="card" style="margin-top:18px"><div class="card__head"><div><h3>Alle Suchbegriffe</h3><p class="hint">Position, Trend, Suchvolumen und passende Seite</p></div><div class="seg">' + [["alle", "Alle"], ["top3", "Top 3"], ["top10", "Plätze 4–10"], ["weiter", "Ab Platz 11"]].map(function (b) { return '<button data-rf="' + b[0] + '" class="' + (f === b[0] ? "on" : "") + '">' + b[1] + "</button>"; }).join("") + "</div></div>" + rankTable(rows) + "</div>";
  };
  V.rankings.after = function () {
    $$("[data-rf]").forEach(function (b) { b.onclick = function () { V.rankings.f = b.dataset.rf; P.rerender(); }; });
    $$("[data-start]").forEach(function (b) { b.onclick = function () { startFrom(topic(b.dataset.start)); }; });
  };

  // ------------------------------------------------------------ Besucher
  P.TITLES.besucher = ["Besucher", "Wer auf die Website kommt und woher"];
  V.besucher = function () {
    var range = V.besucher.r || 30, data = P.visits(range), sum = data.reduce(function (s, d) { return s + d.v; }, 0);
    return '<div class="toolbar"><div class="seg">' + [7, 30, 90].map(function (r) { return '<button data-r="' + r + '" class="' + (r === range ? "on" : "") + '">' + r + " Tage</button>"; }).join("") + '</div></div><div class="grid g4">' +
      P.kpi("Besucher", P.fmt(sum), '<b class="up">+18 %</b> zum Vorzeitraum', "eye") + P.kpi("Anfragen über Website", Math.round(sum * 0.021), "Formular, Telefon-Klick, WhatsApp", "inbox") + P.kpi("Conversion", "2,1<small> %</small>", "Besucher → Anfrage", "gauge") + P.kpi("Ø Verweildauer", "1:58", "Minuten pro Besuch", "cal") +
      '</div><div class="card" style="margin-top:18px"><h3>Besucher pro Tag</h3><p class="hint">mit der Maus über die Linie fahren für Einzelwerte</p><div id="vChart"></div></div><div class="grid g2" style="margin-top:18px"><div class="card"><h3>Woher kommen die Besucher?</h3><p class="hint">Anteil in Prozent</p>' + P.hbars(SOURCES, " %") + '<h4 class="sub-h">Geräte</h4>' + P.hbars(DEVICES, " %") +
      '</div><div class="card"><h3>Beliebteste Seiten</h3><p class="hint">Aufrufe und Verweildauer</p><div class="tbl-wrap"><table class="tbl"><thead><tr><th>Seite</th><th class="num">Aufrufe</th><th class="num">Dauer</th></tr></thead><tbody>' + PAGES.map(function (p) { return '<tr><td><a href="' + p[0] + '" target="_blank" rel="noopener">' + p[0] + '</a></td><td class="num">' + P.fmt(p[1]) + '</td><td class="num">' + p[2] + "</td></tr>"; }).join("") + '</tbody></table></div></div></div><p class="hint" style="margin-top:12px">Beispieldaten. Für echte Zahlen lässt sich eine datenschutzfreundliche Statistik ohne Cookie-Banner anbinden (z. B. Vercel Web Analytics oder Plausible).</p>';
  };
  V.besucher.after = function () {
    P.lineChart($("#vChart"), P.visits(V.besucher.r || 30), { label: "Besucher pro Tag", unit: "Besucher" });
    $$("[data-r]").forEach(function (b) { b.onclick = function () { V.besucher.r = +b.dataset.r; P.rerender(); }; });
  };

  // ------------------------------------------------------------ SEO-Analyse (echte Seiten)
  var SEO_PAGES = ["/", "/geriatrische-physiotherapie-hausbesuch", "/krankengymnastik-hausbesuch", "/gangschule-hausbesuch", "/lymphdrainage-hausbesuch", "/manuelle-therapie-hausbesuch", "/physiotherapie-hockenheim", "/physiotherapie-schwetzingen", "/physiotherapie-heidelberg", "/karriere"];
  P.TITLES.analyse = ["SEO-Analyse", "Wo die Website technisch steht, geprüft an den echten Seiten"];
  V.analyse = function () {
    return '<div class="grid g-12"><div class="stack"><div class="card"><h3>SEO-Score</h3><p class="hint">Prüfung der echten Seiten dieser Website</p><div class="score"><div class="ring" id="ring" style="--p:0"><b id="scoreV">–</b></div><div><p style="margin:0 0 10px;color:var(--ink-soft)" id="scoreTxt">Analyse läuft …</p><button class="btn btn--sm" id="reRun">' + icon("spark") + ' Neu prüfen</button></div></div></div>' +
      '<div class="card fill"><h3>Auf einen Blick</h3><p class="hint">Durchschnitt über alle geprüften Seiten</p><div class="stats" id="sumStats"><p class="empty">wird geprüft …</p></div></div></div>' +
      '<div class="card fill"><h3>Wichtigste Hinweise</h3><p class="hint">nach Wirkung sortiert</p><ul class="checks spread" id="sumChecks"><li class="empty">wird geprüft …</li></ul></div></div><div class="card" style="margin-top:18px"><h3>Seiten im Detail</h3><p class="hint">Titel, Beschreibung, Überschrift, Bilder, Textlänge, Verlinkung</p><div class="tbl-wrap"><table class="tbl" id="pageTbl"><thead><tr><th>Seite</th><th class="num">Score</th><th>Titel</th><th>Beschreibung</th><th class="num">H1</th><th class="num">Wörter</th><th class="num">Bilder ohne Alt</th><th>Indexierung</th></tr></thead><tbody><tr><td colspan="8" class="empty">wird geprüft …</td></tr></tbody></table></div></div>';
  };
  V.analyse.after = function () { runAnalysis(); $("#reRun").onclick = runAnalysis; };
  function analyse(path, html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var title = (doc.querySelector("title") || {}).textContent || "";
    var md = doc.querySelector('meta[name="description"]'), rb = doc.querySelector('meta[name="robots"]');
    var desc = md ? md.getAttribute("content") || "" : "", robots = rb ? rb.getAttribute("content") || "" : "";
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
      res = res.filter(Boolean); if (!$("#scoreTxt")) return;
      if (!res.length) { $("#scoreTxt").textContent = "Seiten konnten nicht geladen werden."; return; }
      var avg = Math.round(res.reduce(function (s, r) { return s + r.score; }, 0) / res.length);
      var ring = $("#ring"); ring.style.setProperty("--ring", avg >= 85 ? "#2f8f4e" : avg >= 65 ? "#d69426" : "#c2410c");
      requestAnimationFrame(function () { ring.style.setProperty("--p", avg); });
      $("#scoreV").innerHTML = avg + "<small>/100</small>";
      var noidx = res.filter(function (r) { return r.noindex; }).length;
      $("#scoreTxt").innerHTML = res.length + " Seiten geprüft. " + (avg >= 85 ? "Technisch sehr gut aufgestellt." : avg >= 65 ? "Solide, mit ein paar schnellen Verbesserungen." : "Hier ist Luft nach oben.") + (noidx ? '<br><span class="pill pill--warn" style="margin-top:8px">Vorschau-Modus: noindex aktiv</span>' : "");
      var n = res.length, sumOf = function (k) { return res.reduce(function (a, r) { return a + r[k]; }, 0); };
      $("#sumStats").innerHTML = [["Geprüfte Seiten", n], ["Ø Wörter pro Seite", P.fmt(Math.round(sumOf("words") / n))], ["Ø interne Links", Math.round(sumOf("links") / n)], ["Bilder ohne Alt-Text", sumOf("noAlt")], ["Seiten mit genau einer H1", res.filter(function (r) { return r.h1 === 1; }).length + " von " + n], ["Strukturierte Daten", res.filter(function (r) { return r.ld; }).length + " von " + n]].map(function (x) { return "<div><b>" + x[1] + "</b><span>" + x[0] + "</span></div>"; }).join("");
      var all = []; res.forEach(function (r) { all = all.concat(r.issues); });
      var grouped = {}; all.forEach(function (i) { var k = i.txt.replace(/\d+/g, "#"); (grouped[k] = grouped[k] || { sev: i.sev, txt: i.txt, pages: [] }).pages.push(i.path); });
      var list = Object.keys(grouped).map(function (k) { return grouped[k]; }).sort(function (a, b) { return (a.sev === "e" ? 0 : 1) - (b.sev === "e" ? 0 : 1) || b.pages.length - a.pages.length; });
      $("#sumChecks").innerHTML = list.slice(0, 7).map(function (g) {
        var txt = g.txt.indexOf("noindex") >= 0 ? "noindex aktiv, gewollt, solange die Seite eine Vorschau ist" : g.txt;
        return '<li class="' + (g.txt.indexOf("noindex") >= 0 ? "w" : g.sev) + '"><span class="st">' + (g.sev === "e" ? "!" : "i") + "</span><div>" + esc(txt) + "<small>" + g.pages.length + " Seite(n): " + esc(g.pages.slice(0, 3).join(", ")) + (g.pages.length > 3 ? " …" : "") + "</small></div></li>";
      }).join("") + '<li class="ok"><span class="st">✓</span><div>HTTPS, mobile Darstellung, schnelle Bilder (WebP), Ladezeit<small>auf allen Seiten erfüllt</small></div></li>';
      $("#pageTbl tbody").innerHTML = res.map(function (r) {
        var sc = r.score >= 85 ? "top3" : r.score >= 65 ? "top10" : "far", tl = r.title.length, dl = r.desc.length;
        return '<tr><td><a href="' + r.path + '" target="_blank" rel="noopener">' + r.path + '</a></td><td class="num"><span class="pos ' + sc + '">' + r.score + '</span></td><td><span class="pill ' + (tl >= 30 && tl <= 65 ? "pill--good" : "pill--warn") + '">' + tl + ' Z.</span></td><td><span class="pill ' + (dl >= 110 && dl <= 165 ? "pill--good" : dl ? "pill--warn" : "pill--bad") + '">' + dl + ' Z.</span></td><td class="num">' + r.h1 + '</td><td class="num">' + P.fmt(r.words) + '</td><td class="num">' + r.noAlt + "</td><td>" + (r.noindex ? '<span class="pill pill--warn">noindex</span>' : '<span class="pill pill--good">index</span>') + "</td></tr>";
      }).join("");
    });
  }

  // ------------------------------------------------------------ SEO-Werkzeuge
  P.TITLES.werkzeuge = ["SEO-Werkzeuge", "Google-Vorschau, Keyword-Ideen, Antworten auf Bewertungen, lokale Checkliste"];
  V.werkzeuge = function () {
    var services = ["physiotherapie hausbesuch", "krankengymnastik hausbesuch", "lymphdrainage hausbesuch", "gangschule", "mobile physiotherapie", "physiotherapie senioren"];
    var have = KEYWORDS.map(function (k) { return k[0]; }), ideas = [];
    services.forEach(function (s) { P.TOWNS.slice(0, 8).forEach(function (t) { var k = s + " " + t.toLowerCase(); if (have.indexOf(k) < 0) ideas.push(k); }); });
    return '<div class="grid g2"><div class="card"><h3>Google-Vorschau</h3><p class="hint">So erscheint eine Seite im Suchergebnis: Titel und Beschreibung testen</p><label class="fld"><span>Titel</span><input id="sT" value="Physiotherapie Hausbesuch Schwetzingen | Mobile Physiotherapie Oehlke"></label><div class="counter" id="sTc"></div><label class="fld"><span>Beschreibung</span><textarea id="sD" rows="3">Physiotherapie bei Ihnen zu Hause in Schwetzingen: 60 Minuten Zeit pro Termin, Schwerpunkt Geriatrie. Für Privatpatienten, Beihilfe und Selbstzahler.</textarea></label><div class="counter" id="sDc"></div><label class="fld"><span>Pfad</span><input id="sU" value="physiotherapie-schwetzingen"></label><div class="serp" id="serp"></div></div>' +
      '<div class="card fill"><h3>Keyword-Ideen</h3><p class="hint">Leistungen × Orte ohne eigene Seite. Ein Klick übernimmt den Begriff als neuen Beitrag.</p><input id="kwF" placeholder="filtern, z. B. walldorf" class="inp" style="margin-bottom:12px"><div class="fillbox" style="--min:260px"><div class="kw-chips" id="kwList">' + ideas.map(function (k) { return '<button data-k="' + esc(k) + '">' + esc(k) + "</button>"; }).join("") + "</div></div></div></div>" +
      '<div class="grid g2" style="margin-top:18px"><div class="card"><h3>Antwort auf eine Google-Bewertung</h3><p class="hint">Jede Bewertung zu beantworten, wirkt vertrauensvoll. Keine Gesundheitsdaten nennen.</p><label class="fld"><span>Bewertung (einfügen)</span><textarea id="rvIn" rows="3">Sehr einfühlsam und kompetent, meine Mutter freut sich jede Woche auf den Termin!</textarea></label><div class="seg" id="rvStars">' + [5, 4, 3, 2, 1].map(function (n) { return '<button data-st="' + n + '" class="' + (n === 5 ? "on" : "") + '">' + n + " ★</button>"; }).join("") + '</div><label class="fld" style="margin-top:12px"><span>Antwortvorschlag</span><textarea id="rvOut" rows="4"></textarea></label><button class="btn btn--sm btn--ghost" id="rvCopy">' + icon("copy") + " Kopieren</button></div>" +
      '<div class="card fill"><h3>Checkliste lokale Sichtbarkeit</h3><p class="hint">abhaken, was erledigt ist</p><ul class="checks" id="lc"></ul></div></div>';
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
    $$("#kwList button").forEach(function (b) {
      b.onclick = function () {
        var k = b.dataset.k, town = P.TOWNS.filter(function (t) { return k.indexOf(t.toLowerCase()) >= 0; })[0] || "";
        var base = /lymph/.test(k) ? "lymph" : /gang|senioren/.test(k) ? "sturz" : "kg", t = topic(base), a = newArticle(t, false);
        a.kw = k; a.town = town; if (town) a.links.push(P.TOWN_SLUG(town)); a.title = t.title.split(":")[0] + (town ? " in " + town : "") + ":" + (t.title.split(":")[1] || ""); putArt(a); location.hash = "studio/" + a.id;
      };
    });
    var stars = 5;
    function rv() {
      var txt = $("#rvIn").value.toLowerCase();
      var thanks = stars >= 4 ? "Vielen Dank für Ihre freundliche Bewertung!" : stars === 3 ? "Vielen Dank für Ihre ehrliche Rückmeldung." : "Danke, dass Sie sich die Zeit für Ihre Rückmeldung genommen haben. Es tut uns leid, dass Sie nicht zufrieden waren.";
      var mid = stars >= 4 ? (/mutter|vater|eltern|oma|opa/.test(txt) ? " Es freut uns sehr, dass die Termine Ihrer Familie guttun." : " Es freut uns sehr, dass Sie sich bei uns gut aufgehoben fühlen.") : stars === 3 ? " Wir nehmen Ihre Hinweise ernst und schauen, was wir besser machen können." : " Bitte rufen Sie uns unter 0176 43630803 an, damit wir in Ruhe darüber sprechen können.";
      $("#rvOut").value = thanks + mid + (stars >= 4 ? " Herzliche Grüße, Ramon Oehlke und Team" : " Viele Grüße, Ramon Oehlke");
    }
    $$("[data-st]").forEach(function (b) { b.onclick = function () { stars = +b.dataset.st; $$("[data-st]").forEach(function (x) { x.classList.toggle("on", x === b); }); rv(); }; });
    $("#rvIn").oninput = rv; rv();
    $("#rvCopy").onclick = function () { navigator.clipboard.writeText($("#rvOut").value).then(function () { P.toast("Antwort kopiert"); }); };
    var items = [["Google-Unternehmensprofil vollständig (Leistungen, Öffnungszeiten, Fotos)", "wichtigster Faktor für Google Maps"], ["Nach jeder abgeschlossenen Behandlungsserie um eine Bewertung bitten", "Link zum Bewerten unter „Heute“"], ["Auf jede Bewertung antworten", "Antwortvorschlag oben"], ["Name, Adresse, Telefon überall identisch", "Website, Google, Verzeichnisse"], ["Eintrag in Ärzte- und Gesundheitsverzeichnissen", "z. B. Physio-Verzeichnisse, Stadtportale"], ["Hausarztpraxen in der Umgebung verlinken auf die Website", "starke lokale Empfehlung"], ["Alle 2 Wochen ein Ratgeber-Beitrag", "Beiträge mit KI"], ["Ortsseiten mit eigenem Text für jeden Ort", "keine kopierten Texte"]];
    var done = store.get("localchecks", [0, 1]);
    $("#lc").innerHTML = items.map(function (it, i) { var on = done.indexOf(i) >= 0; return '<li class="' + (on ? "ok" : "w") + '" data-i="' + i + '" style="cursor:pointer"><span class="st">' + (on ? "✓" : "") + "</span><div>" + it[0] + "<small>" + it[1] + "</small></div></li>"; }).join("");
    $$("#lc li").forEach(function (li) { li.onclick = function () { var i = +li.dataset.i, k = done.indexOf(i); if (k >= 0) done.splice(k, 1); else done.push(i); store.set("localchecks", done); V.werkzeuge.after(); }; });
  };
})();

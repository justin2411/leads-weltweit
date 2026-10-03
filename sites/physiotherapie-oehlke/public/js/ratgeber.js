/* Ratgeber auf der Website: zeigt veröffentlichte Beiträge aus dem Praxis-Cockpit.
   Demo: Die Beiträge liegen im Browser (localStorage), in dem sie im Cockpit veröffentlicht wurden. */
(function () {
  "use strict";
  var TEAM = { ro: "Ramon Oehlke, Physiotherapeut und Inhaber", ls: "Lena Sommer, Physiotherapeutin", jk: "Jonas Keller, Physiotherapeut", mw: "Marie Wagner, Physiotherapeutin" };
  function esc(s) { return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]; }); }
  function list() { try { return JSON.parse(localStorage.getItem("po_articles") || "[]"); } catch (e) { return []; } }
  function isLive(a) { return a.status === "live" || (a.status === "geplant" && a.pubAt && new Date(a.pubAt) <= new Date()); }
  function date(a) { return a.pubAt ? new Date(a.pubAt).toLocaleDateString("de-DE", { day: "numeric", month: "long", year: "numeric" }) : ""; }
  function minutes(a) { var d = document.createElement("div"); d.innerHTML = a.html || ""; return Math.max(2, Math.round(d.textContent.split(/\s+/).length / 180)); }
  /* nur eigene, unbedenkliche Elemente aus dem Entwurf übernehmen */
  function clean(html) {
    var d = document.createElement("div"); d.innerHTML = html || "";
    d.querySelectorAll("script,style,iframe,object,embed,form,input,button").forEach(function (n) { n.remove(); });
    d.querySelectorAll("*").forEach(function (n) {
      Array.prototype.slice.call(n.attributes).forEach(function (at) {
        var k = at.name.toLowerCase();
        if (k.indexOf("on") === 0 || k === "style" || k === "contenteditable") n.removeAttribute(at.name);
        if (k === "href" && !/^(\/|tel:|mailto:|https:\/\/)/.test(at.value)) n.removeAttribute(at.name);
      });
    });
    return d.innerHTML;
  }

  var grid = document.getElementById("rgList");
  if (grid) {
    var live = list().filter(isLive).sort(function (a, b) { return new Date(b.pubAt) - new Date(a.pubAt); });
    grid.innerHTML = live.length ? live.map(function (a) {
      return '<a class="rg-card" href="/ratgeber/beitrag?id=' + encodeURIComponent(a.id) + '"><img src="/assets/img/' + esc(a.img || "hero-hausbesuch") + '-800.webp" alt="" loading="lazy"><div><span class="rg-meta">' + date(a) + " · " + minutes(a) + " Min. Lesezeit</span><h2>" + esc(a.title) + "</h2><p>" + esc(a.metaDesc) + "</p></div></a>";
    }).join("") : '<div class="rg-empty"><h2>Bald finden Sie hier unsere Ratgeber</h2><p>Wir schreiben gerade Beiträge rund um Physiotherapie zu Hause: Sturzprävention, Bewegung nach Operationen und Tipps für Angehörige.</p></div>';
  }

  var box = document.getElementById("rgArticle");
  if (box) {
    var q = new URLSearchParams(location.search), id = q.get("id"), preview = q.get("vorschau") === "1";
    var a = list().filter(function (x) { return String(x.id) === String(id); })[0];
    if (!a || (!preview && !isLive(a))) {
      box.innerHTML = "<p>Dieser Beitrag ist nicht (mehr) verfügbar.</p><p><a href=\"/ratgeber\">Zum Ratgeber</a></p>";
      return;
    }
    document.title = (a.metaTitle || a.title) + "";
    var md = document.querySelector('meta[name="description"]'); if (md) md.setAttribute("content", a.metaDesc || "");
    var h1 = document.querySelector(".phero h1"); if (h1) h1.textContent = a.title;
    var cr = document.querySelector('.crumbs [aria-current="page"]'); if (cr) cr.textContent = a.title.split(":")[0];
    var sub = document.getElementById("rgSub"); if (sub) sub.textContent = (date(a) || "Entwurf") + " · " + minutes(a) + " Min. Lesezeit";
    var img = document.querySelector(".phero__img img"); if (img && a.img) img.src = "/assets/img/" + a.img + ".webp";
    if (preview && !isLive(a)) document.getElementById("rgBanner").innerHTML = '<div class="rg-banner">Vorschau aus dem Praxis-Cockpit. Dieser Beitrag ist noch nicht veröffentlicht.</div>';
    box.innerHTML = clean(a.html);
    var who = TEAM[a.reviewer];
    document.getElementById("rgAuthor").innerHTML = who ? '<div class="rg-author"><img src="/assets/img/ramon-800.webp" alt="" width="56" height="56"><div><b>Fachlich geprüft von ' + esc(who) + '</b><span>Mobile Physiotherapie Oehlke · Hausbesuche in Hockenheim, Schwetzingen, Heidelberg und Umgebung</span></div></div>' : "";
    if (preview) document.querySelectorAll("a").forEach(function (l) { if (l.closest("#rgArticle")) l.setAttribute("target", "_blank"); });
  }
})();

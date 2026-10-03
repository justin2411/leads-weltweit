/* Mobile Physiotherapie Oehlke – Interaktion & Animation (ohne Bibliotheken) */
(function () {
  "use strict";
  var doc = document.documentElement;
  doc.classList.add("js");
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* Header, Fortschrittsbalken, schwebende Buttons */
  var hdr = $(".hdr"), bar = $(".progress"), fab = $(".fab");
  var ticking = false;
  function onScroll() {
    var y = window.scrollY, h = doc.scrollHeight - window.innerHeight;
    if (hdr) hdr.classList.toggle("hdr--solid", y > 40);
    if (bar) bar.style.transform = "scaleX(" + (h > 0 ? y / h : 0) + ")";
    if (fab) fab.classList.toggle("show", y > window.innerHeight * 0.8);
    parallax();
    steps();
    ticking = false;
  }
  window.addEventListener("scroll", function () {
    if (!ticking) { ticking = true; requestAnimationFrame(onScroll); }
  }, { passive: true });

  /* Mobiles Menü */
  var burger = $(".burger");
  if (burger) burger.addEventListener("click", function () {
    var open = document.body.classList.toggle("menu-open");
    burger.setAttribute("aria-expanded", open);
    document.body.style.overflow = open ? "hidden" : "";
  });
  $$(".mnav a").forEach(function (a) {
    a.addEventListener("click", function () {
      document.body.classList.remove("menu-open");
      document.body.style.overflow = "";
      if (burger) burger.setAttribute("aria-expanded", "false");
    });
  });
  /* Dropdown per Tastatur/Touch */
  $$(".nav__drop").forEach(function (b) {
    b.addEventListener("click", function () {
      var it = b.parentNode, open = it.classList.toggle("open");
      b.setAttribute("aria-expanded", open);
    });
  });
  document.addEventListener("click", function (e) {
    $$(".nav__item.open").forEach(function (it) { if (!it.contains(e.target)) it.classList.remove("open"); });
  });

  /* Einblenden beim Scrollen */
  if ("IntersectionObserver" in window) {
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        (e.target._rv || [e.target]).forEach(function (el) { el.classList.add("in"); });
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    $$(".rv").forEach(function (el) { io.observe(el); });
    /* clip-path verbirgt das Element selbst – deshalb den Elternblock beobachten */
    $$(".clip").forEach(function (el) {
      var host = el.parentNode;
      if (!host._rv) { host._rv = []; io.observe(host); }
      host._rv.push(el);
    });

    /* Zähler */
    var co = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        co.unobserve(e.target);
        var el = e.target, to = +el.getAttribute("data-count"), t0 = null;
        if (reduce) { el.textContent = to; return; }
        (function f(t) {
          if (!t0) t0 = t;
          var p = Math.min((t - t0) / 1600, 1);
          el.textContent = Math.round(to * (1 - Math.pow(1 - p, 4)));
          if (p < 1) requestAnimationFrame(f);
        })(performance.now());
      });
    }, { threshold: 0.6 });
    $$("[data-count]").forEach(function (el) { el.textContent = "0"; co.observe(el); });

    /* Inhaltsverzeichnis markieren */
    var toc = $$(".toc a");
    if (toc.length) {
      var so = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          toc.forEach(function (a) { a.classList.toggle("on", a.getAttribute("href") === "#" + e.target.id); });
        });
      }, { rootMargin: "-30% 0px -60% 0px" });
      $$(".prose>section[id]").forEach(function (s) { so.observe(s); });
    }
  } else {
    $$(".rv,.clip").forEach(function (el) { el.classList.add("in"); });
  }

  /* Parallaxe */
  var px = $$("[data-px]");
  function parallax() {
    if (reduce) return;
    var vh = window.innerHeight;
    px.forEach(function (el) {
      var r = el.parentNode.getBoundingClientRect();
      if (r.bottom < 0 || r.top > vh) return;
      var k = +el.getAttribute("data-px");
      var off = (r.top + r.height / 2 - vh / 2) * k;
      el.style.transform = "translate3d(0," + off.toFixed(1) + "px,0)";
    });
  }

  /* Ablauf: Linie wächst mit */
  var stepsEl = $(".steps");
  function steps() {
    if (!stepsEl) return;
    var r = stepsEl.getBoundingClientRect(), vh = window.innerHeight;
    var p = Math.min(Math.max((vh * 0.75 - r.top) / (r.height + vh * 0.2), 0), 1);
    stepsEl.style.setProperty("--p", p.toFixed(3));
    $$(".step", stepsEl).forEach(function (s, i, all) {
      s.classList.toggle("on", p >= (i + 0.2) / all.length);
    });
  }

  /* Wellen: Pfadlänge setzen */
  $$(".waves path").forEach(function (p) {
    try { p.style.setProperty("--len", Math.ceil(p.getTotalLength())); } catch (e) {}
  });

  /* Hero: Maus-Parallaxe + Lichtschein */
  var hero = $(".hero"), cursor = $(".cursor");
  if (hero && !reduce && window.matchMedia("(pointer:fine)").matches) {
    var layers = $$("[data-depth]", hero);
    hero.addEventListener("mousemove", function (e) {
      var x = e.clientX / window.innerWidth - 0.5, y = e.clientY / window.innerHeight - 0.5;
      layers.forEach(function (l) {
        var d = +l.getAttribute("data-depth");
        l.style.translate = (x * d).toFixed(1) + "px " + (y * d).toFixed(1) + "px";
      });
      if (cursor) cursor.style.transform = "translate3d(" + e.clientX + "px," + e.clientY + "px,0)";
    });
  }

  /* Karten: leichtes 3D-Kippen */
  if (!reduce && window.matchMedia("(pointer:fine)").matches) {
    $$("[data-tilt]").forEach(function (c) {
      c.addEventListener("mousemove", function (e) {
        var r = c.getBoundingClientRect();
        var x = (e.clientX - r.left) / r.width - 0.5, y = (e.clientY - r.top) / r.height - 0.5;
        c.style.transform = "perspective(900px) rotateX(" + (-y * 5).toFixed(2) + "deg) rotateY(" + (x * 6).toFixed(2) + "deg) translateY(-4px)";
      });
      c.addEventListener("mouseleave", function () { c.style.transform = ""; });
    });
    $$(".btn--magnet").forEach(function (b) {
      b.addEventListener("mousemove", function (e) {
        var r = b.getBoundingClientRect();
        b.style.translate = ((e.clientX - r.left - r.width / 2) * 0.2).toFixed(1) + "px " + ((e.clientY - r.top - r.height / 2) * 0.3).toFixed(1) + "px";
      });
      b.addEventListener("mouseleave", function () { b.style.translate = ""; });
    });
  }

  /* Karte ↔ Ortsliste */
  $$("[data-town]").forEach(function (el) {
    var k = el.getAttribute("data-town");
    function hl(on) { $$('[data-town="' + k + '"]').forEach(function (x) { x.classList.toggle("hl", on); }); }
    el.addEventListener("mouseenter", function () { hl(true); });
    el.addEventListener("mouseleave", function () { hl(false); });
    el.addEventListener("focus", function () { hl(true); });
    el.addEventListener("blur", function () { hl(false); });
  });

  /* FAQ: nur eine Antwort offen */
  $$(".faq").forEach(function (f) {
    $$("details", f).forEach(function (d) {
      d.addEventListener("toggle", function () {
        if (d.open) $$("details", f).forEach(function (o) { if (o !== d) o.open = false; });
      });
    });
  });

  /* Terminanfrage: öffnet das E-Mail-Programm mit vorbereiteter Nachricht (kein Server, keine Speicherung) */
  var form = $("#terminForm");
  if (form) {
    var status = $(".form__status", form);
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (form.website && form.website.value) return;
      var name = form.name.value.trim(), tel = form.tel.value.trim();
      if (!name || !tel) { status.textContent = "Bitte Name und Telefonnummer angeben."; return; }
      if (!form.consent.checked) { status.textContent = "Bitte stimmen Sie der Verarbeitung Ihrer Angaben zu."; return; }
      status.textContent = "";
      var art = (form.querySelector('input[name="art"]:checked') || {}).value || "keine Angabe";
      var body = "Name: " + name + "\nTelefon: " + tel + "\nE-Mail: " + (form.email.value.trim() || "keine Angabe") +
        "\nIch bin: " + art + "\n\nNachricht:\n" + (form.msg.value.trim() || "keine Angabe");
      window.location.href = "mailto:info@physiotherapie-oehlke.de?subject=" +
        encodeURIComponent("Terminanfrage über die Website") + "&body=" + encodeURIComponent(body);
      form.classList.add("sent");
    });
  }

  onScroll();
})();

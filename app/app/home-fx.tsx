"use client";

import { useEffect } from "react";
import { initTune } from "./tune-fx";

/**
 * Effekte der Startseite nach der Vorlage des Inhabers (03.10.2026, „nextgen-profit-startseite-v2.html“):
 * Hero-Einblendung und Lichtstrahl, Film-Zoom, Methode mit mitlaufender Grafik (v4), Einblenden beim Scrollen, Zahlen-Walzen, 3D-Karte im Hero,
 * rotierende Signale, magnetische Knöpfe, Länder-Reiter, Lichtschein auf Branchenkarten, geführte Tour mit Stempel im Beispiel-Lead,
 * Beispielwochen beim Ansprechpartner (v4),
 * Play-Knopf des Films, weiches Auf- und Zuklappen der Fragen. Ohne JavaScript bleibt alles sichtbar.
 */
export function HomeFx() {
  useEffect(() => {
    const d = document, root = d.documentElement;
    const page = d.querySelector<HTMLElement>(".hpz");
    if (!page) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.webdriver;
    const fine = matchMedia("(pointer: fine)").matches;
    const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
    const $ = <T extends Element = HTMLElement>(s: string, c: ParentNode = page) => c.querySelector<T>(s);
    const $$ = <T extends Element = HTMLElement>(s: string, c: ParentNode = page) => [...c.querySelectorAll<T>(s)];
    const offs: (() => void)[] = [];
    const on = (t: EventTarget, ev: string, f: EventListener, o?: AddEventListenerOptions) => { t.addEventListener(ev, f, o); offs.push(() => t.removeEventListener(ev, f)); };
    const timers: number[] = [];

    // 1 · Hero-Einblendung + Lichtstrahl
    const beam = $(".hp-beam"), hero = $(".hp-hero");
    const sweep = () => { if (reduce || !beam) return; beam.classList.remove("is-on"); void beam.offsetWidth; beam.classList.add("is-on"); };
    const fonts = d.fonts?.ready ? Promise.race([d.fonts.ready, new Promise((r) => setTimeout(r, 1200))]) : Promise.resolve();
    fonts.then(() => requestAnimationFrame(() => { root.classList.add("is-ready"); timers.push(window.setTimeout(sweep, 250)); }));
    if (!reduce) timers.push(window.setInterval(() => { if (!d.hidden && hero && hero.getBoundingClientRect().bottom > 0) sweep(); }, 15000));

    // 2 · Beim Scrollen: Film-Zoom, Methode mit mitlaufender Grafik, Statement Wort für Wort
    const desktop = () => matchMedia("(min-width: 1061px)").matches;
    const film = $("[data-scale]");
    // Methode nach Vorlage v4: Schritt-Leiste unten, Lichtlauf um den Rahmen beim Schrittwechsel
    const story = $("[data-story]"), rail = $(".hp-story__rail");
    const ssteps = $$(".hp-sstep"), vizs = $$(".hp-story__stage .hp-viz"), track = $$(".hp-story__track li");
    const sstage = $(".hp-story__stage"), sbeam = $(".hp-story__beam");
    const statement = $(".hp-statement"), words = $$(".hp-sw");
    let active = -1;
    const setStep = (i: number) => {
      if (i === active) return; const first = active < 0; active = i;
      ssteps.forEach((s, k) => { s.classList.toggle("is-active", k === i); s.classList.toggle("is-done", k <= i); });
      vizs.forEach((v, k) => { v.classList.toggle("is-active", k === i); v.classList.toggle("is-past", k < i); });
      track.forEach((t, k) => { t.classList.toggle("is-on", k <= i); t.classList.toggle("is-cur", k === i); });
      if (sstage) sstage.dataset.step = String(i);
      if (sbeam && !first && !reduce && desktop()) { sbeam.classList.remove("is-on"); void sbeam.offsetWidth; sbeam.classList.add("is-on"); }
    };
    const measure = () => {
      if (!rail || !ssteps.length || !rail.parentElement) return;
      const col = rail.parentElement.getBoundingClientRect();
      const a = $(".hp-step__icon", ssteps[0])!.getBoundingClientRect(), b = $(".hp-step__icon", ssteps[ssteps.length - 1])!.getBoundingClientRect();
      rail.style.top = (a.top + a.height / 2 - col.top) + "px";
      rail.style.height = Math.max(0, (b.top + b.height / 2) - (a.top + a.height / 2)) + "px";
    };
    let ticking = false;
    const update = () => {
      ticking = false;
      const vh = innerHeight;
      if (story && ssteps.length) {
        let i = 0;
        ssteps.forEach((s, k) => { const r = $(".hp-step__icon", s)!.getBoundingClientRect(); if (r.top + r.height / 2 < vh * 0.58) i = k; });
        setStep(i);
        if (rail && !reduce) { const r = rail.getBoundingClientRect(); rail.style.setProperty("--p", clamp((vh * 0.58 - r.top) / Math.max(1, r.height), 0, 1).toFixed(4)); }
      }
      if (reduce) return;
      if (film) { const r = film.getBoundingClientRect(); const p = clamp((vh - r.top) / (vh * 0.75), 0, 1); film.style.setProperty("--s", (0.88 + 0.12 * p).toFixed(4)); film.style.setProperty("--p", p.toFixed(3)); }
      if (statement && words.length) {
        const r = statement.getBoundingClientRect();
        const p = clamp((vh * 0.92 - r.top) / (r.height * 0.55 + vh * 0.35), 0, 1);
        const n = Math.round(p * (words.length + 0.4));
        words.forEach((w, i) => w.classList.toggle("is-lit", i < n));
      }
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    on(window, "scroll", onScroll, { passive: true });
    on(window, "resize", () => { measure(); onScroll(); }, { passive: true });
    if (reduce) words.forEach((w) => w.classList.add("is-lit"));
    measure(); update(); fonts.then(() => { measure(); update(); });

    // 3 · Einblenden beim Scrollen
    const reveals = $$("[data-reveal]");
    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window && !reduce) {
      io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io!.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
      reveals.forEach((el) => io!.observe(el));
    } else reveals.forEach((el) => el.classList.add("is-in"));

    // 4 · Zahlen-Walzen
    $$("[data-odo]").forEach((el) => {
      if (el.dataset.odoDone) return;
      el.dataset.odoDone = "1";
      const text = (el.textContent ?? "").trim(); el.setAttribute("aria-label", text); el.textContent = "";
      let k = 0;
      for (const ch of text) {
        if (/\d/.test(ch)) {
          const col = d.createElement("span"); col.className = "hp-odo"; col.setAttribute("aria-hidden", "true");
          const strip = d.createElement("span"); strip.className = "hp-odo__strip"; strip.style.setProperty("--n", ch); strip.style.transitionDelay = (k++ * 90) + "ms";
          strip.innerHTML = "01234567890123456789".split("").map((n) => `<span>${n}</span>`).join("");
          col.appendChild(strip); el.appendChild(col);
        } else { const s = d.createElement("span"); s.setAttribute("aria-hidden", "true"); s.textContent = ch; el.appendChild(s); }
      }
    });

    // 5 · Karte im Hero: Signale wechseln automatisch durch UK, US und FR (Inhaber 03.10.2026), die Karte des Landes
    //     blendet über, die Stadt pulsiert, eine goldene Linie verbindet Signal und Stadt. Kein Mitbewegen mit der Maus.
    const stage = $(".hp-stage");
    let linkLater = () => {};
    if (stage) {
      const sigs = $$(".hp-sig", stage), maps = $$(".hp-map", stage), chips = $$<HTMLButtonElement>(".hp-city", stage);
      const list = $(".hp-sigs", stage);
      const linkPath = $<SVGPathElement>(".hp-link path", stage), linkDot = $<SVGCircleElement>(".hp-link circle", stage);
      let idx = Math.max(0, sigs.findIndex((s) => s.classList.contains("is-active"))), hold = 0;
      const mapOf = (s: HTMLElement) => maps.find((m) => m.dataset.cc === s.dataset.cc);
      const pinOf = (s: HTMLElement) => mapOf(s)?.querySelector<SVGGElement>(`.hp-pin[data-city="${s.dataset.city}"]`) ?? undefined;
      const drawLink = (animate: boolean) => {
        if (!linkPath || !linkDot) return;
        const pin = pinOf(sigs[idx]);
        if (!desktop() || !pin) { linkPath.setAttribute("d", ""); linkDot.setAttribute("cx", "-99"); return; }
        const st = stage.getBoundingClientRect(), card = sigs[idx].getBoundingClientRect(), pr = $(".hp-pin__dot", pin)!.getBoundingClientRect();
        const x1 = card.left - st.left + 30, y1 = card.bottom - st.top, x2 = pr.left + pr.width / 2 - st.left, y2 = pr.top - st.top - 3;
        linkPath.setAttribute("d", `M${x1.toFixed(1)} ${y1.toFixed(1)} C${x1.toFixed(1)} ${(y1 + (y2 - y1) * 0.6).toFixed(1)} ${x2.toFixed(1)} ${(y2 - (y2 - y1) * 0.5).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`);
        linkDot.setAttribute("cx", x1.toFixed(1)); linkDot.setAttribute("cy", y1.toFixed(1));
        if (animate && !reduce && linkPath.animate) { const L = linkPath.getTotalLength(); linkPath.animate([{ strokeDasharray: `${L}`, strokeDashoffset: L }, { strokeDasharray: `${L}`, strokeDashoffset: 0 }], { duration: 1000, easing: "cubic-bezier(.16,1,.3,1)" }); }
      };
      let lraf = 0, lend = 0;
      linkLater = () => { lend = performance.now() + 1400; if (!lraf) { const loop = (tm: number) => { drawLink(false); lraf = tm < lend ? requestAnimationFrame(loop) : 0; }; lraf = requestAnimationFrame(loop); } };
      const show = (i: number) => {
        const prev = sigs[idx]; idx = (i + sigs.length) % sigs.length; const cur = sigs[idx];
        if (prev !== cur) { prev.classList.remove("is-active"); prev.classList.add("is-leaving"); timers.push(window.setTimeout(() => prev.classList.remove("is-leaving"), 650)); }
        cur.classList.add("is-active");
        if (list) list.style.height = cur.offsetHeight + "px";
        const map = mapOf(cur);
        maps.forEach((m) => m.classList.toggle("is-on", m === map));
        chips.forEach((c) => c.setAttribute("aria-selected", String(c.dataset.cc === cur.dataset.cc)));
        const pin = pinOf(cur);
        map?.querySelectorAll(".hp-pin").forEach((p) => p.classList.toggle("is-active", p === pin));
        const wave = map?.querySelector<SVGCircleElement>(".hp-wave");
        if (pin && wave && !reduce) { wave.setAttribute("cx", pin.dataset.x ?? "0"); wave.setAttribute("cy", pin.dataset.y ?? "0"); wave.classList.remove("is-on"); wave.getBoundingClientRect(); wave.classList.add("is-on"); }
        // Karte blendet über: Linie erst nach dem Überblenden neu zeichnen
        timers.push(window.setTimeout(() => { drawLink(true); linkLater(); }, prev.dataset.cc !== cur.dataset.cc ? 450 : 0));
      };
      chips.forEach((c) => on(c, "click", () => { hold = Date.now() + 8000; show(sigs.findIndex((s) => s.dataset.cc === c.dataset.cc)); }));
      show(idx);
      fonts.then(() => timers.push(window.setTimeout(() => { if (list) list.style.height = sigs[idx].offsetHeight + "px"; drawLink(true); linkLater(); }, 1500)));
      on(window, "resize", () => { if (list) list.style.height = sigs[idx].offsetHeight + "px"; drawLink(false); }, { passive: true });
      if (!reduce) timers.push(window.setInterval(() => { if (Date.now() < hold || d.hidden || !hero || hero.getBoundingClientRect().bottom < 0) return; show(idx + 1); }, 5600));
    }

    // 6 · Hero: Lichtkegel auf dem Punkteraster im Hintergrund (die Karte selbst bewegt sich nicht mit der Maus)
    if (fine && !reduce && hero) {
      let raf = 0, px = 0, py = 0;
      on(hero, "pointermove", ((e: PointerEvent) => {
        px = e.clientX; py = e.clientY;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0; const h = hero.getBoundingClientRect();
          hero.style.setProperty("--mx", (px - h.left) + "px"); hero.style.setProperty("--my", (py - h.top) + "px"); hero.classList.add("is-pointer");
        });
      }) as EventListener);
      on(hero, "pointerleave", () => hero.classList.remove("is-pointer"));
    }

    // 7 · Magnetische Gold-Knöpfe
    if (fine && !reduce) $$("[data-magnetic]").forEach((b) => {
      on(b, "pointermove", ((e: PointerEvent) => { const r = b.getBoundingClientRect(); b.style.translate = `${((e.clientX - r.left) / r.width - 0.5) * 14}px ${((e.clientY - r.top) / r.height - 0.5) * 10}px`; }) as EventListener);
      on(b, "pointerleave", () => { b.style.translate = ""; });
    });

    // 8 · Länder-Reiter: gleitende Markierung, rollende Länderkennzeichen, Links je Land
    const tabsEl = $(".hp-tabs"), tabs = $$<HTMLButtonElement>(".hp-tab"), ind = $(".hp-tabs__ind"), grid = $("#ind-list");
    const place = (t: HTMLElement | null) => { if (!ind || !t) return; ind.style.setProperty("--x", t.offsetLeft + "px"); ind.style.setProperty("--w", t.offsetWidth + "px"); };
    const select = (t: HTMLButtonElement) => {
      if (!grid) return;
      tabs.forEach((x) => { const sel = x === t; x.setAttribute("aria-selected", String(sel)); x.tabIndex = sel ? 0 : -1; });
      grid.setAttribute("aria-labelledby", t.id); grid.dataset.country = t.dataset.country; place(t);
      $$<HTMLAnchorElement>(".hp-ind__link", grid).forEach((a) => {
        const p = a.dataset[t.dataset.country ?? ""];
        a.closest("li")?.toggleAttribute("hidden", !p);
        if (p) a.href = p;
      });
    };
    tabs.forEach((t, i) => {
      on(t, "click", () => select(t));
      on(t, "keydown", ((e: KeyboardEvent) => {
        const k = ({ ArrowRight: 1, ArrowLeft: -1 } as Record<string, number>)[e.key];
        if (!k) return; e.preventDefault(); const n = tabs[(i + k + tabs.length) % tabs.length]; select(n); n.focus();
      }) as EventListener);
    });
    if (tabsEl && ind) {
      const init = () => { place($(".hp-tab[aria-selected=\"true\"]")); tabsEl.classList.add("is-ready"); };
      fonts.then(init);
      on(window, "resize", () => place($(".hp-tab[aria-selected=\"true\"]")), { passive: true });
    }

    // 9 · Lichtschein auf den Branchenkarten
    if (fine && !reduce && grid) {
      const cards = $$(".hp-ind__card", grid); let raf = 0, px = 0, py = 0;
      on(grid, "pointermove", ((e: PointerEvent) => {
        px = e.clientX; py = e.clientY;
        if (raf) return;
        raf = requestAnimationFrame(() => { raf = 0; cards.forEach((c) => { const r = c.getBoundingClientRect(); c.style.setProperty("--x", (px - r.left) + "px"); c.style.setProperty("--y", (py - r.top) + "px"); }); grid.classList.add("is-pointer"); });
      }) as EventListener);
      on(grid, "pointerleave", () => grid.classList.remove("is-pointer"));
    }

    // 9b · Bewertung als Fließband (Inhaber 03.10.2026, wie im Film): je Takt rückt jede Karte einen Platz weiter.
    //      Platz 1 = Scanner: der Qualitätswert füllt sich mit den Werten dieser Karte; Platz 2 = Ergebnis
    //      (bestanden grün mit Wert, unter 60 rot und fällt heraus). Gilt auch für die Handy-Kopien der Grafik.
    const BELT: [number, number, number][] = [[92, 86, 95], [44, 31, 48], [88, 90, 79], [71, 66, 80], [38, 52, 35], [95, 84, 91]];
    let beltN = 0;
    const beltTick = () => {
      if (d.hidden) return;
      $$("[data-belt]").forEach((belt) => {
        const viz = belt.closest(".hp-viz"); if (!viz) return;
        const rows = $$(".hp-qs__row", viz);
        $$(".hp-belt__card", belt).forEach((c) => {
          let slot = +(c.dataset.slot ?? 0) + 1;
          if (slot > 3) {
            slot = -1; c.classList.add("no-anim"); c.className = "hp-belt__card no-anim";
            const sc = $(".hp-belt__score", c); if (sc) sc.textContent = "";
            c.dataset.slot = "-1"; void c.offsetWidth; c.classList.remove("no-anim"); return;
          }
          c.dataset.slot = String(slot);
          if (slot === 1) {
            const v = BELT[beltN % BELT.length]; c.dataset.v = v.join(",");
            c.classList.add("is-scan");
            rows.forEach((r) => { r.style.setProperty("--v", "0"); const em = $("em", r); if (em) em.textContent = "–"; });
            timers.push(window.setTimeout(() => rows.forEach((r, k) => { r.style.setProperty("--v", String(v[k])); const em = $("em", r); if (em) em.textContent = String(v[k]); }), 350));
            timers.push(window.setTimeout(() => {
              const tot = Math.round((v[0] + v[1] + v[2]) / 3), sc = $(".hp-belt__score", c);
              if (sc) sc.textContent = String(tot);
              c.classList.add("has-score", tot >= 60 ? "is-pass" : "is-fail");
            }, 1500));
          }
          if (slot === 2) { c.classList.remove("is-scan"); c.classList.add("is-done"); }
        });
      });
      beltN += 1;
    };
    if (!reduce) { timers.push(window.setTimeout(beltTick, 600)); timers.push(window.setInterval(beltTick, 2800)); }

    // 10 · Beispiel-Lead (Vorlage v4): geführter Fokus 1-2-3 (der Rest der Karte tritt zurück), der Quellen-Stempel landet
    //      bei „Beleg“, der Einstiegssatz tippt sich selbst. Die Tour läuft einmal (je Punkt 3,2 s) und startet nicht neu (Inhaber 03.10.2026).
    const notes = $$("[data-note]"), example = $("[data-example-lead]"), lead = $(".hp-lead"), stamp = $(".hp-stamp"), notesList = $(".hp-notes");
    let touring = true;
    const light = (k: number | string) => {
      k = +k || 0;
      $$(".hp-lit").forEach((m) => m.classList.remove("hp-lit"));
      notes.forEach((n) => n.classList.toggle("is-active", n.dataset.note === String(k)));
      lead?.classList.toggle("is-focus", k > 0);
      if (k) $$(`[data-mark="${k}"]`).forEach((m) => m.classList.add("hp-lit"));
      if (k === 2) stamp?.classList.add("is-on");
    };
    // Hover auf einen Punkt hält die Tour an und zeigt diesen Punkt; nach dem Durchlauf nur noch per Hover
    let toured = false;
    notes.forEach((n) => {
      on(n, "mouseenter", () => { touring = false; notesList?.classList.remove("is-touring"); light(n.dataset.note ?? 0); });
      on(n, "mouseleave", () => { if (toured) { light(0); return; } touring = true; notesList?.classList.add("is-touring"); });
    });
    const typewrite = (el: HTMLElement, speed: number) => new Promise<void>((done) => {
      type Part = { text: string; node: ChildNode } | { node: HTMLElement };
      const parts: Part[] = [...el.childNodes].map((n) => n.nodeType === 3 ? { text: n.textContent ?? "", node: n } : { node: n as HTMLElement });
      el.style.minHeight = el.offsetHeight + "px";
      parts.forEach((p) => { if ("text" in p) p.node.textContent = ""; else p.node.style.visibility = "hidden"; });
      el.classList.add("is-typing");
      let i = 0, k = 0;
      const step = () => {
        const p = parts[i];
        if (!p) { el.classList.remove("is-typing"); el.style.minHeight = ""; return done(); }
        if (!("text" in p)) { p.node.style.visibility = ""; i++; timers.push(window.setTimeout(step, speed * 3)); return; }
        k += 1; p.node.textContent = p.text.slice(0, k);
        if (k >= p.text.length) { i++; k = 0; }
        timers.push(window.setTimeout(step, speed));
      };
      step();
    });
    let io2: IntersectionObserver | null = null;
    if (example && lead && !reduce && "IntersectionObserver" in window) {
      const quote = $(".hp-opening blockquote", example);
      io2 = new IntersectionObserver((es) => es.forEach((e) => {
        if (!e.isIntersecting) return; io2!.disconnect();
        timers.push(window.setTimeout(() => {
          if (quote) typewrite(quote, 13);
          notesList?.classList.add("is-touring");
          let k = 0;
          const step = () => {
            if (toured) return;
            if (!touring || d.hidden) { timers.push(window.setTimeout(step, 3200)); return; }
            if (k >= 3) { toured = true; notesList?.classList.remove("is-touring"); light(0); return; }
            k += 1; light(k); timers.push(window.setTimeout(step, 3200));
          };
          step();
        }, 500));
      }), { threshold: 0.45 });
      io2.observe(lead);
    } else stamp?.classList.add("is-on");

    // 11 · Film: Titelbild als Radar (Vorlage v2) über dem Video; ein Klick blendet es aus, danach die normale Steuerung
    const video = $<HTMLVideoElement>(".hp-video video"), poster = $(".hp-cine__poster"), play = $<HTMLButtonElement>(".hp-cine__play");
    if (video && poster && play) {
      video.controls = false; poster.hidden = false; video.setAttribute("tabindex", "-1");
      const start = () => { film?.classList.add("is-playing"); video.controls = true; video.removeAttribute("tabindex"); video.play().catch(() => null); };
      on(play, "click", start);
      on(poster, "click", ((e: Event) => { if (!(e.target as Element).closest(".hp-cine__play")) start(); }) as EventListener);
      on(video, "play", () => film?.classList.add("is-playing"));
      // leichtes Mitbewegen der Radar-Ebenen mit der Maus
      if (fine && !reduce) {
        let raf = 0, px = 0, py = 0;
        const apply = () => { raf = 0; poster.style.setProperty("--px", px.toFixed(3)); poster.style.setProperty("--py", py.toFixed(3)); };
        on(poster, "pointermove", ((e: PointerEvent) => {
          if (e.pointerType === "touch") return; const r = poster.getBoundingClientRect(); if (!r.width) return;
          px = ((e.clientX - r.left) / r.width - 0.5) * 2; py = ((e.clientY - r.top) / r.height - 0.5) * 2; if (!raf) raf = requestAnimationFrame(apply);
        }) as EventListener, { passive: true });
        on(poster, "pointerleave", () => { px = 0; py = 0; if (!raf) raf = requestAnimationFrame(apply); });
      }
    }

    // 12 · Vorlage v2: Bewegung nur ohne reduzierte Bewegung (.hp-motion); [data-io] einmal beim Einblenden (.is-io),
    //      [data-live] solange sichtbar (.is-live, nur dann laufen die Schleifen); Lichtschein folgt dem Zeiger über dem Kennzahlen-Band
    let io5: IntersectionObserver | null = null, io6: IntersectionObserver | null = null;
    if (!reduce && "IntersectionObserver" in window) {
      page.classList.add("hp-motion");
      io5 = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-io"); io5!.unobserve(e.target); } }), { rootMargin: "0px 0px -10% 0px", threshold: 0.1 });
      $$("[data-io]").forEach((el) => io5!.observe(el));
      io6 = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("is-live", e.isIntersecting)), { threshold: 0.15 });
      $$("[data-live]").forEach((el) => io6!.observe(el));
      const band = $(".hp-band");
      if (band && fine) {
        let raf = 0, x = 0, y = 0;
        on(band, "pointermove", ((e: PointerEvent) => {
          const r = band.getBoundingClientRect(); x = e.clientX - r.left; y = e.clientY - r.top;
          band.classList.add("is-hot");
          if (!raf) raf = requestAnimationFrame(() => { raf = 0; band.style.setProperty("--stat-mx", x + "px"); band.style.setProperty("--stat-my", y + "px"); });
        }) as EventListener, { passive: true });
        on(band, "pointerleave", () => band.classList.remove("is-hot"));
      }
    } else $$("[data-io]").forEach((el) => el.classList.add("is-io"));

    // 13 · Fragen: weich auf- und zuklappen
    $$<HTMLDetailsElement>("details.hp-qa").forEach((det) => {
      const sum = $("summary", det), body = $(".hp-qa__a", det);
      if (!sum || !body) return;
      on(sum, "click", ((e: Event) => {
        if (reduce || !body.animate) return;
        e.preventDefault();
        const opts = { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" };
        if (det.open) {
          det.classList.add("is-closing");
          body.animate([{ height: body.offsetHeight + "px", opacity: 1 }, { height: "0px", opacity: 0 }], opts).onfinish = () => { det.open = false; det.classList.remove("is-closing"); };
        } else {
          det.open = true;
          body.animate([{ height: "0px", opacity: 0 }, { height: body.offsetHeight + "px", opacity: 1 }], opts);
        }
      }) as EventListener);
    });

    // 14 · Ansprechpartner (Vorlage v4): vier Beispielwochen, die Filter werden enger und mehr Punkte rücken in den
    //      Passungsring. Läuft ab Sichtbarkeit in Schleife (je Woche 3,6 s, Inhaber 03.10.2026); ein Klick auf eine Woche hält an.
    const tune = $("[data-tune]");
    if (tune) offs.push(initTune(tune, reduce));

    // 15 · Methode auf Handy und Tablet: jeder Schritt bekommt eine eigene Kopie der Grafik, die abspielt, solange sie sichtbar ist
    const mqStory = matchMedia("(max-width: 1060px)");
    let inlineBuilt = false, io4: IntersectionObserver | null = null;
    const buildInline = () => {
      if (inlineBuilt || !mqStory.matches || !vizs.length) return; inlineBuilt = true;
      const boxes = ssteps.map((s, k) => {
        const box = d.createElement("div"); box.className = "hp-sstep__stage"; box.setAttribute("aria-hidden", "true");
        const v = vizs[k].cloneNode(true) as HTMLElement; v.classList.remove("is-active", "is-past"); box.appendChild(v); s.appendChild(box); return box;
      });
      if (!reduce && "IntersectionObserver" in window) {
        io4 = new IntersectionObserver((es) => es.forEach((e) => e.target.firstElementChild?.classList.toggle("is-active", e.isIntersecting)), { threshold: 0.4 });
        boxes.forEach((b) => io4!.observe(b));
      } else boxes.forEach((b) => b.firstElementChild?.classList.add("is-active"));
      measure();
    };
    buildInline();
    on(mqStory, "change", buildInline);

    return () => { offs.forEach((f) => f()); timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); io?.disconnect(); io2?.disconnect(); io4?.disconnect(); io5?.disconnect(); io6?.disconnect(); page.classList.remove("hp-motion"); $$(".hp-sstep__stage").forEach((b) => b.remove()); };
  }, []);
  return null;
}

"use client";

import { useEffect } from "react";

/**
 * Effekte der Landingpages, übernommen aus den Effekten der Startseite (app/home-fx.tsx, Inhaber 03.10.2026):
 * Hero-Grafik mit wechselnden Signalen und goldener Linie zur Stadt, Methode mit mitlaufender Grafik, Einblenden beim
 * Scrollen (auch die Punkte in „What they have in common“), Fließband der Bewertung, geführter Fokus im Beispiel-Lead,
 * weiches Auf- und Zuklappen der Fragen. Ohne JavaScript und bei reduzierter Bewegung bleibt alles sichtbar und ruhig.
 */
export function LandingFx() {
  useEffect(() => {
    const d = document, root = d.documentElement;
    const page = d.querySelector<HTMLElement>(".lp2");
    const zones = [...d.querySelectorAll<HTMLElement>(".lp2 .hpz")];
    if (!page || !zones.length) return;
    const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.webdriver;
    const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
    const $ = <T extends Element = HTMLElement>(s: string, c: ParentNode = page) => c.querySelector<T>(s);
    const $$ = <T extends Element = HTMLElement>(s: string, c: ParentNode = page) => [...c.querySelectorAll<T>(s)];
    const offs: (() => void)[] = [];
    const on = (t: EventTarget, ev: string, f: EventListener, o?: AddEventListenerOptions) => { t.addEventListener(ev, f, o); offs.push(() => t.removeEventListener(ev, f)); };
    const timers: number[] = [];
    const fonts = d.fonts?.ready ? Promise.race([d.fonts.ready, new Promise((r) => setTimeout(r, 1200))]) : Promise.resolve();
    const hero = $(".h2o");
    // Lichtstrahl beim Laden wie auf der Startseite (Inhaber 03.10.2026), danach alle 15 s
    const beam = $(".lz-beam .hp-beam");
    const sweep = () => { if (reduce || !beam) return; beam.classList.remove("is-on"); void beam.offsetWidth; beam.classList.add("is-on"); };
    fonts.then(() => requestAnimationFrame(() => { root.classList.add("is-ready"); timers.push(window.setTimeout(sweep, 250)); }));
    if (!reduce) timers.push(window.setInterval(() => { if (!d.hidden && hero && hero.getBoundingClientRect().bottom > 0) sweep(); }, 15000));
    const desktop = () => matchMedia("(min-width: 1061px)").matches;

    // 1 · Methode: Schritt-Leiste, mitlaufende Grafik
    const story = $("[data-story]"), rail = $(".hp-story__rail");
    const ssteps = $$(".hp-sstep"), vizs = $$(".hp-story__stage .hp-viz"), track = $$(".hp-story__track li");
    const sstage = $(".hp-story__stage"), sbeam = $(".hp-story__beam");
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
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    on(window, "scroll", onScroll, { passive: true });
    on(window, "resize", () => { measure(); onScroll(); }, { passive: true });
    measure(); update(); fonts.then(() => { measure(); update(); });

    // 2 · Einblenden beim Scrollen (füllt auch die Punkte der Erreichbarkeit nacheinander)
    const reveals = $$(".hpz [data-reveal]");
    let io: IntersectionObserver | null = null;
    if ("IntersectionObserver" in window && !reduce) {
      io = new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add("is-in"); io!.unobserve(e.target); } }), { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
      reveals.forEach((el) => io!.observe(el));
    } else reveals.forEach((el) => el.classList.add("is-in"));

    // 3 · Hero: Signale der Branche wechseln, die Stadt pulsiert, eine goldene Linie verbindet Signal und Stadt
    const stage = $(".hp-stage");
    if (stage) {
      const sigs = $$(".hp-sig", stage), map = $(".hp-map", stage), list = $(".hp-sigs", stage);
      const linkPath = $<SVGPathElement>(".hp-link path", stage), linkDot = $<SVGCircleElement>(".hp-link circle", stage);
      let idx = 0;
      const pinOf = (s: HTMLElement) => map?.querySelector<SVGGElement>(`.hp-pin[data-city="${CSS.escape(s.dataset.city ?? "")}"]`) ?? undefined;
      const drawLink = (animate: boolean) => {
        if (!linkPath || !linkDot) return;
        const pin = pinOf(sigs[idx]);
        if (!desktop() || !pin || !stage.offsetParent) { linkPath.setAttribute("d", ""); linkDot.setAttribute("cx", "-99"); return; }
        const st = stage.getBoundingClientRect(), card = sigs[idx].getBoundingClientRect(), pr = $(".hp-pin__dot", pin)!.getBoundingClientRect();
        const x1 = card.left - st.left + 30, y1 = card.bottom - st.top, x2 = pr.left + pr.width / 2 - st.left, y2 = pr.top - st.top - 3;
        linkPath.setAttribute("d", `M${x1.toFixed(1)} ${y1.toFixed(1)} C${x1.toFixed(1)} ${(y1 + (y2 - y1) * 0.6).toFixed(1)} ${x2.toFixed(1)} ${(y2 - (y2 - y1) * 0.5).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`);
        linkDot.setAttribute("cx", x1.toFixed(1)); linkDot.setAttribute("cy", y1.toFixed(1));
        if (animate && !reduce && linkPath.animate) { const L = linkPath.getTotalLength(); linkPath.animate([{ strokeDasharray: `${L}`, strokeDashoffset: L }, { strokeDasharray: `${L}`, strokeDashoffset: 0 }], { duration: 1000, easing: "cubic-bezier(.16,1,.3,1)" }); }
      };
      let lraf = 0, lend = 0;
      const linkLater = () => { lend = performance.now() + 1400; if (!lraf) { const loop = (tm: number) => { drawLink(false); lraf = tm < lend ? requestAnimationFrame(loop) : 0; }; lraf = requestAnimationFrame(loop); } };
      const show = (i: number) => {
        const prev = sigs[idx]; idx = (i + sigs.length) % sigs.length; const cur = sigs[idx];
        if (prev !== cur) { prev.classList.remove("is-active"); prev.classList.add("is-leaving"); timers.push(window.setTimeout(() => prev.classList.remove("is-leaving"), 650)); }
        cur.classList.add("is-active");
        if (list) list.style.height = cur.offsetHeight + "px";
        const pin = pinOf(cur);
        map?.querySelectorAll(".hp-pin").forEach((p) => p.classList.toggle("is-active", p === pin));
        const wave = map?.querySelector<SVGCircleElement>(".hp-wave");
        if (pin && wave && !reduce) { wave.setAttribute("cx", pin.dataset.x ?? "0"); wave.setAttribute("cy", pin.dataset.y ?? "0"); wave.classList.remove("is-on"); wave.getBoundingClientRect(); wave.classList.add("is-on"); }
        timers.push(window.setTimeout(() => { drawLink(true); linkLater(); }, 0));
      };
      if (sigs.length) {
        show(0);
        fonts.then(() => timers.push(window.setTimeout(() => { if (list) list.style.height = sigs[idx].offsetHeight + "px"; drawLink(true); linkLater(); }, 1500)));
        on(window, "resize", () => { if (list) list.style.height = sigs[idx].offsetHeight + "px"; drawLink(false); }, { passive: true });
        if (!reduce && sigs.length > 1) timers.push(window.setInterval(() => { if (d.hidden || !hero || hero.getBoundingClientRect().bottom < 0 || !stage.offsetParent) return; show(idx + 1); }, 5600));
      }
    }

    // 4 · Bewertung als Fließband (wie Startseite): Karten rücken je Takt weiter, Scanner füllt den Qualitätswert
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
            slot = -1; c.className = "hp-belt__card no-anim";
            const sc = $(".hp-belt__score", c); if (sc) sc.textContent = "";
            c.dataset.slot = "-1"; void c.offsetWidth; c.classList.remove("no-anim"); return;
          }
          c.dataset.slot = String(slot);
          if (slot === 1) {
            const v = BELT[beltN % BELT.length];
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

    // 5 · Beispiel-Lead: geführter Fokus 1-2-3, Stempel bei „Beleg“, Einstiegssatz tippt sich (einmal)
    const notes = $$("[data-note]"), example = $("[data-example-lead]"), lead = $(".hp-lead"), stamp = $(".hp-stamp"), notesList = $(".hp-notes");
    let touring = true, toured = false;
    const light = (k: number | string) => {
      k = +k || 0;
      $$(".hp-lit").forEach((m) => m.classList.remove("hp-lit"));
      notes.forEach((n) => n.classList.toggle("is-active", n.dataset.note === String(k)));
      lead?.classList.toggle("is-focus", k > 0);
      if (k) $$(`[data-mark="${k}"]`).forEach((m) => m.classList.add("hp-lit"));
      if (k === 2) stamp?.classList.add("is-on");
    };
    notes.forEach((n) => {
      on(n, "mouseenter", () => { touring = false; notesList?.classList.remove("is-touring"); light(n.dataset.note ?? 0); });
      on(n, "mouseleave", () => { if (toured) { light(0); return; } touring = true; notesList?.classList.add("is-touring"); });
    });
    const typewrite = (el: HTMLElement, speed: number) => {
      type P = { text: string; node: ChildNode } | { node: HTMLElement };
      const parts: P[] = [...el.childNodes].map((n) => n.nodeType === 3 ? { text: n.textContent ?? "", node: n } : { node: n as HTMLElement });
      el.style.minHeight = el.offsetHeight + "px";
      parts.forEach((p) => { if ("text" in p) p.node.textContent = ""; else p.node.style.visibility = "hidden"; });
      let i = 0, k = 0;
      const step = () => {
        const p = parts[i];
        if (!p) { el.style.minHeight = ""; return; }
        if (!("text" in p)) { p.node.style.visibility = ""; i++; timers.push(window.setTimeout(step, speed * 3)); return; }
        k += 1; p.node.textContent = p.text.slice(0, k);
        if (k >= p.text.length) { i++; k = 0; }
        timers.push(window.setTimeout(step, speed));
      };
      step();
    };
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

    // 6 · Bewegung nur ohne reduzierte Bewegung (.hp-motion); [data-live] solange sichtbar (.is-live)
    let io6: IntersectionObserver | null = null;
    if (!reduce && "IntersectionObserver" in window) {
      zones.forEach((z) => z.classList.add("hp-motion"));
      io6 = new IntersectionObserver((es) => es.forEach((e) => e.target.classList.toggle("is-live", e.isIntersecting)), { threshold: 0.15 });
      $$(".hpz [data-live]").forEach((el) => io6!.observe(el));
    }

    // 7 · Fragen: weich auf- und zuklappen
    $$<HTMLDetailsElement>("details.hp-qa").forEach((det) => {
      const sum = $("summary", det), body = $(".hp-qa__a", det);
      if (!sum || !body) return;
      on(sum, "click", ((e: Event) => {
        if (reduce || !body.animate) return;
        e.preventDefault();
        const opts = { duration: 420, easing: "cubic-bezier(.16,1,.3,1)" };
        if (det.open) {
          body.animate([{ height: body.offsetHeight + "px", opacity: 1 }, { height: "0px", opacity: 0 }], opts).onfinish = () => { det.open = false; };
        } else {
          det.open = true;
          body.animate([{ height: "0px", opacity: 0 }, { height: body.offsetHeight + "px", opacity: 1 }], opts);
        }
      }) as EventListener);
    });

    // 8 · Methode auf Handy und Tablet: je Schritt eine eigene Kopie der Grafik, spielt solange sichtbar
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

    return () => {
      offs.forEach((f) => f()); timers.forEach((t) => { clearTimeout(t); clearInterval(t); });
      io?.disconnect(); io2?.disconnect(); io4?.disconnect(); io6?.disconnect();
      zones.forEach((z) => z.classList.remove("hp-motion")); $$(".hp-sstep__stage").forEach((b) => b.remove());
    };
  }, []);
  return null;
}

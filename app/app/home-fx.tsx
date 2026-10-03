"use client";

import { useEffect } from "react";

/**
 * Effekte der Startseite nach der Vorlage des Inhabers (03.10.2026, „nextgen-profit-startseite-v2.html“):
 * Hero-Einblendung und Lichtstrahl, Film-Zoom, Zeitstrahl, Einblenden beim Scrollen, Zahlen-Walzen, 3D-Karte im Hero,
 * rotierende Signale, magnetische Knöpfe, Länder-Reiter, Lichtschein auf Branchenkarten, geführte Tour im Beispiel-Lead,
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
    const story = $("[data-story]"), rail = $(".hp-story__rail"), railFill = $(".hp-story__fill");
    const ssteps = $$(".hp-sstep"), vizs = $$(".hp-viz"), sdots = $$(".hp-story__dots span");
    const statement = $(".hp-statement"), words = $$(".hp-sw");
    let active = -1;
    const setStep = (i: number) => {
      if (i === active) return; active = i;
      ssteps.forEach((s, k) => { s.classList.toggle("is-active", k === i); s.classList.toggle("is-done", k <= i); });
      vizs.forEach((v, k) => v.classList.toggle("is-active", k === i));
      sdots.forEach((s, k) => s.classList.toggle("is-on", k <= i));
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
        if (railFill && rail && !reduce) { const r = rail.getBoundingClientRect(); railFill.style.setProperty("--p", clamp((vh * 0.58 - r.top) / Math.max(1, r.height), 0, 1).toFixed(4)); }
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

    // 5 · Karte im Hero: Signale wechseln, die Stadt pulsiert, eine goldene Linie verbindet Karte und Stadt
    const stage = $(".hp-stage");
    let linkLater = () => {};
    if (stage) {
      const sigs = $$(".hp-sig", stage), pins = $$<SVGGElement>(".hp-pin", stage), wave = $<SVGCircleElement>(".hp-wave", stage);
      const list = $(".hp-sigs", stage), cities = $(".hp-stage__cities", stage);
      const linkPath = $<SVGPathElement>(".hp-link path", stage), linkDot = $<SVGCircleElement>(".hp-link circle", stage);
      let idx = Math.max(0, sigs.findIndex((s) => s.classList.contains("is-active"))), hold = 0;
      const pinOf = (s: HTMLElement) => pins.find((p) => p.dataset.city === s.dataset.city);
      const drawLink = (animate: boolean) => {
        if (!linkPath || !linkDot) return;
        const pin = pinOf(sigs[idx]);
        if (!desktop() || !pin) { linkPath.setAttribute("d", ""); linkDot.setAttribute("cx", "-99"); return; }
        const st = stage.getBoundingClientRect(), card = sigs[idx].getBoundingClientRect(), pr = $(".hp-pin__dot", pin)!.getBoundingClientRect();
        const x1 = card.left - st.left + 30, y1 = card.bottom - st.top, x2 = pr.left + pr.width / 2 - st.left, y2 = pr.top + pr.height / 2 - st.top - 9;
        linkPath.setAttribute("d", `M${x1.toFixed(1)} ${y1.toFixed(1)} C${x1.toFixed(1)} ${(y1 + (y2 - y1) * 0.6).toFixed(1)} ${x2.toFixed(1)} ${(y2 - (y2 - y1) * 0.5).toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`);
        linkDot.setAttribute("cx", x1.toFixed(1)); linkDot.setAttribute("cy", y1.toFixed(1));
        if (animate && !reduce && linkPath.animate) { const L = linkPath.getTotalLength(); linkPath.animate([{ strokeDasharray: `${L}`, strokeDashoffset: L }, { strokeDasharray: `${L}`, strokeDashoffset: 0 }], { duration: 1000, easing: "cubic-bezier(.16,1,.3,1)" }); }
      };
      let lraf = 0, lend = 0;
      linkLater = () => { lend = performance.now() + 1400; if (!lraf) { const loop = (tm: number) => { drawLink(false); lraf = tm < lend ? requestAnimationFrame(loop) : 0; }; lraf = requestAnimationFrame(loop); } };
      const chips: HTMLButtonElement[] = [];
      const show = (i: number) => {
        const prev = sigs[idx]; idx = (i + sigs.length) % sigs.length; const cur = sigs[idx];
        if (prev !== cur) { prev.classList.remove("is-active"); prev.classList.add("is-leaving"); timers.push(window.setTimeout(() => prev.classList.remove("is-leaving"), 650)); }
        cur.classList.add("is-active");
        if (list) list.style.height = cur.offsetHeight + "px";
        chips.forEach((c, k) => c.setAttribute("aria-selected", String(k === idx)));
        const pin = pinOf(cur); pins.forEach((p) => p.classList.toggle("is-active", p === pin));
        if (pin && wave && !reduce) { wave.setAttribute("cx", pin.dataset.x ?? "0"); wave.setAttribute("cy", pin.dataset.y ?? "0"); wave.classList.remove("is-on"); wave.getBoundingClientRect(); wave.classList.add("is-on"); }
        requestAnimationFrame(() => { drawLink(true); linkLater(); });
      };
      if (cities && !cities.children.length) sigs.forEach((s, i) => {
        const b = d.createElement("button"); b.type = "button"; b.className = "hp-city"; b.setAttribute("role", "tab"); b.textContent = s.dataset.city ?? "";
        on(b, "click", () => { hold = Date.now() + 14000; show(i); });
        cities.appendChild(b); chips.push(b);
      });
      show(idx);
      fonts.then(() => timers.push(window.setTimeout(() => { if (list) list.style.height = sigs[idx].offsetHeight + "px"; drawLink(true); linkLater(); }, 1500)));
      on(window, "resize", () => { if (list) list.style.height = sigs[idx].offsetHeight + "px"; drawLink(false); }, { passive: true });
      if (!reduce) timers.push(window.setInterval(() => { if (Date.now() < hold || d.hidden || !hero || hero.getBoundingClientRect().bottom < 0) return; show(idx + 1); }, 5600));
    }

    // 6 · Hero: Lichtkegel auf dem Punkteraster, goldene Kartenpunkte unter dem Mauszeiger, Tiefe
    const mapSvg = $<SVGSVGElement>(".hp-map svg"), litC = $<SVGCircleElement>("#hp-lit-c");
    if (fine && !reduce && hero) {
      let raf = 0, px = 0, py = 0;
      on(hero, "pointermove", ((e: PointerEvent) => {
        px = e.clientX; py = e.clientY;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0; const h = hero.getBoundingClientRect();
          hero.style.setProperty("--mx", (px - h.left) + "px"); hero.style.setProperty("--my", (py - h.top) + "px"); hero.classList.add("is-pointer");
          if (mapSvg && litC) { const m = mapSvg.getScreenCTM(); if (m) { const pt = new DOMPoint(px, py).matrixTransform(m.inverse()); litC.setAttribute("cx", pt.x.toFixed(1)); litC.setAttribute("cy", pt.y.toFixed(1)); } }
          if (stage && desktop()) {
            const nx = (px - h.left) / h.width - 0.5, ny = (py - h.top) / h.height - 0.5;
            stage.style.setProperty("--mpx", (-nx * 16).toFixed(1) + "px"); stage.style.setProperty("--mpy", (-ny * 12).toFixed(1) + "px");
            stage.style.setProperty("--cpx", (nx * 18).toFixed(1) + "px"); stage.style.setProperty("--cpy", (ny * 14).toFixed(1) + "px");
            linkLater();
          }
        });
      }) as EventListener);
      on(hero, "pointerleave", () => {
        hero.classList.remove("is-pointer"); litC?.setAttribute("cx", "-999");
        if (stage) { ["--mpx", "--mpy", "--cpx", "--cpy"].forEach((v) => stage.style.setProperty(v, "0px")); linkLater(); }
      });
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

    // 10 · Beispiel-Lead: geführte Tour 1-2-3, Einstiegssatz tippt sich selbst
    const notes = $$("[data-note]"), example = $("[data-example-lead]");
    let touring = true;
    const light = (k: number | string) => {
      $$(".hp-lit").forEach((m) => m.classList.remove("hp-lit"));
      notes.forEach((n) => n.classList.toggle("is-active", n.dataset.note === String(k)));
      if (k) $$(`[data-mark="${k}"]`).forEach((m) => m.classList.add("hp-lit"));
    };
    notes.forEach((n) => {
      on(n, "mouseenter", () => { touring = false; light(n.dataset.note ?? 0); });
      on(n, "mouseleave", () => light(0));
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
    if (example && !reduce && "IntersectionObserver" in window) {
      const quote = $(".hp-opening blockquote", example);
      io2 = new IntersectionObserver((es) => es.forEach((e) => {
        if (!e.isIntersecting) return; io2!.disconnect();
        timers.push(window.setTimeout(() => {
          if (quote) typewrite(quote, 13);
          [1, 2, 3].forEach((k, j) => timers.push(window.setTimeout(() => { if (touring) light(k); }, j * 1500)));
          timers.push(window.setTimeout(() => { if (touring) light(0); touring = false; }, 3 * 1500 + 1800));
        }, 500));
      }), { threshold: 0.45 });
      const lead = $(".hp-lead", example);
      if (lead) io2.observe(lead);
    }

    // 11 · Film: ein goldener Play-Knopf über dem Vorschaubild, danach die normale Steuerung
    const video = $<HTMLVideoElement>(".hp-video video"), play = $<HTMLButtonElement>(".hp-video__play");
    if (video && play) {
      video.controls = false; play.hidden = false;
      on(play, "click", () => { video.controls = true; play.hidden = true; video.play().catch(() => null); });
      on(video, "play", () => film?.classList.add("is-playing"));
    }

    // 13 · Fragen: weich auf- und zuklappen
    $$<HTMLDetailsElement>(".hp-qa details").forEach((det) => {
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

    return () => { offs.forEach((f) => f()); timers.forEach((t) => { clearTimeout(t); clearInterval(t); }); io?.disconnect(); io2?.disconnect(); };
  }, []);
  return null;
}

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

    // 2 · Film-Zoom und Zeitstrahl beim Scrollen
    const film = $("[data-scale]");
    const stepsWrap = $("[data-steps]"), track = $(".hp-track"), fill = $(".hp-track__fill"), steps = $$(".hp-step");
    if (!reduce) steps.forEach((s) => s.classList.remove("is-on"));
    let thresholds: number[] | null = [];
    const measure = () => {
      if (!track || !stepsWrap || getComputedStyle(track).display === "none") { thresholds = null; return; }
      if (matchMedia("(max-width: 720px)").matches) {
        const w = stepsWrap.getBoundingClientRect(), last = $(".hp-step__icon", steps[steps.length - 1])!.getBoundingClientRect();
        track.style.bottom = Math.max(0, w.bottom - (last.top + last.height / 2)) + "px";
      } else track.style.bottom = "";
      const tr = track.getBoundingClientRect(), vertical = tr.height > tr.width;
      thresholds = steps.map((s) => {
        const r = $(".hp-step__icon", s)!.getBoundingClientRect();
        const c = vertical ? r.top + r.height / 2 - tr.top : r.left + r.width / 2 - tr.left;
        return clamp(c / (vertical ? tr.height : tr.width), 0, 1);
      });
    };
    let ticking = false;
    const update = () => {
      ticking = false;
      if (reduce) return;
      const vh = innerHeight;
      if (film) { const r = film.getBoundingClientRect(); const p = clamp((vh - r.top) / (vh * 0.75), 0, 1); film.style.setProperty("--s", (0.9 + 0.1 * p).toFixed(4)); film.style.setProperty("--p", p.toFixed(3)); }
      if (stepsWrap) {
        const r = stepsWrap.getBoundingClientRect();
        const p = clamp((vh * 0.82 - r.top) / (vh * 0.5), 0, 1);
        fill?.style.setProperty("--p", p.toFixed(4));
        steps.forEach((s, i) => s.classList.toggle("is-on", thresholds ? p >= thresholds[i] - 0.001 : r.top < vh * 0.8));
      }
    };
    const onScroll = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
    on(window, "scroll", onScroll, { passive: true });
    on(window, "resize", () => { measure(); onScroll(); }, { passive: true });
    measure(); update();

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

    // 5 · Hero: Lichtkegel auf dem Punkteraster, 3D-Neigung der Signalkarte
    const feed = $(".hp-feed");
    if (fine && !reduce && hero && feed) {
      let raf = 0, px = 0, py = 0;
      on(hero, "pointermove", ((e: PointerEvent) => {
        px = e.clientX; py = e.clientY;
        if (raf) return;
        raf = requestAnimationFrame(() => {
          raf = 0; const h = hero.getBoundingClientRect(), f = feed.getBoundingClientRect();
          hero.style.setProperty("--mx", (px - h.left) + "px"); hero.style.setProperty("--my", (py - h.top) + "px");
          const nx = clamp((px - (f.left + f.width / 2)) / h.width, -0.5, 0.5), ny = clamp((py - (f.top + f.height / 2)) / h.height, -0.5, 0.5);
          feed.style.setProperty("--ry", (nx * 12).toFixed(2) + "deg"); feed.style.setProperty("--rx", (-ny * 9).toFixed(2) + "deg");
          feed.style.setProperty("--gx", ((px - f.left) / f.width * 100).toFixed(1) + "%"); feed.style.setProperty("--gy", ((py - f.top) / f.height * 100).toFixed(1) + "%");
          hero.classList.add("is-pointer");
        });
      }) as EventListener);
      on(hero, "pointerleave", () => { hero.classList.remove("is-pointer"); feed.style.setProperty("--rx", "0deg"); feed.style.setProperty("--ry", "0deg"); });
    }

    // 6 · Signale rotieren: der älteste fällt heraus und kommt oben wieder (FLIP)
    const list = $(".hp-feed__list");
    if (list && !reduce && list.children.length > 1 && "animate" in Element.prototype) {
      const ease = "cubic-bezier(.16,1,.3,1)";
      const cycle = () => {
        if (d.hidden || !hero || hero.getBoundingClientRect().bottom < 0) return;
        const items = [...list.children] as HTMLElement[], last = items[items.length - 1];
        const before = new Map(items.map((el) => [el, el.getBoundingClientRect().top]));
        last.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "translateY(12px) scale(.98)" }], { duration: 320, easing: "ease-in", fill: "forwards" }).onfinish = () => {
          list.prepend(last);
          items.forEach((el) => { if (el === last) return; const dy = before.get(el)! - el.getBoundingClientRect().top; el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 800, easing: ease }); });
          last.getAnimations().forEach((a) => a.cancel());
          last.animate([{ opacity: 0, transform: "translateY(-18px) scale(.97)" }, { opacity: 1, transform: "none" }], { duration: 800, easing: ease });
          last.classList.remove("is-new"); void last.offsetWidth; last.classList.add("is-new");
          timers.push(window.setTimeout(() => last.classList.remove("is-new"), 2600));
        };
      };
      timers.push(window.setTimeout(() => timers.push(window.setInterval(cycle, 5200)), 3400));
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

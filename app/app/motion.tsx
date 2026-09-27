"use client";

import { useEffect, useRef, useState } from "react";
import type { HomeFeedItem as FeedItem } from "@/lib/site-pages";

const calm = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.webdriver;

/**
 * Alle Effekte der öffentlichen Seiten: Einblenden beim Scrollen, hochzählende Zahlen, Lichtschein unter der Maus
 * (Karten), Fortschrittsbalken, kompakte Navigation.
 * Ohne JavaScript und bei "Bewegung reduzieren" bleibt alles sofort sichtbar.
 */
export function Motion() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = calm();
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-rv],[data-count]"));
    const count = (el: HTMLElement) => {
      const to = Number(el.dataset.count || 0), suf = el.dataset.suffix ?? "";
      if (reduce || !to) { el.textContent = to.toLocaleString("en-GB") + suf; return; }
      const t0 = performance.now(), dur = 2000;
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
        el.textContent = Math.round(to * e).toLocaleString("en-GB") + (p < 1 ? "" : suf);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    const offs: (() => void)[] = [];
    const on = <K extends keyof WindowEventMap>(t: K, f: (e: WindowEventMap[K]) => void) => {
      window.addEventListener(t, f as EventListener, { passive: true });
      offs.push(() => window.removeEventListener(t, f as EventListener));
    };

    // Fortschritt und Navigation
    const bar = document.querySelector<HTMLElement>(".bx .progress");
    const scroll = () => {
      const h = document.documentElement.scrollHeight - innerHeight;
      bar?.style.setProperty("--p", String(h > 0 ? scrollY / h : 0));
      root.classList.toggle("scrolled", scrollY > 30);
    };
    scroll(); on("scroll", scroll);

    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach((el) => (el.dataset.count ? count(el) : el.classList.add("in")));
      return () => offs.forEach((f) => f());
    }
    root.classList.add("motion");
    const io = new IntersectionObserver((entries) => {
      for (const en of entries) {
        if (!en.isIntersecting) continue;
        const el = en.target as HTMLElement;
        if (el.dataset.count) count(el); else el.classList.add("in");
        io.unobserve(el);
      }
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    els.forEach((el) => io.observe(el));

    // Lichtschein auf Karten
    const fine = matchMedia("(pointer: fine)").matches;
    if (fine) {
      on("pointermove", (e) => {
        const t = e.target as HTMLElement | null;
        const g = t?.closest?.<HTMLElement>(".glow");
        if (g) {
          const r = g.getBoundingClientRect();
          g.style.setProperty("--x", `${e.clientX - r.left}px`);
          g.style.setProperty("--y", `${e.clientY - r.top}px`);
        }
      });
    }
    return () => { io.disconnect(); offs.forEach((f) => f()); };
  }, []);
  return <div className="progress" aria-hidden="true" />;
}

/** Ruhiges Netz aus Punkten im Hero, über das goldene Signale laufen (ersetzt den Lichtstrahl). */
export function HeroNet() {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext("2d");
    if (!cv || !ctx) return;
    const still = calm();
    let w = 0, h = 0, raf = 0, dpr = 1;
    type P = { x: number; y: number; vx: number; vy: number };
    let pts: P[] = [];
    type S = { a: number; b: number; t: number };
    const sigs: S[] = [];
    const size = () => {
      dpr = Math.min(2, devicePixelRatio || 1);
      w = cv.clientWidth; h = cv.clientHeight;
      cv.width = w * dpr; cv.height = h * dpr; ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.round(Math.min(70, Math.max(24, (w * h) / 16000)));
      pts = Array.from({ length: n }, () => ({ x: Math.random() * w, y: Math.random() * h, vx: (Math.random() - 0.5) * 0.18, vy: (Math.random() - 0.5) * 0.18 }));
    };
    const link = 150;
    const draw = () => {
      ctx.clearRect(0, 0, w, h);
      for (const p of pts) {
        if (!still) { p.x += p.vx; p.y += p.vy; if (p.x < 0 || p.x > w) p.vx *= -1; if (p.y < 0 || p.y > h) p.vy *= -1; }
      }
      const pairs: [number, number][] = [];
      for (let i = 0; i < pts.length; i++) for (let j = i + 1; j < pts.length; j++) {
        const dx = pts[i].x - pts[j].x, dy = pts[i].y - pts[j].y, d = Math.hypot(dx, dy);
        if (d < link) {
          pairs.push([i, j]);
          ctx.strokeStyle = `rgba(154,166,186,${0.16 * (1 - d / link)})`; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.moveTo(pts[i].x, pts[i].y); ctx.lineTo(pts[j].x, pts[j].y); ctx.stroke();
        }
      }
      for (const p of pts) { ctx.fillStyle = "rgba(216,189,138,.55)"; ctx.beginPath(); ctx.arc(p.x, p.y, 1.4, 0, 7); ctx.fill(); }
      if (!still) {
        if (pairs.length && sigs.length < 7 && Math.random() < 0.05) { const [a, b] = pairs[(Math.random() * pairs.length) | 0]; sigs.push({ a, b, t: 0 }); }
        for (let k = sigs.length - 1; k >= 0; k--) {
          const s = sigs[k]; s.t += 0.012;
          const A = pts[s.a], B = pts[s.b];
          if (s.t >= 1 || !A || !B) { sigs.splice(k, 1); continue; }
          const x = A.x + (B.x - A.x) * s.t, y = A.y + (B.y - A.y) * s.t;
          const g = ctx.createRadialGradient(x, y, 0, x, y, 12);
          g.addColorStop(0, "rgba(246,230,194,.95)"); g.addColorStop(1, "rgba(216,189,138,0)");
          ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, 12, 0, 7); ctx.fill();
        }
        raf = requestAnimationFrame(draw);
      }
    };
    size(); draw();
    const ro = new ResizeObserver(() => { size(); if (still) draw(); });
    ro.observe(cv);
    // Nur zeichnen, solange der Hero sichtbar ist
    const vis = new IntersectionObserver(([e]) => {
      if (still) return;
      cancelAnimationFrame(raf);
      if (e.isIntersecting) raf = requestAnimationFrame(draw);
    });
    vis.observe(cv);
    return () => { cancelAnimationFrame(raf); ro.disconnect(); vis.disconnect(); };
  }, []);
  return <canvas ref={ref} className="net" aria-hidden="true" />;
}

/** Laufende Anzeige echter Beispiel-Leads aus der Probe (nur Firmendaten). */
export function SignalFeed({ items, label }: { items: FeedItem[]; label: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length < 2 || calm()) return;
    const id = setInterval(() => setI((x) => (x + 1) % items.length), 3200);
    return () => clearInterval(id);
  }, [items.length]);
  if (!items.length) return null;
  const shown = [0, 1, 2].map((k) => items[(i + k) % items.length]).slice(0, Math.min(3, items.length));
  return (
    <div className="feed" aria-label={label}>
      <div className="feed-head"><span className="pulse" aria-hidden="true" />{label}</div>
      <ul>
        {shown.map((it, k) => (
          <li key={`${i}-${k}`} className={k === 0 ? "new" : ""}>
            <div className="co">{it.company}<span>{it.place}</span></div>
            <div className="ev">{it.event}</div>
            <div className="mt">{it.date} · {it.source}</div>
          </li>
        ))}
      </ul>
    </div>
  );
}

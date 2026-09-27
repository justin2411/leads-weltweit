"use client";

import { useEffect, useState } from "react";

import type { HomeFeedItem as FeedItem } from "@/lib/site-pages";

/** Einblenden beim Scrollen und hochzählende Kennzahlen. Respektiert "Bewegung reduzieren". */
export function Motion() {
  useEffect(() => {
    const root = document.documentElement;
    // Automatisierte Browser (Bildschirmfotos) sehen alles sofort
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.webdriver;
    const els = Array.from(document.querySelectorAll<HTMLElement>("[data-rv],[data-count]"));
    const count = (el: HTMLElement) => {
      const to = Number(el.dataset.count || 0), suf = el.dataset.suffix ?? "";
      if (reduce || !to) { el.textContent = to.toLocaleString("en-GB") + suf; return; }
      const t0 = performance.now(), dur = 1800;
      const step = (t: number) => {
        const p = Math.min(1, (t - t0) / dur), e = 1 - Math.pow(1 - p, 4);
        el.textContent = Math.round(to * e).toLocaleString("en-GB") + (p < 1 ? "" : suf);
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    if (reduce || !("IntersectionObserver" in window)) {
      els.forEach((el) => (el.dataset.count ? count(el) : el.classList.add("in")));
      return;
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
    return () => io.disconnect();
  }, []);
  return null;
}

/** Laufende Anzeige echter Beispiel-Leads aus der Probe (nur Firmendaten). */
export function SignalFeed({ items, label }: { items: FeedItem[]; label: string }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (items.length < 2 || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
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

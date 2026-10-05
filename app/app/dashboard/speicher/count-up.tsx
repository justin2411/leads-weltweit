"use client";
/**
 * Zahl zählt beim Laden hoch (Inhaber 05.10.2026: „gerne neue grafik und animation“). Server rendert den Endwert
 * (ohne JavaScript und für Screenshots richtig); im Browser kurz von 0 hochzählen – nie bei prefers-reduced-motion.
 */
import { useLayoutEffect, useState } from "react";
import { big } from "@/lib/storage";

const FMT = { big, int: (n: number) => Math.round(n).toLocaleString("de-DE") } as const;

export function CountUp({ to, fmt = "big", ms = 1200 }: { to: number; fmt?: keyof typeof FMT; ms?: number }) {
  const [v, setV] = useState(to);
  useLayoutEffect(() => {
    if (!(to > 0) || typeof window === "undefined" || window.matchMedia?.("(prefers-reduced-motion: reduce)").matches) { setV(to); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(to * (1 - (1 - p) ** 3));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    setV(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return <span className="cu"><span aria-hidden>{FMT[fmt](v)}</span><span className="cu-sr">{FMT[fmt](to)}</span></span>;
}

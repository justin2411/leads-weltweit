"use client";
/**
 * Büro-Kacheln: Zahl zählt beim Laden hoch, Gehirn-Countdown läuft mit. Server rendert den Endwert (richtig ohne
 * JavaScript und für Screenshots); nie Animation bei prefers-reduced-motion.
 */
import { useEffect, useLayoutEffect, useState } from "react";
import { countdown, zahlText } from "@/lib/buero-format";

const ruhig = () => typeof window === "undefined" || !!window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

export function ZahlHoch({ wert, dez = 0, vor = "", nach = "", ms = 1100 }: { wert: number; dez?: number; vor?: string; nach?: string; ms?: number }) {
  const [v, setV] = useState(wert);
  useLayoutEffect(() => {
    if (!(wert > 0) || ruhig()) { setV(wert); return; }
    let raf = 0;
    const t0 = performance.now();
    const step = (t: number) => {
      const p = Math.min(1, (t - t0) / ms);
      setV(p < 1 ? wert * (1 - (1 - p) ** 3) : wert);
      if (p < 1) raf = requestAnimationFrame(step);
    };
    setV(0);
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [wert, ms]);
  const end = zahlText(wert, dez, vor, nach);
  return <><span aria-hidden="true">{zahlText(v, dez, vor, nach)}</span><span className="bu-sr">{end}</span></>;
}

export function Countdown({ bis, text }: { bis: string; text: string }) {
  const [t, setT] = useState(text);
  useEffect(() => {
    const tick = () => setT(countdown(bis, Date.now()));
    tick();
    const id = setInterval(tick, 30_000);
    return () => clearInterval(id);
  }, [bis]);
  return <>{t}</>;
}

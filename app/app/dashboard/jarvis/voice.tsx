"use client";
/** JARVIS-Zeile: Begrüßung nach deutscher Uhrzeit und die wichtigste Empfehlung, Zeichen für Zeichen (ohne
 *  reduzierte Bewegung), dazu die Uhr in deutscher Zeit. */
import { useEffect, useState } from "react";

export function Voice({ lines }: { lines: string[] }) {
  const full = lines.join("  ·  ");
  const [n, setN] = useState(full.length);
  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setN(0);
    const id = setInterval(() => setN((k) => (k >= full.length ? (clearInterval(id), k) : k + 2)), 18);
    return () => clearInterval(id);
  }, [full]);
  return <p className="voice" aria-label={full}><span aria-hidden>{full.slice(0, n)}</span><i className="caret" aria-hidden /></p>;
}

export function Clock() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    const f = new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit" });
    const tick = () => setT(f.format(new Date()));
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);
  return <span className="clock" suppressHydrationWarning>{t ?? ""}</span>;
}

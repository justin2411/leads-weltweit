"use client";
/** B1 Ziel-Ringe: Umsatz (Gold), Kunden, Antwortquote, Fehlerquote. Füllen sich einmal beim Laden (300 ms), danach
 *  gleiten sie zum neuen Wert (150 ms). Unbestätigtes Ziel: gestrichelt + „Ziel unbestätigt“ → ?s=ziel. */
import Link from "next/link";
import { useEffect, useState } from "react";
import type { ZielBild } from "@/lib/zentrale-modell";

const C = 2 * Math.PI * 22;

function Spark({ v }: { v: number[] }) {
  const max = Math.max(...v, 1), min = Math.min(...v, 0);
  const pts = v.map((x, i) => `${(i / Math.max(1, v.length - 1)) * 100},${16 - ((x - min) / Math.max(1e-9, max - min)) * 14 - 1}`).join(" ");
  return <svg className="sp" viewBox="0 0 100 16" preserveAspectRatio="none" aria-hidden><polyline points={pts} /></svg>;
}

export function ZielRinge({ ziele }: { ziele: ZielBild[] }) {
  const [da, setDa] = useState(false);
  const [erst, setErst] = useState(true);
  useEffect(() => {
    const t = requestAnimationFrame(() => setDa(true));
    const u = setTimeout(() => setErst(false), 400);
    return () => { cancelAnimationFrame(t); clearTimeout(u); };
  }, []);
  return (
    <section className="jz-ziele" aria-label="Ziele">
      {ziele.map((z) => (
        <Link key={z.key} href={z.unbestaetigt ? "/dashboard/jarvis?s=ziel" : "/dashboard/ziele"} scroll={false}
          className={`jz-ziel${z.gold ? " gold" : ""}${z.unbestaetigt ? " unb" : ""}${erst ? " erst" : ""}`}
          title={`${z.titel}: ${z.ist} von ${z.soll}${z.unbestaetigt ? " · Ziel unbestätigt" : ""}`}>
          <svg viewBox="0 0 56 56" aria-hidden>
            <circle cx="28" cy="28" r="22" className="tr" />
            <circle cx="28" cy="28" r="22" className="vl" transform="rotate(-90 28 28)"
              strokeDasharray={`${((da ? z.anteil : 0) * C).toFixed(1)} ${C.toFixed(1)}`} />
          </svg>
          <span style={{ minWidth: 0 }}>
            <b className="z">{z.ist} <small>/ {z.soll}</small></b>
            <span>{z.titel}</span>
            {z.unbestaetigt && <em>Ziel unbestätigt</em>}
            {z.spark && <Spark v={z.spark} />}
          </span>
        </Link>
      ))}
    </section>
  );
}

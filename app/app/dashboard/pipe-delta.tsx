"use client";
import { useEffect, useState } from "react";

/**
 * Plus seit der letzten Messung (Inhaber 03.10.2026). Je Kennzahl merkt sich der Browser die letzte Messung
 * (Zeitpunkt der Zählung `at`); kommt eine neue Zählung, wird die alte zum Vergleichswert. Gezeigt wird die echte
 * Differenz zur vorigen Messung mit deren Uhrzeit (deutsche Zeit); ohne Vergleichswert oder ohne Änderung nichts.
 */
type Snap = { at: string; n: number };
export function PipeDelta({ k, at, n }: { k: string; at: string; n: number }) {
  const [d, setD] = useState<{ diff: number; since: string } | null>(null);
  useEffect(() => {
    const key = `pd:${k}`;
    let s: { cur?: Snap; prev?: Snap } = {};
    try { s = JSON.parse(localStorage.getItem(key) ?? "{}"); } catch { /* leer */ }
    if (s.cur && s.cur.at !== at) s = { prev: s.cur, cur: { at, n } };
    else s = { ...s, cur: { at, n } };
    try { localStorage.setItem(key, JSON.stringify(s)); } catch { /* privat */ }
    const diff = s.prev ? n - s.prev.n : 0;
    setD(diff && s.prev ? { diff, since: when(s.prev.at) } : null);
  }, [k, at, n]);
  if (!d) return null;
  return <span className={`pd ${d.diff > 0 ? "up" : "down"}`} title={`Veränderung seit der Messung ${d.since}`}>
    {d.diff > 0 ? "+" : "−"}{Math.abs(d.diff).toLocaleString("de-DE")} <em>seit {d.since}</em></span>;
}

function when(iso: string) {
  const t = new Date(iso), now = new Date();
  const f = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", ...o }).format(t);
  const sameDay = f({ day: "2-digit", month: "2-digit" }) === new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit" }).format(now);
  return sameDay ? f({ hour: "2-digit", minute: "2-digit" }) : f({ day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
}

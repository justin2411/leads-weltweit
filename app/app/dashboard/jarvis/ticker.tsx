"use client";
/** B7 Ticker: die letzten 5 Ereignisse (Entscheidungen, fertige Aufträge, positive Antworten, Starts) mit Berliner Uhrzeit;
 *  neue Einträge gleiten in 200 ms herein. Klick öffnet das Ziel. */
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, type IconName } from "@/app/icons";
import type { TickerRow } from "@/lib/zentrale-typen";
import { uhr } from "@/lib/zentrale-logik";

const ZIEL: Record<TickerRow["art"], (r: TickerRow) => string> = {
  decision: () => "/dashboard/protokoll",
  task: (r) => `/dashboard/jarvis?a=${encodeURIComponent(r.ref)}`,
  start: () => "/dashboard/jarvis?s=lead",
  positiv: () => "/dashboard/antworten",
};
const ICON: Record<TickerRow["art"], IconName> = { decision: "gehirn", task: "ok", start: "start", positiv: "stern" };

export function Ticker({ rows, now }: { rows: TickerRow[]; now: number }) {
  const seen = useRef<Set<string> | null>(null);
  const [neu, setNeu] = useState<Set<string>>(new Set());
  const key = (r: TickerRow) => `${r.art}:${r.ref}:${r.at}`;
  useEffect(() => {
    const ks = rows.map(key);
    if (seen.current) {
      const n = new Set(ks.filter((k) => !seen.current!.has(k)));
      if (n.size) setNeu(n);
    }
    seen.current = new Set(ks);
  }, [rows]);
  return (
    <section className="jz-ticker" aria-label="Zuletzt passiert">
      <b>Zuletzt</b>
      {rows.length ? (
        <ol>
          {rows.slice(0, 5).map((r) => (
            <li key={key(r)} className={neu.has(key(r)) ? "neu" : undefined}>
              <time suppressHydrationWarning>{uhr(r.at, now)}</time>
              <Link href={ZIEL[r.art](r)} scroll={false}><Icon name={ICON[r.art]} size={14} />&nbsp;{r.titel}</Link>
            </li>
          ))}
        </ol>
      ) : <span style={{ fontSize: 13, color: "#8ba6c9" }}>noch nichts in 48 h</span>}
    </section>
  );
}

"use client";

/**
 * Gestapelte Säulen mit Tooltip (Inhaber 03.10.2026: „beim Darüberfahren … alle Zahlen dieses Tages“ und Klick auf
 * jeden Balken → Liste der Firmen). Maus: Darüberfahren zeigt den Tooltip, Klick öffnet die Liste. Handy: erstes
 * Tippen zeigt den Tooltip, zweites Tippen (oder „Firmen ansehen“) öffnet die Liste.
 * dataviz-Regeln: eine Achse, Haarlinien-Raster, Säulen ≤ 24 px, 4 px runde Enden, 2 px Lücken, Wert nur an der
 * letzten Säule, Legende ab zwei Reihen, Text in Textfarben.
 */
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Icon } from "@/app/icons";

export type Series = { key: string; label: string; color: string };
export type ColRow = { day: string; label: string; parts: Record<string, number>; total: number; href?: string; tipTitle?: string };

const fmt = (n: number) => n.toLocaleString("de-DE");
function niceMax(v: number): number {
  if (v <= 4) return 4;
  if (v <= 10) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((m) => m >= v) ?? v;
}
const compact = (n: number) => (n >= 1e4 ? `${Math.round(n / 1e3).toLocaleString("de-DE")} Tsd.` : fmt(Math.round(n)));

export function Columns({ rows, series, title, height = 180, sumLabel = "Summe", showSum = true }: {
  rows: ColRow[]; series: Series[]; title: string; height?: number; sumLabel?: string; showSum?: boolean;
}) {
  const router = useRouter();
  const [open, setOpen] = useState<string | null>(null);
  const max = niceMax(Math.max(1, ...rows.map((r) => r.total)));
  const every = Math.max(1, Math.ceil(rows.length / 7));
  return (
    <div className="cols" role="group" aria-label={title} style={{ height }} onMouseLeave={() => setOpen(null)}>
      <div className="cols-grid" aria-hidden>
        {[max, max / 2, 0].map((t) => <div key={t} className={t === 0 ? "base" : ""}><span>{compact(t)}</span></div>)}
      </div>
      <div className="cols-plot">
        {rows.map((r, i) => {
          const segs = series.filter((x) => (r.parts[x.key] ?? 0) > 0);
          const last = i === rows.length - 1;
          const isOpen = open === r.day;
          const side = i > rows.length * 0.6 ? "left" : "right";
          return (
            <div
              key={r.day}
              className={`col ${isOpen ? "open" : ""} ${r.href ? "link" : ""}`}
              role={r.href ? "link" : undefined}
              tabIndex={0}
              aria-label={`${r.tipTitle ?? r.label}: ${series.map((x) => `${x.label} ${r.parts[x.key] ?? 0}`).join(", ")}`}
              onMouseEnter={() => setOpen(r.day)}
              onFocus={() => setOpen(r.day)}
              onPointerUp={(e) => {
                if (e.pointerType === "mouse") { if (r.href) router.push(r.href); return; }
                if (isOpen && r.href) router.push(r.href); else setOpen(r.day);
              }}
              onKeyDown={(e) => { if (e.key === "Enter" && r.href) router.push(r.href); }}
            >
              <div className="stack" style={{ height: `${(100 * r.total) / max}%` }}>
                {last && r.total > 0 && <span className="cv">{compact(r.total)}</span>}
                {[...segs].reverse().map((x) => <i key={x.key} style={{ flexGrow: r.parts[x.key], background: x.color }} />)}
              </div>
              <span className="cl">{i % every === (rows.length - 1) % every ? r.label : ""}</span>
              {isOpen && (
                <div className={`tip ${side}`} role="tooltip">
                  <b>{r.tipTitle ?? r.label}</b>
                  {series.map((x) => (
                    <span key={x.key} className="tr"><i style={{ background: x.color }} />{x.label}<em>{fmt(r.parts[x.key] ?? 0)}</em></span>
                  ))}
                  {showSum && series.length > 1 && <span className="tr sum">{sumLabel}<em>{fmt(r.total)}</em></span>}
                  {r.href && <a href={r.href} className="tl" onPointerUp={(e) => e.stopPropagation()}>Firmen ansehen <Icon name="weiter" size={14} /></a>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function Legend({ series }: { series: Series[] }) {
  if (series.length < 2) return null;
  return <div className="legend">{series.map((s) => <span key={s.key}><i style={{ background: s.color }} />{s.label}</span>)}</div>;
}

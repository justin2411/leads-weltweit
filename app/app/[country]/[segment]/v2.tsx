/**
 * Bausteine der Landingpage im Design der Lead-PDF (Inhaber 02.10.2026). Symbole wie in der PDF-Vorlage (Linien, 24er Raster).
 */
import type { CSSProperties, ReactNode } from "react";
import { Icon as LineIcon } from "@/app/icons";

const PATHS: Record<string, string> = {
  phone: "M5 4h4l2 5-2.5 1.5a11 11 0 005 5L15 13l5 2v4a2 2 0 01-2 2A16 16 0 013 6a2 2 0 012-2",
  mail: "M3 5h18v14H3zM3 7l9 6 9-6",
  pin: "M12 21s7-6.2 7-11.5A7 7 0 005 9.5C5 14.8 12 21 12 21zM12 7a2.5 2.5 0 110 5 2.5 2.5 0 010-5",
  bulb: "M9 18h6M10 21h4M12 3a6 6 0 00-3.5 10.9c.6.5 1 1.2 1 2.1h5c0-.9.4-1.6 1-2.1A6 6 0 0012 3z",
  user: "M12 4a4 4 0 110 8 4 4 0 010-8zM4 21a8 8 0 0116 0",
  globe: "M12 3a9 9 0 110 18 9 9 0 010-18zM3 12h18M12 3a14 14 0 010 18M12 3a14 14 0 000 18",
  social: "M18 3a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM6 9.5a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM18 16a2.5 2.5 0 110 5 2.5 2.5 0 010-5zM8.2 10.8l7.6-4.4M8.2 13.2l7.6 4.4",
  check: "M20 6L9 17l-5-5",
  x: "M18 6L6 18M6 6l12 12",
  cal: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4",
  target: "M12 3a9 9 0 110 18 9 9 0 010-18zM12 7a5 5 0 110 10 5 5 0 010-10zM12 11a1 1 0 110 2 1 1 0 010-2",
  bolt: "M13 2L4 14h7l-1 8 9-12h-7z",
  lock: "M5 11h14v10H5zM8 11V7a4 4 0 018 0v4",
  focus: "M4 8V4h4M16 4h4v4M20 16v4h-4M8 20H4v-4M12 9a3 3 0 110 6 3 3 0 010-6",
  shop: "M4 7h16l-1 13H5zM9 7a3 3 0 016 0",
  nosite: "M12 3a9 9 0 110 18 9 9 0 010-18zM5.6 5.6l12.8 12.8",
  insecure: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM12 9v4M12 16v.5",
  outdated: "M3 5h18v12H3zM8 21h8M12 17v4",
  spark: "M13 2L4 14h7l-1 8 9-12h-7z",
  doc: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h7",
  table: "M3 5h18v14H3zM3 10h18M3 15h18M9 5v14",
  chat: "M4 5h16v11H9l-5 4zM8 9h8M8 12h5",
  landmark: "M3 21h18M5 21V10m4 11V10m6 11V10m4 11V10M2 10l10-6 10 6z",
  shieldcheck: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6zM9 12l2 2 4-4",
  ban: "M12 3a9 9 0 110 18 9 9 0 010-18zM5.6 5.6l12.8 12.8",
  gift: "M4 10h16v10H4zM3 7h18v3H3zM12 7v13M12 7c-1.5-3-5-3-5-1s5 1 5 1zm0 0c1.5-3 5-3 5-1s-5 1-5 1z",
  building: "M4 21V5l8-2v18M12 7l8 2v12M7 8h2M7 12h2M7 16h2M15 12h2M15 16h2M2 21h20",
  play: "M8 5l11 7-11 7z",
  trend: "M3 17l6-6 4 4 8-8M15 7h6v6",
  calc: "M6 3h12v18H6zM9 7h6M9 11h.01M12 11h.01M15 11h.01M9 15h.01M12 15h.01M15 15h.01",
  shield: "M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z",
  users: "M9 4a4 4 0 110 8 4 4 0 010-8zM2 21a7 7 0 0114 0M16 4a4 4 0 010 8M18 14a6 6 0 014 7",
  plus: "M12 5v14M5 12h14",
  arrow: "M5 12h14M13 6l6 6-6 6",

  star: "M12 3l2.6 5.6 6 .7-4.5 4.1 1.2 6L12 16.5 6.7 19.4l1.2-6L3.4 9.3l6-.7z",
};

export function Icon({ name, className = "ic" }: { name: string; className?: string }) {
  return <svg className={className} viewBox="0 0 24 24" aria-hidden="true"><path d={PATHS[name] ?? PATHS.check} /></svg>;
}

export type MapData = {
  viewBox: string; land: string; borders: string; neighbors: string; pins: [number, number][];
  /** Ausschnitt (gleiches Seitenverhältnis wie viewBox): Land größer, Karte gleich groß (Inhaber 03.10.2026, UK) */
  crop?: string;
  /** Kartenumriss als statische SVG-Datei (statt land/borders/neighbors im HTML) */
  src?: string;
  stats: { leads: number; areas: number; industries: number; date: string; presence: Record<string, number>; kinds: Record<string, number> };
};

/** Pins bleiben bei einem Ausschnitt gleich groß wie auf der ganzen Karte. */
function pinScale(map: MapData): number {
  if (!map.crop) return 1;
  return Number(map.crop.split(/\s+/)[2]) / Number(map.viewBox.split(/\s+/)[2]);
}

/** Landkarte der Probe, Pins wie in der PDF (Navy mit Goldrand). */
export function MapCard({ map, note }: { map: MapData; note: string }) {
  return (
    <figure className="mapcard" style={{ margin: 0 }}>
      <svg viewBox={map.crop ?? map.viewBox} role="img" aria-label={note}>
        {map.src ? (() => {
          const [x, y, w, h] = map.viewBox.split(/\s+/).map(Number);
          return <image href={map.src} x={x} y={y} width={w} height={h} />;
        })() : <>
          {map.neighbors && <path className="nb" d={map.neighbors} />}
          <path className="land" d={map.land} /><path className="borders" d={map.borders} />
        </>}
        {map.pins.map(([x, y], k) => (
          // Position außen, Animation innen: sonst überschreibt die CSS-Animation das translate (alle Pins oben links)
          <g key={k} transform={`translate(${x},${y}) scale(${pinScale(map)})`}>
            <g className="pin" style={{ "--k": k } as CSSProperties}>
              <circle r="30" className="halo" /><circle r="19" className="dot" />
              <text className="num" textAnchor="middle" dominantBaseline="central">{k + 1}</text>
            </g>
          </g>))}
      </svg>
      <figcaption className="note"><Icon name="pin" />{note}</figcaption>
    </figure>
  );
}

/** Punktgrafik „Reachable – but no website“ aus der Probe (ein Punkt = ein Lead). */
export function Presence({ title, note, rows, total, opening }: {
  title: string; note: string; rows: { key: string; icon: string; label: string; n: number; gap?: boolean }[]; total: number; opening: string;
}) {
  return (
    <div className="box">
      <h3>{title}</h3><p className="small">{note}</p>
      {rows.map((r) => (
        <div className={`prow${r.gap ? " gap" : ""}`} key={r.key}>
          <span className="lbl"><Icon name={r.icon} />{r.label}</span>
          <span className="dots" aria-hidden="true">{Array.from({ length: total }, (_, k) => <i key={k} style={k < r.n ? undefined : { background: "transparent", border: "1.6px solid currentColor" }} />)}</span>
          <span className="n"><LineIcon name={r.gap ? "fehler" : "ok"} size={14} /> {r.n}/{total}</span>
        </div>))}
      <p className="opening"><Icon name="spark" />{opening}</p>
    </div>
  );
}

export function Field({ icon, label, children }: { icon: string; label: string; children: ReactNode }) {
  return <div className="cf"><span className="ci"><Icon name={icon} /></span><span><em>{label}</em><b>{children}</b></span></div>;
}

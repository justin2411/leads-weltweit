"use client";
/**
 * Säulen-Reihe zum Verschieben (Inhaber 04.10.2026: „gib jedem seinen platz den er braucht sodass man auch nach rechts
 * klicken kann und es dann verschiebt“): jede Säule feste Breite, Pfeile links/rechts erscheinen nur, wenn es dort weitergeht.
 */
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { Icon } from "@/app/icons";

export function TankScroller({ className, children, style }: { className: string; children: ReactNode; style?: CSSProperties }) {
  const row = useRef<HTMLDivElement>(null);
  const [edge, setEdge] = useState({ l: false, r: false });
  useEffect(() => {
    const el = row.current;
    if (!el) return;
    const upd = () => setEdge({ l: el.scrollLeft > 4, r: el.scrollLeft + el.clientWidth < el.scrollWidth - 4 });
    upd();
    el.addEventListener("scroll", upd, { passive: true });
    const ro = new ResizeObserver(upd);
    ro.observe(el);
    return () => { el.removeEventListener("scroll", upd); ro.disconnect(); };
  }, []);
  const go = (dir: 1 | -1) => { const el = row.current; if (el) el.scrollBy({ left: dir * Math.max(el.clientWidth * 0.8, 160), behavior: "smooth" }); };
  return (
    <div className="tk-scroll">
      <div ref={row} className={className} style={style}>{children}</div>
      {edge.l && <button type="button" className="tk-arrow l" onClick={() => go(-1)} aria-label="nach links"><Icon name="weiter" size={18} /></button>}
      {edge.r && <button type="button" className="tk-arrow r" onClick={() => go(1)} aria-label="nach rechts"><Icon name="weiter" size={18} /></button>}
    </div>
  );
}

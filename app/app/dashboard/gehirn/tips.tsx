"use client";

import { createContext, useCallback, useContext, useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Kleine Info-Karten für die Gehirn-Seite (Inhaber 04.10.2026: „wenig text“ – Namen, Schritte und Zahlen erst bei
 * Hover/Tippen). Maus: beim Überfahren; Finger/Tastatur: Tippen bzw. Enter öffnet, nochmal Tippen, Tippen daneben oder
 * Esc schließt. Die Karte liegt direkt in .dash (fixiert, im Fenster gehalten), damit sie nie abgeschnitten wird und
 * auf dem Handy kein seitliches Scrollen erzeugt – auch über kreisenden Satelliten (Umlauf hält bei offener Karte an).
 */
type Open = { id: string; el: HTMLElement; node: ReactNode; pinned: boolean };
type Ctx = { cur: Open | null; show: (o: Open) => void; hide: (id: string, force?: boolean) => void };
const TipCtx = createContext<Ctx | null>(null);

export function TipHost({ children }: { children: ReactNode }) {
  const [cur, setCur] = useState<Open | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number; below: boolean } | null>(null);

  const show = useCallback((o: Open) => setCur(o), []);
  const hide = useCallback((id: string, force = false) => setCur((c) => (c && c.id === id && (force || !c.pinned) ? null : c)), []);

  const place = useCallback(() => {
    if (!cur || !card.current) return;
    const r = cur.el.getBoundingClientRect();
    const w = card.current.offsetWidth, h = card.current.offsetHeight, vw = window.innerWidth, vh = window.innerHeight, m = 8;
    const below = r.top - h - m < m && r.bottom + h + m <= vh;
    const top = below ? r.bottom + m : Math.max(m, r.top - h - m);
    const left = Math.min(Math.max(m, r.left + r.width / 2 - w / 2), Math.max(m, vw - w - m));
    setPos({ left, top, below });
  }, [cur]);

  useLayoutEffect(() => {
    setPos(null);
    if (cur) place();
  }, [cur, place]);

  useEffect(() => {
    if (!cur) return;
    const onDown = (e: PointerEvent) => {
      const t = e.target as Node;
      if (card.current?.contains(t) || cur.el.contains(t)) return;
      setCur(null);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setCur(null);
    };
    const onMove = () => requestAnimationFrame(place);
    document.addEventListener("pointerdown", onDown, true);
    document.addEventListener("keydown", onKey);
    window.addEventListener("scroll", onMove, true);
    window.addEventListener("resize", onMove);
    return () => {
      document.removeEventListener("pointerdown", onDown, true);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("scroll", onMove, true);
      window.removeEventListener("resize", onMove);
    };
  }, [cur, place]);

  return (
    <TipCtx.Provider value={{ cur, show, hide }}>
      {children}
      {cur && typeof document !== "undefined" && createPortal(
        <div ref={card} role="tooltip" id={`${cur.id}-tip`} className={`gh-poplayer ${pos?.below ? "below" : ""}`}
          style={pos ? { left: pos.left, top: pos.top } : { left: -9999, top: 0, visibility: "hidden" }}
          onPointerLeave={(e) => { if (e.pointerType === "mouse") hide(cur.id); }}>
          {cur.node}
        </div>,
        document.querySelector(".dash") ?? document.body,
      )}
    </TipCtx.Provider>
  );
}

/** Auslöser einer Info-Karte (Button). `tip` = Inhalt der Karte, `label` = Vorlesetext. */
export function Tip({ tip, children, className = "", label, style }: {
  tip: ReactNode; children: ReactNode; className?: string; label: string; style?: CSSProperties;
}) {
  const ctx = useContext(TipCtx);
  const id = `tip${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const ref = useRef<HTMLButtonElement>(null);
  const active = ctx?.cur?.id === id;
  const open = (pinned: boolean) => ref.current && ctx?.show({ id, el: ref.current, node: tip, pinned });
  return (
    <button ref={ref} type="button" className={`gh-tipbtn ${className} ${active ? "is-open" : ""}`} style={style} aria-label={label}
      aria-expanded={active} aria-describedby={active ? `${id}-tip` : undefined}
      onPointerEnter={(e) => { if (e.pointerType === "mouse" && !(active && ctx?.cur?.pinned)) open(false); }}
      onPointerLeave={(e) => {
        if (e.pointerType !== "mouse") return;
        // zur Karte wechseln erlaubt: kurz warten, ob die Maus dort ankommt
        window.setTimeout(() => { if (!document.querySelector(".gh-poplayer:hover")) ctx?.hide(id); }, 120);
      }}
      onClick={() => (active && ctx?.cur?.pinned ? ctx?.hide(id, true) : open(true))}
      onKeyDown={(e) => { if (e.key === "Escape") ctx?.hide(id, true); }}>
      {children}
    </button>
  );
}

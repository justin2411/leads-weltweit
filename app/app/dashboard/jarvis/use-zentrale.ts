"use client";

/**
 * Live-Daten der Zentrale (ersetzt AutoRefresh/LivePoll auf JARVIS): schnell alle 10 s, langsam alle 60 s, nur bei
 * sichtbarem Tab; Tab wieder sichtbar → sofort ein Abruf. Fehler: Pause 20 → 40 → 60 s. Die Abschalt-Wahl teilt sich
 * mit AutoRefresh („dash-auto-refresh“ im Browser, try/catch). Nach Server-Aktionen: `jetzt()` ruft sofort ab.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { Langsam, Schnell, ZentraleDaten } from "@/lib/zentrale-typen";

const KEY = "dash-auto-refresh";
const SCHNELL_MS = 10_000;
const LANGSAM_MS = 60_000;
const BACKOFF = [20_000, 40_000, 60_000];

export type ZentraleState = { schnell: Schnell | null; langsam: Langsam | null; abruf: string; ok: boolean; jetzt: () => void };

function autoAn(): boolean {
  try {
    return localStorage.getItem(KEY) !== "off";
  } catch {
    return true;
  }
}

export function useZentrale(initial: ZentraleDaten): ZentraleState {
  const [schnell, setSchnell] = useState<Schnell | null>(initial.schnell);
  const [langsam, setLangsam] = useState<Langsam | null>(initial.langsam);
  const [abruf, setAbruf] = useState(initial.abruf);
  const [ok, setOk] = useState(true);
  const fehler = useRef(0);
  const timer = useRef<{ s?: ReturnType<typeof setTimeout>; l?: ReturnType<typeof setTimeout> }>({});

  const hole = useCallback(async (teil: "schnell" | "langsam"): Promise<boolean> => {
    try {
      const r = await fetch(`/api/jarvis/zentrale?teil=${teil}`, { cache: "no-store", credentials: "same-origin" });
      if (!r.ok) throw new Error(String(r.status));
      const d = (await r.json()) as ZentraleDaten;
      if (teil === "schnell" && d.schnell) setSchnell(d.schnell);
      if (teil === "langsam" && d.langsam) setLangsam(d.langsam);
      if (teil === "schnell" && !d.schnell) throw new Error("leer");
      setAbruf(d.abruf);
      fehler.current = 0;
      setOk(true);
      return true;
    } catch {
      fehler.current += 1;
      setOk(false);
      return false;
    }
  }, []);

  const plane = useCallback((teil: "schnell" | "langsam", ms: number) => {
    clearTimeout(timer.current[teil === "schnell" ? "s" : "l"]);
    const t = setTimeout(async () => {
      if (document.visibilityState !== "visible" || !autoAn()) return plane(teil, ms);
      const gut = await hole(teil);
      plane(teil, gut ? ms : BACKOFF[Math.min(BACKOFF.length - 1, fehler.current - 1)] ?? ms);
    }, ms);
    if (teil === "schnell") timer.current.s = t; else timer.current.l = t;
  }, [hole]);

  const jetzt = useCallback(() => { void hole("schnell"); }, [hole]);

  useEffect(() => {
    plane("schnell", SCHNELL_MS);
    plane("langsam", LANGSAM_MS);
    const vis = () => { if (document.visibilityState === "visible" && autoAn()) { void hole("schnell"); } };
    document.addEventListener("visibilitychange", vis);
    const t = timer.current;
    return () => { clearTimeout(t.s); clearTimeout(t.l); document.removeEventListener("visibilitychange", vis); };
  }, [plane, hole]);

  // Server-Komponenten liefern nach router.refresh() neue Startdaten → übernehmen
  useEffect(() => { if (initial.schnell) setSchnell(initial.schnell); if (initial.langsam) setLangsam(initial.langsam); setAbruf(initial.abruf); }, [initial]);

  return { schnell, langsam, abruf, ok, jetzt };
}

/** Pausiert SVG-Animationen (svg.pauseAnimations) und CSS (.jv-paused), solange der Tab versteckt ist. */
export function usePauseHidden(root: React.RefObject<HTMLElement | null>) {
  useEffect(() => {
    const f = () => {
      const el = root.current;
      if (!el) return;
      const hidden = document.hidden;
      el.classList.toggle("jv-paused", hidden);
      for (const s of el.querySelectorAll("svg")) {
        try { if (hidden) (s as SVGSVGElement).pauseAnimations(); else (s as SVGSVGElement).unpauseAnimations(); } catch { /* alte Browser */ }
      }
    };
    document.addEventListener("visibilitychange", f);
    return () => document.removeEventListener("visibilitychange", f);
  }, [root]);
}

/** Bewegung reduzieren (Systemeinstellung)? Erst im Browser bekannt; Server rendert ohne Partikel-Unterschied. */
export function useWenigBewegung(): boolean {
  const [r, setR] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(prefers-reduced-motion: reduce)");
    setR(m.matches);
    const f = () => setR(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return r;
}

/** Handy-Breite (< 760 px) für Partikel-Grenzen und kompakte Darstellung. */
export function useHandy(): boolean {
  const [h, setH] = useState(false);
  useEffect(() => {
    const m = window.matchMedia("(max-width: 759px)");
    setH(m.matches);
    const f = () => setH(m.matches);
    m.addEventListener("change", f);
    return () => m.removeEventListener("change", f);
  }, []);
  return h;
}

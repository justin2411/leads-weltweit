"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const KEY = "dash-auto-refresh";

/** Lädt die Daten alle 30 s ohne Neuladen der Seite nach (router.refresh, Live-Anzeigen der Werke), solange der Tab sichtbar ist (abschaltbar, Wahl bleibt im Browser). */
export function AutoRefresh() {
  const router = useRouter();
  const [on, setOn] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(KEY) === "off") setOn(false);
    } catch {}
  }, []);

  useEffect(() => {
    if (!on) return;
    const id = setInterval(() => {
      // nicht mitten im Ziehen eines Hinweises auf einen Agenten (JARVIS) neu laden
      if (document.visibilityState === "visible" && !document.documentElement.classList.contains("jv-dragging")) router.refresh();
    }, 30_000);
    const onVis = () => document.visibilityState === "visible" && router.refresh();
    document.addEventListener("visibilitychange", onVis);
    return () => {
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [on, router]);

  return (
    <button
      type="button"
      className="ib"
      aria-label={on ? "Auto-Aktualisierung an" : "Auto-Aktualisierung aus"}
      title={on ? "Automatisch aktualisieren (an, alle 30 s)" : "Automatisch aktualisieren (aus)"}
      style={on ? undefined : { opacity: 0.5 }}
      onClick={() => {
        const next = !on;
        setOn(next);
        try {
          localStorage.setItem(KEY, next ? "on" : "off");
        } catch {}
      }}
    >
      <svg viewBox="0 0 24 24" width="19" height="19" aria-hidden fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20 12a8 8 0 1 1-2.34-5.66" />
        <path d="M20 4v5h-5" />
      </svg>
    </button>
  );
}

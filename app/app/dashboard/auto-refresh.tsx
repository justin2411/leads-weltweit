"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

const KEY = "dash-auto-refresh";

/** Lädt die Übersicht alle 60 s neu, solange der Tab sichtbar ist (abschaltbar, Wahl bleibt im Browser). */
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
      if (document.visibilityState === "visible") router.refresh();
    }, 60_000);
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
      title={on ? "Aktualisiert alle 60 s – klicken zum Ausschalten" : "Auto-Aktualisierung aus – klicken zum Einschalten"}
      style={on ? undefined : { opacity: 0.5 }}
      onClick={() => {
        const next = !on;
        setOn(next);
        try {
          localStorage.setItem(KEY, next ? "on" : "off");
        } catch {}
      }}
    >
      ⟳
    </button>
  );
}

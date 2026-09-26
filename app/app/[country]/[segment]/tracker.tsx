"use client";

import { useEffect } from "react";

/** Zählt Aufruf und Klicks ohne Cookies und ohne IP (nur Variante + Ereignistyp). */
export function Tracker({ variantId, enabled }: { variantId: string; enabled: boolean }) {
  useEffect(() => {
    if (!enabled) return;
    const send = (type: string) => {
      const body = JSON.stringify({ variant_id: variantId, type });
      if (!navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) {
        fetch("/api/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true, credentials: "omit" });
      }
    };
    send("view");
    const onClick = (e: MouseEvent) => {
      if ((e.target as HTMLElement)?.closest?.("[data-cta]")) send("cta_click");
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [variantId, enabled]);
  return null;
}

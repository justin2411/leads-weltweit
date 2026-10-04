"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Live-Anzeige (Inhaber 04.10.2026: „das dashboard soll es auch zeigen es soll live sein“): solange Aufträge offen oder
 * in Arbeit sind, lädt die Seite alle 10 s still nach (router.refresh, nur bei sichtbarem Tab) – zusätzlich zur
 * normalen Auto-Aktualisierung (30 s). Kein externer Dienst, keine Kosten.
 */
export function LivePoll({ active, ms = 10_000 }: { active: boolean; ms?: number }) {
  const router = useRouter();
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => { if (document.visibilityState === "visible") router.refresh(); }, ms);
    return () => clearInterval(id);
  }, [active, ms, router]);
  return null;
}

"use client";

import { useEffect } from "react";
import { depthBucket, deviceOf, refHost, refKey, sourceOf, type HitStage } from "@/lib/website-stats";

/** Zufällige ID nur für diesen einen Seitenaufruf (nicht im Browser gespeichert, kein Cookie). */
export function viewId(): string {
  try {
    if (crypto.randomUUID) return crypto.randomUUID();
    const b = crypto.getRandomValues(new Uint8Array(16));
    b[6] = (b[6] & 0x0f) | 0x40; b[8] = (b[8] & 0x3f) | 0x80;
    const h = [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  } catch {
    return "";
  }
}

/** Ereignis an /api/events (sendBeacon, sonst fetch mit keepalive); das Login-Cookie des Inhabers geht mit (same-origin). */
export function beacon(data: Record<string, unknown>) {
  const body = JSON.stringify(data);
  try {
    if (navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) return;
  } catch {
    /* Fallback unten */
  }
  fetch("/api/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true, credentials: "same-origin" }).catch(() => {});
}

/** Herkunft dieses Aufrufs: Art (Mail/Direkt/Suche/andere) und Domain bzw. utm_source, nie Pfad oder Parameter. */
export function origin(): { src: ReturnType<typeof sourceOf>; ref: string | null } {
  const q = new URLSearchParams(location.search);
  const host = refHost(document.referrer);
  return { src: sourceOf(q.get("src"), host, location.host), ref: refKey(q.get("utm_source"), host, location.host) };
}

/**
 * Website-Trichter (Inhaber 04.10.2026): Aufruf von Startseite, Tarif oder Danke-Seite. Sendet Stufe, Gerät (grob aus
 * Bildschirmbreite/Touch) und Herkunft; beim Verlassen bzw. Wegschalten die sichtbaren Sekunden und die Scrolltiefe
 * (Stufen 25 %). Ohne Cookies, ohne Speicher im Browser; den Tages-Besucher-Hash bildet der Server (lib/web-hits.ts).
 * Vorschau (?vorschau=1) und automatisierte Browser senden nichts.
 */
export function HitBeacon({ stage, variantId = null, enabled = true }: { stage: HitStage; variantId?: string | null; enabled?: boolean }) {
  useEffect(() => {
    if (!enabled || navigator.webdriver) return;
    try {
      if (new URLSearchParams(location.search).get("vorschau") === "1") return;
    } catch {
      return;
    }
    const pv = viewId();
    if (!pv) return;
    const { src, ref } = origin();
    const dev = deviceOf(window.innerWidth, window.matchMedia?.("(pointer:coarse)").matches ?? false);
    beacon({ type: "hit", st: stage, pv, dev, src, ref, ...(variantId ? { variant_id: variantId } : {}) });

    const doc = document.documentElement;
    let depth: 0 | 25 | 50 | 75 | 100 = 0;
    const onScroll = () => {
      const d = depthBucket(window.scrollY + window.innerHeight, Math.max(doc.scrollHeight, 1));
      if (d > depth) depth = d;
    };
    onScroll();
    let visibleMs = 0;
    let since: number | null = document.visibilityState === "visible" ? performance.now() : null;
    let sentEnd = false;
    const end = () => {
      if (since !== null) { visibleMs += performance.now() - since; since = null; }
      onScroll();
      beacon({ type: "hit_end", pv, ds: Math.min(1800, Math.round(visibleMs / 1000)), depth });
      sentEnd = true;
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") end();
      else since = performance.now();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", end);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", end);
      if (!sentEnd) end();
    };
  }, [stage, variantId, enabled]);
  return null;
}

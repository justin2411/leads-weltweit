"use client";

import { useEffect } from "react";
import { bin2, cleanLabel, depthBucket, deviceOf, dwellBucket, refHost, sourceOf, subjectOf, type ElKind } from "@/lib/website-stats";

const MAX_CLICKS = 30;

/** Zufällige ID nur für diesen einen Seitenaufruf (nicht gespeichert im Browser, kein Cookie). */
function viewId(): string {
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

/** Art des angeklickten Elements; Formularfelder nur als „feld“ ohne Inhalt. */
function elementOf(t: Element | null): { el: ElKind; node: Element | null } {
  if (!t) return { el: "flaeche", node: null };
  const field = t.closest("input,textarea,select,[contenteditable]");
  if (field) return { el: "feld", node: null };
  const cta = t.closest("[data-cta]");
  if (cta) return { el: "cta", node: cta };
  const faq = t.closest("summary");
  if (faq) return { el: "faq", node: faq };
  const video = t.closest("video");
  if (video) return { el: "video", node: null };
  const btn = t.closest("button,[role=button]");
  if (btn) return { el: "button", node: btn };
  const a = t.closest("a");
  if (a) return { el: "link", node: a };
  return { el: "flaeche", node: null };
}

/**
 * Anonyme Messung der Landingpage (Datenschutz Abschnitt 5): Aufruf mit Herkunftsart (Mail/Direkt/Suche/andere, nur
 * aus ?src= bzw. der Referrer-Domain), Gerät, größte Scrolltiefe, Verweildauer-Stufe und ungefähre Klickposition mit
 * Knopf-/Link-Beschriftung. Ohne Cookies, ohne Speicher im Browser, ohne IP, ohne Formulareingaben.
 */
export function Tracker({ variantId, enabled }: { variantId: string; enabled: boolean }) {
  useEffect(() => {
    if (!enabled || navigator.webdriver) return;
    const pv = viewId();
    if (!pv) return;
    const send = (data: Record<string, unknown>) => {
      const body = JSON.stringify({ variant_id: variantId, pv, ...data });
      try {
        if (navigator.sendBeacon?.("/api/events", new Blob([body], { type: "application/json" }))) return;
      } catch {
        /* Fallback unten */
      }
      fetch("/api/events", { method: "POST", body, headers: { "Content-Type": "application/json" }, keepalive: true, credentials: "omit" }).catch(() => {});
    };
    const q = new URLSearchParams(location.search);
    const src = sourceOf(q.get("src"), refHost(document.referrer), location.host);
    const dev = deviceOf(window.innerWidth, window.matchMedia?.("(pointer:coarse)").matches ?? false);
    send({ type: "view", src, sv: src === "mail" ? subjectOf(q.get("sv")) : null, dev });

    const doc = document.documentElement;
    let depth: 0 | 25 | 50 | 75 | 100 = 0;
    const onScroll = () => {
      const d = depthBucket(window.scrollY + window.innerHeight, Math.max(doc.scrollHeight, 1));
      if (d > depth) depth = d;
    };
    onScroll();
    let clicks = 0;
    const onClick = (e: MouseEvent) => {
      if (clicks >= MAX_CLICKS) return;
      clicks++;
      const { el, node } = elementOf(e.target instanceof Element ? e.target : null);
      const label = node ? cleanLabel(node.getAttribute("data-track") || node.getAttribute("aria-label") || node.textContent) : null;
      send({ type: "click", dev, el, label, cta: el === "cta", x: bin2(e.pageX, Math.max(doc.scrollWidth, 1)), y: bin2(e.pageY, Math.max(doc.scrollHeight, 1)) });
    };
    let visibleMs = 0;
    let since: number | null = document.visibilityState === "visible" ? performance.now() : null;
    let sentEnd = false;
    const end = () => {
      if (since !== null) { visibleMs += performance.now() - since; since = null; }
      onScroll();
      send({ type: "end", depth, dwell: dwellBucket(visibleMs) });
      sentEnd = true;
    };
    const onVis = () => {
      if (document.visibilityState === "hidden") end();
      else since = performance.now();
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("click", onClick, true);
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("pagehide", end);
    return () => {
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("pagehide", end);
      if (!sentEnd) end();
    };
  }, [variantId, enabled]);
  return null;
}

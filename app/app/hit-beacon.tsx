"use client";

import { useEffect } from "react";
import { depthBucket, deviceOf, refHost, refKey, sourceOf, utmKey, type EvKind, type EvStage, type HitStage } from "@/lib/website-stats";

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
export function origin(): { src: ReturnType<typeof sourceOf>; ref: string | null; um: string | null; uc: string | null } {
  const q = new URLSearchParams(location.search);
  const host = refHost(document.referrer);
  return { src: sourceOf(q.get("src"), host, location.host), ref: refKey(q.get("utm_source"), host, location.host),
           um: utmKey(q.get("utm_medium")), uc: utmKey(q.get("utm_campaign")) };
}

const isPreview = () => {
  try {
    return new URLSearchParams(location.search).get("vorschau") === "1";
  } catch {
    return true;
  }
};

/**
 * Zusätzliche Messwerte eines Seitenaufrufs (Inhaber 04.10.2026: „mehr daten … wie google analytics“), alle ohne
 * Kennung und ohne Speicher im Browser: CTA-Klicks, Formular begonnen/abgeschickt, Erklärvideo gestartet/zu Ende und
 * die Core Web Vitals (LCP, INP, CLS) dieses Besuchs. pv dient nur der Missbrauchsbremse auf dem Server.
 */
export function useSignals(stage: EvStage, variantId: string | null, enabled: boolean, pvIn?: string) {
  useEffect(() => {
    if (!enabled || navigator.webdriver || isPreview()) return;
    const pv = pvIn || viewId();
    if (!pv) return;
    const base = { st: stage, pv, ...(variantId ? { variant_id: variantId } : {}) };
    let sent = 0;
    const once = new Set<string>();
    const ev = (k: EvKind, key: string = k) => {
      if (sent >= 12 || (k !== "cta" && once.has(key))) return;
      once.add(key);
      sent++;
      beacon({ type: "ev", k, ...base });
    };
    const onClick = (e: MouseEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (t?.closest("[data-cta],a[href='#sample'],.hp-btn--gold")) ev("cta");
    };
    const forms = stage === "start" || stage === "landing";
    const formKey = (el: Element | null) => {
      const f = el?.closest("form");
      return f ? String([...document.forms].indexOf(f)) : null;
    };
    const onFocus = (e: FocusEvent) => {
      const t = e.target instanceof Element ? e.target : null;
      if (!forms || !t?.matches("input,textarea,select")) return;
      const k = formKey(t);
      if (k !== null) ev("form_start", `fs${k}`);
    };
    const onSubmit = (e: SubmitEvent) => {
      const k = forms && e.target instanceof HTMLFormElement ? String([...document.forms].indexOf(e.target)) : null;
      if (k !== null) ev("form_submit", `fd${k}`);
    };
    const vids = new WeakMap<EventTarget, number>();
    let vidN = 0;
    const vidKey = (t: EventTarget | null) => {
      if (!t) return "v";
      if (!vids.has(t)) vids.set(t, vidN++);
      return `v${vids.get(t)}`;
    };
    const onPlay = (e: Event) => { if (e.target instanceof HTMLVideoElement) ev("video_start", `${vidKey(e.target)}s`); };
    const onEnded = (e: Event) => { if (e.target instanceof HTMLVideoElement) ev("video_done", `${vidKey(e.target)}e`); };

    // Core Web Vitals (Messwerte ohne Kennung): LCP = letzter Kandidat, CLS = Summe der Verschiebungen ohne Eingabe,
    // INP = längste Interaktion (bei wenigen Interaktionen gleich dem INP)
    let lcp: number | null = null, inp: number | null = null, cls = 0, clsSeen = false;
    const obs: PerformanceObserver[] = [];
    const watch = (type: string, cb: (es: PerformanceEntryList) => void, extra: Record<string, unknown> = {}) => {
      try {
        const o = new PerformanceObserver((l) => cb(l.getEntries()));
        o.observe({ type, buffered: true, ...extra } as PerformanceObserverInit);
        obs.push(o);
      } catch {
        /* Browser kennt den Typ nicht */
      }
    };
    watch("largest-contentful-paint", (es) => { const x = es[es.length - 1]; if (x) lcp = x.startTime; });
    watch("layout-shift", (es) => { for (const x of es as unknown as { value: number; hadRecentInput: boolean }[]) if (!x.hadRecentInput) { cls += x.value; clsSeen = true; } });
    watch("event", (es) => { for (const x of es as unknown as { duration: number; interactionId?: number }[]) if (x.interactionId) inp = Math.max(inp ?? 0, x.duration); }, { durationThreshold: 40 });
    let vitalsSent = false;
    const sendVitals = () => {
      if (vitalsSent || (lcp === null && inp === null && !clsSeen)) return;
      vitalsSent = true;
      const dev = deviceOf(window.innerWidth, window.matchMedia?.("(pointer:coarse)").matches ?? false);
      beacon({ type: "vitals", dev, lcp: lcp === null ? null : Math.round(lcp), inp: inp === null ? null : Math.round(inp),
                cls: clsSeen ? Math.round(cls * 1000) : 0, ...base });
    };
    const onHide = () => { if (document.visibilityState === "hidden") sendVitals(); };
    document.addEventListener("click", onClick, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("submit", onSubmit as EventListener, true);
    document.addEventListener("play", onPlay, true);
    document.addEventListener("ended", onEnded, true);
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", sendVitals);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("submit", onSubmit as EventListener, true);
      document.removeEventListener("play", onPlay, true);
      document.removeEventListener("ended", onEnded, true);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", sendVitals);
      for (const o of obs) o.disconnect();
      sendVitals();
    };
  }, [stage, variantId, enabled, pvIn]);
}

/** Nur die Zusatz-Messwerte (für die Landingpage, deren Aufruf der bestehende Tracker meldet). */
export function PageSignals({ stage, variantId = null, enabled = true }: { stage: EvStage; variantId?: string | null; enabled?: boolean }) {
  useSignals(stage, variantId, enabled);
  return null;
}

/**
 * Checkouts aus automatisierten Tests nicht zählen (Inhaber 05.10.2026: „12 Checkouts = Test“): steuert ein
 * Testwerkzeug den Browser (navigator.webdriver), bekommt jedes Formular an /api/checkout beim Absenden das
 * Kennzeichen auto=1; der Server speichert den Checkout dann nur als is_test (zusätzlich zur Prüfung des User-Agents).
 */
export function useAutomationFlag() {
  useEffect(() => {
    if (!navigator.webdriver) return;
    const onSubmit = (e: SubmitEvent) => {
      const f = e.target instanceof HTMLFormElement ? e.target : null;
      if (!f || !/\/api\/checkout$/.test(new URL(f.action, location.href).pathname) || f.querySelector("input[name=auto]")) return;
      const i = document.createElement("input");
      i.type = "hidden"; i.name = "auto"; i.value = "1";
      f.appendChild(i);
    };
    document.addEventListener("submit", onSubmit, true);
    return () => document.removeEventListener("submit", onSubmit, true);
  }, []);
}

/**
 * Website-Trichter (Inhaber 04.10.2026): Aufruf von Startseite, Tarif oder Danke-Seite. Sendet Stufe, Gerät (grob aus
 * Bildschirmbreite/Touch) und Herkunft; beim Verlassen bzw. Wegschalten die sichtbaren Sekunden und die Scrolltiefe
 * (Stufen 25 %). Ohne Cookies, ohne Speicher im Browser; den Tages-Besucher-Hash bildet der Server (lib/web-hits.ts).
 * Vorschau (?vorschau=1) und automatisierte Browser senden nichts.
 */
export function HitBeacon({ stage, variantId = null, enabled = true, ab, abFrom }: {
  stage: HitStage; variantId?: string | null; enabled?: boolean;
  /** A/B je Schritt (Tarifseite): Marke der gezeigten Variante und Klick aus der Probe-Mail („<test>.<A|B>“, keine Person) */
  ab?: string; abFrom?: string;
}) {
  useSignals(stage, variantId, enabled);
  useAutomationFlag();
  useEffect(() => {
    if (!enabled || navigator.webdriver) return;
    try {
      if (new URLSearchParams(location.search).get("vorschau") === "1") return;
    } catch {
      return;
    }
    const pv = viewId();
    if (!pv) return;
    const { src, ref, um, uc } = origin();
    const dev = deviceOf(window.innerWidth, window.matchMedia?.("(pointer:coarse)").matches ?? false);
    beacon({ type: "hit", st: stage, pv, dev, src, ref, um, uc, ...(variantId ? { variant_id: variantId } : {}),
             ...(ab ? { ab } : {}), ...(abFrom ? { abc: abFrom } : {}) });

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
  }, [stage, variantId, enabled, ab, abFrom]);
  return null;
}

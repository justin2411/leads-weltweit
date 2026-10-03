"use client";

import { useEffect } from "react";

/**
 * Bewegung der Kontaktseite (Inhaber 03.10.2026): die vier Schritte der Ansprechpartner-Karte leuchten nacheinander auf,
 * der Goldrand der Formularkarte läuft wie auf der Startseite. Nur mit JavaScript und ohne reduzierte Bewegung
 * (auch nicht unter navigator.webdriver); ohne das bleibt alles ruhig und vollständig sichtbar.
 */
export function ContactFx() {
  useEffect(() => {
    const card = document.querySelector<HTMLElement>("[data-ct-card]");
    if (!card) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || navigator.webdriver) return;
    const page = card.closest(".hpz");
    const form = document.querySelector(".hp-formcard");
    const steps = [...card.querySelectorAll<HTMLElement>("[data-step]")];
    let i = 0;
    let visible = true;
    const set = () => {
      steps.forEach((s, k) => { s.classList.toggle("is-done", k < i); s.classList.toggle("is-on", k === i); });
      card.style.setProperty("--p", String(steps.length > 1 ? i / (steps.length - 1) : 1));
    };
    page?.classList.add("hp-motion");
    form?.classList.add("is-live");
    card.classList.add("is-anim");
    set();
    const io = new IntersectionObserver(([e]) => { visible = e.isIntersecting; }, { threshold: 0.2 });
    io.observe(card);
    const timer = setInterval(() => { if (!visible) return; i = (i + 1) % steps.length; set(); }, 2600);
    return () => {
      clearInterval(timer); io.disconnect();
      card.classList.remove("is-anim"); page?.classList.remove("hp-motion"); form?.classList.remove("is-live");
      steps.forEach((s) => s.classList.remove("is-done", "is-on"));
    };
  }, []);
  return null;
}

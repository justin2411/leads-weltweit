"use client";

import { useEffect, type RefObject } from "react";
import { FLASH_MS, ankerId, hashZiel, linkZiel, trifft } from "@/lib/anker";

/**
 * Sprung zu einem Abschnitt (Inhaber 04.10.2026: „oben draufklicken … automatisch öffnet sich die richtige sektion und
 * man wird dort hingesprungen“). Für jeden Abschnitt auf jeder Dashboard-Seite nutzbar:
 * – Links auf „#id“ (auch „/seite#id“) auf derselben Seite, Zurück/Vor (hashchange) und der Hash beim Laden;
 * – `open(el)` öffnet den Abschnitt (z. B. <details>), danach sanft hinscrollen und kurz aufleuchten (Klasse „anker-flash“).
 * Bei „Bewegung reduzieren“ ohne sanftes Scrollen; das Aufleuchten ist dann ein ruhiger Rahmen (hud-css.ts).
 */
export function useAnker(ref: RefObject<HTMLElement | null>, id: string, aliases: readonly string[] = [], open?: (el: HTMLElement) => void) {
  const aliasKey = aliases.join("|");
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const al = aliasKey ? aliasKey.split("|") : [];
    let timer = 0;
    const go = (smooth: boolean) => {
      open?.(el);
      const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => el.scrollIntoView({ behavior: smooth && !reduce ? "smooth" : "auto", block: "start" }));
      el.classList.remove("anker-flash");
      void el.offsetWidth; // Animation neu starten
      el.classList.add("anker-flash");
      window.clearTimeout(timer);
      timer = window.setTimeout(() => el.classList.remove("anker-flash"), FLASH_MS);
    };
    if (trifft(hashZiel(location.hash), id, al)) go(false);
    const onHash = () => {
      if (trifft(hashZiel(location.hash), id, al)) go(true);
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!a || !trifft(linkZiel(a.getAttribute("href"), location.pathname), id, al)) return;
      e.preventDefault();
      const hash = `#${ankerId(id)}`;
      if (location.hash !== hash) history.pushState(history.state, "", hash);
      go(true);
    };
    window.addEventListener("hashchange", onHash);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("hashchange", onHash);
      document.removeEventListener("click", onClick);
      window.clearTimeout(timer);
    };
    // open ist eine stabile Funktion je Abschnitt; Aliase über aliasKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ref, id, aliasKey]);
}

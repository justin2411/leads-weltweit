"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { useAnker } from "../use-anker";

/**
 * Auf-/zuklappbarer Abschnitt, der sich den Zustand dauerhaft im Browser merkt (localStorage „gh:fold:<id>“).
 * Beim ersten Laden setzt das Inline-Skript aus fold.tsx den Zustand schon vor dem ersten Zeichnen; bei Navigation
 * innerhalb des Dashboards übernimmt useLayoutEffect (ebenfalls vor dem Zeichnen). Gespeichert wird nur, was der
 * Inhaber selbst auf- oder zuklappt – der Standard bleibt sonst beweglich (z. B. Vorschläge offen, wenn etwas wartet).
 * Sprungziel (useAnker): Links auf „#<id>“ öffnen den Abschnitt, scrollen hin und lassen ihn kurz aufleuchten –
 * dieses Öffnen wird nicht gespeichert.
 */
export function FoldBox({ id, storeKey, open, className, summary, children, aliases }: {
  id: string; storeKey: string; open: boolean; className?: string; summary: ReactNode; children: ReactNode; aliases?: string[];
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const applied = useRef(open);
  useAnker(ref, id, aliases, (el) => {
    const d = el as HTMLDetailsElement;
    if (d.open) return;
    applied.current = true; // Öffnen per Sprung zählt nicht als gemerkter Klappzustand
    d.open = true;
  });

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      const v = localStorage.getItem(storeKey);
      if (v === "1" || v === "0") {
        applied.current = v === "1";
        if (el.open !== applied.current) el.open = applied.current;
        return;
      }
    } catch {}
    applied.current = el.open;
  }, [storeKey]);

  return (
    <details
      ref={ref}
      id={id}
      className={className}
      open={open}
      suppressHydrationWarning
      onToggle={(e) => {
        const now = e.currentTarget.open;
        if (now === applied.current) return;
        applied.current = now;
        try {
          localStorage.setItem(storeKey, now ? "1" : "0");
        } catch {}
      }}
    >
      {summary}
      {children}
    </details>
  );
}

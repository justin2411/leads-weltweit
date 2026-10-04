"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";

/**
 * Auf-/zuklappbarer Abschnitt, der sich den Zustand dauerhaft im Browser merkt (localStorage „gh:fold:<id>“).
 * Beim ersten Laden setzt das Inline-Skript aus fold.tsx den Zustand schon vor dem ersten Zeichnen; bei Navigation
 * innerhalb des Dashboards übernimmt useLayoutEffect (ebenfalls vor dem Zeichnen). Gespeichert wird nur, was der
 * Inhaber selbst auf- oder zuklappt – der Standard bleibt sonst beweglich (z. B. Entscheidungen offen, wenn etwas wartet).
 */
export function FoldBox({ id, storeKey, open, className, summary, children }: {
  id: string; storeKey: string; open: boolean; className?: string; summary: ReactNode; children: ReactNode;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const applied = useRef(open);

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

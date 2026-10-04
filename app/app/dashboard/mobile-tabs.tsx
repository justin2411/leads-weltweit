"use client";

/**
 * Reiter am Handy statt langer Liste (docs/DESIGN-KOMMANDOZENTRALE.md, Kontakte): ≤ 760 px zeigt eine Reiter-Leiste
 * (Wort + Zahl, ≥ 44 px) und nur die gewählte Spalte; darüber bleibt das bisherige Raster unverändert.
 * Reine Darstellung, kein Speicher. Die Kinder sind die Spalten in derselben Reihenfolge wie `tabs`.
 */
import { useState, type ReactNode } from "react";

export function MobileTabs({ tabs, className, label, children }: { tabs: { label: string; n: string }[]; className: string; label: string; children: ReactNode }) {
  const [i, setI] = useState(0);
  return (
    <>
      <div className="mtabs" role="tablist" aria-label={label}>
        {tabs.map((t, j) => (
          <button key={t.label} type="button" role="tab" aria-selected={i === j} className={i === j ? "on" : undefined} onClick={() => setI(j)}>
            <b>{t.n}</b><span>{t.label}</span>
          </button>
        ))}
      </div>
      <div className={`${className} mt-${i}`}>{children}</div>
    </>
  );
}

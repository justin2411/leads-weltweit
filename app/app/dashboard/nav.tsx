"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";

export const SECTIONS: [string, string, string][] = [
  ["/dashboard/jarvis", "JARVIS", "◎"],
  ["/dashboard", "Übersicht", "◉"],
  ["/dashboard/versand", "Versand", "✉"],
  ["/dashboard/kontakte", "Kontakte", "☰"],
  ["/dashboard/proben", "Proben", "◫"],
  ["/dashboard/bestand", "Bestand", "▤"],
  ["/dashboard/kunden", "Kunden", "€"],
  ["/dashboard/werke", "Werke", "⚙"],
];

/** Bereiche des Dashboards: oben als Tabs, am Handy als Leiste unten. Land- und Zeitraum-Auswahl bleiben erhalten. */
export function Nav({ bottom = false }: { bottom?: boolean }) {
  const path = usePathname();
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of ["land", "z"]) {
    const v = sp.get(k);
    if (v) keep.set(k, v);
  }
  const q = keep.toString() ? `?${keep}` : "";
  return (
    <nav className={bottom ? "bnav" : "tabs"} aria-label="Bereiche">
      {SECTIONS.map(([href, label, icon]) => {
        const on = href === "/dashboard" ? path === href : path.startsWith(href);
        return (
          <Link key={href} href={href + q} className={`${on ? "on" : ""}${href.endsWith("/jarvis") ? " jv-tab" : ""}`.trim() || undefined} aria-current={on ? "page" : undefined}>
            {bottom && <span className="bi" aria-hidden>{icon}</span>}
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/app/icons";

export const SECTIONS: [string, string, IconName][] = [
  // Inhaber 03.10.2026: wenige Reiter – alles Weitere öffnet sich über die Stationen der Fluss-Karte in JARVIS
  ["/dashboard/jarvis", "JARVIS", "jarvis"],
  ["/dashboard/regler", "Regler", "regler"],
  ["/dashboard/baukasten", "Baukasten", "baukasten"],
  ["/dashboard/speicher", "Speicher", "speicher"],
  ["/dashboard/kontakte", "Kontakte", "kontakte"],
  ["/dashboard/kunden", "Kunden", "kunden"],
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
            {bottom && <span className="bi" aria-hidden><Icon name={icon} size={20} /></span>}
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

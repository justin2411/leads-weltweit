"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/app/icons";

export const SECTIONS: [string, string, IconName][] = [
  // Inhaber 03.10.2026: wenige Reiter – alles Weitere öffnet sich über die Stationen der Fluss-Karte in JARVIS
  ["/dashboard/jarvis", "JARVIS", "jarvis"],
  // Nachtschicht 04.10.2026: Antworten der Interessenten direkt erreichbar, Zahl = offene Antworten
  ["/dashboard/antworten", "Antworten", "antworten"],
  ["/dashboard/regler", "Regler", "regler"],
  ["/dashboard/baukasten", "Baukasten", "baukasten"],
  ["/dashboard/speicher", "Speicher", "speicher"],
  ["/dashboard/kontakte", "Kontakte", "kontakte"],
  ["/dashboard/kunden", "Kunden", "kunden"],
  // Inhaber 04.10.2026: alte Ansicht raus – Gehirn (Schalter, Seiten, Entscheidungen) hat eine eigene Seite
  ["/dashboard/gehirn", "Gehirn", "gehirn"],
  // Inhaber 04.10.2026: KI-Ansprechpartner je Kunde ab Pro (docs/KUNDEN-AGENTEN.md)
  ["/dashboard/kunden-agenten", "Kunden-Agenten", "ansprechpartner"],
];

/** Bereiche des Dashboards: oben als Tabs, am Handy als Leiste unten. Land- und Zeitraum-Auswahl bleiben erhalten.
 *  badges: Zahl je Bereich (z. B. offene Antworten), 0 oder fehlend = kein Zähler. */
export function Nav({ bottom = false, badges = {} }: { bottom?: boolean; badges?: Record<string, number> }) {
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
        // „/dashboard/kunden“ darf bei „/dashboard/kunden-agenten“ nicht mit leuchten: nur gleicher Pfad oder Unterseite
        const on = href === "/dashboard" ? path === href : path === href || path.startsWith(`${href}/`);
        const n = badges[href] ?? 0;
        return (
          <Link key={href} href={href + q} className={`${on ? "on" : ""}${href.endsWith("/jarvis") ? " jv-tab" : ""}`.trim() || undefined}
            aria-current={on ? "page" : undefined} aria-label={n > 0 ? `${label}, ${n} offen` : undefined}>
            {bottom && <span className="bi" aria-hidden><Icon name={icon} size={20} />{n > 0 && <b className="nb">{n > 99 ? "99+" : n}</b>}</span>}
            {bottom ? <span className="bnl">{label}</span> : label}
            {!bottom && n > 0 && <b className="nb" aria-hidden>{n > 99 ? "99+" : n}</b>}
          </Link>
        );
      })}
    </nav>
  );
}

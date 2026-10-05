"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/app/icons";
import { bdZaehler } from "@/lib/braucht-dich";

/**
 * Genau 5 Bereiche (JARVIS-Zentrale 05.10.2026): JARVIS · Antworten · Kunden · Regler · Büro – am Rechner oben, am Handy
 * als Leiste unten, gleiche Reihenfolge. Alles Weitere (Gehirn, Werke, Versand, Website …) liegt im Büro bzw. hinter den
 * Kacheln und dem Gehirn-Kern der Zentrale; die alten Adressen bleiben erreichbar.
 */
export const SECTIONS: [string, string, IconName][] = [
  ["/dashboard/jarvis", "JARVIS", "jarvis"],
  ["/dashboard/antworten", "Antworten", "antworten"],
  ["/dashboard/kunden", "Kunden", "kunden"],
  ["/dashboard/regler", "Regler", "regler"],
  ["/dashboard/buero", "Büro", "buero"],
];

/** Unterseiten, die im Menü unter „Büro“ leuchten (sie stehen dort als Kacheln). */
const BUERO_SEITEN = ["/dashboard/buero", "/dashboard/gehirn", "/dashboard/versand", "/dashboard/kontakte", "/dashboard/vertrieb", "/dashboard/website",
  "/dashboard/proben", "/dashboard/bestand", "/dashboard/liste", "/dashboard/speicher", "/dashboard/baukasten", "/dashboard/betrieb", "/dashboard/protokoll",
  "/dashboard/finanzen", "/dashboard/ziele", "/dashboard/recht", "/dashboard/hilfe"];

const under = (path: string, href: string) => path === href || path.startsWith(`${href}/`);
export function isOn(path: string, href: string): boolean {
  if (href === "/dashboard/buero") return BUERO_SEITEN.some((h) => under(path, h));
  // „/dashboard/kunden“ leuchtet auch bei den Kunden-Agenten (Reiter der Kunden-Seite)
  if (href === "/dashboard/kunden") return under(path, href) || under(path, "/dashboard/kunden-agenten");
  return under(path, href);
}

function useKeep(): string {
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of ["land", "z"]) {
    const v = sp.get(k);
    if (v) keep.set(k, v);
  }
  return keep.toString() ? `?${keep}` : "";
}

function Badge({ n }: { n: number }) {
  return n > 0 ? <b className="nb">{n > 99 ? "99+" : n}</b> : null;
}

/** Bereiche des Dashboards: oben als Tabs, am Handy als Leiste unten. badges: Zahl je Bereich (0 = kein Zähler). */
export function Nav({ bottom = false, badges = {} }: { bottom?: boolean; badges?: Record<string, number> }) {
  const path = usePathname();
  const q = useKeep();
  return (
    <nav className={bottom ? "bnav" : "tabs"} aria-label="Bereiche">
      {SECTIONS.map(([href, label, icon]) => {
        const on = isOn(path, href);
        const n = badges[href] ?? 0;
        const jv = href.endsWith("/jarvis");
        const aria = n > 0 ? `${label}, ${jv ? bdZaehler(n) : `${n} offen`}` : undefined;
        return bottom ? (
          <Link key={href} href={href + q} className={on ? "on" : undefined} aria-current={on ? "page" : undefined} aria-label={aria}>
            <span className="bi" aria-hidden><Icon name={icon} size={20} /><Badge n={n} /></span>
            <span className="bnl">{label}</span>
          </Link>
        ) : (
          <Link key={href} href={href + q} className={`${on ? "on" : ""}${jv ? " jv-tab" : ""}`.trim() || undefined}
            aria-current={on ? "page" : undefined} aria-label={aria} title={n > 0 && jv ? bdZaehler(n) : undefined}>
            {label}
            {n > 0 && <b className="nb" aria-hidden>{n > 99 ? "99+" : n}</b>}
          </Link>
        );
      })}
    </nav>
  );
}

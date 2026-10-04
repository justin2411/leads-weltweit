"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { Icon, type IconName } from "@/app/icons";
import { bdZaehler } from "@/lib/braucht-dich";

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
  // Inhaber 04.10.2026: Website als Themenfeld (Gesundheit, Website-Agenten, Änderungswünsche)
  ["/dashboard/website", "Website", "website"],
];

/** Handy-Leiste (docs/DESIGN-KOMMANDOZENTRALE.md, „übersichtlicher“): 5 feste Ziele nach Nutzung, alles Übrige im
 *  „Mehr“-Blatt. Versand ist eine bestehende Seite (sonst über die Fluss-Karte erreichbar). */
const PRIMARY: [string, string, IconName][] = [
  ["/dashboard/jarvis", "JARVIS", "jarvis"],
  ["/dashboard/antworten", "Antworten", "antworten"],
  ["/dashboard/versand", "Versand", "versand"],
  ["/dashboard/kunden", "Kunden", "kunden"],
  ["/dashboard/website", "Website", "website"],
];
const MORE = SECTIONS.filter(([h]) => !PRIMARY.some(([p]) => p === h));

const isOn = (path: string, href: string) => path === href || path.startsWith(`${href}/`);

function useKeep(): string {
  const sp = useSearchParams();
  const keep = new URLSearchParams();
  for (const k of ["land", "z"]) {
    const v = sp.get(k);
    if (v) keep.set(k, v);
  }
  return keep.toString() ? `?${keep}` : "";
}

/** Bereiche des Dashboards: oben als Tabs, am Handy als Leiste unten (BottomNav). Land- und Zeitraum-Auswahl bleiben erhalten.
 *  badges: Zahl je Bereich (z. B. offene Antworten), 0 oder fehlend = kein Zähler. */
export function Nav({ bottom = false, badges = {} }: { bottom?: boolean; badges?: Record<string, number> }) {
  const path = usePathname();
  const q = useKeep();
  if (bottom) return <BottomNav badges={badges} />;
  return (
    <nav className={bottom ? "bnav" : "tabs"} aria-label="Bereiche">
      {SECTIONS.map(([href, label, icon]) => {
        // „/dashboard/kunden“ darf bei „/dashboard/kunden-agenten“ nicht mit leuchten: nur gleicher Pfad oder Unterseite
        const on = href === "/dashboard" ? path === href : path === href || path.startsWith(`${href}/`);
        const n = badges[href] ?? 0;
        return (
          <Link key={href} href={href + q} className={`${on ? "on" : ""}${href.endsWith("/jarvis") ? " jv-tab" : ""}`.trim() || undefined}
            aria-current={on ? "page" : undefined} aria-label={n > 0 ? `${label}, ${href.endsWith("/jarvis") ? bdZaehler(n) : `${n} offen`}` : undefined}
            title={n > 0 && href.endsWith("/jarvis") ? bdZaehler(n) : undefined}>
            {bottom && <span className="bi" aria-hidden><Icon name={icon} size={20} />{n > 0 && <b className="nb">{n > 99 ? "99+" : n}</b>}</span>}
            {bottom ? <span className="bnl">{label}</span> : label}
            {!bottom && n > 0 && <b className="nb" aria-hidden>{n > 99 ? "99+" : n}</b>}
          </Link>
        );
      })}
    </nav>
  );
}

function Badge({ n }: { n: number }) {
  return n > 0 ? <b className="nb">{n > 99 ? "99+" : n}</b> : null;
}

/** Untere Handy-Leiste: 5 Hauptziele + „Mehr“ (Blatt mit den übrigen Bereichen, X = x-btn). */
function BottomNav({ badges }: { badges: Record<string, number> }) {
  const path = usePathname();
  const q = useKeep();
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [path]);
  useEffect(() => {
    if (!open) return;
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", esc);
    return () => window.removeEventListener("keydown", esc);
  }, [open]);
  const moreOn = MORE.some(([h]) => isOn(path, h));
  const moreN = MORE.reduce((a, [h]) => a + (badges[h] ?? 0), 0);
  return (
    <>
      <nav className="bnav" aria-label="Bereiche">
        {PRIMARY.map(([href, label, icon]) => {
          const on = isOn(path, href);
          const n = badges[href] ?? 0;
          const jv = href.endsWith("/jarvis");
          return (
            <Link key={href} href={href + q} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}
              aria-label={n > 0 ? `${label}, ${jv ? bdZaehler(n) : `${n} offen`}` : undefined}>
              <span className="bi" aria-hidden><Icon name={icon} size={20} /><Badge n={n} /></span>
              <span className="bnl">{label}</span>
            </Link>
          );
        })}
        <button type="button" className={`bmore${moreOn ? " on" : ""}`} aria-expanded={open} aria-controls="mehr-blatt" onClick={() => setOpen((o) => !o)}>
          <span className="bi" aria-hidden><Icon name="menue" size={20} /><Badge n={moreN} /></span>
          <span className="bnl">Mehr</span>
        </button>
      </nav>
      {open && (
        <div className="msheet-bg" onClick={() => setOpen(false)}>
          <div id="mehr-blatt" className="msheet" role="dialog" aria-modal="true" aria-label="Weitere Bereiche" onClick={(e) => e.stopPropagation()}>
            <header><b>Mehr</b><button type="button" className="x-btn" aria-label="Schließen" onClick={() => setOpen(false)}><Icon name="schliessen" size={20} /></button></header>
            <div className="msheet-g">
              {MORE.map(([href, label, icon]) => {
                const on = isOn(path, href);
                return (
                  <Link key={href} href={href + q} className={on ? "on" : undefined} aria-current={on ? "page" : undefined}>
                    <Icon name={icon} size={22} /><span>{label}</span><Badge n={badges[href] ?? 0} />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

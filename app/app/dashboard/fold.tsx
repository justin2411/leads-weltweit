"use client";

/**
 * Einklappbarer Abschnitt (Inhaber 04.10.2026: „solchen langen sektionen immer zum ein und ausklappen“, Regel in
 * docs/DESIGN.md): details/summary mit Chevron (Klasse .fold in hud-css.ts), Kopfzeile mit Titel und Kurzzusammenfassung
 * bzw. Zahl. Der offen-Zustand je Abschnitt (id) bleibt im Browser gespeichert (localStorage, try/catch – ohne Speicher
 * gilt `open`). Für alle Listen/Tabellen/Matrizen über ~6 Zeilen im Dashboard.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAnker } from "./use-anker";

const PREFIX = "sw-fold:";

function read(id: string): boolean | null {
  try {
    const v = window.localStorage.getItem(PREFIX + id);
    return v === "1" ? true : v === "0" ? false : null;
  } catch {
    return null;
  }
}
function write(id: string, open: boolean) {
  try {
    window.localStorage.setItem(PREFIX + id, open ? "1" : "0");
  } catch {
    /* privater Modus/gesperrt: Zustand gilt nur bis zum Neuladen */
  }
}

/**
 * id: eindeutig im Dashboard (z. B. "speicher-laender"); title: Überschrift; sum: Kurzzusammenfassung/Zahl rechts;
 * open: Standard ohne gespeicherten Zustand; className: Klassen der Hülle (z. B. "card tile" oder "sp-card");
 * head: Klassen der Kopfzeile (Standard "h2s" = Abschnittsüberschrift, in Karten z. B. "th" oder "sp-h");
 * alert: Warnzustand (fehlende Variable, ungespeicherte Änderung) – dann immer offen, auch wenn der Inhaber den
 * Abschnitt früher zugeklappt hat (docs/DESIGN.md).
 * Sprungziel: Links auf „#<id>“ öffnen den Abschnitt, scrollen hin und lassen ihn kurz aufleuchten (useAnker,
 * lib/anker.ts) – dieses Öffnen wird nicht gespeichert.
 */
export function Fold({ id, title, sum, open = true, alert = false, className = "", head = "h2s", children }: { id: string; title: ReactNode; sum?: ReactNode; open?: boolean; alert?: boolean; className?: string; head?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const byUser = useRef(false); // nur echte Klicks speichern (nicht das Öffnen beim Laden)
  // Anfangszustand fest (sonst klappt React den Abschnitt bei jeder Änderung von open/alert wieder um)
  const [initial] = useState(open || alert);
  useEffect(() => {
    const saved = read(id);
    if (saved !== null && ref.current && ref.current.open !== saved) ref.current.open = saved;
  }, [id]);
  useEffect(() => {
    if (alert && ref.current && !ref.current.open) ref.current.open = true; // Warnzustand: immer sichtbar
  }, [alert]);
  useAnker(ref, id, [], (el) => {
    const d = el as HTMLDetailsElement;
    if (!d.open) d.open = true; // kein Klick → byUser bleibt false → nicht gespeichert
  });
  return (
    <details ref={ref} className={`fold ${className}`.trim()} open={initial} data-fold={id}
      onToggle={(e) => { if (byUser.current) { byUser.current = false; write(id, (e.currentTarget as HTMLDetailsElement).open); } }}>
      <summary className={head} onClick={() => { byUser.current = true; }}><span className="fold-t">{title}</span>{sum !== undefined && sum !== null && sum !== "" ? <span className="fold-s">{sum}</span> : null}</summary>
      <div className="fold-b">{children}</div>
    </details>
  );
}

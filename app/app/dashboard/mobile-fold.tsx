"use client";

/**
 * Am Handy eingeklappt, am Desktop unverändert offen (docs/DESIGN-KOMMANDOZENTRALE.md: JARVIS-Startseite kürzen).
 * ≤ 760 px: <details> mit kurzem Titel und Kennzahl im Summary, Standard zu; der Zustand je id bleibt im Browser
 * (localStorage, try/catch – nur Dashboard). > 760 px: Summary ausgeblendet, Inhalt immer offen.
 * Vor dem ersten Rendern im Browser blendet CSS den Inhalt am Handy aus (kein Aufblitzen).
 */
import { useEffect, useRef, type ReactNode } from "react";

const PREFIX = "sw-mfold:";
const MQ = "(max-width:760px)";

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
    /* gesperrter Speicher: Zustand gilt bis zum Neuladen */
  }
}

export function MobileFold({ id, title, sum, className = "", children }: { id: string; title: ReactNode; sum?: ReactNode; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);
  const byUser = useRef(false);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const mq = window.matchMedia(MQ);
    const apply = () => { d.open = mq.matches ? read(id) ?? false : true; };
    apply();
    d.dataset.ready = "1";
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [id]);
  return (
    <details ref={ref} className={`mfold ${className}`.trim()} open data-mfold={id}
      onToggle={(e) => { if (byUser.current) { byUser.current = false; write(id, (e.currentTarget as HTMLDetailsElement).open); } }}>
      <summary onClick={() => { byUser.current = true; }}><span className="mf-t">{title}</span>{sum !== undefined && sum !== null && sum !== "" && <span className="mf-s">{sum}</span>}</summary>
      <div className="mf-b">{children}</div>
    </details>
  );
}

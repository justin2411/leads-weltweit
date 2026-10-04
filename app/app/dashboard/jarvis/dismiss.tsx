"use client";

/**
 * Empfehlungen und Hinweise per X ausblenden (Inhaber 04.10.2026: „ich möchte hier was jarvis empfiehlt auch sachen
 * löschen können sehr einfach“). TipX blendet sofort aus (Server Action dismissTip: 7 Tage, rote Alarme 24 h),
 * UndoBar zeigt danach kurz „ausgeblendet · rückgängig“. Logik und Schlüssel: lib/tips.ts.
 */
import { useEffect, useRef, useState, useTransition } from "react";
import { dismissTip, undoDismissTip } from "../control-actions";
import { Icon } from "@/app/icons";

const EVT = "jarvis-tip-dismissed";
const SHOW_MS = 8000;
type Detail = { key: string; title: string };

/** Kleines X (Linien-Icon, 36 px Trefferfläche). Blendet die umgebende Karte (data-tip) sofort aus. */
export function TipX({ k, level, title }: { k: string; level: string; title: string }) {
  const [pending, start] = useTransition();
  const red = level === "rot";
  return (
    <button type="button" className="tip-x" disabled={pending} aria-label={`„${title}“ ausblenden`} title={red ? "für 24 h ausblenden" : "für 7 Tage ausblenden"}
      onClick={(e) => {
        const box = e.currentTarget.closest<HTMLElement>("[data-tip]");
        box?.classList.add("tip-gone");
        if (box) box.dataset.goneKey = k;
        start(async () => {
          const f = new FormData();
          f.set("key", k);
          f.set("level", red ? "rot" : "gelb");
          try {
            const r = await dismissTip(f);
            if (!r.ok) { box?.classList.remove("tip-gone"); return; }
            window.dispatchEvent(new CustomEvent<Detail>(EVT, { detail: { key: k, title } }));
          } catch {
            box?.classList.remove("tip-gone");
          }
        });
      }}>
      <Icon name="schliessen" size={14} />
    </button>
  );
}

/** Kurze Leiste nach dem Ausblenden: „… ausgeblendet · rückgängig“ (8 s). */
export function UndoBar() {
  const [last, setLast] = useState<Detail | null>(null);
  const [pending, start] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    const on = (e: Event) => {
      const d = (e as CustomEvent<Detail>).detail;
      if (!d?.key) return;
      setLast(d);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setLast(null), SHOW_MS);
    };
    window.addEventListener(EVT, on);
    return () => { window.removeEventListener(EVT, on); if (timer.current) clearTimeout(timer.current); };
  }, []);
  if (!last) return null;
  return (
    <div className="tip-undo" role="status" aria-live="polite">
      <span><b>{last.title}</b> ausgeblendet</span>
      <button type="button" disabled={pending} onClick={() => start(async () => {
        const f = new FormData();
        f.set("key", last.key);
        try {
          const r = await undoDismissTip(f);
          // Noch nicht neu geladene Karte wieder zeigen (sonst bliebe sie bis zum Neuladen versteckt)
          if (r.ok) document.querySelectorAll<HTMLElement>(".tip-gone[data-gone-key]").forEach((el) => { if (el.dataset.goneKey === last.key) el.classList.remove("tip-gone"); });
        } finally { setLast(null); }
      })}><Icon name="rueckgaengig" size={14} /> rückgängig</button>
    </div>
  );
}

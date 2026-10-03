"use client";
import { useEffect, useRef, useState } from "react";

/**
 * Großer Live-Zähler „datierte Signale erfasst“ (Inhaber 03.10.2026: Zahl, die mit der Zeit wächst).
 * Grundlage ist immer die echte Zählung aus der Datenbank (jede Minute neu); dazwischen läuft die Zahl
 * mit dem echten Tempo der letzten 24 h weiter. Sie fällt nie zurück: liegt die Zählung darunter, wartet sie.
 */
export function LiveCount({ initial, perDay, locale, label, live, art }: { initial: number; perDay: number; locale: string; label: string; live: string; art: string }) {
  const [n, setN] = useState(initial);
  const base = useRef({ count: initial, at: 0, rate: perDay / 86_400_000 });
  const shown = useRef(initial);

  useEffect(() => {
    base.current.at = Date.now();
    const tick = setInterval(() => {
      const b = base.current;
      const next = Math.max(shown.current, Math.floor(b.count + b.rate * (Date.now() - b.at)));
      if (next !== shown.current) { shown.current = next; setN(next); }
    }, 1000);
    const pull = async () => {
      try {
        const r = await fetch("/api/live-count", { cache: "no-store" });
        if (!r.ok) return;
        const j = await r.json() as { signals?: number; perDay?: number };
        if (typeof j.signals !== "number") return;
        base.current = { count: j.signals, at: Date.now(), rate: Math.max(0, j.perDay ?? 0) / 86_400_000 };
      } catch { /* Netz weg: letzter Stand läuft weiter */ }
    };
    pull();
    const poll = setInterval(pull, 60_000);
    return () => { clearInterval(tick); clearInterval(poll); };
  }, []);

  return (
    <div className="hp-livecount" data-reveal="" data-live="">
      <p className="hp-livecount__badge"><span className="hp-stat-art hp-livecount__pulse" aria-hidden="true" dangerouslySetInnerHTML={{ __html: art }} />{live}</p>
      <p className="hp-livecount__num" aria-live="off">{n.toLocaleString(locale)}</p>
      <p className="hp-livecount__label">{label}</p>
    </div>
  );
}

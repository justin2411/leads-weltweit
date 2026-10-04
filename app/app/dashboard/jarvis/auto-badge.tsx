"use client";

/**
 * Autopilot-Abzeichen unten rechts am Werk-Kreis (Inhaber 04.10.2026: „mach das auto eher unten rechts an den großen
 * kreis und auch grün und einstellbar“). Ein Schalter: grün = Autopilot an, grau = aus. Sofort sichtbar (optimistisch),
 * danach router.refresh; bei Fehler zurück und Fehler im Tooltip. Liegt neben dem Kreis-Link, öffnet nie den Drawer.
 */
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { autoTip } from "@/lib/werk-zeile";
import { setAutopilot } from "../regler/actions";

export function AutoBadge({ on, x, y, label }: { on: boolean; x: number; y: number; label: string }) {
  const router = useRouter();
  const [val, setVal] = useState(on);
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();
  useEffect(() => setVal(on), [on]);
  const tip = err ? `Nicht gespeichert: ${err}` : autoTip(val);
  return (
    <button type="button" className={`fl-auto${val ? " on" : ""}${err ? " err" : ""}`} style={{ left: `${x}%`, top: `${y}%` }}
      aria-pressed={val} aria-label={`${label}: ${tip}`} title={tip} disabled={pending}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const next = !val;
        setVal(next);
        setErr(null);
        start(async () => {
          const r = await setAutopilot(next).catch((x: Error) => ({ ok: false as const, error: x.message || "Fehler" }));
          if (!r.ok) {
            setVal(!next);
            setErr(r.error);
          }
          router.refresh();
        });
      }}>Auto</button>
  );
}

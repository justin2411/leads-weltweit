"use client";

/**
 * Kosten der Sofort-Antworten (Inhaber 04.10.2026: Monatsgrenze „vorerst 30 € – im Dashboard änderbar“):
 * „API diesen Monat: x,xx € von 30 €“ mit kleinem Balken; Klick öffnet den Regler (0–500 €, Übernehmen).
 * Gespeichert über die Server-Action setLlmBudget (requireOwner, Prüfung, owner_log).
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Icon } from "@/app/icons";
import { setLlmBudget } from "./actions";

export type LlmView = { text: string; budget: number; pct: number; ok: boolean };

export function LlmBudget({ llm }: { llm: LlmView | null }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState(String(llm?.budget ?? 30));
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();
  if (!llm) return null;
  const save = () => start(async () => {
    const r = await setLlmBudget(val);
    if (!r.ok) { setErr(r.error); return; }
    setErr(null);
    setOpen(false);
    router.refresh();
  });
  return (
    <span className={`jc-llm${llm.ok ? "" : " full"}`}>
      <button type="button" className="jc-llm-b" onClick={() => setOpen((o) => !o)} aria-expanded={open} title="Monatsgrenze der Claude-API ändern">
        <Icon name="statistik" size={13} /><span>{llm.text}</span><i className="bar" aria-hidden><i style={{ width: `${llm.pct}%` }} /></i>
      </button>
      {open && (
        <span className="jc-llm-f" role="group" aria-label="API-Grenze pro Monat">
          <input type="range" min={0} max={200} step={5} value={Math.min(200, Number(val.replace(",", ".")) || 0)} onChange={(e) => setVal(e.target.value)} aria-label="Grenze in Euro" />
          <input type="text" inputMode="decimal" value={val} onChange={(e) => setVal(e.target.value)} aria-label="Grenze in Euro (0–500)" />
          <b>€</b>
          <button type="button" className="go" onClick={save} disabled={busy}>Übernehmen</button>
          {err && <em role="alert">{err}</em>}
        </span>
      )}
    </span>
  );
}

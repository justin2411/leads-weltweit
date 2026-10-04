"use client";

/**
 * Schalter „Assistent | Gehirn“ (Inhaber 04.10.2026: „den einen schalter haben wo ich direkt mit dem super gehirn
 * sprechen kann was selbstständig denkt … und einmal soll er nur der assistent bei bestimmten bausteinen sein“).
 * Assistent = Helfer zu Bausteinen (schnell), Gehirn = JARVIS als Kopf mit Zielen, KPIs und Wissen (goldenes Glühen).
 * Gespeichert je Sitzung (jarvis_sessions.mode); die feste Gehirn-Sitzung ist immer „Gehirn“ (locked).
 */
import type { ChatMode } from "@/lib/jarvis-chat";
import { Icon } from "@/app/icons";

export const MODE_HINT: Record<ChatMode, string> = {
  assistent: "hilft bei Bausteinen und Themen",
  gehirn: "denkt mit · Ziele, KPIs, Wissen",
};

export function ModeSwitch({ mode, onChange, locked = false, busy = false, compact = false }: {
  mode: ChatMode; onChange: (m: ChatMode) => void; locked?: boolean; busy?: boolean; compact?: boolean;
}) {
  const btn = (m: ChatMode, label: string) => {
    const on = mode === m;
    const off = locked && m !== "gehirn";
    return (
      <button type="button" role="radio" aria-checked={on} className={`jc-mode-b m-${m}${on ? " on" : ""}`} disabled={busy || off}
        title={off ? "Der Gehirn-Chat spricht immer mit dem Gehirn" : `${label}: ${MODE_HINT[m]}`} onClick={() => !on && !off && onChange(m)}>
        <Icon name={m === "gehirn" ? "gehirn" : "jarvis"} size={15} /><span>{label}</span>
      </button>
    );
  };
  return (
    <div className={`jc-mode${mode === "gehirn" ? " is-g" : ""}${compact ? " cmp" : ""}`} role="radiogroup" aria-label="Mit wem sprechen">
      {btn("assistent", "Assistent")}
      {btn("gehirn", "Gehirn")}
      {!compact && <em className="jc-mode-h">{locked ? <><Icon name="schloss" size={12} /> fest · {MODE_HINT.gehirn}</> : MODE_HINT[mode]}</em>}
    </div>
  );
}

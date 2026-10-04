import type { CSSProperties } from "react";
import { Icon } from "@/app/icons";
import { planAgentLine } from "@/lib/customer-agents";

/**
 * Paketvorteil „Persönlicher Ansprechpartner“ (Inhaber 04.10.2026): bei Pro und individuell ab 50/Woche.
 * Ohne Hooks, darum in Server- und Client-Komponenten nutzbar. Ohne Trennpunkt (Inhaber 04.10.2026).
 * Tarifseite Desktop: Titel eine Zeile, Text zwei Zeilen darunter (Inhaber 04.10.2026: „auf desktop immer 3 zeilig“).
 */
export function PlanAgentLine({ lang, as = "li", className }: { lang: string; as?: "li" | "p"; className?: string }) {
  const t = planAgentLine(lang);
  const body = <><Icon name="ansprechpartner" size={18} /><span><b>{t.title}</b> <span className="agl-t">{t.text}</span></span></>;
  return as === "p"
    ? <p className={className} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>{body}</p>
    : <li className={className ?? "agl"} style={{ "--n": Math.round(t.text.length * (lang === "en" ? 1 : 1.12)), "--nt": t.title.length } as CSSProperties}>{body}</li>;
}

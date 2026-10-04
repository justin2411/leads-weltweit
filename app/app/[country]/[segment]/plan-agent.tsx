import { Icon } from "@/app/icons";
import { planAgentLine } from "@/lib/customer-agents";

/**
 * Paketvorteil „Persönlicher Ansprechpartner (KI)“ (Inhaber 04.10.2026): bei Pro und individuell ab 50/Woche.
 * Ohne Hooks, darum in Server- und Client-Komponenten nutzbar. Ehrlich als KI benannt.
 */
export function PlanAgentLine({ lang, as = "li", className }: { lang: string; as?: "li" | "p"; className?: string }) {
  const t = planAgentLine(lang);
  const body = <><Icon name="ansprechpartner" size={18} /><span><b>{t.title}</b> · {t.text}</span></>;
  return as === "p"
    ? <p className={className} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>{body}</p>
    : <li className={className ?? "agl"}>{body}</li>;
}

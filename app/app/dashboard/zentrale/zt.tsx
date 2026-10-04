/**
 * Bausteine der Kommandozentrale (Finanzen, Vertrieb, Ziele): Kopf, Kennzahl-Kachel, Ampel-Pille. Server-Komponenten.
 */
import type { ReactNode } from "react";
import { AMPEL_TEXT, type Ampel } from "@/lib/ampel";
import { berlin } from "@/lib/dashboard-logic";
import { Crumbs } from "../v2";
import { ZENTRALE_CSS } from "./zt-css";

export function ZtHead({ title, at }: { title: string; at?: Date }) {
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: ZENTRALE_CSS }} />
      <Crumbs items={[["JARVIS", "/dashboard/jarvis"], [title, ""]]} />
      <div className="zt-head"><h1>{title}</h1>{at && <span className="zt-at">Stand {berlin(at)}</span>}</div>
    </>
  );
}

export function ZtKpi({ value, label, ampel = "grey", sub, tip }: { value: ReactNode; label: string; ampel?: Ampel; sub?: string; tip?: string }) {
  return (
    <div className={`zt-k a-${ampel}`} title={tip ?? `${label}: ${AMPEL_TEXT[ampel]}`}>
      <b>{value}</b><span>{label}</span>{sub && <small>{sub}</small>}
    </div>
  );
}

export function ZtAmpel({ ampel, text }: { ampel: Ampel; text?: string }) {
  return <span className={`zt-a a-${ampel}`}>{text ?? AMPEL_TEXT[ampel]}</span>;
}

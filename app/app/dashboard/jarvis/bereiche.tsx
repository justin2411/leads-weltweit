/**
 * B4 Bereiche + Agenten: 9 Bereichs-Chips aus firma-karte.json (Ampel aus department_gaps: Rang 1 rot, 2–3 gelb, sonst
 * grün; ohne Messung grau), Fach-Agenten als Punkte (leuchten, solange ihr Auftrag läuft), Übergaben Bereich → Bereich
 * als wandernder Punkt, Quellen-Scout an Produktion und die Spur „Auftrags-Agenten“ A1–A8 (+ Kunden-Agenten).
 */
import Link from "next/link";
import { Icon, isIconName } from "@/app/icons";
import type { AgentTask } from "@/lib/agents";
import type { BereichBild } from "@/lib/zentrale-modell";
import type { Handoff } from "@/lib/zentrale-typen";
import { AgentRow } from "./agents";

const TON_TEXT = { rot: "größte Lücke", gelb: "Lücke", gruen: "im Plan", grau: "keine Messung" } as const;

export function Bereiche({ bereiche, aktiv, handoffs, tasks, startAt, neu, handy, bewegung, scoutAn, agent }: {
  bereiche: BereichBild[]; aktiv: string | null; handoffs: Handoff[]; tasks: AgentTask[]; startAt: string; neu: Record<number, "cy" | "gold">;
  handy: boolean; bewegung: boolean; scoutAn: boolean; agent: string | null;
}) {
  const idx = new Map(bereiche.map((b, i) => [b.slug, i]));
  const W = 900, step = W / bereiche.length;
  const boegen = handoffs.map((h) => ({ h, a: idx.get(h.von), b: idx.get(h.an) })).filter((x) => x.a !== undefined && x.b !== undefined && x.a !== x.b).slice(0, 6);
  return (
    <section className="p jz-bereiche" aria-label="Bereiche und Agenten">
      <h2><Icon name="agent" size={16} />Bereiche & Agenten<span className="r">{handoffs.length ? `${handoffs.length} Übergaben offen` : ""}</span></h2>
      <div className="jz-bgrid">
        {bereiche.map((b) => (
          <Link key={b.slug} href={aktiv === b.slug ? "/dashboard/jarvis" : `/dashboard/jarvis?bereich=${b.slug}`} scroll={false}
            className={`jz-b t-${b.ton}${b.gold ? " gold" : ""}${b.rang === 1 && b.ton === "rot" ? " rang1" : ""}${aktiv === b.slug ? " on" : ""}`}
            aria-label={`${b.name}: ${TON_TEXT[b.ton]}`}
            title={`${b.name}: ${TON_TEXT[b.ton]}${b.titel ? ` · ${b.titel}` : ""}${b.laeuft ? ` · ${b.laeuft} Auftrag läuft` : ""}`}>
            <span className="ic" aria-hidden>{isIconName(b.icon) ? <Icon name={b.icon} size={22} /> : <Icon name="agent" size={22} />}</span>
            <span className="nm">{b.name}</span>
            <i className="amp" aria-hidden />
            <span className="pk" aria-hidden>{b.agenten.map((a) => <i key={a.id} className={a.laeuft ? "l" : ""} title={a.name} />)}</span>
            <span className="bdg" aria-hidden>{b.agenten.length}</span>
          </Link>
        ))}
        {!handy && boegen.length > 0 && (
          <svg className="jz-uebergabe" viewBox={`0 0 ${W} 100`} preserveAspectRatio="none" aria-hidden>
            {boegen.map(({ h, a, b }) => {
              const x1 = (a! + 0.5) * step, x2 = (b! + 0.5) * step;
              const d = `M${x1} 4 Q ${(x1 + x2) / 2} -10 ${x2} 4`;
              return (
                <g key={h.id}>
                  <path d={d}><title>{`${h.titel ?? h.regel}: ${h.status}`}</title></path>
                  {bewegung && <circle r="3"><animateMotion dur="3s" repeatCount="indefinite" path={d} /></circle>}
                </g>
              );
            })}
          </svg>
        )}
      </div>
      <p className={`jz-scout${scoutAn ? " an" : ""}`} title="Quellen-Scout: sucht stündlich neue Quellen für Lead- und Kunden-Werk">
        <i aria-hidden />Quellen-Scout → Produktion
      </p>
      <div className="jz-spur">
        <span>Auftrags-Agenten</span>
        <AgentRow tasks={tasks} active={agent} startAt={startAt} neu={neu} kompakt={handy} />
      </div>
    </section>
  );
}

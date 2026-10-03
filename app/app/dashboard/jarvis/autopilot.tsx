/**
 * Autopilot der Plätze in JARVIS (Inhaber 03.10.2026: „Ja, Autopilot an“): Schalter und die zuletzt wirklich
 * gestartete Belegung mit Grund je Linie (werk_plan_log, geschrieben vom Plan-Job), dazu die Stufe der
 * Speicher-Bremse. Server-Komponente, Schalter als Server Action.
 */
import type { PlanLog } from "@/lib/dashboard-data";
import type { LaneRegistry } from "@/lib/owner-settings";
import { Icon } from "@/app/icons";
import { toggleAutopilot } from "../control-actions";
import { Back } from "../v2";

const BREMSE: Record<PlanLog["bremse"], string> = {
  aus: "", hinweis: "Speicher ab 5,5 GB – noch keine Bremse", drossel: "Speicher-Bremse: höchstens 8 Lead-Plätze",
  "ohne-rohbestand": "Speicher-Bremse: nur grüne Leads, kein Rohbestand",
};
const hhmm = (iso: string) => new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));

export function AutopilotPanel({ on, log, reg, werk, back }: { on: boolean; log?: PlanLog; reg: LaneRegistry; werk: PlanLog["werk"]; back: string }) {
  const lanes = reg.lanes.filter((l) => l.werk === werk);
  const tip = on ? "Autopilot an – Klick: aus (dann gilt deine Belegung)" : "Autopilot aus – Klick: an";
  return (
    <section className="ap" aria-label="Autopilot">
      <div className="ap-h">
        <form action={toggleAutopilot} className="wsw">
          <Back to={back} />
          <input type="hidden" name="on" value={on ? "0" : "1"} />
          <button type="submit" className={on ? "on" : ""} role="switch" aria-checked={on} aria-label={tip} title={tip} />
          <span>{on ? "an" : "aus"}</span>
        </form>
        <b><Icon name="regler" size={16} /> Autopilot</b>
        {log && <em>{log.mode === "autopilot" ? "verteilt" : "Belegung"} {hhmm(log.at)}</em>}
      </div>
      {log?.bremse && log.bremse !== "aus" && <p className="warn"><Icon name="warnung" size={14} /> {BREMSE[log.bremse]}</p>}
      {log ? (
        <ul className="ap-l">
          {lanes.map((l) => (
            <li key={l.id} className={(log.plan[l.id] ?? 0) === 0 ? "off" : ""}>
              <b>{log.plan[l.id] ?? 0}</b><span>{l.short}</span><em>{(log.reasons[l.id] ?? "").replace(/ – /g, " · ")}</em>
            </li>
          ))}
        </ul>
      ) : <p className="lock">Erste Verteilung beim nächsten Start</p>}
      <p className="lock">{on ? "Regler unten = deine Grundbelegung · 0 bleibt aus" : "Es gilt deine Belegung unten"}</p>
    </section>
  );
}

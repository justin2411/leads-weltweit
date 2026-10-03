import { toggleWerk } from "./control-actions";
import { Back } from "./v2";

/** An/Aus-Schalter eines Werks (Inhaber 03.10.2026: „alles direkt per click an und ausschalten“). */
export function WerkSwitch({ werk, on, back, label, note }: { werk: string; on: boolean; back: string; label: string; note?: string }) {
  const tip = `${label} ${on ? "läuft nach Plan – Klick: pausieren" : "pausiert – Klick: einschalten"}${note ? ` · ${note}` : ""}`;
  return (
    <form action={toggleWerk} className="wsw">
      <Back to={back} />
      <input type="hidden" name="werk" value={werk} />
      <input type="hidden" name="on" value={on ? "0" : "1"} />
      <button type="submit" className={on ? "on" : ""} role="switch" aria-checked={on} aria-label={tip} title={tip} />
      <span>{on ? "an" : "aus"}</span>
    </form>
  );
}

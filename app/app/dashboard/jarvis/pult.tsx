"use client";

/**
 * Steuerpult (Inhaber 03.10.2026: „wv plätze werden belegt … die werke wie maschinen steuern“): je Linie ein Regler
 * 0 … max mit Ertrag der letzten 24 h, Summenanzeige gegen die verfügbaren Plätze. Speichern schreibt
 * owner_settings.slot_plan (Server Action, Prüfung serverseitig); wirkt beim nächsten Start des Werks.
 * „Übernehmen & jetzt starten“ (start=1) speichert und startet die gezeigten Werke sofort (Direktstart, 03.10.2026).
 */
import { useMemo, useState } from "react";
import { Icon } from "@/app/icons";

export type PultLane = {
  id: string; werk: string; label: string; short: string; what: string; max: number; def: number; cur: number; color: string;
  stat: { runs: number; green: number; perSlotH: number | null; avgRunMin: number | null; perRun: number | null; exhausted: boolean; live: number };
};

export function Pult({ lanes, cap, total, back, action, nextStart, custom, only }: {
  lanes: PultLane[]; cap: number; total: number; back: string; action: (f: FormData) => void | Promise<void>;
  nextStart: Record<string, string>; custom: boolean; only?: string[];
}) {
  const shown = only ? lanes.filter((l) => only.includes(l.id)) : lanes;
  const [v, setV] = useState<Record<string, number>>(() => Object.fromEntries(lanes.map((l) => [l.id, l.cur])));
  const sum = useMemo(() => Object.values(v).reduce((a, b) => a + b, 0), [v]);
  const dirty = lanes.some((l) => v[l.id] !== l.cur);
  const over = sum > cap;
  const set = (id: string, n: number, max: number) => setV((o) => ({ ...o, [id]: Math.max(0, Math.min(max, n)) }));
  let acc = 0;
  return (
    <form action={action} className="pult">
      <input type="hidden" name="back" value={back} />
      <div className="pult-sum" aria-live="polite">
        <div className="ps-bar" aria-hidden>
          {lanes.map((l) => {
            const w = (v[l.id] / total) * 100;
            const el = <i key={l.id} style={{ left: `${(acc / total) * 100}%`, width: `${w}%`, background: l.color }} title={`${l.label}: ${v[l.id]}`} />;
            acc += v[l.id];
            return el;
          })}
          <i className="ps-res" style={{ left: `${(cap / total) * 100}%`, width: `${((total - cap) / total) * 100}%` }} title="reserviert" />
          <i className="ps-cap" style={{ left: `${(cap / total) * 100}%` }} />
        </div>
        <div className="ps-read">
          <b className={over ? "bad" : ""}>{sum}</b><span>von {cap} Plätzen geplant · {total - cap} reserviert</span>
          {over && <em className="bad">{sum - cap} zu viel</em>}
          {!over && sum < cap && <em>{cap - sum} frei</em>}
        </div>
      </div>
      {lanes.filter((l) => !shown.includes(l)).map((l) => <input key={l.id} type="hidden" name={`slot_${l.id}`} value={v[l.id]} />)}
      <ul className="lanes">
        {shown.map((l) => {
          const s = l.stat;
          const state = s.live > 0 ? "läuft" : s.runs === 0 ? "keine Daten" : s.exhausted ? "Vorrat erschöpft" : "ergiebig";
          return (
            <li key={l.id} className={`lane ${v[l.id] === 0 ? "off" : ""} ${s.live ? "live" : ""}`} style={{ "--c": l.color } as React.CSSProperties}>
              <div className="ln-id"><span className="hex">{l.short}</span><i className="ln-led" title={state} /></div>
              <div className="ln-main">
                <b>{l.label}<small>{l.werk === "kunden-werk" ? "Kunden-Werk" : "Lead-Werk"} · Start {nextStart[l.werk] ?? "–"}</small></b>
                <span className="ln-what">{l.what}</span>
                <div className="ln-read">
                  <span title="grüne Leads bzw. mail-fähige Käufer in den letzten 24 h"><em>24h</em>{s.green.toLocaleString("de-DE")}<small>grün</small></span>
                  <span title="grüne je belegter Platz-Stunde"><em>je Platz·h</em>{s.perSlotH === null ? "–" : Math.round(s.perSlotH).toLocaleString("de-DE")}</span>
                  <span title="Laufzeit eines Teils im Schnitt (Zeitfenster 75 min)"><em>Ø Teil</em>{s.avgRunMin === null ? "–" : `${Math.round(s.avgRunMin)} min`}</span>
                  <span className={`st ${state === "Vorrat erschöpft" ? "warn" : state === "läuft" ? "run" : ""}`}>{state}{s.live ? ` · ${s.live}` : ""}</span>
                </div>
              </div>
              <div className="ln-ctl">
                <button type="button" onClick={() => set(l.id, v[l.id] - 1, l.max)} aria-label={`${l.label}: einen Platz weniger`} disabled={v[l.id] <= 0}><Icon name="weniger" size={18} /></button>
                <output aria-label={`${l.label}: Plätze`}>{v[l.id]}</output>
                <button type="button" onClick={() => set(l.id, v[l.id] + 1, l.max)} aria-label={`${l.label}: einen Platz mehr`} disabled={v[l.id] >= l.max}><Icon name="mehr" size={18} /></button>
                <input type="range" min={0} max={l.max} value={v[l.id]} onChange={(e) => set(l.id, Number(e.target.value), l.max)} aria-label={`${l.label}: Plätze 0 bis ${l.max}`} />
                <input type="hidden" name={`slot_${l.id}`} value={v[l.id]} />
                <span className="ln-max">max {l.max} · Std. {l.def}</span>
              </div>
            </li>
          );
        })}
      </ul>
      <input type="hidden" name="changed" value={dirty ? "1" : "0"} />
      <input type="hidden" name="werke" value={[...new Set(shown.map((l) => l.werk))].join(",")} />
      <div className="pult-go">
        <button type="submit" className="go" disabled={!dirty || over}>{over ? "Zu viele Plätze" : dirty ? "Belegung übernehmen" : "Keine Änderung"}</button>
        <button type="submit" name="start" value="1" className="go" disabled={over} title="Belegung speichern (falls geändert) und das Werk sofort starten statt beim nächsten Zeitplan">
          {dirty ? "Übernehmen & jetzt starten" : <><Icon name="start" size={16} /> Jetzt starten</>}</button>
        {dirty && <button type="button" className="ghost" onClick={() => setV(Object.fromEntries(lanes.map((l) => [l.id, l.cur])))}>Zurücksetzen</button>}
        {custom && <button type="submit" name="reset" value="1" className="ghost" formNoValidate>Standard wiederherstellen</button>}
        <span className="hint">Wirkt beim nächsten Start des Werks – oder sofort mit „jetzt starten“. Laufende Teile arbeiten zu Ende.</span>
      </div>
    </form>
  );
}

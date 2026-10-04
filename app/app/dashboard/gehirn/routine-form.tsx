"use client";

/**
 * Formular „Neue Routine“ / „Ändern“ mit Vorlagen (Inhaber-Beispiele: 14:00 System verbessern, 14:00 Umsatz maximieren,
 * 11:00 Alles läuft glatt?). Vorlagen füllen nur das Formular – angelegt wird erst mit „Speichern“.
 */
import { useState } from "react";
import { TEMPLATES, WOCHENTAG_KURZ, type BrainRoutine, type RoutineInput } from "@/lib/brain-routines";
import { Icon } from "@/app/icons";
import { saveRoutine } from "./routine-actions";

const EMPTY: RoutineInput = { name: "", aufgabe: "", uhrzeit: "14:00", tage: "taeglich", wochentage: [], dauer_min: 15 };

export function RoutineForm({ routine, onClose }: { routine?: BrainRoutine; onClose?: () => void }) {
  const [v, setV] = useState<RoutineInput>(routine ? { name: routine.name, aufgabe: routine.aufgabe, uhrzeit: routine.uhrzeit, tage: routine.tage,
    wochentage: routine.wochentage, dauer_min: routine.dauer_min } : EMPTY);
  const set = <K extends keyof RoutineInput>(k: K, x: RoutineInput[K]) => setV((o) => ({ ...o, [k]: x }));
  return (
    <form action={saveRoutine} className="gh-rf">
      {routine && <input type="hidden" name="id" value={routine.id} />}
      {!routine && (
        <div className="gh-rf-tpl" aria-label="Vorlagen">
          {TEMPLATES.map((t) => (
            <button key={t.key} type="button" onClick={() => setV({ ...t })} title={t.aufgabe}>
              <Icon name="uhr" size={13} />{t.uhrzeit} · {t.name}
            </button>
          ))}
        </div>
      )}
      <div className="gh-rf-row">
        <label className="gh-rf-name">Name<input name="name" value={v.name} onChange={(e) => set("name", e.target.value)} required minLength={2} maxLength={60} placeholder="z. B. Umsatz maximieren" /></label>
        <label className="gh-rf-time">Uhrzeit<input name="uhrzeit" type="time" value={v.uhrzeit} onChange={(e) => set("uhrzeit", e.target.value)} required /></label>
        <label className="gh-rf-dur">Minuten<input name="dauer_min" type="number" min={5} max={60} value={v.dauer_min} onChange={(e) => set("dauer_min", Number(e.target.value))} required /></label>
        <label className="gh-rf-days">Tage
          <select name="tage" value={v.tage} onChange={(e) => set("tage", e.target.value as RoutineInput["tage"])}>
            <option value="taeglich">täglich</option><option value="werktags">Mo–Fr</option><option value="wochentage">bestimmte Tage</option>
          </select>
        </label>
      </div>
      {v.tage === "wochentage" && (
        <div className="gh-rf-wd" role="group" aria-label="Wochentage">
          {WOCHENTAG_KURZ.map((d, i) => (
            <label key={d} className={v.wochentage.includes(i + 1) ? "on" : ""}>
              <input type="checkbox" name="wochentage" value={i + 1} checked={v.wochentage.includes(i + 1)}
                onChange={(e) => set("wochentage", e.target.checked ? [...v.wochentage, i + 1].sort() : v.wochentage.filter((x) => x !== i + 1))} />{d}
            </label>
          ))}
        </div>
      )}
      <label className="gh-rf-task">Aufgabe<textarea name="aufgabe" value={v.aufgabe} onChange={(e) => set("aufgabe", e.target.value)} required minLength={5} maxLength={1000} rows={2}
        placeholder="Was soll das Gehirn tun? z. B. „15 min recherchieren, wie wir mehr Umsatz machen“" /></label>
      <div className="gh-rf-f">
        <small><Icon name="uhr" size={12} /> deutsche Zeit · ein freier Agent arbeitet sie ab · Ergebnis landet im Wissen</small>
        {onClose && <button type="button" className="gh-rf-x x-btn" onClick={onClose} aria-label="Abbrechen"><Icon name="schliessen" size={15} /></button>}
        <button className="primary"><Icon name="ok" size={15} /> Speichern</button>
      </div>
    </form>
  );
}

/** Ändern-Knopf mit aufklappendem Formular. */
export function RoutineEdit({ routine }: { routine: BrainRoutine }) {
  const [open, setOpen] = useState(false);
  return open ? <div className="gh-rt-edit"><RoutineForm routine={routine} onClose={() => setOpen(false)} /></div>
    : <button type="button" className="gh-ib" onClick={() => setOpen(true)} aria-label="Routine ändern" title="Ändern"><Icon name="einstellungen" size={14} /></button>;
}

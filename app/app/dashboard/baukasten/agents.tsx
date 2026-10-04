"use client";

/**
 * Eigene Agenten im Baukasten (Inhaber 04.10.2026: „mit dem baukasten eigene agenten bauen und speichern, die dann für
 * eine bestimmte sache immer angewendet werden“). Liste (Name, Auslöser, letzter Lauf, Ergebnis, an/aus) und das
 * Formular „Als Agent speichern“. Feste Schritte laufen kostenlos im Agenten-Werk (agents_run.py), der KI-Auftrag ist
 * optional. Nie Versand, nie Sperrliste/Prüfregeln; gelöscht wird nichts (nur aus oder Archiv).
 */
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  AGENT_MARKETS, EVERY_HOURS, MINUTE_STEP, TRIGGERS, WEEKDAYS, describeTrigger, hhmm, parseAgentInput, resultShort,
  type AgentInput, type CustomAgent, type Trigger,
} from "@/lib/baukasten";
import { InputError } from "@/lib/owner-settings";
import { setAgentArchived, setAgentEnabled } from "./actions";
import { Icon } from "@/app/icons";

export type AgentState = AgentInput & { id: string | null; enabled?: boolean; archived?: boolean };

const berlin = (iso: string | null) => {
  if (!iso) return "–";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "–"
    : new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(d);
};
const errText = (r: unknown, d: string) => {
  const v = r && typeof r === "object" ? (r as Record<string, unknown>).error : undefined;
  return typeof v === "string" && v ? v : d;
};

/** Uhrzeiten im 15-Minuten-Raster (00:00 … 23:45), Wert „H:M“. */
const TIMES = Array.from({ length: (24 * 60) / MINUTE_STEP }, (_, i) => [Math.floor((i * MINUTE_STEP) / 60), (i * MINUTE_STEP) % 60] as const);

/** Formular: Name, Auslöser (täglich um HH:MM / alle … Stunden, je mit Wochentagen; bei neuen Leads – deutsche Zeit),
 *  Markt (ohne IE/NL/BE), optional KI-Auftrag. */
export function AgentForm({ init, title, submit, busy, close, err }: {
  init: AgentState; title: string; submit: (a: AgentInput) => void; busy: boolean; close: () => void; err: string | null;
}) {
  const [a, setA] = useState<AgentState>(init);
  const [local, setLocal] = useState<string | null>(null);
  const go = () => {
    try {
      submit(parseAgentInput(a));
      setLocal(null);
    } catch (e) {
      setLocal(e instanceof InputError ? e.message : "Eingabe prüfen");
    }
  };
  const chip = (on: boolean) => `bk-c${on ? " on" : ""}`;
  const pickTrigger = (t: Trigger) => setA({
    ...a, trigger: t,
    at_hour: t === "taeglich" ? a.at_hour ?? 7 : null, at_minute: t === "taeglich" ? a.at_minute ?? 0 : null,
    every_hours: t === "alle_stunden" ? a.every_hours ?? 1 : null, weekdays: t === "neue_leads" ? null : a.weekdays,
  });
  const dayOn = (d: number) => a.weekdays === null || a.weekdays.includes(d);
  const toggleDay = (d: number) => {
    const cur = a.weekdays ?? [1, 2, 3, 4, 5, 6, 7];
    const next = cur.includes(d) ? cur.filter((x) => x !== d) : [...cur, d].sort((x, y) => x - y);
    if (!next.length) return; // mindestens ein Tag
    setA({ ...a, weekdays: next.length === 7 ? null : next });
  };
  const timed = a.trigger === "taeglich" || a.trigger === "alle_stunden";
  return (
    <div className="bk-modal" role="dialog" aria-modal="true" aria-label={title}>
      <div className="bk-modal-in">
        <div className="bk-modal-h">
          <span className="bkn-ic" aria-hidden><Icon name="agent" size={16} /></span>
          <h4>{title}</h4>
          <button type="button" className="bk-x x-btn" onClick={close} aria-label="Schließen"><Icon name="schliessen" size={14} /></button>
        </div>
        <label className="bk-f"><span>Name</span>
          <input value={a.name} maxLength={60} onChange={(e) => setA({ ...a, name: e.target.value })} placeholder="z. B. UK Käufer täglich" autoFocus />
        </label>
        <div className="bk-f"><span>Auslöser</span>
          <div className="bk-chips">
            {TRIGGERS.map((t) => (
              <button key={t.v} type="button" className={chip(a.trigger === t.v)} aria-pressed={a.trigger === t.v}
                onClick={() => pickTrigger(t.v)}>{t.label}</button>
            ))}
          </div>
        </div>
        {a.trigger === "taeglich" && (
          <label className="bk-f"><span>Uhrzeit (deutsche Zeit)</span>
            <select value={`${a.at_hour ?? 7}:${a.at_minute ?? 0}`} onChange={(e) => {
              const [h, m] = e.target.value.split(":").map(Number);
              setA({ ...a, at_hour: h, at_minute: m });
            }}>
              {TIMES.map(([h, m]) => <option key={`${h}:${m}`} value={`${h}:${m}`}>{hhmm(h, m)} Uhr</option>)}
            </select>
          </label>
        )}
        {a.trigger === "alle_stunden" && (
          <div className="bk-f"><span>Alle … Stunden</span>
            <div className="bk-chips">
              {EVERY_HOURS.map((h) => (
                <button key={h} type="button" className={chip(a.every_hours === h)} aria-pressed={a.every_hours === h}
                  onClick={() => setA({ ...a, every_hours: h })}>{h}</button>
              ))}
            </div>
          </div>
        )}
        {timed && (
          <div className="bk-f"><span>Wochentage</span>
            <div className="bk-chips">
              {WEEKDAYS.map((w, i) => (
                <button key={w} type="button" className={chip(dayOn(i + 1))} aria-pressed={dayOn(i + 1)} onClick={() => toggleDay(i + 1)}>{w}</button>
              ))}
            </div>
          </div>
        )}
        <div className="bk-f"><span>Markt</span>
          <div className="bk-chips">
            <button type="button" className={chip(!a.ai_market)} onClick={() => setA({ ...a, ai_market: null })}>alle</button>
            {AGENT_MARKETS.map((m) => <button key={m} type="button" className={chip(a.ai_market === m)} aria-pressed={a.ai_market === m} onClick={() => setA({ ...a, ai_market: m })}>{m}</button>)}
          </div>
        </div>
        <label className="bk-f"><span>KI-Auftrag (optional)</span>
          <textarea rows={3} maxLength={1000} value={a.ai_brief ?? ""} onChange={(e) => setA({ ...a, ai_brief: e.target.value })}
            placeholder="leer = nur die festen Schritte (kostenlos)" />
        </label>
        <p className="bk-hint">{describeTrigger(a)}{timed ? " (auf 15 Min. genau)" : ""}. Nie Versand.</p>
        {(local || err) && <p className="bk-err">{local ?? err}</p>}
        <div className="bk-row">
          <button type="button" className="bk-btn gold" onClick={go} disabled={busy}><Icon name="agent" size={15} />{busy ? "…" : "Speichern"}</button>
          <button type="button" className="bk-btn" onClick={close}>Abbrechen</button>
        </div>
      </div>
    </div>
  );
}

/** Bereich „Agenten“: alle eigenen Agenten mit Schalter; Archiv eingeklappt. */
export function AgentList({ agents }: { agents: CustomAgent[] | null }) {
  const router = useRouter();
  const [busy, start] = useTransition();
  const [msg, setMsg] = useState<{ good: boolean; text: string } | null>(null);
  const [showArch, setShowArch] = useState(false);
  const act = (fn: () => Promise<unknown>, ok: string) => start(async () => {
    try {
      const r = await fn();
      const good = !!(r && typeof r === "object" && (r as { ok?: unknown }).ok);
      setMsg(good ? { good, text: ok } : { good, text: errText(r, "fehlgeschlagen") });
      if (good) router.refresh();
    } catch {
      setMsg({ good: false, text: "fehlgeschlagen – Verbindung prüfen" });
    }
  });
  if (agents === null) return <p className="bk-msg bad bk-wide">Agenten nicht geladen – bitte neu laden</p>;
  const live = agents.filter((a) => !a.archived), arch = agents.filter((a) => a.archived);
  const row = (a: CustomAgent) => (
    <li key={a.id} className={`bk-ag${a.enabled ? " on" : ""}`}>
      <span className="bkn-ic" aria-hidden><Icon name="agent" size={16} /></span>
      <div className="bk-ag-t">
        <b>{a.name}</b>
        <span><Icon name="uhr" size={12} /> {describeTrigger(a)}{a.ai_market ? ` · ${a.ai_market}` : ""}{a.ai_brief ? " · KI-Auftrag" : ""}</span>
      </div>
      <div className="bk-ag-r">
        <small>{berlin(a.last_run_at)}</small>
        <span title={resultShort(a.last_result)}>{resultShort(a.last_result)}</span>
      </div>
      <div className="bk-ag-a">
        {a.archived ? (
          <button type="button" className="bk-btn" disabled={busy} onClick={() => act(() => setAgentArchived(a.id, false), "Zurückgeholt (aus)")}>Zurückholen</button>
        ) : (
          <>
            <button type="button" role="switch" aria-checked={a.enabled} className={`bk-sw${a.enabled ? " on" : ""}`} disabled={busy}
              onClick={() => act(() => setAgentEnabled(a.id, !a.enabled), a.enabled ? "Aus" : "An")} title={a.enabled ? "läuft – ausschalten" : "aus – einschalten"}>
              <i /><span>{a.enabled ? "an" : "aus"}</span>
            </button>
            <a className="bk-btn" href={`/dashboard/baukasten?agent=${encodeURIComponent(a.id)}`}><Icon name="einstellungen" size={14} />Bearbeiten</a>
            <button type="button" className="bk-x" disabled={busy} aria-label="Archivieren" title="Archivieren (nichts wird gelöscht)"
              onClick={() => window.confirm(`„${a.name}“ archivieren? Er läuft dann nicht mehr.`) && act(() => setAgentArchived(a.id, true), "Archiviert")}>
              <Icon name="bestand" size={14} />
            </button>
          </>
        )}
      </div>
    </li>
  );
  return (
    <div className="bk-agents bk-wide">
      {msg && <div className={`bk-msg ${msg.good ? "good" : "bad"}`} role="status">{msg.text}</div>}
      {live.length ? <ul>{live.map(row)}</ul> : (
        <div className="bk-none">
          <Icon name="agent" size={28} />
          <p><b>Noch keine Agenten.</b> Flow bauen, dann oben „Als Agent“ – er läuft danach von selbst.</p>
          <a className="bk-btn gold" href="/dashboard/baukasten"><Icon name="baukasten" size={15} />Flow bauen</a>
        </div>
      )}
      {arch.length > 0 && (
        <section>
          <button type="button" className="bk-addc" onClick={() => setShowArch((v) => !v)} aria-expanded={showArch}>Archiv ({arch.length})</button>
          {showArch && <ul>{arch.map(row)}</ul>}
        </section>
      )}
      <p className="bk-lock"><Icon name="schloss" size={14} /> Feste Schritte kostenlos im Agenten-Werk, KI-Auftrag optional. Nie Versand, Freigabe bleibt immer an.</p>
    </div>
  );
}

"use client";

/**
 * Regler (Inhaber 03.10.2026: „einfache anpassungen direkt einstellen … immer mit einem button, dass die änderungen
 * auch übernommen werden“). Alles wird erst lokal gestellt (Entwurf); gespeichert wird nur über die Leiste unten
 * („Übernehmen“). Danach lädt die Seite 3 min lang alle 20 s neu (sonst jede Minute), bis jedes Werk quittiert hat.
 */
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, useTransition, type ReactNode } from "react";
import { FOLLOWUP_DAYS_RANGE, MAX_AGE_RANGE, MAX_SAMPLE_TARGET, type OwnerSettings, type SettingKey } from "@/lib/owner-settings";
import {
  CARDS, LEAD_COUNTRIES, MAX_AGE_NOTE, cardOf, countryOn, diff, draftFrom, fmtBerlin, laneRoom, leadMax, leadTotal, presets, scalePlan,
  setCountry, setLane, type CardKey, type Draft, type ReglerCtx, type StatusKind,
} from "@/lib/regler";
import type { Entry } from "@/lib/regler-verlauf";
import { applySettings, startNow, undoChange } from "./actions";

export type CardView = {
  key: CardKey; kind: StatusKind; text: string;
  /** Zeiten schon in deutscher Zeit formatiert (Server) */
  saved: string | null; at: string | null; next: string;
  effect: { text: string; tone?: "bad" | "off" } | null;
};
type HistoryView = Entry & { when: string };
type Toast = { ok: boolean; title: string; lines: string[]; note?: string } | null;

const FAST_MS = 20_000, SLOW_MS = 60_000, FAST_FOR_MS = 3 * 60_000;

function Switch({ on, label, onChange, disabled }: { on: boolean; label: string; onChange: (on: boolean) => void; disabled?: boolean }) {
  return (
    <button type="button" role="switch" aria-checked={on} aria-label={label} title={`${label}: ${on ? "an" : "aus"}`} className="rg-sw" onClick={() => onChange(!on)} disabled={disabled}>
      <span className="tr" aria-hidden /><span className="lb">{on ? "an" : "aus"}</span>
    </button>
  );
}

function Stepper({ value, min, max, step = 1, unit, label, changed, disabled, onChange }: {
  value: number; min: number; max: number; step?: number; unit?: string; label: string; changed?: boolean; disabled?: boolean; onChange: (n: number) => void;
}) {
  // Schritte > 1 rasten auf Vielfache ein (48 -> 50 -> 55, 48 -> 45)
  const down = Math.max(min, step > 1 ? Math.ceil(value / step) * step - step : value - 1);
  const up = Math.min(max, step > 1 ? Math.floor(value / step) * step + step : value + 1);
  return (
    <div className={`rg-st${changed ? " chg" : ""}`}>
      <button type="button" aria-label={`${label}: weniger`} onClick={() => onChange(down)} disabled={disabled || value <= min}>−</button>
      <output aria-label={label} aria-live="polite">{value}{unit && <small>{unit}</small>}</output>
      <button type="button" aria-label={`${label}: mehr`} onClick={() => onChange(up)} disabled={disabled || value >= max}>+</button>
    </div>
  );
}

function Chip({ on, onClick, children, title, pre, disabled }: { on: boolean; onClick: () => void; children: ReactNode; title?: string; pre?: boolean; disabled?: boolean }) {
  return <button type="button" className={`rg-chip${pre ? " pre" : ""}`} aria-pressed={on} title={title} onClick={onClick} disabled={disabled}>{children}</button>;
}

/** ① eingestellt → ② übernommen → ③ angewandt */
function Rail({ v, dirty, startable, on, busy, onGo }: { v: CardView; dirty: boolean; startable: boolean; on: boolean; busy: boolean; onGo: () => void }) {
  type Step = { cls: "ok" | "now" | "wait" | "todo"; b: string; s?: string };
  const s1: Step = dirty ? { cls: "now", b: "geändert", s: "noch nicht übernommen" } : { cls: "ok", b: "eingestellt ✓" };
  const s2: Step = dirty ? { cls: "todo", b: "übernehmen", s: "Leiste unten" } : v.saved ? { cls: "ok", b: `übernommen ✓ ${v.saved}` } : { cls: "ok", b: "Standard", s: "nie geändert" };
  const s3: Step = dirty ? { cls: "todo", b: "angewandt", s: "nach dem Übernehmen" }
    : v.kind === "angewandt" ? { cls: "ok", b: `angewandt ✓ ${v.at}`, s: "vom Werk bestätigt" }
    : v.kind === "noch nie geändert" ? { cls: "ok", b: "aktiv", s: `nächster Lauf ${v.next}` }
    : { cls: "wait", b: v.kind === "start angefordert" ? "⏳ angefordert" : "⏳ wartet", s: v.text };
  const canGo = startable && !dirty && on && v.kind === "wartet" && !/^(gestartet|pausiert)/.test(v.text);
  return (
    <ol className="rg-rail" aria-label="Stand">
      {[s1, s2, s3].map((s, i) => (
        <li key={i} className={s.cls}>
          <i aria-hidden>{s.cls === "ok" ? "✓" : i + 1}</i><b>{s.b}</b>{s.s && <span>{s.s}</span>}
          {i === 2 && canGo && <button type="button" className="rg-go" onClick={onGo} disabled={busy} title="Werk jetzt starten statt beim nächsten Zeitplan">▶ Jetzt anwenden</button>}
        </li>
      ))}
    </ol>
  );
}

export function Regler({ ctx, saved, seen, cards, ready, history, error, dispatch }: {
  ctx: ReglerCtx; saved: OwnerSettings; seen: Partial<Record<SettingKey, string>>; cards: CardView[]; ready: Record<string, number>;
  history: HistoryView[]; error: string | null; dispatch: boolean;
}) {
  const router = useRouter();
  const reg = ctx.reg;
  const base = useMemo(() => draftFrom(saved, ctx), [saved, ctx]);
  const baseKey = JSON.stringify(base);
  const [draft, setDraft] = useState<Draft>(base);
  const prevBase = useRef(baseKey);
  const [hold, setHold] = useState<string | null>(null);
  const [toast, setToast] = useState<Toast>(null);
  const [boost, setBoost] = useState(0);
  const [busy, startT] = useTransition();

  // neuer gespeicherter Stand (Aktualisierung): unveränderten Entwurf mitziehen, eigene Änderungen behalten
  useEffect(() => {
    if (prevBase.current === baseKey) return;
    setDraft((d) => (JSON.stringify(d) === prevBase.current ? base : d));
    prevBase.current = baseKey;
    setHold(null);
  }, [baseKey, base]);

  const changes = useMemo(() => diff(saved, draft, ctx), [saved, draft, ctx]);
  const pending = changes.length > 0 && JSON.stringify(changes) !== hold;
  const dirtyCards = new Set(pending ? changes.map((c) => c.card) : []);
  const startable = pending && changes.some((c) => cardOf(c.card).start && draft.on[c.card]);

  // Seite mit ungespeicherten Änderungen verlassen -> nachfragen
  useEffect(() => {
    if (!pending) return;
    const ask = () => confirm(`${changes.length === 1 ? "1 Änderung" : `${changes.length} Änderungen`} nicht übernommen – Seite trotzdem verlassen?`);
    const onBefore = (e: BeforeUnloadEvent) => { e.preventDefault(); e.returnValue = ""; };
    const onClick = (e: MouseEvent) => {
      const a = (e.target as Element | null)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!a || a.target === "_blank" || e.metaKey || e.ctrlKey || e.shiftKey || a.getAttribute("href")?.startsWith("#")) return;
      if (!ask()) { e.preventDefault(); e.stopPropagation(); }
    };
    window.addEventListener("beforeunload", onBefore);
    document.addEventListener("click", onClick, true);
    return () => { window.removeEventListener("beforeunload", onBefore); document.removeEventListener("click", onClick, true); };
  }, [pending, changes.length]);

  // nach dem Übernehmen 3 min alle 20 s neu laden, sonst jede Minute – so springt ③ von allein auf „angewandt“
  useEffect(() => {
    let t: ReturnType<typeof setTimeout>;
    const tick = () => {
      t = setTimeout(() => {
        if (document.visibilityState === "visible") router.refresh();
        tick();
      }, Date.now() < boost ? FAST_MS : SLOW_MS);
    };
    tick();
    return () => clearTimeout(t);
  }, [boost, router]);

  useEffect(() => {
    if (!toast?.ok) return;
    const t = setTimeout(() => setToast(null), 12_000);
    return () => clearTimeout(t);
  }, [toast]);

  const set = (patch: Partial<Draft>) => setDraft((d) => ({ ...d, ...patch }));
  const setOn = (k: CardKey, on: boolean) => setDraft((d) => ({ ...d, on: { ...d.on, [k]: on } }));
  const locked = !!error || busy;

  const apply = (start: boolean) => startT(async () => {
    const sent = changes;
    const r = await applySettings(sent, start, seen);
    if (!r.ok) {
      setToast({ ok: false, title: r.error, lines: [] });
      if (/inzwischen/.test(r.error)) router.refresh();
      return;
    }
    setHold(JSON.stringify(sent));
    setBoost(Date.now() + FAST_FOR_MS);
    setToast({ ok: true, title: `✓ Übernommen ${fmtBerlin(r.at)}`, lines: r.applied.map((a) => a.text), note: r.started.join(" · ") || undefined });
    router.refresh();
  });
  const go = (k: CardKey) => startT(async () => {
    const r = await startNow(k);
    setToast(r.ok ? { ok: true, title: `▶ ${r.text}`, lines: [] } : { ok: false, title: r.error, lines: [] });
    if (r.ok) setBoost(Date.now() + FAST_FOR_MS);
    router.refresh();
  });
  const undo = (id: number) => startT(async () => {
    const r = await undoChange(id);
    if (!r.ok) return setToast({ ok: false, title: r.error, lines: [] });
    setBoost(Date.now() + FAST_FOR_MS);
    setToast({ ok: true, title: `↶ Zurückgenommen ${fmtBerlin(r.at)}`, lines: r.applied.map((a) => a.text) });
    router.refresh();
  });

  // ---------------------------------------------------------------- Knöpfe je Karte
  const plan = draft.slot_plan;
  const changedPart = (card: CardKey, part: string) => changes.some((c) => c.card === card && c.part.startsWith(part));
  const knobs = (k: CardKey): ReactNode => {
    if (k === "lead-werk") {
      const tot = leadTotal(plan, reg);
      const pres = presets(plan, reg).filter((p, i, a) => a.findIndex((q) => q.total === p.total) === i);
      return (<>
        <div className="rg-k"><span>Tempo</span>
          <div className="rg-row">
            <Stepper label="Tempo (Plätze)" value={tot} min={0} max={leadMax(plan, reg)} unit="Plätze" changed={changedPart(k, "tempo")} disabled={locked}
              onChange={(n) => set({ slot_plan: scalePlan(plan, reg, n) })} />
            <div className="rg-chips">{pres.map((p) => (
              <Chip key={p.id} pre on={tot === p.total} disabled={locked} onClick={() => set({ slot_plan: scalePlan(plan, reg, p.total) })}>{p.label}<small>{p.total}</small></Chip>))}
            </div>
          </div>
        </div>
        <div className="rg-k"><span>Länder</span>
          <div className="rg-chips">{LEAD_COUNTRIES.map((c) => {
            const on = countryOn(plan, reg, c.id);
            return <Chip key={c.id} on={on} title={c.title} disabled={locked} onClick={() => set({ slot_plan: setCountry(plan, reg, c.id, !on) })}>{c.label}</Chip>;
          })}</div>
        </div>
        <Link href="/dashboard/jarvis?s=lead&t=set" className="rg-fine">Feinsteuerung je Linie ›</Link>
      </>);
    }
    if (k === "kunden-werk") return (<>
      <div className="rg-k"><span>Plätze</span>
        <Stepper label="Kunden-Werk Plätze" value={plan.kunden ?? 0} min={0} max={laneRoom(plan, reg, "kunden")} changed={changedPart(k, "linie")} disabled={locked}
          onChange={(n) => set({ slot_plan: setLane(plan, reg, "kunden", n) })} />
      </div>
      <div className="rg-k"><span>Länder</span>
        <div className="rg-chips">{ctx.buyerCountries.map((c) => {
          const on = !draft.buyer_countries_off.includes(c);
          return <Chip key={c} on={on} disabled={locked} onClick={() => set({ buyer_countries_off: on ? [...draft.buyer_countries_off, c].sort() : draft.buyer_countries_off.filter((x) => x !== c) })}>{c}</Chip>;
        })}</div>
      </div>
    </>);
    if (k === "proben-vorrat") return (<>
      <div className="rg-pages">{ctx.pages.map((p) => (
        <div key={p} className="rg-page">
          <div><b>{p.split("/")[1]}</b><em>{ready[p] ?? 0} bereit</em></div>
          <Stepper label={`Soll ${p}`} value={draft.sample_targets[p] ?? 0} min={0} max={MAX_SAMPLE_TARGET} step={5} changed={changedPart(k, `soll:${p}`)} disabled={locked}
            onChange={(n) => set({ sample_targets: { ...draft.sample_targets, [p]: n } })} />
        </div>))}
      </div>
      <div className="rg-k dim"><span>Verfall</span>
        <Stepper label="Verfall (Stunden)" value={draft.sample_max_age_hours} min={MAX_AGE_RANGE[0]} max={MAX_AGE_RANGE[1]} step={12} unit="h" changed={changedPart(k, "verfall")} disabled={locked}
          onChange={(n) => set({ sample_max_age_hours: n })} />
        <p className="rg-note">{MAX_AGE_NOTE}</p>
      </div>
    </>);
    if (k === "nachfass") return (
      <div className="rg-k"><span>nach</span>
        <Stepper label="Nachfass nach Tagen" value={draft.followup_days} min={FOLLOWUP_DAYS_RANGE[0]} max={FOLLOWUP_DAYS_RANGE[1]} unit="Tagen" changed={changedPart(k, "tage")} disabled={locked}
          onChange={(n) => set({ followup_days: n })} />
      </div>
    );
    if (k === "antworten") return <p className="rg-lock">🔒 Abmeldungen werden immer gesperrt</p>;
    if (k === "versand") return <Link href="/dashboard/jarvis?s=versand&t=set" className="rg-fine">Mails pro Tag & Länder ›</Link>;
    return null;
  };

  return (
    <div className="rg">
      <div className="rg-head">
        <h1>Regler</h1>
        <div className="rg-steps" aria-label="So wirkt eine Änderung"><span><b>1</b>einstellen</span><i>→</i><span><b>2</b>übernehmen</span><i>→</i><span><b>3</b>Werk wendet an</span></div>
      </div>
      {error && <p className="rg-err" role="alert">Einstellungen nicht lesbar – Speichern gesperrt ({error})</p>}
      <div className="rg-grid">
        {CARDS.map((c) => {
          const v = cards.find((x) => x.key === c.key)!;
          const on = draft.on[c.key];
          const dirty = dirtyCards.has(c.key);
          const label = c.key === "versand" ? "Versand (Pause)" : c.name;
          return (
            <section key={c.key} className={`rg-card${on ? "" : " off"}${dirty ? " dirty" : ""}`} aria-label={c.name}>
              <div className="rg-h">
                <span className="rg-ic" aria-hidden>{c.icon}</span>
                <div style={{ minWidth: 0 }}>
                  <h2>{c.name}</h2>
                  {v.effect && <span className={`rg-eff${v.effect.tone ? ` ${v.effect.tone}` : ""}`} title={v.effect.text}>{v.effect.text}</span>}
                </div>
                <Switch on={on} label={label} disabled={locked} onChange={(x) => setOn(c.key, x)} />
              </div>
              {(() => { const k = knobs(c.key); return k ? <div className="rg-knobs">{k}</div> : null; })()}
              <Rail v={v} dirty={dirty} startable={!!c.start} on={base.on[c.key]} busy={busy} onGo={() => go(c.key)} />
            </section>
          );
        })}
      </div>

      <section className="rg-hist" aria-label="Verlauf">
        <h2>Verlauf</h2>
        {history.length ? (
          <ul>{history.map((h) => (
            <li key={h.id}>
              <time dateTime={h.at}>{h.when}</time>
              <span>{h.texts.join(" · ")}{h.undone && <em>↶ zurückgenommen</em>}</span>
              {h.undo ? <button type="button" onClick={() => undo(h.id)} disabled={locked} title="alten Wert wieder einstellen">Rückgängig</button> : <span />}
            </li>))}
          </ul>
        ) : <span className="none">noch keine Änderungen</span>}
        {!dispatch && <p className="rg-lock" style={{ marginTop: 10 }}>„Jetzt anwenden“ startet spätestens in 15 min (Wachhund).</p>}
      </section>

      {pending && (
        <div className="rg-bar" role="region" aria-label="Änderungen übernehmen">
          <div className="in">
            <span className="rg-n"><b>{changes.length}</b>{changes.length === 1 ? "Änderung" : "Änderungen"}</span>
            <span className="rg-list" title={changes.map((c) => c.text).join("\n")}>{changes.map((c) => c.text).join(" · ")}</span>
            <div className="rg-btns">
              <button type="button" className="gh" onClick={() => setDraft(base)} disabled={busy}>Verwerfen</button>
              <button type="button" className="pri" onClick={() => apply(false)} disabled={locked}>{busy ? "…" : "Übernehmen"}</button>
              {startable && <button type="button" className="now" onClick={() => apply(true)} disabled={locked} title="speichern und betroffene Werke sofort starten">Übernehmen & sofort anwenden</button>}
            </div>
          </div>
        </div>
      )}

      {toast && (
        <div className={`rg-toast${toast.ok ? "" : " bad"}`} role="status" aria-live="polite">
          <header><b>{toast.ok ? toast.title : `✕ ${toast.title}`}</b><button type="button" onClick={() => setToast(null)} aria-label="schließen">×</button></header>
          {toast.lines.length > 0 && <ul>{toast.lines.map((l, i) => <li key={i}>{l}</li>)}</ul>}
          {toast.note && <p>{toast.note}</p>}
        </div>
      )}
    </div>
  );
}

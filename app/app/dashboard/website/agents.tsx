"use client";

/**
 * Website-Agenten (Inhaber 04.10.2026): Karten je Agent (Name, Aufgabe, Rhythmus, Zustand, letztes Ergebnis, An/Aus)
 * und die Karte „Agent anlegen“ mit Vorlagen. Ausschalten statt Löschen. Beauftragt werden fällige Agenten vom
 * Wachhund (scripts/website_agents.py), umgesetzt von der JARVIS-Routine (:08/:23/:38/:53).
 */
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { NAME_MAX, RHYTHMUS, TASK_MAX, TEMPLATES, agentState, type Rhythmus, type TaskStatus, type WebsiteAgent } from "@/lib/website";
import { Icon } from "@/app/icons";
import { createWebsiteAgent, setWebsiteAgentActive } from "./actions";

type TaskLite = { status: TaskStatus; agent: number; progress: number; step: string | null };

export function WebsiteAgents({ agents, tasks, now: nowIso, startAt, missing }: {
  agents: WebsiteAgent[]; tasks: Record<string, TaskLite>; now: string; startAt: string; missing: boolean;
}) {
  const router = useRouter();
  const now = new Date(nowIso);
  const [open, setOpen] = useState(agents.length === 0);
  const [name, setName] = useState("");
  const [task, setTask] = useState("");
  const [rh, setRh] = useState<Rhythmus>("woechentlich");
  const [err, setErr] = useState<string | null>(null);
  const [busy, start] = useTransition();

  const pick = (i: number) => { const t = TEMPLATES[i]; setName(t.name); setTask(t.aufgabe); setRh(t.rhythmus); setErr(null); };
  const save = () => start(async () => {
    const r = await createWebsiteAgent({ name, aufgabe: task, rhythmus: rh });
    if (!r.ok) { setErr(r.error); return; }
    setErr(null); setName(""); setTask(""); setOpen(false);
    router.refresh();
  });
  const toggle = (a: WebsiteAgent) => start(async () => {
    const r = await setWebsiteAgentActive(a.id, !a.aktiv);
    if (!r.ok) { setErr(r.error); return; }
    router.refresh();
  });

  return (
    <section className="ws-agents" aria-label="Website-Agenten">
      <h2 className="ws-h"><Icon name="agent" size={17} />Website-Agenten<em>{agents.filter((a) => a.aktiv).length} aktiv</em></h2>
      {err && <p className="ws-err" role="alert"><Icon name="achtung" size={15} />{err}</p>}
      <div className="ws-grid">
        {agents.map((a) => {
          const t = a.last_task_id ? tasks[a.last_task_id] ?? null : null;
          const st = agentState(a, t, now, startAt);
          return (
            <article key={a.id} className={`ws-card${a.aktiv ? "" : " off"}`}>
              <div className="ws-card-h">
                <span className={`ws-orb s-${st.tone}`} aria-hidden><Icon name="agent" size={18} /></span>
                <b title={a.name}>{a.name}</b>
                <button type="button" role="switch" aria-checked={a.aktiv} className={`ws-sw${a.aktiv ? " on" : ""}`} disabled={busy}
                  onClick={() => toggle(a)} aria-label={a.aktiv ? `${a.name} ausschalten` : `${a.name} einschalten`}><i /></button>
              </div>
              <p className="ws-task">{a.aufgabe}</p>
              <div className="ws-meta">
                <span className="ws-chip"><Icon name="wiederholen" size={12} />{RHYTHMUS[a.rhythmus]}</span>
                <span className={`ws-chip s-${st.tone}`}><Icon name={st.tone === "work" ? "werk" : st.tone === "wait" ? "uhr" : st.tone === "bad" ? "achtung" : st.tone === "aus" ? "pause" : "ok"} size={12} />{st.text}</span>
                {t && (t.status === "offen" || t.status === "laeuft") && <span className="ws-chip">A{t.agent}</span>}
              </div>
              {t?.status === "laeuft" && <span className="ws-bar" aria-label={`${t.progress} %`}><i style={{ width: `${Math.max(5, t.progress)}%` }} /></span>}
              {a.last_result && <p className="ws-res" title={a.last_result}><Icon name={a.last_result.startsWith("Fehler") ? "achtung" : "ok"} size={13} /><span>{a.last_result}</span></p>}
            </article>
          );
        })}

        <article className={`ws-card ws-new${open ? " open" : ""}`}>
          {!open ? (
            <button type="button" className="ws-add" onClick={() => setOpen(true)} disabled={missing}>
              <span className="ws-orb" aria-hidden><Icon name="mehr" size={18} /></span><b>Agent anlegen</b>
            </button>
          ) : (
            <form className="ws-form" onSubmit={(e) => { e.preventDefault(); save(); }}>
              <div className="ws-tpl" role="list" aria-label="Vorlagen">
                {TEMPLATES.map((t, i) => (
                  <button key={t.name} type="button" role="listitem" className={name === t.name ? "on" : ""} onClick={() => pick(i)} title={t.aufgabe}>
                    <Icon name={t.icon} size={14} />{t.name}
                  </button>
                ))}
              </div>
              <label><span>Name</span><input value={name} onChange={(e) => setName(e.target.value)} maxLength={NAME_MAX} placeholder="z. B. Fehler & Links" required /></label>
              <label><span>Aufgabe in einem Satz</span><input value={task} onChange={(e) => setTask(e.target.value)} maxLength={TASK_MAX} placeholder="Was soll er regelmäßig tun?" required /></label>
              <div className="ws-seg" role="radiogroup" aria-label="Rhythmus">
                {(Object.keys(RHYTHMUS) as Rhythmus[]).map((r) => (
                  <button key={r} type="button" role="radio" aria-checked={rh === r} className={rh === r ? "on" : ""} onClick={() => setRh(r)}>{RHYTHMUS[r]}</button>
                ))}
              </div>
              <div className="ws-form-f">
                <button type="button" className="ws-ghost" onClick={() => { setOpen(false); setErr(null); }}>Abbrechen</button>
                <button type="submit" className="ws-go" disabled={busy || name.trim().length < 2 || task.trim().length < 5}><Icon name="ok" size={15} />Speichern</button>
              </div>
            </form>
          )}
        </article>
      </div>
      {missing && <p className="ws-note"><Icon name="info" size={14} />Wird gerade eingerichtet.</p>}
    </section>
  );
}

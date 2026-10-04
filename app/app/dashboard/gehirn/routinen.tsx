import type { AgentTask } from "@/lib/agents";
import { nextRun, scheduleLabel, whenLabel, type BrainRoutine } from "@/lib/brain-routines";
import { berlin } from "@/lib/dashboard-logic";
import { mdFileName, mdToHtml } from "@/lib/markdown";
import type { KnowledgeDoc } from "@/lib/jarvis-llm";
import { Icon } from "@/app/icons";
import { Fold } from "./fold";
import { RoutineEdit, RoutineForm } from "./routine-form";
import { runRoutineNow, toggleRoutine } from "./routine-actions";

/**
 * Abschnitte „Routinen“ (#routinen) und „Wissen“ (#wissen) der Gehirn-Seite (Inhaber 04.10.2026: „beim gehirn mit ihm
 * auch einzelne workflows bauen … alles was er dort lernt soll in mds gepackt werden“). Wenig Text: je Routine eine
 * Zeile (Punkt, Name, Plan, nächster Lauf, letztes Ergebnis), Knöpfe als Linien-Icons. Wissen: Liste, Klick zeigt das
 * Markdown (sicher gerendert, lib/markdown.ts) und „.md herunterladen“.
 */
const QUELLE: Record<string, string> = { routine: "Routine", chat: "Chat", agent: "Agent", inhaber: "Inhaber" };
const STATUS: Record<string, string> = { offen: "startet gleich", laeuft: "in Arbeit", fertig: "fertig", fehler: "Fehler", abgebrochen: "abgebrochen" };

export function Routinen({ routines, tasks, now, error }: { routines: BrainRoutine[]; tasks: AgentTask[]; now: Date; error?: string | null }) {
  const active = routines.filter((r) => r.aktiv);
  const next = active.map((r) => nextRun(r, now)).filter((d): d is Date => !!d).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const byId = new Map(tasks.map((t) => [t.id, t]));
  return (
    <Fold name="routinen" open title="Routinen" icon={<Icon name="uhr" size={16} />}
      summary={<span className="gh-sum-n"><b>{active.length}</b>/{routines.length} aktiv{next ? <> · nächste <b>{whenLabel(next, now)}</b></> : null}</span>}>
      {error && <p className="gh-rerr" role="alert"><Icon name="achtung" size={14} /> {error}</p>}
      {routines.length > 0 ? (
        <ul className="gh-rts">
          {routines.map((r) => {
            const t = r.last_task_id ? byId.get(r.last_task_id) : undefined;
            const busy = t && (t.status === "offen" || t.status === "laeuft");
            return (
              <li key={r.id} className={`gh-rt${r.aktiv ? "" : " off"}`}>
                <i className={`gh-d t-${!r.aktiv ? "grey" : busy ? "gold" : "green"}`} title={r.aktiv ? "aktiv" : "pausiert"} />
                <div className="gh-rt-m">
                  <b title={r.aufgabe}>{r.name}</b>
                  <span>{scheduleLabel(r)}{r.aktiv ? <> · <em>{whenLabel(nextRun(r, now), now)}</em></> : " · pausiert"}</span>
                  {busy ? <span className="gh-rt-r busy"><Icon name="werk" size={12} /> A{t!.agent} · {t!.status === "laeuft" ? `${t!.progress} %` : STATUS[t!.status]}</span>
                    : r.last_result ? <span className="gh-rt-r" title={r.last_result}>{r.last_result}</span>
                    : r.last_run_at ? <span className="gh-rt-r">zuletzt {berlin(r.last_run_at)}</span> : null}
                </div>
                <span className="gh-rt-a">
                  <form action={runRoutineNow}><input type="hidden" name="id" value={r.id} />
                    <button className="gh-ib" disabled={!!busy} aria-label="Jetzt starten" title="Jetzt starten"><Icon name="start" size={14} /></button></form>
                  <form action={toggleRoutine}><input type="hidden" name="id" value={r.id} />
                    <button name="aktiv" value={r.aktiv ? "false" : "true"} className="gh-ib" aria-label={r.aktiv ? "Pausieren" : "Fortsetzen"} title={r.aktiv ? "Pausieren" : "Fortsetzen"}>
                      <Icon name={r.aktiv ? "pause" : "wiederholen"} size={14} /></button></form>
                  <RoutineEdit routine={r} />
                </span>
              </li>
            );
          })}
        </ul>
      ) : <p className="gh-calm"><Icon name="info" size={15} /> Noch keine Routine – Vorlage wählen oder im Gehirn-Chat sagen („jeden Tag um 14 Uhr …“).</p>}
      <details className="gh-rnew">
        <summary><Icon name="neu" size={15} /> Neue Routine</summary>
        <RoutineForm />
      </details>
    </Fold>
  );
}

export function Wissen({ docs, open: openSlug }: { docs: (KnowledgeDoc & { id: string })[]; open?: string | null }) {
  const latest = docs[0]?.updated_at ?? null;
  return (
    <Fold name="wissen" open={!!openSlug || docs.length > 0} title="Wissen" icon={<Icon name="gehirn" size={16} />}
      summary={<span className="gh-sum-n"><b>{docs.length}</b> Notizen{latest ? <> · zuletzt {berlin(latest).split(" ")[0]}</> : null}</span>}>
      {docs.length ? (
        <ul className="gh-kn">
          {docs.map((d) => (
            <li key={d.id}>
              <details open={openSlug === d.slug} id={`wissen-${d.slug}`}>
                <summary>
                  <Icon name="dokument" size={14} />
                  <b>{d.titel}</b>
                  <span className="gh-kn-m"><em className={`q-${d.quelle}`}>{QUELLE[d.quelle] ?? d.quelle}</em><time>{berlin(d.updated_at)}</time></span>
                </summary>
                <div className="gh-md" dangerouslySetInnerHTML={{ __html: mdToHtml(d.markdown) }} />
                <a className="gh-dl" download={mdFileName(d.slug)} href={`data:text/markdown;charset=utf-8,${encodeURIComponent(d.markdown)}`}>
                  <Icon name="export" size={13} /> als .md herunterladen</a>
              </details>
            </li>
          ))}
        </ul>
      ) : <p className="gh-calm"><Icon name="info" size={15} /> Noch kein Wissen – Routinen und der Gehirn-Chat schreiben hier ihre Erkenntnisse hinein.</p>}
    </Fold>
  );
}

export const GH_ROUT_CSS = `
.dash .gh-topbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;min-width:0}
.dash .gh-talk{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 16px;border-radius:999px;font-weight:700;font-size:13.5px;text-decoration:none;
  color:#02060f!important;background:linear-gradient(180deg,#f2dcae,#e2c68f);box-shadow:0 0 16px rgba(226,198,143,.55)}
.dash .gh-rts{list-style:none;margin:0 0 12px;padding:0;display:grid;gap:8px}
.dash .gh-rt{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:6px 12px;padding:10px 12px;border:1px solid var(--line);border-radius:10px;background:rgba(4,12,26,.55);min-width:0}
.dash .gh-rt.off{opacity:.65}
.dash .gh-rt-m{display:flex;flex-direction:column;gap:2px;min-width:0}
.dash .gh-rt-m b{font-size:14.5px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dash .gh-rt-m>span{font-size:12.5px;color:var(--soft);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-variant-numeric:tabular-nums}
.dash .gh-rt-m em{font-style:normal;color:var(--gold2)}
.dash .gh-rt-r.busy{color:var(--gold2);display:inline-flex;align-items:center;gap:4px}
.dash .gh-rt-a{display:flex;gap:6px;align-items:center}
.dash .gh-rt-a form{margin:0}
.dash .gh-rt-edit{grid-column:1/-1;width:100%}
.dash .gh-rt:has(.gh-rt-edit) .gh-rt-a{grid-column:1/-1;display:block}
.dash .gh-ib{display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:8px;border:1px solid var(--line);background:transparent;color:var(--cy2);cursor:pointer}
.dash .gh-ib:disabled{opacity:.4;cursor:default}
.dash .gh-rerr{display:flex;align-items:center;gap:6px;margin:0 0 10px;font-size:13px;color:#ffd0d6}
.dash .gh-rnew>summary{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid rgba(226,198,143,.5);color:var(--gold2);cursor:pointer;list-style:none;font-weight:600;font-size:13.5px}
.dash .gh-rnew>summary::-webkit-details-marker{display:none}
.dash .gh-rnew[open]>summary{margin-bottom:10px}
.dash .gh-rf{display:grid;gap:10px;padding:12px;border:1px solid var(--line);border-radius:10px;background:rgba(4,12,26,.6);min-width:0}
.dash .gh-rf label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:var(--soft);min-width:0}
.dash .gh-rf input,.dash .gh-rf select,.dash .gh-rf textarea{font:inherit;font-size:14.5px;padding:8px 10px;border-radius:8px;min-width:0;width:100%;box-sizing:border-box}
.dash .gh-rf textarea{resize:vertical}
.dash .gh-rf-row{display:grid;grid-template-columns:minmax(0,2fr) minmax(90px,1fr) minmax(70px,.7fr) minmax(110px,1fr);gap:8px}
.dash .gh-rf-tpl{display:flex;flex-wrap:wrap;gap:6px}
.dash .gh-rf-tpl button{display:inline-flex;align-items:center;gap:5px;min-height:36px;padding:0 12px;border-radius:999px;border:1px solid rgba(95,212,255,.35);background:rgba(95,212,255,.06);color:var(--cy2);font-size:12.5px;cursor:pointer}
.dash .gh-rf-wd{display:flex;flex-wrap:wrap;gap:6px}
.dash .gh-rf-wd label{flex-direction:row;align-items:center;gap:5px;min-height:36px;padding:0 10px;border-radius:8px;border:1px solid var(--line);cursor:pointer;color:var(--text);font-size:13px}
.dash .gh-rf-wd label.on{border-color:var(--gold);color:var(--gold2)}
.dash .gh-rf-wd input{width:auto}
.dash .gh-rf-f{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.dash .gh-rf-f small{flex:1;min-width:0;display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--soft)}
.dash .gh-rf-f .primary{display:inline-flex;align-items:center;gap:6px;min-height:40px}
.dash .gh-kn{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.dash .gh-kn details{border:1px solid var(--line);border-radius:10px;background:rgba(4,12,26,.55);min-width:0}
.dash .gh-kn summary{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 12px;min-height:44px;cursor:pointer;list-style:none}
.dash .gh-kn summary::-webkit-details-marker{display:none}
.dash .gh-kn summary>svg{color:var(--gold);flex:none}
.dash .gh-kn summary b{flex:1;min-width:0;font-size:14px;color:#fff;overflow-wrap:anywhere}
.dash .gh-kn-m{display:inline-flex;align-items:center;gap:8px;font-size:12px;color:var(--soft)}
.dash .gh-kn-m em{font-style:normal;padding:1px 8px;border-radius:999px;border:1px solid var(--line)}
.dash .gh-kn-m em.q-routine{border-color:rgba(226,198,143,.5);color:var(--gold2)}
.dash .gh-kn-m em.q-chat{border-color:rgba(95,212,255,.45);color:var(--cy2)}
.dash .gh-kn details[open]>summary{border-bottom:1px solid var(--line)}
.dash .gh-md{padding:10px 14px;font-size:14px;line-height:1.55;overflow-wrap:anywhere;min-width:0}
.dash .gh-md h2,.dash .gh-md h3,.dash .gh-md h4{margin:12px 0 6px;font-size:15px;color:var(--gold2)}
.dash .gh-md p{margin:6px 0}.dash .gh-md ul,.dash .gh-md ol{margin:6px 0;padding-left:20px}
.dash .gh-md code{font-family:var(--mono);font-size:12.5px;padding:1px 5px;border-radius:5px;background:rgba(95,212,255,.08)}
.dash .gh-md pre{overflow:auto;padding:10px;border-radius:8px;background:rgba(2,8,18,.8);max-width:100%}
.dash .gh-md blockquote{margin:6px 0;padding:4px 10px;border-left:3px solid var(--gold);color:var(--soft)}
.dash .gh-md table{border-collapse:collapse;display:block;overflow-x:auto;max-width:100%;font-size:13px}
.dash .gh-md th,.dash .gh-md td{border:1px solid var(--line);padding:4px 8px;text-align:left}
.dash .gh-dl{display:inline-flex;align-items:center;gap:5px;margin:0 14px 12px;font-size:12.5px;color:var(--cy2)!important;text-decoration:none;min-height:32px}
@media (max-width:640px){
  .dash .gh-rt{grid-template-columns:auto minmax(0,1fr)}
  .dash .gh-rt-a{grid-column:1/-1;justify-content:flex-end}
  .dash .gh-rf-row{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}
  .dash .gh-rf-name{grid-column:1/-1}
}
`;

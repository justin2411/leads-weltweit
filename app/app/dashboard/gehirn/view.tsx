import type { CSSProperties, ReactNode } from "react";
import type { AgentTask } from "@/lib/agents";
import { ago, berlin, compact } from "@/lib/dashboard-logic";
import { abTests, brainNow, latestReport, pagesByPage, pct, timeline, upcoming, type BrainSettings, type Decision, type PageStat, type Workflow } from "@/lib/gehirn";
import { Icon, type IconName } from "@/app/icons";
import { reviewDecision, setStatus, updateSetting } from "../brain-actions";
import { Crumbs, Kpi } from "../v2";
import { BrainCore } from "./brain-core";
import { Fold } from "./fold";
import { GH_CSS } from "./gehirn-css";

/**
 * Ansicht der Gehirn-Seite (Daten aus page.tsx). Inhaber 04.10.2026: „optimiere das gehirn … großes gehirn in die mitte wo ich die aktuellen abläufe auch
 * sehe und woran er gerade arbeitet … animiert … auf und zu klappbar … merken was ich ausklappe“).
 * Oben das Gehirn mit Ablauf-Knoten (Live-Daten), darunter Abläufe, Schalter, Seiten, Entscheidungen, Umgebung –
 * jeder Abschnitt klappbar, Zustand je Abschnitt im Browser (gh:fold:<abschnitt>). Aktionen unverändert aus
 * brain-actions.ts; Live-Schalten nur mit Rechtstexten. Daten nur serverseitig, Aktualisierung über AutoRefresh (30 s).
 */
const SWITCHES: [string, string, string][] = [
  ["brain_enabled", "Gehirn aktiv", "aus = nur beobachten"],
  ["auto_publish_pages", "Seiten selbst live", "Stufe 2"],
  ["auto_merge_content", "Inhalts-PRs selbst mergen", "Stufe 3"],
  ["legal_ready", "Rechtstexte veröffentlicht", "nur wenn Impressum, Datenschutz, AGB fertig"],
];
const STATUS: Record<string, string> = {
  live: "live", draft: "Entwurf", review: "Prüfung", retired: "stillgelegt", proposed: "Vorschlag", done: "erledigt", rejected: "abgelehnt",
  laeuft: "läuft", offen: "wartet", fertig: "fertig", fehler: "Fehler", abgebrochen: "abgebrochen",
};
const TYPE: Record<string, string> = {
  page_new: "neue Seite", page_variant: "Variante", page_winner: "Gewinner", page_retire: "Seite weg", segment: "Zielgruppe", safety: "Sicherheit",
  daily_note: "Tagesnotiz", weekly_report: "Wochenbericht", webhook: "Webhook", delivery: "Lieferung", note: "Notiz",
};
const tone = (s: string) =>
  s === "live" || s === "done" || s === "fertig" ? "t-green" : s === "proposed" || s === "review" || s === "laeuft" ? "t-gold" : s === "fehler" ? "t-red" : "t-grey";
type V = CSSProperties & Record<`--${string}`, string | number>;

function Pill({ s, title }: { s: string; title?: string }) {
  return <span className={`pill ${tone(s)}`} title={title}>{STATUS[s] ?? s}</span>;
}

function Progress({ t }: { t: AgentTask }) {
  const p = Math.max(0, Math.min(100, Math.round(t.progress ?? 0)));
  return (
    <div className="gh-task">
      <div className="gh-task-h">
        <span className="gh-ag">A{t.agent}</span>
        <span className="gh-task-t" title={t.brief}>{t.brief}</span>
        <b className="gh-num">{p} %</b>
      </div>
      <div className="gh-bar" role="progressbar" aria-valuenow={p} aria-valuemin={0} aria-valuemax={100}><i style={{ width: `${p}%` }} /></div>
      <div className="gh-task-s">{t.step ?? "startet …"}{t.started_at && <span className="muted"> · seit {berlin(t.started_at, false)}</span>}</div>
    </div>
  );
}

/** Ablauf-Knoten rund um das Gehirn (klappbar, Zustand gemerkt). */
function Node({ name, icon, title, value, sub, open, side, children }: {
  name: string; icon: IconName; title: string; value: ReactNode; sub: ReactNode; open: boolean; side: "l" | "r"; children: ReactNode;
}) {
  return (
    <Fold name={`knoten-${name}`} open={open} className={`gh-node side-${side}`}
      icon={<span className="gh-ico"><Icon name={icon} size={16} /></span>}
      title={title}
      summary={<><b className="gh-nv">{value}</b><span className="gh-ns">{sub}</span></>}>
      {children}
    </Fold>
  );
}

export type GehirnProps = {
  now: Date; settings: BrainSettings; pages: PageStat[]; decisions: Decision[]; report: Decision | null; error: string | null;
  tasks: AgentTask[]; workflows: Workflow[]; env: { name: string; purpose: string; required: boolean; set: boolean }[];
  legalFiles: boolean; stripe: { live: boolean; test: boolean };
};

export function GehirnView({ now, settings: s, pages: pg, decisions: rawDec, report, error: err, tasks, workflows, env, legalFiles, stripe }: GehirnProps) {
  const envMissing = env.filter((e) => e.required && !e.set);
  const canLive = legalFiles && !!s.legal_ready;
  const flag = (k: string) => !!(s as Record<string, unknown>)[k];
  // offene Vorschläge zuerst, danach die neuesten
  const dec: Decision[] = [...rawDec].sort((a, b) => Number(b.status === "proposed") - Number(a.status === "proposed"));
  const open = dec.filter((d) => d.status === "proposed").length;
  const groups = pagesByPage(pg);
  const livePages = groups.filter((g) => g.page_status === "live").length;
  const views = pg.reduce((a, p) => a + (Number(p.views) || 0), 0);
  const samples = pg.reduce((a, p) => a + (Number(p.sample_requests) || 0), 0);
  const tests = abTests(pg);
  const brain = brainNow({ settings: s, tasks, decisions: rawDec, now });
  const next = upcoming(workflows, now, 7);
  const events = timeline(rawDec, tasks, 10);
  const daily = report ?? latestReport(rawDec);
  const switchesOn = SWITCHES.filter(([k]) => flag(k)).length;

  return (
    <div className="v2 gh">
      <style dangerouslySetInnerHTML={{ __html: GH_CSS }} />
      <Crumbs items={[["JARVIS", "/dashboard/jarvis"], ["Gehirn", ""]]} />
      {err && <div className="card bad"><Icon name="fehler" size={16} /> Gehirn-Tabellen nicht lesbar: {err}</div>}
      <div className="kpis2 four">
        <Kpi value={s.brain_enabled ? "an" : "aus"} label="Gehirn" tip="stündliche Sitzung nach docs/GEHIRN-SITZUNG.md" />
        <Kpi value={compact(livePages)} label="Seiten live" tip={`${pg.length} Varianten insgesamt`} />
        <Kpi value={compact(open)} label="Vorschläge offen" tip="Entscheidungen des Gehirns, die auf dich warten" />
        <Kpi value={legalFiles ? "fertig" : "fehlen"} label="Rechtstexte" tip={legalFiles ? "app/content/legal.ts" : "noch Platzhalter – Landingpages bleiben offline"} />
      </div>

      {/* ------------------------------------------------------------------ Gehirn mit Ablauf-Knoten */}
      <Fold name="gehirn" open title="Gehirn" icon={<Icon name="gehirn" size={16} />} className="gh-main"
        summary={<span className={`gh-live m-${brain.mode}`}><i />{brain.label}</span>}>
        <div className="gh-stage">
          <div className="gh-center">
            <BrainCore mode={brain.mode} label={brain.label} hot={brain.hot} />
            <p className="gh-voice" aria-live="polite"><span>woran er arbeitet</span>{brain.sentence}</p>
          </div>
          <div className="gh-col l">
            <Node name="agenten" side="l" icon="agent" title="Agenten" open={brain.running.length > 0}
              value={brain.running.length} sub={brain.running.length ? `laufen${brain.queued ? ` · ${brain.queued} warten` : ""}` : brain.queued ? `${brain.queued} warten` : "keiner läuft"}>
              {brain.running.length ? brain.running.map((t) => <Progress key={t.id} t={t} />) : <p className="muted">Gerade läuft kein Auftrag.</p>}
              <a className="gh-more" href="/dashboard/jarvis">Aufträge in JARVIS <Icon name="weiter" size={13} /></a>
            </Node>
            <Node name="entscheidungen" side="l" icon="freigabe" title="Entscheidungen" open={false}
              value={open || dec.length} sub={open ? "warten auf dich" : rawDec[0] ? `zuletzt ${ago(rawDec[0].created_at, now)}` : "noch keine"}>
              <ul className="gh-mini">
                {rawDec.slice(0, 4).map((d) => (
                  <li key={d.id}><Pill s={d.status} /><span className="gh-mt" title={d.subject}>{d.subject}</span><time>{berlin(d.created_at)}</time></li>
                ))}
                {!rawDec.length && <li className="muted">Noch keine Entscheidungen.</li>}
              </ul>
            </Node>
            <Node name="bericht" side="l" icon="tagescheck" title="Tagesbericht" open={false}
              value={daily ? berlin(daily.created_at).split(" ")[0] : "–"} sub={daily ? TYPE[daily.type] ?? daily.type : "noch keiner"}>
              {daily ? (
                <div className="gh-report">
                  <b>{daily.subject}</b>
                  {daily.reasoning && <p>{daily.reasoning}</p>}
                  <time className="muted">{berlin(daily.created_at)}</time>
                </div>
              ) : <p className="muted">Die erste Sitzung nach 06:00 Uhr schreibt die Tagesnotiz.</p>}
            </Node>
          </div>
          <div className="gh-col r">
            <Node name="tests" side="r" icon="weiche" title="A/B-Tests" open={false}
              value={tests.length} sub={tests.length ? `${tests.reduce((a, t) => a + t.variants.length, 0)} Varianten im Test` : "keiner läuft"}>
              {tests.length ? tests.map((t) => {
                const max = Math.max(...t.variants.map((v) => v.rate), 0.0001);
                return (
                  <div key={t.slug} className="gh-ab">
                    <b>{t.slug}</b>
                    {t.variants.map((v) => (
                      <div key={v.key} className={`gh-abv ${t.leader === v.key ? "lead" : ""}`} title={`${compact(v.views)} Aufrufe · ${compact(v.samples)} Proben · ${v.share} % der Besucher`}>
                        <span>{v.key}</span>
                        <div className="gh-bar"><i style={{ width: `${(100 * v.rate) / max}%` }} /></div>
                        <em>{pct(v.samples, v.views)}</em>
                      </div>
                    ))}
                    <span className="muted small">{t.leader ? `Variante ${t.leader} vorn` : "noch zu wenig Aufrufe (ab 20 je Variante)"}</span>
                  </div>
                );
              }) : <p className="muted">Keine Seite mit zwei aktiven Varianten.</p>}
            </Node>
            <Node name="laeufe" side="r" icon="uhr" title="Nächste Läufe" open={false}
              value={next[0] ? berlin(next[0].at, false) : "–"} sub={next[0]?.name ?? "nichts geplant"}>
              <ul className="gh-mini">
                {next.map((u) => <li key={u.name}><time>{berlin(u.at, false)}</time><span className="gh-mt">{u.name}</span></li>)}
              </ul>
              <p className="muted small">Deutsche Zeit, laut Plan der Abläufe.</p>
            </Node>
            <Node name="stufen" side="r" icon="schloss" title="Freigaben" open={false} value={`${switchesOn}/${SWITCHES.length}`} sub="Schalter an">
              <ul className="gh-mini">
                {SWITCHES.map(([k, label]) => (
                  <li key={k}><span className={`gh-led ${flag(k) ? "on" : ""}`} /><span className="gh-mt">{label}</span><b>{flag(k) ? "an" : "aus"}</b></li>
                ))}
              </ul>
            </Node>
          </div>
        </div>
      </Fold>

      {/* ------------------------------------------------------------------ Abläufe */}
      <Fold name="ablaeufe" open title="Abläufe" icon={<Icon name="pipeline" size={16} />}
        summary={`${brain.running.length} laufen · ${brain.queued} warten · nächster ${next[0] ? berlin(next[0].at, false) : "–"}`}>
        <div className="gh-flow">
          <section>
            <h3 className="gh-h3">Jetzt</h3>
            {brain.running.length ? brain.running.map((t) => <Progress key={t.id} t={t} />) : <p className="muted">Kein Auftrag läuft gerade.{brain.queued ? ` ${brain.queued} warten auf die nächste Runde.` : ""}</p>}
          </section>
          <section>
            <h3 className="gh-h3">Als Nächstes</h3>
            <ol className="gh-tl next">
              {next.map((u, i) => (
                <li key={u.name} style={{ "--i": i } as V}><time>{berlin(u.at, false)}</time><span className="gh-tt">{u.name}</span></li>
              ))}
            </ol>
          </section>
          <section className="wide">
            <h3 className="gh-h3">Verlauf</h3>
            <ol className="gh-tl">
              {events.map((e, i) => (
                <li key={`${e.kind}-${e.at}-${i}`} className={e.kind}>
                  <time>{berlin(e.at)}</time>
                  <span className="gh-tt" title={e.detail ? `${e.title} – ${e.detail}` : e.title}><Icon name={e.kind === "auftrag" ? "agent" : "gehirn"} size={13} /> {e.title}</span>
                  <Pill s={e.status} />
                </li>
              ))}
              {!events.length && <li className="muted">Noch nichts passiert.</li>}
            </ol>
          </section>
        </div>
      </Fold>

      {/* ------------------------------------------------------------------ Schalter */}
      <Fold name="schalter" open={false} title="Schalter" icon={<Icon name="regler" size={16} />}
        summary={`${s.brain_enabled ? "Gehirn an" : "Gehirn aus"} · ${switchesOn}/${SWITCHES.length} an · max ${s.max_new_pages_per_week ?? 3} Seiten/Woche`}>
        <div className="gh-ctrls">
          <section className="gh-card">
            <h3 className="gh-h3" title="Was das Gehirn selbst darf. Jede Änderung wird als Entscheidung protokolliert.">Gehirn</h3>
            {SWITCHES.map(([k, label, hint]) => {
              const on = flag(k);
              const block = k === "legal_ready" && !legalFiles;
              return (
                <div key={k} className="gh-sw">
                  <span title={hint}>{label}<small>{hint}</small></span>
                  <form action={updateSetting} className="sw">
                    <input type="hidden" name="key" value={k} />
                    <button name="value" value="true" className={on ? "on go" : ""} disabled={on || block} title={block ? "Rechtstexte noch Platzhalter" : undefined}>an</button>
                    <button name="value" value="false" className={!on ? "on stop" : ""} disabled={!on}>aus</button>
                  </form>
                </div>
              );
            })}
          </section>
          <section className="gh-card">
            <h3 className="gh-h3" title="Höchstens so viele neue Landingpages legt das Gehirn je Woche an (0–20).">Neue Seiten pro Woche</h3>
            <form action={updateSetting} className="gh-max">
              <input type="hidden" name="key" value="max_new_pages_per_week" />
              <label><b>max</b>
                <input name="value" type="number" min={0} max={20} defaultValue={s.max_new_pages_per_week ?? 3} />
                <span className="muted">je Woche</span>
              </label>
              <button className="primary">Speichern</button>
            </form>
          </section>
          <section className="gh-card">
            <h3 className="gh-h3">Stand <span className="gh-lock"><Icon name="schloss" size={12} /> nur Anzeige</span></h3>
            <div className="gh-facts">
              <span>Rechtstexte <b className={legalFiles ? "ok" : "bad"}>{legalFiles ? "fertig" : "Platzhalter"}</b></span>
              <span>Stripe live <b>{stripe.live ? "bereit" : "aus"}</b> · Test <b>{stripe.test ? "bereit" : "aus"}</b></span>
              <span>Preise <b>{Array.isArray(s.pricing) && s.pricing.length ? `${s.pricing.length} Pakete` : "nicht hinterlegt"}</b></span>
              <span>Variablen <b className={envMissing.length ? "bad" : "ok"}>{envMissing.length ? `${envMissing.length} Pflicht fehlt` : "vollständig"}</b></span>
            </div>
          </section>
        </div>
      </Fold>

      {/* ------------------------------------------------------------------ Seiten */}
      <Fold name="seiten" open={false} title="Seiten" icon={<Icon name="start-seite" size={16} />}
        summary={`${groups.length} Seiten · ${livePages} live · ${pg.length} Varianten · ${compact(views)} Aufrufe · Quote ${pct(samples, views)}`}>
        {groups.length ? (
          <div className="gh-pages">
            {groups.map((g) => (
              <section key={g.page_id} className="gh-page">
                <header>
                  <a href={`/${g.slug}?vorschau=1`} className="gh-slug" title="Vorschau (zählt nicht)">{g.slug}</a>
                  <Pill s={g.page_status} title="Seite" />
                  <span className="gh-pm">{compact(g.views)} Aufrufe · Quote {pct(g.samples, g.views)}</span>
                  {g.page_status !== "live" && (
                    <form action={setStatus}><input type="hidden" name="table" value="page" /><input type="hidden" name="id" value={g.page_id} />
                      <button name="status" value="live" disabled={!canLive} title={canLive ? "Seite live schalten" : "erst mit Rechtstexten"}><Icon name="start" size={14} /> Seite live</button></form>
                  )}
                </header>
                {g.variants.map((p) => (
                  <div key={p.variant_id} className={`gh-var ${p.variant_status === "retired" ? "off" : ""}`}>
                    <span className="gh-vk">
                      <a href={`/${p.slug}?vorschau=1&v=${p.variant_key}`} title="Vorschau (zählt nicht)">Variante {p.variant_key}</a>
                      <Pill s={p.variant_status} title="Variante" />
                    </span>
                    <span className="gh-vs" title="Aufrufe · Klicks · Proben · Käufe">
                      <span><b>{compact(p.views)}</b> Aufrufe</span>
                      <span><b>{compact(p.cta_clicks)}</b> Klicks</span>
                      <span><b>{compact(p.sample_requests)}</b> Proben</span>
                      <span><b>{compact(p.purchases)}</b> Käufe</span>
                    </span>
                    <span className="gh-vq" title="Proben je Aufruf · Anteil der Besucher"><b>{pct(p.sample_requests, p.views)}</b><small>{p.traffic_share} % Besucher</small></span>
                    <span className="gh-acts">
                      {p.variant_status !== "live" && (
                        <form action={setStatus}><input type="hidden" name="table" value="variant" /><input type="hidden" name="id" value={p.variant_id} />
                          <button name="status" value="live" disabled={!canLive} title={canLive ? "Variante live schalten" : "erst mit Rechtstexten"}><Icon name="start" size={14} /> live</button></form>
                      )}
                      {p.variant_status !== "retired" && (
                        <form action={setStatus}><input type="hidden" name="table" value="variant" /><input type="hidden" name="id" value={p.variant_id} />
                          <button name="status" value="retired" title="Variante stilllegen (zurücknehmen)"><Icon name="stopp" size={14} /> Stilllegen</button></form>
                      )}
                    </span>
                  </div>
                ))}
              </section>
            ))}
          </div>
        ) : <p className="muted">Noch keine Seiten (legt scripts/brain.py an).</p>}
      </Fold>

      {/* ------------------------------------------------------------------ Entscheidungen */}
      <Fold name="entscheidungen" open={open > 0} title="Entscheidungen" icon={<Icon name="freigabe" size={16} />}
        summary={<>{open > 0 && <span className="pill t-gold">{open} offen</span>}<span>{dec.length} letzte · zuletzt {rawDec[0] ? berlin(rawDec[0].created_at) : "–"}</span></>}>
        <div className="gh-decs">
          {dec.map((d) => (
            <article key={d.id} className={`gh-dec ${d.status === "proposed" ? "wait" : ""}`}>
              <div className="gh-dh">
                <span className="gh-ds" title={d.subject}>{d.subject}</span>
                <span className="gh-dm">
                  <Pill s={d.status} />
                  <span className="pill t-next">{TYPE[d.type] ?? d.type}</span>
                  <time>{berlin(d.created_at)}</time>
                </span>
              </div>
              {(d.reasoning || d.action) && (
                <details className="gh-why">
                  <summary>Begründung</summary>
                  {d.reasoning && <p>{d.reasoning}</p>}
                  {d.action && <p className="muted">Aktion: {d.action}</p>}
                </details>
              )}
              {d.status === "proposed" && (
                <span className="gh-acts">
                  <form action={reviewDecision}><input type="hidden" name="id" value={d.id} />
                    <button name="status" value="done" className="primary"><Icon name="ok" size={14} /> Annehmen</button></form>
                  <form action={reviewDecision}><input type="hidden" name="id" value={d.id} />
                    <button name="status" value="rejected"><Icon name="fehler" size={14} /> Ablehnen</button></form>
                </span>
              )}
            </article>
          ))}
          {dec.length === 0 && <p className="muted">Noch keine Entscheidungen.</p>}
        </div>
      </Fold>

      {/* ------------------------------------------------------------------ Umgebung */}
      <Fold name="umgebung" open={false} title="Umgebung (Vercel)" icon={<Icon name="einstellungen" size={16} />}
        summary={<span className={`pill ${envMissing.length ? "t-red" : "t-green"}`}>{env.filter((e) => e.set).length}/{env.length} gesetzt</span>}>
        <div className="gh-envs">
          {env.map((e) => (
            <div key={e.name} className="gh-env">
              <span><code>{e.name}</code><small>{e.purpose}</small></span>
              <span className={`pill ${e.set ? "t-green" : e.required ? "t-red" : "t-grey"}`}>{e.set ? "gesetzt" : e.required ? "fehlt" : "optional"}</span>
            </div>
          ))}
        </div>
      </Fold>
    </div>
  );
}

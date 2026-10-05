import type { ReactNode } from "react";
import type { AgentTask } from "@/lib/agents";
import { berlin, compact } from "@/lib/dashboard-logic";
import {
  abTests, brainNow, clockAngle, clockMarks, decisionTone, latestReport, pagesByPage, pct, proposalGroups, relBars, satellites, splitShares, upcoming,
  type BrainSettings, type Decision, type PageStat, type Workflow,
} from "@/lib/gehirn";
import { grundVon, hatMehr, titelVon } from "@/lib/kurz";
import { proposalInScope, splitByScope } from "@/lib/test-scope";
import { TEST_SCOPE } from "@/lib/test-scope-data";
import { Icon, type IconName } from "@/app/icons";
import { reviewDecision, setStatus, updateSetting } from "../brain-actions";
import { Crumbs } from "../v2";
import { BrainStage } from "./brain-core";
import { Fold } from "./fold";
import { GH_CSS } from "./gehirn-css";
import { Tip, TipHost } from "./tips";
import { GH_ROUT_CSS, Routinen, Wissen } from "./routinen";
import { LivePoll } from "../live-poll";
import type { BrainRoutine } from "@/lib/brain-routines";
import type { KnowledgeDoc } from "@/lib/jarvis-llm";
import type { AbData } from "@/lib/ab-data";
import { AbMini, AbSection, GH_AB_CSS } from "./ab-section";

/**
 * Ansicht der Gehirn-Seite (Daten aus page.tsx). Inhaber 04.10.2026: „denk beim gehirn bitte dran wenig text und gute
 * grafiken bzw animationen“ und „gib allem den gleichen namen … oben draufklicken … richtige sektion öffnet sich“.
 * Jede Information steht an genau einer Stelle:
 * – Gehirn-Bühne: Agenten als Satelliten, nächste Läufe als Uhr-Ring, eine Zeile „woran er arbeitet“, daneben A/B-Tests
 *   (geteilte Balken), Freigaben (Leuchtpunkte), Tagesbericht (Icon + Datum). Details nur bei Hover/Tippen.
 * – Vorschläge (decisions): offene oben mit ✓/✗, darunter erledigt/abgelehnt als Filter, ältere als 7 Tage gedimmt.
 * – Seiten, Schalter, Umgebung: klappbar, Zustand gemerkt (gh:fold:*), Warnzustände öffnen.
 * Kacheln oben und Knoten am Gehirn springen zum Abschnitt (#vorschlaege, #seiten, #schalter …, useAnker).
 * Aktionen unverändert aus brain-actions.ts; Live-Schalten nur mit Rechtstexten.
 */
const SWITCHES: [string, string, string][] = [
  ["brain_enabled", "Gehirn aktiv", "aus = nur beobachten"],
  ["auto_publish_pages", "Seiten selbst live", "Stufe 2"],
  ["auto_merge_content", "Inhalts-PRs selbst mergen", "Stufe 3"],
  ["legal_ready", "Rechtstexte veröffentlicht", "nur wenn Impressum, Datenschutz, AGB fertig"],
];
const STATUS: Record<string, string> = {
  live: "live", draft: "Entwurf", review: "Prüfung", retired: "stillgelegt", proposed: "offen", done: "erledigt", rejected: "abgelehnt",
};
const TYPE_ICON: Record<string, IconName> = {
  page_new: "start-seite", page_variant: "weiche", page_winner: "stern", page_retire: "stopp", segment: "kaeufer", safety: "freigabe",
  daily_note: "tagescheck", weekly_report: "tagescheck", webhook: "verbinden", delivery: "lieferung", note: "info",
};
const pageTone = (s: string) => (s === "live" ? "green" : s === "review" || s === "draft" ? "gold" : "grey");
const day = (ts: string) => berlin(ts).split(" ")[0];

function Dot({ tone, title }: { tone: string; title?: string }) {
  return <i className={`gh-d t-${tone}`} title={title} />;
}

/** Kachel oben = Sprung zum Abschnitt. */
function Card({ value, label, href, tone }: { value: ReactNode; label: string; href: string; tone?: string }) {
  return (
    <a href={href} className={`kpi2 link gh-kpi ${tone ? `t-${tone}` : ""}`}>
      <span className="kv">{value}</span>
      <span className="kl">{label}</span>
      <span className="kgo" aria-hidden><Icon name="weiter" size={16} /></span>
    </a>
  );
}

/** Instrument am Gehirn: Kopf = Sprung zum Abschnitt. */
function Inst({ icon, title, href, value, children }: { icon: IconName; title: string; href: string; value?: ReactNode; children: ReactNode }) {
  return (
    <section className="gh-inst">
      <a href={href} className="gh-inst-h">
        <span className="gh-ico"><Icon name={icon} size={14} /></span><span>{title}</span>{value != null && <b>{value}</b>}<Icon name="weiter" size={13} />
      </a>
      {children}
    </section>
  );
}

/** Volltext klein und eingeklappt (Inhaber: Volltext nur hinter „Details“). */
function Full({ d }: { d: Decision }) {
  if (!hatMehr(d)) return null;
  return (
    <details className="gh-more">
      <summary>Details</summary>
      <div className="gh-full">
        <p><b>{d.subject}</b></p>
        {d.reasoning && <p>{d.reasoning}</p>}
        {d.action && <p>Aktion: {d.action}</p>}
      </div>
    </details>
  );
}

/** Vorschlag mit ✓/✗: Titel (1 Zeile), kurzer Grund (max. 2 Zeilen), Volltext hinter „Details“. */
function Proposal({ d, dim }: { d: Decision; dim?: boolean }) {
  const grund = grundVon(d);
  return (
    <article className={`gh-pc ${dim ? "dim" : ""}`}>
      <div className="gh-pc-h">
        <Dot tone="gold" title="offen" />
        <b className="gh-pc-t" title={d.subject}>{titelVon(d)}</b>
        <time>{day(d.created_at)}</time>
      </div>
      {grund && <p className="gh-pc-g">{grund}</p>}
      <div className="gh-pc-f">
        <Full d={d} />
        <span className="gh-yn">
          <form action={reviewDecision}><input type="hidden" name="id" value={d.id} />
            <button name="status" value="done" className="yes" aria-label="Annehmen" title="Annehmen"><Icon name="ok" size={16} /></button></form>
          <form action={reviewDecision}><input type="hidden" name="id" value={d.id} />
            <button name="status" value="rejected" className="no" aria-label="Ablehnen" title="Ablehnen"><Icon name="fehler" size={16} /></button></form>
        </span>
      </div>
    </article>
  );
}

export type GehirnProps = {
  now: Date; settings: BrainSettings; pages: PageStat[]; decisions: Decision[]; report: Decision | null; error: string | null;
  tasks: AgentTask[]; workflows: Workflow[]; env: { name: string; purpose: string; required: boolean; set: boolean }[];
  legalFiles: boolean; stripe: { live: boolean; test: boolean };
  /** Gehirn-Routinen (#routinen), Wissen (#wissen), Fehler beim Speichern, geöffnete Notiz, Gehirn-Chat */
  routines?: BrainRoutine[]; knowledge?: (KnowledgeDoc & { id: string })[]; routineError?: string | null; openDoc?: string | null; chatId?: string | null;
  /** A/B je Schritt: Trichter und Tests (lib/ab-data.ts loadAb) */
  ab?: AbData | null;
};

export function GehirnView({ now, settings: s, pages: pg, decisions: rawDec, report, error: err, tasks, workflows, env, legalFiles, stripe,
  routines = [], knowledge = [], routineError = null, openDoc = null, chatId = null, ab = null }: GehirnProps) {
  const envMissing = env.filter((e) => e.required && !e.set);
  const canLive = legalFiles && !!s.legal_ready;
  const flag = (k: string) => !!(s as Record<string, unknown>)[k];
  const daily = report ?? latestReport(rawDec);
  // Tests nur Webagenturen US/UK/FR (config/fokus.yaml tests, Inhaber 04.10.2026): andere Seiten/Vorschläge eingeklappt
  const scoped = splitByScope(TEST_SCOPE, pg as (PageStat & { segment_id?: string; country?: string })[]);
  const slugSeg = Object.fromEntries(pg.map((r) => [r.slug, String((r as { segment_id?: string }).segment_id ?? "")]));
  const vgAll = proposalGroups(rawDec, now, daily?.id ?? null);
  const vg = { ...vgAll, open: vgAll.open.filter((d) => proposalInScope(TEST_SCOPE, d.subject, slugSeg)) };
  const openOther = vgAll.open.length - vg.open.length;
  const open = vg.open.length;
  const groups = pagesByPage(scoped.tested);
  const otherPages = pagesByPage(scoped.other);
  const livePages = [...groups, ...otherPages].filter((g) => g.page_status === "live").length;
  const tests = abTests(scoped.tested);
  // Seiten-Tests stehen jetzt als Schritt „Landingpage“ in ab_tests; alte Seiten mit zwei Varianten ohne Eintrag bleiben sichtbar
  const abRunning = (ab?.tests ?? []).filter((t) => t.status === "laeuft").length;
  const pageOnly = tests.filter((t) => !(ab?.tests ?? []).some((x) => x.step === "landing" && x.status === "laeuft" && t.slug.startsWith(`${x.country.toLowerCase()}/`)));
  const brain = brainNow({ settings: s, tasks, decisions: rawDec, now });
  const sats = satellites(tasks);
  const marks = clockMarks(upcoming(workflows, now, 10));
  const switchesOn = SWITCHES.filter(([k]) => flag(k)).length;
  const strip = [...vg.open, ...vg.rest].slice(0, 14);
  const done = vg.rest.filter((d) => d.status === "done").length;
  const rejected = vg.rest.filter((d) => d.status === "rejected").length;
  const dailyGrund = daily ? grundVon(daily) : "";

  return (
    <TipHost>
      <div className="v2 gh">
        <style dangerouslySetInnerHTML={{ __html: GH_CSS + GH_ROUT_CSS + GH_AB_CSS }} />
        <LivePoll active={tasks.some((t) => t.status === "offen" || t.status === "laeuft")} />
        <div className="gh-topbar">
          <Crumbs items={[["JARVIS", "/dashboard/jarvis"], ["Gehirn", ""]]} />
          <a href={chatId ? `/dashboard/jarvis/chat?s=${chatId}` : "/dashboard/jarvis/chat"} className="gh-talk"><Icon name="gehirn" size={15} /> Mit dem Gehirn sprechen</a>
        </div>
        {err && <div className="card bad"><Icon name="fehler" size={16} /> Gehirn-Tabellen nicht lesbar: {err}</div>}

        <div className="kpis2 four">
          <Card value={s.brain_enabled ? "an" : "aus"} label="Gehirn" href="#schalter" tone={s.brain_enabled ? undefined : "grey"} />
          <Card value={compact(livePages)} label="Seiten live" href="#seiten" />
          <Card value={compact(open)} label="Vorschläge offen" href="#vorschlaege" tone={open ? "gold" : undefined} />
          <Card value={legalFiles ? "fertig" : "fehlen"} label="Rechtstexte" href="#schalter" tone={legalFiles ? undefined : "red"} />
        </div>

        {/* ---------------------------------------------------------------- Gehirn */}
        <Fold name="gehirn" aliases={["ablaeufe", "agenten"]} open={false} title="Gehirn-Uhr" icon={<Icon name="gehirn" size={16} />} className="gh-main"
          summary={<span className={`gh-live m-${brain.mode}`}><i />{brain.label}</span>}>
          <div className="gh-stage">
            <div className="gh-center">
              <BrainStage mode={brain.mode} label={brain.label} hot={brain.hot} sats={sats} marks={marks}
                nowAngle={clockAngle(now)} nowTime={berlin(now, false)} />
              <p className="gh-voice" aria-live="polite" title={brain.sentence}>
                <i className={`gh-vd m-${brain.mode}`} />
                {brain.mode === "wartet" ? <a href="#vorschlaege">{brain.line}</a> : <span>{brain.line}</span>}
              </p>
            </div>

            <div className="gh-col l">
              <Inst icon="weiche" title="A/B" href="#ab" value={abRunning + pageOnly.length || undefined}>
                {(abRunning > 0 || !pageOnly.length) && <AbMini data={ab} />}
                {pageOnly.map((t) => {
                  const w = splitShares(t.variants.map((v) => v.rate));
                  return (
                    <div key={t.slug} className="gh-ab">
                      <span className="gh-ab-s">{t.slug}</span>
                      <Tip className="gh-split" label={`A/B ${t.slug}: ${t.variants.map((v) => `${v.key} ${pct(v.samples, v.views)}`).join(", ")}`}
                        tip={<div className="gh-pop"><div className="gh-pop-h"><b>{t.slug}</b><span>{t.leader ? `${t.leader} vorn` : "zu wenig Aufrufe"}</span></div>
                          {t.variants.map((v) => <p key={v.key}><b>{v.key}</b> · {compact(v.views)} Aufrufe · {compact(v.samples)} Proben · {v.share} % Besucher</p>)}</div>}>
                        {t.variants.map((v, i) => (
                          <span key={v.key} className={`gh-seg ${t.leader === v.key ? "lead" : ""}`} style={{ width: `${w[i]}%` }}>
                            <b>{v.key}</b><em>{pct(v.samples, v.views)}</em>
                          </span>
                        ))}
                      </Tip>
                    </div>
                  );
                })}
              </Inst>
            </div>

            <div className="gh-col r">
              <Inst icon="schloss" title="Freigaben" href="#schalter" value={`${switchesOn}/${SWITCHES.length}`}>
                <div className="gh-leds">
                  {SWITCHES.map(([k, label, hint]) => (
                    <Tip key={k} className={`gh-led ${flag(k) ? "on" : ""}`} label={`${label}: ${flag(k) ? "an" : "aus"}`}
                      tip={<div className="gh-pop"><div className="gh-pop-h"><b>{label}</b><span>{flag(k) ? "an" : "aus"}</span></div><p>{hint}</p></div>}>
                      <i />
                    </Tip>
                  ))}
                </div>
              </Inst>
              <Inst icon="tagescheck" title="Bericht" href="#vorschlaege">
                {daily ? (
                  <Tip className="gh-rep" label={`Tagesbericht ${day(daily.created_at)}: ${titelVon(daily)}`}
                    tip={<div className="gh-pop wide"><div className="gh-pop-h"><b>{titelVon(daily)}</b><span>{berlin(daily.created_at)}</span></div>
                      {dailyGrund && <p>{dailyGrund}</p>}
                      {daily.reasoning && daily.reasoning.trim() !== dailyGrund && <p className="gh-full">{daily.reasoning}</p>}</div>}>
                    <Icon name="tagescheck" size={18} /><b>{day(daily.created_at)}</b>
                  </Tip>
                ) : <span className="gh-none" title="Die erste Sitzung nach 06:00 Uhr schreibt die Tagesnotiz">–</span>}
              </Inst>
            </div>
          </div>
        </Fold>

        {/* ---------------------------------------------------------------- A/B je Schritt */}
        <AbSection data={ab} />

        {/* ---------------------------------------------------------------- Vorschläge */}
        <Fold name="vorschlaege" aliases={["entscheidungen"]} open={open > 0} title="Vorschläge" icon={<Icon name="freigabe" size={16} />}
          summary={<>
            {open > 0 && <span className="pill t-gold">{open} offen</span>}
            <span className="gh-strip" aria-hidden>{strip.map((d) => <i key={d.id} className={`t-${decisionTone(d.status)}`} />)}</span>
          </>}>
          {vg.open.length > 0 ? <div className="gh-pcs">{vg.open.map((d) => <Proposal key={d.id} d={d} />)}</div>
            : <p className="gh-calm"><Icon name="ok-kreis" size={16} /> nichts offen</p>}
          {openOther > 0 && <p className="muted" title="Tests nur Webagenturen US/UK/FR (config/fokus.yaml)">{openOther} zu anderen Zielgruppen ruhen – Freigabe durch dich</p>}

          {vg.rest.length > 0 && (
            <div className="gh-vlist">
              <div className="gh-filter" role="radiogroup" aria-label="Filter">
                <input type="radio" name="gh-vf" id="gh-vf-all" defaultChecked /><label htmlFor="gh-vf-all">alle <b>{vg.rest.length}</b></label>
                <input type="radio" name="gh-vf" id="gh-vf-done" /><label htmlFor="gh-vf-done"><Dot tone="green" />erledigt <b>{done}</b></label>
                <input type="radio" name="gh-vf" id="gh-vf-rej" /><label htmlFor="gh-vf-rej"><Dot tone="grey" />abgelehnt <b>{rejected}</b></label>
              </div>
              <ol className="gh-tl">
                {vg.rest.map((d) => {
                  const grund = grundVon(d);
                  return (
                    <li key={d.id} className={`s-${d.status}`}>
                      <details>
                        <summary>
                          <Dot tone={decisionTone(d.status)} title={STATUS[d.status] ?? d.status} />
                          <time>{day(d.created_at)}</time>
                          <span className="gh-tt">{titelVon(d)}</span>
                          <Icon name={TYPE_ICON[d.type] ?? "info"} size={13} />
                        </summary>
                        <div className="gh-tl-b">
                          {grund ? <p>{grund}</p> : <p className="muted">ohne Begründung</p>}
                          <Full d={d} />
                        </div>
                      </details>
                    </li>
                  );
                })}
              </ol>
            </div>
          )}

          {vg.old.length > 0 && (
            <details className="gh-old">
              <summary>älter <b>{vg.old.length}</b></summary>
              <div className="gh-pcs">{vg.old.map((d) => <Proposal key={d.id} d={d} dim />)}</div>
            </details>
          )}
        </Fold>

        {/* ---------------------------------------------------------------- Routinen und Wissen */}
        <Routinen routines={routines} tasks={tasks} now={now} error={routineError} />
        <Wissen docs={knowledge} open={openDoc} />

        {/* ---------------------------------------------------------------- Seiten */}
        <Fold name="seiten" open={false} title="Seiten" icon={<Icon name="start-seite" size={16} />}
          summary={<span className="gh-sum-n"><b>{livePages}</b>/{groups.length + otherPages.length} live</span>}>
          {groups.length ? (
            <div className="gh-pages">
              {groups.map((g) => {
                const bars = relBars(g.variants.map((p) => (p.views > 0 ? p.sample_requests / p.views : 0)));
                return (
                  <section key={g.page_id} className="gh-page">
                    <header>
                      <Dot tone={pageTone(g.page_status)} title={STATUS[g.page_status] ?? g.page_status} />
                      <a href={`/${g.slug}?vorschau=1`} className="gh-slug" title="Vorschau (zählt nicht)">{g.slug}</a>
                      <b className="gh-q" title={`${compact(g.views)} Aufrufe · ${compact(g.samples)} Proben`}>{pct(g.samples, g.views)}</b>
                      {g.page_status !== "live" && (
                        <form action={setStatus}><input type="hidden" name="table" value="page" /><input type="hidden" name="id" value={g.page_id} />
                          <button name="status" value="live" disabled={!canLive} className="gh-ib" aria-label="Seite live schalten" title={canLive ? "Seite live schalten" : "erst mit Rechtstexten"}><Icon name="start" size={14} /></button></form>
                      )}
                    </header>
                    {g.variants.map((p, i) => (
                      <div key={p.variant_id} className={`gh-var ${p.variant_status === "retired" ? "off" : ""}`}>
                        <a className="gh-vk" href={`/${p.slug}?vorschau=1&v=${p.variant_key}`} title="Vorschau (zählt nicht)">{p.variant_key}</a>
                        <Dot tone={pageTone(p.variant_status)} title={STATUS[p.variant_status] ?? p.variant_status} />
                        <Tip className="gh-vbar" label={`Variante ${p.variant_key}: ${pct(p.sample_requests, p.views)}`}
                          tip={<div className="gh-pop"><div className="gh-pop-h"><b>Variante {p.variant_key}</b><span>{STATUS[p.variant_status] ?? p.variant_status}</span></div>
                            <p>{compact(p.views)} Aufrufe · {compact(p.cta_clicks)} Klicks</p><p>{compact(p.sample_requests)} Proben · {compact(p.purchases)} Käufe</p>
                            <p className="gh-pop-m">{p.traffic_share} % der Besucher</p></div>}>
                          <i style={{ width: `${Math.max(bars[i], p.views > 0 ? 2 : 0)}%` }} />
                        </Tip>
                        <b className="gh-q">{pct(p.sample_requests, p.views)}</b>
                        <span className="gh-acts">
                          {p.variant_status !== "live" && (
                            <form action={setStatus}><input type="hidden" name="table" value="variant" /><input type="hidden" name="id" value={p.variant_id} />
                              <button name="status" value="live" disabled={!canLive} className="gh-ib" aria-label="Variante live schalten" title={canLive ? "Variante live schalten" : "erst mit Rechtstexten"}><Icon name="start" size={14} /></button></form>
                          )}
                          {p.variant_status !== "retired" && (
                            <form action={setStatus}><input type="hidden" name="table" value="variant" /><input type="hidden" name="id" value={p.variant_id} />
                              <button name="status" value="retired" className="gh-ib" aria-label="Variante stilllegen" title="Variante stilllegen (zurücknehmen)"><Icon name="stopp" size={13} /></button></form>
                          )}
                        </span>
                      </div>
                    ))}
                  </section>
                );
              })}
            </div>
          ) : <p className="muted">Noch keine Seiten mit Tests (nur Webagenturen US/UK/FR).</p>}
          {otherPages.length > 0 && (
            <details className="gh-old">
              <summary title="Tests nur Webagenturen US/UK/FR (config/fokus.yaml) – andere Seiten bleiben live, ohne Varianten">
                <b>{otherPages.length}</b> weitere Seiten ohne Tests – Freigabe durch dich
              </summary>
              <p className="muted">{otherPages.map((g, i) => (
                <span key={g.page_id}>{i > 0 && " · "}<a href={`/${g.slug}?vorschau=1`} title="Vorschau (zählt nicht)">{g.slug}</a></span>
              ))}</p>
            </details>
          )}
        </Fold>

        {/* ---------------------------------------------------------------- Schalter */}
        <Fold name="schalter" open={false} title="Schalter" icon={<Icon name="regler" size={16} />}
          summary={<span className="gh-sum-n">max <b>{s.max_new_pages_per_week ?? 3}</b> Seiten/Woche</span>}>
          <div className="gh-ctrls">
            <section className="gh-card">
              {SWITCHES.map(([k, label, hint]) => {
                const on = flag(k);
                const block = k === "legal_ready" && !legalFiles;
                return (
                  <div key={k} className="gh-sw">
                    <span title={hint}><Dot tone={on ? "green" : "grey"} />{label}</span>
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
              <form action={updateSetting} className="gh-max" title="Höchstens so viele neue Landingpages legt das Gehirn je Woche an (0–20).">
                <input type="hidden" name="key" value="max_new_pages_per_week" />
                <label><Icon name="start-seite" size={15} /> Seiten/Woche
                  <input name="value" type="number" min={0} max={20} defaultValue={s.max_new_pages_per_week ?? 3} />
                </label>
                <button className="primary">Speichern</button>
              </form>
              <div className="gh-facts" aria-label="Stand (nur Anzeige)">
                <span title="app/content/legal.ts"><Dot tone={legalFiles ? "green" : "red"} />Rechtstexte</span>
                <span><Dot tone={stripe.live ? "green" : "grey"} />Stripe live</span>
                <span><Dot tone={stripe.test ? "green" : "grey"} />Stripe Test</span>
                <span title={Array.isArray(s.pricing) && s.pricing.length ? `${s.pricing.length} Pakete` : "nicht hinterlegt"}>
                  <Dot tone={Array.isArray(s.pricing) && s.pricing.length ? "green" : "grey"} />Preise</span>
                <a href="#umgebung"><Dot tone={envMissing.length ? "red" : "green"} />Variablen</a>
              </div>
            </section>
          </div>
        </Fold>

        {/* ---------------------------------------------------------------- Umgebung */}
        <Fold name="umgebung" open={envMissing.length > 0} title="Umgebung" icon={<Icon name="einstellungen" size={16} />}
          summary={<span className={`pill ${envMissing.length ? "t-red" : "t-green"}`}>{env.filter((e) => e.set).length}/{env.length}</span>}>
          <div className="gh-envs">
            {env.map((e) => (
              <div key={e.name} className="gh-env">
                <Dot tone={e.set ? "green" : e.required ? "red" : "grey"} title={e.set ? "gesetzt" : e.required ? "fehlt" : "optional"} />
                <Tip className="gh-envn" label={`${e.name}: ${e.set ? "gesetzt" : e.required ? "fehlt" : "optional"}`}
                  tip={<div className="gh-pop"><div className="gh-pop-h"><b>{e.name}</b><span>{e.set ? "gesetzt" : e.required ? "fehlt" : "optional"}</span></div><p>{e.purpose}</p></div>}>
                  {e.name}
                </Tip>
              </div>
            ))}
          </div>
        </Fold>
      </div>
    </TipHost>
  );
}

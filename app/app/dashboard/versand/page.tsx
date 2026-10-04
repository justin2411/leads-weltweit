import { Fold } from "../fold";
import { COUNTRIES, CONFIG, SEGMENT, loadActivity, loadDaily, loadLive, loadOwnerSettings } from "@/lib/dashboard-data";
import { isLive } from "@/lib/werke-live";
import { planText } from "@/lib/versandzeit";
import { MailFlight } from "../live";
import { Suspense } from "react";
import { COUNTRY_COLOR, ago, berlin, berlinDay, brake, compact, funnel, mailboxes, nextWorkflowRun, pctS, type Funnel } from "@/lib/dashboard-logic";
import { Freigaben } from "./freigaben";
import { PERIODS, period, revenueByCurrency, series, totals, type Metric } from "@/lib/dashboard-periods";
import { effectiveLimit, FOLLOWUP_DAYS_RANGE } from "@/lib/owner-settings";
import { requireOwner } from "../actions";
import { saveCountryLimits, saveFollowups, setPaused, toggleSendCountry } from "../control-actions";
import { Back, COUNTRY_OPTS, Chips, Columns, Ctrl, Kpi, Legend, PageHead, countrySeries } from "../v2";
import { readParams, withQuery, type SP } from "../params";
import { Icon } from "@/app/icons";

/** Versand & Ergebnisse je Zeitraum mit Vergleich, Klick auf Zahl/Balken → Firmen; darunter die Steuerung. */
export default async function Versand({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const { land, countries, z, raw } = await readParams(searchParams);
  const today = berlinDay(new Date());
  const p = period(z, today);
  const single = p.from === p.to;
  const from14 = new Date(Date.parse(`${today}T12:00:00Z`) - 13 * 86_400_000).toISOString().slice(0, 10);
  const [live, daily, own, act] = await Promise.all([loadLive(), loadDaily(p.prevFrom < from14 ? p.prevFrom : from14, today), loadOwnerSettings(), loadActivity()]);
  const sending = isLive(act, "versand", new Date(act.now));
  const t = totals(daily, p.from, p.to, countries);
  const tp = totals(daily, p.prevFrom, p.prevTo, countries);
  const rev = revenueByCurrency(daily, p.from, p.to, countries);
  const revPrev = revenueByCurrency(daily, p.prevFrom, p.prevTo, countries);
  const revText = Object.entries(rev).map(([c, v]) => `${compact(v)} ${c}`).join(" + ") || "0";
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  const [cf, ct, bucket] = single ? [from14, today, "day" as const] : [p.from, p.to, p.bucket];
  const here = withQuery("/dashboard/versand", raw);
  const list = (m: Metric | "customers", f = p.from, to = p.to) => withQuery("/dashboard/liste", { m, land: land ?? undefined, ...(f === p.from && to === p.to ? { z } : { von: f, bis: to }) });
  const chartRows = (m: Metric) => series(daily, cf, ct, bucket, m, countries).map((r) => ({ ...r, href: list(m, r.from, r.to), tipTitle: r.from === r.to ? r.label : `${r.label} – ${berlin(`${r.to}T12:00:00Z`).slice(0, 6)}` }));
  const now = new Date(live.now);
  const boxes = mailboxes(live, CONFIG);
  const cap = boxes.reduce((a, b) => a + b.cap, 0);
  const b = brake(live, CONFIG);
  const send = CONFIG.workflows.find((w) => w.file === "send.yml");
  const next = nextWorkflowRun(send, now);
  const ser = countrySeries(countries);
  const range = `${berlin(`${p.from}T12:00:00Z`).slice(0, 6)} – ${berlin(`${p.to}T12:00:00Z`).slice(0, 6)}`;
  const eff = COUNTRIES.map((c) => ({ c, yaml: CONFIG.countries[c]?.daily_limit ?? 0, eff: effectiveLimit(CONFIG.countries[c]?.daily_limit ?? 0, own, c), set: own.send_country_limits[c] }));
  const effSum = eff.reduce((a, x) => a + x.eff, 0);

  return (
    <div className="v2">
      <PageHead title="Versand" icon="versand" crumbs={[["JARVIS", withQuery("/dashboard/jarvis", raw)], ["Versand", ""]]} />
      <div className="head2">
        <Chips base="/dashboard/versand" param="z" value={z} options={PERIODS.map(([k, l]) => [k, l])} params={raw} />
        <Chips base="/dashboard/versand" param="land" value={land} options={COUNTRY_OPTS} params={raw} dots />
      </div>
      <div className="sub2" title={`Vergleich: ${p.prevLabel}`}>{range} · vs. {p.prevLabel}</div>
      <MailFlight live={sending} label={sending ? `Versand läuft gerade · ${act.sent_15m} Mails in 15 min, ${act.sent_60m} in 1 h` : own.send_paused ? "Versand pausiert (Inhaber)" : "Versand ruht gerade"} />
      <div className="kpis2 eight">
        <Kpi value={compact(t.sent)} label="Mails" cur={t.sent} prev={tp.sent} tip={`Erstmails · dazu ${t.followups} Nachfassmails`} href={list("sent")} />
        <Kpi value={compact(t.bounced)} label="Bounces" cur={t.bounced} prev={tp.bounced} goodDown tip={t.sent ? `${pctS(t.bounced / t.sent)} der Mails` : undefined} href={list("bounced")} />
        <Kpi value={compact(t.replies)} label="Antworten" cur={t.replies} prev={tp.replies} tip={`ohne Absagen/Abmeldungen (${t.declined ?? 0})`} href={list("replies")} />
        <Kpi value={compact(t.positive)} label="Positiv" cur={t.positive} prev={tp.positive} href={list("positive")} />
        <Kpi value={compact(t.samples_requested)} label="Proben angefragt" cur={t.samples_requested} prev={tp.samples_requested} href={list("samples_requested")} />
        <Kpi value={compact(t.samples_sent)} label="Proben gesendet" cur={t.samples_sent} prev={tp.samples_sent} href={list("samples_sent")} />
        <Kpi value={compact(t.customers)} label="neue Kunden" cur={t.customers} prev={tp.customers} href={list("customers")} />
        <Kpi value={revText} label="neuer Umsatz / Monat" cur={sum(rev)} prev={sum(revPrev)} href={list("customers")} />
      </div>
      <div className="vizgrid">
        <figure className="card viz">
          <figcaption title={single ? "letzte 14 Tage · Klick auf einen Balken: Firmen" : p.label}>Mails {single ? "· 14 Tage" : ""}</figcaption>
          <Legend series={ser} />
          <Columns rows={chartRows("sent")} series={ser} title="Mails" />
        </figure>
        <figure className="card viz">
          <figcaption title="je eingehender Mail, ohne Abwesenheit und ohne Absagen · Klick: Firmen">Antworten {single ? "· 14 Tage" : ""}</figcaption>
          <Legend series={ser} />
          <Columns rows={chartRows("replies")} series={ser} title="Antworten" />
        </figure>
      </div>
      <div className="kpis2 four">
        <Kpi value={`${compact(boxes.reduce((a, x) => a + x.today, 0))} / ${cap}`} label="heute / Kapazität" tip="alle Postfächer zusammen, inkl. Nachfassmails" />
        <Kpi value={pctS(b.rate)} label="Bounce-Quote" tip={`${b.bounced} von ${b.sent} seit ${berlin(b.start)} · Notbremse ab 5 % (ab 100 Mails)`} />
        <Kpi value={own.send_paused ? "Pause" : CONFIG.versand.aktiv ? (b.stop ? "Stopp" : "läuft") : "aus"} label="Versand" tip={b.stop ?? "Hauptschalter im Dashboard + config/versand.yaml"} />
        <Kpi value={next ? berlin(next) : "–"} label="nächster Lauf" tip={`send.yml · ${planText()} (deutsche Zeit)`} />
      </div>

      <div className="vizgrid">
        <Fold id="versand-tests" className="card tile" head="th" title={<span title="Regel §5: bewertet ab 50 zugestellten Mails, entschieden 14 Tage nach der letzten Mail">Tests nach Regel §5</span>} sum={`${countries.length} Länder`}>
          <div className="klist">
            {countries.map((c) => {
              const f = funnel(live, null, SEGMENT, c);
              const [verdict, cls] = rule5(f);
              return (
                <div key={c} className="kcard">
                  <span className="cn"><i className="dot" style={{ background: COUNTRY_COLOR[c] }} />{c}</span>
                  <span className={`pill ${cls}`} title={`${f.delivered} zugestellt · ${f.positive} positiv · ${f.customers} Kunden`}>{verdict}</span>
                  <span className="cm">{compact(f.delivered)} zugestellt · {f.delivered ? pctS(f.positive / f.delivered) : "–"} positiv · {compact(f.samplesSent)} Proben · {compact(f.customers)} Kunden</span>
                </div>
              );
            })}
          </div>
        </Fold>
        <Fold id="versand-postfaecher" className="card tile" head="th" title={<span title="Kapazität wächst je Postfach ab der ersten Mail">Postfächer</span>} sum={`${boxes.length} · heute ${compact(boxes.reduce((a, x) => a + x.today, 0))}`}>
          <div className="klist">
            {boxes.map((x) => (
              <div key={x.box} className="kcard">
                <span className="cn">{x.label}</span>
                <span className="pill t-next" title="heute / Kapazität">{compact(x.today)}/{compact(x.cap)}</span>
                <span className="cm">7 Tage {compact(x.d7)} · gesamt {compact(x.total)} · zuletzt {ago(x.last_sent, now)}</span>
              </div>
            ))}
          </div>
          <div className="facts" title="Adressen; die Domain wird jeweils mitgesperrt. Sperren werden nie aufgehoben.">
            <span>Gesperrt <b>{Object.entries(live.suppression).map(([r, n]) => `${SUP[r] ?? r} ${compact(Number(n))}`).join(" · ") || "keine"}</b></span>
          </div>
        </Fold>
      </div>

      <h2 className="h2s">Steuerung</h2>
      <div className="ctrls">
        <Ctrl title="Versand" tip="Pause hält alle Kalt- und Nachfassmails sofort an. Weiter nur per Klick.">
          <form action={setPaused} className="sw">
            <Back to={here} />
            <button name="paused" value="0" className={!own.send_paused ? "on go" : ""} title="Versand läuft"><Icon name="start" size={16} /> Läuft</button>
            <button name="paused" value="1" className={own.send_paused ? "on stop" : ""} title="Alle Kaltmails anhalten"><Icon name="pause" size={16} /> Pause</button>
          </form>
          <div className="tog">
            {COUNTRIES.map((c) => {
              const off = own.send_countries_off.includes(c);
              return (
                <form key={c} action={toggleSendCountry}><Back to={here} /><input type="hidden" name="country" value={c} />
                  <button className={off ? "off" : ""} title={off ? `${c} ist aus – Klick: einschalten` : `${c} an – Klick: ausschalten`}><i style={{ background: COUNTRY_COLOR[c] }} />{c}</button>
                </form>
              );
            })}
          </div>
        </Ctrl>

        <Ctrl title="Mails pro Tag je Land" tip="Tageslimit je Land. Höchstens das Limit aus countries.yaml; leer = Standard. Die Postfach-Kapazität begrenzt die Summe.">
          <form action={saveCountryLimits}>
            <Back to={here} />
            {eff.map((x) => (
              <label key={x.c} className="frow" title={`max. ${x.yaml} (countries.yaml)`}>
                <b>{x.c}</b>
                <input type="number" name={`limit_${x.c}`} min={0} max={x.yaml} defaultValue={x.set ?? ""} placeholder={String(x.yaml)} />
                <span className="hint">max {x.yaml}</span>
              </label>
            ))}
            <button className="primary">Speichern</button>
            <span className={`hint ${effSum > cap ? "warn" : ""}`}>Summe {effSum} · Postfächer heute {cap}{effSum > cap ? " → Postfächer begrenzen" : ""}</span>
          </form>
        </Ctrl>

        <Ctrl title="Nachfassmail" tip="Eine Nachfassmail an Firmen ohne Antwort. Abschalten stoppt neue Nachfassmails (bereits geplante bleiben).">
          <form action={saveFollowups}>
            <Back to={here} />
            <div className="sw">
              <button name="enabled" value="1" className={own.followup_enabled ? "on go" : ""}>an</button>
              <button name="enabled" value="0" className={!own.followup_enabled ? "on stop" : ""}>aus</button>
            </div>
            <label className="frow" title={`${FOLLOWUP_DAYS_RANGE[0]}–${FOLLOWUP_DAYS_RANGE[1]} Tage nach der Erstmail`}>
              <b>Tage</b>
              <input type="number" name="days" min={FOLLOWUP_DAYS_RANGE[0]} max={FOLLOWUP_DAYS_RANGE[1]} defaultValue={own.followup_days ?? ""} placeholder="4" />
              <span className="hint">nach Erstmail</span>
            </label>
            <input type="hidden" name="enabled" value={own.followup_enabled ? "1" : "0"} />
            <button className="primary">Speichern</button>
          </form>
        </Ctrl>

        <Ctrl title="Feste Grenzen" tip="Nicht änderbar – Schutz der Absenderdomain und Rechtsregeln." locked="nur Anzeige">
          <div className="facts">
            <span>Notbremse <b>Bounces &gt; 5 %</b> ab 100 Mails</span>
            <span>Spam-Beschwerde <b>stoppt sofort</b></span>
            <span>Länder-Limits <b>{COUNTRIES.map((c) => `${c} ${CONFIG.countries[c]?.daily_limit}`).join(" · ")}</b></span>
            <span>Gesamtgrenze <b>{CONFIG.versand.gesamtgrenze}</b> Erstmails</span>
            <span>Sperrliste, Frischeprüfung, <b>nur Fokus</b> {CONFIG.nur_fokus ? "an" : "aus"}</span>
            <span>Keine Kaltmails nach <b>DE/AT/CH/IT/ES/PL/DK</b></span>
          </div>
        </Ctrl>
      </div>

      <Suspense fallback={<p className="muted">Entwürfe laden …</p>}><Freigaben /></Suspense>
    </div>
  );
}

const SUP: Record<string, string> = { bounce: "Bounce", unsubscribe: "Abmeldelink", complaint: "Beschwerde", reply_optout: "per Antwort", manual: "manuell" };

/** Regel §5 (CLAUDE.md): < 2 % positiv nach 50 zugestellten = stoppen, 2–5 % = neue Botschaft, > 5 % oder Kunde = ausbauen.
 *  Solange noch gesendet wird, nur Zwischenstand – entschieden wird 14 Tage nach der letzten Mail. */
function rule5(f: Funnel): [string, string] {
  if (f.customers > 0) return ["ausbauen", "t-green"];
  if (f.delivered < 50) return [`noch ${50 - f.delivered} bis Bewertung`, "t-grey"];
  const r = f.positive / f.delivered;
  const v = r > 0.05 ? "ausbauen" : r >= 0.02 ? "neue Botschaft" : "stoppen";
  if (f.sent7 > 0) return [`Zwischenstand: ${v}`, "t-gold"];
  return [v, r > 0.05 ? "t-green" : r >= 0.02 ? "t-gold" : "t-red"];
}

import { CONFIG, loadDaily, loadLive } from "@/lib/dashboard-data";
import { berlin, berlinDay, brake, compact, mailboxes, nextRun, pctS } from "@/lib/dashboard-logic";
import { PERIODS, period, revenueByCurrency, series, totals } from "@/lib/dashboard-periods";
import { requireOwner } from "../actions";
import { COUNTRY_OPTS, Chips, Columns, Crumbs, Kpi, Legend, countrySeries } from "../v2";
import { readParams, type SP } from "../params";

/** Versand & Ergebnisse je Zeitraum (Heute … Dieses Jahr) mit Vergleich zum Vorzeitraum. */
export default async function Versand({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const { land, countries, z, raw } = await readParams(searchParams);
  const today = berlinDay(new Date());
  const p = period(z, today);
  const single = p.from === p.to;
  const from14 = new Date(Date.parse(`${today}T12:00:00Z`) - 13 * 86_400_000).toISOString().slice(0, 10);
  const [live, daily] = await Promise.all([loadLive(), loadDaily(p.prevFrom < from14 ? p.prevFrom : from14, today)]);
  const t = totals(daily, p.from, p.to, countries);
  const tp = totals(daily, p.prevFrom, p.prevTo, countries);
  const rev = revenueByCurrency(daily, p.from, p.to, countries);
  const revPrev = revenueByCurrency(daily, p.prevFrom, p.prevTo, countries);
  const revText = Object.entries(rev).map(([c, v]) => `${compact(v)} ${c}`).join(" + ") || "0";
  const sum = (r: Record<string, number>) => Object.values(r).reduce((a, b) => a + b, 0);
  const [cf, ct, bucket] = single ? [from14, live.today, "day" as const] : [p.from, p.to, p.bucket];
  const mails = series(daily, cf, ct, bucket, "sent", countries);
  const replies = series(daily, cf, ct, bucket, "replies", countries);
  const now = new Date(live.now);
  const cap = mailboxes(live, CONFIG).reduce((a, b) => a + b.cap, 0);
  const b = brake(live, CONFIG);
  const send = CONFIG.workflows.find((w) => w.file === "send.yml");
  const next = send ? nextRun(send.crons, now) : null;
  const ser = countrySeries(countries);
  const range = `${berlin(`${p.from}T12:00:00Z`).slice(0, 6)} – ${berlin(`${p.to}T12:00:00Z`).slice(0, 6)}`;

  return (
    <div className="v2">
      <Crumbs items={[["Übersicht", "/dashboard"], ["Versand & Ergebnisse", ""]]} />
      <div className="head2">
        <Chips base="/dashboard/versand" param="z" value={z} options={PERIODS.map(([k, l]) => [k, l])} params={raw} />
        <Chips base="/dashboard/versand" param="land" value={land} options={COUNTRY_OPTS} params={raw} dots />
      </div>
      <div className="sub2" title={`Vergleich: ${p.prevLabel}`}>{range} · vs. {p.prevLabel}</div>
      <div className="kpis2 eight">
        <Kpi value={compact(t.sent)} label="Mails" cur={t.sent} prev={tp.sent} tip={`Erstmails · dazu ${t.followups} Nachfassmails`} />
        <Kpi value={compact(t.bounced)} label="Bounces" cur={t.bounced} prev={tp.bounced} goodDown tip={t.sent ? `${pctS(t.bounced / t.sent)} der Mails` : undefined} />
        <Kpi value={compact(t.replies)} label="Antworten" cur={t.replies} prev={tp.replies} />
        <Kpi value={compact(t.positive)} label="Positiv" cur={t.positive} prev={tp.positive} />
        <Kpi value={compact(t.samples_requested)} label="Proben angefragt" cur={t.samples_requested} prev={tp.samples_requested} />
        <Kpi value={compact(t.samples_sent)} label="Proben gesendet" cur={t.samples_sent} prev={tp.samples_sent} />
        <Kpi value={compact(t.customers)} label="neue Kunden" cur={t.customers} prev={tp.customers} />
        <Kpi value={revText} label="neuer Umsatz / Monat" cur={sum(rev)} prev={sum(revPrev)} />
      </div>
      <div className="vizgrid">
        <figure className="card viz">
          <figcaption title={single ? "letzte 14 Tage" : p.label}>Mails {single ? "· 14 Tage" : ""}</figcaption>
          <Legend series={ser} />
          <Columns rows={mails} series={ser} title="Mails" />
        </figure>
        <figure className="card viz">
          <figcaption title="je eingehender Mail, ohne Abwesenheitsnotizen">Antworten {single ? "· 14 Tage" : ""}</figcaption>
          <Legend series={ser} />
          <Columns rows={replies} series={ser} title="Antworten" />
        </figure>
      </div>
      <div className="kpis2 four">
        <Kpi value={`${compact(mailboxes(live, CONFIG).reduce((a, x) => a + x.today, 0))} / ${cap}`} label="heute / Kapazität" tip="alle Postfächer zusammen, inkl. Nachfassmails" />
        <Kpi value={pctS(b.rate)} label="Bounce-Quote" tip={`${b.bounced} von ${b.sent} seit ${berlin(b.start)} · Notbremse ab 5 % (ab 100 Mails)`} />
        <Kpi value={CONFIG.versand.aktiv ? (b.stop ? "Stopp" : "an") : "aus"} label="Versand" tip={b.stop ?? "config/versand.yaml"} />
        <Kpi value={next ? berlin(next) : "–"} label="nächster Lauf" tip="send.yml (deutsche Zeit)" />
      </div>
    </div>
  );
}

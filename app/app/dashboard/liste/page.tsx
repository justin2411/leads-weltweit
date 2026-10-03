import Link from "next/link";
import { loadList } from "@/lib/dashboard-data";
import { COUNTRY_COLOR, berlin, berlinDay, compact } from "@/lib/dashboard-logic";
import { PERIODS, period } from "@/lib/dashboard-periods";
import { requireOwner } from "../actions";
import { COUNTRY_OPTS, Chips, Crumbs } from "../v2";
import { readParams, withQuery, type SP } from "../params";

const LIST_METRICS: [string, string][] = [
  ["sent", "Mails"], ["followups", "Nachfass"], ["bounced", "Bounces"], ["replies", "Antworten"], ["positive", "Positiv"],
  ["declined", "Abgesagt"], ["samples_requested", "Proben angefragt"], ["samples_sent", "Proben gesendet"], ["customers", "Kunden"],
];
const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Drill-down: Firmen zu einer Kennzahl im Zeitraum (Klick auf eine Zahl oder einen Balken). */
export default async function Liste({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const { land, z, raw, one } = await readParams(searchParams);
  const mRaw = one("m") ?? "sent";
  const m = LIST_METRICS.some(([k]) => k === mRaw) ? mRaw : "sent";
  const von = one("von"), bis = one("bis");
  const today = berlinDay(new Date());
  const p = period(z, today);
  const custom = von && DAY.test(von) && (!bis || DAY.test(bis));
  const from = custom ? von! : p.from;
  const to = custom ? (bis || von!) : p.to;
  const n = Math.min(1000, Math.max(50, Number(one("n")) || 100));
  const data = await loadList(m, from, to, land, n);
  const label = LIST_METRICS.find(([k]) => k === m)![1];
  const base = { ...raw, m, von: custom ? from : undefined, bis: custom && to !== from ? to : undefined };
  const range = from === to ? berlin(`${from}T12:00:00Z`).slice(0, 6) : `${berlin(`${from}T12:00:00Z`).slice(0, 6)} – ${berlin(`${to}T12:00:00Z`).slice(0, 6)}`;

  return (
    <div className="v2">
      <Crumbs items={[["Übersicht", withQuery("/dashboard", raw)], ["Versand", withQuery("/dashboard/versand", raw)], [label, ""]]} />
      <div className="head2">
        <Chips base="/dashboard/liste" param="m" value={m} options={LIST_METRICS.map(([k, l]) => [k, l])} params={base} />
        <Chips base="/dashboard/liste" param="land" value={land} options={COUNTRY_OPTS} params={base} dots />
      </div>
      {!custom && <Chips base="/dashboard/liste" param="z" value={z} options={PERIODS.map(([k, l]) => [k, l])} params={base} />}
      <div className="big1"><b>{compact(data.total)}</b> {label} · {custom ? range : `${p.label} (${range})`}{custom && <> · <Link href={withQuery("/dashboard/liste", { ...raw, m })}>Zeitraum wählen</Link></>}</div>
      <div className="card klist">
        {data.rows.map((r, i) => {
          const inner = (
            <>
              <span className="cn">{r.company}</span>
              <span className="cm"><i style={{ background: COUNTRY_COLOR[r.country ?? ""] ?? "#c3bcae" }} />{r.country}</span>
              <span className="cm">{berlin(r.at)}<span className="pill t-next">{r.status}</span></span>
              <span className="lt" title={r.text ?? ""}>{r.text ?? ""}</span>
            </>
          );
          return r.prospect_id
            ? <Link key={i} href={`/dashboard/kontakte/${r.prospect_id}`} className="lrow">{inner}</Link>
            : <div key={i} className="lrow">{inner}</div>;
        })}
        {data.rows.length === 0 && <div className="muted" style={{ padding: 10 }}>keine</div>}
      </div>
      {data.total > data.rows.length && (
        <Link className="more-btn" href={withQuery("/dashboard/liste", { ...base, n: String(Math.min(1000, n + 200)) })}>mehr laden ({compact(data.total - data.rows.length)} weitere)</Link>
      )}
    </div>
  );
}

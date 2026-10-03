import { CONFIG, SEGMENT, loadLive } from "@/lib/dashboard-data";
import { COUNTRY_COLOR, berlin, compact, currencySign, isTestCustomer, monthly, nextRun, onlySegment, realSubscriptions } from "@/lib/dashboard-logic";
import { requireOwner } from "../actions";
import { COUNTRY_OPTS, Chips, Crumbs, Kpi } from "../v2";
import { readParams, type SP } from "../params";

/** Kunden & Umsatz der Webagenturen: Abos, Umsatz pro Monat, Lieferungen. Testkäufe zählen nicht. */
export default async function Kunden({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const { land, countries, raw } = await readParams(searchParams);
  const live = onlySegment(await loadLive(), SEGMENT);
  const now = new Date(live.now);
  const subs = realSubscriptions(live).filter((s) => countries.includes(s.customer?.country ?? ""));
  const rev = new Map<string, number>();
  for (const s of subs) rev.set(currencySign(s.currency, s.customer?.country), (rev.get(currencySign(s.currency, s.customer?.country)) ?? 0) + monthly(s));
  const wf = CONFIG.workflows.find((w) => w.file === "kundenlieferung.yml");
  const next = wf ? nextRun(wf.crons, now) : null;
  const custs = live.customers.filter((c) => countries.includes(c.country));
  const open = live.deliveries.filter((d) => d.status === "prepared").length;

  return (
    <div className="v2">
      <Crumbs items={[["Übersicht", "/dashboard"], ["Kunden & Umsatz", ""]]} />
      <div className="head2"><span /><Chips base="/dashboard/kunden" param="land" value={land} options={COUNTRY_OPTS} params={raw} dots /></div>
      <div className="kpis2 four">
        <Kpi value={compact(subs.length)} label="Kunden" tip="aktive Abos ohne Testkäufe" />
        <Kpi value={[...rev].map(([c, v]) => `${compact(v)} ${c}`).join(" + ") || "0"} label="pro Monat" />
        <Kpi value={next ? berlin(next) : "–"} label="nächste Lieferung" />
        <Kpi value={compact(open)} label="Freigabe offen" tip="vorbereitete Lieferungen, die noch freigegeben werden müssen" />
      </div>
      <div className="klist card">
        {custs.map((c) => {
          const s = live.subscriptions.filter((x) => x.customer_id === c.id);
          return (
            <div key={c.id} className="kcard static">
              <span className="cn">{c.company_name}</span>
              <span className="cm">
                <i style={{ background: COUNTRY_COLOR[c.country] ?? "#c3bcae" }} />{c.country}
                {isTestCustomer(c) && <span className="pill t-grey">Testkauf</span>}
                {s.map((x) => <span key={x.id} className="pill t-next">{x.package ?? "Abo"} · {compact(monthly(x))} {currencySign(x.currency, c.country)}</span>)}
                <span className="ca">seit {berlin(c.created_at)}</span>
              </span>
            </div>
          );
        })}
        {custs.length === 0 && <div className="muted">noch keine Kunden</div>}
      </div>
    </div>
  );
}

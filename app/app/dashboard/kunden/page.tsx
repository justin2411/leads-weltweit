import { COUNTRIES, CONFIG, SEGMENT, loadLive } from "@/lib/dashboard-data";
import { PACKAGES } from "@/lib/owner-settings";
import { approveFirstDelivery, createCustomer, setSubscriptionPaused } from "../control-actions";
import { COUNTRY_COLOR, berlin, compact, currencySign, isTestCustomer, monthly, nextRun, onlySegment, realSubscriptions } from "@/lib/dashboard-logic";
import { requireOwner } from "../actions";
import { Back, COUNTRY_OPTS, Chips, Crumbs, Ctrl, Kpi } from "../v2";
import { readParams, withQuery, type SP } from "../params";

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
  const here = withQuery("/dashboard/kunden", raw);

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
                {s.map((x) => <span key={x.id} className="pill t-next">{x.package ?? "Abo"} · {compact(monthly(x))} {currencySign(x.currency, c.country)}{x.status === "paused" ? " · pausiert" : ""}</span>)}
                <span className="ca">seit {berlin(c.created_at)}</span>
              </span>
              <span className="acts2">
                {s.map((x) => {
                  const pend = live.deliveries.find((d) => d.subscription_id === x.id && d.status === "prepared");
                  return (
                    <span key={x.id} className="acts2">
                      {pend && !x.first_delivery_approved && !isTestCustomer(c) && (
                        <form action={approveFirstDelivery}><Back to={here} /><input type="hidden" name="subscription" value={x.id} />
                          <button className="primary" title={`Vorschau vom ${berlin(pend.created_at)} (${pend.leads} Leads) – danach automatisch montags`}>Erste Lieferung freigeben</button></form>
                      )}
                      {["active", "paused"].includes(x.status) && (
                        <form action={setSubscriptionPaused}><Back to={here} /><input type="hidden" name="subscription" value={x.id} />
                          <button name="paused" value={x.status === "paused" ? "0" : "1"}>{x.status === "paused" ? "Abo fortsetzen" : "Abo pausieren"}</button></form>
                      )}
                    </span>
                  );
                })}
              </span>
            </div>
          );
        })}
        {custs.length === 0 && <div className="muted">noch keine Kunden</div>}
      </div>

      <h2 className="h2s">Steuerung</h2>
      <div className="ctrls">
        <Ctrl title="Kunde anlegen" tip={`Kunde + Abo Webagenturen. Starter ${PACKAGES.starter.price} (bis ${PACKAGES.starter.perWeek} Leads/Woche), Pro ${PACKAGES.pro.price} (bis ${PACKAGES.pro.perWeek}) pro Monat in Landeswährung. Erste Lieferung braucht deine Freigabe.`}>
          <form action={createCustomer}>
            <Back to={here} />
            <input name="company" placeholder="Firma" required maxLength={200} />
            <input name="email" type="email" placeholder="Rechnungs-E-Mail" required maxLength={200} />
            <div className="acts2">
              <select name="country" defaultValue={land ?? COUNTRIES[0]}>{COUNTRIES.map((c) => <option key={c}>{c}</option>)}</select>
              <select name="pkg" defaultValue="starter"><option value="starter">Starter</option><option value="pro">Pro</option></select>
            </div>
            <button className="primary">Anlegen</button>
          </form>
        </Ctrl>
        <Ctrl title="Lieferungen" tip="Montags automatisch; erste Lieferung jedes Kunden nur nach Freigabe." locked="nur Anzeige">
          <div className="facts">
            <span>nächste Lieferung <b>{next ? berlin(next) : "–"}</b></span>
            <span>Freigabe offen <b>{open}</b></span>
            <span>jeder Lead <b>höchstens einmal</b> je Abo, nur aus dem gebuchten Land</span>
          </div>
        </Ctrl>
      </div>
    </div>
  );
}

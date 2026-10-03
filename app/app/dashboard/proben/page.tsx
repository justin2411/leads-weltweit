import { CONFIG, SEGMENT, loadLive } from "@/lib/dashboard-data";
import { COUNTRY_COLOR, berlin, compact, distinctReplies, durationS, onlySegment, sampleStock } from "@/lib/dashboard-logic";
import { requireOwner } from "../actions";
import { COUNTRY_OPTS, Chips, Crumbs, Fill, Kpi, ago2 } from "../v2";
import { readParams, type SP } from "../params";

/** Proben: Vorrat je Seite und alle Anfragen (Website + Mail-Antwort) mit Zeit bis zur Probe. */
export default async function Proben({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const { land, countries, raw } = await readParams(searchParams);
  const live = onlySegment(await loadLive(), SEGMENT);
  const now = new Date(live.now);
  const st = sampleStock(live, CONFIG, now).filter((r) => countries.some((c) => r.key.endsWith(`/${c}`)));
  const web = live.sample_requests.filter((r) => countries.includes(r.country ?? ""));
  const mail = distinctReplies(live.events).filter((e) => e.type === "sample_requested" && countries.includes(e.country ?? ""));
  const rows = [
    ...web.map((r) => ({ key: r.id, company: r.company_name, country: r.country, at: r.created_at, status: r.status === "sent" ? "gesendet" : r.status === "new" ? "offen" : "abgelehnt", wait: r.status === "sent" && r.sent_at ? durationS(Date.parse(r.sent_at) - Date.parse(r.created_at)) : r.status === "new" ? `wartet ${durationS(now.getTime() - Date.parse(r.created_at))}` : "–", via: "Website" })),
    ...mail.map((e) => ({ key: e.id, company: e.company_name ?? "?", country: e.country ?? null, at: e.occurred_at, status: "gesendet", wait: "sofort", via: "Mail" })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  const ready = st.reduce((a, r) => a + r.ready, 0), target = st.reduce((a, r) => a + r.target, 0);

  return (
    <div className="v2">
      <Crumbs items={[["Übersicht", "/dashboard"], ["Proben", ""]]} />
      <div className="head2"><span /><Chips base="/dashboard/proben" param="land" value={land} options={COUNTRY_OPTS} params={raw} dots /></div>
      <div className="kpis2 four">
        <Kpi value={`${ready}/${target}`} label="Vorrat fertig" tip={`Verfall nach ${CONFIG.proben.max_alter_stunden} h`} />
        <Kpi value={compact(web.filter((r) => r.status === "new").length)} label="offen" />
        <Kpi value={compact(rows.filter((r) => r.status === "gesendet").length)} label="gesendet" />
        <Kpi value={compact(st.reduce((a, r) => a + r.sent24, 0))} label="24 h sofort" tip="aus dem Vorrat direkt nach dem Klick" />
      </div>
      <section className="card tile">
        <header className="th"><span>Vorrat je Seite</span></header>
        <div className="fills">{st.map((r) => <Fill key={r.key} label={r.slug} ready={r.ready} target={r.target} tip={r.oldestH !== null ? `älteste ${Math.round(r.oldestH)} h` : "leer"} />)}</div>
      </section>
      <div className="klist card">
        {rows.map((r) => (
          <div key={r.key} className="kcard static">
            <span className="cn">{r.company}</span>
            <span className="cm">
              <i style={{ background: COUNTRY_COLOR[r.country ?? ""] ?? "#c3bcae" }} />{r.country}
              <span className={`pill ${r.status === "offen" ? "t-gold" : r.status === "gesendet" ? "t-green" : "t-grey"}`}>{r.status}</span>
              <span className="pill t-next">{r.via}</span>
              <span className="ca" title={berlin(r.at)}>{r.wait} · {ago2(r.at, now)}</span>
            </span>
          </div>
        ))}
        {rows.length === 0 && <div className="muted">noch keine Proben</div>}
      </div>
    </div>
  );
}

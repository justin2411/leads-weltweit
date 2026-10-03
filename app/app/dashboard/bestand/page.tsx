import { SEGMENT, loadStock } from "@/lib/dashboard-data";
import { berlin, compact, stockSegment } from "@/lib/dashboard-logic";
import { requireOwner } from "../actions";
import { Bars, COUNTRY_OPTS, Chips, Crumbs, Kpi } from "../v2";
import { readParams, type SP } from "../params";

/** Bestand der Webagenturen je Land: Leads (lieferbar, reserviert, in Proben, geliefert) und mail-fähige Käufer. */
export default async function Bestand({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const { land, countries, raw } = await readParams(searchParams);
  const stock = stockSegment(await loadStock(), SEGMENT)!;
  const L = (c: string, s: string) => stock.leads.filter((l) => l.country === c && l.status === s).reduce((a, l) => a + Number(l.n), 0);
  const L24 = (c: string) => stock.leads_24h.filter((l) => l.country === c).reduce((a, l) => a + Number(l.n), 0);
  const P = (c: string, s: string, f: "n" | "unused" = "n") => Number(stock.prospects.find((p) => p.country === c && p.check_status === s)?.[f] ?? 0);
  const P24 = (c: string) => Number(stock.prospects_24h.find((p) => p.country === c && p.check_status === "ok")?.n ?? 0);
  const sum = (f: (c: string) => number) => countries.reduce((a, c) => a + f(c), 0);

  return (
    <div className="v2">
      <Crumbs items={[["Übersicht", "/dashboard"], ["Bestand", ""]]} />
      <div className="head2">
        <span className="sub2" title="alle 10 min neu gezählt">Stand {berlin(stock.at)}</span>
        <Chips base="/dashboard/bestand" param="land" value={land} options={COUNTRY_OPTS} params={raw} dots />
      </div>
      <h2 className="h2s">Leads</h2>
      <div className="kpis2 four">
        <Kpi value={compact(sum((c) => L(c, "new")))} label="lieferbar" />
        <Kpi value={`+${compact(sum(L24))}`} label="neu 24 h" />
        <Kpi value={compact(sum((c) => L(c, "reserved") + L(c, "sample")))} label="in Proben" tip="reserviert im Vorrat + in gesendeten Proben" />
        <Kpi value={compact(sum((c) => L(c, "delivered")))} label="geliefert" />
      </div>
      <h2 className="h2s">Käufer</h2>
      <div className="kpis2 four">
        <Kpi value={compact(sum((c) => P(c, "ok")))} label="mail-fähig" tip="Prüfung ok, Mail-Land" />
        <Kpi value={compact(sum((c) => P(c, "ok", "unused")))} label="frei" tip="noch ohne Mail" />
        <Kpi value={`+${compact(sum(P24))}`} label="neu 24 h" />
        <Kpi value={compact(sum((c) => P(c, "call_only")))} label="nur Anruf/Brief" tip="zählt nicht als Käufer (keine Mail erlaubt)" />
      </div>
      <div className="vizgrid">
        <section className="card tile"><header className="th"><span>Leads lieferbar je Land</span></header>
          <Bars rows={countries.map((c) => ({ key: c, n: L(c, "new"), tip: `${c}: ${L(c, "new").toLocaleString("de-DE")} lieferbar · +${L24(c).toLocaleString("de-DE")} in 24 h` }))} />
        </section>
        <section className="card tile"><header className="th"><span>Käufer frei je Land</span></header>
          <Bars rows={countries.map((c) => ({ key: c, n: P(c, "ok", "unused"), tip: `${c}: ${P(c, "ok", "unused").toLocaleString("de-DE")} frei von ${P(c, "ok").toLocaleString("de-DE")} mail-fähig` }))} />
        </section>
      </div>
    </div>
  );
}

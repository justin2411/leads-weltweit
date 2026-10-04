import { Fold } from "../fold";
import { COUNTRIES, CONFIG, SEGMENT, canDispatch, loadOwnerSettings, loadRawStock, loadStock } from "@/lib/dashboard-data";
import { WORKFLOWS } from "@/lib/owner-settings";
import { dispatchWorkflow, toggleBuyerCountry } from "../control-actions";
import { COUNTRY_COLOR, berlin, compact, nextRun, stockSegment } from "@/lib/dashboard-logic";
import { requireOwner } from "../actions";
import { Back, Bars, COUNTRY_OPTS, Chips, Crumbs, Ctrl, Kpi } from "../v2";
import { readParams, withQuery, type SP } from "../params";

/** Bestand der Webagenturen je Land: Leads (lieferbar, reserviert, in Proben, geliefert) und mail-fähige Käufer. */
export default async function Bestand({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const { land, countries, raw } = await readParams(searchParams);
  // Rohbestand (aus der alten Ansicht, Inhaber 04.10.2026): 1 h zwischengespeichert; ist er kalt, lädt die Seite ohne ihn
  const rawP = loadRawStock().catch(() => null);
  const [stockAll, own, rawStock] = await Promise.all([loadStock(), loadOwnerSettings(),
    Promise.race([rawP, new Promise<null>((r) => setTimeout(() => r(null), 1500))])]);
  const stock = stockSegment(stockAll, SEGMENT)!;
  const here = withQuery("/dashboard/bestand", raw);
  const now = new Date();
  const nx = (file: string) => { const w = CONFIG.workflows.find((x) => x.file === file); const d = w ? nextRun(w.crons, now) : null; return d ? berlin(d) : "–"; };
  const L = (c: string, s: string) => stock.leads.filter((l) => l.country === c && l.status === s).reduce((a, l) => a + Number(l.n), 0);
  const L24 = (c: string) => stock.leads_24h.filter((l) => l.country === c).reduce((a, l) => a + Number(l.n), 0);
  const P = (c: string, s: string, f: "n" | "unused" = "n") => Number(stock.prospects.find((p) => p.country === c && p.check_status === s)?.[f] ?? 0);
  const P24 = (c: string) => Number(stock.prospects_24h.find((p) => p.country === c && p.check_status === "ok")?.n ?? 0);
  const sum = (f: (c: string) => number) => countries.reduce((a, c) => a + f(c), 0);

  return (
    <div className="v2">
      <Crumbs items={[["JARVIS", "/dashboard/jarvis"], ["Bestand", ""]]} />
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
      <div className="sub2" title={rawStock ? `Firmen ohne Lead (unvollständig oder widersprüchlich), alle Zielgruppen – zum späteren Nachanreichern · Stand ${berlin(rawStock.at)}` : "wird stündlich gezählt"}>
        Rohbestand ohne Lead: {rawStock ? countries.map((c) => `${c} ${compact(rawStock.by_country[c] ?? 0)}`).join(" · ") : "wird gezählt …"}
      </div>
      <h2 className="h2s">Käufer</h2>
      <div className="kpis2 four">
        <Kpi value={compact(sum((c) => P(c, "ok")))} label="mail-fähig" tip="Prüfung ok, Mail-Land" />
        <Kpi value={compact(sum((c) => P(c, "ok", "unused")))} label="frei" tip="noch ohne Mail" />
        <Kpi value={`+${compact(sum(P24))}`} label="neu 24 h" />
        <Kpi value={compact(sum((c) => P(c, "call_only")))} label="nur Anruf/Brief" tip="zählt nicht als Käufer (keine Mail erlaubt)" />
      </div>
      <div className="vizgrid">
        <Fold id="bestand-leads-land" className="card tile" head="th" title="Leads lieferbar je Land" sum={`${countries.length} Länder · ${compact(sum((c) => L(c, "new")))}`}>
          <Bars rows={countries.map((c) => ({ key: c, n: L(c, "new"), tip: `${c}: ${L(c, "new").toLocaleString("de-DE")} lieferbar · +${L24(c).toLocaleString("de-DE")} in 24 h` }))} />
        </Fold>
        <Fold id="bestand-kaeufer-land" className="card tile" head="th" title="Käufer frei je Land" sum={`${countries.length} Länder · ${compact(sum((c) => P(c, "ok", "unused")))}`}>
          <Bars rows={countries.map((c) => ({ key: c, n: P(c, "ok", "unused"), tip: `${c}: ${P(c, "ok", "unused").toLocaleString("de-DE")} frei von ${P(c, "ok").toLocaleString("de-DE")} mail-fähig` }))} />
        </Fold>
      </div>

      <h2 className="h2s">Steuerung</h2>
      <div className="ctrls">
        <Ctrl title="Kunden-Werk je Land" tip="Sucht und prüft neue Käufer (Webagenturen). Ausgeschaltete Länder werden übersprungen.">
          <div className="tog">
            {COUNTRIES.map((c) => {
              const off = own.buyer_countries_off.includes(c);
              return (
                <form key={c} action={toggleBuyerCountry}><Back to={here} /><input type="hidden" name="country" value={c} />
                  <button className={off ? "off" : ""} title={off ? `${c} aus – Klick: einschalten` : `${c} an – Klick: ausschalten`}><i style={{ background: COUNTRY_COLOR[c] }} />{c}</button>
                </form>
              );
            })}
          </div>
          <span className="hint">nächster Lauf {nx("kunden-werk.yml")}</span>
        </Ctrl>
        <Ctrl title="Jetzt starten" tip={canDispatch() ? "Startet das Werk sofort (zusätzlich zum Zeitplan)." : "Braucht GH_DISPATCH_TOKEN in Vercel – bis dahin nach Zeitplan."}>
          <div className="acts2">
            {(["lead-werk", "kunden-werk"] as const).map((k) => (
              <form key={k} action={dispatchWorkflow}><Back to={here} /><input type="hidden" name="wf" value={k} />
                <button disabled={!canDispatch()} title={`nächster Lauf ${nx(WORKFLOWS[k].file)}`}>{WORKFLOWS[k].label}</button>
              </form>
            ))}
          </div>
          <span className="hint">Lead-Werk {nx("lead-werk.yml")} · Kunden-Werk {nx("kunden-werk.yml")}</span>
        </Ctrl>
        <Ctrl title="Kapazität" tip="Wie lange der Bestand reicht – bei heutiger Versandmenge." locked="nur Anzeige">
          <div className="facts">
            {countries.map((c) => {
              const lim = CONFIG.countries[c]?.daily_limit ?? 0;
              const perDay = own.send_countries_off.includes(c) ? 0 : Math.min(lim, own.send_country_limits[c] ?? lim);
              return <span key={c}>{c}: Käufer frei für <b>{perDay ? `~${compact(Math.floor(P(c, "ok", "unused") / perDay))} Tage` : "–"}</b> bei {perDay}/Tag</span>;
            })}
            <span>Lead-Werk-Gewichtung je Land: <b>fest im Workflow</b></span>
          </div>
        </Ctrl>
      </div>
    </div>
  );
}

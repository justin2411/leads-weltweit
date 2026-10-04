import type { CSSProperties } from "react";
import Link from "next/link";
import { COUNTRY_COLOR, OTHER_COLOR } from "@/lib/dashboard-logic";
import { ageLabel, ageMinutes, intentMeta } from "@/lib/antworten";
import { loadAbos, loadHeiss, loadVertrieb } from "@/lib/zentrale/data";
import { STUFEN, kpiAus } from "@/lib/zentrale/vertrieb";
import { kurzZahl, prozent } from "@/lib/zentrale/kpi";
import { Icon } from "@/app/icons";
import { requireOwner } from "../actions";
import { ZtAmpel, ZtHead, ZtKpi } from "../zentrale/zt";

export const metadata = { title: "Vertrieb" };

/**
 * Abteilung Vertrieb (Kommandozentrale, Inhaber 04.10.2026): Pipeline angeschrieben → geantwortet → Probe →
 * Kaufinteresse → Kunde je Land (S2 × US/UK/FR), Konversion je Schritt, heiße Kontakte mit Link ins Antworten-Cockpit.
 */
export default async function Vertrieb() {
  await requireOwner();
  const now = new Date();
  const abos = await loadAbos();
  const [v, hot] = await Promise.all([loadVertrieb(now, abos), loadHeiss()]);
  if (!v) {
    return (
      <div className="zt">
        <ZtHead title="Vertrieb" at={now} />
        <div className="zt-card"><p className="zt-none">Vertriebszahlen gerade nicht lesbar – gleich noch einmal laden.</p></div>
      </div>
    );
  }
  const k = kpiAus(v, hot?.length ?? 0);
  const step = Object.fromEntries(v.schritte.map((s) => [s.key, s]));
  const kauf = step.kauf;

  return (
    <div className="zt">
      <ZtHead title="Vertrieb" at={now} />
      <div className="zt-kpis">
        <ZtKpi value={kurzZahl(v.gesamt.angeschrieben)} label="angeschrieben" ampel={v.gesamt.angeschrieben ? "green" : "grey"} tip="Käufer mit Erstmail (Webagenturen US/UK/FR)" />
        <ZtKpi value={prozent(step.geantwortet.quote)} label="Antwortquote" ampel={step.geantwortet.ampel} sub={step.geantwortet.jung ? "läuft noch" : undefined} tip={k.grund} />
        <ZtKpi value={kurzZahl(v.gesamt.kauf)} label="Kaufinteresse" ampel={kauf.ampel} tip="Antworten mit Absicht Kaufinteresse" />
        <ZtKpi value={kurzZahl(v.gesamt.kunde)} label="Kunden" ampel={v.gesamt.kunde ? "green" : "grey"} tip="zahlende Abos aus dem Trichter, ohne Testkäufe" />
      </div>

      <div className="zt-card">
        <div className="zt-h"><h2>Pipeline</h2><span className="zt-sp" /><span className="zt-note">Webagenturen · US · UK · FR</span></div>
        <div className="zt-board">
          {STUFEN.map((s) => {
            const max = Math.max(1, ...v.laender.map((l) => l[s.key]));
            const c = s.key === "angeschrieben" ? null : step[s.key];
            return (
              <div key={s.key} className="zt-col">
                <header><span>{s.label}</span><b>{kurzZahl(v.gesamt[s.key])}</b></header>
                {v.laender.map((l) => (
                  <div key={l.land} className="zt-bar" title={`${l.land}: ${l[s.key].toLocaleString("de-DE")}`}>
                    <span>{l.land}</span>
                    <em><i style={{ width: `${l[s.key] ? Math.max(3, (100 * l[s.key]) / max) : 0}%`, "--c": COUNTRY_COLOR[l.land] ?? OTHER_COLOR } as CSSProperties} /></em>
                    <b>{kurzZahl(l[s.key])}</b>
                  </div>
                ))}
                <div className="zt-conv">
                  {c ? <><ZtAmpel ampel={c.ampel} text={prozent(c.quote)} /><span>{c.key === "geantwortet" ? "von zugestellt" : "vom Schritt davor"}</span></>
                    : <span>{kurzZahl(v.gesamt.zugestellt)} zugestellt</span>}
                </div>
              </div>
            );
          })}
        </div>
        {step.geantwortet.jung && <p className="zt-foot">Antworten brauchen Zeit: Ampel erst 14 Tage nach der Versandwoche.</p>}
      </div>

      <div className="zt-row2">
        <div className="zt-card">
          <div className="zt-h"><h2>Je Land</h2></div>
          <table className="zt-tbl">
            <thead><tr><th>Land</th><th>angeschr.</th><th>zugest.</th><th>Antw.</th><th>Probe</th><th>Kauf</th><th>Kunde</th></tr></thead>
            <tbody>
              {[...v.laender, v.gesamt].map((l) => (
                <tr key={l.land} className={l.land === "gesamt" ? "sum" : undefined}>
                  <td>{l.land}</td><td>{kurzZahl(l.angeschrieben)}</td><td>{kurzZahl(l.zugestellt)}</td><td>{kurzZahl(l.geantwortet)}</td>
                  <td>{kurzZahl(l.probe)}</td><td>{kurzZahl(l.kauf)}</td><td>{kurzZahl(l.kunde)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="zt-foot">Seit Versandstart, Einheit = Käufer.</p>
        </div>
        <div className="zt-card">
          <div className="zt-h"><h2>Heiße Kontakte</h2><span className="zt-sp" /><Link href="/dashboard/antworten" className="zt-note">Cockpit <Icon name="weiter" size={13} /></Link></div>
          {!hot ? <p className="zt-none">Antworten gerade nicht lesbar.</p> : !hot.length ? <p className="zt-none">Keine offenen Kaufinteressen, Fragen oder Proben.</p> : (
            <ul className="zt-list">
              {hot.map((r) => {
                const m = intentMeta(r.intent);
                return (
                  <li key={r.id}>
                    <Link href={`/dashboard/antworten/${r.id}`} title={r.summary_de ?? m.label}>
                      <Icon name={m.icon} size={16} />
                      <span className="t"><b>{r.prospects?.company_name ?? "unbekannt"}</b><span>{m.label}{r.prospects?.country ? ` · ${r.prospects.country}` : ""}{r.status === "spaeter" ? " · später" : ""}</span></span>
                      <span className="w">vor {ageLabel(ageMinutes(r, now))}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}

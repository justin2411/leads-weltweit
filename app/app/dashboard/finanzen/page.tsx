import { loadPrognose } from "@/lib/prognose-data";
import { kurz as prognoseKurz, summary } from "@/lib/prognose";
import { loadFinanzen, loadZiele } from "@/lib/zentrale/data";
import { geldText, kpi } from "@/lib/zentrale/finanzen";
import { kurzZahl } from "@/lib/zentrale/kpi";
import { requireOwner } from "../actions";
import { ZtHead, ZtKpi } from "../zentrale";

export const metadata = { title: "Finanzen" };

/**
 * Abteilung Finanzen (Kommandozentrale, Inhaber 04.10.2026): MRR, Umsatz, Abos je Paket/Land, Kündigungen, Prognose,
 * Kosten. Nur Anzeige – Preise setzt das Gehirn bzw. der Inhaber. Testkäufe zählen nie; 0 bleibt 0.
 */
export default async function Finanzen() {
  await requireOwner();
  const now = new Date();
  const [f, pr, z] = await Promise.all([loadFinanzen(now), loadPrognose(now).catch(() => null), loadZiele()]);
  const mrrZiel = z.ziele.find((x) => x.key === "mrr")?.soll ?? null;
  const k = f ? kpi(f, mrrZiel) : null;
  const ps = pr ? summary(pr) : null;

  return (
    <div className="zt">
      <ZtHead title="Finanzen" at={now} />
      {!f ? <div className="zt-card"><p className="zt-none">Finanzdaten gerade nicht lesbar – gleich noch einmal laden.</p></div> : (
        <>
          <div className="zt-kpis">
            <ZtKpi value={geldText(f.mrr)} label="MRR (pro Monat)" ampel={k!.ampel} sub={mrrZiel ? `Ziel ${kurzZahl(mrrZiel, 0)}` : undefined} tip={k!.grund} />
            <ZtKpi value={geldText(f.umsatzMonat)} label="Umsatz dieser Monat" ampel={f.umsatzMonat.length ? "green" : "grey"} tip="Abrechnungstage der Abos seit Monatsanfang (Stripe bucht)" />
            <ZtKpi value={geldText(f.umsatzWoche)} label="Umsatz diese Woche" ampel={f.umsatzWoche.length ? "green" : "grey"} tip="Abrechnungstage seit Montag" />
            <ZtKpi value={kurzZahl(f.aktiv)} label="aktive Abos" ampel={f.aktiv ? "green" : "grey"} sub={f.testkaeufe ? `${f.testkaeufe} Testkauf getrennt` : undefined} tip="ohne Testkäufe" />
          </div>

          <div className="zt-row2">
            <div className="zt-card">
              <div className="zt-h"><h2>Abos</h2><span className="zt-sp" /><span className="zt-note">ohne Testkäufe</span></div>
              {!f.aktiv ? <p className="zt-none">Noch kein zahlendes Abo.</p> : (
                <table className="zt-tbl">
                  <thead><tr><th>Land</th><th>Abos</th><th>pro Monat</th></tr></thead>
                  <tbody>
                    {f.jeLand.map((l) => <tr key={l.land}><td>{l.land}</td><td>{l.n}</td><td>{geldText(l.mrr)}</td></tr>)}
                    <tr className="sum"><td>gesamt</td><td>{f.aktiv}</td><td>{geldText(f.mrr)}</td></tr>
                  </tbody>
                </table>
              )}
              {f.jePaket.length > 0 && <p className="zt-foot">{f.jePaket.map((p) => `${p.paket} ${p.n}`).join(" · ")}</p>}
            </div>
            <div className="zt-card">
              <div className="zt-h"><h2>Bewegung 30 Tage</h2></div>
              <table className="zt-tbl">
                <tbody>
                  <tr><td>neue Abos</td><td>{f.neu30}</td></tr>
                  <tr><td>Kündigungen</td><td>{f.kuendigungen30}</td></tr>
                  <tr><td>Zahlung offen (Stripe)</td><td>{f.zahlungOffen}</td></tr>
                  <tr><td>Vormonat Umsatz</td><td>{geldText(f.umsatzVormonat)}</td></tr>
                </tbody>
              </table>
              <p className="zt-foot">Währungen ohne Umrechnung.</p>
            </div>
          </div>
        </>
      )}

      <div className="zt-row3">
        <div className="zt-card">
          <div className="zt-h"><h2>Prognose 30 Tage</h2></div>
          {!ps ? <p className="zt-none">Prognose gerade nicht lesbar.</p> : (
            <>
              <div className="zt-h" title={pr!.map((p) => prognoseKurz(p)).join(" · ")}><b className="zt-big">{ps.value}</b><span className="zt-note">{ps.sub}</span></div>
            </>
          )}
          <p className="zt-foot">Nur aus echten Zählungen, keine Annahmen.</p>
        </div>
        <div className="zt-card">
          <div className="zt-h"><h2>Kosten</h2></div>
          <div className="zt-h"><b className="zt-big">0 €</b><span className="zt-note">feste Kosten des Systems</span></div>
          <p className="zt-foot">Hinweis: Supabase Pro zahlt der Inhaber selbst (8 GB inklusive).</p>
        </div>
        <div className="zt-card">
          <div className="zt-h"><h2>Rechnungen</h2></div>
          <div className="zt-h"><b className="zt-big">0</b><span className="zt-note">offene Entwürfe im System</span></div>
          <p className="zt-foot">Abo-Rechnungen stellt Stripe automatisch aus.</p>
        </div>
      </div>
    </div>
  );
}

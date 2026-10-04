import { berlin } from "@/lib/dashboard-logic";
import { AMPEL_TEXT } from "@/lib/ampel";
import { loadZieleIst } from "@/lib/zentrale/data";
import { kpiAus, zahl } from "@/lib/zentrale/ziele";
import { kurzZahl } from "@/lib/zentrale/kpi";
import { requireOwner } from "../actions";
import { ZtHead, ZtKpi } from "../zentrale/zt";
import { saveGoals } from "./actions";

export const metadata = { title: "Ziele" };

/**
 * Unternehmensziele (Kommandozentrale, Inhaber 04.10.2026): Soll/Ist/Fortschritt. Soll ändert nur der Inhaber
 * (Formular, „Übernehmen“ → signalwerk.company_goals + owner_log); Startwerte sind ein Vorschlag. Gehirn/JARVIS lesen.
 */
export default async function Ziele() {
  await requireOwner();
  const now = new Date();
  const { zeilen, error } = await loadZieleIst(now);
  const k = kpiAus(zeilen);
  const vorschlag = zeilen.filter((z) => z.quelle === "vorschlag").length;

  return (
    <div className="zt">
      <ZtHead title="Ziele" at={now} />
      <div className="zt-kpis">
        <ZtKpi value={k.wert} label="Ziele erreicht" ampel={k.ampel} tip={k.grund} />
        {zeilen.filter((z) => ["mrr", "kunden", "antwortquote"].includes(z.key)).map((z) => (
          <ZtKpi key={z.key} value={zahl(z.ist, z.einheit === "%" ? "%" : "")} label={z.titel} ampel={z.ampel} sub={`Soll ${zahl(z.soll, z.einheit === "%" ? "%" : "")}`} tip={z.hinweis || AMPEL_TEXT[z.ampel]} />
        ))}
      </div>

      <form action={saveGoals} className="zt-card">
        <div className="zt-h"><h2>Soll und Ist</h2><span className="zt-sp" />
          <span className="zt-note">{error ? error : vorschlag ? `${vorschlag} Startwerte als Vorschlag` : "alle vom Inhaber gesetzt"}</span></div>
        <div className="zt-goals">
          {zeilen.map((z) => (
            <div key={z.key} className={`zt-goal a-${z.ampel}`}>
              <div className="g-t">
                <b>{z.titel}</b>
                <span>{z.quelle === "inhaber" ? `gesetzt ${berlin(z.updated_at)}` : "Vorschlag"} · {z.richtung === "runter" ? "höchstens" : "mindestens"}</span>
              </div>
              <div className="g-p" title={AMPEL_TEXT[z.ampel]}>
                <em><i style={{ width: `${z.fortschritt === null ? 0 : Math.max(2, z.fortschritt * 100)}%` }} /></em>
                <span>Ist <b>{zahl(z.ist, z.einheit)}</b> · {z.fortschritt === null ? "–" : `${kurzZahl(z.fortschritt * 100, 0)} %`}{z.hinweis ? ` · ${z.hinweis}` : ""}</span>
              </div>
              <label>Soll{z.einheit ? ` (${z.einheit})` : ""}
                <input name={`soll_${z.key}`} defaultValue={String(z.soll).replace(".", ",")} inputMode="decimal" required maxLength={14} aria-label={`Soll ${z.titel}`} />
              </label>
            </div>
          ))}
        </div>
        <div className="zt-save"><span className="zt-note">Gehirn und JARVIS richten sich nach diesen Zielen.</span><button type="submit">Übernehmen</button></div>
      </form>
    </div>
  );
}

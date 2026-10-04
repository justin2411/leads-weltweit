import { berlin } from "@/lib/dashboard-logic";
import type { Ampel } from "@/lib/ampel";
import { GRUENDE, GRUND_TEXT, STAND_TEXT, type Grund } from "@/lib/zentrale/recht";
import { loadRecht, type RechtDaten } from "@/lib/zentrale/recht-data";
import { Icon } from "@/app/icons";
import { requireOwner } from "../actions";
import { Fold } from "../fold";
import { ZX_CSS } from "../zentrale/css";
import { Card, Dot, Head, Tile, amp, n } from "../zentrale/ui";

export const metadata = { title: "Recht" };

const GRUND_AMPEL: Record<Grund, Ampel> = { abmeldung: "gold", bounce: "grey", beschwerde: "red", sonst: "grey" };

/**
 * Abteilung „Recht“ (Inhaber 04.10.2026: Kommandozentrale „wie in einem unternehmen“): wer darf wohin angeschrieben
 * werden, Sperrliste, Abmelde-Link, Rechtstexte, offene Rechtsfragen, Spam-Beschwerden. Nur Anzeige – Länderregeln,
 * Sperrliste, Abmeldung und Notbremse ändert hier niemand.
 */
export default async function RechtPage() {
  await requireOwner();
  let d: RechtDaten | null = null;
  try {
    d = await loadRecht();
  } catch (e) {
    console.error("recht:", e); // Details nur im Server-Protokoll
  }
  return (
    <div className="v2 zx">
      <style dangerouslySetInnerHTML={{ __html: ZX_CSS }} />
      <Head name="Recht" icon="recht" at={d ? `Stand ${berlin(d.at, false)}` : undefined} />
      {d ? <Body d={d} /> : <div className="zx-err" role="alert">Recht-Daten gerade nicht lesbar – gleich noch einmal laden.</div>}
    </div>
  );
}

function Body({ d }: { d: RechtDaten }) {
  const sendet = d.laender.filter((l) => l.stand === "sendet");
  const erlaubt = d.laender.filter((l) => l.stand === "sendet" || l.stand === "frei");
  const s = d.sperren;
  const b30 = d.beschwerden30;
  const maxBar = Math.max(1, ...GRUENDE.map((g) => s?.je[g].gesamt ?? 0));
  return (
    <>
      <div className="zx-tiles">
        <Tile a={sendet.length ? "green" : "gold"} label="Versand an" value={`${sendet.length} Länder`} note={`${erlaubt.length} erlaubt`} />
        <Tile a={b30 === null ? "grey" : b30 > 0 ? "red" : "green"} label="Spam-Beschwerden" value={n(b30)} note="30 Tage" />
        <Tile a={s ? (s.je.beschwerde.d7 > 0 ? "red" : "green") : "grey"} label="Neue Sperren" value={n(s?.d7)} note={s ? `7 Tage · ${n(s.gesamt)} gesamt` : "nicht lesbar"} />
        <Tile a={d.abmelde.ampel} label="Abmelde-Link" value={d.abmelde.ampel === "green" ? "ok" : d.abmelde.ampel === "grey" ? "–" : "prüfen"} note={d.abmelde.titel} />
        <Tile a={d.texte.ampel} label="Rechtstexte" value={d.texte.ampel === "green" ? "fertig" : d.texte.luecken.length ? `${d.texte.luecken.length} Lücken` : "privat"} note="Impressum · Datenschutz · AGB" />
      </div>

      <div className="zx-grid">
        <Card title="Abmelde-Link" icon="abmeldung" sum={<span className={`zx-pill ${amp(d.abmelde.ampel)}`}>{d.abmelde.ampel === "green" ? "geht" : "prüfen"}</span>}>
          <div className="zx-check"><Dot a={d.abmelde.ampel} /><div><b>{d.abmelde.titel}</b><p>{d.abmelde.grund}</p></div></div>
          <p>Abmeldung mit einem Klick, nie abschaltbar.</p>
        </Card>
        <Card title="Rechtstexte" icon="dokument" sum={<span className={`zx-pill ${amp(d.texte.ampel)}`}>{d.texte.ampel === "green" ? "freigegeben" : "offen"}</span>}>
          <div className="zx-check"><Dot a={d.texte.ampel} /><div><b>{d.texte.ampel === "green" ? "Texte fertig" : d.texte.luecken.length ? "Texte unvollständig" : "Freigabe fehlt"}</b><p>{d.texte.grund}</p></div></div>
          <p><a href="/impressum" target="_blank" rel="noopener noreferrer">Impressum</a> · <a href="/datenschutz" target="_blank" rel="noopener noreferrer">Datenschutz</a> · <a href="/agb" target="_blank" rel="noopener noreferrer">AGB</a></p>
        </Card>
      </div>

      <Fold id="recht-laender" className="zx-card" head="zx-h" title={<h2><Icon name="land" size={14} />Länder</h2>}
        sum={`${sendet.length} senden · ${erlaubt.length} erlaubt · ${d.laender.length} gesamt`}>
        <ul className="zx-rows">
          {d.laender.map((l) => (
            <li key={l.code} className="zx-row" title={`${l.name}: Risiko ${l.risiko}. Bedingung: ${l.bedingung}`}>
              <Dot a={l.ampel} tip={STAND_TEXT[l.stand]} />
              <span className="n">{l.name} <small className="m">{l.code}</small></span>
              <span className="m">
                {l.stand === "nie" || l.stand === "gesperrt" ? `niemand · Risiko ${l.risiko}`
                  : [l.firmen ? "Firmen" : null, l.einzel ? "Einzelunternehmer" : "keine Einzelunternehmer", l.nurAllgemein ? "nur info@" : null].filter(Boolean).join(" · ")}
              </span>
              <span className="v">{STAND_TEXT[l.stand]}{l.limit ? ` · ${l.limit}/Tag` : ""}</span>
            </li>
          ))}
        </ul>
        <div className="zx-legend">
          {(["green", "gold", "grey", "red"] as Ampel[]).map((a, i) => <span key={a}><Dot a={a} />{["Versand an", "erlaubt, Versand aus", "gesperrt", "nie (Risiko hoch)"][i]}</span>)}
        </div>
      </Fold>

      <div className="zx-grid">
        <Card title="Sperrliste" icon="schloss" sum={s ? `${n(s.gesamt)} gesamt · ${n(s.d7)} in 7 Tagen` : "nicht lesbar"}>
          {!s ? <p className="zx-none">Sperrliste gerade nicht lesbar.</p> : (
            <div className="zx-bars">
              {GRUENDE.filter((g) => g !== "sonst" || s.je.sonst.gesamt > 0).map((g) => (
                <div key={g} className={`zx-bar ${amp(GRUND_AMPEL[g])}`} title={`${GRUND_TEXT[g]}: ${s.je[g].gesamt} gesamt, ${s.je[g].d7} in 7 Tagen`}>
                  <span>{GRUND_TEXT[g]}</span>
                  <i><s style={{ width: `${s.je[g].gesamt ? Math.max(3, (s.je[g].gesamt / maxBar) * 100) : 0}%` }} /></i>
                  <b>{n(s.je[g].gesamt)} <small>(+{n(s.je[g].d7)})</small></b>
                </div>
              ))}
            </div>
          )}
          <p style={{ marginTop: 10 }}>Sperren sind dauerhaft und werden nie aufgehoben.</p>
        </Card>
        <Card title="Offene Rechtsfragen" icon="frage" sum={`${d.fragen.length} beim Inhaber`}>
          <ul className="zx-rows">
            {d.fragen.map((f) => (
              <li key={f.titel} className="zx-row" style={{ gridTemplateColumns: "14px minmax(0,1fr)" }}>
                <Dot a="gold" tip="offen" />
                <span className="n">{f.titel}<small className="m" style={{ display: "block", fontWeight: 400 }}>{f.grund}</small></span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

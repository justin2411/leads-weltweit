import Link from "next/link";
import { ago, berlin } from "@/lib/dashboard-logic";
import { dauer } from "@/lib/ueberblick";
import { bausteine, stillAmpel } from "@/lib/zentrale/betrieb";
import { loadBetrieb, type BetriebDaten } from "@/lib/zentrale/betrieb-data";
import { Icon } from "@/app/icons";
import { requireOwner } from "../actions";
import { Fold } from "../fold";
import { ZX_CSS } from "../zentrale/css";
import { Card, Dot, Head, Tile, amp, n } from "../zentrale/ui";

export const metadata = { title: "Betrieb" };

const BREMSE: Record<string, string> = { aus: "aus", hinweis: "Hinweis", drossel: "Drossel", "ohne-rohbestand": "ohne Rohbestand", stopp: "Lead-Werk gestoppt" };
const gb = (b: number | null) => (b === null ? "–" : `${(b / 1024 ** 3).toLocaleString("de-DE", { maximumFractionDigits: 1 })} GB`);
const pct = (x: number | null) => (x === null ? "–" : `${(x * 100).toLocaleString("de-DE", { maximumFractionDigits: 1 })} %`);

/**
 * Abteilung „Betrieb“ (Inhaber 04.10.2026: Kommandozentrale): läuft alles? Workflows, Postfächer, Speicher, Website,
 * Datenfluss und die Not-Aus-Schalter. Nur Anzeige – Schalter ändert der Inhaber im Regler.
 */
export default async function BetriebPage() {
  await requireOwner();
  let d: BetriebDaten | null = null;
  try {
    d = await loadBetrieb();
  } catch (e) {
    console.error("betrieb:", e);
  }
  return (
    <div className="v2 zx">
      <style dangerouslySetInnerHTML={{ __html: ZX_CSS }} />
      <Head name="Betrieb" icon="werk" at={d ? `Stand ${berlin(d.at, false)}` : undefined}>
        <Link className="zx-link" href="/dashboard/regler"><Icon name="regler" size={14} />Regler</Link>
      </Head>
      {d ? <Body d={d} /> : <div className="zx-err" role="alert">Betriebs-Daten gerade nicht lesbar – gleich noch einmal laden.</div>}
    </div>
  );
}

function Body({ d }: { d: BetriebDaten }) {
  const now = new Date(d.at);
  const teile = bausteine(d);
  const wfBad = d.workflows.filter((w) => w.ampel === "red" || w.ampel === "gold").length;
  const heute = d.boxen.reduce((a, b) => a + b.heute, 0), cap = d.boxen.reduce((a, b) => a + b.cap, 0);
  const still = d.still.filter((s) => s.stufe === "rot" || s.stufe === "gelb");
  const TEXT: Record<string, string> = {
    Workflows: wfBad ? `${wfBad} auffällig` : "alle ok", Postfächer: d.notbremse ? "Notbremse" : `${n(heute)}/${n(cap)} heute`,
    Speicher: pct(d.speicher.anteil), Website: d.web.score === null ? "–" : `${d.web.score}/100`, Datenfluss: still.length ? `${still.length} still` : "fließt",
  };
  const HREF: Record<string, string> = { Workflows: "#betrieb-workflows", Postfächer: "#betrieb-postfaecher", Speicher: "/dashboard/speicher", Website: "/dashboard/website", Datenfluss: "#betrieb-datenfluss" };
  return (
    <>
      <div className="zx-tiles">
        {teile.map((t) => <Tile key={t.name} a={t.ampel} label={t.name} value={TEXT[t.name]} href={HREF[t.name]} />)}
      </div>

      <Fold id="betrieb-workflows" className="zx-card" head="zx-h" title={<h2><Icon name="pipeline" size={14} />Workflows</h2>}
        sum={d.mitToken ? "GitHub" : "Datenbank"}>
        <ul className="zx-rows">
          {d.workflows.map((w) => (
            <li key={w.file} className="zx-row" title={w.file}>
              <Dot a={w.ampel} tip={w.text} />
              <span className="n">{w.url ? <a href={w.url} target="_blank" rel="noopener noreferrer">{w.name}</a> : w.name}</span>
              <span className="m">{w.last ? `${ago(w.last, now)} · ${berlin(w.last)}` : "kein Lebenszeichen"}</span>
              <span className="v">{w.text}</span>
            </li>
          ))}
        </ul>
      </Fold>

      <div className="zx-grid">
        <Card id="betrieb-postfaecher" title="Postfächer" icon="mail" sum={d.notbremse ? <span className={`zx-pill ${amp("red")}`}>Notbremse</span> : `${n(heute)} von ${n(cap)} heute`}>
          {d.notbremse && <p className="zx-err" style={{ margin: "0 0 8px" }}>{d.notbremse}</p>}
          {!d.boxen.length ? <p className="zx-none">Postfächer gerade nicht lesbar.</p> : (
            <ul className="zx-rows">
              {d.boxen.map((b) => (
                <li key={b.box} className="zx-row" title={b.rate === null ? "unter 30 Mails – noch keine Aussage" : `${b.bounced} Bounces von ${b.d14} Mails (14 Tage)`}>
                  <Dot a={b.ampel} />
                  <span className="n">{b.label}</span>
                  <span className="m">{b.rate === null ? "Bounce –" : `Bounce ${pct(b.rate)} · 14 Tage`}</span>
                  <span className="v">{n(b.heute)}/{n(b.cap)}</span>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <Card title="Speicher & Website" icon="speicher">
          <div className="zx-check"><Dot a={d.speicher.ampel} /><div>
            <b>Datenbank {gb(d.speicher.bytes)} von 8 GB</b>
            <p>Speicher-Bremse: {d.speicher.bremse ? BREMSE[d.speicher.bremse] ?? d.speicher.bremse : "noch keine Messung"}.</p>
          </div></div>
          <div className="zx-check" style={{ marginTop: 12 }}><Dot a={d.web.ampel} /><div>
            <b>Website {d.web.score === null ? "ohne Check" : `${d.web.score}/100`}</b>
            <p>{d.web.at ? `Letzter Check ${ago(d.web.at, now)}.` : "Noch kein Website-Check."} <Link href="/dashboard/website">Website</Link></p>
          </div></div>
        </Card>
      </div>

      <Card id="betrieb-datenfluss" title="Datenfluss" icon="tempo" sum={still.length ? `${still.length} Station(en) still` : "alles fließt"}>
        {!d.still.length ? <p className="zx-none">Datenfluss gerade nicht lesbar.</p> : (
          <ul className="zx-rows">
            {d.still.map((s) => (
              <li key={s.key} className="zx-row">
                <Dot a={stillAmpel(s.stufe)} />
                <span className="n">{s.name}</span>
                <span className="m">{s.stufe === "aus" ? "gewollt aus" : s.stufe === "keine_basis" ? "zu wenig Daten" : s.intervall_h ? `üblich alle ${dauer(s.intervall_h)}` : ""}</span>
                <span className="v">{s.still_h === null ? "–" : `vor ${dauer(s.still_h)}`}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Schalter" icon="regler" sum={<Link href="/dashboard/regler">im Regler ändern</Link>}>
        <div className="zx-sw">
          {d.schalter.map((s) => (
            <div key={s.key} className={`${s.fest ? "fest " : ""}${amp(s.an ? "green" : "gold")}`}
              title={s.fest ? "Schutz – nie abschaltbar" : s.seit ? `pausiert seit ${berlin(s.seit)}` : undefined}>
              <Dot a={s.an ? "green" : "gold"} />{s.name}<em>{s.fest ? "immer an" : s.an ? "an" : "aus"}</em>
            </div>
          ))}
        </div>
      </Card>
    </>
  );
}

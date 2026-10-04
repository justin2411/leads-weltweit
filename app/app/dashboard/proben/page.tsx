import { Fold } from "../fold";
import Link from "next/link";
import { COUNTRIES, CONFIG, SEGMENT, canDispatch, loadActivity, loadLive, loadOwnerSettings, loadPremium, loadStock } from "@/lib/dashboard-data";
import { isLive } from "@/lib/werke-live";
import { SampleFactory } from "../live";
import { MAX_AGE_RANGE, MAX_SAMPLE_TARGET } from "@/lib/owner-settings";
import { dispatchWorkflow, saveMaxAge, saveSampleTargets } from "../control-actions";
import { COUNTRY_COLOR, berlin, compact, distinctReplies, durationS, nextRun, onlySegment, sampleStock, stockSegment } from "@/lib/dashboard-logic";
import { requireOwner } from "../actions";
import { Back, COUNTRY_OPTS, Chips, Ctrl, Fill, Leer, PageHead, Kpi, ago2 } from "../v2";
import { readParams, withQuery, type SP } from "../params";

/** Proben: Vorrat je Seite und alle Anfragen (Website + Mail-Antwort) mit Zeit bis zur Probe. */
export default async function Proben({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const { land, countries, raw } = await readParams(searchParams);
  const [liveAll, own, stockAll, act, prem] = await Promise.all([loadLive(), loadOwnerSettings(), loadStock().catch(() => null), loadActivity(), loadPremium()]);
  const live = onlySegment(liveAll, SEGMENT);
  const stock = stockSegment(stockAll, SEGMENT);
  const now = new Date(live.now);
  // Soll aus dem Dashboard (owner_settings), sonst config/proben.yaml
  const cfg = { ...CONFIG, sample_overrides: own.sample_targets, proben: { ...CONFIG.proben, max_alter_stunden: own.sample_max_age_hours ?? CONFIG.proben.max_alter_stunden } };
  const st = sampleStock(live, cfg, now).filter((r) => countries.some((c) => r.key.endsWith(`/${c}`)));
  const here = withQuery("/dashboard/proben", raw);
  const wf = CONFIG.workflows.find((w) => w.file === "proben-vorrat.yml");
  const nextFill = wf ? nextRun(wf.crons, now) : null;
  const L = (c: string) => stock?.leads.filter((l) => l.country === c && l.status === "new").reduce((a, l) => a + Number(l.n), 0) ?? 0;
  const P = (c: string, f: "n" | "unused" | "sent" | "queued") => Number(stock?.prospects.find((x) => x.country === c && x.check_status === "ok")?.[f] ?? 0);
  const web = live.sample_requests.filter((r) => countries.includes(r.country ?? ""));
  const mail = distinctReplies(live.events).filter((e) => e.type === "sample_requested" && countries.includes(e.country ?? ""));
  const rows = [
    ...web.map((r) => ({ key: r.id, company: r.company_name, country: r.country, at: r.created_at, status: r.status === "sent" ? "gesendet" : r.status === "new" ? "offen" : "abgelehnt", wait: r.status === "sent" && r.sent_at ? durationS(Date.parse(r.sent_at) - Date.parse(r.created_at)) : r.status === "new" ? `wartet ${durationS(now.getTime() - Date.parse(r.created_at))}` : "–", via: "Website" })),
    ...mail.map((e) => ({ key: e.id, company: e.company_name ?? "?", country: e.country ?? null, at: e.occurred_at, status: "gesendet", wait: "sofort", via: "Mail" })),
  ].sort((a, b) => (a.at < b.at ? 1 : -1));
  const ready = st.reduce((a, r) => a + r.ready, 0), target = st.reduce((a, r) => a + r.target, 0);
  // Nur noch Premium (Inhaber 05.10.2026): reine Premium-Proben je Land, sonst mit Standard aufgefüllt
  const PR = (c: string) => prem?.find((x) => x.segment_id === SEGMENT && x.country === c);
  const small = countries.filter((c) => PR(c) && PR(c)!.zu_klein);

  return (
    <div className="v2">
      <PageHead title="Proben" icon="proben"><Chips base="/dashboard/proben" param="land" value={land} options={COUNTRY_OPTS} params={raw} dots /></PageHead>
      <div className="kpis2 four">
        <Kpi value={`${ready}/${target}`} label="Vorrat fertig" tip={SEGMENT === "S2" ? "Webagenturen: kein Verfall – Freigabe aller 10 Leads wird alle 20 h erneuert" : `Verfall nach ${cfg.proben.max_alter_stunden} h`} />
        <Kpi value={compact(web.filter((r) => r.status === "new").length)} label="offen" />
        <Kpi value={compact(rows.filter((r) => r.status === "gesendet").length)} label="gesendet" />
        <Kpi value={compact(st.reduce((a, r) => a + r.sent24, 0))} label="24 h sofort" tip="aus dem Vorrat direkt nach dem Klick" />
      </div>
      <section className="card tile">
        <header className="th"><span title="Läuft nur, wenn gerade Proben gebaut und durch die Drei-Stufen-Freigabe geprüft werden">Probenfertigung</span></header>
        <SampleFactory building={isLive(act, "proben-vorrat", now)} sending={act.stock_sent_60m > 0 || (act.last_stock_sent_at ? now.getTime() - Date.parse(act.last_stock_sent_at) < 15 * 60_000 : false)}
          stacks={st.map((r) => ({ country: r.key.split("/")[1], ready: r.ready, target: r.target }))} />
        <div className="fills">{st.map((r) => <Fill key={r.key} label={r.slug} ready={r.ready} target={r.target} tip={r.oldestH !== null ? `älteste ${Math.round(r.oldestH)} h` : "leer"} />)}</div>
      </section>
      <Fold id="proben-je-land" className="card tile" head="th" title={<span title="Kunden-Leads = lieferbare Leads für Webagentur-Kunden · Käufer = mail-fähige Webagenturen">Je Land</span>} sum={`${countries.length} Länder`}>
        <div className="tbl"><table>
          <thead><tr><th>Land</th><th className="num">Kunden-Leads</th><th className="num">Käufer mail-fähig</th><th className="num" title="noch ohne Mail">frei</th><th className="num" title="Mail geschrieben und geprüft, wartet auf Versand">Mail bereit</th><th className="num" title="Mail wirklich gesendet">gesendet</th><th className="num" title="freie Premium-Leads (frisch ≤ 30 Tage) · Proben nur aus Premium (10/10) von allen Proben">Premium</th></tr></thead>
          <tbody>{countries.map((c) => (
            <tr key={c}><td><i className="dot" style={{ background: COUNTRY_COLOR[c] }} />{c}</td><td className="num">{stock ? compact(L(c)) : "…"}</td>
              <td className="num">{stock ? compact(P(c, "n")) : "…"}</td><td className="num">{stock ? compact(P(c, "unused")) : "…"}</td>
              <td className="num">{stock ? compact(P(c, "queued")) : "…"}</td><td className="num">{stock ? compact(P(c, "sent")) : "…"}</td>
              <td className="num">{PR(c) ? `${compact(PR(c)!.premium_frei)} · ${PR(c)!.proben_premium}/${PR(c)!.proben}` : "…"}</td></tr>
          ))}</tbody>
        </table></div>
        {small.length > 0 && <p className="hint" title="Proben brauchen genau 10 Leads – bis genug Premium da ist, füllen Standard-Leads auf">Premium-Vorrat zu klein: {small.join(", ")}</p>}
      </Fold>

      <h2 className="h2s">Steuerung</h2>
      <div className="ctrls">
        <Ctrl title="Soll je Seite" tip={`Wie viele fertige Proben je Land bereitliegen (0–${MAX_SAMPLE_TARGET}). Leer = Standard aus config/proben.yaml. Jede Probe reserviert 10 Leads.`}>
          <form action={saveSampleTargets}>
            <Back to={here} />
            {COUNTRIES.map((c) => {
              const k = `${SEGMENT}/${c}`;
              return (
                <label key={k} className="frow"><b>{c}</b>
                  <input type="number" name={`target_${k}`} min={0} max={MAX_SAMPLE_TARGET} defaultValue={own.sample_targets[k] ?? ""} placeholder={String(CONFIG.proben.fokus_je_seite)} />
                  <span className="hint">Ist {st.find((r) => r.key === k)?.ready ?? 0}</span>
                </label>
              );
            })}
            <button className="primary">Speichern</button>
          </form>
        </Ctrl>
        <Ctrl title="Verfall" tip={`Proben älter als das werden verworfen und neu gebaut (Signale altern). ${MAX_AGE_RANGE[0]}–${MAX_AGE_RANGE[1]} h.`}>
          {SEGMENT === "S2" ? (
            <div className="facts">
              <span><b>Webagenturen: kein Verfall</b> (Inhaber 03.10.2026)</span>
              <span className="muted">Sicherheit: alle 10 Leads jeder Probe laufen alle 20 h erneut durch die Drei-Stufen-Freigabe (Trigger live nachgeprüft); eine Probe geht nur mit Freigabe &lt; 26 h raus, sonst wird sie neu gebaut.</span>
            </div>
          ) : (
          <form action={saveMaxAge}>
            <Back to={here} />
            <label className="frow"><b>h</b>
              <input type="number" name="hours" min={MAX_AGE_RANGE[0]} max={MAX_AGE_RANGE[1]} defaultValue={own.sample_max_age_hours ?? ""} placeholder={String(CONFIG.proben.max_alter_stunden)} />
              <span className="hint">Stunden</span>
            </label>
            <button className="primary">Speichern</button>
          </form>
          )}
        </Ctrl>
        <Ctrl title="Auffüllen" tip="Baut fehlende Proben sofort (sonst stündlich nach Zeitplan).">
          <form action={dispatchWorkflow}>
            <Back to={here} /><input type="hidden" name="wf" value="proben-vorrat" />
            <button disabled={!canDispatch()}>Jetzt auffüllen</button>
          </form>
          <span className="hint">{canDispatch() ? <>nächster Lauf {nextFill ? berlin(nextFill) : "–"}</> : <>Startet beim nächsten Lauf {nextFill ? berlin(nextFill, false) : "–"}. Sofortstart: Token in Vercel einrichten (<Link href="/dashboard/hilfe#token">Anleitung</Link>)</>}</span>
        </Ctrl>
        <Ctrl title="Feste Regeln" tip="Nicht änderbar." locked="nur Anzeige">
          <div className="facts">
            <span>Probe = <b>genau 10</b> verschiedene Firmen</span>
            <span>nur Leads mit <b>allen Prüfungen</b> (keine widersprüchlichen Daten)</span>
            <span>„Probe senden“ nur an Firmen, die <b>selbst angefragt</b> haben (automatisch)</span>
          </div>
        </Ctrl>
      </div>
      <Fold id="proben-liste" title="Proben" sum={`${rows.length} · ${rows.filter((r) => r.status === "offen").length} offen`}>
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
        {rows.length === 0 && <Leer icon="proben" text="Noch keine Proben." />}
      </div>
      </Fold>
    </div>
  );
}

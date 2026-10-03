import Link from "next/link";
import { CONFIG, SEGMENT, canDispatch, loadActivity, loadLive, loadOwnerSettings, loadRunRows, loadStock } from "@/lib/dashboard-data";
import { berlin, compact, mailboxes, nextRun, onlySegment, stockSegment } from "@/lib/dashboard-logic";
import { coach, hall, laneStats, running, utilization, laneOf, type Beat } from "@/lib/leitstand";
import { WERK_SWITCHES, WORKFLOWS, slotCounts, werkOn, type LaneRegistry, type WerkKey } from "@/lib/owner-settings";
import { werkStatus, isLive, type WerkId } from "@/lib/werke-live";
import LANES from "@/lib/werk-linien.json";
import { requireOwner } from "../actions";
import { dispatchWorkflow, saveSlotPlan } from "../control-actions";
import { WerkSwitch } from "../werk-switch";
import { Back } from "../v2";
import { Bays, Gauge, LANE_COLOR, Panel, Reactor, UtilChart, laneColor } from "./hud";
import { Pult } from "./pult";
import { Clock, Voice } from "./voice";

export const metadata = { title: "JARVIS" };

const REG = LANES as unknown as LaneRegistry;

/** Maschinen: Schalter, Status, nächster Start, Start-Knopf (wo es einen Ablauf gibt). */
const MACHINES: { key: WerkKey; werk?: WerkId; maxH: number; wf?: keyof typeof WORKFLOWS; file: string; what: string }[] = [
  { key: "lead-werk", werk: "lead-werk", maxH: 4, wf: "lead-werk", file: "lead-werk.yml", what: "Leads holen, prüfen, speichern" },
  { key: "kunden-werk", werk: "kunden-werk", maxH: 5, wf: "kunden-werk", file: "kunden-werk.yml", what: "Webagenturen als Käufer prüfen" },
  { key: "proben-vorrat", werk: "proben-vorrat", maxH: 26, wf: "proben-vorrat", file: "proben-vorrat.yml", what: "fertige, geprüfte Proben bereithalten" },
  { key: "versand", werk: "versand", maxH: 26, wf: "versand", file: "send.yml", what: "Kaltmails im Rahmen der Limits" },
  { key: "nachfass", maxH: 26, file: "taeglich.yml", what: "Nachfassmail nach 4 Tagen ohne Antwort" },
  { key: "antworten", werk: "antworten", maxH: 30, file: "antworten.yml", what: "Antworten lesen, Proben senden, Abmeldungen sperren" },
  { key: "kundenlieferung", maxH: 170, file: "kundenlieferung.yml", what: "Lieferungen an zahlende Kunden (montags)" },
  { key: "tagescheck", maxH: 26, file: "tagescheck.yml", what: "täglicher Gesamtcheck per Mail" },
];

/**
 * JARVIS – Leitstand der Werke (Inhaber 03.10.2026: „das ganze dashboard als wirklich industrie leitung … die werke
 * und alles daran wie maschinen steuern … futuristisch … wie bei tony stark … nenne es auch jarvis“).
 */
export default async function Jarvis() {
  await requireOwner();
  const stockP = loadStock();
  stockP.catch(() => {});
  const [liveAll, own, act, rows, stockAll] = await Promise.all([
    loadLive(), loadOwnerSettings(), loadActivity(), loadRunRows(24),
    Promise.race([stockP.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 2500))]),
  ]);
  const live = onlySegment(liveAll, SEGMENT);
  const stock = stockSegment(stockAll, SEGMENT);
  const now = new Date(live.now);
  const t = now.getTime();
  const plan = slotCounts(REG, own.slot_plan);
  const custom = Object.keys(own.slot_plan ?? {}).length > 0;
  const beats = act.heartbeats as Beat[];
  const bays = hall(REG, plan, beats, t);
  const run = bays.filter((b) => b.state === "run").length;
  const busy = bays.filter((b) => b.state === "run" || b.state === "other").length;
  const stats = laneStats(REG, rows, t);
  const firstRun = rows.reduce<number | null>((a, r) => (r.started_at && (a === null || Date.parse(r.started_at) < a) ? Date.parse(r.started_at) : a), null);
  const util = utilization(rows, beats, t, REG.total_slots, 24, 30, firstRun);
  const countedNote = firstRun && firstRun > t - 24 * 3_600_000 ? `gezählt seit ${berlin(new Date(firstRun))}` : "letzte 24 h";
  const cap = REG.total_slots - REG.reserve;

  // Kennzahlen (echte Zählungen)
  const countries = ["US", "UK", "FR"];
  const queue = Object.fromEntries(countries.map((c) => [c, live.msg.filter((m) => m.country === c && m.kind === "initial" && m.status === "approved").reduce((a, m) => a + Number(m.n), 0)]));
  const freeBuyers = Object.fromEntries(countries.map((c) => [c, Number(stock?.prospects.find((p) => p.country === c && p.check_status === "ok")?.unused ?? 0)]));
  const leads = Object.fromEntries(countries.map((c) => [c, stock ? stock.leads.filter((l) => l.country === c && l.status === "new").reduce((a, l) => a + Number(l.n), 0) : 0]));
  const boxes = mailboxes(liveAll, CONFIG);
  const capPerDay = boxes.reduce((a, b) => a + b.cap, 0);
  const sentToday = boxes.reduce((a, b) => a + b.today, 0);
  const kundenNew24h = stockAll ? stockAll.prospects_24h.filter((p) => p.check_status === "ok").reduce((a, p) => a + Number(p.n), 0) : null;
  const leads24h = stockAll ? stockAll.leads_24h.reduce((a, l) => a + Number(l.n), 0) : 0;
  const failed = beats.filter((b) => /^abgebrochen/.test(b.note ?? "") && t - Date.parse(b.beat_at) < 6 * 3_600_000)
    .map((b) => `${b.werk} ${b.part} um ${berlin(b.beat_at)}: ${b.note}`);
  const tips = coach({ reg: REG, plan, stats, util: util.rate, queue, freeBuyers, leads, capPerDay, kundenNew24h, failed, countedHours: firstRun ? Math.min(24, (t - firstRun) / 3_600_000) : 0 });
  const sp = act.stichprobe ?? [];
  const spChecked = sp.reduce((a, r) => a + r.candidates, 0), spGreen = sp.reduce((a, r) => a + r.green, 0);
  const gatePct = spChecked ? Math.round((spGreen / spChecked) * 1000) / 10 : null;

  // nächster Start je Werk (deutsche Zeit): Werke starten sich nach jedem Lauf selbst neu, Zeitplan als Rückfall
  const nx = (file: string) => { const w = CONFIG.workflows.find((x) => x.file === file); const d = w ? nextRun(w.crons, now) : null; return d ? berlin(d, false) : "–"; };
  const leadRunning = beats.some((b) => b.werk === "lead-werk" && running(b, t));
  const kundenRunning = beats.some((b) => b.werk === "kunden-werk" && running(b, t));
  const nextStart = { "lead-werk": leadRunning ? "nach diesem Lauf" : `spätestens ${nx("lead-werk.yml")}`, "kunden-werk": kundenRunning ? "nach diesem Lauf" : `spätestens ${nx("kunden-werk.yml")}` };
  const liveByLane: Record<string, number> = {};
  for (const b of beats) if (running(b, t)) { const l = laneOf(b.werk, b.part); if (l) liveByLane[l] = (liveByLane[l] ?? 0) + 1; }

  const h = Number(new Intl.DateTimeFormat("de-DE", { timeZone: "Europe/Berlin", hour: "numeric" }).format(now));
  const hello = h < 5 ? "Gute Nacht, Justin." : h < 11 ? "Guten Morgen, Justin." : h < 18 ? "Guten Tag, Justin." : "Guten Abend, Justin.";
  const voice = [hello, `${busy} von ${REG.total_slots} Plätzen arbeiten gerade`, tips[0] ? tips[0].title : "alle Systeme im grünen Bereich"];
  const labels: Record<string, string> = Object.fromEntries(REG.lanes.flatMap((l) => [[l.id, l.label], [`short:${l.id}`, l.short]]));
  const dispatch = canDispatch();
  const here = "/dashboard/jarvis";

  return (
    <div className="jv">
      <div className="jv-head">
        <div className="jv-brand"><span className="jv-logo" aria-hidden><i /><i /><i /></span><div><h1>J.A.R.V.I.S.</h1><span>Leitstand der Werke · Webagenturen</span></div></div>
        <Clock />
      </div>
      <Voice lines={voice} />

      <div className="jv-hero">
        <div className="jv-col">
          <Gauge value={act.leads_60m} max={Math.max(act.leads_60m, Math.round((leads24h / 24) * 2), 1)} label="Leads · letzte Stunde" tone="cyan" tip="neue grüne Leads in den letzten 60 Minuten; Skala = doppelter Stundenschnitt der letzten 24 h" sub={`Ø ${compact(Math.round(leads24h / 24))}/h · 24 h ${compact(leads24h)}`} />
          <Gauge value={act.buyers_ok_60m} max={Math.max(act.buyers_ok_60m, 50)} label="Käufer geprüft · 60 min" tone="gold" tip="Käufer, die in der letzten Stunde als mail-fähig geprüft wurden" sub={kundenNew24h === null ? "…" : `neu in 24 h: ${compact(kundenNew24h)}`} />
        </div>
        <Reactor bays={bays} running={busy} util={util.rate} center={`${busy}/${REG.total_slots}`} sub={`Plätze aktiv · Auslastung ${Math.round(util.rate * 100)} %`} />
        <div className="jv-col">
          <Gauge value={sentToday} max={Math.max(capPerDay, sentToday, 1)} label="Mails heute" tone="green" tip="gesendete Kaltmails heute (alle Postfächer) gegen die Tageskapazität" sub={`Kapazität ${capPerDay}/Tag`} />
          <Gauge value={gatePct ?? 0} max={100} unit="%" label="Freigabe-Stichprobe" tone={gatePct === null ? "amber" : gatePct >= 98 ? "green" : gatePct >= 95 ? "amber" : "red"} tip="Anteil der Leads, die in der täglichen Stichprobe alle drei Prüfstufen bestehen (Ziel ≥ 98 %)" sub={gatePct === null ? "noch keine Stichprobe" : `${spGreen}/${spChecked} bestanden`} />
        </div>
      </div>

      <div className="jv-grid">
        <Panel title="Empfehlungen" code="JARVIS" className="jv-coach" right={<span className="jv-n">{tips.length}</span>}>
          <ul className="jtips">
            {tips.map((x, i) => (
              <li key={i} className={`jtip ${x.level}`}>
                <b>{x.title}</b><span>{x.text}</span>
                {x.href && <Link href={x.href} className="jtip-go">{x.href.startsWith("#") ? "zum Steuerpult ›" : "ansehen ›"}</Link>}
              </li>
            ))}
          </ul>
        </Panel>
        <Panel title="Auslastung der Plätze · 24 h" code="SYS-01" right={<span className="jv-n">{Math.round(util.rate * 100)} %</span>}>
          <UtilChart buckets={util.buckets} total={REG.total_slots} cap={cap} />
          <p className="jv-note">Belegte Plätze im Mittel je 30 Minuten (Lead- und Kunden-Werk) · Auslastung {countedNote}. Graue Balken: Zeit vor Beginn der Zählung (keine Daten, nicht leer).</p>
        </Panel>
      </div>

      <Panel title="Werkhalle · 40 Plätze" code="BAY" right={<span className="jv-legend">{REG.lanes.filter((l) => plan[l.id] > 0 || liveByLane[l.id]).map((l) => <span key={l.id}><i style={{ background: LANE_COLOR[l.id] }} />{l.short}</span>)}<span><i className="lg-plan" />eingeplant</span><span><i className="lg-free" />frei</span></span>}>
        <Bays bays={bays} labels={labels} />
        <p className="jv-note">{run} Teile laufen · {bays.filter((b) => b.state === "plan").length} eingeplant und gerade leer · {bays.filter((b) => b.state === "free").length} frei · {REG.reserve} reserviert für Versand, Tagescheck, Wachhund. Live aus den Herzschlägen der Werke (alle ~2 min).</p>
      </Panel>

      <Panel title="Steuerpult · Plätze je Linie" code="CTRL" id="pult" className="jv-pult" right={<span className="jv-n">{custom ? "deine Belegung" : "Standard"}</span>}>
        <Pult
          lanes={REG.lanes.map((l) => ({ id: l.id, werk: l.werk, label: l.label, short: l.short, what: l.what, max: l.max, def: l.default, cur: plan[l.id] ?? 0, color: laneColor(l.id),
            stat: { runs: stats[l.id].runs, green: stats[l.id].green, perSlotH: stats[l.id].perSlotH, avgRunMin: stats[l.id].avgRunMin, perRun: stats[l.id].perRun, exhausted: stats[l.id].exhausted, live: liveByLane[l.id] ?? 0 } }))}
          cap={cap} total={REG.total_slots} back={here} action={saveSlotPlan} nextStart={nextStart} custom={custom}
        />
      </Panel>

      <Panel title="Maschinen" code="MCH" right={!dispatch ? <Link href="/dashboard/hilfe" className="jv-n">Sofortstart einrichten ›</Link> : undefined}>
        <div className="machines">
          {MACHINES.map((m) => {
            const sw = werkOn(own, m.key);
            const st = m.werk ? werkStatus({ werk: m.werk, a: act, now, maxH: m.maxH, pausedSince: sw.since, off: !sw.on }) : null;
            const liveNow = m.werk ? isLive(act, m.werk, now) && sw.on : false;
            const parts = m.werk ? beats.filter((b) => b.werk === m.werk && running(b, t)).length : 0;
            return (
              <article key={m.key} className={`mc ${!sw.on ? "off" : liveNow ? "live" : st?.cls === "t-red" ? "bad" : ""}`}>
                <div className="mc-top"><span className="mc-lamp" aria-hidden /><b>{WERK_SWITCHES[m.key].label}</b>
                  <WerkSwitch werk={m.key} on={sw.on} back={here} label={WERK_SWITCHES[m.key].label} note={"note" in WERK_SWITCHES[m.key] ? (WERK_SWITCHES[m.key] as { note?: string }).note : undefined} /></div>
                <span className="mc-what">{m.what}</span>
                <dl>
                  <div><dt>Status</dt><dd>{!sw.on ? "pausiert" : st ? st.label : "nach Plan"}{parts ? ` · ${parts} Teile` : ""}</dd></div>
                  <div><dt>Plan</dt><dd>{nx(m.file)}</dd></div>
                  {st?.why && <div className="wide"><dt>Info</dt><dd>{st.why}</dd></div>}
                </dl>
                {m.wf && (
                  <form action={dispatchWorkflow} className="mc-go"><Back to={here} /><input type="hidden" name="wf" value={m.wf} />
                    <button disabled={!dispatch || !sw.on} title={dispatch ? "jetzt zusätzlich starten" : "Sofortstart braucht den GitHub-Token in Vercel (Hilfe)"}>▶ Jetzt starten</button>
                  </form>
                )}
              </article>
            );
          })}
        </div>
        <p className="jv-note">Nie abschaltbar (Sicherheit): Abmelde-Link, Bounce- und Beschwerde-Sperren, Sperrliste, Notbremse, Drei-Stufen-Freigabe, Abmelde-Erkennung.</p>
      </Panel>
    </div>
  );
}

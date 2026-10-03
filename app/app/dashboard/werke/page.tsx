import { Suspense } from "react";
import { CONFIG, SEGMENT, loadLive, loadProduction, loadRuns, type Production } from "@/lib/dashboard-data";
import { ago, berlin, berlinDay, compact, hoursSince, nextRun, type Live, type RunInfo } from "@/lib/dashboard-logic";
import { PERIODS, buckets, period } from "@/lib/dashboard-periods";
import { requireOwner } from "../actions";
import { COUNTRY_OPTS, Chips, Columns, Crumbs, Kpi, Legend, countrySeries } from "../v2";
import { readParams, withQuery, type SP } from "../params";

type Werk = { key: string; file: string; name: string; maxH: number; last: string | null; lastLabel: string; what: string };

function status(w: Werk, run: RunInfo | undefined, now: Date): { cls: string; label: string } {
  if (run && run.status !== "completed") return { cls: "t-blue", label: "läuft" };
  if (run && run.conclusion && !["success", "skipped"].includes(run.conclusion)) return { cls: "t-red", label: run.conclusion };
  if (!w.last) return { cls: "t-grey", label: run ? "ok" : "unbekannt" };
  const h = hoursSince(w.last, now);
  if (h <= w.maxH) return { cls: "t-green", label: "aktiv" };
  if (h <= w.maxH * 2.5) return { cls: "t-gold", label: "zu alt" };
  return { cls: "t-red", label: "steht" };
}

/** Werke: Status, Produktion im Zeitraum, Prüf- und Sicherheitsfilter mit Zahlen, aktive Regeln. */
export default async function Werke({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const { land, countries, z, raw } = await readParams(searchParams);
  const [live, runs] = await Promise.all([loadLive(), loadRuns().catch(() => null)]);
  const now = new Date(live.now);
  const today = berlinDay(now);
  const p = period(z, today);
  const werke: Werk[] = [
    { key: "lead-werk", file: "lead-werk.yml", name: "Lead-Werk", maxH: 4, last: live.last_lead_at, lastLabel: "letzter Lead", what: "Firmen ohne Website finden, prüfen, grün speichern" },
    { key: "kunden-werk", file: "kunden-werk.yml", name: "Kunden-Werk", maxH: 5, last: live.last_prospect_at, lastLabel: "letzter Käufer", what: "Webagenturen finden und prüfen" },
    { key: "proben-vorrat", file: "proben-vorrat.yml", name: "Proben-Vorrat", maxH: 26, last: live.stock_last_built, lastLabel: "letzte Probe gebaut", what: "fertige Proben bereithalten (baut nur, wenn etwas fehlt)" },
    { key: "versand", file: "send.yml", name: "Versand", maxH: 26, last: live.last_sent_at, lastLabel: "letzte Mail", what: "freigegebene Mails senden" },
    { key: "wachhund", file: "wachhund.yml", name: "Wachhund", maxH: 1, last: null, lastLabel: "", what: "startet ausgefallene Läufe nach" },
  ];
  const here = { ...raw };

  return (
    <div className="v2">
      <Crumbs items={[["Übersicht", withQuery("/dashboard", raw)], ["Werke", ""]]} />
      <div className="werke">
        {werke.map((w) => {
          const wf = CONFIG.workflows.find((x) => x.file === w.file);
          const nx = wf ? nextRun(wf.crons, now) : null;
          const run = runs?.find((r) => r.file === w.file);
          const st = status(w, run, now);
          return (
            <section key={w.key} className="card werk" title={w.what}>
              <header className="th"><span>{w.name}</span><span className={`pill ${st.cls}`}>{st.label}</span></header>
              <div className="facts">
                {w.last && <span>{w.lastLabel} <b>{ago(w.last, now)}</b></span>}
                {run ? <span>GitHub: <b>{run.status === "completed" ? run.conclusion : "läuft"}</b> {berlin(run.updated_at)}</span>
                  : <span className="muted" title="Laufstatus aus GitHub nur mit GH_DISPATCH_TOKEN; sonst aus der Datenbank abgeleitet">{w.last ? "aus DB abgeleitet" : "nur mit GitHub-Token sichtbar"}</span>}
                <span>nächster Lauf <b>{nx ? berlin(nx) : "–"}</b></span>
              </div>
            </section>
          );
        })}
      </div>

      <div className="head2">
        <Chips base="/dashboard/werke" param="z" value={z} options={PERIODS.map(([k, l]) => [k, l])} params={here} />
        <Chips base="/dashboard/werke" param="land" value={land} options={COUNTRY_OPTS} params={here} dots />
      </div>
      <Suspense fallback={<div className="card" style={{ padding: 16 }}>Produktion wird gezählt …</div>}>
        <ProductionBlock from={p.from} to={p.to} today={today} label={p.label} bucket={p.from === p.to ? "day" : p.bucket} countries={countries} land={land} z={z} live={live} />
      </Suspense>

      <h2 className="h2s">Aktive Regeln</h2>
      <div className="ctrls">
        <Rules title="Lead-Werk" rules={[
          [`Signal max. ${CONFIG.rules?.signal_max_age_days ?? 45} Tage alt`, "ältere Ereignisse werden verworfen"],
          ["Sicherheitsfilter", "Behörden, Schulen, Kirchen, Vereine, Testeinträge raus"],
          ["Sammel-Kontakte", "dieselbe E-Mail/Telefonnummer bei vielen Firmen = Anmelde-Dienstleister, raus"],
          ["Dubletten + Sperrliste", "gleiche Quelle-ID/Name, gesperrte Adressen und vorhandene Leads raus"],
          ["Pflichtfelder", "Telefon, E-Mail, Ansprechperson, Adresse (Webagenturen: keine Website-Pflicht)"],
          ["widersprüchliche Daten", "Qualitätsprüfung „blocking“ wird nie geliefert"],
        ]} />
        <Rules title="Kunden-Werk" rules={[
          ["Mail nur in Mail-Ländern", "countries.yaml allowed; DE/AT/CH/IT/ES/PL/DK nie"],
          ["UK: nur allgemeine Adressen", "info@, hello@ … keine Personenadressen (PECR)"],
          ["UK: nur Kapitalgesellschaften", "Rechtsform muss belegt sein, sonst nur Anruf/Brief"],
          ["Fundstelle der Adresse", "Adresse muss auf der Firmenwebsite stehen"],
          ["keine Funktionsadressen", "privacy@, support@ … werden nicht angeschrieben"],
          ["robots.txt + 1 Abruf/s", "keine verbotenen Plattformen"],
        ]} />
        <Rules title="Proben & Versand" rules={[
          [`Probe genau ${CONFIG.rules?.sample_size ?? 10}`, "10 verschiedene Firmen, alle Prüfungen bestanden"],
          ["Notbremse", "Bounces > 5 % ab 100 Mails stoppt den Versand"],
          ["Spam-Beschwerde", "eine Beschwerde stoppt sofort"],
          ["Frischeprüfung", "Adresse muss heute noch auf der Website stehen"],
          ["Sperrliste", "Abmeldungen, Bounces, Beschwerden – dauerhaft"],
          ["keine Kaltmails über Resend", "nur eigenes Postfach (SMTP)"],
        ]} />
      </div>
    </div>
  );
}

function Rules({ title, rules }: { title: string; rules: [string, string][] }) {
  return (
    <section className="card ctrl">
      <header className="th"><span>{title}</span><span className="lock" title="Prüfregeln stehen im Code und werden nur vom Inhaber/Claude geändert">🔒 fest</span></header>
      <div className="facts">{rules.map(([r, tip]) => <span key={r} title={tip}><b>{r}</b> <span className="muted">· {tip}</span></span>)}</div>
    </section>
  );
}

async function ProductionBlock({ from, to, today, label, bucket, countries, land, z, live }: {
  from: string; to: string; today: string; label: string; bucket: "day" | "week" | "month"; countries: string[]; land: string | null; z: string; live: Live;
}) {
  let prod: Production;
  try {
    prod = await loadProduction(from, to, today);
  } catch (e) {
    return <div className="card bad" style={{ padding: 16 }}>Produktion gerade nicht abrufbar: {(e as Error).message}</div>;
  }
  const inC = (c: string | null) => !!c && countries.includes(c);
  const leads = prod.leads.filter((r) => inC(r.country));
  const pros = prod.prospects.filter((r) => inC(r.country));
  const sum = <T extends { n: number }>(xs: T[]) => xs.reduce((a, x) => a + Number(x.n), 0);
  const list = (m: string, f = from, t = to) => withQuery("/dashboard/liste", { m, land: land ?? undefined, ...(f === from && t === to ? { z } : { von: f, bis: t }) });
  const bks = buckets(from, to, bucket);
  const rowsOf = (data: { day: string; country: string; n: number }[], metric: string) => bks.map((b) => {
    const parts: Record<string, number> = Object.fromEntries(countries.map((c) => [c, 0]));
    for (const r of data) if (r.day >= b.from && r.day <= b.to && inC(r.country)) parts[r.country] += Number(r.n);
    return { day: b.key, label: b.label, parts, total: Object.values(parts).reduce((a, x) => a + x, 0), href: list(metric, b.from, b.to) };
  });
  const bySource = new Map<string, number>();
  for (const r of leads) bySource.set(r.source, (bySource.get(r.source) ?? 0) + Number(r.n));
  const ok = pros.filter((r) => r.status === "ok"), call = pros.filter((r) => r.status === "call_only"), rej = pros.filter((r) => r.status === "rejected");
  const runsOf = (w: string) => prod.runs.filter((r) => r.werk === w && (!r.country || inC(r.country)));
  const leadRuns = runsOf("lead-werk");
  const R = (xs: typeof leadRuns, k: "candidates" | "processed" | "green" | "yellow" | "red") => xs.reduce((a, x) => a + Number(x[k]), 0);
  const reasons = (w: string) => prod.run_reasons.filter((r) => r.werk === w).sort((a, b) => b.n - a.n).slice(0, 8);
  const buyerReasons = (st: string) => prod.buyer_reasons.filter((r) => r.status === st).sort((a, b) => b.n - a.n).slice(0, 6);
  const ser = countrySeries(countries);
  const stockRuns = runsOf("proben-vorrat");

  return (
    <>
      <div className="kpis2 four">
        <Kpi value={compact(sum(leads))} label="Leads neu (grün)" href={list("leads_new")} tip={`${label}: neu gespeicherte, lieferbare Leads`} />
        <Kpi value={compact(sum(ok))} label="Käufer neu mail-fähig" href={list("buyers_new")} />
        <Kpi value={compact(sum(call))} label="nur Anruf/Brief" href={list("buyers_call_only")} tip="zählt nicht als Käufer" />
        <Kpi value={compact(R(stockRuns, "green"))} label="Proben gebaut" tip={stockRuns.length ? "aus den Zählern je Lauf" : "Zähler je Lauf ab diesem Update"} />
      </div>
      <div className="vizgrid">
        <figure className="card viz"><figcaption title="neu gespeicherte, lieferbare Leads je Tag · Klick: Liste">Leads neu</figcaption>
          <Legend series={ser} /><Columns rows={rowsOf(leads, "leads_new")} series={ser} title="Leads neu" /></figure>
        <figure className="card viz"><figcaption title="neue mail-fähige Käufer je Tag · Klick: Liste">Käufer neu (mail-fähig)</figcaption>
          <Legend series={ser} /><Columns rows={rowsOf(ok, "buyers_new")} series={ser} title="Käufer neu" /></figure>
      </div>
      <div className="vizgrid">
        <section className="card tile">
          <header className="th"><span title="Herkunft der neuen Leads">Leads je Quelle</span></header>
          <div className="bars">
            {[...bySource].sort((a, b) => b[1] - a[1]).map(([s, n]) => (
              <div key={s} className="bar wide" title={`${s}: ${n.toLocaleString("de-DE")}`}><span className="bk">{s}</span>
                <span className="bb"><i style={{ width: `${Math.max(1, (100 * n) / Math.max(1, ...bySource.values()))}%`, background: "#3560a8" }} /></span><span className="bv">{compact(n)}</span></div>
            ))}
            {bySource.size === 0 && <span className="muted">keine</span>}
          </div>
        </section>
        <section className="card tile">
          <header className="th"><span title="Lead-Werk: Kandidaten → geprüft → grün/gelb/rot (aus den Zählern je Lauf)">Filter Lead-Werk</span></header>
          {leadRuns.length ? (
            <>
              <Funnel steps={[["Kandidaten", R(leadRuns, "candidates")], ["geprüft", R(leadRuns, "processed")], ["grün (lieferbar)", R(leadRuns, "green")]]} />
              <div className="facts"><span>gelb (Rohbestand) <b>{compact(R(leadRuns, "yellow"))}</b> · rot (verworfen) <b>{compact(R(leadRuns, "red"))}</b></span>
                {reasons("lead-werk").map((r) => <span key={r.reason}>{reasonLabel(r.reason)} <b>{compact(r.n)}</b></span>)}</div>
            </>
          ) : <div className="facts"><span><b>nicht erfasst</b> für diesen Zeitraum – das Lead-Werk zählt Kandidaten und Verwerfungsgründe ab diesem Update je Lauf.</span><span>gespeichert (grün): <b>{compact(sum(leads))}</b></span></div>}
        </section>
      </div>
      <section className="card tile">
        <header className="th"><span title="Kunden-Werk: gespeicherte Kandidaten und ihre Prüfgründe (prospects.check_reason)">Filter Kunden-Werk</span></header>
        <Funnel steps={[["gespeichert", sum(pros)], ["mail-fähig", sum(ok)]]} />
        <div className="two">
          <div className="facts"><span><b>nur Anruf/Brief {compact(sum(call))}</b> – Gründe:</span>{buyerReasons("call_only").map((r) => <span key={r.reason}>{r.reason} <b>{compact(r.n)}</b></span>)}</div>
          <div className="facts"><span><b>abgelehnt {compact(sum(rej))}</b> – Gründe:</span>{buyerReasons("rejected").map((r) => <span key={r.reason}>{r.reason} <b>{compact(r.n)}</b></span>)}
            <span>Hinweise bei mail-fähigen:</span>{buyerReasons("ok").slice(0, 3).map((r) => <span key={r.reason}>{r.reason} <b>{compact(r.n)}</b></span>)}</div>
        </div>
        <div className="facts"><span className="muted">Kandidaten ohne Website/Kontakt werden nicht gespeichert – {runsOf("kunden-werk").length ? `Zähler je Lauf: ${compact(R(runsOf("kunden-werk"), "processed"))} geprüft` : "ab diesem Update je Lauf gezählt"}.</span></div>
      </section>
      <p className="muted small">Proben-Vorrat jetzt: {live.stock.filter((s) => s.segment_id === SEGMENT && inC(s.country)).map((s) => `${s.country} ${s.ready}`).join(" · ") || "–"} fertig</p>
    </>
  );
}

const REASONS: Record<string, string> = { "missing:email": "fehlende E-Mail", "missing:phone": "fehlendes Telefon", "missing:contact_name": "fehlende Ansprechperson", "missing:address": "fehlende Adresse", "missing:website": "fehlende Website" };
const reasonLabel = (r: string) => REASONS[r] ?? r.replace(/_/g, " ");

function Funnel({ steps }: { steps: [string, number][] }) {
  const max = Math.max(1, ...steps.map((s) => s[1]));
  return (
    <div className="funnel">
      {steps.map(([l, n], i) => (
        <div key={l} className="fstep" title={i ? `${l}: ${n.toLocaleString("de-DE")} (${max ? Math.round((100 * n) / max) : 0} %)` : `${l}: ${n.toLocaleString("de-DE")}`}>
          <span className="fl">{l}</span>
          <span className="fb"><i style={{ width: `${Math.max(1, (100 * n) / max)}%` }} /></span>
          <span className="fn">{compact(n)}</span>
        </div>
      ))}
    </div>
  );
}


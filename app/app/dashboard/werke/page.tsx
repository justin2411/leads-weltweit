import { Suspense } from "react";
import Link from "next/link";
import { CONFIG, SEGMENT, loadActivity, loadOwnerSettings, loadProduction, loadRuns, type Production } from "@/lib/dashboard-data";
import { ago, berlin, berlinDay, compact, nextRun, type RunInfo } from "@/lib/dashboard-logic";
import { PERIODS, buckets, period } from "@/lib/dashboard-periods";
import { WERK_SWITCHES, werkOn, type OwnerSettings, type WerkKey } from "@/lib/owner-settings";
import { isLive, lastActivity, liveParts, sampleErrorRate, werkStatus, type Activity, type WerkId } from "@/lib/werke-live";
import { requireOwner } from "../actions";
import { COUNTRY_OPTS, Chips, Columns, Crumbs, Kpi, Legend, countrySeries } from "../v2";
import { FunnelViz, LiveDot, type FunnelStage } from "../live";
import { WerkSwitch } from "../werk-switch";
import { readParams, withQuery, type SP } from "../params";
import { Icon } from "@/app/icons";

type Card = { key: WerkKey | "freigabe"; file?: string; maxH: number; what: string; werk?: WerkId; lastLabel: string };

const CARDS: Card[] = [
  { key: "lead-werk", file: "lead-werk.yml", werk: "lead-werk", maxH: 4, lastLabel: "letzte Aktivität", what: "Firmen ohne/mit veralteter Website finden, prüfen, grün speichern" },
  { key: "kunden-werk", file: "kunden-werk.yml", werk: "kunden-werk", maxH: 5, lastLabel: "letzte Aktivität", what: "Webagenturen finden und prüfen, „nur Anruf/Brief“ über die Registernummer nachprüfen" },
  { key: "proben-vorrat", file: "proben-vorrat.yml", werk: "proben-vorrat", maxH: 26, lastLabel: "letzte Probe gebaut", what: "fertige, freigegebene Proben bereithalten (baut nur, wenn etwas fehlt)" },
  { key: "freigabe", werk: "freigabe", maxH: 26, lastLabel: "letzte Prüfung", what: "Drei-Stufen-Freigabe jedes Leads vor Probe und Lieferung (nicht abschaltbar)" },
  { key: "versand", file: "send.yml", werk: "versand", maxH: 26, lastLabel: "letzte Mail", what: "freigegebene Kaltmails senden (Notbremse, Sperrliste immer aktiv)" },
  { key: "nachfass", file: "taeglich.yml", maxH: 30, lastLabel: "", what: "eine Nachfassmail nach 4 Tagen ohne Antwort" },
  { key: "antworten", file: "antworten.yml", werk: "antworten", maxH: 30, lastLabel: "letzte Antwort", what: "beantwortet Probe-Anfragen und Standardfragen; Abmeldungen werden immer gesperrt" },
  { key: "kundenlieferung", file: "kundenlieferung.yml", maxH: 24 * 8, lastLabel: "", what: "montags Lieferungen an zahlende Kunden (nur freigegebene Leads)" },
  { key: "tagescheck", file: "tagescheck.yml", maxH: 30, lastLabel: "", what: "prüft täglich alle Kontaktpunkte und meldet das Ergebnis" },
];

/** Werke: an/aus, live, Produktion im Zeitraum, Prüf-Trichter je Werk mit Ergebnis je Land, aktive Regeln. */
export default async function Werke({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const { land, countries, z, raw } = await readParams(searchParams);
  const [act, runs, own] = await Promise.all([loadActivity(), loadRuns().catch(() => null), loadOwnerSettings()]);
  const now = new Date(act.now && act.now > "2000" ? act.now : Date.now());
  const today = berlinDay(now);
  const p = period(z, today);
  const here = withQuery("/dashboard/werke", raw);

  return (
    <div className="v2">
      <Crumbs items={[["Übersicht", withQuery("/dashboard", raw)], ["Werke", ""]]} />
      <div className="werke2">
        {CARDS.map((c) => <WerkCard key={c.key} c={c} act={act} runs={runs} own={own} now={now} here={here} />)}
      </div>

      <div className="head2">
        <Chips base="/dashboard/werke" param="z" value={z} options={PERIODS.map(([k, l]) => [k, l])} params={raw} />
        <Chips base="/dashboard/werke" param="land" value={land} options={COUNTRY_OPTS} params={raw} dots />
      </div>
      <Suspense fallback={<div className="card" style={{ padding: 16 }}>Produktion wird gezählt …</div>}>
        <ProductionBlock from={p.from} to={p.to} today={today} label={p.label} bucket={p.from === p.to ? "day" : p.bucket} countries={countries} land={land} z={z} act={act} now={now} />
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
        <Rules title="Freigabe (3 Stufen, vor jeder Probe/Lieferung)" rules={[
          ["Stufe 1 Trigger echt", "Signal passt zu Webagenturen, frisch, Text = Quelle/Firma/Domain, Befund live nachgeprüft (1×/Tag je Seite)"],
          ["Stufe 2 Qualität", "Adresse mit PLZ, Telefon/E-Mail gültig (MX), Ansprechperson, Texte + Verkaufstipp, Sprache, Altersangaben aktuell, keine Dublette"],
          ["Stufe 3 auslieferbar", "frei, nie geliefert, nicht gesperrt, Land erlaubt, keine Behörde/Kette/sensiblen Inhalte, ehrlicher Text"],
          ["durchgefallen", "Lead geht nie raus (Status „held“, Grund gespeichert), nichts gelöscht"],
          ["Stichprobe täglich", "100 freie Leads je Land: Fehlerquote > 2 % gelb, > 5 % rot"],
        ]} />
        <Rules title="Kunden-Werk" rules={[
          ["Mail nur in Mail-Ländern", "countries.yaml allowed; DE/AT/CH/IT/ES/PL/DK nie"],
          ["UK: nur allgemeine Adressen", "info@, hello@ … keine Personenadressen (PECR)"],
          ["UK: nur Kapitalgesellschaften", "Rechtsform muss belegt sein, sonst nur Anruf/Brief"],
          ["Registernummer-Nachprüfung", "Company No./SIREN der Website, vom Register bestätigt"],
          ["robots.txt + 1 Abruf/s", "keine verbotenen Plattformen"],
        ]} />
        <Rules title="Proben & Versand" rules={[
          [`Probe genau ${CONFIG.rules?.sample_size ?? 10}`, "10 verschiedene Firmen, alle 10 freigegeben"],
          ["Webagenturen: kein Verfall", "Freigabe wird alle 20 h erneuert, Abruf nur mit Freigabe < 26 h"],
          ["Notbremse", "Bounces > 5 % ab 100 Mails stoppt den Versand"],
          ["Spam-Beschwerde", "eine Beschwerde stoppt sofort"],
          ["Sperrliste", "Abmeldungen, Bounces, Beschwerden – dauerhaft, nicht abschaltbar"],
        ]} />
      </div>
    </div>
  );
}

function WerkCard({ c, act, runs, own, now, here }: { c: Card; act: Activity; runs: RunInfo[] | null; own: OwnerSettings; now: Date; here: string }) {
  const sw = c.key !== "freigabe" ? werkOn(own, c.key as WerkKey) : { on: true, since: null };
  const run = c.file ? runs?.find((r) => r.file === c.file) : undefined;
  const wf = c.file ? CONFIG.workflows.find((x) => x.file === c.file) : undefined;
  const nx = wf ? nextRun(wf.crons, now) : null;
  const label = c.key === "freigabe" ? "Freigabe" : WERK_SWITCHES[c.key as WerkKey].label;
  const st = c.werk
    ? werkStatus({ werk: c.werk, a: act, now, maxH: c.maxH, pausedSince: sw.since, off: !sw.on, run })
    : sw.on ? { cls: "t-green" as const, label: "an", why: "", live: false } : { cls: "t-grey" as const, label: "pausiert", why: "vom Inhaber ausgeschaltet", live: false };
  const last = c.werk ? lastActivity(act, c.werk) : null;
  const parts = c.werk ? liveParts(act, c.werk, now) : [];
  return (
    <section className={`card werk2 ${sw.on ? "" : "off"}`} title={c.what}>
      <header className="th">
        <span className="nm"><LiveDot state={!sw.on ? "off" : st.live ? "live" : st.cls === "t-red" ? "bad" : "idle"} title={st.live ? "arbeitet gerade" : st.label} />{label}</span>
        <span className={`pill ${st.cls}`}>{st.label}</span>
      </header>
      {st.why && <span className="why">{st.why}</span>}
      <div className="facts">
        {c.lastLabel && <span>{c.lastLabel} <b>{ago(last, now)}</b></span>}
        {parts.length > 0 && <span>aktive Teile <b>{parts.length}</b> · bearbeitet <b>{compact(parts.reduce((a, x) => a + x.processed, 0))}</b></span>}
        {c.key === "kunden-werk" && <span title="Käufer, die in der letzten Stunde (u. a. per Registernummer-Nachprüfung) mail-fähig wurden">mail-fähig letzte h <b>{compact(act.buyers_ok_60m)}</b> · letzter neuer Käufer <b>{ago(act.last_prospect_at, now)}</b></span>}
        {c.key === "freigabe" && <span>letzte h: <b>{compact(act.gate_60m.released ?? 0)}</b> freigegeben · <b>{compact(act.gate_60m.failed ?? 0)}</b> aussortiert</span>}
        {run ? <span>GitHub: <b>{run.status === "completed" ? run.conclusion : "läuft"}</b> {berlin(run.updated_at)}</span> : null}
        {nx && <span>nächster Lauf <b>{berlin(nx)}</b></span>}
      </div>
      {c.key !== "freigabe"
        ? <WerkSwitch werk={c.key} on={sw.on} back={here} label={label} note={"note" in WERK_SWITCHES[c.key as WerkKey] ? (WERK_SWITCHES[c.key as WerkKey] as { note: string }).note : undefined} />
        : <span className="lock" title="Sicherheitsfunktion: nicht abschaltbar"><Icon name="schloss" size={14} /> immer an</span>}
    </section>
  );
}

function Rules({ title, rules }: { title: string; rules: [string, string][] }) {
  return (
    <section className="card ctrl">
      <header className="th"><span>{title}</span><span className="lock" title="Prüfregeln stehen im Code und werden nur vom Inhaber/Claude geändert"><Icon name="schloss" size={14} /> fest</span></header>
      <div className="facts">{rules.map(([r, tip]) => <span key={r} title={tip}><b>{r}</b> <span className="muted">· {tip}</span></span>)}</div>
    </section>
  );
}

const STAGE_LABEL: Record<string, string> = {
  "s1": "Stufe 1 Trigger", "s2": "Stufe 2 Qualität", "s3": "Stufe 3 auslieferbar",
};
const REASONS: Record<string, string> = { "missing:email": "fehlende E-Mail", "missing:phone": "fehlendes Telefon", "missing:contact_name": "fehlende Ansprechperson", "missing:address": "fehlende Adresse", "missing:website": "fehlende Website" };
const reasonLabel = (r: string) => {
  const [k, ...rest] = r.split(":");
  if (STAGE_LABEL[k]) return `${STAGE_LABEL[k]}: ${rest.join(":").replace(/_/g, " ")}`;
  return REASONS[r] ?? r.replace(/_/g, " ");
};

async function ProductionBlock({ from, to, today, label, bucket, countries, land, z, act, now }: {
  from: string; to: string; today: string; label: string; bucket: "day" | "week" | "month"; countries: string[]; land: string | null; z: string; act: Activity; now: Date;
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
  const list = (m: string, f = from, t = to, c?: string) => withQuery("/dashboard/liste", { m, land: c ?? land ?? undefined, ...(f === from && t === to ? { z } : { von: f, bis: t }) });
  const bks = buckets(from, to, bucket);
  const rowsOf = (data: { day: string; country: string; n: number }[], metric: string) => bks.map((b) => {
    const parts: Record<string, number> = Object.fromEntries(countries.map((c) => [c, 0]));
    for (const r of data) if (r.day >= b.from && r.day <= b.to && inC(r.country)) parts[r.country] += Number(r.n);
    return { day: b.key, label: b.label, parts, total: Object.values(parts).reduce((a, x) => a + x, 0), href: list(metric, b.from, b.to) };
  });
  const ser = countrySeries(countries);
  const stages = (prod.run_stages ?? []).filter((r) => !r.country || inC(r.country));
  const st = (werk: string, stage: string, c?: string, teil = "") => {
    const xs = stages.filter((r) => r.werk === werk && r.stage === stage && r.teil === teil && (!c || r.country === c));
    return xs.length ? xs.reduce((a, r) => a + Number(r.n), 0) : null;
  };
  const runs = (w: string) => prod.runs.filter((r) => r.werk === w && (!r.country || inC(r.country)));
  const R = (xs: Production["runs"], k: "candidates" | "processed" | "green" | "yellow" | "red") => xs.reduce((a, x) => a + Number(x[k]), 0);
  const tops = (w: string, prefix = "", n = 3) => {
    const m = new Map<string, number>();
    for (const r of prod.run_reasons) if (r.werk === w && (!r.country || inC(r.country)) && r.reason.startsWith(prefix)) m.set(r.reason, (m.get(r.reason) ?? 0) + Number(r.n));
    return [...m].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, v]) => `${reasonLabel(k)} ${v.toLocaleString("de-DE")}`).join(" · ");
  };

  // Lead-Werk: Trichter aus den Zählern je Lauf (Prüfer in Reihenfolge)
  const lw = runs("lead-werk");
  const has = st("lead-werk", "bearbeitet") !== null;
  const leadStages: FunnelStage[] = [
    { label: "Kandidaten (Vorrat)", n: lw.length ? R(lw, "candidates") : null, tip: "aus den Quellen geladen, noch nicht gespeichert" },
    { label: "bearbeitet", n: lw.length ? R(lw, "processed") : null, tip: "in diesem Zeitraum angefasst (Rest folgt im nächsten Lauf)" },
    { label: "Sicherheitsfilter", n: has ? st("lead-werk", "sicherheitsfilter") : null, tip: "Behörden, Vereine, Testeinträge, Sperrliste, schon bekannt" },
    { label: "Befund/Signal bestätigt", n: has ? st("lead-werk", "befund") : null, tip: "Website-Prüfung mit Befund bzw. Signal der Quelle" },
    { label: "Kontaktdaten stimmig", n: has ? st("lead-werk", "kontaktdaten") : null, tip: `widersprüchliche Daten raus · ${tops("lead-werk")}` },
    { label: "Signal frisch & Texte geprüft", n: has ? st("lead-werk", "signal") : null, tip: "Alter, Zahlen belegt, Firmenname/Ort im Text, individuell" },
    { label: "vollständig = grün gespeichert", n: lw.length ? R(lw, "green") : sum(leads), tip: "Telefon, E-Mail, Ansprechperson, Adresse", href: list("leads_new") },
  ];
  const leadResult = countries.map((c) => ({ country: c, n: sum(leads.filter((r) => r.country === c)), href: list("leads_new", from, to, c), tip: `${c}: neue lieferbare Leads (${label})` }));

  // Kunden-Werk: Kandidaten -> geprüft -> Kontaktweg -> mail-fähig (+ Nachprüfung)
  const kw = runs("kunden-werk");
  const nach = { g: st("kunden-werk", "geprueft", undefined, "nachpruefen"), nr: st("kunden-werk", "nummer", undefined, "nachpruefen"), reg: st("kunden-werk", "register", undefined, "nachpruefen"), ok: st("kunden-werk", "ok", undefined, "nachpruefen") };
  const ok = pros.filter((r) => r.status === "ok"), call = pros.filter((r) => r.status === "call_only");
  const lifted = (prod.prospects_rechecked ?? []).filter((r) => inC(r.country));
  const buyerStages: FunnelStage[] = [
    { label: "geprüft (Website besucht)", n: kw.length ? R(kw, "processed") - (nach.g ?? 0) : null, tip: "Overture-Firmen der Webagentur-Kategorien" },
    { label: "gespeichert (Kontaktweg)", n: sum(pros), tip: "Website + Kontakt gefunden", href: list("buyers_new") },
    { label: "Rechtsform/Mail-Land ok", n: sum(ok), tip: `nur Anruf/Brief: ${compact(sum(call))} (zählen nicht als Käufer)`, href: list("buyers_new") },
  ];
  const nachStages: FunnelStage[] = [
    { label: "„nur Anruf/Brief“ nachgeprüft", n: nach.g, tip: "Käufer mit Firmen-E-Mail, nur Rechtsform fehlte" },
    { label: "Registernummer gefunden", n: nach.nr, tip: "Company No. / SIREN auf der eigenen Website" },
    { label: "vom Register bestätigt", n: nach.reg, tip: "Companies House / Annuaire des entreprises: aktive Kapitalgesellschaft" },
    { label: "jetzt mail-fähig", n: nach.ok ?? (lifted.length ? sum(lifted) : null), tip: "danach unveränderte Prüfregel" },
  ];
  const buyerResult = countries.map((c) => ({ country: c, n: sum(ok.filter((r) => r.country === c)) + sum(lifted.filter((r) => r.country === c)), href: list("buyers_new", from, to, c), tip: `${c}: neue mail-fähige Käufer + nachgeprüfte (${label})` }));

  // Freigabe: geprüft -> Stufe 1 -> Stufe 2 -> Stufe 3 (freigegeben)
  const fg = (s: string, c?: string) => st("freigabe", s, c);
  const gateStages: FunnelStage[] = [
    { label: "geprüft (vor Probe/Lieferung)", n: fg("geprueft") },
    { label: "Stufe 1 Trigger echt", n: fg("stufe1"), tip: tops("freigabe", "s1:") },
    { label: "Stufe 2 Qualität & Vollständigkeit", n: fg("stufe2"), tip: tops("freigabe", "s2:") },
    { label: "Stufe 3 auslieferbar = freigegeben", n: fg("freigegeben"), tip: tops("freigabe", "s3:") },
  ];
  const gateResult = countries.map((c) => ({ country: c, n: fg("freigegeben", c), tip: `${c}: freigegeben ${fg("freigegeben", c) ?? 0} von ${fg("geprueft", c) ?? 0}` }));
  const err = sampleErrorRate(act.stichprobe).filter((r) => inC(r.country));

  return (
    <>
      <div className="kpis2 four">
        <Kpi value={compact(sum(leads))} label="Leads neu (grün)" href={list("leads_new")} tip={`${label}: neu gespeicherte, lieferbare Leads`} />
        <Kpi value={compact(sum(ok) + sum(lifted))} label="Käufer neu mail-fähig" href={list("buyers_new")} tip={`neu: ${sum(ok)} · per Nachprüfung: ${sum(lifted)}`} />
        <Kpi value={fg("geprueft") === null ? "–" : `${compact(fg("freigegeben") ?? 0)}/${compact(fg("geprueft") ?? 0)}`} label="Leads freigegeben" tip="Drei-Stufen-Freigabe vor Probe/Lieferung" />
        <Kpi value={compact(R(runs("proben-vorrat"), "green"))} label="Proben gebaut" />
      </div>
      <div className="tris">
        <FunnelViz title="Lead-Werk" stages={leadStages} result={leadResult} live={isLive(act, "lead-werk", now)} href="#lead"
          note={has ? `${label} · Rohbestand (gelb): ${compact(R(lw, "yellow"))} · ${tops("lead-werk", "", 4)}` : "Prüfer-Stufen werden ab diesem Update je Lauf gezählt – bis dahin nur Kandidaten und grün."} />
        <FunnelViz title="Freigabe (3 Stufen)" stages={gateStages} result={gateResult} live={isLive(act, "freigabe", now)}
          note={err.length ? <>Stichprobe täglich: {err.map((e) => <span key={e.country} className={`pill ${e.level === "rot" ? "t-red" : e.level === "gelb" ? "t-gold" : e.level === "gruen" ? "t-green" : "t-grey"}`} title={`${e.checked} geprüft · ${berlin(e.at)}`}>{e.country} {e.rate === null ? "–" : `${(e.rate * 100).toFixed(1)} %`}</span>)}</> : "Stichprobe (100 je Land, täglich) läuft ab diesem Update."} />
        <FunnelViz title="Kunden-Werk" stages={buyerStages} result={buyerResult} live={isLive(act, "kunden-werk", now)}
          note={`Käufer zählen nur mail-fähig (check_status ok). ${act.last_prospect_at ? `Letzter neuer Käufer ${ago(act.last_prospect_at, now)}` : ""}`} />
        <FunnelViz title="Kunden-Werk · Nachprüfung" stages={nachStages} result={countries.map((c) => ({ country: c, n: st("kunden-werk", "ok", c, "nachpruefen") ?? sum(lifted.filter((r) => r.country === c)) }))} live={isLive(act, "kunden-werk", now)} />
      </div>
      <div className="vizgrid">
        <figure className="card viz"><figcaption title="neu gespeicherte, lieferbare Leads je Tag · Klick: Liste">Leads neu</figcaption>
          <Legend series={ser} /><Columns rows={rowsOf(leads, "leads_new")} series={ser} title="Leads neu" /></figure>
        <figure className="card viz"><figcaption title="neue mail-fähige Käufer je Tag · Klick: Liste">Käufer neu (mail-fähig)</figcaption>
          <Legend series={ser} /><Columns rows={rowsOf(ok, "buyers_new")} series={ser} title="Käufer neu" /></figure>
      </div>
      <SourceBars leads={leads} />
      <p className="muted small">Live-Anzeige aus Lebenszeichen der Werke (alle ~2 min) und der Datenbank, aktualisiert alle 30 s. <Link href="/dashboard/hilfe">Hilfe</Link></p>
    </>
  );
}

function SourceBars({ leads }: { leads: Production["leads"] }) {
  const by = new Map<string, number>();
  for (const r of leads) by.set(r.source, (by.get(r.source) ?? 0) + Number(r.n));
  const max = Math.max(1, ...by.values());
  return (
    <section className="card tile">
      <header className="th"><span title="Herkunft der neuen Leads">Leads je Quelle</span></header>
      <div className="bars">
        {[...by].sort((a, b) => b[1] - a[1]).map(([s, n]) => (
          <div key={s} className="bar wide" title={`${s}: ${n.toLocaleString("de-DE")}`}><span className="bk">{s}</span>
            <span className="bb"><i style={{ width: `${Math.max(1, (100 * n) / max)}%`, background: "#3560a8" }} /></span><span className="bv">{compact(n)}</span></div>
        ))}
        {by.size === 0 && <span className="muted">keine</span>}
      </div>
    </section>
  );
}

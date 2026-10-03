import Link from "next/link";
import { CONFIG, SEGMENT, loadContacts, loadDaily, loadLive, loadStock } from "@/lib/dashboard-data";
import {
  alerts, chain, compact, funnel, mailboxes, monthly, nextRun, onlySegment, realSubscriptions, sampleStock, stockSegment,
  topAlerts, berlin, berlinDay, currencySign, type StageKey,
} from "@/lib/dashboard-logic";
import { PERIODS, period, series, totals } from "@/lib/dashboard-periods";
import { board } from "@/lib/dashboard-board";
import { requireOwner } from "./actions";
import { AmpelRow, Bars, COUNTRY_OPTS, Chips, Columns, Fill, Kpi, Legend, Tile, countrySeries } from "./v2";
import { readParams, withQuery, type SP } from "./params";

/** Übersicht: Ampel, Prozesskette, je Bereich die wichtigsten Zahlen – Klick führt in die Details. */
export default async function Overview({ searchParams }: { searchParams: SP }) {
  await requireOwner();
  const { land, countries, z, raw } = await readParams(searchParams);
  const stockP = loadStock();
  stockP.catch(() => {});
  const today = berlinDay(new Date());
  const p = period(z, today);
  const from14 = new Date(Date.parse(`${today}T12:00:00Z`) - 13 * 86_400_000).toISOString().slice(0, 10);
  const [liveAll, contacts, daily, stockAll] = await Promise.all([
    loadLive(),
    loadContacts(5),
    loadDaily(p.prevFrom < from14 ? p.prevFrom : from14, today),
    Promise.race([stockP.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), 1500))]),
  ]);
  const live = onlySegment(liveAll, SEGMENT);
  const stock = stockSegment(stockAll, SEGMENT);
  const cfg = CONFIG;
  const now = new Date(live.now);
  const amp = topAlerts(alerts(live, stock, cfg, now, null));
  const q = (extra: Record<string, string | undefined> = {}) => ({ ...raw, ...extra });

  // Prozesskette
  const cols = board(contacts, live.sample_requests, live.customers, countries);
  const n = (id: string) => cols.find((c) => c.id === id)?.count ?? 0;
  // nur angeschriebene Firmen (Mail), ohne Website-Anfragen
  const m = (st: string) => contacts.counts.filter((c) => c.stage === st && countries.includes(c.country)).reduce((a, c) => a + Number(c.n), 0);
  const fs = countries.map((c) => funnel(live, stock, SEGMENT, c));
  const ch = chain(live, stock, cfg, countries);
  const subs = realSubscriptions(live).filter((s) => countries.includes(s.customer?.country ?? ""));
  const rev = new Map<string, number>();
  for (const s of subs) rev.set(currencySign(s.currency, s.customer?.country), (rev.get(currencySign(s.currency, s.customer?.country)) ?? 0) + monthly(s));
  const revenue = [...rev].map(([c, v]) => `${compact(v)} ${c}`).join(" + ") || "0";
  const leads = stock ? stock.leads.filter((l) => l.status === "new" && countries.includes(l.country)).reduce((a, l) => a + Number(l.n), 0) : null;
  const okRows = stock?.prospects.filter((x) => x.check_status === "ok" && countries.includes(x.country)) ?? [];
  const map: Record<StageKey, string> = { leads: "leads", kaeufer: "kaeufer", mails: "contacted", antworten: "replied", proben: "sample", kunden: "customer", umsatz: "umsatz" };
  const neck = ch.bottleneck ? map[ch.bottleneck] : null;
  const steps: { id: string; label: string; value: string; sub: string; href: string; tip: string }[] = [
    { id: "leads", label: "Leads", value: leads === null ? "…" : compact(leads), sub: "lieferbar", href: withQuery("/dashboard/bestand", q()), tip: "lieferbare Leads (Firmen ohne Website)" },
    { id: "kaeufer", label: "Käufer", value: stock ? compact(okRows.reduce((a, x) => a + Number(x.unused), 0)) : "…", sub: "frei", href: withQuery("/dashboard/bestand", q()), tip: `mail-fähige Käufer ohne Mail · gesamt ${compact(okRows.reduce((a, x) => a + Number(x.n), 0))}` },
    { id: "contacted", label: "Kontaktiert", value: compact(m("contacted") + m("replied") + m("sample") + m("out")), sub: `${fs.reduce((a, f) => a + f.sentToday, 0)} heute`, href: withQuery("/dashboard/kontakte", q({ stufe: "contacted" })), tip: "angeschriebene Firmen" },
    { id: "replied", label: "Geantwortet", value: compact(m("replied") + m("sample") + m("out")), sub: `${fs.reduce((a, f) => a + f.positive, 0)} positiv`, href: withQuery("/dashboard/kontakte", q({ stufe: "replied" })), tip: `Firmen mit Antwort (ohne Abwesenheitsnotiz) · davon ${m("out")} Absage/Abmeldung` },
    { id: "sample", label: "Proben", value: compact(n("sample")), sub: `${n("requested")} offen`, href: withQuery("/dashboard/kontakte", q({ stufe: "sample" })), tip: "Probe erhalten (Mail + Website) · offen = angefordert, noch nicht gesendet" },
    { id: "customer", label: "Kunden", value: compact(subs.length), sub: "zahlend", href: withQuery("/dashboard/kunden", q()), tip: "aktive Abos ohne Testkäufe" },
    { id: "umsatz", label: "Umsatz", value: revenue, sub: "/ Monat", href: withQuery("/dashboard/kunden", q()), tip: "Summe der aktiven Abos pro Monat" },
  ];

  // Versand-Kachel
  const t = totals(daily, p.from, p.to, countries);
  const tp = totals(daily, p.prevFrom, p.prevTo, countries);
  const single = p.from === p.to;
  const chart = single ? series(daily, from14, today, "day", "sent", countries) : series(daily, p.from, p.to, p.bucket, "sent", countries);
  const cap = mailboxes(liveAll, cfg).reduce((a, b) => a + b.cap, 0);

  // Proben, Bestand, Kunden
  const st = sampleStock(live, cfg, now).filter((r) => countries.some((c) => r.key.endsWith(`/${c}`)));
  const wf = cfg.workflows.find((w) => w.file === "kundenlieferung.yml");
  const nextDelivery = wf ? nextRun(wf.crons, now) : null;

  return (
    <div className="v2">
      <div className="head2">
        <AmpelRow alerts={amp} />
        <Chips base="/dashboard" param="land" value={land} options={COUNTRY_OPTS} params={raw} dots />
      </div>

      <div className="th2"><span>Ablauf</span><Link href={withQuery("/dashboard/kontakte", q())} className="more">Wer ist wo ›</Link></div>
      <ol className="chain" aria-label="Ablauf">
        {steps.map((s) => (
          <li key={s.id} className={s.id === neck ? "neck" : ""}>
            <Link href={s.href} title={s.tip + (s.id === neck ? " · ENGPASS" : "")}>
              {s.id === neck && <span className="neck-tag">✕ Engpass</span>}
              <span className="v">{s.value}</span>
              <span className="l">{s.label}</span>
              <span className="s">{s.sub}</span>
            </Link>
          </li>
        ))}
      </ol>

      <div className="tiles">
        <Tile title="Versand & Ergebnisse" href={withQuery("/dashboard/versand", q({ z }))} wide tip={`${p.label}: ${berlin(`${p.from}T12:00:00Z`).slice(0, 6)}–${berlin(`${p.to}T12:00:00Z`).slice(0, 6)} · Vergleich: ${p.prevLabel}`}>
          <Chips base="/dashboard" param="z" value={z} options={PERIODS.map(([k, l]) => [k, l])} params={raw} />
          <div className="kpis2">
            <Kpi value={compact(t.sent)} label="Mails" cur={t.sent} prev={tp.sent} tip={`Erstmails · dazu ${t.followups} Nachfassmails · Kapazität heute ${cap}`} />
            <Kpi value={compact(t.replies)} label="Antworten" cur={t.replies} prev={tp.replies} />
            <Kpi value={compact(t.positive)} label="Positiv" cur={t.positive} prev={tp.positive} />
            <Kpi value={compact(t.samples_sent)} label="Proben" cur={t.samples_sent} prev={tp.samples_sent} />
          </div>
          <Legend series={countrySeries(countries)} />
          <Columns rows={chart} series={countrySeries(countries)} title="Mails" height={170} compactLabels />
        </Tile>

        <Tile title="Proben-Vorrat" href={withQuery("/dashboard/proben", q())} tip="fertige, geprüfte Proben je Seite (Ist/Soll)">
          <div className="fills">{st.map((r) => <Fill key={r.key} label={r.key.split("/")[1]} ready={r.ready} target={r.target} tip={`${r.slug}${r.oldestH !== null ? ` · älteste ${Math.round(r.oldestH)} h` : ""}`} />)}</div>
          <div className="mini"><b>{live.sample_requests.filter((r) => r.status === "new" && countries.includes(r.country ?? "")).length}</b> Anfragen offen</div>
        </Tile>

        <Tile title="Bestand" href={withQuery("/dashboard/bestand", q())} tip="Leads lieferbar · Käufer mail-fähig ohne Mail">
          {stock ? (
            <div className="bars2">
              <Bars title="Leads" rows={countries.map((c) => ({ key: c, n: stock.leads.filter((l) => l.country === c && l.status === "new").reduce((a, l) => a + Number(l.n), 0) }))} />
              <Bars title="Käufer frei" rows={countries.map((c) => ({ key: c, n: Number(stock.prospects.find((x) => x.country === c && x.check_status === "ok")?.unused ?? 0) }))} />
            </div>
          ) : <span className="muted">…</span>}
        </Tile>

        <Tile title="Kunden & Umsatz" href={withQuery("/dashboard/kunden", q())}>
          <div className="kpis2 two">
            <Kpi value={compact(subs.length)} label="Kunden" />
            <Kpi value={revenue} label="pro Monat" />
          </div>
          <div className="mini" title="Kundenlieferung (montags)">nächste Lieferung <b>{nextDelivery ? berlin(nextDelivery) : "–"}</b></div>
        </Tile>

      </div>
    </div>
  );
}


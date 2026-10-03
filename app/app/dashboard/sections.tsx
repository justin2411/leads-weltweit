import {
  ago, berlin, durationS, fmt, funnel, gb, hoursSince, mailboxes, monthly, nextRun, pctS, pipeline, realSubscriptions,
  sampleStock, isTestCustomer, currencySign, brake, DB_LIMIT_BYTES,
  type Alert, type Funnel, type Live, type OpsConfig, type RawStock, type RunInfo, type Stock,
} from "@/lib/dashboard-logic";

const LEVEL_LABEL = { rot: "Engpass", gelb: "Achtung", gruen: "läuft" } as const;

export function Lights({ alerts }: { alerts: Alert[] }) {
  const bad = alerts.filter((a) => a.level !== "gruen");
  const good = alerts.filter((a) => a.level === "gruen");
  const n = (l: Alert["level"]) => alerts.filter((a) => a.level === l).length;
  return (
    <>
      <div className="lights">
        <span className="pill rot">{n("rot")} Engpässe</span>
        <span className="pill gelb">{n("gelb")} Hinweise</span>
        <span className="pill gruen">{n("gruen")} läuft</span>
      </div>
      <div className="alerts">
        {bad.map((a, i) => <AlertRow key={i} a={a} />)}
        {bad.length === 0 && <div className="alert lv-gruen"><span className="area">Alles</span><span className="ti">Keine Engpässe erkannt</span></div>}
      </div>
      {good.length > 0 && (
        <details className="ok-list">
          <summary>{good.length} Punkte laufen normal – anzeigen</summary>
          <div className="alerts">{good.map((a, i) => <AlertRow key={i} a={a} />)}</div>
        </details>
      )}
    </>
  );
}

function AlertRow({ a }: { a: Alert }) {
  return (
    <div className={`alert lv-${a.level}`}>
      <span className="area">{a.area}</span>
      <span className="ti"><span className={`pill ${a.level}`} style={{ marginRight: 8 }}>{LEVEL_LABEL[a.level]}</span>{a.title}</span>
      {a.detail && <span className="de">{a.detail}</span>}
    </div>
  );
}

export function Kpis({ live, stock, cfg }: { live: Live; stock: Stock | null; cfg: OpsConfig }) {
  const boxes = mailboxes(live, cfg);
  const cap = boxes.reduce((s, b) => s + b.cap, 0);
  const today = boxes.reduce((s, b) => s + b.today, 0);
  const fs = cfg.fokus.map((k) => funnel(live, stock, ...(k.split("/") as [string, string])));
  const subs = realSubscriptions(live);
  const byCur = new Map<string, number>();
  for (const s of subs) byCur.set(currencySign(s.currency, s.customer?.country), (byCur.get(currencySign(s.currency, s.customer?.country)) ?? 0) + monthly(s));
  const revenue = [...byCur].map(([c, v]) => `${fmt(Math.round(v))} ${c}`).join(" + ") || "0";
  const week = live.events.filter((e) => ["reply", "reply_positive", "reply_negative", "sample_requested", "unsubscribed"].includes(e.type) && hoursSince(e.occurred_at, new Date(live.now)) < 168);
  const leadsFocus = stock ? stock.leads.filter((l) => l.status === "new" && cfg.fokus.includes(`${l.segment_id}/${l.country}`)).reduce((s, l) => s + Number(l.n), 0) : null;
  const tiles: [string, string, string?][] = [
    [`${fmt(today)} / ${fmt(cap)}`, "Mails heute / Kapazität", `${fmt(boxes.reduce((s, b) => s + b.d7, 0))} in 7 Tagen`],
    [fmt(fs.reduce((s, f) => s + f.queue, 0)), "freigegebene Erstmails (Fokus)", "warten auf Versand"],
    [fmt(week.length), "Antwort-Ereignisse 7 Tage", `${fmt(fs.reduce((s, f) => s + f.positive, 0))} positiv (Fokus, gesamt)`],
    [fmt(fs.reduce((s, f) => s + f.samplesSent, 0)), "Proben gesendet (Fokus)", `${fmt(live.sample_requests.filter((r) => r.status === "new").length)} offen`],
    [fmt(subs.length), "zahlende Kunden", `Umsatz ${revenue} / Monat`],
    [stock ? fmt(fs.reduce((s, f) => s + f.buyersOk, 0)) : "…", "mail-fähige Käufer (Fokus)", stock ? `${fmt(fs.reduce((s, f) => s + f.buyersUnused, 0))} noch ohne Mail` : "wird geladen"],
    [leadsFocus === null ? "…" : fmt(leadsFocus), "lieferbare Leads (Fokus)", "Status „neu“, alle Prüfungen bestanden"],
  ];
  return (
    <div className="grid kpis">
      {tiles.map(([v, l, h]) => (
        <div className="card kpi" key={l}><div className="v">{v}</div><div className="l">{l}</div>{h && <div className="h">{h}</div>}</div>
      ))}
    </div>
  );
}

// ------------------------------------------------------------------------------------------------ Trichter
function rule(f: Funnel): string {
  if (f.customers > 0) return "Regel §5: ausbauen (zahlender Kunde)";
  if (f.delivered < 50) return `Regel §5: Bewertung ab 50 zugestellten Mails – noch ${50 - f.delivered}`;
  const r = f.positive / f.delivered;
  const verdict = r > 0.05 ? "ausbauen" : r >= 0.02 ? "neue Botschaft testen" : "stoppen";
  // Entschieden wird erst 14 Tage nach der letzten Mail (§5.6); solange noch gesendet wird, ist es ein Zwischenstand.
  if (f.sent7 > 0) return `Regel §5, Zwischenstand: ${pctS(r)} positiv (Ziel ≥ 2 %, > 5 % = ausbauen) – Entscheidung 14 Tage nach der letzten Mail`;
  return `Regel §5: ${verdict} (${pctS(r)} positiv)`;
}

export function FunnelCard({ f, name }: { f: Funnel; name: string }) {
  const steps: [string, number | null, string?][] = [
    ["Käufer mail-fähig", f.buyersOk, f.callOnly === null ? "Bestand wird geladen" : `${fmt(f.buyersUnused)} noch ohne Mail · getrennt: ${fmt(f.callOnly)} nur Anruf/Brief`],
    ["Entwürfe", f.queue + f.drafts, `${fmt(f.queue)} freigegeben · ${fmt(f.drafts)} zur Prüfung · ${fmt(f.queueFollowup)} Nachfass bereit`],
    ["Gesendet", f.sent, `heute ${fmt(f.sentToday)} · 7 Tage ${fmt(f.sent7)} · dazu ${fmt(f.followupsSent)} Nachfassmails`],
    ["Zugestellt", f.delivered, `${fmt(f.bounced)} Bounces (${f.sent ? pctS(f.bounced / f.sent) : "–"}) · zugestellt = gesendet − Bounces`],
    ["Antworten", f.replies, f.delivered ? `${pctS(f.replies / f.delivered)} der zugestellten · ${fmt(f.negative)} kein Interesse/Abmeldung` : undefined],
    ["Positiv", f.positive, f.delivered ? `${pctS(f.positive / f.delivered)} der zugestellten` : undefined],
    ["Proben angefordert", f.samplesRequested, "per Mail-Antwort + Website-Formular"],
    ["Proben gesendet", f.samplesSent],
    ["Kunden", f.customers],
  ];
  const max = Math.max(1, ...steps.map((s) => Number(s[1] ?? 0)));
  return (
    <div className="card fun">
      <h3><span>{f.key} · {name}</span><span className="muted small">{fmt(Math.round(f.revenue))} {f.currency}/Monat</span></h3>
      {!f.mailCountry && <p className="small bad">Land ist für diese Zielgruppe kein Mail-Land – Käufer zählen hier nicht.</p>}
      <ol className="steps">
        {steps.map(([l, n, x]) => (
          <li key={l} style={{ display: "contents" }}>
            <div className="step">
              <span>{l}</span>
              <span className="bar"><i style={{ width: `${n === null ? 0 : Math.max(0.5, (100 * Math.log10(1 + n)) / Math.log10(1 + max))}%` }} /></span>
              <span className="n">{n === null ? "…" : fmt(n)}</span>
              {x && <span className="x">{x}</span>}
            </div>
          </li>
        ))}
      </ol>
      <div className="rule">{rule(f)}</div>
    </div>
  );
}

export function FunnelTable({ rows, segName }: { rows: Funnel[]; segName: (id: string) => string }) {
  return (
    <div className="tbl"><table>
      <thead><tr><th>Test</th><th className="num">Käufer ok</th><th className="num">freigegeben</th><th className="num">gesendet</th><th className="num">7 Tage</th>
        <th className="num">Bounces</th><th className="num">Antworten</th><th className="num">positiv</th><th className="num">Proben</th><th className="num">Kunden</th><th>Regel</th></tr></thead>
      <tbody>
        {rows.map((f) => (
          <tr key={f.key}>
            <td className="nw">{f.key} <span className="muted small">{segName(f.segment_id)}</span></td>
            <td className="num">{fmt(f.buyersOk)}</td><td className="num">{fmt(f.queue)}</td><td className="num">{fmt(f.sent)}</td><td className="num">{fmt(f.sent7)}</td>
            <td className="num">{fmt(f.bounced)}</td><td className="num">{fmt(f.replies)}</td><td className="num">{fmt(f.positive)}</td>
            <td className="num">{fmt(f.samplesSent)}</td><td className="num">{fmt(f.customers)}</td><td className="small muted">{rule(f).replace("Regel §5: ", "")}</td>
          </tr>
        ))}
      </tbody>
    </table></div>
  );
}

// ------------------------------------------------------------------------------------------------ Wer ist wo
export function People({ live, cfg }: { live: Live; cfg: OpsConfig }) {
  const now = new Date(live.now);
  const people = pipeline(live, cfg, now);
  return (
    <>
      <div className="tbl"><table className="cards">
        <thead><tr><th>Firma</th><th>Test</th><th>Stufe</th><th>Letzte Aktion</th><th>Nächster Schritt</th><th>Quelle</th></tr></thead>
        <tbody>
          {people.map((p) => (
            <tr key={p.key}>
              <td><strong>{p.company}</strong>{p.domain && <div className="muted small">{p.domain}</div>}</td>
              <td className="nw" data-l="Test">{p.segment_id ?? "–"}/{p.country ?? "–"}</td>
              <td><span className={`pill t-${p.tone}`}>{p.stage}</span></td>
              <td className="nw" data-l="Letzte Aktion">{berlin(p.last)} <span className="muted small">({ago(p.last, now)})</span></td>
              <td data-l="Nächster Schritt">{p.next}</td>
              <td className="muted small" data-l="Quelle">{p.source}</td>
            </tr>
          ))}
          {people.length === 0 && <tr><td colSpan={6} className="muted">Noch niemand im Prozess (keine Antworten, Proben oder Kunden).</td></tr>}
        </tbody>
      </table></div>
      {live.followups_due.n > live.followups_due.rows.length && <p className="muted small">+ {live.followups_due.n - live.followups_due.rows.length} weitere mit fälliger Nachfassmail</p>}
    </>
  );
}

export function SampleRequests({ live }: { live: Live }) {
  const now = new Date(live.now);
  return (
    <div className="tbl"><table className="cards">
      <thead><tr><th>Eingang</th><th>Firma</th><th>Test</th><th>Status</th><th>Zeit bis Probe</th><th>Notiz</th></tr></thead>
      <tbody>
        {live.sample_requests.slice(0, 30).map((r) => (
          <tr key={r.id}>
            <td className="nw" data-l="Eingang">{berlin(r.created_at)}</td>
            <td><strong>{r.company_name}</strong> <span className="muted small">{r.domain}</span></td>
            <td className="nw" data-l="Test">{r.segment_id}/{r.country}</td>
            <td><span className={`pill ${r.status === "sent" ? "t-green" : r.status === "new" ? "t-gold" : "t-grey"}`}>{r.status === "sent" ? "gesendet" : r.status === "new" ? "offen" : "abgelehnt"}</span></td>
            <td className="nw" data-l="Zeit bis Probe">{r.status === "sent" && r.sent_at ? durationS(Date.parse(r.sent_at) - Date.parse(r.created_at)) : r.status === "new" ? `wartet ${durationS(now.getTime() - Date.parse(r.created_at))}` : "–"}</td>
            <td className="muted small">{r.note ?? ""}</td>
          </tr>
        ))}
        {live.sample_requests.length === 0 && <tr><td colSpan={6} className="muted">Noch keine Probe-Anfragen über die Website.</td></tr>}
      </tbody>
    </table></div>
  );
}

// ------------------------------------------------------------------------------------------------ Bestand
const LEAD_STATUS: [string, string][] = [["new", "lieferbar"], ["reserved", "reserviert (Vorrat)"], ["sample", "in Proben"], ["delivered", "geliefert"], ["expired", "abgelaufen"]];

export function StockTables({ live, stock, raw, cfg }: { live: Live; stock: Stock; raw: RawStock | null; cfg: OpsConfig }) {
  const keys = new Set<string>();
  for (const l of stock.leads) keys.add(`${l.segment_id ?? "–"}/${l.country}`);
  const focusFirst = (a: string, b: string) => Number(cfg.fokus.includes(b)) - Number(cfg.fokus.includes(a)) || a.localeCompare(b);
  const leadKeys = [...keys].sort(focusFirst);
  const lv = (k: string, st: string) => stock.leads.filter((l) => `${l.segment_id ?? "–"}/${l.country}` === k && l.status === st).reduce((s, l) => s + Number(l.n), 0);
  const l24 = (k: string) => stock.leads_24h.filter((l) => `${l.segment_id ?? "–"}/${l.country}` === k).reduce((s, l) => s + Number(l.n), 0);
  const tot = (st: string) => stock.leads.filter((l) => l.status === st).reduce((s, l) => s + Number(l.n), 0);

  const mailOk = (seg: string, c: string) => !!live.segments.find((s) => s.id === seg)?.email_countries.includes(c);
  const pk = new Set(stock.prospects.map((p) => `${p.segment_id}/${p.country}`));
  const pKeys = [...pk].sort(focusFirst);
  const pv = (k: string, st: string, f: "n" | "unused" = "n") => Number(stock.prospects.find((p) => `${p.segment_id}/${p.country}` === k && p.check_status === st)?.[f] ?? 0);
  const p24 = (k: string, st: string) => Number(stock.prospects_24h.find((p) => `${p.segment_id}/${p.country}` === k && p.check_status === st)?.n ?? 0);
  const okKeys = pKeys.filter((k) => mailOk(...(k.split("/") as [string, string])));
  const sumOk = okKeys.reduce((s, k) => s + pv(k, "ok"), 0);

  const isFocus = (k: string) => cfg.fokus.includes(k);
  const leadTable = (ks: string[], total: boolean) => (
    <div className="tbl"><table>
      <thead><tr><th>Test</th>{LEAD_STATUS.map(([, l]) => <th key={l} className="num">{l}</th>)}<th className="num">neu 24 h</th></tr></thead>
      <tbody>
        {ks.map((k) => (
          <tr key={k}><td className="nw">{isFocus(k) ? <strong>{k}</strong> : k}</td>
            {LEAD_STATUS.map(([s]) => <td key={s} className="num">{fmt(lv(k, s))}</td>)}<td className="num">{fmt(l24(k))}</td></tr>
        ))}
        {total && <tr className="total"><td>Summe alle</td>{LEAD_STATUS.map(([s]) => <td key={s} className="num">{fmt(tot(s))}</td>)}<td className="num">{fmt(stock.leads_24h.reduce((s, l) => s + Number(l.n), 0))}</td></tr>}
      </tbody>
    </table></div>
  );
  const buyerTable = (ks: string[], total: boolean) => (
    <div className="tbl"><table>
      <thead><tr><th>Test</th><th className="num">mail-fähig</th><th className="num">davon ohne Mail</th><th className="num">neu 24 h</th><th className="num">nur Anruf/Brief (getrennt)</th><th className="num">abgelehnt</th></tr></thead>
      <tbody>
        {ks.map((k) => {
          const ok = mailOk(...(k.split("/") as [string, string]));
          return (
            <tr key={k}><td className="nw">{isFocus(k) ? <strong>{k}</strong> : k}{!ok && <span className="muted small"> · kein Mail-Land</span>}</td>
              <td className="num">{ok ? fmt(pv(k, "ok")) : "–"}</td><td className="num">{ok ? fmt(pv(k, "ok", "unused")) : "–"}</td>
              <td className="num">{ok ? fmt(p24(k, "ok")) : "–"}</td>
              <td className="num muted">{fmt(pv(k, "call_only"))}</td><td className="num muted">{fmt(pv(k, "rejected"))}</td></tr>
          );
        })}
        {total && <tr className="total"><td>Summe mail-fähig</td><td className="num">{fmt(sumOk)}</td><td className="num">{fmt(okKeys.reduce((s, k) => s + pv(k, "ok", "unused"), 0))}</td>
          <td className="num">{fmt(okKeys.reduce((s, k) => s + p24(k, "ok"), 0))}</td><td className="num muted">{fmt(pKeys.reduce((s, k) => s + pv(k, "call_only"), 0))}</td><td className="num muted">{fmt(pKeys.reduce((s, k) => s + pv(k, "rejected"), 0))}</td></tr>}
      </tbody>
    </table></div>
  );
  const lf = leadKeys.filter(isFocus), lo = leadKeys.filter((k) => !isFocus(k));
  const pf = pKeys.filter(isFocus), po = pKeys.filter((k) => !isFocus(k));

  return (
    <>
      <h3>Leads je Zielgruppe × Land <span className="muted small">Stand {berlin(stock.at)} (alle 10 min neu gezählt)</span></h3>
      {leadTable(lf, false)}
      <details className="more"><summary>Alle Zielgruppen und Länder ({lo.length} weitere) mit Summe</summary>{leadTable(lo, true)}</details>
      <p className="muted small">
        Rohbestand (Firmen ohne Lead, unvollständig oder widersprüchlich – zum späteren Nachanreichern):{" "}
        {raw ? Object.entries(raw.by_country).sort((a, b) => b[1] - a[1]).map(([c, n]) => `${c} ${fmt(n)}`).join(" · ") + ` (Stand ${berlin(raw.at)}, stündlich)` : "wird gezählt …"}
      </p>

      <h3>Käufer je Zielgruppe × Land <span className="muted small">mail-fähig = Prüfung ok in einem Mail-Land der Zielgruppe · alle Zielgruppen {fmt(sumOk)}</span></h3>
      {buyerTable(pf, false)}
      <details className="more"><summary>Alle Zielgruppen und Länder ({po.length} weitere) mit Summe</summary>{buyerTable(po, true)}</details>
    </>
  );
}

export function SampleStockTable({ live, cfg }: { live: Live; cfg: OpsConfig }) {
  const rows = sampleStock(live, cfg, new Date(live.now));
  return (
    <div className="tbl"><table>
      <thead><tr><th>Seite</th><th className="num">fertig / Soll</th><th>ältestes</th><th className="num">24 h sofort gesendet</th></tr></thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key}>
            <td className="nw">{r.focus ? <strong>{r.slug}</strong> : r.slug} <span className="muted small">{r.key}</span></td>
            <td className={`num ${r.ready === 0 ? "bad" : r.ready < r.target ? "" : "ok"}`}>{r.ready} / {r.target}</td>
            <td className="nw">{r.oldestH === null ? "–" : `${Math.round(r.oldestH)} h (Verfall ${cfg.proben.max_alter_stunden} h)`}</td>
            <td className="num">{r.sent24}</td>
          </tr>
        ))}
        {rows.length === 0 && <tr><td colSpan={4} className="muted">Keine öffentlich live geschalteten Seiten.</td></tr>}
      </tbody>
    </table></div>
  );
}

export function PagesTable({ live }: { live: Live }) {
  const t = (k: "views" | "clicks" | "requests" | "checkouts" | "purchases") => live.pages.reduce((s, p) => s + Number(p[k]), 0);
  return (
    <div className="tbl"><table>
      <thead><tr><th>Seite</th><th className="num">Aufrufe</th><th className="num">Klicks</th><th className="num">Probe-Anfragen</th><th className="num">Checkout</th><th className="num">Käufe</th></tr></thead>
      <tbody>
        {live.pages.map((p) => (
          <tr key={p.slug}><td className="nw"><a href={`/${p.slug}?vorschau=1`}>{p.slug}</a> <span className="muted small">{p.segment_id}/{p.country}</span></td>
            <td className="num">{fmt(p.views)}</td><td className="num">{fmt(p.clicks)}</td><td className="num">{fmt(p.requests)}</td><td className="num">{fmt(p.checkouts)}</td><td className="num">{fmt(p.purchases)}</td></tr>
        ))}
        <tr className="total"><td>Summe 7 Tage</td><td className="num">{fmt(t("views"))}</td><td className="num">{fmt(t("clicks"))}</td><td className="num">{fmt(t("requests"))}</td><td className="num">{fmt(t("checkouts"))}</td><td className="num">{fmt(t("purchases"))}</td></tr>
      </tbody>
    </table></div>
  );
}

// ------------------------------------------------------------------------------------------------ Versand
export function Sending({ live, cfg, runs }: { live: Live; cfg: OpsConfig; runs: RunInfo[] | null }) {
  const now = new Date(live.now);
  const boxes = mailboxes(live, cfg);
  const b = brake(live, cfg);
  const countries = [...new Set(live.sent_days.map((s) => s.country))].sort();
  const weekAgo = new Date(now.getTime() - 6 * 86_400_000).toLocaleDateString("sv-SE", { timeZone: "Europe/Berlin" });
  const cDay = (c: string, today: boolean) => live.sent_days.filter((s) => s.country === c && (today ? s.day === live.today : s.day >= weekAgo)).reduce((x, s) => x + s.n, 0);
  const queue = (kindInitial: boolean) => live.msg.filter((m) => m.status === "approved" && (m.kind === "initial") === kindInitial && (!cfg.nur_fokus || cfg.fokus.includes(`${m.segment_id}/${m.country}`))).reduce((s, m) => s + m.n, 0);
  const queueAll = live.msg.filter((m) => m.status === "approved").reduce((s, m) => s + m.n, 0);
  const sup = Object.entries(live.suppression);
  const SUP: Record<string, string> = { bounce: "Bounce", unsubscribe: "Abmeldelink", complaint: "Spam-Beschwerde", reply_optout: "per Antwort abgemeldet", manual: "manuell" };
  const total = boxes.reduce((s, x) => s + x.total, 0);
  return (
    <>
      <div className="grid kpis">
        <div className="card kpi"><div className="v">{cfg.versand.aktiv ? "an" : "aus"}</div><div className="l">Versand (config/versand.yaml)</div><div className="h">{cfg.nur_fokus ? `nur Fokus: ${cfg.fokus.join(", ")}` : "alle Tests"}</div></div>
        <div className="card kpi"><div className="v">{pctS(b.rate)}</div><div className="l">Bounce-Quote (Notbremse 5 %)</div><div className="h">{b.bounced} von {b.sent} seit {berlin(b.start)}; Beschwerden {b.complained}</div>
          <div className={`meter ${b.rate > 0.04 ? "bad" : b.rate > 0.025 ? "warn" : ""}`}><i style={{ width: `${Math.min(100, (100 * b.rate) / 0.05)}%` }} /></div></div>
        <div className="card kpi"><div className="v">{fmt(queue(true))}</div><div className="l">Erstmails freigegeben{cfg.nur_fokus ? " (Fokus)" : ""}</div><div className="h">+ {fmt(queue(false))} Nachfass · alle Tests {fmt(queueAll)}</div></div>
        <div className="card kpi"><div className="v">{fmt(total)} / {fmt(cfg.versand.gesamtgrenze)}</div><div className="l">gesendet gesamt / Gesamtgrenze</div>
          <div className="meter"><i style={{ width: `${Math.min(100, (100 * total) / cfg.versand.gesamtgrenze)}%` }} /></div></div>
      </div>
      <div className="two" style={{ marginTop: 12 }}>
        <div>
          <h3>Postfächer</h3>
          <div className="tbl"><table>
            <thead><tr><th>Postfach</th><th className="num">heute / Kapazität</th><th className="num">7 Tage</th><th className="num">gesamt</th><th>zuletzt</th></tr></thead>
            <tbody>
              {boxes.map((x) => (
                <tr key={x.box}><td>{x.label}<div className="muted small">seit {berlin(x.first_sent)}</div></td>
                  <td className="num">{fmt(x.today)} / {fmt(x.cap)}</td><td className="num">{fmt(x.d7)}</td><td className="num">{fmt(x.total)}</td><td className="nw">{ago(x.last_sent, now)}</td></tr>
              ))}
              <tr className="total"><td>Summe</td><td className="num">{fmt(boxes.reduce((s, x) => s + x.today, 0))} / {fmt(boxes.reduce((s, x) => s + x.cap, 0))}</td><td className="num">{fmt(boxes.reduce((s, x) => s + x.d7, 0))}</td><td className="num">{fmt(total)}</td><td></td></tr>
            </tbody>
          </table></div>
          <p className="muted small">Kapazität: Hauptpostfach {cfg.versand.tagesziel} + {cfg.versand.tagesziel_schritt}/Tag bis {cfg.versand.tagesziel_max}; weitere Postfächer {cfg.versand.postfach_start} + {cfg.versand.postfach_schritt}/Tag bis {cfg.versand.postfach_tageslimit} (ab erster Mail).</p>
        </div>
        <div>
          <h3>Je Land</h3>
          <div className="tbl"><table>
            <thead><tr><th>Land</th><th className="num">heute</th><th className="num">7 Tage</th><th className="num">Tageslimit</th></tr></thead>
            <tbody>
              {countries.map((c) => (
                <tr key={c}><td>{c}</td><td className="num">{fmt(cDay(c, true))}</td><td className="num">{fmt(cDay(c, false))}</td><td className="num">{fmt(cfg.countries[c]?.daily_limit)}</td></tr>
              ))}
              {countries.length === 0 && <tr><td colSpan={4} className="muted">In den letzten 7 Tagen nichts gesendet.</td></tr>}
            </tbody>
          </table></div>
          <h3>Gesperrt</h3>
          <p className="small">{sup.length ? sup.map(([r, n]) => `${SUP[r] ?? r}: ${fmt(n)}`).join(" · ") : "keine Sperren"} <span className="muted">(Adressen; die Domain wird jeweils mitgesperrt)</span></p>
        </div>
      </div>
      <h3>Geplante Läufe <span className="muted small">deutsche Zeit</span></h3>
      <div className="tbl"><table>
        <thead><tr><th>Ablauf</th><th>nächster Lauf</th><th>letzter Lauf</th></tr></thead>
        <tbody>
          {cfg.workflows.map((w) => {
            const r = runs?.find((x) => x.file === w.file);
            const next = nextRun(w.crons, now);
            return (
              <tr key={w.file}><td>{w.name} <span className="muted small">{w.file}</span></td>
                <td className="nw">{next ? berlin(next) : "kein Zeitplan"}</td>
                <td className="nw">{r ? <a href={r.url} className={r.conclusion && !["success", "skipped"].includes(r.conclusion) ? "bad" : ""}>{r.status === "completed" ? r.conclusion : "läuft"} · {berlin(r.updated_at)}</a>
                  : <span className="muted small">{runs === null ? "nur mit GitHub-Token sichtbar" : "–"}</span>}</td></tr>
            );
          })}
        </tbody>
      </table></div>
      <p className="muted small">Abgeleitet aus der Datenbank: letzte Mail {ago(live.last_sent_at, now)} · letzter Lead {ago(live.last_lead_at, now)} · letzter Käufer {ago(live.last_prospect_at, now)} · letzte Probe gebaut {ago(live.stock_last_built, now)}. Datenbank {gb(live.db_size)} von {gb(DB_LIMIT_BYTES)}.</p>
    </>
  );
}

// ------------------------------------------------------------------------------------------------ Kunden
export function Customers({ live, cfg }: { live: Live; cfg: OpsConfig }) {
  const now = new Date(live.now);
  const wf = cfg.workflows.find((w) => w.file === "kundenlieferung.yml");
  const next = wf ? nextRun(wf.crons, now) : null;
  const subsOf = (id: string) => live.subscriptions.filter((s) => s.customer_id === id);
  return (
    <>
      <p className="sub">Nächste Kundenlieferung: {next ? berlin(next) : "–"} (erste Lieferung jedes Kunden nur nach Freigabe). Testkäufe aus dem Stripe-Testmodus zählen nicht als Kunden oder Umsatz.</p>
      <div className="tbl"><table>
        <thead><tr><th>Kunde</th><th>Land</th><th>Status</th><th>Abo</th><th className="num">pro Monat</th><th>Lieferungen</th></tr></thead>
        <tbody>
          {live.customers.map((c) => {
            const subs = subsOf(c.id);
            const dels = live.deliveries.filter((d) => subs.some((s) => s.id === d.subscription_id));
            const test = isTestCustomer(c);
            return (
              <tr key={c.id}>
                <td><strong>{c.company_name}</strong>{test && <span className="pill t-grey" style={{ marginLeft: 6 }}>Testkauf</span>}<div className="muted small">seit {berlin(c.created_at)}</div></td>
                <td>{c.country}</td><td>{c.status}</td>
                <td>{subs.map((s) => `${s.segment_id} · ${s.package ?? "–"} · ${s.status}`).join(", ") || "–"}</td>
                <td className="num">{subs.map((s) => `${fmt(monthly(s))} ${currencySign(s.currency, c.country)}`).join(", ") || "–"}</td>
                <td className="small">{dels.length ? dels.slice(0, 3).map((d) => `${d.period_start}: ${d.status === "prepared" ? "vorbereitet, wartet auf Freigabe" : d.status === "approved" ? "freigegeben" : "gesendet"} (${d.leads} Leads)`).join(" · ") : "noch keine"}</td>
              </tr>
            );
          })}
          {live.customers.length === 0 && <tr><td colSpan={6} className="muted">Noch keine Kunden.</td></tr>}
        </tbody>
      </table></div>
      {live.contact_requests.length > 0 && (
        <>
          <h3>Kontaktanfragen (Website)</h3>
          <div className="tbl"><table>
            <thead><tr><th>Eingang</th><th>Firma</th><th>Land</th><th>Branche</th><th>Status</th></tr></thead>
            <tbody>{live.contact_requests.slice(0, 10).map((r) => (
              <tr key={r.id}><td className="nw">{berlin(r.created_at)}</td><td>{r.company_name}</td><td>{r.country ?? "–"}</td><td>{r.industry ?? "–"}</td><td>{r.status}</td></tr>
            ))}</tbody>
          </table></div>
        </>
      )}
    </>
  );
}

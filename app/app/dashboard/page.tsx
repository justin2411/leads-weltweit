import { Suspense } from "react";
import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { db } from "@/lib/supabase";
import { CONFIG, loadLive, loadRawStock, loadRuns, loadStock } from "@/lib/dashboard-data";
import { alerts, berlin, funnel, pairs, type Live, type RawStock, type Stock } from "@/lib/dashboard-logic";
import { approveDraft, logReply, logout, rejectDraft, requireOwner } from "./actions";
import { AutoRefresh } from "./auto-refresh";
import { BrainSection } from "./brain-section";
import { DASH_CSS } from "./dash-css";
import {
  Customers, FunnelCard, FunnelTable, Kpis, Lights, PagesTable, People, SampleRequests, SampleStockTable, Sending, StockTables,
} from "./sections";

// Inhaber-Übersicht (Inhaber 03.10.2026): immer frisch, nie zwischengespeichert, nie indexiert, nirgends verlinkt.
export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Übersicht", robots: { index: false, follow: false, nocache: true } };

const sans = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--sans", display: "swap" });

const NAV: [string, string][] = [
  ["ampel", "Engpässe"], ["trichter", "Trichter"], ["prozess", "Wer ist wo"], ["bestand", "Bestand"],
  ["versand", "Versand"], ["kunden", "Kunden & Umsatz"], ["aktionen", "Freigaben"], ["gehirn", "Gehirn"],
];

/** Wartet höchstens `ms` – ist der große Bestand nicht im Zwischenspeicher, lädt die Seite trotzdem sofort. */
function within<T>(p: Promise<T>, ms: number): Promise<T | null> {
  return Promise.race([p.catch(() => null), new Promise<null>((r) => setTimeout(() => r(null), ms))]);
}

export default async function Dashboard() {
  await requireOwner();
  const stockP = loadStock();
  const rawP = loadRawStock();
  stockP.catch(() => {});
  rawP.catch(() => {});
  let live: Live;
  try {
    live = await loadLive();
  } catch (e) {
    return (
      <div className={`dash ${sans.variable}`}><style dangerouslySetInnerHTML={{ __html: DASH_CSS }} />
        <main><h1>Übersicht</h1><p className="bad">Datenbank antwortet nicht: {(e as Error).message}</p><p className="muted">Seite in einer Minute neu laden.</p></main>
      </div>
    );
  }
  const [stock, runs] = await Promise.all([within(stockP, 1200), within(loadRuns(), 1500)]);
  const cfg = CONFIG;
  const now = new Date(live.now);
  const list = alerts(live, stock, cfg, now, runs);
  const segName = (id: string) => live.segments.find((s) => s.id === id)?.name ?? id;
  const { focus, other } = pairs(live, cfg);

  return (
    <div className={`dash ${sans.variable}`}>
      <style dangerouslySetInnerHTML={{ __html: DASH_CSS }} />
      <header className="top">
        <div className="in">
          <span className="mark">NextGen <i>Profit</i></span>
          <span className="stamp">Stand {berlin(now)} Uhr (deutsche Zeit)</span>
          <span className="sp" />
          <AutoRefresh />
          <form action={logout}><button type="submit">Abmelden</button></form>
        </div>
        <nav className="tabs">{NAV.map(([id, l]) => <a key={id} href={`#${id}`}>{l}</a>)}</nav>
      </header>
      <main>
        <section id="ampel" style={{ marginTop: 0 }}>
          <div className="eyebrow">Übersicht</div>
          <h1>Wo hakt es gerade?</h1>
          <p className="sub">Automatisch erkannt aus Datenbank und Konfiguration. Rot = Engpass, sofort ansehen. Käufer zählen nur, wenn sie per Mail angeschrieben werden dürfen.</p>
          <Lights alerts={list} />
          <div style={{ marginTop: 16 }}><Kpis live={live} stock={stock} cfg={cfg} /></div>
        </section>

        <section id="trichter">
          <h2>Trichter je Fokus-Test</h2>
          <p className="sub">Vom mail-fähigen Käufer bis zum Umsatz. Zugestellt = gesendet − Bounces (das eigene Postfach meldet keine Zustellungen).</p>
          <div className="grid funnels">
            {focus.map((k) => {
              const [s, c] = k.split("/");
              return <FunnelCard key={k} f={funnel(live, stock, s, c)} name={segName(s)} />;
            })}
          </div>
          {other.length > 0 && (
            <details className="more">
              <summary>Übrige Experimente ({other.length}) – ruhen, solange nur der Fokus gesendet wird</summary>
              <FunnelTable rows={other.map((k) => funnel(live, stock, ...(k.split("/") as [string, string])))} segName={segName} />
            </details>
          )}
        </section>

        <section id="prozess">
          <h2>Wer ist wo im Prozess</h2>
          <p className="sub">Käufer mit Antwort, Probe, fälliger Nachfassmail oder Abo – mit dem nächsten Schritt.</p>
          <People live={live} cfg={cfg} />
          <h3>Probe-Anfragen über die Website</h3>
          <SampleRequests live={live} />
        </section>

        <section id="bestand">
          <h2>Bestand</h2>
          <p className="sub">Was vorbereitet ist: Leads, Käufer, fertige Proben und Landingpages.</p>
          <Suspense fallback={<p className="muted">Bestand wird gezählt …</p>}>
            <StockBlock live={live} stockP={stockP} rawP={rawP} />
          </Suspense>
          <div className="two" style={{ marginTop: 8 }}>
            <div><h3>Proben-Vorrat je Live-Seite</h3><SampleStockTable live={live} cfg={cfg} /></div>
            <div><h3>Live-Landingpages, letzte 7 Tage</h3><PagesTable live={live} /></div>
          </div>
        </section>

        <section id="versand">
          <h2>Versand</h2>
          <Sending live={live} cfg={cfg} runs={runs} />
        </section>

        <section id="kunden">
          <h2>Kunden &amp; Umsatz</h2>
          <Customers live={live} cfg={cfg} />
        </section>

        <section id="aktionen" className="legacy">
          <h2>Freigaben und Antworten</h2>
          <Suspense fallback={<p className="muted">lädt …</p>}><Actions /></Suspense>
        </section>

        <section id="gehirn" className="legacy">
          <details className="more">
            <summary>Gehirn, Schalter, Seiten-Varianten und Entscheidungen</summary>
            <Suspense fallback={<p className="muted">lädt …</p>}><BrainSection /></Suspense>
          </details>
        </section>
      </main>
    </div>
  );
}

async function StockBlock({ live, stockP, rawP }: { live: Live; stockP: Promise<Stock>; rawP: Promise<RawStock> }) {
  let stock: Stock;
  try {
    stock = await stockP;
  } catch (e) {
    return <p className="bad">Bestand gerade nicht abrufbar: {(e as Error).message}</p>;
  }
  const raw = await within(rawP, 6000);
  return <StockTables live={live} stock={stock} raw={raw} cfg={CONFIG} />;
}

/** Bisherige Aktionen: Entwürfe freigeben/ablehnen, Antwort erfassen, letzte Ereignisse. */
async function Actions() {
  const sb = db();
  const [drafts, events] = await Promise.all([
    sb.from("messages")
      .select("id, to_email, subject, body, check_errors, created_at, prospects(company_name, country), experiments(segment_id, variant)")
      .eq("status", "draft").order("created_at").limit(50),
    sb.from("email_events")
      .select("id, type, note, occurred_at, messages(to_email)")
      .in("type", ["reply", "reply_positive", "reply_negative", "sample_requested", "unsubscribed", "complained", "bounced"])
      .order("occurred_at", { ascending: false }).limit(20),
  ]);
  const err = drafts.error ?? events.error;
  if (err) return <p className="bad">{err.message}</p>;
  return (
    <>
      <h3>Entwürfe zur Freigabe ({drafts.data?.length ?? 0})</h3>
      {(drafts.data ?? []).map((m: any) => (
        <div className="card" key={m.id}>
          <div className="muted small">
            {m.experiments?.segment_id}/{m.experiments?.variant} · {m.prospects?.company_name} ({m.prospects?.country}) · {m.to_email}
          </div>
          <strong>{m.subject}</strong>
          <pre>{m.body}</pre>
          {m.check_errors?.length > 0 && <p className="bad small">Prüfung: {m.check_errors.join("; ")}</p>}
          <div className="row">
            <form action={approveDraft}>
              <input type="hidden" name="id" value={m.id} />
              <button className="primary" disabled={m.check_errors?.length > 0}>Freigeben</button>
            </form>
            <form action={rejectDraft} className="row">
              <input type="hidden" name="id" value={m.id} />
              <input name="reason" placeholder="Grund (optional)" />
              <button>Ablehnen</button>
            </form>
          </div>
        </div>
      ))}
      {(drafts.data ?? []).length === 0 && <p className="muted">Keine offenen Entwürfe.</p>}

      <h3>Antwort erfassen</h3>
      <form action={logReply} className="row card">
        <input name="email" type="email" placeholder="Adresse des Absenders" required />
        <select name="type" defaultValue="reply">
          <option value="reply">Antwort (neutral)</option>
          <option value="reply_positive">Positiv</option>
          <option value="sample_requested">Probe angefordert</option>
          <option value="reply_negative">Kein Interesse</option>
          <option value="optout">Bitte nicht mehr schreiben (sperrt)</option>
        </select>
        <input name="note" placeholder="Notiz" />
        <button className="primary">Speichern</button>
      </form>

      <h3>Letzte Antworten und Ereignisse</h3>
      <div className="tbl"><table>
        <thead><tr><th>Wann</th><th>Typ</th><th>Adresse</th><th>Notiz</th></tr></thead>
        <tbody>
          {(events.data ?? []).map((e: any) => (
            <tr key={e.id}><td className="nw">{berlin(e.occurred_at)}</td><td>{e.type}</td><td>{e.messages?.to_email ?? "–"}</td><td className="small">{e.note ?? ""}</td></tr>
          ))}
        </tbody>
      </table></div>
    </>
  );
}

import { envStatus } from "@/lib/env";
import { legalTextsReady } from "@/lib/legal";
import { stripeEnabled } from "@/lib/stripe";
import { db } from "@/lib/supabase";
import { reviewDecision, setStatus, updateSetting } from "./brain-actions";

const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)} %` : "–");

function Toggle({ k, on, label }: { k: string; on: boolean; label: string }) {
  return (
    <form action={updateSetting} className="row">
      <input type="hidden" name="key" value={k} />
      <input type="hidden" name="value" value={String(!on)} />
      <span style={{ minWidth: 280 }}>{label}: <strong className={on ? "ok" : "muted"}>{on ? "an" : "aus"}</strong></span>
      <button>{on ? "ausschalten" : "einschalten"}</button>
    </form>
  );
}

export async function BrainSection() {
  const sb = db();
  const [settings, pages, decisions, requests] = await Promise.all([
    sb.from("settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("page_stats").select("*").order("slug").order("variant_key"),
    sb.from("decisions").select("*").order("created_at", { ascending: false }).limit(30),
    sb.from("sample_requests").select("id, company_name, email, region, segment_id, country, status, created_at").order("created_at", { ascending: false }).limit(20),
  ]);
  const envTable = (
    <>
      <h2>Umgebungsvariablen (Vercel)</h2>
      <div className="scroll"><table>
        <thead><tr><th>Name</th><th>Wofür</th><th>Pflicht</th><th>Gesetzt</th></tr></thead>
        <tbody>{envStatus().map((e) => (
          <tr key={e.name}><td><code>{e.name}</code></td><td>{e.purpose}</td><td>{e.required ? "ja" : "optional"}</td>
            <td className={e.set ? "ok" : e.required ? "bad" : "muted"}>{e.set ? "ja" : "fehlt"}</td></tr>
        ))}</tbody>
      </table></div>

    </>
  );
  const err = [settings, pages, decisions, requests].find((r) => r.error)?.error;
  if (err) return <>{envTable}<p className="bad">Gehirn-Tabellen fehlen oder Fehler: {err.message} (Migration 20260927090000 angewendet?)</p></>;
  const s: any = settings.data ?? {};
  const legalFiles = legalTextsReady();

  return (
    <>
      {envTable}

      <h2>Schalter</h2>
      <div className="card">
        <Toggle k="brain_enabled" on={!!s.brain_enabled} label="Gehirn aktiv (aus = nur beobachten)" />
        <Toggle k="auto_publish_pages" on={!!s.auto_publish_pages} label="Seiten selbst live schalten (Stufe 2)" />
        <Toggle k="auto_merge_content" on={!!s.auto_merge_content} label="Inhalts-PRs selbst mergen (Stufe 3)" />
        <Toggle k="legal_ready" on={!!s.legal_ready} label="Rechtstexte veröffentlicht" />
        <form action={updateSetting} className="row">
          <input type="hidden" name="key" value="max_new_pages_per_week" />
          <span style={{ minWidth: 280 }}>Neue Seiten pro Woche höchstens:</span>
          <input name="value" type="number" min={0} max={20} defaultValue={s.max_new_pages_per_week ?? 3} style={{ width: 80 }} />
          <button>speichern</button>
        </form>
        <p className="muted">
          Rechtstexte: {legalFiles ? "fertig" : <span className="bad">noch Platzhalter – Landingpages bleiben offline</span>} ·
          Stripe live: {stripeEnabled("live") ? "bereit" : "aus"} · Stripe Test: {stripeEnabled("test") ? "bereit" : "aus"} ·
          Preise: {Array.isArray(s.pricing) && s.pricing.length ? `${s.pricing.length} Pakete` : "nicht hinterlegt"}
        </p>
      </div>

      <h2>Seiten</h2>
      <div className="scroll"><table>
        <thead><tr><th>Seite</th><th>Var.</th><th>Status</th><th>Anteil</th><th>Aufrufe</th><th>Klicks</th><th>Proben</th><th>Checkout</th><th>Käufe</th><th>Probe-Quote</th><th></th></tr></thead>
        <tbody>
          {(pages.data ?? []).map((p: any) => (
            <tr key={p.variant_id}>
              <td><a href={`/${p.slug}?vorschau=1&v=${p.variant_key}`}>{p.slug}</a><div className="muted">Seite: {p.page_status}</div></td>
              <td>{p.variant_key}</td><td>{p.variant_status}</td><td>{p.traffic_share} %</td>
              <td>{p.views}</td><td>{p.cta_clicks}</td><td>{p.sample_requests}</td><td>{p.checkouts}</td><td>{p.purchases}</td>
              <td>{pct(p.sample_requests, p.views)}</td>
              <td className="row">
                {p.page_status !== "live" && (
                  <form action={setStatus}><input type="hidden" name="table" value="page" /><input type="hidden" name="id" value={p.page_id} />
                    <input type="hidden" name="status" value="live" /><button disabled={!legalFiles || !s.legal_ready}>Seite live</button></form>)}
                {p.variant_status !== "live" && (
                  <form action={setStatus}><input type="hidden" name="table" value="variant" /><input type="hidden" name="id" value={p.variant_id} />
                    <input type="hidden" name="status" value="live" /><button disabled={!legalFiles || !s.legal_ready}>Variante live</button></form>)}
                {p.variant_status !== "retired" && (
                  <form action={setStatus}><input type="hidden" name="table" value="variant" /><input type="hidden" name="id" value={p.variant_id} />
                    <input type="hidden" name="status" value="retired" /><button>stilllegen</button></form>)}
              </td>
            </tr>
          ))}
          {(pages.data ?? []).length === 0 && <tr><td colSpan={11} className="muted">Noch keine Seiten (legt scripts/brain.py an).</td></tr>}
        </tbody>
      </table></div>

      <h2>Probe-Anfragen über Landingpages</h2>
      <div className="scroll"><table>
        <thead><tr><th>Wann</th><th>Firma</th><th>E-Mail</th><th>Segment/Land</th><th>Region</th><th>Status</th></tr></thead>
        <tbody>
          {(requests.data ?? []).map((r: any) => (
            <tr key={r.id}><td>{new Date(r.created_at).toLocaleString("de-DE")}</td><td>{r.company_name}</td><td>{r.email}</td>
              <td>{r.segment_id}/{r.country}</td><td>{r.region ?? ""}</td><td>{r.status}</td></tr>
          ))}
          {(requests.data ?? []).length === 0 && <tr><td colSpan={6} className="muted">Noch keine.</td></tr>}
        </tbody>
      </table></div>

      <h2>Entscheidungen</h2>
      {(decisions.data ?? []).map((d: any) => (
        <div className="card" key={d.id}>
          <div className="muted">{new Date(d.created_at).toLocaleString("de-DE")} · {d.type} · {d.status}</div>
          <strong>{d.subject}</strong>
          <pre>{d.reasoning}</pre>
          {d.action && <p>Aktion: {d.action}</p>}
          {d.status === "proposed" && (
            <div className="row">
              <form action={reviewDecision}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="status" value="done" /><button className="primary">annehmen</button></form>
              <form action={reviewDecision}><input type="hidden" name="id" value={d.id} /><input type="hidden" name="status" value="rejected" /><button>ablehnen</button></form>
            </div>
          )}
        </div>
      ))}
      {(decisions.data ?? []).length === 0 && <p className="muted">Noch keine Entscheidungen.</p>}
    </>
  );
}

import { berlin, compact } from "@/lib/dashboard-logic";
import { envStatus } from "@/lib/env";
import { legalTextsReady } from "@/lib/legal";
import { stripeEnabled } from "@/lib/stripe";
import { db } from "@/lib/supabase";
import { Icon } from "@/app/icons";
import { requireOwner } from "../actions";
import { reviewDecision, setStatus, updateSetting } from "../brain-actions";
import { Crumbs, Ctrl, Kpi } from "../v2";

/**
 * Gehirn (Inhaber 04.10.2026: „nimm bitte die alte ansicht überall raus“ – Schalter, Seiten-Varianten und Entscheidungen
 * aus der alten Ansicht hierher umgezogen). Aktionen unverändert aus brain-actions.ts; Live-Schalten nur mit Rechtstexten.
 */
const SWITCHES: [string, string, string][] = [
  ["brain_enabled", "Gehirn aktiv", "aus = nur beobachten"],
  ["auto_publish_pages", "Seiten selbst live", "Stufe 2"],
  ["auto_merge_content", "Inhalts-PRs selbst mergen", "Stufe 3"],
  ["legal_ready", "Rechtstexte veröffentlicht", "nur wenn Impressum, Datenschutz, AGB fertig"],
];
const STATUS: Record<string, string> = { live: "live", draft: "Entwurf", review: "Prüfung", retired: "stillgelegt", proposed: "Vorschlag", done: "erledigt", rejected: "abgelehnt" };
const tone = (s: string) => (s === "live" || s === "done" ? "t-green" : s === "proposed" || s === "review" ? "t-gold" : "t-grey");
const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1).replace(".", ",")} %` : "–");

export default async function Gehirn() {
  await requireOwner();
  const sb = db();
  const [settings, pages, decisions] = await Promise.all([
    sb.from("settings").select("*").eq("id", 1).maybeSingle(),
    sb.from("page_stats").select("*").order("slug").order("variant_key"),
    sb.from("decisions").select("*").order("created_at", { ascending: false }).limit(30),
  ]);
  const env = envStatus();
  const envMissing = env.filter((e) => e.required && !e.set);
  const err = [settings, pages, decisions].find((r) => r.error)?.error;
  const s: any = settings.data ?? {};
  const legalFiles = legalTextsReady();
  const canLive = legalFiles && !!s.legal_ready;
  const pg: any[] = pages.data ?? [];
  // offene Vorschläge zuerst, danach die neuesten
  const dec: any[] = [...(decisions.data ?? [])].sort((a, b) => Number(b.status === "proposed") - Number(a.status === "proposed"));
  const open = dec.filter((d) => d.status === "proposed").length;
  const livePages = new Set(pg.filter((p) => p.page_status === "live").map((p) => p.page_id)).size;

  return (
    <div className="v2">
      <Crumbs items={[["JARVIS", "/dashboard/jarvis"], ["Gehirn", ""]]} />
      {err && <div className="card bad"><Icon name="fehler" size={16} /> Gehirn-Tabellen nicht lesbar: {err.message}</div>}
      <div className="kpis2 four">
        <Kpi value={s.brain_enabled ? "an" : "aus"} label="Gehirn" tip="stündliche Sitzung nach docs/GEHIRN-SITZUNG.md" />
        <Kpi value={compact(livePages)} label="Seiten live" tip={`${pg.length} Varianten insgesamt`} />
        <Kpi value={compact(open)} label="Vorschläge offen" tip="Entscheidungen des Gehirns, die auf dich warten" />
        <Kpi value={legalFiles ? "fertig" : "fehlen"} label="Rechtstexte" tip={legalFiles ? "app/content/legal.ts" : "noch Platzhalter – Landingpages bleiben offline"} />
      </div>

      <h2 className="h2s">Schalter</h2>
      <div className="ctrls">
        <Ctrl title="Gehirn" tip="Was das Gehirn selbst darf. Jede Änderung wird als Entscheidung protokolliert.">
          {SWITCHES.map(([k, label, hint]) => {
            const on = !!s[k];
            const block = k === "legal_ready" && !legalFiles;
            return (
              <div key={k} className="swrow">
                <span title={hint}>{label}</span>
                <form action={updateSetting} className="sw">
                  <input type="hidden" name="key" value={k} />
                  <button name="value" value="true" className={on ? "on go" : ""} disabled={on || block} title={block ? "Rechtstexte noch Platzhalter" : undefined}>an</button>
                  <button name="value" value="false" className={!on ? "on stop" : ""} disabled={!on}>aus</button>
                </form>
              </div>
            );
          })}
        </Ctrl>
        <Ctrl title="Neue Seiten pro Woche" tip="Höchstens so viele neue Landingpages legt das Gehirn je Woche an (0–20).">
          <form action={updateSetting}>
            <input type="hidden" name="key" value="max_new_pages_per_week" />
            <label className="frow"><b>max</b>
              <input name="value" type="number" min={0} max={20} defaultValue={s.max_new_pages_per_week ?? 3} />
              <span className="hint">je Woche</span>
            </label>
            <button className="primary">Speichern</button>
          </form>
        </Ctrl>
        <Ctrl title="Stand" tip="Nur Anzeige." locked="nur Anzeige">
          <div className="facts">
            <span>Rechtstexte <b className={legalFiles ? "ok" : "bad"}>{legalFiles ? "fertig" : "Platzhalter"}</b></span>
            <span>Stripe live <b>{stripeEnabled("live") ? "bereit" : "aus"}</b> · Test <b>{stripeEnabled("test") ? "bereit" : "aus"}</b></span>
            <span>Preise <b>{Array.isArray(s.pricing) && s.pricing.length ? `${s.pricing.length} Pakete` : "nicht hinterlegt"}</b></span>
            <span>Variablen <b className={envMissing.length ? "bad" : "ok"}>{envMissing.length ? `${envMissing.length} Pflicht fehlt` : "vollständig"}</b></span>
          </div>
        </Ctrl>
      </div>

      <h2 className="h2s">Seiten</h2>
      <div className="klist card">
        {pg.map((p) => (
          <div key={p.variant_id} className="kcard stack">
            <span className="cn"><a href={`/${p.slug}?vorschau=1&v=${p.variant_key}`} title="Vorschau (zählt nicht)">{p.slug}</a> <span className="muted">· {p.variant_key}</span></span>
            <span className="cm">
              <span className={`pill ${tone(p.page_status)}`} title="Seite">{STATUS[p.page_status] ?? p.page_status}</span>
              <span className={`pill ${tone(p.variant_status)}`} title="Variante">{STATUS[p.variant_status] ?? p.variant_status}</span>
              <span title="Anteil der Besucher">{p.traffic_share} %</span>
              <span title="Aufrufe · Klicks · Proben · Checkout · Käufe">{compact(p.views)} Aufrufe · {compact(p.cta_clicks)} Klicks · {compact(p.sample_requests)} Proben · {compact(p.purchases)} Käufe</span>
              <span title="Proben je Aufruf">Quote {pct(p.sample_requests, p.views)}</span>
            </span>
            <span className="acts2">
              {p.page_status !== "live" && (
                <form action={setStatus}><input type="hidden" name="table" value="page" /><input type="hidden" name="id" value={p.page_id} />
                  <button name="status" value="live" disabled={!canLive} title={canLive ? "Seite live schalten" : "erst mit Rechtstexten"}><Icon name="start" size={14} /> Seite live</button></form>
              )}
              {p.variant_status !== "live" && (
                <form action={setStatus}><input type="hidden" name="table" value="variant" /><input type="hidden" name="id" value={p.variant_id} />
                  <button name="status" value="live" disabled={!canLive} title={canLive ? "Variante live schalten" : "erst mit Rechtstexten"}><Icon name="start" size={14} /> Variante live</button></form>
              )}
              {p.variant_status !== "retired" && (
                <form action={setStatus}><input type="hidden" name="table" value="variant" /><input type="hidden" name="id" value={p.variant_id} />
                  <button name="status" value="retired" title="Variante stilllegen"><Icon name="stopp" size={14} /> Stilllegen</button></form>
              )}
            </span>
          </div>
        ))}
        {pg.length === 0 && <div className="muted">Noch keine Seiten (legt scripts/brain.py an).</div>}
      </div>

      <h2 className="h2s">Entscheidungen{open > 0 ? ` · ${open} offen` : ""}</h2>
      <div className="klist card">
        {dec.map((d) => (
          <div key={d.id} className="kcard stack">
            <span className="cn" title={d.subject}>{d.subject}</span>
            <span className="cm">
              <span className={`pill ${tone(d.status)}`}>{STATUS[d.status] ?? d.status}</span>
              <span className="pill t-next">{d.type}</span>
              <span className="ca">{berlin(d.created_at)}</span>
            </span>
            {(d.reasoning || d.action) && (
              <details className="why">
                <summary>Begründung</summary>
                {d.reasoning && <p>{d.reasoning}</p>}
                {d.action && <p className="muted">Aktion: {d.action}</p>}
              </details>
            )}
            {d.status === "proposed" && (
              <span className="acts2">
                <form action={reviewDecision}><input type="hidden" name="id" value={d.id} />
                  <button name="status" value="done" className="primary"><Icon name="ok" size={14} /> Annehmen</button></form>
                <form action={reviewDecision}><input type="hidden" name="id" value={d.id} />
                  <button name="status" value="rejected"><Icon name="fehler" size={14} /> Ablehnen</button></form>
              </span>
            )}
          </div>
        ))}
        {dec.length === 0 && <div className="muted">Noch keine Entscheidungen.</div>}
      </div>

      <details className="card tile envs">
        <summary className="th"><span>Umgebungsvariablen (Vercel)</span><span className={`pill ${envMissing.length ? "t-red" : "t-green"}`}>{env.filter((e) => e.set).length}/{env.length}</span></summary>
        <div className="klist">
          {env.map((e) => (
            <div key={e.name} className="kcard">
              <span className="cn"><code>{e.name}</code><span className="muted small"> · {e.purpose}</span></span>
              <span className={`pill ${e.set ? "t-green" : e.required ? "t-red" : "t-grey"}`}>{e.set ? "gesetzt" : e.required ? "fehlt" : "optional"}</span>
            </div>
          ))}
        </div>
      </details>
    </div>
  );
}

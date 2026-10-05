/**
 * Gehirn-Seite oben (JARVIS-Zentrale 05.10.2026): der Lernring groß und was bisher niemand las – Erwartung → Ergebnis
 * (decisions), Lehren mit Vertrauen (brain_knowledge), Prüffälle (brain_evals), Rückschau (brain_rueckschau) und der Takt
 * der Routinen (brain_routines.last_run_at; nie gelaufen = gelb). Nur lesen, jede Quelle einzeln mit Zeitlimit.
 */
import "server-only";
import { db } from "@/lib/supabase";
import { loadZentrale } from "@/lib/zentrale-data";
import { lernBild, nowMs } from "@/lib/zentrale-modell";
import { kurz, uhr } from "@/lib/zentrale-logik";
import { LernRing } from "../jarvis/lern-ring";

type Row = Record<string, unknown>;
async function lies(tabelle: string, spalten: string, f: (q: any) => any): Promise<Row[] | null> {
  try {
    const { data, error } = await f(db().from(tabelle).select(spalten)).abortSignal(AbortSignal.timeout(3000));
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  } catch {
    return null;
  }
}

export async function Lernschleife() {
  const [z, erw, lehren, evals, rueck, routinen] = await Promise.all([
    loadZentrale("alle"),
    lies("decisions", "id, created_at, kurz_titel, subject, erwartung, pruefen_am, ergebnis, ergebnis_notiz", (q) => q.not("erwartung", "is", null).order("created_at", { ascending: false }).limit(6)),
    lies("brain_knowledge", "slug, titel, vertrauen, updated_at, status", (q) => q.eq("status", "aktiv").order("vertrauen", { ascending: false, nullsFirst: false }).limit(8)),
    lies("brain_evals", "created_at, faelle, richtig, verboten, score, anlass", (q) => q.order("created_at", { ascending: false }).limit(3)),
    lies("brain_rueckschau", "woche, at, lehren, widersprueche", (q) => q.order("woche", { ascending: false }).limit(2)),
    lies("brain_routines", "name, takt, aktiv, last_run_at", (q) => q.order("name").limit(30)),
  ]);
  const now = nowMs(z.schnell, z.abruf);
  const lern = lernBild(z.schnell, z.langsam, now);
  const n = (x: unknown) => Number(x ?? 0) || 0;
  const len = (x: unknown) => (Array.isArray(x) ? x.length : 0);
  return (
    <section className="gh-ls" aria-label="Lernschleife">
      <style dangerouslySetInnerHTML={{ __html: LS_CSS }} />
      <div className="gh-ls-ring">
        <LernRing segmente={lern.segmente} aktiv={lern.aktiv} drehen={false} herz={null} wort="LERNT"
          href={(k) => `/dashboard/jarvis?s=lern&p=${k}`} kern={<div className="jz-kernfeld"><b className="w">LERNT</b><span>6 Schritte</span></div>} />
      </div>
      <div className="gh-ls-grid">
        <div className="gh-ls-k">
          <h3>Erwartung → Ergebnis</h3>
          {erw === null ? <p className="lock">nicht lesbar</p> : erw.length ? <ul>{erw.map((d) => { const k = kurz(String(d.kurz_titel ?? d.subject ?? ""), String(d.ergebnis_notiz ?? "")); return (
            <li key={String(d.id)}><b>{k.titel}</b><span>{d.ergebnis ? `Ergebnis: ${d.ergebnis}` : `prüfen am ${uhr(String(d.pruefen_am ?? ""), now)}`}</span></li>); })}</ul>
            : <p className="lock">0 gemessen – noch keine Entscheidung mit Erwartung.</p>}
        </div>
        <div className="gh-ls-k">
          <h3>Lehren</h3>
          {lehren === null ? <p className="lock">nicht lesbar</p> : lehren.length ? <ul>{lehren.map((x) => (
            <li key={String(x.slug)}><b>{kurz(String(x.titel ?? x.slug)).titel}</b>
              <span className="bar" title={`Vertrauen ${n(x.vertrauen).toLocaleString("de-DE")}`}><i style={{ width: `${Math.round(n(x.vertrauen) * 100)}%` }} className={n(x.vertrauen) >= 0.7 ? "hi" : ""} /></span></li>))}</ul>
            : <p className="lock">noch keine Lehre</p>}
        </div>
        <div className="gh-ls-k">
          <h3>Prüffälle</h3>
          {evals === null ? <p className="lock">nicht lesbar</p> : evals.length ? <ul>{evals.map((e, i) => (
            <li key={i}><b>{n(e.richtig)}/{n(e.faelle)} richtig · Punkte {n(e.score).toLocaleString("de-DE")}</b><span>{uhr(String(e.created_at), now)}{n(e.verboten) ? ` · ${n(e.verboten)} verboten` : ""}</span></li>))}</ul>
            : <p className="lock">noch keine Prüfung</p>}
        </div>
        <div className="gh-ls-k">
          <h3>Rückschau</h3>
          {rueck === null ? <p className="lock">nicht lesbar</p> : rueck.length ? <ul>{rueck.map((r) => (
            <li key={String(r.woche)}><b>Woche ab {String(r.woche)}</b><span>{len(r.lehren)} Lehren · {len(r.widersprueche)} Widersprüche</span></li>))}</ul>
            : <p className="lock">erste Rückschau am Montag</p>}
        </div>
        <div className="gh-ls-k">
          <h3>Routinen-Takt</h3>
          {routinen === null ? <p className="lock">nicht lesbar</p> : routinen.length ? <ul>{routinen.filter((r) => r.aktiv !== false).slice(0, 10).map((r) => (
            <li key={String(r.name)} className={r.last_run_at ? "" : "gelb"}><b>{kurz(String(r.name)).titel}</b><span>{r.last_run_at ? `zuletzt ${uhr(String(r.last_run_at), now)}` : "nie gelaufen"}</span></li>))}</ul>
            : <p className="lock">keine Routinen</p>}
        </div>
      </div>
    </section>
  );
}

const LS_CSS = `
.gh-ls{display:grid;grid-template-columns:minmax(260px,360px) minmax(0,1fr);gap:16px;align-items:stretch;margin:0 0 16px;padding:16px;border:1px solid rgba(95,212,255,.18);border-radius:12px;background:rgba(9,24,48,.62)}
.gh-ls-ring{display:grid;place-items:center}
.gh-ls-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:8px;align-items:stretch}
.gh-ls-k{padding:8px 12px;border:1px solid rgba(95,212,255,.18);border-radius:10px;background:rgba(4,14,30,.6);min-width:0}
.gh-ls-k h3{margin:0 0 8px;font-size:13px;letter-spacing:.06em;text-transform:uppercase;color:#a8ecff}
.gh-ls-k ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.gh-ls-k li{display:grid;gap:2px;min-width:0}
.gh-ls-k li b{font-size:13px;color:#fff;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gh-ls-k li span{font-size:12px;color:#8ba6c9}
.gh-ls-k li.gelb span{color:#ffb547}
.gh-ls-k .bar{display:block;height:6px;border-radius:3px;background:rgba(95,212,255,.14);overflow:hidden}
.gh-ls-k .bar i{display:block;height:100%;background:#5d7290}
.gh-ls-k .bar i.hi{background:#5fd4ff}
@media (max-width:759px){.gh-ls{grid-template-columns:minmax(0,1fr)}}
`;

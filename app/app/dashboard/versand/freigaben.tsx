import { Fold } from "../fold";
import { berlin } from "@/lib/dashboard-logic";
import { db } from "@/lib/supabase";
import { Icon } from "@/app/icons";
import { approveDraft, logReply, rejectDraft } from "../actions";
import { Ctrl, Leer } from "../v2";
import Link from "next/link";
import { withQuery } from "../params";
import { TEST_SCOPE } from "@/lib/test-scope-data";
import { checkReasons, draftAge, draftInFocus } from "@/lib/drafts-view";

/**
 * Freigaben & Antworten (aus der alten Ansicht umgezogen, Inhaber 04.10.2026): Entwürfe freigeben/ablehnen, Antwort von
 * Hand erfassen, letzte E-Mail-Ereignisse. Aktionen unverändert aus actions.ts – Freigeben nur ohne Prüffehler,
 * „Bitte nicht mehr schreiben“ sperrt dauerhaft.
 */
const EV: Record<string, [string, string]> = {
  reply: ["Antwort", "t-grey"], reply_positive: ["positiv", "t-green"], reply_negative: ["kein Interesse", "t-grey"],
  sample_requested: ["Probe angefragt", "t-green"], unsubscribed: ["abgemeldet", "t-red"], complained: ["Spam-Beschwerde", "t-red"], bounced: ["Bounce", "t-red"],
};

export async function Freigaben({ entw, params }: { entw: string | null; params: Record<string, string | undefined> }) {
  const sb = db();
  const andere = entw === "andere";
  const segs = TEST_SCOPE.segmente, cc = TEST_SCOPE.laender;
  const SEL = "id, to_email, subject, body, check_errors, created_at, prospects!inner(company_name, country), experiments!inner(segment_id, variant)";
  const base = () => sb.from("messages").select(SEL).eq("status", "draft").order("created_at", { ascending: false }).limit(50);
  const lists = andere
    ? [base().not("experiments.segment_id", "in", `(${segs.join(",")})`), base().in("experiments.segment_id", segs).not("prospects.country", "in", `(${cc.join(",")})`)]
    : [base().in("experiments.segment_id", segs).in("prospects.country", cc)];
  const [all, focus, events, ...rows] = await Promise.all([
    sb.from("messages").select("id", { count: "exact", head: true }).eq("status", "draft"),
    sb.from("messages").select("id, prospects!inner(country), experiments!inner(segment_id)", { count: "exact", head: true })
      .eq("status", "draft").in("experiments.segment_id", segs).in("prospects.country", cc),
    sb.from("email_events")
      .select("id, type, note, occurred_at, messages(to_email)")
      .in("type", Object.keys(EV))
      .order("occurred_at", { ascending: false }).limit(20),
    ...lists,
  ]);
  const err = [all, focus, events, ...rows].find((r) => r.error)?.error;
  if (err) return <div className="card bad"><Icon name="fehler" size={16} /> Freigaben nicht lesbar: {err.message.slice(0, 160)}</div>;
  const nFocus = focus.count ?? 0;
  const nOther = Math.max(0, (all.count ?? 0) - nFocus);
  // Sicherheitsnetz: nach dem Abruf nochmal nach der Freigabe-Liste trennen (gleiche Logik wie lib/test-scope).
  const ds: any[] = rows.flatMap((r) => (r.data ?? []) as any[])
    .filter((m) => draftInFocus(TEST_SCOPE, m) !== andere)
    .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))).slice(0, 50);
  const evs: any[] = events.data ?? [];
  const now = new Date();
  const scopeText = `${segs.join("/")} × ${cc.join("/")}`;
  const tab = (v: string | null, label: string, n: number, tip: string) => (
    <Link href={`${withQuery("/dashboard/versand", { ...params, entw: v ?? undefined })}#versand-entwuerfe`} className={(entw ?? null) === v ? "on" : ""} title={tip}>{label} <b>{n}</b></Link>
  );
  return (
    <>
      <Fold id="versand-entwuerfe" title={<span title="Offene Entwürfe; Freigeben nur ohne Prüffehler">Entwürfe</span>} sum={`${nFocus} Fokus · ${nOther} ruhen`}>
      <div className="card drafts">
        <nav className="chips dtabs" aria-label="Entwürfe">
          {tab(null, "Fokus", nFocus, `Fokus-Tests ${scopeText} (config/fokus.yaml)`)}
          {tab("andere", "andere (ruhen)", nOther, "andere Zielgruppen ruhen laut Fokus – nur Anzeige, nichts geändert")}
        </nav>
        {ds.map((m) => {
          const bad = checkReasons(m.check_errors);
          const old = draftAge(m.created_at, now);
          const company = m.prospects?.company_name ?? m.to_email;
          return (
            <div key={m.id} className="dr">
              <div className="dh">
                <b className="dn" title={company}>{company}</b>
                <span className="pill t-next">{m.experiments?.segment_id ?? "–"}/{m.prospects?.country ?? "–"}</span>
                {bad.length > 0
                  ? <span className="pill t-red" title={bad.join("\n")}>Prüfung: {bad.length}</span>
                  : <span className="pill t-green" title="alle Prüfungen bestanden">geprüft</span>}
                {old && <span className="pill t-gold" title="offen seit über 48 h">{old}</span>}
                <span className="dd">{berlin(m.created_at)}</span>
              </div>
              {bad.length > 0 && <div className="dw" title={bad.join("\n")}>{bad[0]}{bad.length > 1 ? ` · +${bad.length - 1}` : ""}</div>}
              <details className="why dt">
                <summary title={m.subject}>{m.subject}</summary>
                <p className="dto">an {m.to_email}</p>
                <pre>{m.body}</pre>
                {bad.length > 0 && <ul className="bad">{bad.map((x) => <li key={x}>{x}</li>)}</ul>}
              </details>
              <div className="dact">
                <form action={approveDraft}><input type="hidden" name="id" value={m.id} />
                  <button className="primary" disabled={bad.length > 0} title={bad.length ? "erst ohne Prüffehler" : "zum Versand freigeben"}><Icon name="ok" size={14} /> Freigeben</button></form>
                <form action={rejectDraft} className="drej"><input type="hidden" name="id" value={m.id} />
                  <input name="reason" placeholder="Grund" aria-label="Grund (optional)" maxLength={200} />
                  <button><Icon name="fehler" size={14} /> Ablehnen</button></form>
              </div>
            </div>
          );
        })}
        {ds.length === 0 && <Leer icon="ok-kreis" text={andere ? "Keine ruhenden Entwürfe." : "Keine offenen Fokus-Entwürfe."} />}
        {(andere ? nOther : nFocus) > ds.length && <p className="muted dmore">neueste {ds.length} von {andere ? nOther : nFocus}</p>}
      </div>
      </Fold>

      <div className="ctrls">
        <Ctrl title="Antwort erfassen" tip="Für Antworten, die nicht über die Postfächer kamen (z. B. Telefon). „Nicht mehr schreiben“ sperrt die Firma dauerhaft.">
          <form action={logReply}>
            <input name="email" type="email" placeholder="Adresse des Absenders" required maxLength={200} />
            <select name="type" defaultValue="reply">
              <option value="reply">Antwort (neutral)</option>
              <option value="reply_positive">Positiv</option>
              <option value="sample_requested">Probe angefordert</option>
              <option value="reply_negative">Kein Interesse</option>
              <option value="optout">Nicht mehr schreiben (sperrt)</option>
            </select>
            <input name="note" placeholder="Notiz" maxLength={500} />
            <button className="primary">Speichern</button>
          </form>
        </Ctrl>
        <Fold id="versand-ereignisse" className="card ctrl evs" head="th" title={<span title="Antworten, Proben, Abmeldungen, Beschwerden und Bounces – deutsche Zeit">Letzte Ereignisse</span>} sum={`${evs.length}`}>
          <ul className="timeline">
            {evs.map((e) => {
              const [l, t] = EV[e.type] ?? [e.type, "t-grey"];
              return (
                <li key={e.id}>
                  <span className="tt">{berlin(e.occurred_at)}</span>
                  <span className={`pill ${t}`}>{l}</span>
                  <span className="tx" title={e.note ?? ""}>{e.messages?.to_email ?? "–"}{e.note ? ` · ${e.note}` : ""}</span>
                </li>
              );
            })}
            {evs.length === 0 && <li><Leer small icon="mail" text="Noch keine Ereignisse." /></li>}
          </ul>
        </Fold>
      </div>
    </>
  );
}

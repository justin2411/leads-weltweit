import { Fold } from "../fold";
import { berlin } from "@/lib/dashboard-logic";
import { db } from "@/lib/supabase";
import { Icon } from "@/app/icons";
import { approveDraft, logReply, rejectDraft } from "../actions";
import { Ctrl } from "../v2";

/**
 * Freigaben & Antworten (aus der alten Ansicht umgezogen, Inhaber 04.10.2026): Entwürfe freigeben/ablehnen, Antwort von
 * Hand erfassen, letzte E-Mail-Ereignisse. Aktionen unverändert aus actions.ts – Freigeben nur ohne Prüffehler,
 * „Bitte nicht mehr schreiben“ sperrt dauerhaft.
 */
const EV: Record<string, [string, string]> = {
  reply: ["Antwort", "t-grey"], reply_positive: ["positiv", "t-green"], reply_negative: ["kein Interesse", "t-grey"],
  sample_requested: ["Probe angefragt", "t-green"], unsubscribed: ["abgemeldet", "t-red"], complained: ["Spam-Beschwerde", "t-red"], bounced: ["Bounce", "t-red"],
};

export async function Freigaben() {
  const sb = db();
  const [drafts, events] = await Promise.all([
    sb.from("messages")
      .select("id, to_email, subject, body, check_errors, created_at, prospects(company_name, country), experiments(segment_id, variant)")
      .eq("status", "draft").order("created_at").limit(50),
    sb.from("email_events")
      .select("id, type, note, occurred_at, messages(to_email)")
      .in("type", Object.keys(EV))
      .order("occurred_at", { ascending: false }).limit(20),
  ]);
  const err = drafts.error ?? events.error;
  if (err) return <div className="card bad"><Icon name="fehler" size={16} /> Freigaben nicht lesbar: {err.message.slice(0, 160)}</div>;
  const ds: any[] = drafts.data ?? [];
  const evs: any[] = events.data ?? [];
  return (
    <>
      <Fold id="versand-entwuerfe" title="Entwürfe" sum={ds.length ? `${ds.length} offen` : "keine offen"}>
      <div className="klist card">
        {ds.map((m) => {
          const bad: string[] = m.check_errors ?? [];
          return (
            <div key={m.id} className="kcard stack">
              <span className="cn" title={m.subject}>{m.subject}</span>
              <span className="cm">
                <span className="pill t-next">{m.experiments?.segment_id ?? "–"}/{m.prospects?.country ?? "–"}</span>
                <span>{m.prospects?.company_name ?? m.to_email}</span>
                {bad.length > 0 && <span className="pill t-red" title={bad.join("; ")}>Prüfung: {bad.length}</span>}
                <span className="ca">{berlin(m.created_at)}</span>
              </span>
              <details className="why">
                <summary>Text · {m.to_email}</summary>
                <pre>{m.body}</pre>
                {bad.length > 0 && <p className="bad">{bad.join("; ")}</p>}
              </details>
              <span className="acts2">
                <form action={approveDraft}><input type="hidden" name="id" value={m.id} />
                  <button className="primary" disabled={bad.length > 0} title={bad.length ? "erst ohne Prüffehler" : "zum Versand freigeben"}><Icon name="ok" size={14} /> Freigeben</button></form>
                <form action={rejectDraft} className="acts2"><input type="hidden" name="id" value={m.id} />
                  <input name="reason" placeholder="Grund" aria-label="Grund (optional)" maxLength={200} />
                  <button><Icon name="fehler" size={14} /> Ablehnen</button></form>
              </span>
            </div>
          );
        })}
        {ds.length === 0 && <div className="muted">Keine offenen Entwürfe.</div>}
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
            {evs.length === 0 && <li className="muted">Noch keine Ereignisse.</li>}
          </ul>
        </Fold>
      </div>
    </>
  );
}

import { db } from "@/lib/supabase";
import { approveDraft, logReply, rejectDraft, requireOwner } from "./actions";
import { BrainSection } from "./brain-section";

export const dynamic = "force-dynamic";

const pct = (n: number, d: number) => (d > 0 ? `${((100 * n) / d).toFixed(1)} %` : "–");

export default async function Dashboard() {
  await requireOwner();
  const sb = db();
  const [segments, stats, drafts, events, suppression] = await Promise.all([
    sb.from("segments").select("*").order("id"),
    sb.from("experiment_stats").select("*"),
    sb
      .from("messages")
      .select("id, to_email, subject, body, check_errors, created_at, prospects(company_name, country), experiments(segment_id, variant)")
      .eq("status", "draft")
      .order("created_at")
      .limit(50),
    sb
      .from("email_events")
      .select("id, type, note, occurred_at, messages(to_email)")
      .in("type", ["reply", "reply_positive", "reply_negative", "sample_requested", "unsubscribed", "complained", "bounced"])
      .order("occurred_at", { ascending: false })
      .limit(20),
    sb.from("suppression").select("id", { count: "exact", head: true }),
  ]);

  const err = [segments, stats, drafts, events].find((r) => r.error)?.error;
  if (err) return <main><h1>Fehler</h1><p className="bad">{err.message}</p></main>;

  return (
    <main>
      <h1>Signalwerk</h1>
      <p className="muted">Gesperrte Einträge: {suppression.count ?? 0}</p>

      <BrainSection />

      <h2>Experimente</h2>
      <div className="scroll">
        <table>
          <thead>
            <tr>
              <th>Segment</th><th>Land</th><th>Botschaft</th><th>Status</th><th>Gesendet</th><th>Zugestellt</th>
              <th>Bounce</th><th>Beschwerden</th><th>Antworten</th><th>Positiv</th><th>Proben</th><th>Kunden</th><th>Entscheidung</th>
            </tr>
          </thead>
          <tbody>
            {(stats.data ?? []).map((s: any) => (
              <tr key={s.experiment_id}>
                <td>{s.segment_id}</td><td>{s.country}</td><td>{s.variant}</td><td>{s.status}</td>
                <td>{s.sent}</td><td>{s.delivered}</td>
                <td className={s.bounced / Math.max(s.sent, 1) > 0.03 ? "bad" : ""}>{s.bounced} ({pct(s.bounced, s.sent)})</td>
                <td className={s.complained > 0 ? "bad" : ""}>{s.complained}</td>
                <td>{s.replies}</td><td>{s.positive} ({pct(s.positive, s.delivered)})</td>
                <td>{s.samples}</td><td>{s.customers}</td><td>{s.decision ?? "–"}</td>
              </tr>
            ))}
            {(stats.data ?? []).length === 0 && <tr><td colSpan={13} className="muted">Noch keine Experimente.</td></tr>}
          </tbody>
        </table>
      </div>

      <h2>Segmente</h2>
      <div className="scroll">
        <table>
          <thead><tr><th>Nr.</th><th>Käufer</th><th>Länder (Mail)</th><th>Status</th></tr></thead>
          <tbody>
            {(segments.data ?? []).map((s: any) => (
              <tr key={s.id}><td>{s.id}</td><td>{s.name}</td><td>{s.email_countries.join(", ") || "keine"}</td><td>{s.status}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>Entwürfe zur Freigabe ({drafts.data?.length ?? 0})</h2>
      {(drafts.data ?? []).map((m: any) => (
        <div className="card" key={m.id}>
          <div className="muted">
            {m.experiments?.segment_id}/{m.experiments?.variant} · {m.prospects?.company_name} ({m.prospects?.country}) · {m.to_email}
          </div>
          <strong>{m.subject}</strong>
          <pre>{m.body}</pre>
          {m.check_errors?.length > 0 && <p className="bad">Prüfung: {m.check_errors.join("; ")}</p>}
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

      <h2>Antwort erfassen</h2>
      <form action={logReply} className="row">
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

      <h2>Letzte Antworten und Ereignisse</h2>
      <div className="scroll">
        <table>
          <thead><tr><th>Wann</th><th>Typ</th><th>Adresse</th><th>Notiz</th></tr></thead>
          <tbody>
            {(events.data ?? []).map((e: any) => (
              <tr key={e.id}>
                <td>{new Date(e.occurred_at).toLocaleString("de-DE")}</td><td>{e.type}</td>
                <td>{e.messages?.to_email ?? "–"}</td><td>{e.note ?? ""}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}

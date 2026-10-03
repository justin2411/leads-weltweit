import { notFound } from "next/navigation";
import { loadCompany } from "@/lib/dashboard-data";
import { COUNTRY_COLOR, berlin } from "@/lib/dashboard-logic";
import { requireOwner } from "../../actions";
import { Back, Crumbs, Ctrl } from "../../v2";
import { contactMakeCustomer, contactNote, contactReply, contactStopFollowups, contactSuppress } from "../../control-actions";
import { PACKAGES } from "@/lib/owner-settings";

const KIND: Record<string, string> = { initial: "Erstmail", followup: "Nachfassmail", sample_followup: "Nachfrage zur Probe" };
const EV: Record<string, [string, string]> = {
  reply: ["Antwort", "t-blue"], reply_positive: ["Antwort: positiv", "t-gold"], reply_negative: ["Antwort: kein Interesse", "t-grey"],
  sample_requested: ["Probe gesendet", "t-gold"], unsubscribed: ["Abgemeldet", "t-grey"], complained: ["Spam-Beschwerde", "t-red"],
  bounced: ["Bounce", "t-red"], auto_reply: ["Abwesenheitsnotiz", "t-grey"], delivered: ["zugestellt", "t-grey"], failed: ["fehlgeschlagen", "t-red"],
};

/** Verlauf einer Firma: alle Mails, Antworten, Proben und ein Abo – zeitlich sortiert. */
export default async function Company({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const data = await loadCompany(id);
  if (!data) notFound();
  const { prospect: p, messages, events, web, customers, notes, suppressed } = data;
  const here = `/dashboard/kontakte/${p.id}`;
  const sent = (messages as any[]).some((m) => m.status === "sent");
  const pendingFollowups = (messages as any[]).filter((m) => m.kind !== "initial" && ["draft", "approved"].includes(m.status)).length;
  const items: { at: string; label: string; cls: string; text?: string }[] = [];
  for (const m of messages as any[]) {
    if (m.sent_at) items.push({ at: m.sent_at, label: KIND[m.kind] ?? m.kind, cls: "t-next", text: m.subject });
    else items.push({ at: m.created_at, label: `${KIND[m.kind] ?? m.kind} (${m.status === "approved" ? "geplant" : m.status === "draft" ? "Entwurf" : "gestoppt"})`, cls: "t-grey", text: m.subject });
  }
  for (const e of events as any[]) {
    if (e.type === "sent" || e.type === "delivery_delayed") continue;
    const [l, c] = EV[e.type] ?? [e.type, "t-grey"];
    items.push({ at: e.occurred_at, label: l, cls: c, text: e.note ?? undefined });
  }
  for (const r of web as any[]) {
    items.push({ at: r.created_at, label: "Probe angefordert (Website)", cls: "t-gold" });
    if (r.sent_at) items.push({ at: r.sent_at, label: "Probe gesendet (Website)", cls: "t-gold" });
  }
  for (const c of customers as any[]) items.push({ at: c.created_at, label: `Kunde (${c.status})`, cls: "t-green" });
  for (const n of notes) items.push({ at: n.created_at, label: "Notiz", cls: "t-next", text: n.note });
  items.sort((a, b) => (a.at < b.at ? 1 : -1));

  return (
    <div className="v2">
      <Crumbs items={[["Übersicht", "/dashboard"], ["Kontakte", "/dashboard/kontakte"], [p.company_name, ""]]} />
      <div className="card firm">
        <h1>{p.company_name}</h1>
        <div className="cm">
          <i style={{ background: COUNTRY_COLOR[p.country] ?? "#c3bcae" }} />{p.country}
          {p.website ? <a href={p.website.startsWith("http") ? p.website : `https://${p.domain}`} target="_blank" rel="noreferrer noopener">{p.domain}</a> : <span>{p.domain}</span>}
          {p.legal_form && <span className="muted">{p.legal_form}</span>}
        </div>
      </div>
      <ol className="timeline card">
        {items.map((it, i) => (
          <li key={i}>
            <span className="tt">{berlin(it.at)}</span>
            <span className={`pill ${it.cls}`}>{it.label}</span>
            {it.text && <span className="tx" title={it.text}>{it.text}</span>}
          </li>
        ))}
        {items.length === 0 && <li className="muted">noch nichts passiert</li>}
      </ol>

      <h2 className="h2s">Aktionen</h2>
      <div className="ctrls">
        <Ctrl title="Antwort erfassen" tip="Antwort, die nicht automatisch erkannt wurde, von Hand eintragen (zählt in den Kennzahlen).">
          <form action={contactReply}>
            <Back to={here} /><input type="hidden" name="prospect" value={p.id} />
            <div className="acts2">
              <button name="kind" value="reply_positive" disabled={!sent} className="primary">positiv</button>
              <button name="kind" value="reply" disabled={!sent}>Frage</button>
              <button name="kind" value="reply_negative" disabled={!sent}>negativ</button>
            </div>
            <input name="note" placeholder="kurz, was sie gesagt haben" maxLength={500} />
          </form>
        </Ctrl>
        <Ctrl title="Nachfass" tip="Geplante Nachfassmails an diese Firma stoppen (es kommt auch keine neue).">
          <form action={contactStopFollowups}>
            <Back to={here} /><input type="hidden" name="prospect" value={p.id} />
            <button disabled={!sent}>Nachfass stoppen</button>
            <span className="hint">{pendingFollowups} geplant</span>
          </form>
        </Ctrl>
        <Ctrl title="Als Kunde" tip={`Legt Kunde + Abo an (Preise: Starter ${PACKAGES.starter.price}, Pro ${PACKAGES.pro.price} pro Monat in Landeswährung). Erste Lieferung braucht deine Freigabe.`}>
          <form action={contactMakeCustomer}>
            <Back to={here} /><input type="hidden" name="prospect" value={p.id} />
            <input name="email" type="email" placeholder={p.email ?? "Rechnungs-E-Mail"} />
            <div className="acts2">
              <button name="pkg" value="starter">Starter</button>
              <button name="pkg" value="pro">Pro</button>
            </div>
          </form>
        </Ctrl>
        <Ctrl title="Sperren" tip="Adresse und Domain dauerhaft auf die Sperrliste. Kann nicht rückgängig gemacht werden.">
          {suppressed ? <span className="hint">gesperrt ({(suppressed as any).reason})</span> : (
            <form action={contactSuppress}>
              <Back to={here} /><input type="hidden" name="prospect" value={p.id} />
              <label className="hint"><input type="checkbox" name="confirm" value="ja" /> wirklich dauerhaft sperren</label>
              <button className="danger">Dauerhaft sperren</button>
            </form>
          )}
        </Ctrl>
        <Ctrl title="Notiz" tip="Nur für dich sichtbar.">
          <form action={contactNote}>
            <Back to={here} /><input type="hidden" name="prospect" value={p.id} />
            <textarea name="note" rows={2} maxLength={2000} required />
            <button>Speichern</button>
          </form>
        </Ctrl>
      </div>
    </div>
  );
}

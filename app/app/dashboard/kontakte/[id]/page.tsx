import { notFound } from "next/navigation";
import { loadCompany } from "@/lib/dashboard-data";
import { COUNTRY_COLOR, berlin } from "@/lib/dashboard-logic";
import { requireOwner } from "../../actions";
import { Crumbs } from "../../v2";

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
  const { prospect: p, messages, events, web, customers } = data;
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
    </div>
  );
}

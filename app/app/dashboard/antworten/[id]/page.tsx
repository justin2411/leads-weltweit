import Link from "next/link";
import { notFound } from "next/navigation";
import { loadReply } from "@/lib/antworten-data";
import { STATUS_LABEL, answerLang, firstLines, intentMeta, isStatus, isUuid } from "@/lib/antworten";
import { COUNTRY_COLOR, berlin } from "@/lib/dashboard-logic";
import { Icon } from "@/app/icons";
import { requireOwner } from "../../actions";
import { Crumbs } from "../../v2";
import { markBuyInterest, sendAnswer, sendSample, setReplyStatus, suppressReply } from "../actions";
import { Age } from "../age";
import { ANTWORTEN_CSS } from "../css";
import { Submit } from "../submit";

const KIND: Record<string, string> = { initial: "Erstmail", followup: "Nachfassmail", sample_followup: "Nachfrage zur Probe" };
const EV: Record<string, string> = {
  reply: "Antwort", reply_positive: "Antwort: positiv", reply_negative: "Antwort: kein Interesse", sample_requested: "Probe gesendet",
  unsubscribed: "Abgemeldet", complained: "Spam-Beschwerde", bounced: "Bounce", auto_reply: "Abwesenheitsnotiz", failed: "fehlgeschlagen",
};
const DONE: Record<string, string> = {
  antwort_gesendet: "Antwort gesendet", probe_gesendet: "Probe gesendet", gesperrt: "Gesperrt", kaufinteresse: "Kaufinteresse erfasst",
};

/** Eine Antwort: Text, unsere Mail, Firma, Verlauf und die Aktionen mit einem Klick. */
export default async function Antwort({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await loadReply(id);
  if (!data) notFound();
  const { reply: r, company, others, stock } = data;
  const p = r.prospects;
  const m = intentMeta(r.intent);
  const open = r.status === "offen";
  const suppressed = !!company?.suppressed;
  const lang = answerLang(p?.country, r.messages?.language);
  const cc = p?.country ?? null;

  // Verlauf wie unter Kontakte (neueste zuerst, kurz)
  const hist: { at: string; label: string; text?: string }[] = [];
  for (const x of (company?.messages ?? []) as any[]) if (x.sent_at) hist.push({ at: x.sent_at, label: KIND[x.kind] ?? x.kind, text: x.subject });
  for (const e of (company?.events ?? []) as any[]) if (EV[e.type]) hist.push({ at: e.occurred_at, label: EV[e.type], text: e.note ?? undefined });
  for (const w of (company?.web ?? []) as any[]) if (w.sent_at) hist.push({ at: w.sent_at, label: "Probe (Website)" });
  for (const n of company?.notes ?? []) hist.push({ at: n.created_at, label: "Notiz", text: n.note });
  hist.sort((a, b) => (a.at < b.at ? 1 : -1));

  const sampleWhy = !p?.segment_id ? "Firma unbekannt" : suppressed ? "gesperrt" : stock == null ? "Vorrat unbekannt" : stock < 1 ? `kein Vorrat ${cc}` : `Vorrat ${stock}`;
  const canSample = !!p?.segment_id && !suppressed && (stock ?? 0) > 0;
  const hidden = <input type="hidden" name="id" value={r.id} />;

  return (
    <div className="v2 aw">
      <style dangerouslySetInnerHTML={{ __html: ANTWORTEN_CSS }} />
      <Crumbs items={[["Antworten", "/dashboard/antworten"], [p?.company_name ?? r.from_email ?? "Antwort", ""]]} />

      <div className="aw-top">
        <h1>{p?.company_name ?? r.from_email ?? "Unbekannt"}</h1>
        <div className="aw-tags">
          <span className={`aw-chip ${m.tone}`}><Icon name={m.icon} size={14} /> {m.label}</span>
          <Age received={r.received_at} processed={r.processed_at} urgent={m.urgent} open={open} />
          {cc && <span className="aw-cc"><i style={{ background: COUNTRY_COLOR[cc] ?? "#c3bcae" }} />{cc}</span>}
          {isStatus(r.status) && r.status !== "offen" && <span className="aw-chip grey">{STATUS_LABEL[r.status]}</span>}
          {suppressed && <span className="aw-chip grey"><Icon name="abmeldung" size={14} /> gesperrt</span>}
        </div>
      </div>

      {r.owner_action === "probe_unklar" && (
        <div className="aw-done"><Icon name="achtung" size={18} /> Probe-Versand unklar – im Postfach prüfen · {berlin(r.owner_action_at)}</div>
      )}
      {r.owner_action && DONE[r.owner_action] && (
        <div className="aw-done"><Icon name="ok-kreis" size={18} /> {DONE[r.owner_action]} · {berlin(r.owner_action_at)}</div>
      )}

      <div className="aw-detail">
        <div>
          <section className="aw-box">
            <h2><Icon name="mail" size={14} /> Ihre Antwort</h2>
            <p className="aw-from">{r.from_email ?? "–"} · {berlin(r.received_at ?? r.processed_at)}</p>
            {r.subject && <p className="aw-subj">{r.subject}</p>}
            <div className="aw-text">{r.body_text || "(kein Text)"}</div>
            {r.summary_de && <p className="aw-sumline">{r.summary_de}</p>}
          </section>

          <section className="aw-box">
            <h2><Icon name="antwort" size={14} /> Antworten · {lang.toUpperCase()}</h2>
            <form action={sendAnswer} className="aw-form">
              {hidden}
              <textarea name="text" defaultValue={r.draft_text ?? ""} maxLength={5000} required aria-label="Antworttext"
                        placeholder={lang === "fr" ? "Bonjour, …" : "Hello, …"} />
              <span className="aw-hint">Ohne Preise, Beträge, Garantien · Fußzeile kommt automatisch</span>
              <Submit className="go" disabled={suppressed || !r.from_email}><Icon name="versand" size={18} /> Antwort senden</Submit>
            </form>
          </section>
        </div>

        <div>
          <div className="aw-acts">
            <form action={sendSample}>
              {hidden}
              <Submit className="gold" disabled={!canSample}><Icon name="proben" size={20} /> Probe senden<small>{sampleWhy}</small></Submit>
            </form>
            <form action={markBuyInterest}>
              {hidden}
              <Submit disabled={r.owner_action === "kaufinteresse"}><Icon name="stern" size={20} /> Kaufinteresse<small>zählt als positiv</small></Submit>
            </form>
            {r.status !== "spaeter" && (
              <form action={setReplyStatus}>
                {hidden}<input type="hidden" name="status" value="spaeter" />
                <Submit><Icon name="warten" size={20} /> Später</Submit>
              </form>
            )}
            {r.status !== "erledigt" ? (
              <form action={setReplyStatus}>
                {hidden}<input type="hidden" name="status" value="erledigt" />
                <Submit><Icon name="ok" size={20} /> Erledigt</Submit>
              </form>
            ) : (
              <form action={setReplyStatus}>
                {hidden}<input type="hidden" name="status" value="offen" />
                <Submit><Icon name="rueckgaengig" size={20} /> Wieder offen</Submit>
              </form>
            )}
          </div>

          {!suppressed && r.from_email && (
            <details className="aw-danger">
              <summary><Icon name="abmeldung" size={16} /> Sperren</summary>
              <form action={suppressReply}>
                {hidden}
                <label className="aw-chk"><input type="checkbox" name="confirm" value="ja" required /> {r.from_email} dauerhaft sperren</label>
                <Submit className="red"><Icon name="abmeldung" size={18} /> Dauerhaft sperren</Submit>
              </form>
            </details>
          )}

          {r.messages && (
            <details className="aw-box aw-more">
              <summary><h2><Icon name="versand" size={14} /> Unsere Mail · {berlin(r.messages.sent_at)}</h2><Icon name="weiter" size={14} /></summary>
              <p className="aw-subj">{r.messages.subject}</p>
              <div className="aw-text">{firstLines(r.messages.body, 6, 480)}</div>
            </details>
          )}

          {p && (
            <section className="aw-box">
              <h2><Icon name="kontakte" size={14} /> Firma</h2>
              <dl className="aw-facts">
                <dt>Domain</dt><dd>{p.website ? <a href={p.website.startsWith("http") ? p.website : `https://${p.domain}`} target="_blank" rel="noreferrer noopener">{p.domain}</a> : (p.domain ?? "–")}</dd>
                {p.legal_form && <><dt>Form</dt><dd>{p.legal_form}</dd></>}
                {p.email && p.email !== r.from_email && <><dt>Mail</dt><dd>{p.email}</dd></>}
                <dt>Verlauf</dt><dd><Link href={`/dashboard/kontakte/${r.prospect_id}`}>ganzer Kontakt <Icon name="weiter" size={12} /></Link></dd>
              </dl>
            </section>
          )}

          {(hist.length > 0 || others.length > 0) && (
            <section className="aw-box">
              <h2><Icon name="uhr" size={14} /> Verlauf</h2>
              <ol className="aw-hist">
                {others.map((o) => (
                  <li key={o.id}><span className="tt">{berlin(o.received_at ?? o.processed_at)}</span>
                    <Link className="tx" href={`/dashboard/antworten/${o.id}`}>{intentMeta(o.intent).label}: {o.summary_de ?? "Antwort"}</Link></li>
                ))}
                {hist.slice(0, 10).map((h, i) => (
                  <li key={i}><span className="tt">{berlin(h.at)}</span><span className="tx" title={h.text}>{h.label}{h.text ? ` · ${h.text}` : ""}</span></li>
                ))}
              </ol>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}

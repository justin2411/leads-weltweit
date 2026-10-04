import { notFound } from "next/navigation";
import { Fragment, type CSSProperties } from "react";
import { loadCustomerAgent } from "@/lib/customer-agents-data";
import { avatarHue, fullName, goalChips, initials, kpiOf, roleDe, statusLabel } from "@/lib/customer-agents";
import { isUuid } from "@/lib/antworten";
import { agentStartLabel } from "@/lib/agents";
import { COUNTRY_COLOR, berlin } from "@/lib/dashboard-logic";
import { Icon } from "@/app/icons";
import { requireOwner } from "../../actions";
import { Crumbs } from "../../v2";
import { Submit } from "../../antworten/submit";
import { ANTWORTEN_CSS } from "../../antworten/css";
import { addAgentNote, setAgentPaused } from "../actions";
import { KA_CSS } from "../css";

type V = CSSProperties & Record<`--${string}`, string | number>;
const WHO = { in: "Kunde", out: "Agent", notiz: "Inhaber → Agent" } as const;
const MSG_STATUS: Record<string, string> = { entwurf: "Entwurf", fehler: "Fehler beim Senden" };
const PROFILE: [string, string][] = [["zielgruppe", "Zielgruppe"], ["leistungen", "Leistungen"], ["ziele", "Ziele"], ["signale", "Signale"], ["regionen", "Regionen"], ["notizen", "Notizen"]];
const TASK_STATUS: Record<string, string> = { offen: "startet bald", laeuft: "läuft", fertig: "fertig", fehler: "Fehler", abgebrochen: "zurückgezogen" };

const show = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v && typeof v === "object" ? Object.values(v).join(", ") : String(v ?? "")).trim();

/** Ein Kunden-Agent: Verlauf als Chat, Profil (Ziele, Zielgruppe), Hinweis an den Agenten, Pausieren/Fortsetzen. */
export default async function KundenAgent({ params }: { params: Promise<{ id: string }> }) {
  await requireOwner();
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const data = await loadCustomerAgent(id);
  if (!data) notFound();
  const { agent: a, customer: c, sub, messages, tasks } = data;
  const name = fullName(a.persona) || "Agent";
  const k = kpiOf(a.kpis);
  const goals = goalChips(a.profile, 8);
  const cc = c?.country ?? null;
  const paused = a.status === "pausiert";
  const hidden = <input type="hidden" name="id" value={a.id} />;

  return (
    <div className="v2 aw ka">
      <style dangerouslySetInnerHTML={{ __html: ANTWORTEN_CSS + KA_CSS }} />
      <Crumbs items={[["Kunden-Agenten", "/dashboard/kunden-agenten"], [name, ""]]} />

      <div className="ka-top">
        <span className="ka-av big" style={{ "--h": avatarHue(a.persona) } as V} aria-hidden>{initials(a.persona)}</span>
        <div>
          <h1>{name}</h1>
          <div className="ka-line">
            <span>{roleDe(a.persona)}</span>
            <span className={`ka-chip st-${a.status}`}>{statusLabel(a.status)}{paused && a.paused_by === "abo" ? " · Abo" : ""}</span>
            {a.mail_opt_out && <span className="ka-chip st-pausiert"><Icon name="abmeldung" size={13} /> keine Agenten-Mails</span>}
          </div>
          <div className="ka-line">
            <Icon name="kunde" size={15} /> {c?.company_name ?? "Kunde unbekannt"}
            {cc && <span className="aw-cc"><i style={{ background: COUNTRY_COLOR[cc] ?? "#c3bcae" }} />{cc}</span>}
            {sub?.package && <span>· {sub.package}</span>}
          </div>
        </div>
      </div>

      <div className="ka-detail">
        <div>
          <section className="ka-box">
            <h2><Icon name="antworten" size={14} /> Verlauf</h2>
            {messages.length ? (
              <ol className="ka-chat">
                {messages.map((m) => (
                  <li key={m.id} className={`ka-msg ${m.direction}`}>
                    <div className="mh"><b>{m.direction === "out" ? name : WHO[m.direction] ?? m.direction}</b><span>{berlin(m.created_at)}</span>
                      {m.channel === "mail" && <Icon name="mail" size={12} title="Mail" />}
                      {m.status && MSG_STATUS[m.status] && <span className="mx">{MSG_STATUS[m.status]}</span>}</div>
                    {m.subject && m.direction !== "notiz" && <p className="ms">{m.subject}</p>}
                    <p className="mb">{m.body || "–"}</p>
                  </li>
                ))}
              </ol>
            ) : <p className="ka-hint">Noch kein Austausch. Der Agent stellt sich vor und fragt nach Zielen und Zielgruppe.</p>}
          </section>

          <section className="ka-box">
            <h2><Icon name="an-agent" size={14} /> Hinweis an {a.persona?.first_name ?? "Agent"}</h2>
            <form action={addAgentNote} className="ka-form">
              {hidden}
              <textarea name="text" required minLength={3} maxLength={800} aria-label="Hinweis an den Agenten" placeholder="z. B. mehr Handwerker, weniger Einzelunternehmer" />
              <span className="ka-hint">Nur intern · der Agent übernimmt es mit der nächsten Runde</span>
              <Submit className="go"><Icon name="an-agent" size={18} /> Hinweis geben</Submit>
            </form>
          </section>
        </div>

        <div>
          <section className="ka-box">
            <h2><Icon name="statistik" size={14} /> Für den Kunden</h2>
            <div className="ka-kpi" style={{ borderTop: 0, paddingTop: 0 }}>
              <div><b>{k.rueckmeldungen}</b><span>Rückmeldungen</span></div>
              <div><b>{k.gute_leads}</b><span>gute Leads</span></div>
              <div><b>{k.abschluesse}</b><span>Abschlüsse</span></div>
            </div>
          </section>

          <section className="ka-box">
            <h2><Icon name="kaeufer" size={14} /> Profil</h2>
            {goals.length > 0 && <div className="ka-tags" style={{ marginBottom: 10 }}>{goals.map((g) => <span key={g}>{g}</span>)}</div>}
            <dl className="ka-facts">
              {PROFILE.map(([key, label]) => {
                const v = show((a.profile ?? {})[key]);
                return v ? <Fragment key={key}><dt>{label}</dt><dd>{v}</dd></Fragment> : null;
              })}
              <dt>Steckbrief</dt><dd>{a.persona?.bio ?? "–"}</dd>
              <dt>Sprache</dt><dd>{a.persona?.lang === "fr" ? "Französisch" : "Englisch"}</dd>
              <dt>Letzter Kontakt</dt><dd>{a.last_contact_at ? berlin(a.last_contact_at) : "–"}</dd>
              <dt>Nächste Nachfrage</dt><dd>{a.next_checkin_at ? berlin(a.next_checkin_at) : "–"}</dd>
              <dt>Seit</dt><dd>{berlin(a.created_at)}</dd>
            </dl>
          </section>

          {tasks.length > 0 && (
            <section className="ka-box">
              <h2><Icon name="agent" size={14} /> Aufträge</h2>
              <ul className="ka-tasks">{tasks.slice(0, 6).map((t) => (
                <li key={t.id} title={t.result ?? t.brief}><span className="tt">{berlin(t.created_at)}</span><span className="tx">{t.status === "offen" ? `startet um ${agentStartLabel(new Date())}` : TASK_STATUS[t.status] ?? t.status}{t.result ? ` · ${t.result}` : ""}</span></li>
              ))}</ul>
            </section>
          )}

          <form action={setAgentPaused}>
            {hidden}<input type="hidden" name="paused" value={paused ? "0" : "1"} />
            <Submit className={paused ? "go" : ""}><Icon name={paused ? "start" : "pause"} size={18} /> {paused ? "Fortsetzen" : "Pausieren"}</Submit>
          </form>
          <p className="ka-lock"><Icon name="schloss" size={13} /> Immer als KI erkennbar · nennt nie Preise oder Garantien · Lieferungen laufen auch pausiert weiter</p>
        </div>
      </div>
    </div>
  );
}

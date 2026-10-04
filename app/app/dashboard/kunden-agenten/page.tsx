import Link from "next/link";
import type { CSSProperties } from "react";
import { loadCustomerAgents, type AgentCustomer, type AgentMessage, type AgentSubscription, type CustomerAgent } from "@/lib/customer-agents-data";
import { avatarHue, fullName, goalChips, initials, kpiOf, roleDe, statusLabel } from "@/lib/customer-agents";
import { COUNTRY_COLOR, berlin } from "@/lib/dashboard-logic";
import { Icon, type IconName } from "@/app/icons";
import { requireOwner } from "../actions";
import { Leer, PageHead } from "../v2";
import { KA_CSS } from "./css";

type V = CSSProperties & Record<`--${string}`, string | number>;
const DIR: Record<string, [IconName, string]> = { in: ["antwort", "Kunde"], out: ["versand", "Agent"], notiz: ["an-agent", "Hinweis"] };

/**
 * Kunden-Agenten (Inhaber 04.10.2026): jeder Kunde ab Pro hat einen KI-Ansprechpartner. Karten mit Name, Kunde, Status,
 * Zielen in Stichworten, letzter Nachricht und den Kennzahlen des Kunden (Rückmeldungen, gute Leads, Abschlüsse).
 */
export default async function KundenAgenten() {
  await requireOwner();
  const res = await loadCustomerAgents().then((r) => ({ ...r, error: null as string | null }))
    .catch((e) => ({ agents: [] as CustomerAgent[], customers: new Map<string, AgentCustomer>(), subs: new Map<string, AgentSubscription>(),
      last: new Map<string, AgentMessage>(), error: String((e as Error)?.message ?? e) }));
  const { agents, customers, subs, last, error } = res;
  const active = agents.filter((a) => a.status !== "pausiert").length;

  return (
    <div className="v2 aw ka">
      <style dangerouslySetInnerHTML={{ __html: KA_CSS }} />
      <PageHead title="Kunden-Agenten" icon="ansprechpartner" sub="Ab Pro · KI-Ansprechpartner je Kunde · Ziel: bessere Leads und Umsatz für den Kunden">
        {agents.length > 0 && <span className="ka-chip st-aktiv">{active} aktiv</span>}
      </PageHead>
      {error && <div className="ka-err" role="alert"><Icon name="fehler" size={16} /> Nicht lesbar: {error.slice(0, 160)}</div>}

      <div className="ka-grid">
        {agents.map((a) => {
          const c = customers.get(a.customer_id);
          const s = subs.get(a.subscription_id);
          const m = last.get(a.id);
          const goals = goalChips(a.profile, 4);
          const k = kpiOf(a.kpis);
          const cc = c?.country ?? null;
          return (
            <Link key={a.id} href={`/dashboard/kunden-agenten/${a.id}`} className={`ka-card st-${a.status}`}>
              <div className="ka-who">
                <span className="ka-av" style={{ "--h": avatarHue(a.persona) } as V} aria-hidden>{initials(a.persona)}</span>
                <span className="ka-nm"><b>{fullName(a.persona) || "Agent"}</b><span>{roleDe(a.persona)}{s?.package ? ` · ${s.package}` : ""}</span></span>
                <span className={`ka-chip st-${a.status}`}>{statusLabel(a.status)}</span>
              </div>
              <div className="ka-co">
                <Icon name="kunde" size={15} />
                <span>{c?.company_name ?? "Kunde unbekannt"}</span>
                {cc && <><i style={{ background: COUNTRY_COLOR[cc] ?? "#c3bcae" }} />{cc}</>}
              </div>
              <div className="ka-tags">{goals.length ? goals.map((g) => <span key={g}>{g}</span>) : <em>Ziele noch offen</em>}</div>
              <div className="ka-last">
                {m ? <>
                  <Icon name={DIR[m.direction]?.[0] ?? "mail"} size={15} title={DIR[m.direction]?.[1]} />
                  <span className="tx">{m.subject || m.body || "–"}</span>
                  <span className="tt">{berlin(m.created_at)}</span>
                </> : <><Icon name="warten" size={15} /><span className="tx">noch keine Nachricht</span><span /></>}
              </div>
              <div className="ka-kpi">
                <div><b>{k.rueckmeldungen}</b><span>Rückmeldungen</span></div>
                <div><b>{k.gute_leads}</b><span>gute Leads</span></div>
                <div><b>{k.abschluesse}</b><span>Abschlüsse</span></div>
              </div>
            </Link>
          );
        })}
      </div>
      {!error && agents.length === 0 && (
        <Leer icon="ansprechpartner" text="Noch keine – jeder Kauf ab Pro legt einen an." />
      )}
    </div>
  );
}

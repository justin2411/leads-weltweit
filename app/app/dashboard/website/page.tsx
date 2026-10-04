import { agentStartLabel } from "@/lib/agents";
import { chatTime, type ChatMessage } from "@/lib/jarvis-chat";
import { siteUrl } from "@/lib/site";
import { totalScore } from "@/lib/website";
import { isMissingTable, loadWebsite, websiteMessages, websiteSession, type WebsiteData } from "@/lib/website-data";
import { loadOwnerSettings } from "@/lib/dashboard-data";
import { Icon } from "@/app/icons";
import { requireOwner } from "../actions";
import { Crumbs } from "../v2";
import { JCHAT_CSS } from "../jarvis/chat/css";
import { WebsiteAgents } from "./agents";
import { WebsiteChat } from "./chat";
import { Health } from "./health";
import { WS_CSS } from "./css";

const OWN = "https://www.nextgen-profit.de";

/**
 * Themenfeld „Website“ (Inhaber 04.10.2026: „die website als themenfeld mit aufzunehmen nach kunden agenten … agenten
 * erstellen, die anpassungen an der website übernehmen … chatfeld, dass ich änderungswünsche direkt dort posten kann“).
 * Kopf: Gesundheit als Ringe je Bereich (letzter Website-Check), darunter Chatfeld „Änderungswunsch“ und Website-Agenten.
 */
export default async function WebsitePage() {
  await requireOwner();
  const now = new Date();
  const [data, own]: [WebsiteData, Awaited<ReturnType<typeof loadOwnerSettings>>] = await Promise.all([
    loadWebsite().catch((e) => ({ check: null, history: [], agents: [], tasks: {}, fixes: [], missing: isMissingTable(e), error: String((e as Error)?.message ?? e) })),
    loadOwnerSettings(),
  ]);
  const startAt = agentStartLabel(now);
  let messages: ChatMessage[] = [];
  let chatMissing = data.missing;
  try {
    const s = await websiteSession(false);
    if (s) messages = await websiteMessages(s.id);
  } catch (e) {
    chatMissing = chatMissing || isMissingTable(e);
    if (!isMissingTable(e)) console.error("website chat:", e);
  }
  // Nur die eigene Domain zeigen/verlinken (Vorschau-Deployments haben eine andere Adresse)
  const site = data.check?.site?.startsWith("https://") ? data.check.site : siteUrl().startsWith("https://") ? siteUrl() : OWN;
  const total = totalScore(data.check);

  return (
    <div className="v2 aw ws">
      <style dangerouslySetInnerHTML={{ __html: JCHAT_CSS + WS_CSS }} />
      <Crumbs items={[["JARVIS", "/dashboard/jarvis"], ["Website", ""]]} />
      <div className="ws-head">
        <h1><Icon name="website" size={22} /> Website</h1>
        <a className="ws-open" href="/dashboard/website/auswertung"><Icon name="statistik" size={14} />Auswertung</a>
        <a className="ws-open" href="/dashboard/website/flow"><Icon name="pipeline" size={14} />Flow</a>
        <a className="ws-open" href={site} target="_blank" rel="noopener noreferrer"><Icon name="pfeil" size={14} />Öffnen</a>
      </div>
      {data.error && <div className="ws-err" role="alert"><Icon name="fehler" size={16} /> Nicht lesbar: {data.error.slice(0, 160)}</div>}

      <Health check={data.check} total={total} history={data.history} site={site}
        at={data.check ? `Check ${chatTime(data.check.at, now)}` : ""}
        fix={{ fixes: data.fixes, tasks: data.tasks, autofix: own.website_autofix !== false, ignored: own.website_ignored ?? {}, now: now.toISOString(), startAt }} />

      <div className="ws-cols">
        <WebsiteChat initial={messages} now={now.toISOString()} missing={chatMissing} />
        <WebsiteAgents agents={data.agents} tasks={data.tasks} now={now.toISOString()} startAt={startAt} missing={data.missing} />
      </div>
    </div>
  );
}

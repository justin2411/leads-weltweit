import "server-only";
import { db } from "@/lib/supabase";
import { brake, mailboxes, type Live } from "@/lib/dashboard-logic";
import { CONFIG, loadActivity, loadBoxHealth, loadLive, loadOwnerSettings, loadPlanLog, loadRuns } from "@/lib/dashboard-data";
import { judgeFlow, switchedOff, type FlowRow, type Still } from "@/lib/ueberblick";
import { totalScore, type SiteCheck } from "@/lib/website";
import type { Activity } from "@/lib/werke-live";
import { postfaecher, schalter, speicher, website, workflowZeilen, type BetriebLage, type Schalter } from "./betrieb";

/**
 * Daten der Betrieb-Seite (nur lesen). Workflows: GitHub-Läufe mit Token (loadRuns), sonst Spuren in der Datenbank.
 * Jede Quelle einzeln abgesichert – ein Ausfall zeigt „–“/grau, nie falsche Nullen.
 */
export type BetriebDaten = BetriebLage & { at: string; schalter: Schalter[]; mitToken: boolean };

const T = () => AbortSignal.timeout(5000);
const newest = (...ts: (string | null | undefined)[]) => ts.filter((x): x is string => !!x).sort().pop() ?? null;

/** Letzte Spur je Workflow in der Datenbank (ohne GitHub-Token). */
function dbSpuren(a: Activity): Record<string, string | null> {
  const beat = (w: string) => newest(...a.heartbeats.filter((h) => h.werk === w).map((h) => h.beat_at));
  return {
    "lead-werk.yml": newest(a.last_run["lead-werk"], beat("lead-werk")),
    "kunden-werk.yml": newest(a.last_run["kunden-werk"], beat("kunden-werk")),
    "proben-vorrat.yml": newest(a.last_run["proben-vorrat"], beat("proben-vorrat"), a.stock_last_built),
    "send.yml": a.last_sent_at,
  };
}

export async function loadBetrieb(): Promise<BetriebDaten> {
  const now = new Date();
  const [live, act, runs, health, plans, own, web, flow, domains] = await Promise.all([
    loadLive().catch(() => null as Live | null),
    loadActivity(),
    loadRuns().catch(() => null),
    loadBoxHealth(14),
    loadPlanLog(),
    loadOwnerSettings(),
    db().from("website_checks").select("at, scores").order("at", { ascending: false }).limit(1).abortSignal(T())
      .then((r) => (r.error ? null : ((r.data ?? [])[0] ?? null) as { at: string; scores: SiteCheck["scores"] } | null), () => null),
    db().rpc("datenfluss_stand").abortSignal(T()).then((r) => (r.error ? null : r.data as FlowRow[] | null), () => null),
    loadBoxHealth(14, "domain"),
  ]);
  const stop = live ? brake(live, CONFIG).stop : null;
  const plan = [plans["lead-werk"], plans["kunden-werk"]].filter((p) => !!p).sort((a, b) => b!.at.localeCompare(a!.at))[0] ?? null;
  const off = switchedOff({ lead_suche: CONFIG.lead_suche, kunden_suche: CONFIG.kunden_suche, versand_aktiv: CONFIG.versand.aktiv,
    werke_paused: own.werke_paused, send_paused: own.send_paused }, flow ?? []);
  const still: Still[] = flow ? judgeFlow(flow, now, off) : [];
  const score = web ? totalScore({ at: web.at, site: "", scores: web.scores ?? {}, funde: [], seiten: 0 }) : null;
  return {
    at: now.toISOString(),
    mitToken: runs !== null,
    workflows: workflowZeilen(CONFIG.workflows, runs, dbSpuren(act), now),
    boxen: live ? postfaecher(mailboxes(live, CONFIG), health) : [],
    domains: domains ?? [],
    speicher: speicher(plan?.db_bytes ?? (live?.db_size || null), plan?.bremse ?? null),
    web: website(score, web?.at ?? null, now),
    still,
    notbremse: stop,
    schalter: schalter({ versandAktiv: CONFIG.versand.aktiv, sendPaused: own.send_paused, followup: own.followup_enabled, werkePaused: own.werke_paused ?? {},
      leadSuche: CONFIG.lead_suche, kundenSuche: CONFIG.kunden_suche, autopilot: own.slot_autopilot?.on !== false, autofix: own.website_autofix !== false, notbremse: stop }),
  };
}

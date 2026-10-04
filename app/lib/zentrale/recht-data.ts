import "server-only";
import { db } from "@/lib/supabase";
import { siteUrl } from "@/lib/site";
import { CONFIG, loadOwnerSettings } from "@/lib/dashboard-data";
import { LEGAL } from "@/content/legal";
import opsConfig from "@/lib/ops-config.json";
import {
  abmeldeCheck, laender, offeneFragen, rechtstexte, sperren, type Check, type Frage, type Land, type RechtCfg, type Sperren, type Texte,
} from "./recht";

/**
 * Daten der Recht-Seite (nur lesen). Jede Quelle einzeln: Fehler → null, die Seite zeigt dann „–“ statt falscher Nullen.
 * Der Abmelde-Selbsttest ruft /api/unsubscribe mit einem ungültigen Token auf (404 erwartet) – er schreibt nichts.
 */
export type RechtDaten = {
  at: string; laender: Land[]; versandAn: boolean; sperren: Sperren | null; beschwerden30: number | null; beschwerdenGesamt: number | null;
  abmelde: Check; texte: Texte; fragen: Frage[];
};

const T = () => AbortSignal.timeout(5000);
const EMPTY: RechtCfg = { laender: {}, tabelle: [] };

async function count(q: PromiseLike<{ count: number | null; error: unknown }>): Promise<number | null> {
  try {
    const r = await q;
    return r.error ? null : r.count ?? 0;
  } catch {
    return null;
  }
}

async function probe(): Promise<number | null> {
  try {
    const r = await fetch(`${siteUrl()}/api/unsubscribe?t=${"0".repeat(16)}`, { cache: "no-store", redirect: "manual", signal: AbortSignal.timeout(3000) });
    return r.status;
  } catch {
    return null;
  }
}

export async function loadRecht(): Promise<RechtDaten> {
  const now = new Date();
  const sb = db();
  const d7 = new Date(now.getTime() - 7 * 86_400_000).toISOString();
  const d30 = new Date(now.getTime() - 30 * 86_400_000).toISOString();
  const [own, supp, c30, cAll, sent7, ohne, legal, pr] = await Promise.all([
    loadOwnerSettings(),
    sb.from("suppression").select("reason, created_at").order("created_at", { ascending: false }).limit(50000).abortSignal(T())
      .then((r) => (r.error ? null : (r.data ?? []) as { reason: string | null; created_at: string }[]), () => null),
    count(sb.from("email_events").select("id", { count: "exact", head: true }).eq("type", "complained").gte("created_at", d30).abortSignal(T())),
    count(sb.from("email_events").select("id", { count: "exact", head: true }).eq("type", "complained").abortSignal(T())),
    count(sb.from("messages").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", d7).abortSignal(T())),
    count(sb.from("messages").select("id", { count: "exact", head: true }).eq("status", "sent").gte("sent_at", d7).is("unsubscribe_token", null).abortSignal(T())),
    sb.from("settings").select("legal_ready").eq("id", 1).abortSignal(T()).maybeSingle()
      .then((r) => (r.error || !r.data ? null : !!(r.data as { legal_ready: boolean | null }).legal_ready), () => null),
    probe(),
  ]);
  const cfg = ((opsConfig as { recht?: RechtCfg }).recht ?? EMPTY);
  const versandAn = CONFIG.versand.aktiv && !own.send_paused;
  const fokus = CONFIG.fokus.map((k) => k.split("/")[1]);
  return {
    at: now.toISOString(),
    laender: laender(cfg, { versandAn, fokus, aus: own.send_countries_off ?? [] }),
    versandAn,
    sperren: supp ? sperren(supp, now) : null,
    beschwerden30: c30, beschwerdenGesamt: cAll,
    abmelde: abmeldeCheck({ probe: pr, sent7, ohneToken: ohne, siteHttps: siteUrl().startsWith("https://") }),
    texte: rechtstexte(Object.entries(LEGAL).map(([key, d]) => ({ key, title: d.title, placeholder: d.placeholder, laenge: d.body.trim().length })), legal),
    fragen: offeneFragen(cfg),
  };
}

import "server-only";
import { after } from "next/server";
import { db } from "@/lib/supabase";
import { loadZentrale } from "@/lib/zentrale-data";
import { zieleBild, type ZielBild } from "@/lib/zentrale-modell";
import { nordstern, plan, rueckblick, stufen, treppe, zusammenfassung, type Meilenstein, type RbEintrag } from "@/lib/strategie";

/**
 * Daten der Strategie-Seite: Zwischenspeicher dashboard_cache 'strategie' (signalwerk.strategie_refresh(), Wachhund
 * alle 15 min; älter als 10 min → im Hintergrund neu), dazu zwei kleine brain_knowledge-Zeilen und der JARVIS-Cache
 * (MRR, Kunden, Premium, Ziele). Keine Live-Zählung über große Tabellen, keine Lead-Inhalte.
 */
type Cache = {
  at: string; seeds: Record<string, number>; sent_total: number; sent_erst: string | null; sent_24h: number;
  p30: { sent: number; bounced: number; complained: number; antworten: number; proben: number };
  meilensteine: Meilenstein[]; rueckblick: RbEintrag[]; zaehler: { lehren: number; entscheidungen: number; tage: number };
};

const FRESH_MS = 10 * 60_000;
let refreshing: Promise<unknown> | null = null;
async function refresh(): Promise<Cache | null> {
  const p = (async () => {
    const r = await db().rpc("strategie_refresh").abortSignal(AbortSignal.timeout(40_000));
    if (r.error) throw new Error(`strategie_refresh: ${r.error.message}`);
    return r.data as Cache;
  })();
  refreshing = p.finally(() => { refreshing = null; });
  return p;
}

type Bk = { slug: string; titel: string; markdown: string; quelle: string | null; updated_at: string };

export async function loadStrategie() {
  const [cache, bk, z] = await Promise.all([
    db().from("dashboard_cache").select("value, updated_at").eq("name", "strategie").abortSignal(AbortSignal.timeout(4000)).maybeSingle(),
    db().from("brain_knowledge").select("slug, titel, markdown, quelle, updated_at").in("slug", ["strategie-zusammenfassung", "strategie-skalierung"])
      .eq("status", "aktiv").abortSignal(AbortSignal.timeout(4000)),
    loadZentrale("alle").catch(() => ({ schnell: null, langsam: null, abruf: "" })),
  ]);
  let c = (cache.data?.value as Cache | undefined) ?? null;
  if (!c) c = await refresh().catch((e) => { console.error("strategie:", e); return null; });
  else if (Date.now() - Date.parse(cache.data!.updated_at) > FRESH_MS && !refreshing) after(() => refresh().catch(() => {}));

  const rows = ((bk.data ?? []) as Bk[]);
  const zf = rows.find((r) => r.slug === "strategie-zusammenfassung") ?? null;
  const skal = rows.find((r) => r.slug === "strategie-skalierung") ?? null;
  const l = z.langsam;
  const premium = l?.extra?.premium ?? null;
  const ziele: ZielBild[] = zieleBild(z.schnell, l);
  const ms = (c?.meilensteine ?? []) as Meilenstein[];
  return {
    at: c?.at ?? null,
    zf: zusammenfassung(zf, skal),
    zfStand: (zf ?? skal)?.updated_at ?? null,
    zfVon: zf ? (zf.quelle === "inhaber" ? "Inhaber" : "Gehirn") : "Gehirn (aus Skalierung)",
    nord: nordstern(l?.mrr ?? null),
    kunden: l?.kunden ?? null,
    treppe: treppe(stufen(skal?.markdown), { seeds: c?.seeds ?? {}, p30: c?.p30 ?? null, sent_24h: c?.sent_24h ?? null, kunden: l?.kunden ?? null, premium }),
    plan: plan(ms),
    ziele,
    rueckblick: rueckblick(c?.rueckblick ?? []),
    zaehler: {
      mails: c?.sent_total ?? null, seit: c?.sent_erst ?? null, premium, lehren: c?.zaehler.lehren ?? null,
      entscheidungen: c?.zaehler.entscheidungen ?? null, meilensteine: plan(ms).erreicht,
    },
  };
}
export type StrategieDaten = Awaited<ReturnType<typeof loadStrategie>>;

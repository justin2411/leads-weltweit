import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/supabase";
import { FLOW_KINDS, PREVIEW_COLS, parseFlow, ruleTag, unpackRows, type Flow, type FlowKind, type Row, type RowPack } from "@/lib/flow";
import { dedupeRows, isUuid, queryKey, toRow, type FlowStatus, type Snapshot, type SourceQuery } from "@/lib/flow-io";
import { loadSchedule, poolInfos, type CustomAgent, type PoolInfo } from "@/lib/baukasten";

/**
 * Daten des Baukastens (/dashboard/baukasten). Nur serverseitig mit dem Service-Schlüssel.
 * - flows:              gespeicherte Flows (signalwerk.flows, Migration 20261004030000)
 * - flow_lead_rows / flow_buyer_rows: Stichprobe als flache Zeilen. PostgREST liefert höchstens 1000 Zeilen je
 *   Abruf → 1–5 Seiten parallel (feste Reihenfolge Alter, id; doppelte ids fallen weg).
 * - Vorschau (ohne Telefon/E-Mail/Adresse) 15 min zwischengespeichert; Export immer frisch mit allen Spalten.
 * Fehler werden nicht zwischengespeichert (unstable_cache speichert nur erfolgreiche Ergebnisse).
 */
export type FlowRow = {
  id: string; name: string; status: FlowStatus; note: string | null; created_at: string; updated_at: string;
  /** test | master | agent (Migration 20261004100000); Unbekanntes gilt als test */
  kind: FlowKind;
  activated_at: string | null; snapshot: Snapshot | null;
  /** geprüfter Flow; null = gespeicherter Inhalt unlesbar (errors sagt warum) */
  def: Flow | null; errors?: string[];
};

const COLS = "id, name, status, kind, note, created_at, updated_at, activated_at, snapshot, def";
const PAGE = 1000;

function toFlowRow(x: Record<string, unknown>): FlowRow {
  const p = parseFlow(x.def);
  return {
    id: String(x.id), name: String(x.name ?? ""), status: x.status as FlowStatus, note: (x.note as string | null) ?? null,
    kind: FLOW_KINDS.includes(x.kind as FlowKind) ? (x.kind as FlowKind) : "test",
    created_at: String(x.created_at), updated_at: String(x.updated_at), activated_at: (x.activated_at as string | null) ?? null,
    snapshot: (x.snapshot as Snapshot | null) ?? null, def: p.ok ? p.flow : null, ...(p.ok ? {} : { errors: p.errors }),
  };
}

/** Alle Flows außer archivierten, zuletzt geänderte zuerst. */
export async function loadFlows(): Promise<FlowRow[]> {
  const { data, error } = await db().from("flows").select(COLS).neq("status", "archiv").order("updated_at", { ascending: false })
    .limit(200).abortSignal(AbortSignal.timeout(6000));
  if (error) throw new Error(`flows: ${error.message}`);
  return (data ?? []).map(toFlowRow);
}

/** Ein Flow (auch archiviert); unbekannte id → null. */
export async function loadFlow(id: string): Promise<FlowRow | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db().from("flows").select(COLS).eq("id", id).abortSignal(AbortSignal.timeout(6000)).maybeSingle();
  if (error) throw new Error(`flows: ${error.message}`);
  return data ? toFlowRow(data) : null;
}

/** Die eine Master-Pipeline (nicht archiviert); keine → null. */
export async function loadMasterFlow(): Promise<FlowRow | null> {
  const { data, error } = await db().from("flows").select(COLS).eq("kind", "master").neq("status", "archiv")
    .order("updated_at", { ascending: false }).limit(1).abortSignal(AbortSignal.timeout(6000));
  if (error) throw new Error(`flows: ${error.message}`);
  return data?.length ? toFlowRow(data[0]) : null;
}

/** Eigene Speicher mit Anzahl Leads (gesamt und je Land) aus pool_counts. Zählung fehlt → 0 (Speicher trotzdem wählbar). */
export async function loadPools(): Promise<PoolInfo[]> {
  const [p, c] = await Promise.all([
    db().from("lead_pools").select("id, name, color").order("name").limit(200).abortSignal(AbortSignal.timeout(6000)),
    db().rpc("pool_counts").abortSignal(AbortSignal.timeout(15_000)),
  ]);
  if (p.error) throw new Error(`lead_pools: ${p.error.message}`);
  if (c.error) console.error("pool_counts:", c.error.message);
  return poolInfos(p.data ?? [], c.error ? [] : ((c.data ?? []) as { pool_id: unknown; country: unknown; n: unknown }[]));
}

const AGENT_COLS = "id, name, flow_id, trigger, at_hour, at_minute, weekdays, every_hours, ai_brief, ai_market, enabled, last_run_at, last_result, updated_at, flows(status)";
function toAgent(x: Record<string, unknown>): CustomAgent {
  const f = x.flows as { status?: unknown } | { status?: unknown }[] | null;
  const st = Array.isArray(f) ? f[0]?.status : f?.status;
  return {
    id: String(x.id), name: String(x.name ?? ""), flow_id: String(x.flow_id ?? ""), ...loadSchedule(x), ai_brief: (x.ai_brief as string | null) ?? null,
    ai_market: (x.ai_market as string | null) ?? null, enabled: x.enabled === true, archived: st === "archiv",
    last_run_at: (x.last_run_at as string | null) ?? null, last_result: x.last_result ?? null, updated_at: (x.updated_at as string | null) ?? null,
  };
}

/** Eigene Agenten, zuletzt geänderte zuerst (archivierte mit archived = true). */
export async function loadCustomAgents(): Promise<CustomAgent[]> {
  const { data, error } = await db().from("custom_agents").select(AGENT_COLS).order("updated_at", { ascending: false }).limit(200)
    .abortSignal(AbortSignal.timeout(6000));
  if (error) throw new Error(`custom_agents: ${error.message}`);
  return (data ?? []).map((x) => toAgent(x as Record<string, unknown>));
}

/** Ein eigener Agent; unbekannt → null. */
export async function loadCustomAgent(id: string): Promise<CustomAgent | null> {
  if (!isUuid(id)) return null;
  const { data, error } = await db().from("custom_agents").select(AGENT_COLS).eq("id", id).abortSignal(AbortSignal.timeout(6000)).maybeSingle();
  if (error) throw new Error(`custom_agents: ${error.message}`);
  return data ? toAgent(data as Record<string, unknown>) : null;
}

type DbRow = { id: unknown } & Record<string, unknown>;
const pageCount = (q: SourceQuery) => Math.ceil(q.size / PAGE);

/** Eine Seite (1000 Zeilen) der Stichprobe; feste Reihenfolge (Alter, id), damit die Seiten zusammenpassen. */
async function fetchPage(q: SourceQuery, cols: string[] | null, i: number): Promise<DbRow[]> {
  const fn = q.source === "leads" ? "flow_lead_rows" : "flow_buyer_rows";
  const order = q.source === "leads" ? "erfasst_tage" : "alter_tage";
  const { data, error } = await db().rpc(fn, { p_segment: q.segment, p_countries: q.countries, p_status: q.status, p_limit: q.size })
    .select(cols ? cols.join(",") : "*").order(order, { ascending: true }).order("id", { ascending: true })
    .range(i * PAGE, (i + 1) * PAGE - 1).abortSignal(AbortSignal.timeout(30_000));
  if (error) throw new Error(`${fn}: ${error.message}`);
  return (data ?? []) as unknown as DbRow[];
}

/** Vorschau-Zeilen kompakt (RowPack) mit Ladezeit (älteste Seite). Je Seite 15 min zwischengespeichert – eine Seite
 *  bleibt so unter der 2-MB-Grenze des Next-Zwischenspeichers (5000 Zeilen am Stück wären ~2,3 MB). */
export async function loadSourcePack(q: SourceQuery): Promise<{ pack: RowPack; at: string }> {
  const cols = PREVIEW_COLS[q.source];
  const pages = await Promise.all(Array.from({ length: pageCount(q) }, (_, i) => unstable_cache(
    async () => ({ rows: (await fetchPage(q, cols, i)).map((x) => { const r = toRow(x, cols); return cols.map((k) => r[k] ?? null); }),
      at: new Date().toISOString() }),
    ["flow-rows-v1", queryKey(q), String(i)],
    { revalidate: 900, tags: ["flow-rows"] },
  )()));
  const seen = new Set<string>(), data: RowPack["data"] = [], idx = cols.indexOf("id");
  for (const p of pages) for (const r of p.rows) {
    const id = String(r[idx]);
    if (!seen.has(id) && data.length < q.size) { seen.add(id); data.push(r); }
  }
  return { pack: { cols, data }, at: pages.map((p) => p.at).sort()[0] ?? new Date().toISOString() };
}

/** Alle Spalten (auch Export-Spalten), frisch. */
async function fetchFull(q: SourceQuery): Promise<Row[]> {
  const pages = await Promise.all(Array.from({ length: pageCount(q) }, (_, i) => fetchPage(q, null, i)));
  return dedupeRows(pages).slice(0, q.size).map((x) => toRow(x));
}

/** Zeilen einer Quelle. full = mit Export-Spalten (Telefon, E-Mail, Website, Adresse …), nie zwischengespeichert. */
export async function loadSourceRows(q: SourceQuery, full = false): Promise<Row[]> {
  if (full) return fetchFull(q);
  return unpackRows((await loadSourcePack(q)).pack);
}

/** Gesamtzahl einer Quelle (gleiche Filter, ohne Stichproben-Grenze), 15 min zwischengespeichert. */
export function loadSourceCount(q: SourceQuery): Promise<number> {
  return unstable_cache(
    async () => {
      const { data, error } = await db().rpc("flow_source_count", { p_source: q.source, p_segment: q.segment, p_countries: q.countries, p_status: q.status })
        .abortSignal(AbortSignal.timeout(30_000));
      if (error) throw new Error(`flow_source_count: ${error.message}`);
      return Number(data ?? 0);
    },
    ["flow-count-v1", queryKey({ ...q, size: 1000 })],
    { revalidate: 900, tags: ["flow-rows"] },
  )();
}

/** Namen der Regeln, die gerade in der Pipeline laufen: Grund-Kennung („s4:regel:1a2b3c4d“) → Name. Fehler → {}. */
export async function loadActiveRuleNames(): Promise<Record<string, string>> {
  try {
    const { data, error } = await db().from("flows").select("id, name").eq("status", "aktiv").abortSignal(AbortSignal.timeout(5000));
    if (error) throw new Error(error.message);
    return Object.fromEntries((data ?? []).map((f) => [ruleTag(String(f.id)), String(f.name)]));
  } catch {
    return {};
  }
}

/** Protokoll (signalwerk.owner_log) wie die übrigen Inhaber-Aktionen. */
export async function logOwner(action: string, target: string | null, oldValue: unknown, newValue: unknown) {
  await db().from("owner_log").insert({ action, target, old_value: oldValue ?? null, new_value: newValue ?? null, created_by: "Inhaber Dashboard" });
}

/** Regel aus/geändert: von ihr zurückgehaltene Leads zurück an die normale Freigabe. Gibt die Anzahl zurück. */
export async function releaseHeld(flowId: string): Promise<number> {
  const { data, error } = await db().rpc("flow_release_held", { p_flow: flowId }).abortSignal(AbortSignal.timeout(30_000));
  if (error) throw new Error(`flow_release_held: ${error.message}`);
  return Number(data ?? 0);
}

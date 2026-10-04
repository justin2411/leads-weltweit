"use server";

/**
 * Eigene Speicher (Inhaber 04.10.2026, docs/BAUKASTEN-MASTER.md): anlegen, umbenennen, Farbe – nie löschen. Bedienung je
 * Zielgruppe+Land (pool_routes) und je Kunde (subscriptions.pool_id) nur gesammelt über „Übernehmen“. Ablauf wie die
 * Regler: Sitzung prüfen (requireOwner), alles serverseitig gegen den aktuellen Stand prüfen, owner_log schreiben.
 * „Gesamtbestand“ = Route entfernen (Einstellung, keine Daten). Die Drei-Stufen-Freigabe bleibt davon unberührt.
 */
import { revalidatePath } from "next/cache";
import { db } from "@/lib/supabase";
import { PoolInputError, cleanColor, cleanPoolName, isUuid, matrixRows, routeKey, validateChanges, type PoolChange } from "@/lib/pools";
import { loadPools } from "@/lib/pools-data";
import { requireOwner } from "../actions";

const BY = "Inhaber Dashboard";
const PATH = "/dashboard/speicher";
export type PoolResult = { ok: true; at: string; n: number } | { ok: false; error: string };

const fail = (e: unknown): { ok: false; error: string } => ({
  ok: false,
  error: e instanceof PoolInputError ? e.message
    : /duplicate key|23505/.test(e instanceof Error ? e.message : "") ? "Name schon vergeben"
    : `nicht gespeichert: ${e instanceof Error ? e.message.slice(0, 160) : "Fehler"}`,
});

async function log(action: string, target: string | null, oldValue: unknown, newValue: unknown) {
  const { error } = await db().from("owner_log").insert({ action, target, old_value: oldValue ?? null, new_value: newValue ?? null, created_by: BY });
  if (error) throw new Error(error.message);
}

/** Neuen Speicher anlegen (leer). */
export async function createPool(name: string, color: string): Promise<PoolResult> {
  await requireOwner();
  try {
    const row = { name: cleanPoolName(name), color: cleanColor(color) };
    const { data, error } = await db().from("lead_pools").insert(row).select("id").single();
    if (error) throw new Error(`${error.code ?? ""} ${error.message}`);
    await log("pool:create", data.id, null, row);
    revalidatePath(PATH);
    return { ok: true, at: new Date().toISOString(), n: 1 };
  } catch (e) {
    return fail(e);
  }
}

/** Name und Farbe eines Speichers ändern (Inhalt bleibt, nichts wird gelöscht). */
export async function updatePool(id: string, name: string, color: string): Promise<PoolResult> {
  await requireOwner();
  try {
    if (!isUuid(id)) throw new PoolInputError("Speicher unbekannt");
    const { data: old, error: e1 } = await db().from("lead_pools").select("name, color").eq("id", id).maybeSingle();
    if (e1) throw new Error(e1.message);
    if (!old) throw new PoolInputError("Speicher unbekannt");
    const row = { name: cleanPoolName(name), color: cleanColor(color) };
    if (row.name === old.name && row.color === (old.color ?? null)) throw new PoolInputError("keine Änderung");
    const { error } = await db().from("lead_pools").update(row).eq("id", id);
    if (error) throw new Error(`${error.code ?? ""} ${error.message}`);
    await log("pool:update", id, old, row);
    revalidatePath(PATH);
    return { ok: true, at: new Date().toISOString(), n: 1 };
  } catch (e) {
    return fail(e);
  }
}

/** „Übernehmen“: Routen je Zielgruppe+Land und Kunden-Übersteuerungen gesammelt speichern. */
export async function applyPools(raw: PoolChange[]): Promise<PoolResult> {
  await requireOwner();
  try {
    const d = await loadPools();
    const cells = new Set(matrixRows(d.segments, d.routes).flatMap((r) => r.countries.map((c) => routeKey(r.id, c))));
    const changes = validateChanges(raw, { pools: new Set(d.pools.map((p) => p.id)), subs: new Set(d.subs.map((s) => s.id)), cells });
    const at = new Date().toISOString();
    const oldRoute = new Map(d.routes.map((r) => [routeKey(r.segment_id, r.country), r.pool_id]));
    const oldSub = new Map(d.subs.map((s) => [s.id, s.pool_id]));
    for (const c of changes) {
      if (c.kind === "route") {
        const q = c.pool_id
          ? db().from("pool_routes").upsert({ segment_id: c.segment, country: c.country, pool_id: c.pool_id, updated_at: at })
          : db().from("pool_routes").delete().eq("segment_id", c.segment).eq("country", c.country);
        const { error } = await q;
        if (error) throw new Error(error.message);
        await log("pool:route", routeKey(c.segment, c.country), oldRoute.get(routeKey(c.segment, c.country)) ?? null, c.pool_id);
      } else {
        const { error } = await db().from("subscriptions").update({ pool_id: c.pool_id, updated_at: at }).eq("id", c.id);
        if (error) throw new Error(error.message);
        await log("pool:subscription", c.id, oldSub.get(c.id) ?? null, c.pool_id);
      }
    }
    revalidatePath(PATH);
    return { ok: true, at, n: changes.length };
  } catch (e) {
    return fail(e);
  }
}

"use server";

/**
 * Aktionen des Baukastens (Inhaber 03.10.2026: „Flows per Drag & Drop selber bauen … wenn es mir gefällt, hänge ich es
 * an die große Pipeline“). Der Baukasten ist eine Client-Komponente und ruft diese Aktionen direkt auf: Antwort immer
 * als einfaches JSON ({ ok: true, … } | { ok: false, error }), keine Weiterleitung.
 * Jede Aktion: zuerst Sitzung (requireOwner, sonst 404), dann jede Eingabe serverseitig neu prüfen (parseFlow +
 * problems, uuid, Stichprobe 1000/2000/5000) – dem Browser wird nie vertraut. Jede Änderung → owner_log.
 * Regeln machen die Freigabe nur strenger (Stufe 4 in scripts/lib/release_gate.py); Versand, Sperrliste und die drei
 * Prüfstufen berührt hier nichts. Regel aus/geändert → von ihr zurückgehaltene Leads zurück an die normale Freigabe.
 */
import { db } from "@/lib/supabase";
import { pipelineNode, problems, parseFlow, runFlowRows, type Flow, type RowPack } from "@/lib/flow";
import { agentBrief, isUuid, NODE_ID_RE, parseSourceQuery, queryOf, snapshotOf, type FlowStatus, type Snapshot } from "@/lib/flow-io";
import { loadFlow, loadSourceCount, loadSourcePack, loadSourceRows, logOwner, releaseHeld, type FlowRow } from "@/lib/flow-data";
import { InputError } from "@/lib/owner-settings";
import { MARKETS, TaskError, validateTask } from "@/lib/agents";
import { requireOwner } from "../actions";

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Rahmen: Sitzung zuerst (404 ohne Inhaber), Eingabefehler als Hinweis, andere Fehler kurz gemeldet und protokolliert. */
async function guard<T extends object>(what: string, fn: () => Promise<T>): Promise<Result<T>> {
  await requireOwner();
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof InputError) return { ok: false, error: e.message };
    console.error(`baukasten ${what}:`, e);
    return { ok: false, error: `${what} fehlgeschlagen: ${e instanceof Error ? e.message.slice(0, 200) : "unbekannter Fehler"}` };
  }
}

function checkName(x: unknown): string {
  const name = String(x ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 60) throw new InputError("Name: 1 bis 60 Zeichen");
  return name;
}

function checkFlow(def: unknown): Flow {
  const p = parseFlow(def);
  if (!p.ok) throw new InputError(`Flow ungültig: ${p.errors.slice(0, 3).join(" · ")}`);
  return p.flow;
}

/** Für die Pipeline: keine Fehler, genau ein Pipeline-Baustein, Quelle Leads. */
function checkPipeline(flow: Flow) {
  const errs = problems(flow).filter((p) => p.level === "error");
  if (errs.length) throw new InputError(`erst Fehler beheben: ${errs.slice(0, 3).map((p) => p.msg).join(" · ")}`);
  if (!pipelineNode(flow)) throw new InputError("Pipeline-Baustein fehlt");
  const q = queryOf(flow);
  if (!q || q.source !== "leads") throw new InputError("Pipeline gilt nur für Leads");
  return q;
}

async function mustLoad(id: unknown): Promise<FlowRow> {
  if (!isUuid(id)) throw new InputError("Flow unbekannt");
  const f = await loadFlow(id);
  if (!f) throw new InputError("Flow unbekannt");
  return f;
}

/** Status nur ändern, wenn er noch der erwartete ist (sonst hat jemand parallel geändert). */
async function setStatus(id: string, from: FlowStatus[], patch: Record<string, unknown>): Promise<boolean> {
  const { data, error } = await db().from("flows").update(patch).eq("id", id).in("status", from).select("id");
  if (error) throw new Error(error.message);
  return !!data?.length;
}

// ------------------------------------------------------------------------------------------- Vorschau
/** Stichprobe einer Quelle für die Auswertung im Browser (nur Vorschau-Spalten, keine Telefonnummern/Adressen). */
export async function previewSource(q: unknown): Promise<Result<{ pack: RowPack; total: number; exact: boolean; at: string }>> {
  return guard("Laden", async () => {
    const query = parseSourceQuery(q);
    const [rows, count] = await Promise.all([loadSourcePack(query), loadSourceCount(query).catch(() => null)]);
    const n = rows.pack.data.length;
    return { pack: rows.pack, total: count ?? n, exact: count !== null, at: rows.at };
  });
}

// ------------------------------------------------------------------------------------------- Speichern
/** Neu anlegen (Entwurf) oder ändern. Läuft der Flow in der Pipeline, muss er fehlerfrei bleiben; danach gehen die von
 *  ihm zurückgehaltenen Leads zurück an die Freigabe und werden unter der neuen Fassung geprüft. */
export async function saveFlow(input: { id?: string | null; name: unknown; def: unknown }): Promise<Result<{ id: string; status: FlowStatus; released: number }>> {
  return guard("Speichern", async () => {
    const name = checkName(input?.name);
    const flow = checkFlow(input?.def);
    if (!input?.id) {
      const { data, error } = await db().from("flows").insert({ name, def: flow, status: "entwurf" }).select("id").single();
      if (error) throw new Error(error.message);
      await logOwner("flow:create", data.id, null, { name, nodes: flow.nodes.length });
      return { id: String(data.id), status: "entwurf" as FlowStatus, released: 0 };
    }
    const cur = await mustLoad(input.id);
    if (cur.status === "archiv") throw new InputError("archiviert – als neuen Flow speichern");
    if (cur.status === "aktiv") checkPipeline(flow);
    const { data, error } = await db().from("flows").update({ name, def: flow }).eq("id", cur.id).eq("status", cur.status).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new InputError("inzwischen geändert – bitte neu laden");
    const released = cur.status === "aktiv" ? await releaseHeld(cur.id) : 0;
    await logOwner("flow:save", cur.id, { name: cur.name, status: cur.status }, { name, nodes: flow.nodes.length, released });
    return { id: cur.id, status: cur.status, released };
  });
}

// ------------------------------------------------------------------------------------------- Pipeline
/** An die Pipeline anschließen: gespeicherte Fassung prüfen, Kennzahlen aus der Stichprobe festhalten, Status aktiv. */
export async function activateFlow(id: unknown): Promise<Result<{ snapshot: Snapshot }>> {
  return guard("Anschließen", async () => {
    const cur = await mustLoad(id);
    if (cur.status === "archiv") throw new InputError("archiviert");
    if (!cur.def) throw new InputError("gespeicherter Flow unlesbar – neu speichern");
    const q = checkPipeline(cur.def);
    const snapshot = snapshotOf(cur.def, await loadSourceRows(q), new Date().toISOString());
    const ok = await setStatus(cur.id, ["entwurf", "aus", "aktiv"], { status: "aktiv", activated_at: new Date().toISOString(), snapshot });
    if (!ok) throw new InputError("inzwischen geändert – bitte neu laden");
    await logOwner("flow:activate", cur.id, { status: cur.status }, { name: cur.name, ...snapshot });
    return { snapshot };
  });
}

/** Von der Pipeline lösen: Status aus, von dieser Regel zurückgehaltene Leads zurück an die normale Freigabe. */
export async function deactivateFlow(id: unknown): Promise<Result<{ released: number }>> {
  return guard("Lösen", async () => {
    const cur = await mustLoad(id);
    if (!(await setStatus(cur.id, ["aktiv"], { status: "aus" }))) throw new InputError("läuft nicht in der Pipeline");
    const released = await releaseHeld(cur.id);
    await logOwner("flow:deactivate", cur.id, { status: "aktiv" }, { name: cur.name, released });
    return { released };
  });
}

/** Archivieren (nichts wird gelöscht). Lief der Flow in der Pipeline, zuerst lösen. */
export async function archiveFlow(id: unknown): Promise<Result<{ released: number }>> {
  return guard("Archivieren", async () => {
    const cur = await mustLoad(id);
    if (cur.status === "archiv") return { released: 0 };
    if (!(await setStatus(cur.id, [cur.status], { status: "archiv" }))) throw new InputError("inzwischen geändert – bitte neu laden");
    const released = cur.status === "aktiv" ? await releaseHeld(cur.id) : 0;
    await logOwner("flow:archive", cur.id, { status: cur.status }, { name: cur.name, released });
    return { released };
  });
}

// ------------------------------------------------------------------------------------------- Agent
/** Auftrag aus einem Agent-Baustein des GESPEICHERTEN Flows (vorher speichern). Prüfung wie im JARVIS-Formular. */
export async function flowToAgent(id: unknown, nodeId: unknown): Promise<Result<{ taskId: string; brief: string }>> {
  return guard("Auftrag", async () => {
    const cur = await mustLoad(id);
    if (!cur.def) throw new InputError("gespeicherter Flow unlesbar – neu speichern");
    if (typeof nodeId !== "string" || !NODE_ID_RE.test(nodeId)) throw new InputError("Baustein unbekannt");
    const node = cur.def.nodes.find((n) => n.id === nodeId);
    if (!node || node.kind !== "agent") throw new InputError("kein Agent-Baustein – erst speichern");
    const q = queryOf(cur.def);
    if (!q) throw new InputError("Quelle fehlt");
    const rows = await loadSourceRows(q);
    const res = runFlowRows(cur.def, rows)[node.id];
    if (!res?.connected) throw new InputError("Agent-Baustein ist nicht mit der Quelle verbunden");
    const market = q.countries.length === 1 && (MARKETS as readonly string[]).includes(q.countries[0]) ? q.countries[0] : null;
    let t;
    try {
      t = validateTask({ agent: node.agent, kind: node.task, market, brief: agentBrief(cur.name, cur.def, node.id, res.input.length, rows.length) });
    } catch (e) {
      if (e instanceof TaskError) throw new InputError(e.message);
      throw e;
    }
    const { data, error } = await db().from("agent_tasks").insert({ ...t, created_by: "Inhaber Dashboard" }).select("id").single();
    if (error) throw new Error(error.message);
    await logOwner("agent:create", `Agent ${t.agent}`, null, { ...t, flow: cur.id, node: node.id });
    return { taskId: String(data.id), brief: t.brief };
  });
}

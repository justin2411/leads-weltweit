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
import { loadCustomAgent, loadFlow, loadSourceCount, loadSourcePack, loadSourceRows, logOwner, releaseHeld, type FlowRow } from "@/lib/flow-data";
import { GOLD, MASTER_NAME, checkPoolName, logicSig, parseAgentInput } from "@/lib/baukasten";
import { InputError } from "@/lib/owner-settings";
import { MARKETS, TaskError, validateTask } from "@/lib/agents";
import { requireOwner } from "../actions";

export type Result<T extends object = object> = ({ ok: true } & T) | { ok: false; error: string };

/** Rahmen: Sitzung zuerst (404 ohne Inhaber), Eingabefehler als Hinweis. Andere Fehler nur im Server-Protokoll (mit
 *  Kennung); der Browser bekommt einen allgemeinen Text + Kennung, nie Interna der Datenbank. */
async function guard<T extends object>(what: string, fn: () => Promise<T>): Promise<Result<T>> {
  await requireOwner();
  try {
    return { ok: true, ...(await fn()) };
  } catch (e) {
    if (e instanceof InputError) return { ok: false, error: e.message };
    const ref = Math.random().toString(36).slice(2, 8);
    console.error(`baukasten ${what} [${ref}]:`, e);
    return { ok: false, error: `${what} fehlgeschlagen – bitte gleich noch einmal (Fehler ${ref})` };
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

/** Master-Pipeline und Agenten-Flows nur über ihre eigenen Aktionen (Agenten-Flows dürfen nie „aktiv“ werden). */
function notTest(f: FlowRow) {
  if (f.kind === "master") throw new InputError("Master-Pipeline – im Bereich Master speichern");
  if (f.kind === "agent") throw new InputError("Flow eines Agenten – im Bereich Agenten bearbeiten");
}

async function mustLoad(id: unknown): Promise<FlowRow> {
  if (!isUuid(id)) throw new InputError("Flow unbekannt");
  const f = await loadFlow(id);
  if (!f) throw new InputError("Flow unbekannt");
  return f;
}

/** Status nur ändern, wenn er noch der erwartete ist (sonst hat jemand parallel geändert). Mit `version` (updated_at
 *  der geprüften Fassung) zusätzlich nur, wenn die Definition seitdem nicht gespeichert wurde. */
async function setStatus(id: string, from: FlowStatus[], patch: Record<string, unknown>, version?: string): Promise<boolean> {
  let q = db().from("flows").update(patch).eq("id", id).in("status", from);
  if (version) q = q.eq("updated_at", version);
  const { data, error } = await q.select("id");
  if (error) throw new Error(error.message);
  return !!data?.length;
}

/** Neue/geänderte Regel gilt sofort auch für den Proben-Vorrat: fertige Proben in ihrem Bereich verlieren ihre
 *  Freigabe-Frische (nicht destruktiv). claim_sample_stock gibt sie dann nicht heraus; die nächste Nachprüfung
 *  (proben-vorrat, stündlich) prüft sie mit Stufe 4 neu oder baut neu. */
async function staleStock(flow: Flow): Promise<void> {
  const q = queryOf(flow);
  if (!q || q.source !== "leads") return;
  let u = db().from("sample_stock").update({ gate_checked_at: null }).eq("status", "ready");
  if (q.segment) u = u.eq("segment_id", q.segment);
  if (q.countries.length) u = u.in("country", q.countries);
  const { error } = await u;
  if (error) console.error("baukasten sample_stock:", error.message); // Regel steht schon; Vorrat spätestens nach 26 h neu geprüft
}

/** Vorschlag aus dem Baukasten-Chat (flows.pending_def, scripts/flow_edit.py) wird mit dem Speichern/Übernehmen des
 *  Inhabers erledigt – im selben Schreibvorgang leeren (sonst änderte sich updated_at ein zweites Mal). Nur wenn einer da
 *  ist: die Spalten gibt es erst ab Migration 20261004130000. */
async function pendingClear(id: string): Promise<Record<string, null>> {
  const { data, error } = await db().from("flows").select("pending_def").eq("id", id).maybeSingle();
  return !error && data && (data as { pending_def?: unknown }).pending_def ? { pending_def: null, pending_at: null, pending_note: null } : {};
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
    notTest(cur);
    if (cur.status === "archiv") throw new InputError("archiviert – als neuen Flow speichern");
    if (cur.status === "aktiv") checkPipeline(flow);
    const clear = await pendingClear(cur.id);
    const { data, error } = await db().from("flows").update({ name, def: flow, ...clear }).eq("id", cur.id).eq("status", cur.status).select("id");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new InputError("inzwischen geändert – bitte neu laden");
    const released = cur.status === "aktiv" ? await releaseHeld(cur.id) : 0;
    if (cur.status === "aktiv") await staleStock(flow);
    await logOwner("flow:save", cur.id, { name: cur.name, status: cur.status }, { name, nodes: flow.nodes.length, released });
    return { id: cur.id, status: cur.status, released };
  });
}

// ------------------------------------------------------------------------------------------- Pipeline
/** An die Pipeline anschließen: gespeicherte Fassung prüfen, Kennzahlen aus der Stichprobe festhalten, Status aktiv. */
export async function activateFlow(id: unknown): Promise<Result<{ snapshot: Snapshot }>> {
  return guard("Anschließen", async () => {
    const cur = await mustLoad(id);
    notTest(cur);
    if (cur.status === "archiv") throw new InputError("archiviert");
    if (!cur.def) throw new InputError("gespeicherter Flow unlesbar – neu speichern");
    const q = checkPipeline(cur.def);
    const snapshot = snapshotOf(cur.def, await loadSourceRows(q), new Date().toISOString());
    // nur die eben geprüfte Fassung anschließen: in einem zweiten Tab gespeichert → updated_at anders → kein Treffer
    const ok = await setStatus(cur.id, ["entwurf", "aus", "aktiv"], { status: "aktiv", activated_at: new Date().toISOString(), snapshot }, cur.updated_at);
    if (!ok) throw new InputError("inzwischen geändert – bitte neu laden");
    await staleStock(cur.def);
    await logOwner("flow:activate", cur.id, { status: cur.status }, { name: cur.name, ...snapshot });
    return { snapshot };
  });
}

/** Von der Pipeline lösen: Status aus, von dieser Regel zurückgehaltene Leads zurück an die normale Freigabe. */
export async function deactivateFlow(id: unknown): Promise<Result<{ released: number }>> {
  return guard("Lösen", async () => {
    const cur = await mustLoad(id);
    notTest(cur); // Master: Freigabe-Untergrenze bleibt, Regeln ändert der Inhaber im Bereich Master
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
    notTest(cur);
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

// ------------------------------------------------------------------------------------------- Master-Pipeline
/** Master-Pipeline speichern = aktiv übernehmen (eine Zeile kind='master'; fehlt sie, wird sie angelegt).
 *  Pipeline-Ziel = Stufe 4 wie bisher (nur strenger), Speicher-Ziele füllt pools.py. Die Drei-Stufen-Freigabe läuft
 *  unabhängig davon immer. `version` = updated_at der geladenen Fassung (sonst parallel geändert → neu laden). */
export async function saveMaster(input: { id?: string | null; version?: string | null; name: unknown; def: unknown }): Promise<Result<{ id: string; version: string; snapshot: Snapshot; released: number }>> {
  return guard("Übernehmen", async () => {
    const name = checkName(input?.name ?? MASTER_NAME);
    const flow = checkFlow(input?.def);
    const errs = problems(flow, "master").filter((p) => p.level === "error");
    if (errs.length) throw new InputError(`erst Fehler beheben: ${errs.slice(0, 3).map((p) => p.msg).join(" · ")}`);
    const q = queryOf(flow);
    if (!q || q.source !== "leads") throw new InputError("Master-Pipeline gilt nur für Leads");
    const now = new Date().toISOString();
    const snapshot = snapshotOf(flow, await loadSourceRows(q), now);
    if (!input?.id) {
      const { data, error } = await db().from("flows").insert({ name, def: flow, kind: "master", status: "aktiv", activated_at: now, snapshot })
        .select("id, updated_at").single();
      if (error?.code === "23505") throw new InputError("Es gibt schon eine Master-Pipeline – bitte neu laden");
      if (error) throw new Error(error.message);
      if (pipelineNode(flow)) await staleStock(flow);
      await logOwner("master:create", data.id, null, { name, nodes: flow.nodes.length, ...snapshot });
      return { id: String(data.id), version: String(data.updated_at), snapshot, released: 0 };
    }
    const cur = await mustLoad(input.id);
    if (cur.kind !== "master") throw new InputError("keine Master-Pipeline");
    if (cur.status === "archiv") throw new InputError("archiviert – bitte neu laden");
    if (input.version && input.version !== cur.updated_at) throw new InputError("inzwischen geändert – bitte neu laden");
    const clear = await pendingClear(cur.id);
    const { data, error } = await db().from("flows")
      .update({ name, def: flow, status: "aktiv", activated_at: cur.status === "aktiv" ? cur.activated_at : now, snapshot, ...clear })
      .eq("id", cur.id).eq("updated_at", cur.updated_at).select("updated_at");
    if (error) throw new Error(error.message);
    if (!data?.length) throw new InputError("inzwischen geändert – bitte neu laden");
    // Nur wenn sich die Regel wirklich geändert hat: zurückgehaltene Leads neu prüfen, Vorrat neu prüfen lassen
    const changed = !cur.def || logicSig(cur.def) !== logicSig(flow) || cur.status !== "aktiv";
    const released = changed && cur.status === "aktiv" ? await releaseHeld(cur.id) : 0;
    if (changed && (pipelineNode(flow) || (cur.def && pipelineNode(cur.def)))) await staleStock(flow);
    await logOwner("master:save", cur.id, { name: cur.name, status: cur.status }, { name, nodes: flow.nodes.length, released, ...snapshot });
    return { id: cur.id, version: String(data[0].updated_at), snapshot, released };
  });
}

// ------------------------------------------------------------------------------------------- Speicher
/** Neuen Speicher anlegen (Name 1–40, eindeutig). Gibt es den Namen schon, wird der vorhandene zurückgegeben. */
export async function createPool(nameIn: unknown): Promise<Result<{ pool: { id: string; name: string }; created: boolean }>> {
  return guard("Anlegen", async () => {
    const name = checkPoolName(nameIn);
    const { data, error } = await db().from("lead_pools").insert({ name, color: GOLD }).select("id, name").single();
    if (error?.code === "23505") {
      const { data: old, error: e2 } = await db().from("lead_pools").select("id, name").eq("name", name).maybeSingle();
      if (e2) throw new Error(e2.message);
      if (old) return { pool: { id: String(old.id), name: String(old.name) }, created: false };
      throw new InputError("Name schon vergeben – bitte anderen wählen");
    }
    if (error) throw new Error(error.message);
    await logOwner("pool:create", data.id, null, { name });
    return { pool: { id: String(data.id), name: String(data.name) }, created: true };
  });
}

// ------------------------------------------------------------------------------------------- Eigene Agenten
/** Flow eines Agenten prüfen: keine Fehler, Quelle vorhanden. */
function checkAgentFlow(def: unknown): Flow {
  const flow = checkFlow(def);
  const errs = problems(flow, "agent").filter((p) => p.level === "error");
  if (errs.length) throw new InputError(`erst Fehler beheben: ${errs.slice(0, 3).map((p) => p.msg).join(" · ")}`);
  if (!queryOf(flow)) throw new InputError("Quelle fehlt");
  return flow;
}

/** Als Agent speichern (neu: Flow-Kopie kind='agent', Status entwurf – nie aktiv, also nie Stufe 4) oder ändern.
 *  Ausgeführt wird er von agents_run.py; nie Versand, nie Sperrliste/Prüfregeln. */
export async function saveAgent(input: { id?: string | null; agent: unknown; def: unknown }): Promise<Result<{ id: string; flowId: string }>> {
  return guard("Agent speichern", async () => {
    const a = parseAgentInput(input?.agent);
    const flow = checkAgentFlow(input?.def);
    const fields = { name: a.name, trigger: a.trigger, at_hour: a.at_hour, ai_brief: a.ai_brief, ai_market: a.ai_market };
    if (!input?.id) {
      const f = await db().from("flows").insert({ name: a.name, def: flow, kind: "agent", status: "entwurf" }).select("id").single();
      if (f.error) throw new Error(f.error.message);
      const { data, error } = await db().from("custom_agents").insert({ ...fields, flow_id: f.data.id, enabled: true }).select("id").single();
      if (error) {
        await db().from("flows").update({ status: "archiv" }).eq("id", f.data.id); // nichts löschen, nur ablegen
        throw new Error(error.message);
      }
      await logOwner("custom_agent:create", data.id, null, { ...fields, flow: f.data.id, nodes: flow.nodes.length });
      return { id: String(data.id), flowId: String(f.data.id) };
    }
    if (!isUuid(input.id)) throw new InputError("Agent unbekannt");
    const cur = await loadCustomAgent(input.id);
    if (!cur) throw new InputError("Agent unbekannt");
    if (cur.archived) throw new InputError("archiviert – erst zurückholen");
    const fl = await mustLoad(cur.flow_id);
    if (fl.kind !== "agent") throw new InputError("Flow gehört nicht zu einem Agenten");
    const u1 = await db().from("flows").update({ name: a.name, def: flow }).eq("id", fl.id).eq("kind", "agent").neq("status", "aktiv").select("id");
    if (u1.error) throw new Error(u1.error.message);
    if (!u1.data?.length) throw new InputError("inzwischen geändert – bitte neu laden");
    const u2 = await db().from("custom_agents").update(fields).eq("id", cur.id);
    if (u2.error) throw new Error(u2.error.message);
    await logOwner("custom_agent:save", cur.id, { name: cur.name, trigger: cur.trigger, at_hour: cur.at_hour }, { ...fields, nodes: flow.nodes.length });
    return { id: cur.id, flowId: fl.id };
  });
}

/** Agent an/aus. Archivierte bleiben aus. */
export async function setAgentEnabled(id: unknown, enabled: unknown): Promise<Result<{ enabled: boolean }>> {
  return guard("Schalten", async () => {
    if (!isUuid(id)) throw new InputError("Agent unbekannt");
    const cur = await loadCustomAgent(id);
    if (!cur) throw new InputError("Agent unbekannt");
    const on = enabled === true;
    if (on && cur.archived) throw new InputError("archiviert – erst zurückholen");
    const { error } = await db().from("custom_agents").update({ enabled: on }).eq("id", cur.id);
    if (error) throw new Error(error.message);
    await logOwner("custom_agent:enabled", cur.id, { enabled: cur.enabled }, { enabled: on, name: cur.name });
    return { enabled: on };
  });
}

/** Archivieren (aus + Flow abgelegt) oder zurückholen (bleibt aus). Gelöscht wird nichts. */
export async function setAgentArchived(id: unknown, archived: unknown): Promise<Result<{ archived: boolean }>> {
  return guard("Archivieren", async () => {
    if (!isUuid(id)) throw new InputError("Agent unbekannt");
    const cur = await loadCustomAgent(id);
    if (!cur) throw new InputError("Agent unbekannt");
    const arch = archived === true;
    if (arch) {
      const e1 = await db().from("custom_agents").update({ enabled: false }).eq("id", cur.id);
      if (e1.error) throw new Error(e1.error.message);
    }
    const e2 = await db().from("flows").update({ status: arch ? "archiv" : "entwurf" }).eq("id", cur.flow_id).eq("kind", "agent");
    if (e2.error) throw new Error(e2.error.message);
    await logOwner(arch ? "custom_agent:archive" : "custom_agent:restore", cur.id, { archived: cur.archived }, { archived: arch, name: cur.name });
    return { archived: arch };
  });
}

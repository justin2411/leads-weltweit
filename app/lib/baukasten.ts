/**
 * Baukasten-Bereiche (Inhaber 04.10.2026, docs/BAUKASTEN-MASTER.md): Master-Pipeline (gold), Test-Flows, eigene Agenten.
 * Reine Helfer ohne Server/React (testbar): Startgraph und Vorlagen der Master-Pipeline, Baustein duplizieren,
 * Speicher (Namen, Zählung), eigene Agenten (Auslöser prüfen und beschreiben, Ergebnis kurz), Melden-Vorschau.
 * Die Drei-Stufen-Freigabe (release_gate.py) läuft unabhängig von jedem Flow immer – hier wird nichts davon berührt.
 */
import {
  GESAMTBESTAND, LIMITS, NODE_META, newNode,
  type Flow, type FlowEdge, type FlowKind, type FlowNode, type Port, type Row,
} from "./flow.ts";
import { MARKETS } from "./agents.ts";
import { InputError } from "./owner-settings.ts";

// ---------------------------------------------------------------------------------------------- Bereiche
export type Bereich = "master" | "test" | "agenten";
export const BEREICHE: { id: Bereich; label: string }[] = [
  { id: "master", label: "Master-Pipeline" }, { id: "test", label: "Test-Flows" }, { id: "agenten", label: "Agenten" },
];
/** ?bereich=… aus der Adresse; Unbekanntes = Test-Flows (wie bisher). */
export const parseBereich = (x: unknown): Bereich => (x === "master" || x === "agenten" ? x : "test");

// ---------------------------------------------------------------------------------------------- Master
export const MASTER_NAME = "Master-Pipeline";
export const GOLD = "#e2c68f";

const E = (id: string, from: string, to: string, port: Port = "out"): FlowEdge => ({ id, from, port, to });
const MQ: FlowNode = { id: "q", x: 40, y: 200, kind: "quelle", source: "leads", segment: null, countries: [], status: ["new"], size: 1000,
  title: "Lead-Werk · alle neuen Leads" };
const MF: FlowNode = { id: "fg", x: 340, y: 200, kind: "freigabe", title: "Drei-Stufen-Freigabe" };

/** Startgraph: Lead-Werk (alle neuen Leads) → Freigabe → Pipeline „Master“ + Speicher „Gesamtbestand“. */
export function masterStart(): Flow {
  return {
    v: 1,
    nodes: [structuredClone(MQ), structuredClone(MF), { id: "p1", x: 660, y: 100, kind: "pipeline", name: "Master" },
      { id: "sp", x: 660, y: 320, kind: "speicher", pool_id: null, pool_name: GESAMTBESTAND }],
    edges: [E("e1", "q", "fg"), E("e2", "fg", "p1"), E("e3", "fg", "sp")],
  };
}

/** Vorlagen für die Master-Pipeline. Speicher ohne pool_id tragen den Wunschnamen (pool_name) – angelegt wird erst
 *  auf Knopfdruck im Prüfer (nie automatisch). */
export const MASTER_TEMPLATES: { id: string; label: string; hint: string; flow: () => Flow }[] = [
  { id: "start", label: "Start: alles in den Gesamtbestand", hint: "Freigabe, Pipeline Master, Gesamtbestand", flow: masterStart },
  { id: "premium", label: "Premium: Telefon + Person → Speicher Premium", hint: "beste Leads in einen eigenen Speicher",
    flow: () => ({ v: 1, nodes: [structuredClone(MQ), structuredClone(MF),
      { id: "f1", x: 640, y: 200, kind: "filter", mode: "alle", title: "Telefon + Person", conds: [{ f: "hat_telefon", op: "ja" }, { f: "hat_person", op: "ja" }] },
      { id: "sp", x: 940, y: 200, kind: "speicher", pool_id: null, pool_name: "Premium", title: "Premium" }],
    edges: [E("e1", "q", "fg"), E("e2", "fg", "f1"), E("e3", "f1", "sp")] }) },
  { id: "frisch", label: "Frisch: ≤ 14 Tage → Speicher Frisch", hint: "neue Ereignisse getrennt sammeln",
    flow: () => ({ v: 1, nodes: [structuredClone(MQ), structuredClone(MF),
      { id: "f1", x: 640, y: 200, kind: "filter", mode: "alle", title: "≤ 14 Tage", conds: [{ f: "alter_tage", op: "lte", v: 14 }] },
      { id: "sp", x: 940, y: 200, kind: "speicher", pool_id: null, pool_name: "Frisch", title: "Frisch" }],
    edges: [E("e1", "q", "fg"), E("e2", "fg", "f1"), E("e3", "f1", "sp")] }) },
  { id: "handy", label: "Weiche Handy: Handy → Speicher Handy", hint: "Handynummern getrennt, Rest bleibt im Gesamtbestand",
    flow: () => ({ v: 1, nodes: [structuredClone(MQ), structuredClone(MF),
      { id: "w1", x: 640, y: 200, kind: "weiche", cond: { f: "telefon_art", op: "ist", v: "mobile" } },
      { id: "sp", x: 940, y: 100, kind: "speicher", pool_id: null, pool_name: "Handy", title: "Handy" },
      { id: "st", x: 940, y: 320, kind: "statistik", by: "land", title: "Rest nach Land" }],
    edges: [E("e1", "q", "fg"), E("e2", "fg", "w1"), E("e3", "w1", "sp", "ja"), E("e4", "w1", "st", "nein")] }) },
];

/** Hat der Flow den Freigabe-Baustein? (Fehlt er, läuft die Drei-Stufen-Freigabe trotzdem – feste Regel.) */
export const hasFreigabe = (f: Flow) => f.nodes.some((n) => n.kind === "freigabe");

/** Speicher ohne pool_id, deren Wunschname einem vorhandenen Speicher entspricht, bekommen dessen id (Groß/klein egal). */
export function resolvePools(f: Flow, pools: { id: string; name: string }[]): Flow {
  const by = new Map(pools.map((p) => [p.name.trim().toLowerCase(), p]));
  return { ...f, nodes: f.nodes.map((n) => {
    if (n.kind !== "speicher" || n.pool_id !== null || n.pool_name === GESAMTBESTAND) return n;
    const p = by.get(n.pool_name.trim().toLowerCase());
    return p ? { ...n, pool_id: p.id, pool_name: p.name } : n;
  }) };
}

/** Speicher, der noch angelegt werden muss (Wunschname ohne id), sonst null. */
export const pendingPool = (n: FlowNode): string | null =>
  n.kind === "speicher" && n.pool_id === null && n.pool_name.trim() !== "" && n.pool_name !== GESAMTBESTAND ? n.pool_name : null;

// ---------------------------------------------------------------------------------------------- Bausteine
/** Kopie eines Bausteins (neue id, leicht versetzt, Titel „… 2“). Quelle und Pipeline gibt es nur einmal → null. */
export function duplicateNode(f: Flow, id: string, newId: string): FlowNode | null {
  const n = f.nodes.find((x) => x.id === id);
  if (!n || n.kind === "quelle" || n.kind === "pipeline" || f.nodes.length >= LIMITS.nodes) return null;
  if (f.nodes.some((x) => x.id === newId)) return null;
  const base = (n.title || NODE_META[n.kind].label).replace(/\s+\d+$/, "");
  const taken = new Set(f.nodes.map((x) => x.title || NODE_META[x.kind].label));
  let k = 2;
  while (taken.has(`${base} ${k}`)) k++;
  const title = `${base.slice(0, LIMITS.title - String(k).length - 1)} ${k}`;
  return { ...structuredClone(n), id: newId, x: n.x + 40, y: n.y + 60, title };
}

/** Logik eines Flows ohne Lage und Titel (Verschieben/Umbenennen ändert keine Regel). */
export function logicSig(f: Flow): string {
  const nodes = f.nodes.map(({ x: _x, y: _y, title: _t, ...r }) => r).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const edges = f.edges.map(({ from, port, to }) => `${from}:${port}>${to}`).sort();
  return JSON.stringify([nodes, edges]);
}

/** Leerer Flow mit nur einer Quelle (für „Neu: leer“). */
export const blankFlow = (): Flow => ({ v: 1, nodes: [newNode("quelle", "q", 40, 160)], edges: [] });

// ---------------------------------------------------------------------------------------------- Speicher
export type PoolInfo = { id: string; name: string; color: string | null; n: number; byCountry: Record<string, number> };

/** Name eines neuen Speichers: 1–40 Zeichen, Leerraum zusammengefasst, nicht „Gesamtbestand“. */
export function checkPoolName(x: unknown): string {
  const name = String(x ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > LIMITS.pool) throw new InputError(`Speicher-Name: 1 bis ${LIMITS.pool} Zeichen`);
  if (name.toLowerCase() === GESAMTBESTAND.toLowerCase()) throw new InputError(`„${GESAMTBESTAND}“ gibt es schon (alle Leads)`);
  return name;
}

/** Speicher + Zählung (RPC pool_counts: je Speicher, Land, Zielgruppe) → je Speicher gesamt und je Land. */
export function poolInfos(pools: { id: unknown; name: unknown; color?: unknown }[], counts: { pool_id: unknown; country: unknown; n: unknown }[]): PoolInfo[] {
  const m = new Map<string, PoolInfo>();
  for (const p of pools) {
    const id = String(p.id ?? "");
    if (id) m.set(id, { id, name: String(p.name ?? ""), color: typeof p.color === "string" ? p.color : null, n: 0, byCountry: {} });
  }
  for (const c of counts) {
    const p = m.get(String(c.pool_id ?? ""));
    const n = Number(c.n);
    if (!p || !Number.isFinite(n)) continue;
    p.n += n;
    const land = String(c.country ?? "–") || "–";
    p.byCountry[land] = (p.byCountry[land] ?? 0) + n;
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "de"));
}

// ---------------------------------------------------------------------------------------------- Melden
/** Vorschau der Nachricht an den Inhaber: Anzahl + bis zu 10 Firmennamen. */
export function meldenPreview(rows: Row[], flowName: string): string {
  if (!rows.length) return `${flowName}: nichts Neues.`;
  const names = [...new Set(rows.map((r) => String(r.firma ?? "").trim()).filter(Boolean))].slice(0, 10);
  const more = rows.length - names.length;
  return `${flowName}: ${rows.length.toLocaleString("de-DE")} ${rows.length === 1 ? "Lead" : "Leads"}${names.length ? ` – ${names.join(", ")}` : ""}${more > 0 && names.length ? ` … (+${more.toLocaleString("de-DE")})` : ""}`;
}

// ---------------------------------------------------------------------------------------------- Agenten
export type Trigger = "stuendlich" | "taeglich" | "neue_leads";
export const TRIGGERS: { v: Trigger; label: string }[] = [
  { v: "taeglich", label: "täglich" }, { v: "stuendlich", label: "stündlich" }, { v: "neue_leads", label: "bei neuen Leads" },
];
export type AgentInput = { name: string; trigger: Trigger; at_hour: number | null; ai_brief: string | null; ai_market: string | null };
export type CustomAgent = AgentInput & {
  id: string; flow_id: string; enabled: boolean; archived: boolean; last_run_at: string | null; last_result: unknown; updated_at: string | null;
};

/** Eingaben eines eigenen Agenten prüfen (Server und Browser gleich). Uhrzeit in deutscher Zeit, nur bei „täglich“. */
export function parseAgentInput(x: unknown): AgentInput {
  const o = (typeof x === "object" && x !== null && !Array.isArray(x) ? x : {}) as Record<string, unknown>;
  const name = String(o.name ?? "").trim().replace(/\s+/g, " ");
  if (name.length < 1 || name.length > 60) throw new InputError("Name: 1 bis 60 Zeichen");
  const trigger = String(o.trigger ?? "") as Trigger;
  if (!TRIGGERS.some((t) => t.v === trigger)) throw new InputError("Auslöser wählen");
  let at_hour: number | null = null;
  if (trigger === "taeglich") {
    const h = Number(o.at_hour);
    if (o.at_hour === null || o.at_hour === undefined || o.at_hour === "" || !Number.isInteger(h) || h < 0 || h > 23) throw new InputError("Uhrzeit 0 bis 23");
    at_hour = h;
  }
  const brief = String(o.ai_brief ?? "").trim().replace(/\s+/g, " ");
  if (brief.length > 1000) throw new InputError("KI-Auftrag: höchstens 1000 Zeichen");
  if (brief && brief.length < 3) throw new InputError("KI-Auftrag: mindestens 3 Zeichen");
  const m = String(o.ai_market ?? "").trim().toUpperCase();
  const ai_market = m === "" || m === "ALLE" ? null : m;
  if (ai_market && !(MARKETS as readonly string[]).includes(ai_market)) throw new InputError("Markt unbekannt");
  return { name, trigger, at_hour, ai_brief: brief || null, ai_market };
}

/** Markt passend zur Quelle vorschlagen: genau ein Land → dieses Land (z. B. UK-Käufer → UK), sonst alle. */
export function suggestMarket(f: Flow): string | null {
  const q = f.nodes.find((n) => n.kind === "quelle");
  if (!q || q.kind !== "quelle" || q.countries.length !== 1) return null;
  return (MARKETS as readonly string[]).includes(q.countries[0]) ? q.countries[0] : null;
}

/** „täglich um 7 Uhr“, „stündlich“, „bei neuen Leads“. */
export function describeTrigger(t: Trigger, h: number | null): string {
  if (t === "taeglich") return h === null ? "täglich" : `täglich um ${h} Uhr`;
  return TRIGGERS.find((x) => x.v === t)?.label ?? t;
}

/** Letztes Ergebnis kurz (Form von agents_run.py offen): Text, Fehler oder Zahlen „Leads 12 · Speicher 5“. */
export function resultShort(x: unknown): string {
  if (x === null || x === undefined) return "noch nicht gelaufen";
  if (typeof x === "string") return x.slice(0, 80) || "–";
  if (typeof x !== "object" || Array.isArray(x)) return "–";
  const o = x as Record<string, unknown>;
  if (typeof o.error === "string" && o.error) return `Fehler: ${o.error.slice(0, 70)}`;
  for (const k of ["text", "summary", "msg"]) if (typeof o[k] === "string" && o[k]) return String(o[k]).slice(0, 80);
  const LABEL: Record<string, string> = { rows_in: "rein", rows: "Zeilen", leads: "Leads", speicher: "Speicher", added: "neu im Speicher",
    gemeldet: "gemeldet", melden: "gemeldet", export: "Export", tasks: "Aufträge", auftraege: "Aufträge" };
  const parts = Object.entries(o).filter(([, v]) => typeof v === "number" && Number.isFinite(v))
    .map(([k, v]) => `${LABEL[k] ?? k} ${(v as number).toLocaleString("de-DE")}`);
  return parts.slice(0, 4).join(" · ") || "–";
}

/** Flow-Art im Editor → Text für den Status-Chip. */
export const kindLabel = (k: FlowKind) => (k === "master" ? "Master" : k === "agent" ? "Agent" : "Test");

/**
 * Baukasten (Inhaber 03.10.2026: „Flows per Drag & Drop selber bauen … nicht nur Filter, auch andere Elemente“).
 * Reines Modul ohne Server-/React-Abhängigkeiten: Format eines Flows, Felder, Bedingungen, Auswertung im Browser
 * und im Server, Prüfung (problems) und Vorlagen. Python (scripts/lib/owner_rules.py) wertet dieselben Bedingungen
 * je Lead aus – gleiche Semantik, gemeinsame Testfälle in tests/fixtures/flow_cases.json.
 * Inhaber-Regeln machen die Freigabe nur strenger: ein Lead im Geltungsbereich muss den Pipeline-Baustein erreichen.
 * Master-Pipeline und eigene Agenten (docs/BAUKASTEN-MASTER.md): „freigabe“ markiert die Drei-Stufen-Freigabe (läuft immer,
 * release_gate.py), „speicher“ legt Leads in einen eigenen Speicher, „melden“ schickt dem Inhaber eine kurze Nachricht.
 */
import { KINDS, OWNER_KINDS } from "./agents.ts";
import type { IconName } from "../app/icons.tsx";

export type Source = "leads" | "kaeufer";
export type FieldType = "enum" | "text" | "num" | "bool";
export type FieldDef = { key: string; label: string; type: FieldType; sources: Source[]; gate: boolean;
  options?: { v: string; label: string }[]; unit?: string; hint?: string };

const L: Source[] = ["leads"], K: Source[] = ["kaeufer"], LK: Source[] = ["leads", "kaeufer"];
const opts = (o: Record<string, string>) => Object.entries(o).map(([v, label]) => ({ v, label }));
const LANDS = opts({ US: "US", UK: "UK", FR: "FR", IE: "IE", NL: "NL", BE: "BE", SE: "SE", FI: "FI", SG: "SG", HK: "HK", MX: "MX", BR: "BR" });
const SEGS = opts({ S1: "S1 Personal", S2: "S2 Webagenturen", S3: "S3 IT", S4: "S4 Versicherung", S5: "S5 Buchhaltung",
  S6: "S6 Büro", S7: "S7 Reinigung", S8: "S8 Deutschland", S9: "S9 Finanzberater" });

export const FIELDS: FieldDef[] = [
  { key: "land", label: "Land", type: "enum", sources: LK, gate: true, options: LANDS },
  { key: "segment", label: "Zielgruppe", type: "enum", sources: LK, gate: true, options: SEGS },
  { key: "signal", label: "Signal", type: "enum", sources: L, gate: true, options: opts({ no_website: "keine Website",
    website_outdated: "Website veraltet", website_not_mobile: "nicht mobil", no_https: "kein HTTPS", website_broken: "Website kaputt",
    new_incorporation: "Neugründung", incorporation: "Gründung", new_company: "neue Firma", funding_growth: "Wachstum",
    new_fleet: "neue Flotte", job_open_30d: "Stelle 30+ Tage", jobs_3plus: "3+ Stellen", contract_award: "Auftrag gewonnen" }) },
  { key: "dringlichkeit", label: "Dringlichkeit", type: "enum", sources: L, gate: true, options: opts({ high: "hoch", medium: "mittel", low: "niedrig" }) },
  { key: "status", label: "Status", type: "enum", sources: L, gate: false, hint: "nur für Auswertungen – die Freigabe entscheidet den Status",
    options: opts({ new: "neu", reserved: "in Proben", sample: "in Probe geliefert", delivered: "geliefert", held: "zurückgehalten", expired: "abgelaufen" }) },
  { key: "quelle", label: "Quelle", type: "text", sources: L, gate: true },
  { key: "alter_tage", label: "Alter (Tage)", type: "num", sources: LK, gate: true, unit: "Tage", hint: "seit dem Ereignis (Käufer: seit Erfassung)" },
  { key: "erfasst_tage", label: "Erfasst vor (Tagen)", type: "num", sources: L, gate: true, unit: "Tagen" },
  { key: "firma", label: "Firmenname", type: "text", sources: LK, gate: true },
  { key: "rechtsform", label: "Rechtsform", type: "text", sources: LK, gate: true },
  { key: "ort", label: "Ort", type: "text", sources: L, gate: true },
  { key: "region", label: "Region", type: "text", sources: LK, gate: true },
  { key: "branche", label: "Branche", type: "text", sources: L, gate: true },
  { key: "text", label: "Ereignis-Text", type: "text", sources: L, gate: true },
  { key: "hat_website", label: "Website vorhanden", type: "bool", sources: LK, gate: true },
  { key: "hat_telefon", label: "Telefon vorhanden", type: "bool", sources: LK, gate: true },
  { key: "telefon_art", label: "Telefon-Art", type: "enum", sources: L, gate: true,
    options: opts({ mobile: "Handy", landline: "Festnetz", landline_or_mobile: "Festnetz/Handy", toll_free: "gebührenfrei" }) },
  { key: "hat_email", label: "E-Mail vorhanden", type: "bool", sources: LK, gate: true },
  { key: "email_art", label: "E-Mail-Art", type: "enum", sources: L, gate: true, options: opts({ company_domain: "Firmen-Domain", freemail: "Freemail" }) },
  { key: "hat_person", label: "Ansprechperson", type: "bool", sources: L, gate: true },
  { key: "rolle", label: "Rolle", type: "text", sources: L, gate: true },
  { key: "vollstaendig", label: "Daten vollständig", type: "bool", sources: L, gate: true },
  { key: "geprueft", label: "Freigabe", type: "enum", sources: L, gate: false, hint: "letztes Prüfergebnis – nur für Auswertungen",
    options: opts({ released: "freigegeben", failed: "durchgefallen" }) },
  { key: "email_generisch", label: "Allgemeine E-Mail", type: "bool", sources: K, gate: false },
  { key: "pruefung", label: "Prüfung", type: "enum", sources: K, gate: false, hint: "nur „ok“ zählt als Käufer",
    options: opts({ ok: "mail-fähig", call_only: "nur Anruf/Brief", rejected: "abgelehnt" }) },
  { key: "grund", label: "Prüfgrund", type: "text", sources: K, gate: false },
  { key: "spezialisierung", label: "Spezialisierung", type: "text", sources: K, gate: false },
  { key: "angeschrieben", label: "Angeschrieben", type: "bool", sources: K, gate: false },
  { key: "punkte", label: "Punkte", type: "num", sources: LK, gate: true, hint: "aus einem Punkte-Baustein davor" },
];
const BY_KEY = new Map(FIELDS.map((f) => [f.key, f]));
export const fieldsFor = (source: Source) => FIELDS.filter((f) => f.sources.includes(source));
export const fieldDef = (key: string) => BY_KEY.get(key);

export type Op = "ist" | "ist_nicht" | "in" | "nicht_in" | "enthaelt" | "enthaelt_nicht" | "beginnt" | "vorhanden" | "fehlt"
  | "gt" | "gte" | "lt" | "lte" | "zwischen" | "ja" | "nein";
export const OPS: Record<FieldType, { op: Op; label: string; arity: 0 | 1 | "list" | 2 }[]> = {
  enum: [{ op: "ist", label: "ist", arity: 1 }, { op: "ist_nicht", label: "ist nicht", arity: 1 },
    { op: "in", label: "ist eins von", arity: "list" }, { op: "nicht_in", label: "ist keins von", arity: "list" }],
  text: [{ op: "enthaelt", label: "enthält", arity: 1 }, { op: "enthaelt_nicht", label: "enthält nicht", arity: 1 },
    { op: "ist", label: "ist", arity: 1 }, { op: "ist_nicht", label: "ist nicht", arity: 1 }, { op: "beginnt", label: "beginnt mit", arity: 1 },
    { op: "vorhanden", label: "vorhanden", arity: 0 }, { op: "fehlt", label: "fehlt", arity: 0 }],
  num: [{ op: "gt", label: ">", arity: 1 }, { op: "gte", label: "≥", arity: 1 }, { op: "lt", label: "<", arity: 1 },
    { op: "lte", label: "≤", arity: 1 }, { op: "ist", label: "=", arity: 1 }, { op: "zwischen", label: "zwischen", arity: 2 }],
  bool: [{ op: "ja", label: "ja", arity: 0 }, { op: "nein", label: "nein", arity: 0 }],
};
const ALL_OPS = new Set<string>(Object.values(OPS).flat().map((o) => o.op));
const opInfo = (t: FieldType, op: string) => OPS[t].find((o) => o.op === op);

export type Cond = { f: string; op: Op; v?: string | number | string[] | [number, number] };
export type Cell = string | number | boolean | null;
export type Row = { id: string } & Record<string, Cell>;

export type NodeKind = "quelle" | "filter" | "weiche" | "punkte" | "top" | "dubletten" | "statistik" | "freigabe" | "pipeline" | "export"
  | "agent" | "speicher" | "melden";
/** Art eines gespeicherten Flows (signalwerk.flows.kind). */
export type FlowKind = "test" | "master" | "agent";
export const FLOW_KINDS: FlowKind[] = ["test", "master", "agent"];
type Base = { id: string; x: number; y: number; title?: string };
export type TopSort = "neueste" | "aelteste" | "punkte" | "dringlichkeit";
export type AgentTaskKind = "leads" | "kaeufer" | "quelle" | "pruefen" | "frage";
export type FlowNode =
  | (Base & { kind: "quelle"; source: Source; segment: string | null; countries: string[]; status: string[]; size: 1000 | 2000 | 5000 })
  | (Base & { kind: "filter"; mode: "alle" | "eine"; conds: Cond[] })
  | (Base & { kind: "weiche"; cond: Cond | null })
  | (Base & { kind: "punkte"; rules: { cond: Cond; pts: number }[]; min: number | null })
  | (Base & { kind: "top"; sort: TopSort; n: number })
  | (Base & { kind: "dubletten"; by: "firma_id" | "name" })
  | (Base & { kind: "statistik"; by: string })
  | (Base & { kind: "freigabe" })
  | (Base & { kind: "pipeline"; name: string })
  | (Base & { kind: "export" })
  | (Base & { kind: "agent"; agent: number; task: AgentTaskKind })
  /** pool_id null = Gesamtbestand (alle Leads, kein eigener Speicher) */
  | (Base & { kind: "speicher"; pool_id: string | null; pool_name: string })
  | (Base & { kind: "melden" });
export type Port = "out" | "ja" | "nein";
export type FlowEdge = { id: string; from: string; port: Port; to: string };
export type Flow = { v: 1; nodes: FlowNode[]; edges: FlowEdge[] };

export const NODE_META: Record<NodeKind, { label: string; icon: IconName; color: string; group: "quelle" | "schritt" | "ziel";
  hint: string; ports: Port[]; input: boolean }> = {
  quelle: { label: "Quelle", icon: "quelle", color: "#5fd4ff", group: "quelle", hint: "Leads oder Käufer aus der Datenbank", ports: ["out"], input: false },
  filter: { label: "Filter", icon: "filter", color: "#a8ecff", group: "schritt", hint: "lässt nur passende durch", ports: ["out"], input: true },
  weiche: { label: "Weiche", icon: "weiche", color: "#ffb547", group: "schritt", hint: "teilt in ja und nein", ports: ["ja", "nein"], input: true },
  punkte: { label: "Punkte", icon: "punkte", color: "#e2c68f", group: "schritt", hint: "vergibt Punkte, optional Mindestwert", ports: ["out"], input: true },
  top: { label: "Top", icon: "top", color: "#f2dcae", group: "schritt", hint: "sortiert und nimmt die ersten", ports: ["out"], input: true },
  dubletten: { label: "Dubletten", icon: "dubletten", color: "#a8ecff", group: "schritt", hint: "je Firma nur einmal", ports: ["out"], input: true },
  statistik: { label: "Statistik", icon: "statistik", color: "#5fd4ff", group: "schritt", hint: "zählt nach einem Feld, lässt alles durch", ports: ["out"], input: true },
  freigabe: { label: "Freigabe", icon: "schloss", color: "#e2c68f", group: "schritt", hint: "Drei-Stufen-Freigabe – läuft immer", ports: ["out"], input: true },
  pipeline: { label: "Pipeline", icon: "pipeline", color: "#3ddc97", group: "ziel", hint: "Regel für alle neuen Leads (nur strenger)", ports: [], input: true },
  export: { label: "Export", icon: "export", color: "#5fd4ff", group: "ziel", hint: "als CSV herunterladen", ports: [], input: true },
  agent: { label: "Agent", icon: "agent", color: "#e2c68f", group: "ziel", hint: "Auftrag an Agent 1–4", ports: [], input: true },
  speicher: { label: "Speicher", icon: "speicher", color: "#3ddc97", group: "ziel", hint: "legt Leads in einen Speicher", ports: [], input: true },
  melden: { label: "Melden", icon: "melden", color: "#ffb547", group: "ziel", hint: "kurze Nachricht an dich", ports: [], input: true },
};
export const NODE_KINDS = Object.keys(NODE_META) as NodeKind[];
export const SORT_LABELS: Record<TopSort, string> = { neueste: "neueste zuerst", aelteste: "älteste zuerst", punkte: "meiste Punkte", dringlichkeit: "dringendste zuerst" };
const isSink = (k: NodeKind) => NODE_META[k].ports.length === 0;

export const LIMITS = { nodes: 40, edges: 80, conds: 12, rules: 12, pts: 100, n: 5000, str: 200, list: 50, name: 60, title: 60, min: 10000, pool: 40 } as const;
/** Name des Speichers ohne pool_id (alle Leads). */
export const GESAMTBESTAND = "Gesamtbestand";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Neuer Baustein mit sinnvollen Vorgaben (Felder, die es bei Leads und Käufern gibt). */
export function newNode(kind: NodeKind, id: string, x: number, y: number): FlowNode {
  const b = { id, x, y };
  switch (kind) {
    case "quelle": return { ...b, kind, source: "leads", segment: "S2", countries: ["US"], status: ["new"], size: 1000 };
    case "filter": return { ...b, kind, mode: "alle", conds: [{ f: "hat_telefon", op: "ja" }] };
    case "weiche": return { ...b, kind, cond: { f: "hat_email", op: "ja" } };
    case "punkte": return { ...b, kind, rules: [{ cond: { f: "hat_telefon", op: "ja" }, pts: 2 }], min: null };
    case "top": return { ...b, kind, sort: "neueste", n: 100 };
    case "dubletten": return { ...b, kind, by: "firma_id" };
    case "statistik": return { ...b, kind, by: "land" };
    case "freigabe": return { ...b, kind };
    case "pipeline": return { ...b, kind, name: "Meine Regel" };
    case "export": return { ...b, kind };
    case "agent": return { ...b, kind, agent: 1, task: "leads" };
    case "speicher": return { ...b, kind, pool_id: null, pool_name: GESAMTBESTAND };
    case "melden": return { ...b, kind };
  }
}

// ---------- Strukturprüfung (Eingaben vom Browser nie blind übernehmen) ----------
const ID_RE = /^[a-z0-9_-]{1,24}$/;
const TASKS = OWNER_KINDS as AgentTaskKind[];
type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj => typeof x === "object" && x !== null && !Array.isArray(x);
const isStr = (x: unknown, max: number = LIMITS.str): x is string => typeof x === "string" && x.length <= max;
const isNum = (x: unknown): x is number => typeof x === "number" && Number.isFinite(x);
const clampXY = (n: number) => Math.max(-10000, Math.min(10000, n));

function parseCond(x: unknown, where: string, errs: string[]): Cond | null {
  if (!isObj(x)) { errs.push(`${where}: Bedingung fehlt`); return null; }
  if (!isStr(x.f, 40) || !x.f) { errs.push(`${where}: Feld ungültig`); return null; }
  if (typeof x.op !== "string" || !ALL_OPS.has(x.op)) { errs.push(`${where}: Vergleich ungültig`); return null; }
  const c: Cond = { f: x.f, op: x.op as Op };
  const v = x.v;
  if (v === undefined || v === null) return c;
  if (isStr(v) || isNum(v)) c.v = v;
  else if (Array.isArray(v) && v.length === 2 && v.every(isNum)) c.v = [v[0], v[1]] as [number, number];
  else if (Array.isArray(v) && v.length <= LIMITS.list && v.every((s) => isStr(s))) c.v = [...(v as string[])];
  else { errs.push(`${where}: Wert ungültig`); return null; }
  return c;
}

function parseNode(x: unknown, i: number, errs: string[]): FlowNode | null {
  const w = `Baustein ${i + 1}`;
  if (!isObj(x)) { errs.push(`${w}: kein Objekt`); return null; }
  if (typeof x.id !== "string" || !ID_RE.test(x.id)) { errs.push(`${w}: id ungültig`); return null; }
  if (typeof x.kind !== "string" || !(x.kind in NODE_META)) { errs.push(`${w}: Art unbekannt`); return null; }
  if (!isNum(x.x) || !isNum(x.y)) { errs.push(`${w}: Position ungültig`); return null; }
  const b: Base = { id: x.id, x: clampXY(x.x), y: clampXY(x.y) };
  if (x.title !== undefined && x.title !== null && x.title !== "") {
    if (!isStr(x.title, LIMITS.title)) { errs.push(`${w}: Titel zu lang`); return null; }
    b.title = x.title;
  }
  const bad = (m: string) => { errs.push(`${w}: ${m}`); return null; };
  const strList = (v: unknown, max: number) => Array.isArray(v) && v.length <= max && v.every((s) => isStr(s, 20));
  switch (x.kind as NodeKind) {
    case "quelle": {
      if (x.source !== "leads" && x.source !== "kaeufer") return bad("Quelle unbekannt");
      if (x.segment !== null && !isStr(x.segment, 20)) return bad("Zielgruppe ungültig");
      if (!strList(x.countries, LIMITS.list) || !strList(x.status, LIMITS.list)) return bad("Länder/Status ungültig");
      if (x.size !== 1000 && x.size !== 2000 && x.size !== 5000) return bad("Stichprobe ungültig");
      return { ...b, kind: "quelle", source: x.source, segment: (x.segment as string | null) || null,
        countries: [...(x.countries as string[])], status: [...(x.status as string[])], size: x.size };
    }
    case "filter": {
      if (x.mode !== "alle" && x.mode !== "eine") return bad("Modus ungültig");
      if (!Array.isArray(x.conds) || x.conds.length > LIMITS.conds) return bad(`höchstens ${LIMITS.conds} Bedingungen`);
      const conds = x.conds.map((c, j) => parseCond(c, `${w}/${j + 1}`, errs));
      return conds.every(Boolean) ? { ...b, kind: "filter", mode: x.mode, conds: conds as Cond[] } : null;
    }
    case "weiche": {
      if (x.cond === null || x.cond === undefined) return { ...b, kind: "weiche", cond: null };
      const cond = parseCond(x.cond, w, errs);
      return cond ? { ...b, kind: "weiche", cond } : null;
    }
    case "punkte": {
      if (!Array.isArray(x.rules) || x.rules.length > LIMITS.rules) return bad(`höchstens ${LIMITS.rules} Regeln`);
      if (x.min !== null && x.min !== undefined && !isNum(x.min)) return bad("Mindestwert ungültig");
      const rules: { cond: Cond; pts: number }[] = [];
      for (const [j, r] of x.rules.entries()) {
        if (!isObj(r) || !isNum(r.pts)) return bad(`Regel ${j + 1}: Punkte ungültig`);
        const cond = parseCond(r.cond, `${w}/${j + 1}`, errs);
        if (!cond) return null;
        rules.push({ cond, pts: r.pts });
      }
      return { ...b, kind: "punkte", rules, min: isNum(x.min) ? x.min : null };
    }
    case "top":
      if (typeof x.sort !== "string" || !(x.sort in SORT_LABELS)) return bad("Sortierung ungültig");
      if (!isNum(x.n)) return bad("Anzahl ungültig");
      return { ...b, kind: "top", sort: x.sort as TopSort, n: x.n };
    case "dubletten":
      if (x.by !== "firma_id" && x.by !== "name") return bad("Dubletten-Art ungültig");
      return { ...b, kind: "dubletten", by: x.by };
    case "statistik":
      if (!isStr(x.by, 40) || !x.by) return bad("Feld ungültig");
      return { ...b, kind: "statistik", by: x.by };
    case "freigabe": return { ...b, kind: "freigabe" };
    case "pipeline":
      if (!isStr(x.name)) return bad("Name ungültig");
      return { ...b, kind: "pipeline", name: x.name };
    case "export": return { ...b, kind: "export" };
    case "agent":
      if (!isNum(x.agent)) return bad("Agent ungültig");
      if (typeof x.task !== "string" || !TASKS.includes(x.task as AgentTaskKind)) return bad("Auftragsart ungültig");
      return { ...b, kind: "agent", agent: x.agent, task: x.task as AgentTaskKind };
    case "speicher":
      if (x.pool_id !== null && !(typeof x.pool_id === "string" && UUID_RE.test(x.pool_id))) return bad("Speicher ungültig");
      if (!isStr(x.pool_name, LIMITS.pool)) return bad("Speicher-Name ungültig");
      return { ...b, kind: "speicher", pool_id: x.pool_id === null ? null : x.pool_id.toLowerCase(), pool_name: x.pool_name };
    case "melden": return { ...b, kind: "melden" };
  }
}

/** Strenge Strukturprüfung: Typen, Arten, ids, Grenzen. Fachliche Fehler meldet problems(). */
export function parseFlow(x: unknown): { ok: true; flow: Flow } | { ok: false; errors: string[] } {
  const errs: string[] = [];
  if (!isObj(x) || x.v !== 1) return { ok: false, errors: ["kein Flow (v: 1 fehlt)"] };
  if (!Array.isArray(x.nodes) || !Array.isArray(x.edges)) return { ok: false, errors: ["nodes/edges fehlen"] };
  if (x.nodes.length > LIMITS.nodes) return { ok: false, errors: [`höchstens ${LIMITS.nodes} Bausteine`] };
  if (x.edges.length > LIMITS.edges) return { ok: false, errors: [`höchstens ${LIMITS.edges} Verbindungen`] };
  const nodes = x.nodes.map((n, i) => parseNode(n, i, errs)).filter((n): n is FlowNode => n !== null);
  const ids = new Set<string>();
  for (const n of nodes) { if (ids.has(n.id)) errs.push(`id doppelt: ${n.id}`); ids.add(n.id); }
  const edges: FlowEdge[] = [];
  const eids = new Set<string>();
  for (const [i, e] of x.edges.entries()) {
    const w = `Verbindung ${i + 1}`;
    if (!isObj(e) || typeof e.id !== "string" || !ID_RE.test(e.id)) { errs.push(`${w}: id ungültig`); continue; }
    if (eids.has(e.id)) { errs.push(`Verbindung doppelt: ${e.id}`); continue; }
    eids.add(e.id);
    if (typeof e.from !== "string" || !ID_RE.test(e.from) || typeof e.to !== "string" || !ID_RE.test(e.to)) { errs.push(`${w}: Enden ungültig`); continue; }
    if (e.port !== "out" && e.port !== "ja" && e.port !== "nein") { errs.push(`${w}: Anschluss ungültig`); continue; }
    edges.push({ id: e.id, from: e.from, port: e.port, to: e.to });
  }
  return errs.length ? { ok: false, errors: errs } : { ok: true, flow: { v: 1, nodes, edges } };
}

// ---------- Bedingungen (identisch in Python) ----------
export const norm = (s: string) => s.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
// Leerraum = String.prototype.trim (Python: owner_rules.WS, gleiche Liste). Zahlen aus Text nur in dieser Schreibweise
// (kein 0x…, kein 1_000) – Python: owner_rules._NUM_RE.
const missing = (x: unknown) => x === null || x === undefined || (typeof x === "string" && x.trim() === "");
const NUM_RE = /^[ \t\n\r]*[+-]?(\d+(\.\d*)?|\.\d+)([eE][+-]?\d+)?[ \t\n\r]*$/;
const toNum = (v: unknown) => (typeof v === "number" ? v : typeof v === "string" && NUM_RE.test(v) ? Number(v) : NaN);

/** Eine Bedingung für eine Zeile. Unbekanntes Feld/unbekannter Vergleich → false (strenger, nie lockerer). */
export function evalCond(c: Cond, row: Row): boolean {
  const def = BY_KEY.get(c?.f);
  if (!def || !opInfo(def.type, c.op)) return false;
  const x = row[c.f], v = c.v;
  const s = (y: unknown) => String(y ?? "");
  switch (def.type) {
    case "bool": return c.op === "ja" ? x === true : x !== true;
    case "enum": {
      const isIn = () => Array.isArray(v) && v.map(String).includes(s(x));
      switch (c.op) {
        case "ist": return !missing(x) && s(x) === s(v);
        case "ist_nicht": return missing(x) || s(x) !== s(v);
        case "in": return !missing(x) && isIn();
        case "nicht_in": return missing(x) || (Array.isArray(v) && !isIn());
      }
      return false;
    }
    case "text": {
      const has = () => !missing(x) && norm(s(x)).includes(norm(s(v)));
      const is = () => !missing(x) && norm(s(x)) === norm(s(v));
      switch (c.op) {
        case "enthaelt": return has();
        case "enthaelt_nicht": return !has();
        case "ist": return is();
        case "ist_nicht": return !is();
        case "beginnt": return !missing(x) && norm(s(x)).startsWith(norm(s(v)));
        case "vorhanden": return !missing(x);
        case "fehlt": return missing(x);
      }
      return false;
    }
    case "num": {
      const n = typeof x === "number" ? x : NaN; // Zeilenwert nur als echte Zahl (wie Python _finite)
      if (!Number.isFinite(n)) return false;
      if (c.op === "zwischen") {
        if (!Array.isArray(v) || v.length !== 2) return false;
        const a = toNum(v[0]), b = toNum(v[1]);
        return Number.isFinite(a) && Number.isFinite(b) && n >= a && n <= b;
      }
      const w = toNum(v);
      if (!Number.isFinite(w)) return false;
      switch (c.op) {
        case "gt": return n > w;
        case "gte": return n >= w;
        case "lt": return n < w;
        case "lte": return n <= w;
        case "ist": return n === w;
      }
      return false;
    }
  }
}

// ---------- Graph ----------
type Graph = { byId: Map<string, FlowNode>; edges: FlowEdge[]; quelle: FlowNode | null };
/** Nur gültige Verbindungen: beide Enden bekannt, Anschluss passt, nicht aus einem Ziel, nicht in eine Quelle. */
function graph(flow: Flow): Graph {
  const byId = new Map<string, FlowNode>();
  for (const n of flow.nodes) if (!byId.has(n.id)) byId.set(n.id, n);
  const edges = flow.edges.filter((e) => {
    const a = byId.get(e.from), b = byId.get(e.to);
    return !!a && !!b && NODE_META[a.kind].ports.includes(e.port) && NODE_META[b.kind].input;
  });
  return { byId, edges, quelle: flow.nodes.find((n) => n.kind === "quelle") ?? null };
}
function reachableFrom(g: Graph, start: string, dir: "down" | "up") {
  const seen = new Set([start]), todo = [start];
  while (todo.length) {
    const id = todo.pop()!;
    for (const e of g.edges) {
      const [a, b] = dir === "down" ? [e.from, e.to] : [e.to, e.from];
      if (a === id && !seen.has(b)) { seen.add(b); todo.push(b); }
    }
  }
  return seen;
}

export type NodeResult = { connected: boolean; in: number; out: number; ports?: { ja: number; nein: number };
  ids: string[]; stats?: { key: string; n: number }[] };
/** Zeilen je Baustein: Eingang und Ausgang je Anschluss (für Vorschau, Export, Aufschlüsselung). */
export type NodeRows = { connected: boolean; input: Row[]; out: Row[]; ja?: Row[]; nein?: Row[]; stats?: { key: string; n: number }[] };

const URG: Record<string, number> = { high: 3, medium: 2, low: 1 };
const numOr = (x: Cell | undefined, d: number) => (typeof x === "number" && Number.isFinite(x) ? x : d);
const ascMissingLast = (a: Cell | undefined, b: Cell | undefined) => {
  const x = typeof a === "number" && Number.isFinite(a), y = typeof b === "number" && Number.isFinite(b);
  return x && y ? (a as number) - (b as number) : x ? -1 : y ? 1 : 0;
};
function sortRows(rows: Row[], sort: TopSort): Row[] {
  const r = [...rows];
  const cmp: Record<TopSort, (a: Row, b: Row) => number> = {
    neueste: (a, b) => ascMissingLast(a.erfasst_tage, b.erfasst_tage),
    aelteste: (a, b) => ascMissingLast(typeof a.erfasst_tage === "number" ? -a.erfasst_tage : null, typeof b.erfasst_tage === "number" ? -b.erfasst_tage : null),
    punkte: (a, b) => numOr(b.punkte, 0) - numOr(a.punkte, 0),
    dringlichkeit: (a, b) => (URG[String(b.dringlichkeit)] ?? 0) - (URG[String(a.dringlichkeit)] ?? 0) || ascMissingLast(a.erfasst_tage, b.erfasst_tage),
  };
  return r.sort(cmp[sort]);
}

/** Zählung nach einem Feld (fehlend → „–“, ja/nein für Häkchen), absteigend, höchstens `limit`. */
export function countBy(rows: Row[], key: string, limit = 12): { key: string; n: number }[] {
  const m = new Map<string, number>();
  for (const r of rows) {
    const x = r[key];
    const k = typeof x === "boolean" ? (x ? "ja" : "nein") : missing(x) ? "–" : String(x);
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m].map(([k, n]) => ({ key: k, n })).sort((a, b) => b.n - a.n || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0)).slice(0, limit);
}

/** Eingänge vereinen: je id die erste Ankunft, Punkte = Maximum der Ankünfte. */
function merge(arrivals: Row[][]): Row[] {
  const out: Row[] = [], at = new Map<string, number>();
  for (const rows of arrivals) for (const r of rows) {
    const i = at.get(r.id);
    if (i === undefined) { at.set(r.id, out.length); out.push(r); continue; }
    const a = out[i].punkte, b = r.punkte;
    if (typeof b === "number" && (typeof a !== "number" || b > a)) out[i] = { ...out[i], punkte: b };
  }
  return out;
}

function step(n: FlowNode, input: Row[]): { out: Row[]; ja?: Row[]; nein?: Row[]; stats?: { key: string; n: number }[] } {
  switch (n.kind) {
    case "filter":
      return { out: n.conds.length === 0 ? input : input.filter((r) => n.mode === "alle" ? n.conds.every((c) => evalCond(c, r)) : n.conds.some((c) => evalCond(c, r))) };
    case "weiche": {
      const ja: Row[] = [], nein: Row[] = [];
      for (const r of input) (n.cond === null || evalCond(n.cond, r) ? ja : nein).push(r);
      return { out: [...ja, ...nein], ja, nein };
    }
    case "punkte": {
      const out: Row[] = [];
      for (const r of input) {
        const p = numOr(r.punkte, 0) + n.rules.reduce((s, x) => s + (evalCond(x.cond, r) ? x.pts : 0), 0);
        if (n.min === null || p >= n.min) out.push({ ...r, punkte: p });
      }
      return { out };
    }
    case "top": return { out: sortRows(input, n.sort).slice(0, Math.max(0, Math.floor(n.n))) };
    case "dubletten": {
      const seen = new Set<string>();
      return { out: input.filter((r) => {
        const x = n.by === "firma_id" ? r.cid : r.firma;
        if (missing(x)) return true;
        const k = n.by === "firma_id" ? String(x) : norm(String(x));
        if (seen.has(k)) return false;
        seen.add(k);
        return true;
      }) };
    }
    case "statistik": return { out: input, stats: countBy(input, n.by) };
    default: return { out: input };
  }
}

/** Ablauf in topologischer Reihenfolge ab der Quelle; `rows` = Ausgang der Quelle. */
export function runFlowRows(flow: Flow, rows: Row[]): Record<string, NodeRows> {
  const g = graph(flow);
  const res: Record<string, NodeRows> = {};
  for (const n of flow.nodes) res[n.id] = { connected: false, input: [], out: [] };
  if (!g.quelle) return res;
  const reach = reachableFrom(g, g.quelle.id, "down");
  for (const id of reach) res[id].connected = true;
  const edges = g.edges.filter((e) => reach.has(e.from));
  const indeg = new Map<string, number>();
  for (const e of edges) indeg.set(e.to, (indeg.get(e.to) ?? 0) + 1);
  const arrivals = new Map<string, Row[][]>();
  const queue = [g.quelle.id];
  while (queue.length) {
    const id = queue.shift()!;
    const n = g.byId.get(id)!;
    const input = n.kind === "quelle" ? rows : merge(arrivals.get(id) ?? []);
    const r: ReturnType<typeof step> = n.kind === "quelle" ? { out: rows } : step(n, input);
    res[id] = { connected: true, input, ...r };
    for (const e of edges) {
      if (e.from !== id) continue;
      const sent = e.port === "ja" ? r.ja ?? [] : e.port === "nein" ? r.nein ?? [] : r.out;
      arrivals.set(e.to, [...(arrivals.get(e.to) ?? []), sent]);
      const d = indeg.get(e.to)! - 1;
      indeg.set(e.to, d);
      if (d === 0) queue.push(e.to);
    }
  }
  return res;
}

/** Zahlen je Baustein (ids = erste 50 des Ausgangs, bei der Weiche erst ja, dann nein). */
export function runFlow(flow: Flow, rows: Row[]): Record<string, NodeResult> {
  const out: Record<string, NodeResult> = {};
  for (const [id, r] of Object.entries(runFlowRows(flow, rows))) {
    out[id] = { connected: r.connected, in: r.input.length, out: r.out.length, ids: r.out.slice(0, 50).map((x) => x.id) };
    if (r.ja && r.nein) out[id].ports = { ja: r.ja.length, nein: r.nein.length };
    if (r.stats) out[id].stats = r.stats;
  }
  return out;
}

/** Zeilen, die bei den Zielen einer Art ankommen (z. B. "speicher", "melden"): je Baustein-id der Eingang. */
export function sinkRows(flow: Flow, rows: Row[], kind: NodeKind): Record<string, Row[]> {
  const res = runFlowRows(flow, rows);
  const out: Record<string, Row[]> = {};
  for (const n of flow.nodes) if (n.kind === kind && !(n.id in out)) out[n.id] = res[n.id]?.input ?? [];
  return out;
}

export const pipelineNode = (flow: Flow): FlowNode | null => flow.nodes.find((n) => n.kind === "pipeline") ?? null;

/** Gilt die Regel für diese Zeile? Nur Leads, passende Zielgruppe und Länder (Status entscheidet die Freigabe). */
export function inScope(flow: Flow, row: Row): boolean {
  const q = flow.nodes.find((n) => n.kind === "quelle");
  if (!q || q.kind !== "quelle" || q.source !== "leads") return false;
  return (q.segment === null || row.segment === q.segment) && (q.countries.length === 0 || q.countries.includes(String(row.land ?? "")));
}

/** Erreicht diese eine Zeile den Baustein? (gleicher Ablauf wie runFlow, nur mit einer Zeile) */
export function reaches(flow: Flow, row: Row, targetId: string): boolean {
  return (runFlowRows(flow, [row])[targetId]?.input.length ?? 0) > 0;
}

/** Regel der Pipeline: außerhalb des Geltungsbereichs immer frei, sonst muss der Lead die Pipeline erreichen. */
export function pipelineCheck(flow: Flow, row: Row): boolean {
  const p = pipelineNode(flow);
  if (!p || !inScope(flow, row)) return true;
  return reaches(flow, row, p.id);
}

// ---------- Prüfung ----------
export type Problem = { nodeId?: string; msg: string; level: "error" | "warn" };

/** Fehler im Wert einer Bedingung für diese Quelle, sonst null. */
export function condProblem(c: Cond, source: Source | null): string | null {
  const def = BY_KEY.get(c.f);
  if (!def) return `Feld unbekannt: ${c.f}`;
  if (source && !def.sources.includes(source)) return `„${def.label}“ gibt es bei ${source === "leads" ? "Leads" : "Käufern"} nicht`;
  const info = opInfo(def.type, c.op);
  if (!info) return `„${c.op}“ passt nicht zu „${def.label}“`;
  const v = c.v;
  if (info.arity === 1) {
    if (def.type === "num") return isNum(v) ? null : `${def.label}: Zahl fehlt`;
    if (!isStr(v)) return `${def.label}: Wert fehlt`;
    if (def.type === "enum" && v.trim() === "") return `${def.label}: Wert wählen`;
  }
  if (info.arity === "list" && !(Array.isArray(v) && v.length >= 1 && v.length <= LIMITS.list && v.every((s) => isStr(s) && s !== "")))
    return `${def.label}: 1–${LIMITS.list} Werte wählen`;
  if (info.arity === 2 && !(Array.isArray(v) && v.length === 2 && v.every(isNum))) return `${def.label}: zwei Zahlen nötig`;
  return null;
}

const nodeConds = (n: FlowNode): Cond[] =>
  n.kind === "filter" ? n.conds : n.kind === "weiche" ? (n.cond ? [n.cond] : []) : n.kind === "punkte" ? n.rules.map((r) => r.cond) : [];

/** Fehler blockieren Speichern als aktiv / Pipeline, Warnungen werden nur gezeigt. `kind` = Art des Flows (Hinweise
 *  zu Speicher, Melden und Freigabe hängen davon ab; ohne Angabe wie ein Test-Flow). */
export function problems(flow: Flow, kind: FlowKind = "test"): Problem[] {
  const out: Problem[] = [];
  const err = (msg: string, nodeId?: string) => out.push({ nodeId, msg, level: "error" });
  const warn = (msg: string, nodeId?: string) => out.push({ nodeId, msg, level: "warn" });
  if (flow.nodes.length > LIMITS.nodes) err(`höchstens ${LIMITS.nodes} Bausteine`);
  if (flow.edges.length > LIMITS.edges) err(`höchstens ${LIMITS.edges} Verbindungen`);
  const quellen = flow.nodes.filter((n) => n.kind === "quelle");
  if (quellen.length !== 1) err(quellen.length ? "nur eine Quelle erlaubt" : "Quelle fehlt", quellen[1]?.id);
  const q = quellen[0]?.kind === "quelle" ? quellen[0] : null;
  const source = q ? q.source : null;
  const pipes = flow.nodes.filter((n) => n.kind === "pipeline");
  if (pipes.length > 1) err("nur ein Pipeline-Baustein erlaubt", pipes[1].id);
  if (pipes.length && source === "kaeufer") err("Pipeline gilt nur für Leads, nicht für Käufer", pipes[0].id);
  // Die echte Drei-Stufen-Freigabe läuft immer (release_gate.py) – fehlt der Baustein, nur ein Hinweis.
  if (kind === "master" && !flow.nodes.some((n) => n.kind === "freigabe")) warn("Freigabe läuft trotzdem immer (feste Regel)");
  const seenIds = new Set<string>();
  for (const n of flow.nodes) { if (seenIds.has(n.id)) err(`id doppelt: ${n.id}`, n.id); seenIds.add(n.id); }

  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  for (const e of flow.edges) {
    const a = byId.get(e.from), b = byId.get(e.to);
    if (!a || !b) { err("Verbindung zu unbekanntem Baustein", a?.id ?? b?.id); continue; }
    if (isSink(a.kind)) err(`${NODE_META[a.kind].label} ist ein Ziel und hat keinen Ausgang`, a.id);
    else if (!NODE_META[a.kind].ports.includes(e.port)) err("falscher Anschluss", a.id);
    if (b.kind === "quelle") err("in eine Quelle führt nichts hinein", b.id);
  }
  const g = graph(flow);
  // Kreise (Kahn über alle gültigen Verbindungen)
  const indeg = new Map<string, number>([...g.byId.keys()].map((id) => [id, 0]));
  for (const e of g.edges) indeg.set(e.to, indeg.get(e.to)! + 1);
  const todo = [...indeg].filter(([, d]) => d === 0).map(([id]) => id);
  let done = 0;
  while (todo.length) {
    const id = todo.pop()!;
    done++;
    for (const e of g.edges) if (e.from === id) { const d = indeg.get(e.to)! - 1; indeg.set(e.to, d); if (d === 0) todo.push(e.to); }
  }
  if (done < g.byId.size) err("Kreis im Ablauf – Verbindungen dürfen nicht zurückführen", [...indeg].find(([, d]) => d > 0)?.[0]);

  const reach = g.quelle ? reachableFrom(g, g.quelle.id, "down") : new Set<string>();
  const toPipe = pipes.length ? reachableFrom(g, pipes[0].id, "up") : new Set<string>();
  const outgoing = new Set(g.edges.map((e) => e.from)), incoming = new Set(g.edges.map((e) => e.to));
  const str = (s: string | undefined, max: number, what: string, id: string) => { if (s !== undefined && s.length > max) err(`${what}: höchstens ${max} Zeichen`, id); };

  for (const n of flow.nodes) {
    const meta = NODE_META[n.kind];
    str(n.title, LIMITS.title, "Titel", n.id);
    for (const c of nodeConds(n)) {
      const p = condProblem(c, source);
      if (p) err(p, n.id);
      if (typeof c.v === "string") str(c.v, LIMITS.str, "Wert", n.id);
      if (Array.isArray(c.v) && c.v.length > LIMITS.list) err(`höchstens ${LIMITS.list} Werte`, n.id);
      const def = BY_KEY.get(c.f);
      if (def && !def.gate && toPipe.has(n.id)) err(`„${def.label}“ darf nicht auf dem Weg zur Pipeline stehen`, n.id);
    }
    switch (n.kind) {
      case "quelle":
        if (n.countries.length > LIMITS.list || n.status.length > LIMITS.list) err(`höchstens ${LIMITS.list} Werte`, n.id);
        break;
      case "filter":
        if (n.conds.length > LIMITS.conds) err(`höchstens ${LIMITS.conds} Bedingungen`, n.id);
        if (!n.conds.length) warn("Filter ohne Bedingung lässt alles durch", n.id);
        break;
      case "weiche": if (!n.cond) warn("Weiche ohne Bedingung – alles geht nach „ja“", n.id); break;
      case "punkte":
        if (n.rules.length > LIMITS.rules) err(`höchstens ${LIMITS.rules} Regeln`, n.id);
        if (n.rules.some((r) => !Number.isInteger(r.pts) || Math.abs(r.pts) > LIMITS.pts)) err(`Punkte: ganze Zahl −${LIMITS.pts} bis ${LIMITS.pts}`, n.id);
        if (n.min !== null && (!Number.isInteger(n.min) || Math.abs(n.min) > LIMITS.min)) err("Mindestwert: ganze Zahl", n.id);
        break;
      case "top":
        if (!Number.isInteger(n.n) || n.n < 1 || n.n > LIMITS.n) err(`Anzahl 1 bis ${LIMITS.n}`, n.id);
        if (n.sort === "dringlichkeit" && source === "kaeufer") warn("Käufer haben keine Dringlichkeit", n.id);
        break;
      case "dubletten": if (n.by === "firma_id" && source === "kaeufer") warn("Käufer haben keine Firmen-ID – nach Name prüfen", n.id); break;
      case "statistik": {
        const def = BY_KEY.get(n.by);
        if (!def) err(`Feld unbekannt: ${n.by}`, n.id);
        else if (source && !def.sources.includes(source)) err(`„${def.label}“ gibt es bei ${source === "leads" ? "Leads" : "Käufern"} nicht`, n.id);
        break;
      }
      case "pipeline": if (n.name.trim().length < 1 || n.name.length > LIMITS.name) err(`Name: 1 bis ${LIMITS.name} Zeichen`, n.id); break;
      case "agent": if (!Number.isInteger(n.agent) || n.agent < 1 || n.agent > 4) err("Agent 1 bis 4", n.id); break;
      case "speicher":
        if (source === "kaeufer") err("Speicher nur für Leads, nicht für Käufer", n.id);
        if (n.pool_id !== null && !UUID_RE.test(n.pool_id)) err("Speicher ungültig", n.id);
        if (n.pool_id !== null && (n.pool_name.trim().length < 1 || n.pool_name.length > LIMITS.pool)) err(`Speicher-Name: 1 bis ${LIMITS.pool} Zeichen`, n.id);
        if (n.pool_id === null) warn(`${GESAMTBESTAND} – Speicher wählen, sonst ändert sich nichts`, n.id);
        else if (kind === "test") warn("füllt sich nur in Master-Pipeline oder Agent – hier Vorschau", n.id);
        break;
      case "melden": if (kind !== "agent") warn("meldet nur in einem Agenten – hier Vorschau", n.id); break;
    }
    if ((n.kind === "top" || n.kind === "dubletten") && toPipe.has(n.id))
      err(`${meta.label} entscheidet nach der ganzen Menge – nicht auf dem Weg zur Pipeline`, n.id);
    if (n.kind === "quelle") { if (!outgoing.has(n.id)) warn("Quelle ist mit nichts verbunden", n.id); continue; }
    if (meta.group === "ziel" && !incoming.has(n.id)) { warn(`${meta.label} hat keinen Eingang`, n.id); continue; }
    if (g.quelle && !reach.has(n.id)) warn("nicht mit der Quelle verbunden", n.id);
    else if (meta.group === "schritt" && !outgoing.has(n.id)) warn("Sackgasse – Ausgang verbinden", n.id);
  }
  return out;
}

// ---------- Texte ----------
const short = (label: string) => label.replace(/\s*\(.*\)$/, "");
const optLabel = (def: FieldDef, v: unknown) => def.options?.find((o) => o.v === String(v))?.label ?? String(v ?? "");

/** Kurzbeschreibung: „Telefon vorhanden: ja“, „Land ist US“, „Alter ≤ 30 Tage“. */
export function describeCond(c: Cond): string {
  const def = BY_KEY.get(c.f);
  if (!def) return `${c.f} ?`;
  const v = c.v;
  const list = (x: unknown) => (Array.isArray(x) ? x : [x]).map((y) => optLabel(def, y));
  switch (def.type) {
    case "bool": return `${def.label}: ${c.op === "ja" ? "ja" : "nein"}`;
    case "enum":
      if (c.op === "ist") return `${def.label} ist ${optLabel(def, v)}`;
      if (c.op === "ist_nicht") return `${def.label} ist nicht ${optLabel(def, v)}`;
      if (c.op === "in") return `${def.label} ist ${list(v).join(" oder ")}`;
      if (c.op === "nicht_in") return `${def.label} weder ${list(v).join(" noch ")}`;
      break;
    case "text": {
      const q = `„${String(v ?? "")}“`;
      const t: Partial<Record<Op, string>> = { enthaelt: `enthält ${q}`, enthaelt_nicht: `enthält nicht ${q}`, ist: `ist ${q}`,
        ist_nicht: `ist nicht ${q}`, beginnt: `beginnt mit ${q}`, vorhanden: "vorhanden", fehlt: "fehlt" };
      if (t[c.op]) return `${def.label} ${t[c.op]}`;
      break;
    }
    case "num": {
      const u = def.unit ? ` ${def.unit}` : "";
      if (c.op === "zwischen" && Array.isArray(v)) return `${short(def.label)} ${v[0]}–${v[1]}${u}`;
      const info = opInfo("num", c.op);
      if (info) return `${short(def.label)} ${info.label} ${v ?? "?"}${u}`;
    }
  }
  return `${def.label} ${c.op} ?`;
}

const segLabel = (s: string | null) => (s ? s : "alle Zielgruppen");
/** Eine Zeile für die Karte des Bausteins. */
export function describeNode(n: FlowNode): string {
  switch (n.kind) {
    case "quelle": {
      const st = n.status.length ? n.status.map((s) => optLabel(BY_KEY.get(n.source === "leads" ? "status" : "pruefung")!, s)).join(", ") : "alle";
      return `${n.source === "leads" ? "Leads" : "Käufer"} · ${segLabel(n.segment)} · ${n.countries.length ? n.countries.join(", ") : "alle Länder"} · ${st}`;
    }
    case "filter": return n.conds.length ? n.conds.map(describeCond).join(n.mode === "alle" ? " und " : " oder ") : "lässt alles durch";
    case "weiche": return n.cond ? `${describeCond(n.cond)}?` : "keine Bedingung";
    case "punkte": return `${n.rules.length} ${n.rules.length === 1 ? "Regel" : "Regeln"}${n.min !== null ? ` · ab ${n.min} Punkten` : ""}`;
    case "top": return `Top ${n.n} · ${SORT_LABELS[n.sort]}`;
    case "dubletten": return n.by === "firma_id" ? "je Firma einmal" : "je Firmenname einmal";
    case "statistik": return `nach ${BY_KEY.get(n.by)?.label ?? n.by}`;
    case "freigabe": return "Drei-Stufen-Freigabe · läuft immer";
    case "pipeline": return `„${n.name}“ · gilt für neue Leads`;
    case "export": return "als CSV herunterladen";
    case "agent": return `Agent ${n.agent} · ${KINDS[n.task]?.label ?? n.task}`;
    case "speicher": return `in „${n.pool_id === null ? GESAMTBESTAND : n.pool_name}“`;
    case "melden": return "Anzahl und bis zu 10 Firmen an dich";
  }
}

/** Grund-Kennung einer Regel in lead_checks.reasons: "s4:regel:" + die ersten 8 Zeichen der Flow-id. */
export const ruleTag = (flowId: string) => `s4:regel:${flowId.slice(0, 8).toLowerCase()}`;

// ---------- Vorlagen ----------
const E = (id: string, from: string, to: string, port: Port = "out"): FlowEdge => ({ id, from, port, to });
const Q = (countries: string[], source: Source = "leads", status: string[] = ["new"]): FlowNode =>
  ({ id: "q", x: 40, y: 160, kind: "quelle", source, segment: "S2", countries, status, size: 1000 });

export const TEMPLATES: { id: string; label: string; hint: string; flow: Flow }[] = [
  { id: "us-telefon", label: "US Webagenturen: mit Telefon", hint: "neue US-Leads mit Telefon, nach Signal gezählt",
    flow: { v: 1, nodes: [Q(["US"]), { id: "f1", x: 320, y: 160, kind: "filter", mode: "alle", conds: [{ f: "hat_telefon", op: "ja" }] },
      { id: "s1", x: 600, y: 160, kind: "statistik", by: "signal" }, { id: "x1", x: 880, y: 100, kind: "export" },
      { id: "p1", x: 880, y: 300, kind: "pipeline", name: "US mit Telefon" }],
    edges: [E("e1", "q", "f1"), E("e2", "f1", "s1"), E("e3", "s1", "x1")] } },
  { id: "frisch-30", label: "Nur frische Funde ≤ 30 Tage", hint: "nur Ereignisse der letzten 30 Tage, alle Länder",
    flow: { v: 1, nodes: [Q([]), { id: "f1", x: 320, y: 160, kind: "filter", mode: "alle", conds: [{ f: "alter_tage", op: "lte", v: 30 }] },
      { id: "s1", x: 600, y: 160, kind: "statistik", by: "land" }, { id: "p1", x: 880, y: 160, kind: "pipeline", name: "Nur frische Funde" }],
    edges: [E("e1", "q", "f1"), E("e2", "f1", "s1"), E("e3", "s1", "p1")] } },
  { id: "punkte-beste", label: "Punkte: beste zuerst", hint: "Punkte für Kontaktdaten und Frische, die besten 100",
    flow: { v: 1, nodes: [Q(["US"]), { id: "k1", x: 320, y: 160, kind: "punkte", min: null, rules: [
      { cond: { f: "hat_telefon", op: "ja" }, pts: 3 }, { cond: { f: "telefon_art", op: "ist", v: "mobile" }, pts: 2 },
      { cond: { f: "hat_email", op: "ja" }, pts: 2 }, { cond: { f: "hat_person", op: "ja" }, pts: 2 },
      { cond: { f: "alter_tage", op: "lte", v: 14 }, pts: 2 }, { cond: { f: "dringlichkeit", op: "ist", v: "high" }, pts: 3 }] },
      { id: "t1", x: 600, y: 160, kind: "top", sort: "punkte", n: 100 }, { id: "x1", x: 880, y: 160, kind: "export" }],
    edges: [E("e1", "q", "k1"), E("e2", "k1", "t1"), E("e3", "t1", "x1")] } },
  { id: "weiche-handy", label: "Weiche: Handy oder Festnetz", hint: "UK-Leads nach Telefon-Art aufteilen",
    flow: { v: 1, nodes: [Q(["UK"]), { id: "w1", x: 320, y: 160, kind: "weiche", cond: { f: "telefon_art", op: "ist", v: "mobile" } },
      { id: "x1", x: 600, y: 60, kind: "export", title: "Handy" }, { id: "s1", x: 600, y: 260, kind: "statistik", by: "telefon_art" },
      { id: "x2", x: 880, y: 260, kind: "export", title: "Rest" }],
    edges: [E("e1", "q", "w1"), E("e2", "w1", "x1", "ja"), E("e3", "w1", "s1", "nein"), E("e4", "s1", "x2")] } },
  { id: "kaeufer-frei", label: "Käufer US: noch nicht angeschrieben", hint: "mail-fähige US-Webagenturen ohne Mail von uns",
    flow: { v: 1, nodes: [Q(["US"], "kaeufer", ["ok"]), { id: "f1", x: 320, y: 160, kind: "filter", mode: "alle", conds: [{ f: "angeschrieben", op: "nein" }] },
      { id: "s1", x: 600, y: 160, kind: "statistik", by: "rechtsform" }, { id: "x1", x: 880, y: 160, kind: "export" }],
    edges: [E("e1", "q", "f1"), E("e2", "f1", "s1"), E("e3", "s1", "x1")] } },
];

// ---------- Übertragung ----------
export type RowPack = { cols: string[]; data: Cell[][] };
export function packRows(rows: Row[], cols: string[]): RowPack {
  const c = cols.includes("id") ? cols : ["id", ...cols];
  return { cols: c, data: rows.map((r) => c.map((k) => r[k] ?? null)) };
}
export function unpackRows(p: RowPack): Row[] {
  if (!p || !Array.isArray(p.cols) || !Array.isArray(p.data)) return [];
  return p.data.filter(Array.isArray).map((d) => {
    const r: Record<string, Cell> = {};
    p.cols.forEach((k, i) => { r[k] = d[i] ?? null; });
    return { ...r, id: String(r.id ?? "") } as Row;
  });
}

/** Spalten, die in den Browser gehen – nie rohe Telefonnummern oder Adressen. */
export const PREVIEW_COLS: Record<Source, string[]> = {
  leads: ["id", "cid", "land", "segment", "signal", "dringlichkeit", "status", "quelle", "alter_tage", "erfasst_tage", "firma", "rechtsform",
    "ort", "region", "branche", "text", "hat_website", "hat_telefon", "telefon_art", "hat_email", "email_art", "hat_person", "rolle",
    "vollstaendig", "geprueft"],
  kaeufer: ["id", "cid", "land", "segment", "firma", "rechtsform", "region", "hat_website", "hat_email", "email_generisch", "hat_telefon",
    "pruefung", "grund", "spezialisierung", "alter_tage", "angeschrieben"],
};

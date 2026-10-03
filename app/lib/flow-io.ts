/**
 * Baukasten: reine Helfer für Server-Daten, Aktionen und Export (ohne Next/Supabase, damit testbar).
 * Eingaben vom Browser werden hier geprüft (Quelle, ids), Kennzahlen beim Anschließen berechnet, der Weg zu einem
 * Agenten beschrieben und CSV sicher gebaut (Anführungszeichen, keine Formeln beim Öffnen in Excel).
 */
import {
  describeCond, describeNode, fieldDef, pipelineCheck, runFlowRows,
  type Cell, type Flow, type FlowNode, type Port, type Row, type Source,
} from "./flow.ts";
import { InputError } from "./owner-settings.ts";

export const SIZES = [1000, 2000, 5000] as const;
export type Size = (typeof SIZES)[number];
export type SourceQuery = { source: Source; segment: string | null; countries: string[]; status: string[]; size: Size };
export type FlowStatus = "entwurf" | "aktiv" | "aus" | "archiv";
export type Snapshot = { sample: number; pass: number; hold: number; at: string };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (x: unknown): x is string => typeof x === "string" && UUID_RE.test(x);
export const NODE_ID_RE = /^[a-z0-9_-]{1,24}$/;
export const isSize = (x: unknown): x is Size => (SIZES as readonly unknown[]).includes(x);

/** Quelle aus dem Browser prüfen: Art, Zielgruppe S1…S99, Länder (2 Buchstaben), Status (klein), Stichprobe. */
export function parseSourceQuery(x: unknown): SourceQuery {
  const o = (typeof x === "object" && x !== null && !Array.isArray(x) ? x : {}) as Record<string, unknown>;
  if (o.source !== "leads" && o.source !== "kaeufer") throw new InputError("Quelle unbekannt");
  const seg = o.segment === null || o.segment === undefined || o.segment === "" ? null : o.segment;
  if (seg !== null && (typeof seg !== "string" || !/^S\d{1,2}$/.test(seg))) throw new InputError("Zielgruppe unbekannt");
  const list = (v: unknown, re: RegExp, what: string, max: number) => {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v) || v.length > max || !v.every((s) => typeof s === "string" && re.test(s))) throw new InputError(`${what} ungültig`);
    return [...new Set(v as string[])].sort();
  };
  const countries = list(o.countries, /^[A-Z]{2}$/, "Länder", 30);
  const status = list(o.status, /^[a-z_]{1,24}$/, "Status", 12);
  const size = Number(o.size);
  if (!isSize(size)) throw new InputError("Stichprobe: 1000, 2000 oder 5000");
  return { source: o.source, segment: seg, countries, status, size };
}

/** Quelle eines Flows als Abfrage (null = keine Quelle). */
export function queryOf(flow: Flow): SourceQuery | null {
  const q = flow.nodes.find((n) => n.kind === "quelle");
  if (!q || q.kind !== "quelle") return null;
  return parseSourceQuery({ source: q.source, segment: q.segment, countries: q.countries, status: q.status, size: q.size });
}

/** Eindeutiger Schlüssel für den Zwischenspeicher. */
export const queryKey = (q: SourceQuery) => [q.source, q.segment ?? "*", q.countries.join("+") || "*", q.status.join("+") || "*", q.size].join("|");

/** Zeilen aus mehreren Seiten der Datenbank vereinen (je id einmal, erste gewinnt). */
export function dedupeRows<T extends { id: unknown }>(pages: T[][]): T[] {
  const seen = new Set<string>(), out: T[] = [];
  for (const p of pages) for (const r of p) {
    const k = String(r.id);
    if (!seen.has(k)) { seen.add(k); out.push(r); }
  }
  return out;
}

/** Zeile aus der Datenbank → Row (nur einfache Werte; Datum als Text). */
export function toRow(x: Record<string, unknown>, cols?: string[]): Row {
  const r: Record<string, Cell> = {};
  for (const k of cols ?? Object.keys(x)) {
    const v = x[k];
    r[k] = v === null || v === undefined ? null : typeof v === "string" || typeof v === "boolean" || (typeof v === "number" && Number.isFinite(v)) ? v : String(v);
  }
  return { ...r, id: String(x.id ?? "") } as Row;
}

/** Kennzahlen beim Anschließen: wie viele der Stichprobe die Regel durchlassen bzw. zurückhalten würde. */
export function snapshotOf(flow: Flow, rows: Row[], at: string): Snapshot {
  const pass = rows.filter((r) => pipelineCheck(flow, r)).length;
  return { sample: rows.length, pass, hold: rows.length - pass, at };
}

/** Ein Weg von der Quelle zum Baustein (rückwärts je erste Verbindung) als Text: „Leads · S2 · US → Telefon vorhanden: ja“. */
export function describePath(flow: Flow, targetId: string): { text: string; more: number } {
  const byId = new Map(flow.nodes.map((n) => [n.id, n]));
  const steps: { n: FlowNode; port: Port }[] = [];
  const seen = new Set([targetId]);
  let cur = targetId, more = 0;
  for (;;) {
    const inc = flow.edges.filter((e) => e.to === cur && byId.has(e.from) && !seen.has(e.from));
    if (!inc.length) break;
    more += inc.length - 1;
    const e = inc[0];
    steps.unshift({ n: byId.get(e.from)!, port: e.port });
    seen.add(e.from);
    cur = e.from;
  }
  const parts = steps.filter((s) => s.n.kind !== "statistik").map(({ n, port }) =>
    n.kind === "weiche" ? `${n.cond ? describeCond(n.cond) : "Weiche"}: ${port}` : describeNode(n));
  return { text: parts.join(" → "), more };
}

/** Auftragstext für den Agenten (höchstens 1000 Zeichen, Weg wird gekürzt). */
export function agentBrief(name: string, flow: Flow, nodeId: string, n: number, sample: number): string {
  const { text, more } = describePath(flow, nodeId);
  const tail = `${more ? ` (+${more} weitere Wege)` : ""} – ${n.toLocaleString("de-DE")} von ${sample.toLocaleString("de-DE")} in der Stichprobe`;
  const head = `Baukasten „${name}“: `;
  const room = 1000 - head.length - tail.length;
  const path = text.length > room ? `${text.slice(0, Math.max(0, room - 1))}…` : text;
  return (head + path + tail).replace(/\s+/g, " ").trim();
}

/** Zeilen, die an einem Baustein ankommen bzw. ihn verlassen. Standard: Ziele → Eingang, Schritte → Ausgang. */
export type ExportPart = "ein" | "aus" | "ja" | "nein";
export function exportRows(flow: Flow, rows: Row[], nodeId: string, part?: ExportPart | null): Row[] | null {
  const node = flow.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  const r = runFlowRows(flow, rows)[nodeId];
  if (!r || !r.connected) return [];
  const sink = node.kind === "pipeline" || node.kind === "export" || node.kind === "agent";
  const p = part ?? (sink ? "ein" : "aus");
  if (p === "ein") return r.input;
  if (p === "ja" || p === "nein") return r[p] ?? r.out;
  return r.out;
}

// ---------- CSV ----------
export type CsvCol = { key: string; label: string };
const COLS: Record<Source, [string, string][]> = {
  leads: [["firma", "Firma"], ["land", "Land"], ["segment", "Zielgruppe"], ["signal", "Signal"], ["dringlichkeit", "Dringlichkeit"],
    ["text", "Ereignis"], ["event_date", "Ereignis-Datum"], ["alter_tage", "Alter (Tage)"], ["telefon", "Telefon"], ["telefon_art", "Telefon-Art"],
    ["email", "E-Mail"], ["email_art", "E-Mail-Art"], ["website", "Website"], ["adresse", "Adresse"], ["ort", "Ort"], ["region", "Region"],
    ["person", "Ansprechperson"], ["rolle", "Rolle"], ["rechtsform", "Rechtsform"], ["branche", "Branche"], ["quelle", "Quelle"],
    ["source_url", "Quellen-Link"], ["status", "Status"], ["geprueft", "Freigabe"], ["vollstaendig", "Daten vollständig"],
    ["erfasst_tage", "Erfasst vor (Tagen)"], ["id", "Lead-ID"]],
  kaeufer: [["firma", "Firma"], ["land", "Land"], ["segment", "Zielgruppe"], ["rechtsform", "Rechtsform"], ["region", "Region"],
    ["email", "E-Mail"], ["email_generisch", "Allgemeine E-Mail"], ["telefon", "Telefon"], ["website", "Website"], ["adresse", "Adresse"],
    ["pruefung", "Prüfung"], ["grund", "Prüfgrund"], ["spezialisierung", "Spezialisierung"], ["angeschrieben", "Angeschrieben"],
    ["alter_tage", "Erfasst vor (Tagen)"], ["id", "Käufer-ID"]],
};
/** Spalten des Exports; „Punkte“ nur, wenn ein Punkte-Baustein welche vergeben hat. */
export function exportColumns(source: Source, rows: Row[]): CsvCol[] {
  const cols = COLS[source].map(([key, label]) => ({ key, label }));
  if (rows.some((r) => typeof r.punkte === "number")) cols.splice(1, 0, { key: "punkte", label: "Punkte" });
  return cols;
}

/** Ein Feld als CSV: Zeichenketten, die Excel als Formel läse (=, @, +Text, -Text, Tab), bekommen ein ' davor. */
export function csvCell(v: unknown): string {
  if (v === null || v === undefined) return "";
  let s = typeof v === "boolean" ? (v ? "ja" : "nein") : String(v);
  if (/^[=@\t\r]/.test(s) || (/^[+-]/.test(s) && /[^\d\s().\/+-]/.test(s))) s = `'${s}`;
  return /[",\r\n]|^\s|\s$/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** CSV mit BOM (Excel erkennt UTF-8), Komma, CRLF. Käufer-Prüfung „call_only“ heißt „nur Anruf/Brief“. */
export function toCsv(cols: CsvCol[], rows: Row[]): string {
  const label = (k: string, v: Cell | undefined) => (k === "pruefung" && typeof v === "string" ? fieldDef("pruefung")?.options?.find((o) => o.v === v)?.label ?? v : v);
  const lines = [cols.map((c) => csvCell(c.label)).join(",")];
  for (const r of rows) lines.push(cols.map((c) => csvCell(label(c.key, r[c.key]))).join(","));
  return `﻿${lines.join("\r\n")}\r\n`;
}

/** Dateiname: baukasten-<name>-<baustein>-<datum>.csv (nur a–z, 0–9, -). */
export function csvFileName(name: string, nodeId: string, day: string): string {
  const slug = (s: string) => s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
  return `baukasten-${slug(name) || "flow"}-${slug(nodeId) || "x"}-${day}.csv`;
}

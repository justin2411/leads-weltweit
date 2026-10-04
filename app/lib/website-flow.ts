/**
 * Seiten-Flow im Themenfeld „Website“ (Inhaber 04.10.2026: „flows … wo ich die branche auswählen kann jetzt erstmal nur
 * webagencys … mit vierecken weil es seiten sind … seiten selber einfügen und ersetzen können und verschieben und
 * vertauschen (nur für meine anzeige …)“).
 *
 * Reine Funktionen ohne Server-/React-Abhängigkeiten: Standardfluss aus den Live-Landingpages bauen, Katalog aller
 * vorhandenen Seiten, Einfügen/Ersetzen/Vertauschen/Verschieben/Entfernen, Verbindungen und Eingabeprüfung.
 * Gespeichert wird nur die Anordnung in signalwerk.owner_settings (Schlüssel website_flow) – die Website selbst und
 * alle übrigen Daten ändert der Flow nie.
 *
 * Aufbau: Hauptfluss in Stufen (order = Stufe, x = Platz in der Stufe), dazu ein Nebenzweig (side = true, z. B. Recht).
 */
import type { IconName } from "../app/icons";

export const NODE_KINDS = ["landing", "tarif", "checkout", "danke", "recht", "seite", "frei"] as const;
export type NodeKind = (typeof NODE_KINDS)[number];

export type FlowNode = {
  id: string;
  kind: NodeKind;
  title: string;
  /** Pfad auf der eigenen Website ("/uk/web-agencies") oder externe https-Adresse; leer = ohne Link */
  path: string;
  /** Land (US, UK, FR …) oder leer für alle */
  country: string;
  /** Stufe im Hauptfluss bzw. Platz im Nebenzweig */
  order: number;
  /** Platz innerhalb der Stufe */
  x?: number;
  /** Nebenzweig (z. B. Rechtsseiten) */
  side?: boolean;
};
export type FlowEdge = { from: string; to: string; side?: boolean };
export type WebsiteFlowSetting = Record<string, { nodes: FlowNode[]; edges?: FlowEdge[] }>;

/** Live-Landingpage aus signalwerk.landing_pages. */
export type LivePage = { slug: string; segment: string; country: string };

/** Ein Eintrag der Seitenliste (Einfügen/Ersetzen). */
export type CatalogPage = Pick<FlowNode, "id" | "kind" | "title" | "path" | "country">;

export const MAX_NODES = 60;
export const MAX_TITLE = 40;
export const MAX_PATH = 200;

/** Branchen-Auswahl (jetzt nur Webagenturen aktiv). */
export const BRANCHES: { id: string; label: string; active: boolean }[] = [
  { id: "S2", label: "Webagenturen", active: true },
  { id: "S1", label: "Personal", active: false },
  { id: "S4", label: "Versicherung", active: false },
  { id: "S5", label: "Buchhaltung", active: false },
  { id: "S9", label: "Finanzberater", active: false },
];
export const DEFAULT_BRANCH = "S2";
export function branchOf(raw: string | undefined | null): string {
  const b = BRANCHES.find((x) => x.id === String(raw ?? "").toUpperCase() && x.active);
  return b ? b.id : DEFAULT_BRANCH;
}

export const KIND_ICON: Record<NodeKind, IconName> = {
  landing: "website", tarif: "formular", checkout: "schloss", danke: "ok-kreis", recht: "recht", seite: "start-seite", frei: "text",
};

const CC_ORDER = ["US", "UK", "FR"];
const byCountry = (a: { country: string }, b: { country: string }) => {
  const ia = CC_ORDER.indexOf(a.country), ib = CC_ORDER.indexOf(b.country);
  return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.country.localeCompare(b.country);
};

const LEGAL: CatalogPage[] = [
  { id: "recht:impressum", kind: "recht", title: "Impressum", path: "/impressum", country: "" },
  { id: "recht:datenschutz", kind: "recht", title: "Datenschutz", path: "/datenschutz", country: "" },
  { id: "recht:agb", kind: "recht", title: "AGB", path: "/agb", country: "" },
];
const LEGAL_OTHER: CatalogPage[] = [
  { id: "recht:legal-notice", kind: "recht", title: "Legal Notice", path: "/legal-notice", country: "" },
  { id: "recht:privacy", kind: "recht", title: "Privacy", path: "/privacy", country: "" },
  { id: "recht:terms", kind: "recht", title: "Terms", path: "/terms", country: "" },
  { id: "recht:mentions-legales", kind: "recht", title: "Mentions légales", path: "/mentions-legales", country: "" },
  { id: "recht:confidentialite", kind: "recht", title: "Confidentialité", path: "/confidentialite", country: "" },
  { id: "recht:cgv", kind: "recht", title: "CGV", path: "/cgv", country: "" },
];
const CHECKOUT: CatalogPage = { id: "checkout", kind: "checkout", title: "Stripe-Checkout", path: "", country: "" };
const DANKE: CatalogPage = { id: "danke", kind: "danke", title: "Danke", path: "/danke", country: "" };
const MISC: CatalogPage[] = [
  { id: "seite:start", kind: "seite", title: "Startseite", path: "/", country: "" },
  { id: "seite:contact", kind: "seite", title: "Kontakt", path: "/contact", country: "" },
  { id: "seite:fr-contact", kind: "seite", title: "Contact", path: "/fr/contact", country: "FR" },
  { id: "seite:de-kontakt", kind: "seite", title: "Kontakt", path: "/de/kontakt", country: "DE" },
];

const landingOf = (p: LivePage): CatalogPage => ({ id: `lp:${p.slug}`, kind: "landing", title: "Landingpage", path: `/${p.slug}`, country: p.country });
const tarifOf = (p: LivePage): CatalogPage => ({ id: `tarif:${p.slug}`, kind: "tarif", title: "Tarif", path: `/${p.slug}/start`, country: p.country });

/** Standardfluss einer Branche: Landingpages je Land → Tarif → Stripe-Checkout → Danke; Recht als Nebenzweig. */
export function defaultFlow(segment: string, pages: LivePage[]): FlowNode[] {
  const own = pages.filter((p) => p.segment === segment).sort(byCountry);
  const out: FlowNode[] = [];
  own.forEach((p, i) => out.push({ ...landingOf(p), order: 0, x: i }));
  own.forEach((p, i) => out.push({ ...tarifOf(p), order: own.length ? 1 : 0, x: i }));
  const base = own.length ? 2 : 0;
  out.push({ ...CHECKOUT, order: base, x: 0 }, { ...DANKE, order: base + 1, x: 0 });
  LEGAL.forEach((l, i) => out.push({ ...l, order: i, x: 0, side: true }));
  return out;
}

/** Alle vorhandenen Seiten (Landingpages und Tarife aller Branchen, Checkout, Danke, Startseite, Kontakt, Recht). */
export function catalog(pages: LivePage[]): CatalogPage[] {
  const live = [...pages].sort((a, b) => a.segment.localeCompare(b.segment) || byCountry(a, b));
  return [...live.flatMap((p) => [landingOf(p), tarifOf(p)]), CHECKOUT, DANKE, ...MISC, ...LEGAL, ...LEGAL_OTHER];
}

// ------------------------------------------------------------------------------------------------- Anordnung

export class FlowInputError extends Error {}

const mainOf = (nodes: FlowNode[]) => nodes.filter((n) => !n.side);
const sideOf = (nodes: FlowNode[]) => nodes.filter((n) => n.side);
const pos = (n: FlowNode) => n.x ?? 0;
const clean = (n: FlowNode): FlowNode => {
  if (n.side) return n;
  const { side: _s, ...rest } = n;
  return rest;
};

/** Stufen fortlaufend nummerieren (leere Stufen fallen weg), Plätze je Stufe 0, 1, 2 …; Nebenzweig 0, 1, 2 … */
export function normalize(nodes: FlowNode[]): FlowNode[] {
  const main = mainOf(nodes).slice().sort((a, b) => a.order - b.order || pos(a) - pos(b));
  const stages = [...new Set(main.map((n) => n.order))].sort((a, b) => a - b);
  const counter = new Map<number, number>();
  const outMain = main.map((n) => {
    const order = stages.indexOf(n.order);
    const x = counter.get(order) ?? 0;
    counter.set(order, x + 1);
    const { side: _s, ...rest } = n;
    return { ...rest, order, x };
  });
  const outSide = sideOf(nodes).slice().sort((a, b) => a.order - b.order || pos(a) - pos(b))
    .map((n, i) => ({ ...n, order: i, x: 0, side: true }));
  return [...outMain, ...outSide];
}

/** Hauptfluss als Stufen (Spalten), jede Stufe nach Platz sortiert. */
export function stagesOf(nodes: FlowNode[]): FlowNode[][] {
  const out: FlowNode[][] = [];
  for (const n of mainOf(normalize(nodes))) (out[n.order] ??= []).push(n);
  return out.filter(Boolean);
}
export function sideNodes(nodes: FlowNode[]): FlowNode[] {
  return sideOf(normalize(nodes));
}

/** Kurzname einer Stufe aus ihren Seiten (gleiche Art → deren Name, sonst „Stufe n“). */
export function stageLabel(stage: FlowNode[], i: number): string {
  const kinds = new Set(stage.map((n) => n.kind));
  if (kinds.size === 1) {
    const k = [...kinds][0];
    const L: Partial<Record<NodeKind, string>> = { landing: "Einstieg", tarif: "Tarif", checkout: "Zahlung", danke: "Abschluss", recht: "Recht" };
    if (L[k]) return L[k]!;
  }
  return `Stufe ${i + 1}`;
}

export type Target = { kind: "stage"; stage: number; index?: number } | { kind: "newStage"; at: number } | { kind: "side"; index?: number };

/** Hauptfluss als Spalten-Listen (inkl. leerer Stufen) und Nebenzweig – Grundlage für Verschieben/Einfügen. */
function toArrays(nodes: FlowNode[]): { stages: FlowNode[][]; side: FlowNode[] } {
  const norm = normalize(nodes);
  const stages: FlowNode[][] = [];
  for (const n of mainOf(norm)) (stages[n.order] ??= []).push(n);
  return { stages: Array.from({ length: stages.length }, (_, i) => stages[i] ?? []), side: sideOf(norm) };
}
function fromArrays(stages: FlowNode[][], side: FlowNode[]): FlowNode[] {
  const main = stages.filter((s) => s.length).flatMap((s, order) => s.map((n, x) => clean({ ...n, order, x, side: false })));
  return [...main, ...side.map((n, i) => ({ ...n, order: i, x: 0, side: true }))];
}
const clampIndex = (i: number | undefined, len: number) => (i === undefined || !Number.isFinite(i) ? len : Math.max(0, Math.min(len, Math.trunc(i))));

/** Knoten an eine Zielstelle legen (Rest rückt nach). Unbekannte Stufen werden zu „neue Stufe am Ende“. */
function place(nodes: FlowNode[], node: FlowNode, t: Target): FlowNode[] {
  const { stages, side } = toArrays(nodes);
  // Knoten herausnehmen, leere Stufen bleiben bis zum Schluss stehen (Stufen-Nummern des Ziels bleiben gültig)
  const st = stages.map((s) => s.filter((n) => n.id !== node.id));
  const sd = side.filter((n) => n.id !== node.id);
  if (t.kind === "side") sd.splice(clampIndex(t.index, sd.length), 0, node);
  else if (t.kind === "newStage") st.splice(Math.max(0, Math.min(st.length, Math.trunc(t.at) || 0)), 0, [node]);
  else if (Number.isInteger(t.stage) && t.stage >= 0 && t.stage < st.length) st[t.stage].splice(clampIndex(t.index, st[t.stage].length), 0, node);
  else st.push([node]);
  return fromArrays(st, sd);
}

/** Seite verschieben (Stufe/Platz oder Nebenzweig). */
export function moveNode(nodes: FlowNode[], id: string, t: Target): FlowNode[] {
  const node = nodes.find((n) => n.id === id);
  if (!node) return normalize(nodes);
  return place(nodes, node, t);
}

/** Zwei Seiten tauschen ihre Plätze. */
export function swapNodes(nodes: FlowNode[], a: string, b: string): FlowNode[] {
  const na = nodes.find((n) => n.id === a), nb = nodes.find((n) => n.id === b);
  if (!na || !nb || a === b) return normalize(nodes);
  const at = (n: FlowNode) => ({ order: n.order, x: n.x ?? 0, side: n.side === true });
  const pa = at(na), pb = at(nb);
  return normalize(nodes.map((n) => {
    if (n.id === a) return clean({ ...n, ...pb });
    if (n.id === b) return clean({ ...n, ...pa });
    return n;
  }));
}

/** Seite einfügen (aus der Liste oder freie Kachel). Gleiche Seite zweimal: Fehler. */
export function insertNode(nodes: FlowNode[], page: CatalogPage, t: Target): FlowNode[] {
  if (nodes.some((n) => n.id === page.id)) throw new FlowInputError("Seite ist schon im Flow");
  if (nodes.length >= MAX_NODES) throw new FlowInputError(`Höchstens ${MAX_NODES} Seiten`);
  return place(nodes, { ...checkPage(page), order: 0, x: 0 }, t);
}

/** Seite gegen eine andere tauschen (Platz bleibt). */
export function replaceNode(nodes: FlowNode[], id: string, page: CatalogPage): FlowNode[] {
  const old = nodes.find((n) => n.id === id);
  if (!old) throw new FlowInputError("Seite nicht im Flow");
  if (page.id !== id && nodes.some((n) => n.id === page.id)) throw new FlowInputError("Seite ist schon im Flow");
  const p = checkPage(page);
  return normalize(nodes.map((n) => (n.id === id ? { ...n, id: p.id, kind: p.kind, title: p.title, path: p.path, country: p.country } : n)));
}

/** Nur aus der Anzeige nehmen. */
export function removeNode(nodes: FlowNode[], id: string): FlowNode[] {
  return normalize(nodes.filter((n) => n.id !== id));
}

/** Freie Kachel mit Titel und Pfad (Eingabe des Inhabers). */
export function freeTile(title: string, path: string, rnd: string = Math.random().toString(36).slice(2, 10)): CatalogPage {
  return checkPage({ id: `frei:${rnd.replace(/[^a-z0-9]/g, "").slice(0, 12) || "x"}`, kind: "frei", title, path, country: "" });
}

// ------------------------------------------------------------------------------------------------- Verbindungen

/**
 * Leitungen: jede Seite einer Stufe zur nächsten Stufe, bei Ländern nur gleiches Land (ohne Land: zu allen).
 * Nebenzweig: von der letzten Seite der ersten Stufe zu jeder Seite im Nebenzweig (gestrichelt).
 */
export function edgesOf(nodes: FlowNode[]): FlowEdge[] {
  const st = stagesOf(nodes);
  const out: FlowEdge[] = [];
  for (let i = 0; i + 1 < st.length; i++) {
    for (const a of st[i]) {
      const hits = st[i + 1].filter((b) => !a.country || !b.country || a.country === b.country);
      // Kein passendes Land in der nächsten Stufe: trotzdem verbinden, damit keine Seite in der Luft hängt
      for (const b of hits.length ? hits : st[i + 1]) out.push({ from: a.id, to: b.id });
    }
  }
  const root = st[0]?.[st[0].length - 1];
  if (root) for (const s of sideNodes(nodes)) out.push({ from: root.id, to: s.id, side: true });
  return out;
}

/** Link einer Seite (eigene Domain + Pfad oder externe https-Adresse); leer = ohne Link. */
export function hrefOf(n: Pick<FlowNode, "path">, site: string): string {
  if (!n.path) return "";
  if (/^https:\/\//.test(n.path)) return n.path;
  return `${site.replace(/\/+$/, "")}${n.path}`;
}

// ------------------------------------------------------------------------------------------------- Prüfung

const ID_RE = /^[a-z]+(:[a-z0-9/_.-]{1,80})?$/;
const PATH_RE = /^(\/[A-Za-z0-9\-._~%/?=&]*|https:\/\/[A-Za-z0-9.-]+(\/[A-Za-z0-9\-._~%/?=&#]*)?)$/;

function checkPage(p: CatalogPage): CatalogPage {
  const id = String(p?.id ?? "").trim();
  if (!ID_RE.test(id)) throw new FlowInputError("Seite unbekannt");
  if (!NODE_KINDS.includes(p.kind)) throw new FlowInputError("Seitenart unbekannt");
  const title = String(p.title ?? "").replace(/\s+/g, " ").trim();
  if (!title) throw new FlowInputError("Titel fehlt");
  if (title.length > MAX_TITLE) throw new FlowInputError(`Titel höchstens ${MAX_TITLE} Zeichen`);
  if (/[<>]/.test(title)) throw new FlowInputError("Titel ohne < >");
  const path = String(p.path ?? "").trim();
  if (path.length > MAX_PATH) throw new FlowInputError(`Pfad höchstens ${MAX_PATH} Zeichen`);
  if (path && (!PATH_RE.test(path) || path.startsWith("//"))) throw new FlowInputError("Pfad mit / oder https:// beginnen");
  const country = String(p.country ?? "").toUpperCase();
  if (!/^([A-Z]{2})?$/.test(country)) throw new FlowInputError("Land unbekannt");
  return { id, kind: p.kind, title, path, country };
}

const intIn = (v: unknown, max: number): number | null => (Number.isInteger(v) && (v as number) >= 0 && (v as number) <= max ? (v as number) : null);

/** Gespeicherte oder gesendete Anordnung prüfen (Server Action und Laden). Gibt die normalisierte Liste zurück. */
export function validateFlow(input: unknown): FlowNode[] {
  if (!Array.isArray(input)) throw new FlowInputError("Flow unlesbar");
  if (input.length > MAX_NODES) throw new FlowInputError(`Höchstens ${MAX_NODES} Seiten`);
  const seen = new Set<string>();
  const out: FlowNode[] = input.map((raw: any) => {
    const p = checkPage(raw ?? {});
    if (seen.has(p.id)) throw new FlowInputError("Seite doppelt im Flow");
    seen.add(p.id);
    const order = intIn(raw.order, MAX_NODES);
    if (order === null) throw new FlowInputError("Stufe ungültig");
    const x = raw.x === undefined ? 0 : intIn(raw.x, MAX_NODES);
    if (x === null) throw new FlowInputError("Platz ungültig");
    return raw.side === true ? { ...p, order, x, side: true } : { ...p, order, x };
  });
  return normalize(out);
}

/** Neue Einstellung: nur die Branche ersetzen, andere Branchen bleiben (unlesbare Altwerte fallen weg). */
export function mergeSetting(cur: unknown, segment: string, nodes: FlowNode[]): WebsiteFlowSetting {
  if (!BRANCHES.some((b) => b.id === segment)) throw new FlowInputError("Branche unbekannt");
  const out: WebsiteFlowSetting = {};
  if (cur && typeof cur === "object" && !Array.isArray(cur)) {
    for (const [k, v] of Object.entries(cur as Record<string, unknown>)) {
      if (k === segment || !BRANCHES.some((b) => b.id === k)) continue;
      try { out[k] = { nodes: validateFlow((v as any)?.nodes) }; } catch { /* Altwert unlesbar: weglassen */ }
    }
  }
  out[segment] = { nodes: validateFlow(nodes) };
  return out;
}

/** Gespeicherte Anordnung einer Branche oder null (dann Standardfluss). */
export function savedFlow(cur: unknown, segment: string): FlowNode[] | null {
  const v = cur && typeof cur === "object" ? (cur as Record<string, any>)[segment] : null;
  if (!v) return null;
  try {
    const n = validateFlow(v.nodes);
    return n.length ? n : null;
  } catch {
    return null;
  }
}

/** Gleiche Anordnung? (für „nicht gespeichert“) */
export function sameFlow(a: FlowNode[], b: FlowNode[]): boolean {
  const key = (l: FlowNode[]) => JSON.stringify(normalize(l).map((n) => [n.id, n.title, n.path, n.country, n.order, n.x ?? 0, n.side === true]).sort());
  return key(a) === key(b);
}

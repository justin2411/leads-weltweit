/**
 * Eigene Speicher (Inhaber 04.10.2026: „andere speicher selber anlegen und entscheiden welcher speicher genutzt wird um
 * die kunden zu bedienen“, Spezifikation docs/BAUKASTEN-MASTER.md). Reine Funktionen ohne Next/Supabase, damit testbar:
 * Namen/Farben prüfen, Zählungen je Speicher und Land, Bedien-Matrix je Zielgruppe+Land und der Entwurf-Abgleich für
 * „Übernehmen“ (pool_routes und subscriptions.pool_id).
 *
 * Regeln:
 * - „Gesamtbestand“ = kein Speicher (null). Eine Route auf Gesamtbestand ist eine fehlende Zeile in pool_routes – das ist
 *   eine Einstellung, keine Daten. Speicher selbst werden nie gelöscht.
 * - Kunden-Übersteuerung (subscriptions.pool_id) geht vor der Route der Zielgruppe/des Landes.
 * - Die Drei-Stufen-Freigabe bleibt vor jeder Probe/Lieferung Pflicht, egal aus welchem Speicher.
 */

export class PoolInputError extends Error {}

export type Pool = { id: string; name: string; color: string | null; note: string | null; created_at?: string };
export type PoolCount = { pool_id: string; country: string | null; segment: string | null; n: number };
export type Route = { segment_id: string; country: string; pool_id: string };
export type SegmentRow = { id: string; name: string; email_countries: string[] | null; status: string };
export type SubRow = {
  id: string; segment_id: string; status: string; pool_id: string | null; package: string | null;
  customer: { company_name: string; country: string; status: string; stripe: boolean; test_note: boolean } | null;
};

/** Gesamtbestand im Formular/Entwurf (kein Speicher) */
export const ALL_POOL = "";
export const POOL_COLORS = ["#5fd4ff", "#e2c68f", "#3ddc97", "#ff7a6b", "#b48cff", "#ffb547", "#8ba6c9"] as const;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const isUuid = (x: unknown): x is string => typeof x === "string" && UUID.test(x);

/** Name 1–40 Zeichen (wie die DB), Leerraum zusammengezogen; „Gesamtbestand“ ist reserviert. */
export function cleanPoolName(raw: unknown): string {
  const s = String(raw ?? "").replace(/\s+/g, " ").trim();
  if (!s) throw new PoolInputError("Name fehlt");
  if (s.length > 40) throw new PoolInputError("Name höchstens 40 Zeichen");
  if (s.toLowerCase() === "gesamtbestand") throw new PoolInputError("„Gesamtbestand“ ist schon vergeben (alle Leads)");
  return s;
}

/** Farbe #rrggbb (klein geschrieben) oder null. */
export function cleanColor(raw: unknown): string | null {
  const s = String(raw ?? "").trim().toLowerCase();
  if (!s) return null;
  if (!/^#[0-9a-f]{6}$/.test(s)) throw new PoolInputError("Farbe ungültig");
  return s;
}

/** Nächste freie Vorschlagsfarbe für einen neuen Speicher. */
export function nextColor(pools: Pool[]): string {
  const used = new Set(pools.map((p) => (p.color ?? "").toLowerCase()));
  return POOL_COLORS.find((c) => !used.has(c)) ?? POOL_COLORS[pools.length % POOL_COLORS.length];
}

/** Anzahl je Speicher: gesamt und je Land (absteigend), optional nur eine Zielgruppe. */
export function poolTotals(pools: Pool[], counts: PoolCount[], seg?: string): Map<string, { total: number; byCountry: [string, number][] }> {
  const out = new Map(pools.map((p) => [p.id, { total: 0, byCountry: [] as [string, number][] }]));
  const acc = new Map<string, Map<string, number>>();
  for (const c of counts) {
    if (!out.has(c.pool_id) || (seg && c.segment !== seg)) continue;
    const n = Number(c.n) || 0;
    out.get(c.pool_id)!.total += n;
    const m = acc.get(c.pool_id) ?? new Map<string, number>();
    m.set(c.country ?? "–", (m.get(c.country ?? "–") ?? 0) + n);
    acc.set(c.pool_id, m);
  }
  for (const [id, m] of acc) out.get(id)!.byCountry = [...m].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  return out;
}

/** Zielgruppen mit Mail-Ländern (gestoppte ausgeblendet, außer es liegt schon eine Route darauf). */
export function matrixRows(segments: SegmentRow[], routes: Route[]): { id: string; name: string; countries: string[] }[] {
  const routed = new Map<string, Set<string>>();
  for (const r of routes) routed.set(r.segment_id, (routed.get(r.segment_id) ?? new Set()).add(r.country));
  return segments
    .map((s) => {
      const cs = new Set([...(s.email_countries ?? []), ...(routed.get(s.id) ?? [])]);
      return { id: s.id, name: s.name, status: s.status, countries: [...cs].sort() };
    })
    .filter((s) => s.countries.length > 0 && (s.status !== "killed" || routed.has(s.id)))
    .sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)) || a.id.localeCompare(b.id))
    .map(({ id, name, countries }) => ({ id, name, countries }));
}

export const routeKey = (segment: string, country: string) => `${segment}/${country}`;

/** Entwurf: Route je „Zielgruppe/Land“ und Speicher je Abo („“ = Gesamtbestand bzw. Route). */
export type PoolDraft = { routes: Record<string, string>; subs: Record<string, string> };

export function poolDraft(routes: Route[], subs: SubRow[]): PoolDraft {
  return {
    routes: Object.fromEntries(routes.map((r) => [routeKey(r.segment_id, r.country), r.pool_id])),
    subs: Object.fromEntries(subs.map((s) => [s.id, s.pool_id ?? ALL_POOL])),
  };
}

export type PoolChange =
  | { kind: "route"; segment: string; country: string; pool_id: string | null }
  | { kind: "sub"; id: string; pool_id: string | null };

/** Unterschiede Entwurf gegen gespeicherten Stand (nur echte Änderungen, stabile Reihenfolge). */
export function poolChanges(saved: PoolDraft, draft: PoolDraft): PoolChange[] {
  const out: PoolChange[] = [];
  const keys = [...new Set([...Object.keys(saved.routes), ...Object.keys(draft.routes)])].sort();
  for (const k of keys) {
    const a = saved.routes[k] || ALL_POOL, b = draft.routes[k] || ALL_POOL;
    if (a === b) continue;
    const [segment, country] = k.split("/");
    out.push({ kind: "route", segment, country, pool_id: b || null });
  }
  for (const id of Object.keys(draft.subs).sort()) {
    const a = saved.subs[id] || ALL_POOL, b = draft.subs[id] || ALL_POOL;
    if (a !== b) out.push({ kind: "sub", id, pool_id: b || null });
  }
  return out;
}

/** Serverseitige Prüfung einer Änderungsliste: Formen, bekannte Speicher/Abos, gültige Zielgruppe+Land. */
export function validateChanges(raw: unknown, ctx: { pools: Set<string>; subs: Set<string>; cells: Set<string> }): PoolChange[] {
  if (!Array.isArray(raw) || raw.length === 0) throw new PoolInputError("keine Änderung");
  if (raw.length > 500) throw new PoolInputError("zu viele Änderungen auf einmal");
  return raw.map((c: unknown): PoolChange => {
    const x = (c ?? {}) as Record<string, unknown>;
    const pool = x.pool_id === null || x.pool_id === ALL_POOL ? null : x.pool_id;
    if (pool !== null && !(isUuid(pool) && ctx.pools.has(pool))) throw new PoolInputError("Speicher unbekannt");
    if (x.kind === "route") {
      const segment = String(x.segment ?? ""), country = String(x.country ?? "");
      if (!ctx.cells.has(routeKey(segment, country))) throw new PoolInputError(`Zielgruppe/Land unbekannt: ${segment}/${country}`);
      return { kind: "route", segment, country, pool_id: pool };
    }
    if (x.kind === "sub") {
      if (!isUuid(x.id) || !ctx.subs.has(x.id)) throw new PoolInputError("Abo unbekannt");
      return { kind: "sub", id: x.id, pool_id: pool };
    }
    throw new PoolInputError("Änderung unbekannt");
  });
}

/** Kauf im Stripe-Testmodus (wie dashboard-logic.isTestCustomer) – nur Kennzeichnung, keine Sperre. */
export function isTestSub(s: SubRow): boolean {
  const c = s.customer;
  return !!c && c.status === "trial" && (c.stripe || c.test_note);
}

/** Welcher Speicher bedient ein Abo: eigene Übersteuerung, sonst Route Zielgruppe+Land, sonst Gesamtbestand. */
export function effectivePool(sub: { segment_id: string; pool_id: string | null; country: string | null }, routes: Record<string, string>): { pool_id: string | null; via: "kunde" | "route" | "gesamt" } {
  if (sub.pool_id) return { pool_id: sub.pool_id, via: "kunde" };
  const r = sub.country ? routes[routeKey(sub.segment_id, sub.country)] : undefined;
  return r ? { pool_id: r, via: "route" } : { pool_id: null, via: "gesamt" };
}

/** Kurztext einer Änderung (Leiste, Protokoll). */
export function changeText(c: PoolChange, poolName: (id: string | null) => string, subName: (id: string) => string): string {
  return c.kind === "route"
    ? `${c.segment} ${c.country}: ${poolName(c.pool_id)}`
    : `${subName(c.id)}: ${c.pool_id ? poolName(c.pool_id) : "wie Zielgruppe/Land"}`;
}

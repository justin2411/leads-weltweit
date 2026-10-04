/**
 * Speicher-Ansicht (Inhaber 03.10.2026: „wie voll die Speicher sind – Kunden-Leads je Land“). Reine Funktionen ohne
 * Next/Supabase, damit testbar: Tank-Höhen auf log. Skala mit Teilstrichen, Schichten je Lead-Status, Käufer nach den
 * Zählregeln aus CLAUDE.md, Proben-Vorrat gegen Soll, Freigabe je Land und die Datenbank gegen 8 GB.
 *
 * Regeln:
 * - Käufer zählen nur mail-fähig: check_status = 'ok' in den Mail-Ländern der Zielgruppe (segments.email_countries).
 *   call_only und ok-Käufer außerhalb der Mail-Länder nur getrennt als „nur Anruf/Brief“.
 * - Supabase Pro: 8 GB Datenbank inklusive, darüber kostet es extra.
 */

export type StorageData = {
  at: string;
  db_bytes: number;
  tables: { name: string; bytes: number }[];
  leads: { segment: string | null; country: string | null; status: string; n: number }[];
  buyers: { segment: string | null; country: string | null; check_status: string | null; n: number; sent: number; used?: number }[];
  stock: { segment: string | null; country: string | null; status: string; n: number }[];
  checks: { segment?: string | null; country: string | null; released: number; failed: number }[];
};
export type SegmentInfo = { id: string; email_countries: string[] | null };

export const DB_LIMIT_BYTES = 8 * 1024 ** 3; // Supabase Pro: 8 GB inklusive
export const LEAD_COUNTRIES = ["US", "UK", "FR", "IE", "NL", "BE", "SE"] as const;
export const ALL = "alle";

const num = (x: unknown) => (Number.isFinite(Number(x)) ? Number(x) : 0);

// --------------------------------------------------------------------------------------------- log. Skala
/** Oberkante der Skala als Zehnerpotenz: mindestens 10^6 (1 Mio), sonst die nächste über dem größten Wert. */
export function scaleTop(max: number): number {
  return Math.max(6, Math.ceil(Math.log10(Math.max(1, max) + 1)));
}

/** Füllhöhe 0…1 auf log10-Skala (0 → leer, 10^top → voll). */
export function logHeight(n: number, top = 6): number {
  if (!(n > 0)) return 0;
  return Math.min(1, Math.log10(1 + n) / top);
}

const TICK_LABEL: Record<number, string> = { 1: "10", 2: "100", 3: "1 Tsd", 4: "10 Tsd", 5: "100 Tsd", 6: "1 Mio", 7: "10 Mio", 8: "100 Mio" };

/** Teilstriche 1 Tsd / 10 Tsd / 100 Tsd / 1 Mio (… bis zur Oberkante) mit Höhe 0…1. */
export function ticks(top = 6): { at: number; label: string; v: number }[] {
  const out: { at: number; label: string; v: number }[] = [];
  for (let e = 3; e <= top; e++) out.push({ at: e / top, label: TICK_LABEL[e] ?? `10^${e}`, v: 10 ** e });
  return out;
}

// --------------------------------------------------------------------------------------------- Schichten
export type LayerKey = "frei" | "proben" | "geliefert" | "zurueck" | "abgelaufen" | "sonst";
export const LAYERS: { key: LayerKey; label: string; statuses: string[]; tip: string }[] = [
  { key: "frei", label: "frei", statuses: ["new"], tip: "lieferbar, noch nicht vergeben" },
  { key: "proben", label: "in Proben", statuses: ["reserved"], tip: "für fertige Proben reserviert" },
  { key: "geliefert", label: "geliefert", statuses: ["delivered", "sample"], tip: "an Kunden oder als Probe verschickt" },
  { key: "zurueck", label: "zurückgehalten", statuses: ["held"], tip: "von der Freigabe zurückgehalten" },
  { key: "abgelaufen", label: "abgelaufen", statuses: ["expired"], tip: "Signal zu alt" },
  { key: "sonst", label: "sonstige", statuses: [], tip: "anderer Status" },
];

export function layerOf(status: string): LayerKey {
  return LAYERS.find((l) => l.statuses.includes(status))?.key ?? "sonst";
}

/**
 * Anteile der Schichten an der Füllhöhe (Summe 1). Jede Schicht > 0 bekommt mindestens `min`, damit kleine Mengen
 * sichtbar bleiben (300 in Proben neben 350 Tsd frei); der Rest wird nach Menge verteilt.
 */
export function layerShares(counts: number[], min = 0.03): number[] {
  const total = counts.reduce((a, b) => a + Math.max(0, b), 0);
  if (!total) return counts.map(() => 0);
  const pos = counts.filter((c) => c > 0).length;
  const m = Math.min(min, 1 / pos);
  const fixed = new Set<number>();
  for (;;) {
    const rest = counts.reduce((a, c, i) => a + (c > 0 && !fixed.has(i) ? c : 0), 0);
    const free = 1 - fixed.size * m;
    const add = counts.findIndex((c, i) => c > 0 && !fixed.has(i) && (c / rest) * free < m);
    if (add < 0) return counts.map((c, i) => (c <= 0 ? 0 : fixed.has(i) ? m : (c / rest) * free));
    fixed.add(add);
  }
}

export type LeadTank = { country: string; total: number; layers: Record<LayerKey, number> };

/** Lead-Tanks je Land: Zielgruppe `seg` (oder alle), Länder = die sieben Märkte + weitere mit Leads. */
export function leadTanks(d: StorageData, seg: string): LeadTank[] {
  const by = new Map<string, LeadTank>();
  const tank = (c: string) => {
    if (!by.has(c)) by.set(c, { country: c, total: 0, layers: { frei: 0, proben: 0, geliefert: 0, zurueck: 0, abgelaufen: 0, sonst: 0 } });
    return by.get(c)!;
  };
  for (const c of LEAD_COUNTRIES) tank(c);
  for (const r of d.leads) {
    if (!r.country || (seg !== ALL && r.segment !== seg)) continue;
    const t = tank(r.country);
    t.layers[layerOf(r.status)] += num(r.n);
    t.total += num(r.n);
  }
  const fixed = LEAD_COUNTRIES as readonly string[];
  return [...by.values()].filter((t) => fixed.includes(t.country) || t.total > 0)
    .sort((a, b) => (fixed.includes(a.country) ? fixed.indexOf(a.country) : 99) - (fixed.includes(b.country) ? fixed.indexOf(b.country) : 99) || b.total - a.total);
}

// --------------------------------------------------------------------------------------------- Käufer
export type BuyerTank = { country: string; mail: number; sent: number; queued: number; free: number; callOnly: number; mailCountry: boolean };

/**
 * Käufer je Land nach CLAUDE.md: mail-fähig = check_status ok UND Land in den Mail-Ländern der Zielgruppe;
 * davon angeschrieben (Mail gesendet), in Arbeit (Entwurf/freigegeben/gesperrt, noch nicht gesendet) und noch frei
 * (ohne jede Mail, wie JARVIS). „nur Anruf/Brief“ = call_only + ok außerhalb der Mail-Länder.
 * Ältere Daten ohne `used` zählen wie bisher nur Gesendete als belegt (Prüfung 04.10.2026).
 * Andere Status (rejected, …) zählen nirgends.
 */
export function buyerTanks(d: StorageData, segments: SegmentInfo[], seg: string): BuyerTank[] {
  const mailOf = new Map(segments.map((s) => [s.id, new Set(s.email_countries ?? [])]));
  const by = new Map<string, BuyerTank>();
  const tank = (c: string) => {
    if (!by.has(c)) by.set(c, { country: c, mail: 0, sent: 0, queued: 0, free: 0, callOnly: 0, mailCountry: false });
    return by.get(c)!;
  };
  for (const c of LEAD_COUNTRIES) tank(c);
  for (const r of d.buyers) {
    if (!r.country || !r.segment || (seg !== ALL && r.segment !== seg)) continue;
    const t = tank(r.country);
    const mailOk = mailOf.get(r.segment)?.has(r.country) ?? false;
    if (mailOk) t.mailCountry = true;
    if (r.check_status === "ok" && mailOk) {
      const n = num(r.n), sent = Math.min(num(r.sent), n);
      t.mail += n;
      t.sent += sent;
      t.queued += Math.min(Math.max(num(r.used ?? r.sent) - sent, 0), n - sent);
    } else if (r.check_status === "call_only" || r.check_status === "ok") t.callOnly += num(r.n);
  }
  // Mail-Land auch ohne Käufer kennzeichnen (Zielgruppe hat das Land freigeschaltet)
  for (const t of by.values()) {
    if (seg !== ALL) t.mailCountry ||= mailOf.get(seg)?.has(t.country) ?? false;
    else t.mailCountry ||= [...mailOf.values()].some((s) => s.has(t.country));
    t.free = t.mail - t.sent - t.queued;
  }
  const fixed = LEAD_COUNTRIES as readonly string[];
  return [...by.values()].filter((t) => fixed.includes(t.country) || t.mail + t.callOnly > 0)
    .sort((a, b) => (fixed.includes(a.country) ? fixed.indexOf(a.country) : 99) - (fixed.includes(b.country) ? fixed.indexOf(b.country) : 99) || b.mail - a.mail);
}

// --------------------------------------------------------------------------------------------- Proben, Freigabe, DB
export type ProbeRow = { key: string; slug?: string; ready: number; target: number };

/** Proben-Vorrat je Live-Seite (Ziel aus config/proben.yaml bzw. Dashboard-Soll) für eine Zielgruppe oder alle. */
export function probenSummary(rows: ProbeRow[], seg: string) {
  const list = rows.filter((r) => seg === ALL || r.key.startsWith(`${seg}/`))
    .map((r) => ({ ...r, pct: r.target > 0 ? Math.min(1, r.ready / r.target) : r.ready > 0 ? 1 : 0 }));
  const ready = list.reduce((a, r) => a + r.ready, 0), target = list.reduce((a, r) => a + r.target, 0);
  return { rows: list, ready, target, pct: target > 0 ? Math.min(1, ready / target) : 0 };
}

/** Ergebnisse der Drei-Stufen-Freigabe je Land (Zielgruppe `seg` oder alle). */
export function checkRows(d: StorageData, seg = ALL) {
  const by = new Map<string, { released: number; failed: number }>();
  for (const c of d.checks) {
    if (!c.country || (seg !== ALL && c.segment !== undefined && c.segment !== seg)) continue;
    const x = by.get(c.country) ?? { released: 0, failed: 0 };
    x.released += num(c.released);
    x.failed += num(c.failed);
    by.set(c.country, x);
  }
  return [...by].map(([country, { released, failed }]) => ({ country, released, failed, failPct: released + failed ? failed / (released + failed) : 0 }))
    .sort((a, b) => b.released + b.failed - (a.released + a.failed));
}

const TABLE_LABEL: Record<string, string> = {
  observations: "Beobachtungen", leads: "Leads", watch_companies: "Firmen", prospects: "Käufer", lead_tags: "Lead-Merkmale",
  messages: "Mails", email_events: "Mail-Ereignisse", lead_checks: "Freigaben", sample_stock: "Proben-Vorrat",
};
export const tableLabel = (n: string) => TABLE_LABEL[n] ?? n;

export function dbFill(d: Pick<StorageData, "db_bytes" | "tables">, limit = DB_LIMIT_BYTES) {
  const used = num(d.db_bytes);
  const pct = used / limit;
  return {
    used, limit, pct, free: Math.max(0, limit - used),
    level: (pct >= 0.9 ? "rot" : pct >= 0.75 ? "gelb" : "gruen") as "rot" | "gelb" | "gruen",
    tables: d.tables.map((t) => ({ name: t.name, label: tableLabel(t.name), bytes: num(t.bytes), pct: used ? num(t.bytes) / used : 0 })),
  };
}

/** 3,7 GB · 512 MB (Basis 1024, deutsche Schreibweise). */
export function fmtBytes(b: number): string {
  const gb = b / 1024 ** 3;
  if (gb >= 1) return `${gb.toLocaleString("de-DE", { maximumFractionDigits: 1 })} GB`;
  return `${Math.round(b / 1024 ** 2).toLocaleString("de-DE")} MB`;
}

/** 352.743 → „353 Tsd“, 1,2 Mio (kurz für große Zahlen im Tank). */
export function big(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toLocaleString("de-DE", { maximumFractionDigits: 1 })} Mio`;
  if (a >= 1e4) return `${Math.round(n / 1e3).toLocaleString("de-DE")} Tsd`;
  return Math.round(n).toLocaleString("de-DE");
}

/** Link in den Baukasten mit vorbelegter Quelle (Part E: ?land=XX&seg=S2). */
export function baukastenHref(country: string, seg: string, quelle?: "kaeufer"): string {
  const q = new URLSearchParams({ land: country });
  if (seg !== ALL) q.set("seg", seg);
  if (quelle) q.set("quelle", quelle);
  return `/dashboard/baukasten?${q}`;
}

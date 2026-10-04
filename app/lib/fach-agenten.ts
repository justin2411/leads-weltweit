/**
 * Fach-Agenten im JARVIS-Abschnitt „Team“ (Inhaber 04.10.2026: „Welche agenten machen sinn bei gehirn testing und bei
 * leadqualität. Bau die bitte direkt in jarvis alle rein“; „Bei Lead-Qualität mehrere Agenten … Massenprüfung immer
 * token-frei“). Reine Funktionen (testbar): Ampel und 7-Tage-Trend der Ziel-Kennzahl je Fach-Agent, Engpass aus den
 * Kohorten (Trichter-Agent), Tageswerte der token-freien Prüfer, Karteninhalt.
 * Daten: signalwerk.agent_roles, agent_role_kpi(), cohort_funnel, pruef_stats_daily (Migration 20261005040000).
 */
import type { Ampel } from "./ampel.ts";
import { SCHRITTE, SCHWELLE, gesamt, isJung, kohorte, type KohorteRow, type Schritt } from "./kohorten.ts";
import { addDays, trend, type Trend } from "./trend.ts";
import { nextRun, whenLabel, type BrainRoutine } from "./brain-routines.ts";

export type Rolle = {
  slug: string; name: string; gruppe: "testing" | "qualitaet"; typ: "llm" | "python"; rolle: string; kennzahl: string;
  richtung: "hoch" | "tief"; einheit: "quote" | "zahl"; gut: number; knapp: number; min_n: number; takt: string;
  werkzeuge: string[]; grenzen: string[]; auftrag: string; routine_id: string | null; sort: number; aktiv: boolean;
};
export type KpiTag = { rolle: string; day: string; k: number; n: number };
export type RoleTask = {
  id: string; rolle: string | null; agent: number; status: "offen" | "laeuft" | "fertig" | "fehler" | "abgebrochen";
  result: string | null; created_at: string; finished_at: string | null; wirkung?: { bewertung?: string } | null;
};
/** Tageswerte der token-freien Prüfer (Lead-Prüfer, Käufer-Prüfer), normalisiert aus pruef_stats_daily. */
export type PruefTag = { art: "lead" | "kaeufer"; day: string; geprueft: number; bestanden: number; gehalten: number; score: number | null; mehrfach: number | null };

export const GRUPPEN: { key: Rolle["gruppe"]; titel: string }[] = [
  { key: "testing", titel: "Gehirn-Testing" },
  { key: "qualitaet", titel: "Lead-Qualität" },
];
/** Fach-Agenten, deren Kennzahl aus den Prüfer-Tageswerten kommt (token-frei). */
export const PRUEFER: Record<string, PruefTag["art"]> = { lead_pruefer: "lead", kaeufer_pruefer: "kaeufer" };
export const BY_TEAM = "Inhaber Dashboard";

const num = (v: unknown) => (v === null || v === undefined || v === "" ? NaN : Number(v));
const fin = (v: unknown, d = 0) => (Number.isFinite(num(v)) ? num(v) : d);

/** Datenbank-Zeile → Rolle (unbekannte Werte sicher gemacht). */
export function toRolle(x: Record<string, unknown>): Rolle {
  const arr = (v: unknown) => (Array.isArray(v) ? v.map(String) : []);
  return {
    slug: String(x.slug ?? ""), name: String(x.name ?? ""), gruppe: x.gruppe === "testing" ? "testing" : "qualitaet",
    typ: x.typ === "python" ? "python" : "llm", rolle: String(x.rolle ?? ""), kennzahl: String(x.kennzahl ?? ""),
    richtung: x.richtung === "tief" ? "tief" : "hoch", einheit: x.einheit === "zahl" ? "zahl" : "quote",
    gut: fin(x.gut), knapp: fin(x.knapp), min_n: fin(x.min_n, 20), takt: String(x.takt ?? ""),
    werkzeuge: arr(x.werkzeuge), grenzen: arr(x.grenzen), auftrag: String(x.auftrag ?? ""),
    routine_id: (x.routine_id as string | null) ?? null, sort: fin(x.sort), aktiv: x.aktiv !== false,
  };
}

/** Ampel eines Werts nach Richtung (hoch = mehr ist besser, tief = weniger ist besser); unter min_n grau. */
export function roleAmpel(r: Pick<Rolle, "richtung" | "gut" | "knapp" | "min_n">, v: number | null, n: number): Ampel {
  if (v === null || !Number.isFinite(v) || !(n >= r.min_n) || n <= 0) return "grey";
  if (r.richtung === "tief") return v <= r.gut ? "green" : v <= r.knapp ? "gold" : "red";
  return v >= r.gut ? "green" : v >= r.knapp ? "gold" : "red";
}

/** „3,4 %“ bzw. „373“ (Zahl) – deutsche Schreibweise. */
export function fmtWert(v: number | null, einheit: Rolle["einheit"]): string {
  if (v === null || !Number.isFinite(v)) return "–";
  if (einheit === "quote") return `${(Math.round(v * 1000) / 10).toLocaleString("de-DE")} %`;
  return (Math.abs(v) >= 100 ? Math.round(v) : Math.round(v * 10) / 10).toLocaleString("de-DE");
}

export type Kennzahl = {
  wert: number | null; text: string; ampel: Ampel; n: number;
  /** 7 Tageswerte (älteste zuerst), null = kein Wert an dem Tag */
  points: (number | null)[];
  trend: Trend | null;
  /** Trend in die gute Richtung? (bei „tief“ ist fallend gut) */
  gut: boolean | null;
  label: string;
};

const days7 = (today: string, back = 0) => Array.from({ length: 7 }, (_, i) => addDays(today, i - 6 - back));

/** Summe k/n in einem Tagesfenster. */
function sumWin(rows: { day: string; k: number; n: number }[], days: string[]) {
  let k = 0, n = 0;
  for (const r of rows) if (days.includes(r.day)) { k += r.k; n += r.n; }
  return { k, n };
}

/** Wert aus Tageszeilen: 7 Tage bis heute (k/n), Trend gegen die 7 Tage davor, Sparkline je Tag. */
export function seriesKennzahl(r: Rolle, rows: { day: string; k: number; n: number }[], today: string, label = r.kennzahl): Kennzahl {
  const cur = sumWin(rows, days7(today)), prev = sumWin(rows, days7(today, 7));
  const wert = cur.n > 0 ? cur.k / cur.n : null;
  const pv = prev.n > 0 ? prev.k / prev.n : null;
  const points = days7(today).map((d) => {
    const x = sumWin(rows, [d]);
    return x.n > 0 ? x.k / x.n : null;
  });
  // Trend der Quote: Vergleich in Promille, „wenig Daten“ wenn eines der Fenster unter min_n liegt
  const t = wert !== null && pv !== null ? trend(wert * 1000, pv * 1000, Math.min(cur.n, prev.n), r.min_n) : null;
  const up = t && !t.few && t.pct !== null && t.pct !== 0 ? t.pct > 0 : null;
  return { wert, text: fmtWert(wert, r.einheit), ampel: roleAmpel(r, wert, cur.n), n: cur.n, points, trend: t,
    gut: up === null ? null : r.richtung === "hoch" ? up : !up, label };
}

/** Rohzeilen aus agent_role_kpi → KpiTag[] (Zahlen sicher). */
export function normalizeKpi(raw: unknown): KpiTag[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((x) => x && typeof x === "object").map((x) => {
    const o = x as Record<string, unknown>;
    return { rolle: String(o.rolle ?? ""), day: String(o.day ?? "").slice(0, 10), k: fin(o.k), n: fin(o.n) };
  }).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.day));
}

// ------------------------------------------------------------------------------------------ Trichter-Agent
/** Kohorten aller Länder je Woche zusammengefasst. */
function pool(rows: KohorteRow[], week: string): KohorteRow {
  return gesamt(rows.map((r) => ({ ...r, country: "ALL" })), ["ALL"]).map((x) => ({ ...x, week }))[0];
}
const RANK: Record<Ampel, number> = { red: 3, gold: 2, green: 1, grey: 0 };

/**
 * Engpass: schwächster Schritt (schlechteste Ampel aus reifen Wochen, bei Gleichstand der frühere in der Kette) über
 * alle Fokus-Länder. Ohne reife Basis: „Antwort“ grau. Sparkline = Wochenquote dieses Schritts (bis 7 Wochen).
 */
export function engpass(rows: KohorteRow[] | null, today: string, r: Rolle): Kennzahl & { schritt: Schritt | null } {
  const leer = { wert: null, text: "–", ampel: "grey" as Ampel, n: 0, points: [], trend: null, gut: null, label: r.kennzahl, schritt: null };
  if (!rows || !rows.length) return leer;
  const weeks = [...new Set(rows.map((x) => x.week))].sort();
  const reif = rows.filter((x) => !isJung(x.week, today));
  const all = kohorte(pool(rows, "gesamt"), null, pool(reif, "gesamt"));
  let best: Schritt | null = null;
  for (const s of SCHRITTE) {
    const a = all.zellen[s.key].ampel;
    if (a === "grey") continue;
    if (!best || RANK[a] > RANK[all.zellen[best].ampel]) best = s.key;
  }
  const step = best ?? "antwort";
  const def = SCHRITTE.find((s) => s.key === step)!;
  const base = pool(reif.length ? reif : rows, "gesamt");
  const n = fin(base[def.basis]);
  const wert = n > 0 ? fin(base[def.feld]) / n : null;
  const wk = weeks.slice(-7).map((w) => {
    const p = pool(rows.filter((x) => x.week === w), w);
    const nn = fin(p[def.basis]);
    return { w, q: nn > 0 ? fin(p[def.feld]) / nn : null, n: nn, jung: isJung(w, today) };
  });
  const ripe = wk.filter((x) => !x.jung && x.q !== null);
  const [a, b] = [ripe.at(-1), ripe.at(-2)];
  const t = a && b ? trend(a.q! * 1000, b.q! * 1000, Math.min(a.n, b.n), SCHWELLE[step].min) : null;
  const up = t && !t.few && t.pct !== null && t.pct !== 0 ? t.pct > 0 : null;
  const ampel = best ? all.zellen[best].ampel : "grey";
  return { wert, text: fmtWert(wert, "quote"), ampel, n, points: wk.map((x) => (x.jung ? null : x.q)), trend: t,
    gut: up, label: `Engpass ${def.label}`, schritt: best };
}

// ------------------------------------------------------------------------------------------ Prüfer (token-frei)
const pick = (o: Record<string, unknown>, keys: string[]) => {
  for (const k of keys) if (o[k] !== undefined && o[k] !== null && o[k] !== "") return o[k];
  return undefined;
};

/**
 * pruef_stats_daily (gebaut auf Branch claude/dauerpruefung) robust lesen: Art lead/kaeufer, Tag, geprüft, bestanden,
 * gehalten, Ø Qualitäts-Score, Anteil mehrfach geprüfter. Unbekannte Spaltennamen → Zeile übersprungen.
 */
export function normalizePruef(raw: unknown): PruefTag[] {
  if (!Array.isArray(raw)) return [];
  const out: PruefTag[] = [];
  for (const x of raw) {
    if (!x || typeof x !== "object") continue;
    const o = x as Record<string, unknown>;
    const a = String(pick(o, ["art", "kind", "typ", "objekt", "pruefer", "target"]) ?? "").toLowerCase();
    const art = /^(lead|leads|lead_pruefer)$/.test(a) ? "lead" : /^(kaeufer|käufer|prospect|prospects|buyer|kaeufer_pruefer)$/.test(a) ? "kaeufer" : null;
    const day = String(pick(o, ["day", "tag", "datum"]) ?? "").slice(0, 10);
    if (!art || !/^\d{4}-\d{2}-\d{2}$/.test(day)) continue;
    const geprueft = fin(pick(o, ["geprueft", "checked", "n", "total"]));
    const bestanden = fin(pick(o, ["bestanden", "passed", "ok", "released", "freigegeben"]));
    const gehalten = fin(pick(o, ["gehalten", "held", "failed", "durchgefallen"]), Math.max(geprueft - bestanden, 0));
    const sc = num(pick(o, ["score_avg", "qualitaet_score_avg", "avg_score", "score", "qualitaet_score"]));
    let mf = num(pick(o, ["mehrfach_anteil", "multi_share", "anteil_mehrfach"]));
    if (!Number.isFinite(mf)) {
      const m = num(pick(o, ["mehrfach", "mehrfach_geprueft", "multi"]));
      mf = Number.isFinite(m) && geprueft > 0 ? m / geprueft : NaN;
    }
    out.push({ art, day, geprueft, bestanden, gehalten, score: Number.isFinite(sc) ? sc : null, mehrfach: Number.isFinite(mf) ? (mf > 1 ? mf / 100 : mf) : null });
  }
  return out;
}

export type PrueferBild = { heute: { geprueft: number; bestanden: number | null; gehalten: number; score: number | null; mehrfach: number | null } | null };

/** Kennzahl „bestanden“ (7 Tage) + Kacheln für heute. Ohne Zeilen: null = „noch keine Daten“. */
export function prueferBild(r: Rolle, rows: PruefTag[] | null, today: string): (Kennzahl & PrueferBild) | null {
  const art = PRUEFER[r.slug];
  const mine = (rows ?? []).filter((x) => x.art === art);
  if (!mine.length) return null;
  const k = seriesKennzahl(r, mine.map((x) => ({ day: x.day, k: x.bestanden, n: x.geprueft })), today);
  const h = mine.filter((x) => x.day === today);
  const g = h.reduce((a, x) => a + x.geprueft, 0);
  const avg = (f: (x: PruefTag) => number | null) => {
    let s = 0, w = 0;
    for (const x of h) { const v = f(x); if (v !== null) { s += v * (x.geprueft || 1); w += x.geprueft || 1; } }
    return w ? s / w : null;
  };
  return { ...k, heute: h.length ? { geprueft: g, bestanden: g ? h.reduce((a, x) => a + x.bestanden, 0) / g : null,
    gehalten: h.reduce((a, x) => a + x.gehalten, 0), score: avg((x) => x.score), mehrfach: avg((x) => x.mehrfach) } : null };
}

// ------------------------------------------------------------------------------------------ Karte
export type Karte = {
  r: Rolle;
  kz: Kennzahl | null;          // null = noch keine Daten
  pruefer: PrueferBild["heute"] | undefined;
  letzter: RoleTask | null;
  offen: boolean;               // offener/laufender Auftrag → kein zweiter
  naechster: string;            // „heute 18:20“, „Dauerlauf“, „aus“
  wirkung: string | null;       // aus agent_tasks.wirkung.bewertung
};

const WIRKUNG: Record<string, string> = { wirkt: "wirkt", neutral: "neutral", sinkt: "sinkt", "keine Vergleichsdaten": "keine Vergleichsdaten" };

/** Letztes Ergebnis kurz (≤ 90 Zeichen, an der Wortgrenze). */
export function kurz(text: string | null | undefined, max = 90): string {
  const t = String(text ?? "").replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(" "), max * 0.6))}…`;
}

export function karten(o: {
  roles: Rolle[]; routines: BrainRoutine[]; tasks: RoleTask[]; kpi: KpiTag[]; kohorten: KohorteRow[] | null;
  pruef: PruefTag[] | null; today: string; now: Date;
}): Karte[] {
  return o.roles.filter((r) => r.aktiv).sort((a, b) => a.sort - b.sort).map((r) => {
    const mine = o.tasks.filter((t) => t.rolle === r.slug).sort((a, b) => Date.parse(b.created_at) - Date.parse(a.created_at));
    const routine = o.routines.find((x) => x.id === r.routine_id) ?? null;
    let kz: Kennzahl | null;
    let pruefer: PrueferBild["heute"] | undefined;
    if (r.slug in PRUEFER) {
      const p = prueferBild(r, o.pruef, o.today);
      kz = p;
      pruefer = p?.heute ?? null;
    } else if (r.slug === "trichter") {
      const e = engpass(o.kohorten, o.today, r);
      kz = o.kohorten && o.kohorten.length ? e : null;
    } else {
      const rows = o.kpi.filter((x) => x.rolle === r.slug);
      kz = rows.length ? seriesKennzahl(r, rows, o.today) : null;
    }
    const w = mine.find((t) => t.wirkung && t.wirkung.bewertung)?.wirkung?.bewertung ?? null;
    return {
      r, kz, pruefer,
      letzter: mine[0] ?? null,
      offen: mine.some((t) => t.status === "offen" || t.status === "laeuft"),
      naechster: r.typ === "python" ? "Dauerlauf" : routine ? whenLabel(nextRun(routine, o.now), o.now) : r.takt,
      wirkung: w ? WIRKUNG[w] ?? w : null,
    };
  });
}

/** Auftragstext eines Fach-Agenten (≤ 1000 Zeichen), gleich scripts/brain_routines.py role_brief. */
export function roleBrief(r: Pick<Rolle, "name" | "auftrag">, dauer = 15, zusatz?: string | null): string {
  const clean = (x: unknown) => String(x ?? "").replace(/\s+/g, " ").trim();
  const head = `Fach-Agent ${clean(r.name).slice(0, 40)} (${dauer} min): `;
  const tail = " | Ergebnis als Wissen (brain_knowledge.py add), kurz ins Gehirn (jarvis_chat.py gehirn-update).";
  const z = clean(zusatz);
  const body = `${clean(r.auftrag)}${z && !z.startsWith(clean(r.name)) ? ` Routine: ${z}` : ""}`;
  return `${head}${body.slice(0, 1000 - head.length - tail.length)}${tail}`;
}

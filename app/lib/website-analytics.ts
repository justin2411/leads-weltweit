/**
 * Website-Analyse wie GA4/Plausible, aber cookielos (Inhaber 04.10.2026: „pass die website mehr mit daten an die z.b.
 * auch google analytics oder marketing firmen empfehlen, ich will das jarvis super auswertungen hat“).
 * Reine Funktionen: Kennzahl-Kacheln mit Vergleich zum Vorzeitraum, Kanäle, Einstieg/Ausstieg, Wochentag × Stunde,
 * Scrolltiefe, Formular/Video/CTA, Core Web Vitals, A/B-Varianten und drei automatische Hinweise für JARVIS.
 *
 * Daten: dashboard_cache 'website_analytics' (web_analytics_refresh, Migration 20261004234500).
 * Grenzen (ehrlich): „neu vs. wiederkehrend“ ist ohne Cookies nicht messbar (Hash wechselt täglich); CLS ist die Summe
 * aller Verschiebungen (obere Schranke), INP die längste Interaktion eines Besuchs.
 */
import { kuerzen } from "./kurz-schreiben.ts";
import { fmtDwell, fmtRate, funnelView, type FunnelCache, type FunnelPeriod } from "./website-funnel.ts";

export type AnalyticsK = {
  visitors?: number; views?: number; engaged?: number; eng_s?: number; tarif?: number; stripe?: number; danke?: number;
  ttc_s?: number | null; scroll_n?: number; scroll75?: number; cta?: number; forms?: number; formd?: number; vid?: number; vidd?: number;
  lcp?: number | null; inp?: number | null; cls?: number | null; vit_n?: number;
};
export type AnalyticsCalc = {
  k?: AnalyticsK;
  ch?: { s: string; r: string; m: string; c: string; n: number; t: number; k: number }[];
  en?: Record<string, number>; ex?: Record<string, number>;
  br?: Record<string, number>; dv?: Record<string, number>; co?: Record<string, number>;
  wh?: [number, number, number][];
  sc?: { st: string; s: number; n: number }[];
  ev?: { st: string; k: string; n: number }[];
  vi?: { p: string; n: number; lcp: number | null; inp: number | null; cls: number | null }[];
  ab?: { p: string; v: string; st: string; views: number; cta: number; req: number; co: number; buy: number }[];
};
export type AnalyticsCache = {
  at?: string; since?: string | null;
  c?: Partial<Record<string, Partial<Record<FunnelPeriod, { cur?: AnalyticsCalc; prev?: AnalyticsK | null }>>>>;
};

const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : Number(x) || 0);
const opt = (x: unknown): number | null => (x === null || x === undefined || !Number.isFinite(Number(x)) ? null : Number(x));
const div = (a: number, b: number): number | null => (b > 0 ? a / b : null);

/** Ausschnitt für Zeitraum und Land (null = alle). */
export function slice(cache: AnalyticsCache | null | undefined, period: FunnelPeriod, country: string | null): { cur: AnalyticsCalc; prev: AnalyticsK | null } {
  const x = cache?.c?.[country ?? "ALL"]?.[period];
  return { cur: x?.cur ?? {}, prev: x?.prev ?? null };
}

// ------------------------------------------------------------------ Kacheln

export type TileFmt = "int" | "rate" | "sec" | "ms" | "cls" | "dec";
export type Tile = {
  id: string; label: string; value: number | null; prev: number | null; fmt: TileFmt;
  /** höher ist besser (true) oder niedriger (false) */
  up: boolean;
  /** kurze Erklärung (Details auf Klick) */
  info: string;
  /** Bewertung Core Web Vitals */
  rating?: "gut" | "mittel" | "schlecht" | null;
};

/** Google-Schwellen (p75): LCP ≤ 2,5 s / ≤ 4 s, INP ≤ 200 / ≤ 500 ms, CLS ≤ 0,1 / ≤ 0,25. */
export function rateVital(kind: "lcp" | "inp" | "cls", v: number | null): "gut" | "mittel" | "schlecht" | null {
  if (v === null) return null;
  const [g, m] = kind === "lcp" ? [2500, 4000] : kind === "inp" ? [200, 500] : [100, 250];
  return v <= g ? "gut" : v <= m ? "mittel" : "schlecht";
}

function tilesOf(k: AnalyticsK | null | undefined) {
  const v = n(k?.visitors);
  return {
    visitors: k ? v : null,
    ppv: k ? div(n(k.views), v) : null,
    eng: k ? div(n(k.engaged), v) : null,
    time: k ? div(n(k.eng_s), v) : null,
    scroll: k ? div(n(k.scroll75), n(k.scroll_n)) : null,
    cta: k ? div(n(k.cta), n(k.views)) : null,
    form: k ? div(n(k.formd), n(k.forms)) : null,
    video: k ? div(n(k.vidd), n(k.vid)) : null,
    tarif: k ? div(n(k.tarif), v) : null,
    conv: k ? div(n(k.danke), v) : null,
    ttc: k ? opt(k.ttc_s) : null,
    lcp: k ? opt(k.lcp) : null,
    inp: k ? opt(k.inp) : null,
    cls: k ? opt(k.cls) : null,
  };
}

/** Kennzahl-Kacheln mit Vorzeitraum. */
export function tiles(cur: AnalyticsK | null | undefined, prev: AnalyticsK | null | undefined): Tile[] {
  const a = tilesOf(cur ?? {}), b = tilesOf(prev);
  const t = (id: keyof typeof a, label: string, fmt: TileFmt, up: boolean, info: string): Tile => ({ id, label, value: a[id], prev: b[id], fmt, up, info });
  return [
    t("visitors", "Besucher", "int", true, "Eindeutig je Tag, ohne Cookies (Tages-Hash)."),
    t("eng", "Engagement", "rate", true, "Anteil Besuche mit ≥ 10 s sichtbar, ≥ 2 Seiten oder Checkout (wie GA4)."),
    t("time", "Ø aktive Zeit", "sec", true, "Sichtbare Zeit je Besucher, nur Vordergrund."),
    t("ppv", "Seiten je Besuch", "dec", true, "Aufrufe je Besucher (ohne Stripe)."),
    t("scroll", "Scroll ≥ 75 %", "rate", true, "Anteil der Aufrufe, die mindestens 75 % der Seite sahen."),
    t("cta", "CTA-Klickrate", "rate", true, "Klicks auf Haupt-Knöpfe je Aufruf."),
    t("form", "Formular fertig", "rate", true, "Abgeschickte je begonnene Formulare (Probe)."),
    t("video", "Video zu Ende", "rate", true, "Erklärvideos bis zum Ende je gestartet."),
    t("tarif", "Zum Tarif", "rate", true, "Anteil der Besucher, die die Tarifseite sehen."),
    t("conv", "Conversion", "rate", true, "Danke-Seite je Besucher (Kauf abgeschlossen)."),
    t("ttc", "Zeit bis Checkout", "sec", false, "Median vom ersten Aufruf bis zum Stripe-Checkout (am selben Tag)."),
    { ...t("lcp", "Ladezeit LCP", "ms", false, "Largest Contentful Paint, 75. Perzentil echter Besuche. Gut ≤ 2,5 s."), rating: rateVital("lcp", a.lcp) },
    { ...t("inp", "Reaktion INP", "ms", false, "Längste Interaktion je Besuch, 75. Perzentil. Gut ≤ 200 ms."), rating: rateVital("inp", a.inp) },
    { ...t("cls", "Stabilität CLS", "cls", false, "Layout-Verschiebungen (Summe), 75. Perzentil. Gut ≤ 0,1."), rating: rateVital("cls", a.cls) },
  ];
}

/** Wert einer Kachel als Text. */
export function fmtTile(v: number | null, fmt: TileFmt): string {
  if (v === null || !Number.isFinite(v)) return "–";
  if (fmt === "int") return Math.round(v).toLocaleString("de-DE");
  if (fmt === "rate") return fmtRate(v);
  if (fmt === "sec") return fmtDwell(v);
  if (fmt === "ms") return v >= 1000 ? `${(v / 1000).toFixed(1).replace(".", ",")} s` : `${Math.round(v)} ms`;
  if (fmt === "cls") return (v / 1000).toFixed(2).replace(".", ",");
  return v.toFixed(1).replace(".", ",");
}

/**
 * Veränderung zum Vorzeitraum: Quoten in Prozentpunkten, sonst relativ. tone: gut/schlecht je Richtung, null ohne
 * Vergleich (Vorzeitraum leer).
 */
export function delta(t: Pick<Tile, "value" | "prev" | "fmt" | "up">): { dir: "up" | "down" | "flat"; text: string; tone: "good" | "bad" | "flat" } | null {
  if (t.value === null || t.prev === null) return null;
  const d = t.value - t.prev;
  const dir = Math.abs(d) < 1e-9 ? "flat" : d > 0 ? "up" : "down";
  const tone = dir === "flat" ? "flat" : (dir === "up") === t.up ? "good" : "bad";
  if (t.fmt === "rate") return { dir, tone, text: `${d >= 0 ? "+" : "−"}${Math.abs(d * 100).toFixed(1).replace(".", ",")} Pp` };
  if (!t.prev) return dir === "flat" ? { dir, tone, text: "±0" } : { dir, tone, text: "neu" };
  const r = d / Math.abs(t.prev);
  return { dir, tone, text: `${r >= 0 ? "+" : "−"}${Math.round(Math.abs(r) * 100)} %` };
}

// ------------------------------------------------------------------ Aufschlüsselungen

const STAGE_L: Record<string, string> = { start: "Startseite", landing: "Landingpage", tarif: "Tarif", stripe: "Stripe", danke: "Danke" };
const SRC_L: Record<string, string> = { mail: "Mail", direkt: "Direkt", suche: "Suche", andere: "Andere", "-": "unbekannt" };

/** „landing|us/web-agencies“ → „Landingpage us/web-agencies“, „start|-“ → „Startseite“. */
export function pageLabel(key: string): string {
  const [st, slug] = key.split("|");
  return `${STAGE_L[st] ?? st}${slug && slug !== "-" ? ` ${slug}` : ""}`;
}

export type Channel = { label: string; sub: string; n: number; tarif: number | null; checkout: number };
/** Kanäle: Art · Quelle, darunter Medium/Kampagne; Quote zum Tarif. */
export function channels(cur: AnalyticsCalc): Channel[] {
  return (cur.ch ?? []).map((c) => ({
    label: `${SRC_L[c.s] ?? c.s}${c.r && c.r !== "-" ? ` · ${c.r}` : ""}`,
    sub: [c.m !== "-" ? c.m : "", c.c !== "-" ? c.c : ""].filter(Boolean).join(" / "),
    n: n(c.n), tarif: div(n(c.t), n(c.n)), checkout: n(c.k),
  }));
}

/** Einträge eines Zähl-Objekts absteigend. */
export function ranked(m: Record<string, number> | undefined, label: (k: string) => string = (k) => k): { k: string; label: string; n: number }[] {
  return Object.entries(m ?? {}).map(([k, v]) => ({ k, label: label(k), n: n(v) })).sort((a, b) => b.n - a.n || a.k.localeCompare(b.k));
}

/** Wochentag (Mo … So) × Stunde (0 … 23) in deutscher Zeit, dazu der Höchstwert. */
export function weekHour(wh: AnalyticsCalc["wh"]): { m: number[][]; max: number; total: number } {
  const m = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
  let max = 0, total = 0;
  for (const [d, h, c] of wh ?? []) {
    if (d < 1 || d > 7 || h < 0 || h > 23) continue;
    m[d - 1][h] += n(c);
    max = Math.max(max, m[d - 1][h]);
    total += n(c);
  }
  return { m, max, total };
}

/** Scrolltiefe je Stufe: Anteil der Aufrufe, die mindestens 25/50/75/100 % sahen. */
export function scrollByStage(sc: AnalyticsCalc["sc"]): { st: string; label: string; n: number; at: number[] }[] {
  const by = new Map<string, Map<number, number>>();
  for (const x of sc ?? []) {
    const m = by.get(x.st) ?? new Map<number, number>();
    m.set(n(x.s), (m.get(n(x.s)) ?? 0) + n(x.n));
    by.set(x.st, m);
  }
  return ["start", "landing", "tarif", "danke"].filter((st) => by.has(st)).map((st) => {
    const m = by.get(st)!;
    const tot = [...m.values()].reduce((a, b) => a + b, 0);
    const at = [25, 50, 75, 100].map((p) => (tot ? [...m].filter(([k]) => k >= p).reduce((a, [, v]) => a + v, 0) / tot : 0));
    return { st, label: STAGE_L[st], n: tot, at };
  });
}

/** Ereignisse je Stufe: CTA, Formular begonnen/fertig, Video gestartet/zu Ende. */
export function eventsByStage(ev: AnalyticsCalc["ev"]): { st: string; label: string; cta: number; fs: number; fd: number; vs: number; vd: number }[] {
  const out = new Map<string, { st: string; label: string; cta: number; fs: number; fd: number; vs: number; vd: number }>();
  for (const x of ev ?? []) {
    const r = out.get(x.st) ?? { st: x.st, label: STAGE_L[x.st] ?? x.st, cta: 0, fs: 0, fd: 0, vs: 0, vd: 0 };
    const key = ({ cta: "cta", form_start: "fs", form_submit: "fd", video_start: "vs", video_done: "vd" } as const)[x.k as "cta"];
    if (key) r[key] += n(x.n);
    out.set(x.st, r);
  }
  return ["start", "landing", "tarif", "danke"].filter((s) => out.has(s)).map((s) => out.get(s)!);
}

// ------------------------------------------------------------------ Hinweise für JARVIS

export type Hint = { id: "abbruch" | "quelle" | "langsam"; title: string; grund: string; tone: "gold" | "green" | "red" | "grey"; href?: string };

const PERIOD_L: Record<FunnelPeriod, string> = { heute: "heute", "24h": "24 h", "7d": "7 Tagen", "30d": "30 Tagen" };
const T = (s: string) => kuerzen(s, 60);
const G = (s: string) => kuerzen(s, 160);

/**
 * Drei automatische Hinweise: größter Abbruch im Trichter (ab 5 Besuchern), beste Quelle (höchste Quote zum Tarif ab
 * 3 Besuchern) und langsamste Seite (höchster LCP p75 ab 3 Messungen). Zu wenig Daten → ehrlicher grauer Hinweis.
 */
export function hints(a: AnalyticsCache | null | undefined, f: FunnelCache | null | undefined, period: FunnelPeriod, country: string | null = null): Hint[] {
  const out: Hint[] = [];
  const fv = funnelView(f, period, country);
  const steps = fv.stages.slice(0, 4).filter((s) => s.uv >= 5 && s.next !== null);
  if (steps.length) {
    const w = steps.reduce((x, y) => ((y.next ?? 1) < (x.next ?? 1) ? y : x));
    const to = fv.stages[fv.stages.indexOf(w) + 1];
    out.push({ id: "abbruch", tone: "gold", title: T(`Größter Abbruch: ${w.label} → ${to.label}`),
      grund: G(`Nur ${fmtRate(w.next)} der ${w.uv} Besucher gehen weiter (${PERIOD_L[period]}) – hier verliert die Website am meisten.`) });
  } else {
    out.push({ id: "abbruch", tone: "grey", title: "Abbruch: noch zu wenig Daten", grund: "Ab 5 Besuchern je Stufe zeigt JARVIS hier die schwächste Stelle im Trichter." });
  }
  const { cur } = slice(a, period, country);
  const ch = channels(cur).filter((c) => c.n >= 3 && c.tarif !== null);
  if (ch.length) {
    const b = ch.reduce((x, y) => ((y.tarif ?? 0) > (x.tarif ?? 0) || ((y.tarif ?? 0) === (x.tarif ?? 0) && y.n > x.n) ? y : x));
    out.push({ id: "quelle", tone: "green", title: T(`Beste Quelle: ${b.label}`),
      grund: G(`${fmtRate(b.tarif)} der ${b.n} Besucher erreichen den Tarif${b.sub ? ` (${b.sub})` : ""} – diese Quelle ausbauen.`) });
  } else {
    out.push({ id: "quelle", tone: "grey", title: "Quelle: noch zu wenig Daten", grund: "Ab 3 Besuchern je Quelle vergleicht JARVIS, welche am ehesten zum Tarif führt." });
  }
  const vi = (cur.vi ?? []).filter((v) => n(v.n) >= 3 && v.lcp !== null).sort((x, y) => n(y.lcp) - n(x.lcp));
  if (vi.length) {
    const s = vi[0], r = rateVital("lcp", s.lcp);
    out.push({ id: "langsam", tone: r === "gut" ? "green" : r === "mittel" ? "gold" : "red", title: T(`Langsamste Seite: ${pageLabel(s.p)}`),
      grund: G(`Ladezeit LCP ${fmtTile(s.lcp, "ms")} (75. Perzentil, ${s.n} Besuche) – ${r === "gut" ? "im grünen Bereich" : "Ziel laut Google ≤ 2,5 s"}.`) });
  } else {
    out.push({ id: "langsam", tone: "grey", title: "Ladezeit: noch keine Messung", grund: "Ab 3 echten Besuchen je Seite zeigt JARVIS die langsamste Seite (Core Web Vitals)." });
  }
  return out;
}

/** Kompakte, maschinenlesbare Auswertung für JARVIS/Gehirn (7 Tage, mit Vorzeitraum und Hinweisen). */
export function analyticsBrief(a: AnalyticsCache | null | undefined, f: FunnelCache | null | undefined): Record<string, unknown> {
  if (!a?.c) return { fehler: "noch keine Messung" };
  const { cur, prev } = slice(a, "7d", null);
  const ts = tiles(cur.k, prev);
  return {
    zeitraum: "7 Tage vs. Vorwoche", messung_seit: a.since ?? null,
    kennzahlen: ts.filter((t) => t.value !== null).map((t) => `${t.label} ${fmtTile(t.value, t.fmt)}${delta(t) ? ` (${delta(t)!.text})` : ""}`),
    kanaele: channels(cur).slice(0, 5).map((c) => `${c.label}${c.sub ? ` [${c.sub}]` : ""}: ${c.n} Besucher, Tarif ${fmtRate(c.tarif)}, Checkout ${c.checkout}`),
    einstieg: ranked(cur.en, pageLabel).slice(0, 3).map((x) => `${x.label} ${x.n}`),
    ausstieg: ranked(cur.ex, pageLabel).slice(0, 3).map((x) => `${x.label} ${x.n}`),
    hinweise: hints(a, f, "7d").map((h) => `${h.title}: ${h.grund}`),
    grenzen: "neu vs. wiederkehrend ohne Cookies nicht messbar; Besucher eindeutig je Tag",
  };
}

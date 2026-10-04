/**
 * Website-Trichter (Inhaber 04.10.2026: „trichter … startseite … landingpage, dann tarifseite, dann stripe und dann
 * danke seite wieviel dort überall waren … werte wie bounce rate aufrufe eindeutige aufrufe ähnlich wie bei google
 * analytics, damit es jarvis und ich auswerten können“). Reine Funktionen ohne Next/Supabase – für die Auswertung
 * (/dashboard/website/auswertung), die JARVIS-Linie und den JARVIS-Kontext.
 *
 * Daten: signalwerk.dashboard_cache 'website_funnel' (web_funnel_refresh, Migration 20261004230000). Ein Besucher ist
 * „eindeutig je Tag“ (Tages-Hash ohne Cookies): wer an zwei Tagen kommt, zählt zweimal; Gerätewechsel zählt doppelt.
 */

export type FunnelStage = "start" | "landing" | "tarif" | "stripe" | "danke";
export type FunnelPeriod = "24h" | "7d" | "30d";
export const FUNNEL_PERIODS: { id: FunnelPeriod; label: string }[] = [
  { id: "24h", label: "24 h" }, { id: "7d", label: "7 T" }, { id: "30d", label: "30 T" },
];
export const FUNNEL_COUNTRIES = ["US", "UK", "FR"] as const;

export const FUNNEL_STAGES: { id: FunnelStage; label: string; tip: string }[] = [
  { id: "start", label: "Startseite", tip: "nextgen-profit.de, /fr, /de" },
  { id: "landing", label: "Landingpage", tip: "Branchenseiten je Land" },
  { id: "tarif", label: "Tarif", tip: "Tarifseite /start" },
  { id: "stripe", label: "Stripe", tip: "gestartete Checkouts (Server)" },
  { id: "danke", label: "Danke", tip: "Danke-Seite nach dem Kauf" },
];

/** Eine Zeile aus web_funnel_calc: Stufe × Land × Gerät × Herkunft. */
export type FunnelRow = { st: string; c: string; dv: string; sr: string; uv: number; v: number; b: number; dw: number; dn: number; nx: number };
export type FunnelCalc = { rows?: FunnelRow[]; refs?: { st: string; c: string; r: string; n: number }[]; tot?: Record<string, number>; all?: number };
export type FunnelCache = {
  at?: string; since?: string | null;
  p?: Partial<Record<FunnelPeriod, FunnelCalc>>;
  buy?: Partial<Record<FunnelPeriod, Record<string, number>>>;
  /** letzte Stunde: Startseiten-Besucher und davon weiter zur Landingpage (JARVIS-Linie) */
  live?: { start_60m?: number; start_land_60m?: number };
};

/** Zahlen der JARVIS-Station „Startseite“ aus dem Trichter-Cache. */
export function startLive(cache: FunnelCache | null | undefined): { start_60m: number; start_24h: number; start_30d: number; start_land_60m: number } {
  const uv = (p: FunnelPeriod) => (cache?.p?.[p]?.rows ?? []).filter((r) => r.st === "start").reduce((a, r) => a + num(r.uv), 0);
  return { start_60m: num(cache?.live?.start_60m), start_24h: uv("24h"), start_30d: uv("30d"), start_land_60m: num(cache?.live?.start_land_60m) };
}

export type Share = { k: string; n: number };
export type StageView = {
  id: FunnelStage; label: string; tip: string;
  /** eindeutige Besucher (je Tag) */
  uv: number;
  /** Aufrufe gesamt */
  views: number;
  /** Absprungrate 0…1 (null: nicht sinnvoll, z. B. Stripe, oder keine Besucher) */
  bounce: number | null;
  /** Ø sichtbare Zeit in Sekunden (null: keine Messung) */
  dwell: number | null;
  /** Anteil, der am selben Tag die nächste Stufe erreicht (null bei Danke oder ohne Besucher) */
  next: number | null;
  nextN: number;
  countries: Share[]; devices: Share[]; sources: Share[]; refs: Share[];
};
export type FunnelView = {
  period: FunnelPeriod; country: string | null; stages: StageView[];
  /** eindeutige Besucher über alle Stufen */
  total: number;
  /** Danke je Besucher (alle Einstiege) */
  conv: number | null;
  /** abgeschlossene Käufe laut Stripe-Webhook */
  buys: number;
  since: string | null; at: string | null;
};

const NEXT: Record<FunnelStage, FunnelStage | null> = { start: "landing", landing: "tarif", tarif: "stripe", stripe: "danke", danke: null };
export const nextStage = (s: FunnelStage) => NEXT[s];

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : Number(x) || 0);
const sorted = (m: Map<string, number>, keep: string[] = []): Share[] =>
  [...m].map(([k, n]) => ({ k, n })).sort((a, b) => b.n - a.n || keep.indexOf(a.k) - keep.indexOf(b.k) || a.k.localeCompare(b.k));
const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

/** Kennzahlen je Stufe für Zeitraum und Land (null = alle Länder). */
export function funnelView(cache: FunnelCache | null | undefined, period: FunnelPeriod, country: string | null): FunnelView {
  const calc = cache?.p?.[period] ?? {};
  const rows = (calc.rows ?? []).filter((r) => !country || r.c === country);
  const refs = (calc.refs ?? []).filter((r) => !country || r.c === country);
  const stages: StageView[] = FUNNEL_STAGES.map(({ id, label, tip }) => {
    const rs = rows.filter((r) => r.st === id);
    const uv = rs.reduce((a, r) => a + num(r.uv), 0);
    const views = rs.reduce((a, r) => a + num(r.v), 0);
    const b = rs.reduce((a, r) => a + num(r.b), 0);
    const dw = rs.reduce((a, r) => a + num(r.dw), 0), dn = rs.reduce((a, r) => a + num(r.dn), 0);
    const nx = rs.reduce((a, r) => a + num(r.nx), 0);
    const cs = new Map<string, number>(), dv = new Map<string, number>(), sr = new Map<string, number>(), rf = new Map<string, number>();
    for (const r of rs) {
      add(cs, r.c, num(r.uv));
      if (r.dv !== "-") add(dv, r.dv, num(r.uv));
      if (r.sr !== "-") add(sr, r.sr, num(r.uv));
    }
    for (const r of refs) if (r.st === id) add(rf, r.r, num(r.n));
    return {
      id, label, tip, uv, views,
      bounce: id === "stripe" || !uv ? null : b / uv,
      dwell: id === "stripe" || !dn ? null : dw / dn,
      next: NEXT[id] && uv ? nx / uv : null, nextN: nx,
      countries: sorted(cs, [...FUNNEL_COUNTRIES]), devices: sorted(dv, ["desktop", "mobil"]),
      sources: sorted(sr, ["mail", "direkt", "suche", "andere"]), refs: sorted(rf).slice(0, 8),
    };
  });
  const total = country ? num(calc.tot?.[country]) : num(calc.all);
  const danke = stages[stages.length - 1].uv;
  const buyBy = cache?.buy?.[period] ?? {};
  const buys = country ? num(buyBy[country]) : Object.values(buyBy).reduce((a, n) => a + num(n), 0);
  return { period, country, stages, total, conv: total ? danke / total : null, buys, since: cache?.since ?? null, at: cache?.at ?? null };
}

/** Anteil je Stufe an der größten Stufe in Prozent (Leuchtbalken im Trichter); mit Besuchern mindestens min, ohne 0. */
export function stageWidths(stages: { uv: number }[], min = 2): number[] {
  const max = Math.max(0, ...stages.map((s) => s.uv));
  return stages.map((s) => (max && s.uv ? Math.max(min, Math.round((s.uv / max) * 100)) : 0));
}

/** Sekunden als „42 s“ bzw. „3:05 min“; null → „–“. */
export function fmtDwell(s: number | null): string {
  if (s === null || !Number.isFinite(s)) return "–";
  const r = Math.round(s);
  return r < 60 ? `${r} s` : `${Math.floor(r / 60)}:${String(r % 60).padStart(2, "0")} min`;
}

/** Quote 0…1 als „12,5 %“ (unter 10 % mit einer Nachkommastelle), null → „–“. */
export function fmtRate(x: number | null): string {
  if (x === null || !Number.isFinite(x)) return "–";
  const p = x * 100;
  return `${(p >= 10 || p === 0 ? Math.round(p).toString() : p.toFixed(1)).replace(".", ",")} %`;
}

/** Land der Startseite aus dem Kürzel des Hosters (ISO), GB → UK, sonst XX. */
export function geoCountry(h: string | null | undefined): string {
  const c = String(h ?? "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "XX";
  return c === "GB" ? "UK" : c;
}

/**
 * Kurzfassung für JARVIS (Sofort-Antworten, wenige Tokens): 30 Tage je Stufe „Besucher/Aufrufe, Absprung, Ø Zeit,
 * weiter“, dazu 24 h und je Land die Besucher und Danke. Gleiche Zahlen wie /dashboard/website/auswertung.
 */
export function funnelBrief(cache: FunnelCache | null | undefined): Record<string, unknown> {
  if (!cache?.p) return { fehler: "noch keine Messung" };
  const m = funnelView(cache, "30d", null), d = funnelView(cache, "24h", null);
  return {
    messung_seit: cache.since ?? null, hinweis: "Besucher eindeutig je Tag, ohne Cookies, Inhaber ausgeblendet",
    "30_tage": m.stages.map((s) => `${s.label}: ${s.uv} Besucher/${s.views} Aufrufe, Absprung ${fmtRate(s.bounce)}, Ø ${fmtDwell(s.dwell)}, weiter ${fmtRate(s.next)}`),
    conversion_start_danke_30_tage: fmtRate(m.conv), kaeufe_stripe_30_tage: m.buys,
    "24_h": d.stages.map((s) => `${s.label} ${s.uv}`).join(" · "),
    je_land_30_tage: FUNNEL_COUNTRIES.map((c) => { const x = funnelView(cache, "30d", c); return `${c}: ${x.total} Besucher, ${x.stages[2].uv} Tarif, ${x.stages[4].uv} Danke`; }),
  };
}

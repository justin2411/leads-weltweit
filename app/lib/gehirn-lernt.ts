/**
 * Karte „Gehirn lernt“ auf /dashboard/jarvis (Inhaber 04.10.2026: „Bau es so das sich auch das gehirn weiter
 * selbstoptimiert“). Reine Funktionen: Gehirn-Score aus kpi_daily (Land ALL, Kennzahl gehirn_score, geschrieben von
 * scripts/brain_meta.py), Trend wie dort (heute gegen Schnitt der 7 Tage davor, ±2 Punkte), Ampel aus lib/ampel.ts.
 */
import type { Ampel } from "./ampel";

export type ScoreRow = { day: string; country: string; metric: string; value: number | string | null };
export type Richtung = "steigt" | "fällt" | "gleich" | "neu" | "keine Basis";
export type GehirnScore = { score: number | null; day: string | null; delta: number | null; richtung: Richtung; ampel: Ampel; punkte: number[] };

export const TREND_TAGE = 7;
export const TREND_SCHWELLE = 2;
/** Ab 70 Punkten gut, ab 40 knapp, darunter schlecht; ohne Score grau. */
export const SCORE_GUT = 70;
export const SCORE_KNAPP = 40;

const addDays = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

export function scoreAmpel(s: number | null): Ampel {
  if (s === null || !Number.isFinite(s)) return "grey";
  return s >= SCORE_GUT ? "green" : s >= SCORE_KNAPP ? "gold" : "red";
}

/** Letzter Score bis `today` und Trend gegen die 7 Tage davor (gleich scripts/brain_meta.py trend). */
export function gehirnScore(rows: ScoreRow[], today: string): GehirnScore {
  const by = new Map<string, number>();
  for (const r of rows) {
    if (r.metric !== "gehirn_score" || r.country !== "ALL" || r.value === null || r.value === "") continue;
    const v = Number(r.value);
    if (Number.isFinite(v) && r.day <= today) by.set(r.day.slice(0, 10), v);
  }
  const days = [...by.keys()].sort();
  const punkte = days.slice(-14).map((d) => by.get(d)!);
  const day = days.at(-1) ?? null;
  if (!day) return { score: null, day: null, delta: null, richtung: "keine Basis", ampel: "grey", punkte };
  const score = by.get(day)!;
  const from = addDays(day, -TREND_TAGE);
  const prev = days.filter((d) => d >= from && d < day).map((d) => by.get(d)!);
  if (!prev.length) return { score, day, delta: null, richtung: "neu", ampel: scoreAmpel(score), punkte };
  const avg = prev.reduce((a, b) => a + b, 0) / prev.length;
  const delta = Math.round((score - avg) * 10) / 10;
  const richtung: Richtung = delta >= TREND_SCHWELLE ? "steigt" : delta <= -TREND_SCHWELLE ? "fällt" : "gleich";
  return { score, day, delta, richtung, ampel: scoreAmpel(score), punkte };
}

/** „↑ +3,2“, „↓ −4“, „→ gleich“, „neu“, „keine Basis“. */
export function trendText(g: Pick<GehirnScore, "delta" | "richtung">): string {
  const n = (x: number) => `${x > 0 ? "+" : x < 0 ? "−" : ""}${Math.abs(x).toLocaleString("de-DE", { maximumFractionDigits: 1 })}`;
  if (g.richtung === "steigt") return `↑ ${n(g.delta ?? 0)}`;
  if (g.richtung === "fällt") return `↓ ${n(g.delta ?? 0)}`;
  if (g.richtung === "gleich") return "→ gleich";
  return g.richtung;
}

/** Selbstanpassung (decisions, subject „Meta: …“) → kurzer Titel ≤ 60 Zeichen. */
export function anpassungTitel(d: { kurz_titel?: string | null; subject?: string | null }): string {
  const t = (d.kurz_titel || String(d.subject ?? "").replace(/^Meta:\s*/, "")).replace(/\s+/g, " ").trim();
  return t.length > 60 ? `${t.slice(0, 59).trimEnd()}…` : t;
}

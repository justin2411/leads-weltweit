/**
 * Abteilung Vertrieb (Kommandozentrale, Inhaber 04.10.2026): Pipeline angeschrieben → geantwortet → Probe →
 * Kaufinteresse → Kunde je Land (S2 × US/UK/FR), Konversion je Schritt, heiße Kontakte. Reine Funktionen.
 * Quellen: cohort_funnel (Einheit = Käufer, je Versandwoche), inbound_replies (echte Antworten, Absicht), Abos.
 * Ehrlich: Antworten brauchen Zeit – die Antwort-Ampel rechnet nur mit reifen Wochen (≥ 14 Tage nach Wochenende, wie
 * §5); ohne reife Woche bleibt sie grau. Es wird nichts geschätzt.
 */
import { ampelVon, type Ampel, type Schwelle } from "../ampel.ts";
import { SCHWELLE as KOH, isJung, type KohorteRow } from "../kohorten.ts";
import { sortReplies, type ReplyRow } from "../antworten.ts";
import { abteilung, prozent, trendVon, type AbteilungKpi, type Trend } from "./kpi.ts";

export type Stufe = "angeschrieben" | "geantwortet" | "probe" | "kauf" | "kunde";
export const STUFEN: { key: Stufe; label: string }[] = [
  { key: "angeschrieben", label: "angeschrieben" }, { key: "geantwortet", label: "geantwortet" }, { key: "probe", label: "Probe" },
  { key: "kauf", label: "Kaufinteresse" }, { key: "kunde", label: "Kunde" },
];

/** Schwellen der Übergänge (Quote = Stufe / vorherige Stufe; geantwortet / zugestellt). */
export const SCHWELLE: Record<Exclude<Stufe, "angeschrieben">, Schwelle> = {
  geantwortet: KOH.antwort,
  probe: { gut: 0.3, knapp: 0.1, min: 5 },
  kauf: { gut: 0.2, knapp: 0.05, min: 3 },
  kunde: { gut: 0.5, knapp: 0.2, min: 2 },
};

export type Inbound = { replies: number; samples: number; buy: number };
export type LandZahlen = { land: string; zugestellt: number } & Record<Stufe, number>;
export type Schritt = { key: Exclude<Stufe, "angeschrieben">; k: number; n: number; quote: number | null; ampel: Ampel; jung: boolean };
export type Vertrieb = { laender: LandZahlen[]; gesamt: LandZahlen; schritte: Schritt[]; trend: Trend };

const leer = (land: string): LandZahlen => ({ land, zugestellt: 0, angeschrieben: 0, geantwortet: 0, probe: 0, kauf: 0, kunde: 0 });

export function vertrieb(kohorten: KohorteRow[], inbound: Record<string, Inbound>, kunden: Record<string, number>, laender: readonly string[], heute: string): Vertrieb {
  const rows = laender.map((land) => {
    const k = kohorten.filter((r) => r.country === land);
    const s = (f: keyof KohorteRow) => k.reduce((a, r) => a + (Number(r[f]) || 0), 0);
    const ib = inbound[land] ?? { replies: 0, samples: 0, buy: 0 };
    return {
      land, zugestellt: s("delivered"), angeschrieben: s("sent"), geantwortet: Math.max(s("replies"), ib.replies),
      probe: Math.max(s("samples"), ib.samples), kauf: ib.buy, kunde: Math.max(s("customers"), kunden[land] ?? 0),
    };
  });
  const gesamt = rows.reduce<LandZahlen>((a, r) => ({
    land: "gesamt", zugestellt: a.zugestellt + r.zugestellt, angeschrieben: a.angeschrieben + r.angeschrieben,
    geantwortet: a.geantwortet + r.geantwortet, probe: a.probe + r.probe, kauf: a.kauf + r.kauf, kunde: a.kunde + r.kunde,
  }), leer("gesamt"));
  // Antwortquote nur aus reifen Wochen (sonst färbt die laufende Woche rot, bevor Antworten kommen können)
  const reif = kohorten.filter((r) => laender.includes(r.country) && !isJung(r.week, heute));
  const rDel = reif.reduce((a, r) => a + r.delivered, 0), rRep = reif.reduce((a, r) => a + r.replies, 0);
  const schritte: Schritt[] = [
    { key: "geantwortet", k: gesamt.geantwortet, n: gesamt.zugestellt, quote: gesamt.zugestellt ? gesamt.geantwortet / gesamt.zugestellt : null,
      ampel: reif.length ? ampelVon(rRep, rDel, SCHWELLE.geantwortet) : "grey", jung: !reif.length },
    ...(["probe", "kauf", "kunde"] as const).map((key, i) => {
      const prev = (["geantwortet", "probe", "kauf"] as const)[i];
      const k = gesamt[key], n = gesamt[prev];
      return { key, k, n, quote: n ? Math.min(1, k / n) : null, ampel: ampelVon(Math.min(k, n), n, SCHWELLE[key]), jung: false };
    }),
  ];
  // Trend: Antwortquote der jüngsten reifen Woche gegen die davor
  const wochen = [...new Set(reif.map((r) => r.week))].sort().reverse();
  const q = (w: string) => {
    const x = reif.filter((r) => r.week === w);
    const d = x.reduce((a, r) => a + r.delivered, 0);
    return d ? x.reduce((a, r) => a + r.replies, 0) / d : 0;
  };
  const trend = wochen.length >= 2 ? trendVon(q(wochen[0]), q(wochen[1])) : null;
  return { laender: rows, gesamt, schritte, trend };
}

/** Heiße Kontakte: Kaufinteresse, Frage oder Probe, noch nicht erledigt; wichtigste und am längsten wartend zuerst. */
export const HEISS = ["buy", "question", "sample"];
export function heiss<T extends ReplyRow>(rows: T[], max = 12): T[] {
  return sortReplies(rows.filter((r) => r.status !== "erledigt" && HEISS.includes(String(r.intent)))).slice(0, max);
}

/** Antworten je Land zählen (ohne Abwesenheit; Probe = sample oder buy; Kauf = buy). */
export function inboundJeLand(rows: { intent: string | null; country: string | null }[]): Record<string, Inbound> {
  const out: Record<string, Inbound> = {};
  for (const r of rows) {
    if (!r.country || r.intent === "out_of_office") continue;
    const x = (out[r.country] ??= { replies: 0, samples: 0, buy: 0 });
    x.replies++;
    if (r.intent === "sample" || r.intent === "buy") x.samples++;
    if (r.intent === "buy") x.buy++;
  }
  return out;
}

/** Kennzahl für JARVIS: Antwortquote (Antworten / zugestellt), Ampel aus reifen Wochen. */
export function kpi(v: Vertrieb, offenHeiss = 0): AbteilungKpi {
  const a = v.schritte[0];
  const grund = v.gesamt.angeschrieben === 0
    ? "Noch keine Erstmail gesendet."
    : `${v.gesamt.angeschrieben} angeschrieben, ${v.gesamt.geantwortet} Antworten, ${v.gesamt.kauf} Kaufinteresse${offenHeiss ? `, ${offenHeiss} heiß offen` : ""}${a.jung ? " – Antworten laufen noch" : ""}.`;
  return abteilung({ titel: "Vertrieb", wert: prozent(a.quote), ampel: offenHeiss > 0 && a.ampel !== "red" ? "gold" : a.ampel, trend: v.trend, grund, href: "/dashboard/vertrieb" });
}

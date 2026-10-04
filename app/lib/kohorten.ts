/**
 * Kohorten-Trichter (Inhaber 04.10.2026): je Versandwoche (ISO-Woche der ersten Erstmail, deutsche Zeit) und Land
 * gesendet → zugestellt → Antwort → positiv → Probe → Kunde. Daten aus signalwerk.cohort_funnel (Einheit = Käufer).
 * Ampel je Schritt nach festen Schwellen (§5: positiv < 2 % stoppen, > 5 % ausbauen). Antworten brauchen Zeit:
 * Wochen, die vor weniger als 14 Tagen endeten, bleiben ab „Antwort“ grau („läuft noch“), wie die Messregel in §5.
 */
import { ampelVon, type Ampel, type Schwelle } from "./ampel.ts";

export type KohorteRow = { week: string; country: string; sent: number; delivered: number; replies: number; positive: number; samples: number; customers: number };
export type Schritt = "zugestellt" | "antwort" | "positiv" | "probe" | "kunde";
export const SCHRITTE: { key: Schritt; label: string; kurz: string; feld: keyof KohorteRow; basis: keyof KohorteRow; basisLabel: string }[] = [
  { key: "zugestellt", label: "zugestellt", kurz: "zug.", feld: "delivered", basis: "sent", basisLabel: "gesendet" },
  { key: "antwort", label: "Antwort", kurz: "Antw.", feld: "replies", basis: "delivered", basisLabel: "zugestellt" },
  { key: "positiv", label: "positiv", kurz: "pos.", feld: "positive", basis: "delivered", basisLabel: "zugestellt" },
  { key: "probe", label: "Probe", kurz: "Probe", feld: "samples", basis: "positive", basisLabel: "positiv" },
  { key: "kunde", label: "Kunde", kurz: "Kunde", feld: "customers", basis: "samples", basisLabel: "Proben" },
];
/** Schwellen je Schritt (Quote = Schritt / Basis). Zustellung wie Notbremse (5 % Bounces), positiv wie §5. */
export const SCHWELLE: Record<Schritt, Schwelle> = {
  zugestellt: { gut: 0.97, knapp: 0.95, min: 20 },
  antwort: { gut: 0.03, knapp: 0.01, min: 50 },
  positiv: { gut: 0.05, knapp: 0.02, min: 50 },
  probe: { gut: 0.5, knapp: 0.2, min: 3 },
  kunde: { gut: 0.2, knapp: 0.05, min: 3 },
};
export const REIFE_TAGE = 14;

export type Zelle = { k: number; n: number; quote: number | null; ampel: Ampel; jung: boolean };
export type Kohorte = { week: string; country: string; sent: number; jung: boolean; zellen: Record<Schritt, Zelle> };

const num = (v: unknown) => Number(v ?? 0) || 0;

export function normalizeRows(raw: unknown): KohorteRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((r) => r && typeof r === "object" && /^\d{4}-W\d{2}$/.test(String((r as KohorteRow).week))).map((r) => {
    const x = r as Record<string, unknown>;
    return { week: String(x.week), country: String(x.country), sent: num(x.sent), delivered: num(x.delivered), replies: num(x.replies), positive: num(x.positive), samples: num(x.samples), customers: num(x.customers) };
  });
}

/** Letzter Tag (Sonntag) einer ISO-Woche „2026-W40“ als YYYY-MM-DD. */
export function weekEnd(week: string): string {
  const m = /^(\d{4})-W(\d{2})$/.exec(week);
  if (!m) return "9999-12-31";
  const jan4 = new Date(Date.UTC(Number(m[1]), 0, 4));
  const monday1 = Date.UTC(Number(m[1]), 0, 4 - ((jan4.getUTCDay() + 6) % 7));
  return new Date(monday1 + ((Number(m[2]) - 1) * 7 + 6) * 86_400_000).toISOString().slice(0, 10);
}

/** Kohorte jung = Woche endete vor weniger als 14 Tagen (heute = YYYY-MM-DD, deutsche Zeit). */
export function isJung(week: string, today: string): boolean {
  return Date.parse(`${today}T00:00:00Z`) - Date.parse(`${weekEnd(week)}T00:00:00Z`) < REIFE_TAGE * 86_400_000;
}

/**
 * Eine Kohorte bewerten. `reif` (nur für „gesamt“): Ampel ab „Antwort“ nur aus reifen Wochen – sonst färbt die
 * laufende Woche die Summe rot, bevor Antworten überhaupt kommen können. Ohne reife Woche bleibt es grau.
 */
export function kohorte(r: KohorteRow, today: string | null, reif?: KohorteRow): Kohorte {
  const jung = today ? isJung(r.week, today) : reif ? reif.sent === 0 : false;
  const zellen = {} as Record<Schritt, Zelle>;
  for (const s of SCHRITTE) {
    const k = num(r[s.feld]), n = num(r[s.basis]);
    const wartet = jung && s.key !== "zugestellt";
    const b = reif && s.key !== "zugestellt" ? reif : r;
    zellen[s.key] = { k, n, quote: n ? k / n : null, ampel: wartet ? "grey" : ampelVon(num(b[s.feld]), num(b[s.basis]), SCHWELLE[s.key]), jung: wartet };
  }
  return { week: r.week, country: r.country, sent: r.sent, jung, zellen };
}

/** Summe je Land über die übergebenen Wochen („gesamt“). */
export function gesamt(rows: KohorteRow[], countries: readonly string[]): KohorteRow[] {
  return countries.map((c) => rows.filter((r) => r.country === c).reduce<KohorteRow>((a, r) => ({
    week: "gesamt", country: c, sent: a.sent + r.sent, delivered: a.delivered + r.delivered, replies: a.replies + r.replies,
    positive: a.positive + r.positive, samples: a.samples + r.samples, customers: a.customers + r.customers,
  }), { week: "gesamt", country: c, sent: 0, delivered: 0, replies: 0, positive: 0, samples: 0, customers: 0 }));
}

/** Wochen (neueste zuerst) × Länder; fehlende Kombinationen bleiben leer (null). */
export function matrix(rows: KohorteRow[], countries: readonly string[], today: string, weeks = 6) {
  const ws = [...new Set(rows.map((r) => r.week))].sort().reverse().slice(0, weeks);
  return {
    weeks: ws,
    cells: ws.map((w) => countries.map((c) => {
      const r = rows.find((x) => x.week === w && x.country === c);
      return r ? kohorte(r, today) : null;
    })),
    gesamt: (() => {
      const shown = rows.filter((r) => ws.includes(r.week));
      const reif = gesamt(shown.filter((r) => !isJung(r.week, today)), countries);
      return gesamt(shown, countries).map((r, i) => kohorte(r, null, reif[i]));
    })(),
  };
}

const pct = (q: number | null) => (q === null ? "–" : `${(Math.round(q * 1000) / 10).toString().replace(".", ",")} %`);
export const quoteText = pct;

/** Kompakt für den JARVIS-Kontext: je Kohorte eine Zeile „W40 US 69→66→0→0→0→0 jung“, schlechteste reife Ampel zuerst markiert. */
export function kohortenBrief(rows: KohorteRow[] | null, countries: readonly string[], today: string, weeks = 4): unknown {
  if (!rows) return "nicht lesbar";
  if (!rows.length) return "noch keine Erstmails";
  const m = matrix(rows, countries, today, weeks);
  const out: string[] = [];
  for (const [i, w] of m.weeks.entries()) {
    for (const k of m.cells[i]) {
      if (!k) continue;
      const z = k.zellen;
      const rot = SCHRITTE.filter((s) => z[s.key].ampel === "red").map((s) => s.label);
      out.push(`${w.slice(5)} ${k.country} ${k.sent}→${z.zugestellt.k}→${z.antwort.k}→${z.positiv.k}→${z.probe.k}→${z.kunde.k}${k.jung ? " jung" : ""}${rot.length ? ` rot:${rot.join("/")}` : ""}`);
    }
  }
  return { reihe: "gesendet→zugestellt→Antwort→positiv→Probe→Kunde", jung: `< ${REIFE_TAGE} T seit Wochenende, ab Antwort noch offen`, kohorten: out };
}

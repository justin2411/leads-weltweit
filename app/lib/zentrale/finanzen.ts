/**
 * Abteilung Finanzen (Kommandozentrale, Inhaber 04.10.2026): MRR, Umsatz Monat/Woche, aktive Abos je Paket und Land,
 * Kündigungen. Reine Funktionen, keine Datenbank (Daten: app/lib/zentrale/data.ts).
 * Ehrlich: Testkäufe (Stripe-Testmodus) zählen nie. Eine eigene Zahlungstabelle gibt es nicht – Umsatz wird aus den
 * Abrechnungstagen der Abos gerechnet (Start + volle Monate, bis zur Kündigung); den Zahlungseingang zeigt Stripe.
 * Preise werden hier nur angezeigt, nie gesetzt (Gehirn/Inhaber). Währungen werden nicht umgerechnet.
 */
import type { Ampel } from "../ampel.ts";
import { abteilung, unlesbar, kurzZahl, trendVon, type AbteilungKpi } from "./kpi.ts";

export type AboIn = {
  id: string; status: string; package: string | null; amount_cents: number | null; currency: string | null;
  price_eur_month: number | null; started_on: string | null; cancelled_on: string | null; country: string | null;
  /** Kauf im Stripe-Testmodus oder Testnotiz – zählt nie */
  test: boolean;
};

export type Geld = { sign: string; betrag: number }[];
export type Finanzen = {
  mrr: Geld; mrrSumme: number;
  umsatzMonat: Geld; umsatzWoche: Geld; umsatzVormonat: Geld;
  aktiv: number; neu30: number; kuendigungen30: number; zahlungOffen: number; testkaeufe: number;
  jePaket: { paket: string; n: number }[];
  jeLand: { land: string; n: number; mrr: Geld }[];
  /** feste Betriebskosten, die das System selbst verursacht (kostenloser Betrieb) */
  kostenFest: 0;
};

/** Zählt für MRR (wie realSubscriptions im Dashboard) */
export const AKTIV = ["active", "past_due"];
/** Abrechnungstage laufen (Stripe bucht weiter, auch bei interner Pause der Lieferung) */
const BUCHT = ["active", "past_due", "paused", "cancelled"];

export function sign(cur: string | null | undefined, country?: string | null): string {
  const c = (cur ?? "").toLowerCase();
  if (c === "gbp") return "£";
  if (c === "usd") return "$";
  if (c === "eur") return "€";
  return country === "UK" ? "£" : country === "US" ? "$" : "€";
}

export const monatlich = (s: Pick<AboIn, "amount_cents" | "price_eur_month">): number =>
  (s.amount_cents ?? 0) / 100 || Number(s.price_eur_month ?? 0) || 0;

const DAY = /^\d{4}-\d{2}-\d{2}$/;

/** Datum + k Monate (Tag am Monatsende gekappt, wie Stripe): 2026-01-31 + 1 → 2026-02-28. */
export function plusMonate(day: string, k: number): string {
  const [y, m, d] = day.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1 + k, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(d, last));
  return t.toISOString().slice(0, 10);
}

/** Abrechnungstage eines Abos im Zeitraum [von, bis] (YYYY-MM-DD), nie nach heute und nicht ab der Kündigung. */
export function abrechnungen(s: Pick<AboIn, "status" | "started_on" | "cancelled_on">, von: string, bis: string, heute: string): string[] {
  if (!s.started_on || !DAY.test(s.started_on) || !BUCHT.includes(s.status)) return [];
  const ende = bis < heute ? bis : heute;
  const out: string[] = [];
  for (let k = 0; k < 600; k++) {
    const d = plusMonate(s.started_on, k);
    if (d > ende) break;
    if (k > 0 && s.cancelled_on && d >= s.cancelled_on) break;
    if (d >= von) out.push(d);
  }
  return out;
}

const add = (m: Map<string, number>, k: string, v: number) => m.set(k, (m.get(k) ?? 0) + v);
const geld = (m: Map<string, number>): Geld => [...m].filter(([, v]) => v > 0).map(([s, betrag]) => ({ sign: s, betrag })).sort((a, b) => b.betrag - a.betrag);

/** „1.290 £ + 249 $“ bzw. „0“. */
export const geldText = (g: Geld): string => g.map((x) => `${kurzZahl(x.betrag, 0)} ${x.sign}`).join(" + ") || "0";
export const geldSumme = (g: Geld): number => g.reduce((a, x) => a + x.betrag, 0);

/** Montag der Woche (deutscher Kalendertag) */
export function wochenStart(heute: string): string {
  const t = new Date(`${heute}T00:00:00Z`);
  t.setUTCDate(t.getUTCDate() - ((t.getUTCDay() + 6) % 7));
  return t.toISOString().slice(0, 10);
}
const minusTage = (heute: string, n: number) => new Date(Date.parse(`${heute}T00:00:00Z`) - n * 86_400_000).toISOString().slice(0, 10);

/** heute = deutscher Kalendertag (YYYY-MM-DD). */
export function finanzen(abos: AboIn[], heute: string): Finanzen {
  const echt = abos.filter((s) => !s.test);
  const aktiv = echt.filter((s) => AKTIV.includes(s.status));
  const mrr = new Map<string, number>(), monat = new Map<string, number>(), woche = new Map<string, number>(), vor = new Map<string, number>();
  const monatsStart = `${heute.slice(0, 7)}-01`;
  const vorStart = plusMonate(monatsStart, -1), vorEnde = minusTage(monatsStart, 1);
  const wStart = wochenStart(heute);
  const paket = new Map<string, number>(), land = new Map<string, { n: number; mrr: Map<string, number> }>();
  for (const s of aktiv) {
    const sg = sign(s.currency, s.country);
    add(mrr, sg, monatlich(s));
    add(paket, s.package ?? "Abo", 1);
    const l = s.country ?? "?";
    const x = land.get(l) ?? { n: 0, mrr: new Map() };
    x.n++; add(x.mrr, sg, monatlich(s));
    land.set(l, x);
  }
  for (const s of echt) {
    const sg = sign(s.currency, s.country), v = monatlich(s);
    add(monat, sg, v * abrechnungen(s, monatsStart, heute, heute).length);
    add(woche, sg, v * abrechnungen(s, wStart, heute, heute).length);
    add(vor, sg, v * abrechnungen(s, vorStart, vorEnde, heute).length);
  }
  const seit30 = minusTage(heute, 30);
  const g = geld(mrr);
  return {
    mrr: g, mrrSumme: geldSumme(g),
    umsatzMonat: geld(monat), umsatzWoche: geld(woche), umsatzVormonat: geld(vor),
    aktiv: aktiv.length,
    neu30: echt.filter((s) => s.started_on && s.started_on >= seit30 && BUCHT.includes(s.status)).length,
    kuendigungen30: echt.filter((s) => s.cancelled_on && s.cancelled_on >= seit30).length,
    zahlungOffen: echt.filter((s) => s.status === "past_due").length,
    testkaeufe: abos.length - echt.length,
    jePaket: [...paket].map(([p, n]) => ({ paket: p, n })).sort((a, b) => b.n - a.n),
    jeLand: [...land].map(([l, x]) => ({ land: l, n: x.n, mrr: geld(x.mrr) })).sort((a, b) => b.n - a.n),
    kostenFest: 0,
  };
}

/**
 * Kennzahl für JARVIS: MRR. Ampel gegen das MRR-Ziel (company_goals 'mrr'): ≥ 100 % grün, ≥ 50 % gelb, sonst rot;
 * ohne Ziel und ohne Umsatz grau. Trend = neue Abos gegen Kündigungen der letzten 30 Tage.
 */
export function kpiAus(f: Finanzen, ziel: number | null = null): AbteilungKpi {
  const ampel: Ampel = ziel && ziel > 0
    ? (f.mrrSumme >= ziel ? "green" : f.mrrSumme >= ziel / 2 ? "gold" : "red")
    : f.mrrSumme > 0 ? "green" : "grey";
  const grund = f.aktiv === 0
    ? "Noch kein zahlender Kunde – Umsatz 0."
    : `${f.aktiv} aktive Abos, ${f.kuendigungen30} Kündigungen in 30 Tagen${f.zahlungOffen ? `, ${f.zahlungOffen} Zahlung offen` : ""}.`;
  return abteilung({
    titel: "Finanzen", wert: geldText(f.mrr), ampel, href: "/dashboard/finanzen",
    trend: f.neu30 || f.kuendigungen30 ? trendVon(f.neu30, f.kuendigungen30) : null, grund,
  });
}

/** Kennzahl für die JARVIS-Abteilungs-Übersicht (lädt selbst; nur auf dem Server aufrufen). */
export async function kpi(): Promise<AbteilungKpi> {
  try {
    const { loadZentraleKpis } = await import("./data");
    return (await loadZentraleKpis()).finanzen ?? unlesbar("Finanzen", "/dashboard/finanzen");
  } catch {
    return unlesbar("Finanzen", "/dashboard/finanzen");
  }
}

/**
 * JARVIS-Zentrale: KPI-Leiste, Umsatz-Ziel-Ring und Website-Trichter (Inhaber 05.10.2026: „alle benötigten KPIs sehen …
 * Website-Daten wie bei Google Analytics mit einem Trichter“, Ziel 25.000 €/Monat). Reine Funktionen ohne Next/Supabase,
 * damit dieselben Regeln getestet werden (lib/jarvis-kpi.test.ts).
 *
 * Trichter: Besucher → Probe-Klick → Probe-Anfrage → Checkout → Kunde aus derselben eigenen, anonymen Messung wie
 * /dashboard/website/auswertung (website_stats: Tagessummen je Landingpage; keine Cookies, kein Pixel, kein externer
 * Tracker). Kunde = abgeschlossene Käufe laut Stripe-Webhook (Trichter-Cache 'website_funnel'), mindestens die
 * gemessenen „purchase“-Ereignisse. Besucher = eindeutige Landingpage-Besucher je Tag (Tages-Hash).
 * Link-Scanner (Aufrufe aus Mails < 2 min nach Versand, signalwerk.web_scanner) zählen nie als Besucher/Klicks.
 */
import type { WebsiteStats } from "./website-stats.ts";
import type { Extra } from "./zentrale-typen.ts";
import { PACKAGES } from "./owner-settings.ts";

/** Umsatz-Ziel (Inhaber 05.10.2026) und der Preis, an dem der Weg gemessen wird (Pro). */
export const ZIEL_MRR = 25_000;
export const PRO_PREIS: number = PACKAGES.pro.price;
export const TRICHTER_TAGE = [7, 30] as const;
export type Tage = (typeof TRICHTER_TAGE)[number];
export const TRICHTER_LAENDER = ["US", "UK", "FR"] as const;
export type LandWahl = "alle" | (typeof TRICHTER_LAENDER)[number];

export type StufeId = "besucher" | "klick" | "anfrage" | "checkout" | "kunde";
export const STUFEN: { id: StufeId; label: string; tip: string }[] = [
  { id: "besucher", label: "Besucher", tip: "eindeutige Besucher der Landingpages (je Tag, ohne Cookies)" },
  { id: "klick", label: "Probe-Klick", tip: "Klicks auf den Probe-Knopf" },
  { id: "anfrage", label: "Probe-Anfrage", tip: "abgeschickte Probe-Formulare" },
  { id: "checkout", label: "Checkout", tip: "gestartete Stripe-Checkouts" },
  { id: "kunde", label: "Kunde", tip: "abgeschlossene Käufe (Stripe)" },
];

export type Stufe = { id: StufeId; label: string; tip: string; n: number; /** Anteil an der vorigen Stufe (null: erste Stufe oder vorige 0) */ quote: number | null };
export type Anteil = { k: string; n: number };
export type Trichter = {
  tage: Tage; land: LandWahl; stufen: Stufe[];
  /** Aufrufe der Landingpages (alle, auch ohne eindeutige Messung) */
  aufrufe: number;
  quellen: Anteil[]; seiten: Anteil[];
  /** Besucher und Kunden je Land (für die Länder-Knöpfe) */
  laender: { c: string; besucher: number; kunde: number }[];
  /** abgezogene Link-Scanner (Aufrufe aus Mails < 2 min nach Versand); null = keine Messung, nichts abgezogen */
  scanner: { besuche: number; klicks: number; ereignisse: number } | null;
};
/** Scanner je Landingpage (signalwerk.web_scanner): Besuche aus Mails < 2 min nach Versand und ihre Folge-Ereignisse. */
export type ScannerZeile = { s: string; besuche: number; views: number; klick: number; anfrage: number; checkout: number };
export type TrichterPaket = { tage: Tage; at: string | null; seit: string | null; je: Record<LandWahl, Trichter> };

const num = (x: unknown) => (typeof x === "number" && Number.isFinite(x) ? x : Number(x) || 0);
const landVon = (slug: string) => slug.slice(0, 2).toUpperCase();
const sortiert = (m: Map<string, number>): Anteil[] => [...m].map(([k, n]) => ({ k, n })).filter((x) => x.n > 0).sort((a, b) => b.n - a.n || a.k.localeCompare(b.k));
const add = (m: Map<string, number>, k: string, n: number) => m.set(k, (m.get(k) ?? 0) + n);

/**
 * Trichter für Zeitraum und Land aus website_stats(tage) und den Stripe-Käufen je Land. Link-Scanner der Empfänger
 * (scanner, Gehirn 05.10.2026) werden abgezogen und getrennt ausgewiesen – nie unter 0.
 */
export function trichterAus(st: WebsiteStats | null, kaeufe: Record<string, number> | null | undefined, tage: Tage, land: LandWahl,
  scanner: ScannerZeile[] | null = null): Trichter {
  const rows = (st?.rows ?? []).filter((r) => r.d >= (st?.since ?? "") && (land === "alle" || landVon(r.s) === land));
  let besucher = 0, aufrufe = 0, klick = 0, anfrage = 0, checkout = 0;
  const quellen = new Map<string, number>(), seiten = new Map<string, number>();
  for (const r of rows) {
    const n = num(r.n);
    if (r.m === "uv" && r.k === "landing") besucher += n;
    else if (r.m === "src") add(quellen, r.k, n);
    else if (r.m === "pe") {
      if (r.k === "view") { aufrufe += n; add(seiten, r.s, n); }
      else if (r.k === "cta_click") klick += n;
      else if (r.k === "sample_request") anfrage += n;
      else if (r.k === "checkout_started") checkout += n;
    }
  }
  const sc = scanner ? scanner.filter((x) => land === "alle" || landVon(x.s) === land) : null;
  const sum = (k: keyof Omit<ScannerZeile, "s">) => (sc ?? []).reduce((a, x) => a + num(x[k]), 0);
  const ab = (n: number, m: number) => Math.max(0, n - m);
  besucher = ab(besucher, sum("besuche"));
  aufrufe = ab(aufrufe, sum("views"));
  klick = ab(klick, sum("klick"));
  anfrage = ab(anfrage, sum("anfrage"));
  checkout = ab(checkout, sum("checkout"));
  if (sc) {
    if (quellen.has("mail")) quellen.set("mail", ab(quellen.get("mail")!, sum("besuche")));
    for (const x of sc) if (seiten.has(x.s)) seiten.set(x.s, ab(seiten.get(x.s)!, num(x.views)));
  }
  // Kunde je Land = max(gemessene Käufe, Stripe-Käufe); „alle“ = Summe der Länder (sonst zählt ein Kauf doppelt oder gar nicht)
  const kaufVon = (c: string) => Math.max((st?.rows ?? []).filter((r) => r.d >= (st?.since ?? "") && landVon(r.s) === c && r.m === "pe" && r.k === "purchase")
    .reduce((a, r) => a + num(r.n), 0), num(kaeufe?.[c]));
  const alleLaender = new Set([...Object.keys(kaeufe ?? {}), ...(st?.rows ?? []).filter((r) => r.m === "pe" && r.k === "purchase").map((r) => landVon(r.s))]);
  const kunde = land === "alle" ? [...alleLaender].reduce((a, c) => a + kaufVon(c), 0) : kaufVon(land);
  const werte: Record<StufeId, number> = { besucher, klick, anfrage, checkout, kunde };
  const stufen: Stufe[] = STUFEN.map((s, i) => {
    const vor = i ? werte[STUFEN[i - 1].id] : 0;
    return { ...s, n: werte[s.id], quote: i && vor > 0 ? werte[s.id] / vor : null };
  });
  const laender = TRICHTER_LAENDER.map((c) => {
    const rs = (st?.rows ?? []).filter((r) => r.d >= (st?.since ?? "") && landVon(r.s) === c);
    const b = rs.filter((r) => r.m === "uv" && r.k === "landing").reduce((a, r) => a + num(r.n), 0);
    const sb = (scanner ?? []).filter((x) => landVon(x.s) === c).reduce((a, x) => a + num(x.besuche), 0);
    return { c, besucher: Math.max(0, b - sb), kunde: kaufVon(c) };
  });
  const scannerSumme = sc ? { besuche: sum("besuche"), klicks: sum("klick"), ereignisse: sum("views") + sum("klick") + sum("anfrage") + sum("checkout") } : null;
  return { tage, land, stufen, aufrufe, quellen: sortiert(quellen), seiten: sortiert(seiten).slice(0, 5), laender, scanner: scannerSumme };
}

/** Alle Länder-Fassungen eines Zeitraums (eine Abfrage, Umschalten im Browser ohne neuen Abruf). */
export function trichterPaket(st: WebsiteStats | null, kaeufe: Record<string, number> | null | undefined, tage: Tage, at: string | null,
  scanner: ScannerZeile[] | null = null): TrichterPaket {
  const je = Object.fromEntries((["alle", ...TRICHTER_LAENDER] as LandWahl[]).map((l) => [l, trichterAus(st, kaeufe, tage, l, scanner)])) as Record<LandWahl, Trichter>;
  return { tage, at, seit: st?.since ?? null, je };
}

/** Balkenbreite je Stufe in Prozent der größten Stufe; mit Wert mindestens 3 %, ohne 0. */
export function stufenBreite(stufen: { n: number }[]): number[] {
  const max = Math.max(0, ...stufen.map((s) => s.n));
  return stufen.map((s) => (max && s.n ? Math.max(3, Math.round((s.n / max) * 100)) : 0));
}

// ------------------------------------------------------------------------------------------------- Umsatz-Ziel
export type ZielWeg = { ist: number | null; ziel: number; anteil: number; fehlt: number; kundenGesamt: number; kundenNoch: number; kunden: number | null; preis: number };

/** Ring 25.000 €/Monat: Anteil, Lücke und benötigte Kunden bei Pro (aufgerundet). ist null = keine Messung. */
export function zielWeg(mrr: number | null | undefined, kunden: number | null | undefined, ziel = ZIEL_MRR, preis = PRO_PREIS): ZielWeg {
  const ist = mrr === null || mrr === undefined || !Number.isFinite(mrr) ? null : Math.max(0, mrr);
  const fehlt = Math.max(0, ziel - (ist ?? 0));
  return {
    ist, ziel, anteil: ist === null ? 0 : Math.min(1, ist / ziel), fehlt,
    kundenGesamt: Math.ceil(ziel / preis), kundenNoch: Math.ceil(fehlt / preis),
    kunden: kunden === null || kunden === undefined ? null : kunden, preis,
  };
}

// ------------------------------------------------------------------------------------------------- KPI-Leiste
export type Ton = "cy" | "gold" | "gruen" | "gelb" | "rot" | "grau";
export type Kpi = { id: string; label: string; wert: string; unter: string; ton: Ton; anteil: number | null; href: string; tip: string };

const de = (n: number) => Math.round(n).toLocaleString("de-DE");
const pct = (x: number) => `${(x * 100).toLocaleString("de-DE", { maximumFractionDigits: x * 100 < 10 ? 1 : 0 })} %`;

/** Ampel für Quoten: hoch gut (Zustellung, Qualität) oder tief gut (Rückläufer). */
export function quotenTon(x: number | null, gut: number, knapp: number, hochGut = true): Ton {
  if (x === null || !Number.isFinite(x)) return "grau";
  if (hochGut) return x >= gut ? "gruen" : x >= knapp ? "gelb" : "rot";
  return x <= gut ? "gruen" : x <= knapp ? "gelb" : "rot";
}

export type KpiEingabe = {
  tage: Tage; extra: Extra | null | undefined; mrr: number | null | undefined; kunden: number | null | undefined;
  /** Prüfquote 0…1 (firma_lage.bestanden) */ bestanden: number | null | undefined;
  laufend: number | null; gesamt: number;
};

/** Die zehn Kacheln der KPI-Leiste. Fehlende Daten: „–“ und grau (nie 0 erfinden). */
export function kpiLeiste(e: KpiEingabe): Kpi[] {
  const p = e.extra?.p?.[String(e.tage) as "7" | "30"] ?? null;
  const T = `${e.tage} T`;
  const sent = p ? num(p.sent) : null;
  const bounced = p ? num(p.bounced) : null;
  const zust = sent ? (sent - (bounced ?? 0)) / sent : null;
  const rueck = sent ? (bounced ?? 0) / sent : null;
  const q = e.bestanden === null || e.bestanden === undefined ? null : num(e.bestanden);
  const leer = (x: number | null | undefined) => x === null || x === undefined;
  return [
    { id: "mails", label: "Mails", wert: leer(sent) ? "–" : de(sent!), unter: `gesendet ${T}`, ton: leer(sent) ? "grau" : "cy", anteil: null, href: "/dashboard/versand", tip: `Erstmails und Nachfass, gesendet in ${e.tage} Tagen` },
    { id: "zustellung", label: "Zustellung", wert: zust === null ? "–" : pct(zust), unter: "zugestellt", ton: quotenTon(zust, 0.97, 0.95), anteil: zust, href: "/dashboard/versand", tip: "gesendet minus Rückläufer, geteilt durch gesendet" },
    { id: "rueck", label: "Rückläufer", wert: leer(bounced) ? "–" : de(bounced!), unter: rueck === null ? T : pct(rueck), ton: quotenTon(rueck, 0.02, 0.05, false), anteil: rueck, href: "/dashboard/versand", tip: "Notbremse ab 5 % (ab 100 Mails)" },
    { id: "antworten", label: "Antworten", wert: p ? de(num(p.antworten)) : "–", unter: p ? `positiv ${de(num(p.positiv))}` : T, ton: p ? "cy" : "grau", anteil: null, href: "/dashboard/antworten", tip: `menschliche Antworten in ${e.tage} Tagen (ohne Abwesenheit)` },
    { id: "proben", label: "Proben", wert: p ? de(num(p.proben)) : "–", unter: `angefragt ${T}`, ton: p ? "cy" : "grau", anteil: null, href: "/dashboard/proben", tip: "Probe-Anfragen (Formular und per Mail), ohne Tests" },
    { id: "kunden", label: "Kunden", wert: leer(e.kunden) ? "–" : de(num(e.kunden)), unter: "zahlend", ton: leer(e.kunden) ? "grau" : "cy", anteil: null, href: "/dashboard/kunden", tip: "aktive Abos (ohne Testkunden)" },
    { id: "mrr", label: "MRR", wert: leer(e.mrr) ? "–" : `${de(num(e.mrr))} €`, unter: "pro Monat", ton: leer(e.mrr) ? "grau" : "gold", anteil: leer(e.mrr) ? null : Math.min(1, num(e.mrr) / ZIEL_MRR), href: "/dashboard/finanzen", tip: "monatlicher Umsatz aus Abos" },
    { id: "premium", label: "Premium", wert: e.extra ? de(num(e.extra.premium)) : "–", unter: "lieferbar", ton: e.extra ? "cy" : "grau", anteil: null, href: "/dashboard/speicher", tip: "Leads der Stufe Premium (S2, US/UK/FR), noch nicht geliefert" },
    { id: "qualitaet", label: "Qualität", wert: q === null ? "–" : pct(q), unter: "bestanden", ton: quotenTon(q, 0.95, 0.9), anteil: q, href: "/dashboard/betrieb", tip: "bestandene Prüfungen seit gestern (S2, US/UK/FR)" },
    { id: "werke", label: "Werke", wert: e.laufend === null ? "–" : `${de(e.laufend)}/${de(e.gesamt)}`, unter: "Plätze belegt", ton: e.laufend === null ? "grau" : e.laufend > 0 ? "cy" : "gelb", anteil: e.laufend === null || !e.gesamt ? null : Math.min(1, e.laufend / e.gesamt), href: "/dashboard/regler", tip: "laufende Werk-Plätze (Herzschlag 15 min) von allen Plätzen" },
  ];
}

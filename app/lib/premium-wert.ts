/**
 * Wertrechnung für Webagenturen (Inhaber 04.10.2026: „premium leads … verstehen wie wertvoll diese leads für sie
 * sind“). Nur Zahlen aus docs/PREMIUM-WERT.md (Daten: content/premium-wert.json). Belegte Zahlen mit Quelle,
 * Annahmen nur als „Rechenbeispiel, kein Versprechen“. Gleiche Rechnung wie scripts/lib/premium_wert.py
 * (gemeinsame Fälle in tests/fixtures/premium_wert_cases.json). Reine Funktionen, ohne Datenbank.
 */

export type WertQuelle = { text: string; quelle: string; url: string };
export type WertLand = { lang: string; sym: string; belegt: WertQuelle[]; beispiel: { projekt: number; monat: number; jahr1: number } };
export type WertVergleich = { key: string; wert: number; sym: string; quelle: string; url: string };
export type WertDaten = {
  geprueft: string;
  pro_woche: Record<string, number>;
  laender: Record<string, WertLand>;
  vergleich: WertVergleich[];
  texte: Record<"en" | "fr", Record<string, string>>;
};
export type WertPlan = { key?: string; amount_cents?: number | null };

/** Länder mit Wertrechnung (Webagenturen US/UK/FR, wie die Test-Freigabe). */
export function wertLand(daten: WertDaten, segment: string | null | undefined, country: string | null | undefined): WertLand | null {
  if (String(segment ?? "").toUpperCase() !== "S2") return null;
  return daten.laender[String(country ?? "").toUpperCase()] ?? null;
}

/** Betrag in der Schreibweise des Landes: $3,500 · £1.44 · 3 000 € · 1,44 € (wie die Preis-je-Lead-Angabe im PDF). */
export function geld(x: number, sym: string, lang: string): string {
  const whole = Math.abs(x - Math.round(x)) < 0.005;
  const v = whole ? Math.round(x) : Math.round(x * 100) / 100;
  const [i, d] = (whole ? String(v) : v.toFixed(2)).split(".");
  const fr = lang === "fr";
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, fr ? " " : ",");
  const num = d ? `${int}${fr ? "," : "."}${d}` : int;
  return fr || sym === "€" ? `${num}\u00a0${sym}` : `${sym}${num}`;
}

/** Leads pro Monat bei voller Wochenmenge (15 bzw. 40 × 52/12), gerundet. */
export function leadsProMonat(daten: WertDaten, key: string): number {
  return Math.round((daten.pro_woche[key] ?? 0) * 52 / 12);
}

export type WertRechnung = {
  proLead: Record<"starter" | "pro", string>;
  monate: Record<"starter" | "pro", number>;
  leads: Record<"starter" | "pro", number>;
  beispiel: { projekt: string; monat: string; jahr1: string };
};

/**
 * Kosten je Lead und „deckt das Abo X Monate“ aus den aktuellen Paketpreisen (Preise gleich in allen Ländern,
 * Landeswährung). Ohne beide Pakete null: dann zeigt die Seite keine Rechnung.
 */
export function rechnung(daten: WertDaten, land: WertLand, plans: WertPlan[] | null | undefined): WertRechnung | null {
  const price = (k: string) => Number((plans ?? []).find((p) => p.key === k)?.amount_cents ?? 0) / 100;
  const s = price("starter"), p = price("pro");
  if (!(s > 0 && p > 0)) return null;
  const ns = (daten.pro_woche.starter ?? 0) * 52 / 12, np = (daten.pro_woche.pro ?? 0) * 52 / 12;
  if (!(ns > 0 && np > 0)) return null;
  const g = (x: number) => geld(x, land.sym, land.lang);
  const b = land.beispiel;
  return {
    proLead: { starter: g(s / ns), pro: g(p / np) },
    monate: { starter: Math.round(b.jahr1 / s), pro: Math.round(b.jahr1 / p) },
    leads: { starter: Math.round(ns), pro: Math.round(np) },
    beispiel: { projekt: g(b.projekt), monat: g(b.monat), jahr1: g(b.jahr1) },
  };
}

/** {name}-Platzhalter füllen. */
export function fuell(s: string, vars: Record<string, string | number>): string {
  return String(s ?? "").replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
}

/** Beispielsatz (Rechenbeispiel) fertig formuliert. */
export function beispielSatz(daten: WertDaten, lang: "en" | "fr", r: WertRechnung): string {
  return fuell(daten.texte[lang].beispiel, { ...r.beispiel, m_starter: r.monate.starter, m_pro: r.monate.pro });
}

/** Datum lokal („4 Oct 2026“ / „4 oct. 2026“). */
export function tag(iso: string, lang: "en" | "fr"): string {
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(iso + "T12:00:00Z") : null;
  return d ? d.toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }) : iso;
}

/** Ist die Wertrechnung auf dieser Variante an? (A/B-Element value_block, nur „an“ zählt) */
export function wertBlockAn(variant: { value_block?: string | null } | null | undefined): boolean {
  return String(variant?.value_block ?? "") === "an";
}

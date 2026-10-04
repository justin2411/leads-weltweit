/**
 * Kostenloses Werkzeug für Webagenturen (Auftrag 05.10.2026): „Finde Firmen ohne Website in deinem Land“ für US, UK, FR.
 * Reine Funktionen ohne Datenbank (Daten: lib/finder-data.ts, Seite: app/finder/[land]).
 *
 * Regeln: nur freigegebene, freie Anlässe (Status new, Drei-Stufen-Freigabe released, ohne reservierte/gelieferte),
 * höchstens Firmenname + Anlass + Datum – keine Kontakt- oder Personendaten. Beispiele nur von erkennbaren
 * Kapitalgesellschaften (Name kann sonst eine Person sein) und im Wechsel je Stunde, nicht immer dieselben Firmen.
 */
import { niceName, pickDiverse, seedOf, shortForm } from "./examples.ts";

export type FinderLand = "us" | "uk" | "fr";
export const FINDER_LANDS: FinderLand[] = ["us", "uk", "fr"];
export const FINDER_COUNTRY: Record<FinderLand, "US" | "UK" | "FR"> = { us: "US", uk: "UK", fr: "FR" };
/** S2-Landingpage je Land (Probe-Ablauf läuft über deren Seite). */
export const FINDER_SLUG: Record<FinderLand, string> = { us: "us/web-agencies", uk: "uk/web-agencies", fr: "fr/agences-web" };
/** Frische: Anlässe der letzten 14 Tage. */
export const FINDER_DAYS = 14;
/** Website-Befunde, die eine Webagentur verkaufen kann. */
export const FINDER_SIGNALS = ["no_website", "website_outdated", "website_not_mobile", "no_https", "website_broken"];

export function finderLand(x: string | undefined): FinderLand | null {
  const k = String(x ?? "").toLowerCase();
  return (FINDER_LANDS as string[]).includes(k) ? (k as FinderLand) : null;
}

/** Rechtsformen juristischer Personen: nur deren Namen zeigen wir (Einzelunternehmer-Namen sind oft Personennamen). */
const LEGAL = new Set(["Ltd", "LLC", "LLP", "PLC", "Corporation", "SAS", "SASU", "SARL", "EURL", "LP"]);
const NON_LATIN = /[぀-ヿ㐀-鿿가-힯Ѐ-ӿ؀-ۿ]/;

export type FinderRow = { id: string; name: string; legal_form?: string | null; signal: string; date: string; source?: string | null };
export type FinderExample = { name: string; signal: string; date: string };

export function isLegalPersonName(name: string, form?: string | null): boolean {
  const s = shortForm(form ?? undefined, name);
  return Boolean(s && LEGAL.has(s)) && !NON_LATIN.test(name) && name.trim().length >= 3;
}

/** Schlüssel für den Wechsel der Beispiele (Stunde in UTC – nur für die Auswahl, nichts gespeichert). */
export function rotationKey(d: Date = new Date()): string {
  return d.toISOString().slice(0, 13);
}

/**
 * n Beispiele: nur Kapitalgesellschaften, je Firma einmal, verschiedene Befunde, Auswahl wechselt mit `rot`.
 * Rückgabe nur Name (lesbar), Anlass-Typ und Datum.
 */
export function pickExamples(rows: FinderRow[], rot: string, n = 3): FinderExample[] {
  const ok = rows.filter((r) => FINDER_SIGNALS.includes(r.signal) && isLegalPersonName(r.name, r.legal_form));
  // Reihenfolge je Wechsel neu mischen (deterministisch), dann auf Vielfalt achten
  const mixed = [...ok].sort((a, b) => seedOf(rot + a.id) - seedOf(rot + b.id));
  const picked = pickDiverse(mixed.map((r) => ({ id: r.id, name: r.name, signal: r.signal, date: r.date, r })), n, rot);
  return picked.map(({ r }) => ({ name: niceName(r.name.trim()).replace(/\b(Llc|Llp|Plc)\b/g, (m) => m.toUpperCase()), signal: r.signal, date: r.date }));
}

export const FINDER_TEXT = {
  en: {
    title: (c: string) => `Find companies without a website in ${c}`,
    meta: (c: string) => `Free tool for web agencies: fresh, verified companies in ${c} without a working website.`,
    count: "new verified opportunities in the last 14 days",
    none: "Counting is paused right now. Please check back soon.",
    examples: "Three examples", company: "Company", event: "Opportunity", date: "Date",
    noEx: "No public examples right now.",
    rest: "Get 10 with contact details, free",
    back: "How it works",
    sig: { no_website: "No website found", website_outdated: "Outdated website", website_not_mobile: "Not mobile-friendly",
      no_https: "Website not secure", website_broken: "Website down" } as Record<string, string>,
  },
  fr: {
    title: (c: string) => `Trouvez des entreprises sans site web ${c}`,
    meta: (c: string) => `Outil gratuit pour agences web : entreprises récentes et vérifiées ${c} sans site web fonctionnel.`,
    count: "nouvelles opportunités vérifiées ces 14 derniers jours",
    none: "Le comptage est en pause. Revenez un peu plus tard.",
    examples: "Trois exemples", company: "Entreprise", event: "Opportunité", date: "Date",
    noEx: "Pas d'exemple public pour le moment.",
    rest: "Recevez-en 10 avec coordonnées, gratuitement",
    back: "Comment ça marche",
    sig: { no_website: "Aucun site trouvé", website_outdated: "Site web vieillissant", website_not_mobile: "Pas adapté au mobile",
      no_https: "Site non sécurisé", website_broken: "Site hors service" } as Record<string, string>,
  },
};

/** Land im Satz: „the US“, „the UK“, „en France“. */
export function finderPlace(land: FinderLand): string {
  return { us: "the US", uk: "the UK", fr: "en France" }[land];
}
export function finderLang(land: FinderLand): "en" | "fr" {
  return land === "fr" ? "fr" : "en";
}

export function finderDate(d: string, lang: "en" | "fr"): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
  return new Date(d + "T12:00:00Z").toLocaleDateString(lang === "fr" ? "fr-FR" : "en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
}

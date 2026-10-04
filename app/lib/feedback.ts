/**
 * Feedback-Werk (Inhaber 05.10.2026): Kunden bewerten gelieferte Leads per Link aus Lieferung oder Probe.
 * Reine Hilfsfunktionen ohne Next/Supabase (testbar). Seite: app/bewerten, Speichern: app/bewerten/actions.ts,
 * Auswertung: Büro Qualität. Gegenstück für das Lernen: scripts/lib/feedback.py (gleiche Gewichtsformel).
 * Kein Tracking: gespeichert wird nur, was der Kunde selbst anklickt; GET zeigt nur die Seite.
 */

export type Choice = "gut" | "schlecht" | "won" | "unwon";
export const CHOICES: readonly Choice[] = ["gut", "schlecht", "won", "unwon"];

/** Token aus der Mail: url-sicher, 20–64 Zeichen (secrets.token_urlsafe(24) = 32 Zeichen). */
export function validToken(t: unknown): t is string {
  return typeof t === "string" && /^[A-Za-z0-9_-]{20,64}$/.test(t);
}

export function parseChoice(v: unknown): Choice | null {
  return CHOICES.includes(v as Choice) ? (v as Choice) : null;
}

/** Spalten für das Upsert: nur das angeklickte Feld (die andere Angabe bleibt erhalten). */
export function patchFor(c: Choice): { rating?: "gut" | "schlecht"; won?: boolean } {
  if (c === "gut" || c === "schlecht") return { rating: c };
  return { won: c === "won" };
}

/** Gleiche Formel wie scripts/lib/feedback.py weight(). */
export const MIN_N = 5, PRIOR = 5, SPREAD = 0.6, W_MIN = 0.8, W_MAX = 1.25;
export function weight(gut: number, schlecht: number, gewonnen: number): number {
  const pos = gut + gewonnen, neg = schlecht;
  if (pos + neg < MIN_N) return 1;
  const p = (pos + PRIOR) / (pos + neg + 2 * PRIOR);
  return Math.round(Math.max(W_MIN, Math.min(W_MAX, 1 + (p - 0.5) * SPREAD)) * 1000) / 1000;
}

export type StatRow = { signal_type: string; country: string; bewertungen: number; gut: number; schlecht: number;
  gewonnen: number; gut_pct: number | null };

/** Büro Qualität: je Anlass (alle Länder) summiert, meiste Bewertungen zuerst, mit Gewicht. */
export function bySignal(rows: StatRow[]): (StatRow & { weight: number; laender: string[] })[] {
  const m = new Map<string, StatRow & { weight: number; laender: string[] }>();
  for (const r of rows) {
    const a = m.get(r.signal_type) ?? { signal_type: r.signal_type, country: "", bewertungen: 0, gut: 0, schlecht: 0,
      gewonnen: 0, gut_pct: null, weight: 1, laender: [] };
    a.bewertungen += r.bewertungen; a.gut += r.gut; a.schlecht += r.schlecht; a.gewonnen += r.gewonnen;
    if (!a.laender.includes(r.country)) a.laender.push(r.country);
    m.set(r.signal_type, a);
  }
  return [...m.values()].map((a) => ({
    ...a, laender: a.laender.sort(),
    gut_pct: a.gut + a.schlecht > 0 ? Math.round(1000 * a.gut / (a.gut + a.schlecht)) / 10 : null,
    weight: weight(a.gut, a.schlecht, a.gewonnen),
  })).sort((x, y) => y.bewertungen - x.bewertungen || x.signal_type.localeCompare(y.signal_type));
}

const SIGNAL: Record<string, [string, string, string]> = {
  new_incorporation: ["New company", "Nouvelle entreprise", "Neugründung"],
  incorporation: ["New company", "Nouvelle entreprise", "Neugründung"],
  new_company: ["New company", "Nouvelle entreprise", "Neugründung"],
  no_website: ["No website", "Pas de site web", "Keine Website"],
  website_outdated: ["Outdated website", "Site web obsolète", "Website veraltet"],
  website_not_mobile: ["Website not mobile-friendly", "Site non adapté au mobile", "Website nicht mobil"],
  website_broken: ["Website not working", "Site web en panne", "Website kaputt"],
  no_https: ["No secure connection (https)", "Pas de connexion sécurisée (https)", "Kein https"],
  relocation: ["Moved premises", "Déménagement", "Umzug"],
  cert_expiring: ["Certificate expiring", "Certificat qui expire", "Zertifikat läuft ab"],
};

/** Anlass lesbar für den Kunden (Seite) – unbekannte Schlüssel mit Leerzeichen statt Unterstrich. */
export function signalLabel(s: string | null | undefined, lang: string): string {
  const v = SIGNAL[s ?? ""];
  if (v) return lang === "fr" ? v[1] : lang === "de" ? v[2] : v[0];
  const t = String(s ?? "").replace(/_/g, " ").trim();
  return t ? t[0].toUpperCase() + t.slice(1) : "–";
}

export const TEXT = {
  en: { title: "Rate your leads", sub: "Optional, one click per lead. It helps us send you better leads – nothing else is recorded.",
        good: "Good", bad: "Bad", won: "Won a job", unwon: "Undo won", saved: "Saved – thank you.",
        expired: "This link is not valid", expiredSub: "Please reply to our email and we will send you a new link." },
  fr: { title: "Notez vos leads", sub: "Facultatif, un clic par lead. Cela nous aide à mieux cibler – rien d'autre n'est enregistré.",
        good: "Bon", bad: "Mauvais", won: "Contrat gagné", unwon: "Annuler", saved: "Enregistré – merci.",
        expired: "Ce lien n'est pas valide", expiredSub: "Répondez à notre e-mail et nous vous enverrons un nouveau lien." },
} as const;

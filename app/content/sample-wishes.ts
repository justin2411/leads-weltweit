/**
 * „Welche Leads brauchen Sie?“ im Probe-Formular (Inhaber 28.09.2026). Je Branche 3–4 Signale; der Schlüssel landet
 * in sample_requests.note ("wunsch:signals=a,b;text=…") und wird von scripts/web_samples.py bevorzugt geliefert
 * (Zuordnung Schlüssel -> Leads in scripts/lib/wishes.py, gleiche Schlüssel!). Reicht es nicht, füllt die Probe
 * mit anderen vollständigen Leads der Branche auf – nie mit unvollständigen.
 */
export type Wish = { key: string; en: string; fr: string; de: string };

export const WISHES: Record<string, Wish[]> = {
  recruitment: [
    { key: "job_open_30d", en: "Roles open 30+ days", fr: "Postes ouverts depuis 30+ jours", de: "Stellen seit 30+ Tagen offen" },
    { key: "jobs_3plus", en: "Several roles at once", fr: "Plusieurs postes à la fois", de: "Mehrere Stellen gleichzeitig" },
    { key: "new_location", en: "New location", fr: "Nouveau site", de: "Neuer Standort" },
  ],
  accountants: [
    { key: "new_incorporation", en: "Newly registered", fr: "Création récente", de: "Neu gegründet" },
    { key: "growth", en: "Fast growth", fr: "Forte croissance", de: "Starkes Wachstum" },
    { key: "finance_roles", en: "Finance roles open", fr: "Postes en finance ouverts", de: "Finanzstellen offen" },
  ],
  "web-agencies": [
    { key: "no_website", en: "No website", fr: "Sans site web", de: "Ohne Website" },
    { key: "website_outdated", en: "Outdated website", fr: "Site vieillissant", de: "Veraltete Website" },
    { key: "not_mobile", en: "Not mobile-friendly", fr: "Site non adapté au mobile", de: "Nicht mobilfähig" },
    { key: "security", en: "Security gaps", fr: "Failles de sécurité", de: "Sicherheitslücken" },
    { key: "broken", en: "Broken website", fr: "Site en panne", de: "Kaputte Website" },
    // „Neu gegründet“ entfernt (Audit 02.10.2026): S2-Neugründungen haben keine Kontaktdaten, nicht lieferbar
  ],
  // Marketing-/SEO-Agenturen (S12): gleiche Schlüssel wie Webagenturen (gleiche Leads, scripts/lib/wishes.py)
  "marketing-agencies": [
    { key: "no_website", en: "No website", fr: "Sans site web", de: "Ohne Website" },
    { key: "website_outdated", en: "Outdated website", fr: "Site vieillissant", de: "Veraltete Website" },
    { key: "not_mobile", en: "Not mobile-friendly", fr: "Site non adapté au mobile", de: "Nicht mobilfähig" },
    { key: "security", en: "Security gaps", fr: "Failles de sécurité", de: "Sicherheitslücken" },
    { key: "broken", en: "Broken website", fr: "Site en panne", de: "Kaputte Website" },
  ],
  "insurance-brokers": [
    { key: "new_incorporation", en: "Newly registered", fr: "Création récente", de: "Neu gegründet" },
    { key: "expansion", en: "Expansion or new site", fr: "Expansion ou nouveau site", de: "Expansion oder neuer Standort" },
    { key: "fleet_warehouse", en: "Fleet or warehouse", fr: "Flotte ou entrepôt", de: "Fuhrpark oder Lager" },
  ],
  "financial-advisers": [
    { key: "new_director", en: "New company directors", fr: "Nouveaux dirigeants", de: "Neue Geschäftsführer" },
    { key: "growth", en: "Fast-growing employers", fr: "Employeurs en forte croissance", de: "Schnell wachsende Arbeitgeber" },
  ],
};

const DEFAULT: Wish[] = [
  { key: "new_incorporation", en: "Newly registered", fr: "Création récente", de: "Neu gegründet" },
  { key: "growth", en: "Fast growth", fr: "Forte croissance", de: "Starkes Wachstum" },
  { key: "job_open_30d", en: "Roles open 30+ days", fr: "Postes ouverts depuis 30+ jours", de: "Stellen seit 30+ Tagen offen" },
];

export function wishesFor(seg: string): Wish[] {
  return WISHES[seg] ?? DEFAULT;
}

export const MAX_WISHES = 3;
export const MAX_TEXT = 200;

/** Freitext: eine Zeile, ohne Steuerzeichen, höchstens 200 Zeichen. */
export function cleanText(s: string): string {
  return s.replace(/[\u0000-\u001f\u007f]+/g, " ").replace(/\s+/g, " ").trim().slice(0, MAX_TEXT);
}

/** Erlaubte Wunsch-Schlüssel dieser Branche (höchstens MAX_WISHES, ohne Doppelte). */
export function wishKeys(seg: string, keys: string[]): string[] {
  const allowed = new Set(wishesFor(seg).map((w) => w.key));
  return [...new Set(keys)].filter((k) => allowed.has(k)).slice(0, MAX_WISHES);
}

/** Maschinenlesbarer Wunsch für sample_requests.note (immer am Ende, Freitext zuletzt). */
export function wishNote(seg: string, keys: string[], text: string): string {
  const ks = wishKeys(seg, keys);
  const tx = cleanText(text);
  if (!ks.length && !tx) return "";
  return `wunsch:signals=${ks.join(",")}${tx ? `;text=${tx}` : ""}`;
}

/** Adresse formal prüfen (Freemail erlaubt, Inhaber 28.09.2026). */
export function validEmail(email: string): boolean {
  return email.length <= 200 && /^[^\s@"<>(),;:]{1,64}@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*\.[a-z]{2,}$/i.test(email);
}

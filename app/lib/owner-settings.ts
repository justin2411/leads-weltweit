/**
 * Steuerung aus dem Dashboard (Inhaber 03.10.2026): Schlüssel, Standardwerte und Prüfung jeder Eingabe.
 * Gleiche Grenzen wie scripts/lib/owner_settings.py. Harte Grenzen sind hier NICHT einstellbar: Mail-Länder,
 * countries.yaml-Limits nach oben, Notbremse, Sperrliste, Frischeprüfung, Probe genau 10, keine Kaltmails über Resend.
 * Reine Funktionen (ohne Next/Supabase), damit testbar.
 */
export const MAX_SAMPLE_TARGET = 100;
export const MAX_AGE_RANGE = [24, 96] as const;
export const FOLLOWUP_DAYS_RANGE = [3, 10] as const;

export type OwnerSettings = {
  send_paused: boolean;
  send_countries_off: string[];
  send_country_limits: Record<string, number>;
  followup_enabled: boolean;
  followup_days: number | null;
  sample_targets: Record<string, number>;
  sample_max_age_hours: number | null;
  buyer_countries_off: string[];
  /** Werke an/aus per Klick (Inhaber 03.10.2026): Werk -> pausiert seit (ISO). */
  werke_paused: Record<string, string>;
  /** Belegungsplan (Inhaber 03.10.2026): Plätze je Linie (app/lib/werk-linien.json), leer = Standard. */
  slot_plan: Record<string, number>;
  /** Autopilot der Plätze (Inhaber 03.10.2026: „Ja, Autopilot an“): scripts/werk_plan.py verteilt bei jedem Start um. */
  slot_autopilot: { on: boolean; locks: Record<string, number> };
  /** Ausgeblendete JARVIS-Empfehlungen/Hinweise (Inhaber 04.10.2026): Schlüssel (lib/tips.ts tipKey) -> bis (ISO). */
  dismissed_tips: Record<string, string>;
  /** Monatsgrenze der Sofort-Antworten über die Claude-API in Euro (Inhaber 04.10.2026: „vorerst 30 €“). */
  llm_budget_eur: number;
  /** Website Auto-Fix (Inhaber 04.10.2026: „jarvis soll das aber eigentlich alles selber machen“): an = JARVIS behebt
   * neue Website-Funde selbst (scripts/website_agents.py autofix). */
  website_autofix: boolean;
  /** Ausgeblendete Website-Funde: Fund-Schlüssel (website_checks.funde[].key) -> bis (ISO), 30 Tage. */
  website_ignored: Record<string, string>;
};
export type SettingKey = keyof OwnerSettings;

export const DEFAULTS: OwnerSettings = {
  send_paused: false, send_countries_off: [], send_country_limits: {}, followup_enabled: true, followup_days: null,
  sample_targets: {}, sample_max_age_hours: null, buyer_countries_off: [], werke_paused: {}, slot_plan: {},
  slot_autopilot: { on: true, locks: {} }, dismissed_tips: {}, llm_budget_eur: 30, website_autofix: true, website_ignored: {},
};

/**
 * Schalter je Werk (Inhaber 03.10.2026: „alles direkt per click an und ausschalten können jedes werk“). Versand und
 * Nachfass nutzen ihre bestehenden Schalter. NIE schaltbar (Sicherheit): Abmelde-Link, Resend-Webhook (Bounce/
 * Beschwerde-Sperre), Sperrliste, Notbremse und die Abmelde-Erkennung im Antwort-Assistenten.
 */
export const WERK_SWITCHES = {
  "lead-werk": { label: "Lead-Werk", via: "werke_paused" },
  "kunden-werk": { label: "Kunden-Werk", via: "werke_paused" },
  "proben-vorrat": { label: "Proben-Vorrat", via: "werke_paused" },
  versand: { label: "Versand", via: "send_paused" },
  nachfass: { label: "Nachfassmails", via: "followup_enabled" },
  antworten: { label: "Antwort-Assistent", via: "werke_paused", note: "Abmeldungen per Antwort werden trotzdem immer gesperrt – pausiert werden nur automatische Antworten." },
  kundenlieferung: { label: "Kundenlieferung", via: "werke_paused" },
  tagescheck: { label: "Tagescheck", via: "werke_paused" },
  /** Master-Pipeline füllt Speicher + eigene Agenten (agenten-werk.yml, docs/BAUKASTEN-MASTER.md) */
  agenten: { label: "Agenten-Werk", via: "werke_paused" },
  /** Prüf-Agenten ohne Tokens: Leads und Käufer rollierend nachprüfen (scripts/dauerpruefung.py, 04.10.2026) */
  dauerpruefung: { label: "Dauerprüfung", via: "werke_paused" },
  /** 4 dauerhafte Prüfer der lieferbaren Leads (scripts/pruefer.py, pruefer-werk.yml, Inhaber 05.10.2026) */
  "pruefer-werk": { label: "Prüfer-Werk", via: "werke_paused" },
  /** Register + Firmenwebsite gegenprüfen (scripts/kontaktwerk.py, kontakt-werk.yml, Inhaber 05.10.2026) */
  "kontakt-werk": { label: "Kontakt-Werk", via: "werke_paused" },
} as const;
export type WerkKey = keyof typeof WERK_SWITCHES;

/** Ist das Werk an? (true = läuft nach Plan) und seit wann pausiert. */
export function werkOn(s: OwnerSettings, key: WerkKey): { on: boolean; since: string | null } {
  if (key === "versand") return { on: !s.send_paused, since: null };
  if (key === "nachfass") return { on: s.followup_enabled !== false, since: null };
  const since = (s.werke_paused ?? {})[key] ?? null;
  return { on: !since, since };
}

/** Neuer Wert von werke_paused nach dem Umschalten (nur bekannte Werke). */
export function toggleWerkPaused(cur: Record<string, string>, key: string, nowIso: string): Record<string, string> {
  if (!(key in WERK_SWITCHES) || WERK_SWITCHES[key as WerkKey].via !== "werke_paused") throw new InputError("unbekanntes Werk");
  const next = { ...(cur ?? {}) };
  if (next[key]) delete next[key];
  else next[key] = nowIso;
  return next;
}

export function merge(rows: { key: string; value: unknown }[]): OwnerSettings {
  const out: any = { ...DEFAULTS };
  for (const r of rows) if (r.key in DEFAULTS && r.value !== null && r.value !== undefined) out[r.key] = r.value;
  return out as OwnerSettings;
}

export class InputError extends Error {}

function int(raw: unknown, lo: number, hi: number, what: string): number {
  const s = String(raw ?? "").trim();
  if (!/^\d{1,5}$/.test(s)) throw new InputError(`${what}: ganze Zahl ${lo}–${hi}`);
  const n = Number(s);
  if (n < lo || n > hi) throw new InputError(`${what}: ${lo}–${hi}`);
  return n;
}

/** Mails pro Tag je Land: 0 … countries.yaml daily_limit (mehr greift nie). Leeres Feld = Standard (Limit aus yaml). */
export function validateCountryLimits(input: Record<string, unknown>, yaml: Record<string, { allowed: boolean; daily_limit: number }>, countries: string[]) {
  const out: Record<string, number> = {};
  for (const c of countries) {
    const raw = String(input[c] ?? "").trim();
    if (raw === "") continue;
    const rule = yaml[c];
    if (!rule?.allowed) throw new InputError(`${c}: kein Mail-Land`);
    out[c] = int(raw, 0, rule.daily_limit, `${c} Mails/Tag`);
  }
  return out;
}

/** Proben-Soll je Seite (Schlüssel „S2/US“): 0–100. Leeres Feld = Standard aus config/proben.yaml. */
export function validateSampleTargets(input: Record<string, unknown>, keys: string[]) {
  const out: Record<string, number> = {};
  for (const k of keys) {
    const raw = String(input[k] ?? "").trim();
    if (raw === "") continue;
    out[k] = int(raw, 0, MAX_SAMPLE_TARGET, `${k} Soll`);
  }
  return out;
}

/** Monatsgrenze der Claude-API (Euro): 0–500, höchstens zwei Nachkommastellen (0 = Sofort-Antworten aus). */
export const LLM_BUDGET_RANGE = [0, 500] as const;
export function validateLlmBudget(raw: unknown): number {
  const s = String(raw ?? "").trim().replace(",", ".");
  if (!/^\d{1,3}(\.\d{1,2})?$/.test(s)) throw new InputError(`API-Grenze: Zahl ${LLM_BUDGET_RANGE[0]}–${LLM_BUDGET_RANGE[1]} €`);
  const n = Number(s);
  if (n < LLM_BUDGET_RANGE[0] || n > LLM_BUDGET_RANGE[1]) throw new InputError(`API-Grenze: ${LLM_BUDGET_RANGE[0]}–${LLM_BUDGET_RANGE[1]} €`);
  return n;
}

export const validateMaxAge = (raw: unknown) => int(raw, MAX_AGE_RANGE[0], MAX_AGE_RANGE[1], "Verfall (h)");
export const validateFollowupDays = (raw: unknown) => int(raw, FOLLOWUP_DAYS_RANGE[0], FOLLOWUP_DAYS_RANGE[1], "Tage bis Nachfass");

/** Land in einer An/Aus-Liste umschalten – nur bekannte Länder (Abschalten ist immer erlaubt, Freischalten nie). */
export function toggleIn(list: string[], country: string, allowed: string[]): string[] {
  if (!allowed.includes(country)) throw new InputError("unbekanntes Land");
  return list.includes(country) ? list.filter((c) => c !== country) : [...list, country].sort();
}

/** Wirksames Tageslimit je Land (wie country_limit in Python). */
export function effectiveLimit(yamlLimit: number, s: OwnerSettings, country: string): number {
  if (s.send_countries_off.includes(country)) return 0;
  const v = s.send_country_limits[country];
  return v === undefined ? yamlLimit : Math.max(0, Math.min(v, yamlLimit));
}

export type Lane = { id: string; werk: "lead-werk" | "kunden-werk" | "pruefer-werk" | "kontakt-werk"; label: string; short: string; segment: string; country: string; default: number; max: number; workers?: number; what: string; args?: string };
export type LaneRegistry = { total_slots: number; reserve: number; lanes: Lane[] };

/** Wirksame Plätze je Linie (wie scripts/werk_plan.py counts): Einstellung, sonst Standard; ungültig -> Standard. */
export function slotCounts(reg: LaneRegistry, plan: Record<string, number> | null | undefined): Record<string, number> {
  const def = Object.fromEntries(reg.lanes.map((l) => [l.id, l.default]));
  if (!plan || !Object.keys(plan).length) return def;
  const out: Record<string, number> = { ...def };
  for (const l of reg.lanes) {
    const v = plan[l.id];
    if (v === undefined || v === null) continue;
    if (!Number.isInteger(Number(v))) return def;
    out[l.id] = Math.max(0, Math.min(Number(v), l.max));
  }
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  return sum > reg.total_slots - reg.reserve ? def : out;
}

/** Belegungsplan aus dem Formular: je Linie 0 … max, Summe höchstens total_slots - reserve. */
export function validateSlotPlan(input: Record<string, unknown>, reg: LaneRegistry): Record<string, number> {
  const out: Record<string, number> = {};
  for (const l of reg.lanes) {
    const raw = String(input[l.id] ?? "").trim();
    out[l.id] = raw === "" ? l.default : int(raw, 0, l.max, l.label);
  }
  const cap = reg.total_slots - reg.reserve;
  const sum = Object.values(out).reduce((a, b) => a + b, 0);
  if (sum > cap) throw new InputError(`zusammen ${sum} Plätze – höchstens ${cap} (${reg.reserve} bleiben frei für Versand, Tagescheck, Wachhund)`);
  return out;
}

export const PACKAGES = { starter: { label: "Starter", price: 129, perWeek: 15 }, pro: { label: "Pro", price: 249, perWeek: 40 } } as const;
export type PackageKey = keyof typeof PACKAGES;

/** Neuer Kunde aus dem Formular: Firma, geschäftliche E-Mail, Land (eines der Dashboard-Länder), Paket. */
export function validateCustomer(f: { company?: unknown; email?: unknown; country?: unknown; pkg?: unknown }, countries: string[]) {
  const company = String(f.company ?? "").trim();
  const email = String(f.email ?? "").trim().toLowerCase();
  const country = String(f.country ?? "").trim().toUpperCase();
  const pkg = String(f.pkg ?? "") as PackageKey;
  if (company.length < 2 || company.length > 200) throw new InputError("Firma fehlt");
  if (!/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(email) || email.length > 200) throw new InputError("E-Mail ungültig");
  if (!countries.includes(country)) throw new InputError("Land ungültig");
  if (!(pkg in PACKAGES)) throw new InputError("Paket ungültig");
  const currency = country === "US" ? "usd" : country === "UK" ? "gbp" : "eur";
  return { company, email, country, pkg, currency, amount_cents: PACKAGES[pkg].price * 100 };
}

export const REPLY_KINDS = { reply_positive: "positiv", reply_negative: "negativ", reply: "Frage" } as const;
export function validateReplyKind(raw: unknown): keyof typeof REPLY_KINDS {
  const k = String(raw ?? "");
  if (!(k in REPLY_KINDS)) throw new InputError("Art der Antwort ungültig");
  return k as keyof typeof REPLY_KINDS;
}

export function validateNote(raw: unknown): string {
  const s = String(raw ?? "").trim();
  if (!s || s.length > 2000) throw new InputError("Notiz: 1–2000 Zeichen");
  return s;
}

export const WORKFLOWS = {
  "lead-werk": { file: "lead-werk.yml", label: "Lead-Werk", inputs: {} as Record<string, string> },
  "kunden-werk": { file: "kunden-werk.yml", label: "Kunden-Werk", inputs: {} as Record<string, string> },
  "proben-vorrat": { file: "proben-vorrat.yml", label: "Proben-Vorrat", inputs: { befehl: "run", probelauf: "false" } as Record<string, string> },
  versand: { file: "send.yml", label: "Versand", inputs: { probelauf: "false" } as Record<string, string> },
} as const;
export type WorkflowKey = keyof typeof WORKFLOWS;

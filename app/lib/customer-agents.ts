/**
 * Kunden-Agenten (Inhaber 04.10.2026, docs/KUNDEN-AGENTEN.md): persönlicher Ansprechpartner ab Paket Pro.
 * Reine Funktionen (ohne Datenbank, ohne React): wer bekommt einen Agenten, Identität (deterministisch, gleich wie
 * scripts/customer_agents.py bei gleicher Eingabe; einzige Persona-Quelle app/lib/personas.json – gemeinsame Fälle in tests/fixtures/persona_cases.json),
 * Kurzlabels und Stichworte fürs Dashboard. Ehrlich: jeder Agent ist als KI erkennbar (signature), nie Preise/Garantien.
 */
import { PER_WEEK } from "./custom-price.ts";

export type Lang = "en" | "fr";
export type Gender = "f" | "m";
export type PersonaData = Record<Lang, {
  first_names: { name: string; g: Gender }[]; last_names: string[];
  role: Record<Gender, string>; signature: Record<Gender, string>; bios: string[]; tone: string;
  /** KI-Hinweis der Begrüßung (Backend), {owner} = Vorname des Inhabers. */
  ai_note: Record<Gender, string>;
}>;
/** customer_agents.persona (jsonb). gender nur für Rolle/Signatur in Französisch. */
export type Persona = { first_name: string; last_name: string; role: string; lang: Lang; bio: string; tone: string; gender?: Gender };
export type AgentStatus = "onboarding" | "aktiv" | "pausiert";
/** customer_agents.paused_by: „inhaber“ (Dashboard, nur der Inhaber setzt fort) oder „abo“ (Kündigung/Downgrade; ensure setzt fort). */
export type PausedBy = "inhaber" | "abo";
/** agent_tasks.agent für alle Kunden-Aufträge (wie TASK_AGENT in scripts/customer_agents.py); A1–A8 bleiben dem Inhaber. */
export const KUNDE_TASK_AGENT = 9;

/** Agent ab Paket Pro: „pro“ immer, „custom“ ab so vielen Leads/Woche wie Pro (50). Starter und Unbekanntes nicht. */
export function agentEligible(pkg: unknown, weekly?: unknown): boolean {
  if (pkg === "pro") return true;
  if (pkg !== "custom") return false;
  const w = Number(weekly);
  return Number.isFinite(w) && w >= PER_WEEK.pro;
}

/** Sprache des Kunden: Frankreich Französisch, sonst Englisch (CLAUDE.md §7). */
export function langFor(country: unknown): Lang {
  return String(country ?? "").trim().toUpperCase() === "FR" ? "fr" : "en";
}

/** FNV-1a 32 Bit über die UTF-8-Bytes (Python: gleiche Rechnung in customer_agents.py). */
export function fnv1a32(s: string): number {
  let h = 0x811c9dc5;
  for (const b of new TextEncoder().encode(s)) {
    h ^= b;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

const norm = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");

/**
 * Identität aus festen Namenslisten: Startpunkt aus dem Seed (subscriptions.id), dann der erste noch nicht vergebene
 * Name (je Kunde ein anderer Name, solange möglich). Gleiche Eingabe → gleiche Persona, in App und Python.
 */
export function pickPersona(data: PersonaData, lang: Lang, seed: string, used: Iterable<string> = []): Persona {
  const P = data[lang];
  const V = P.first_names.length;
  const N = V * P.last_names.length;
  const h = fnv1a32(String(seed).trim().toLowerCase());
  const taken = new Set([...used].map(norm));
  const at = (i: number) => ({ f: P.first_names[i % V], l: P.last_names[Math.floor(i / V)] });
  let pick = at(h % N);
  for (let k = 0; k < N; k++) {
    const c = at((h + k) % N);
    if (!taken.has(norm(`${c.f.name} ${c.l}`))) { pick = c; break; }
  }
  return {
    first_name: pick.f.name, last_name: pick.l, role: P.role[pick.f.g], lang,
    bio: P.bios[(h >>> 8) % P.bios.length], tone: P.tone, gender: pick.f.g,
  };
}

export const fullName = (p: Partial<Persona> | null | undefined) => [p?.first_name, p?.last_name].filter(Boolean).join(" ").trim();

/** Signatur, immer mit KI-Hinweis (EU-KI-Verordnung Art. 50): „Emma Carter · AI account manager at NextGen Profit“. */
export function signature(data: PersonaData, p: Persona): string {
  const P = data[p.lang] ?? data.en;
  return `${fullName(p)} · ${P.signature[p.gender ?? "f"]}`;
}

/** Initialen für den Avatar („EC“). */
export function initials(p: Partial<Persona> | null | undefined): string {
  const i = [p?.first_name, p?.last_name].map((x) => String(x ?? "").trim()[0] ?? "").join("").toUpperCase();
  return i || "KA";
}

/** Farbton (0–359) des Avatars aus dem Namen – fest je Agent. */
export const avatarHue = (p: Partial<Persona> | null | undefined) => fnv1a32(fullName(p) || "?") % 360;

export const STATUS_LABEL: Record<AgentStatus, string> = { onboarding: "lernt kennen", aktiv: "aktiv", pausiert: "pausiert" };
export const statusLabel = (s: unknown) => STATUS_LABEL[s as AgentStatus] ?? String(s ?? "–");

/** Rolle auf Deutsch fürs Dashboard (die Persona selbst spricht die Sprache des Kunden). */
export const roleDe = (p: Partial<Persona> | null | undefined) => (p?.gender === "m" ? "KI-Ansprechpartner" : "KI-Ansprechpartnerin");

/** Ziele/Zielgruppe in Stichworten aus customer_agents.profile (Texte oder Listen), höchstens n, je 32 Zeichen. */
export function goalChips(profile: unknown, n = 5): string[] {
  if (!profile || typeof profile !== "object") return [];
  const pr = profile as Record<string, unknown>;
  const out: string[] = [];
  for (const k of ["ziele", "zielgruppe", "leistungen", "signale", "regionen"]) {
    const v = pr[k];
    const parts = Array.isArray(v) ? v : typeof v === "string" ? v.split(/[,;\n]+/) : v && typeof v === "object" ? Object.values(v) : [];
    for (const x of parts) {
      const t = String(x ?? "").trim().replace(/\s+/g, " ");
      if (!t || out.some((o) => o.toLowerCase() === t.toLowerCase())) continue;
      out.push(t.length > 32 ? `${t.slice(0, 31)}…` : t);
      if (out.length >= n) return out;
    }
  }
  return out;
}

/** Kennzahlen des Kunden aus customer_agents.kpis (Qualität und Umsatz des Kunden). Fehlt etwas: 0. */
export function kpiOf(kpis: unknown): { rueckmeldungen: number; gute_leads: number; abschluesse: number } {
  const k = (kpis && typeof kpis === "object" ? kpis : {}) as Record<string, unknown>;
  const n = (...keys: string[]) => {
    for (const key of keys) {
      const v = Number(k[key]);
      if (Number.isFinite(v) && v >= 0) return Math.round(v);
    }
    return 0;
  };
  return { rueckmeldungen: n("rueckmeldungen", "feedback"), gute_leads: n("gute_leads", "good_leads"), abschluesse: n("abschluesse", "deals") };
}

/** Status beim Fortsetzen: „aktiv“, sobald der Agent den Kunden kennt (Profil oder Kontakt), sonst wieder „onboarding“. */
export function resumeStatus(a: { profile?: unknown; last_contact_at?: string | null }): AgentStatus {
  return goalChips(a.profile, 1).length > 0 || !!a.last_contact_at ? "aktiv" : "onboarding";
}

/** Hinweis des Inhabers an einen Agenten: 3–800 Zeichen, Leerraum zusammengefasst. null = ungültig. */
export function cleanNote(raw: unknown): string | null {
  const t = String(raw ?? "").trim().replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n");
  return t.length >= 3 && t.length <= 800 ? t : null;
}

/**
 * Auftragstext für agent_tasks (kind „kunde“, höchstens 1000 Zeichen): „Kunden-Agent <uuid> · <Name> (<Firma>) · …“, Agent-ID
 * vorne, damit Routine und Dashboard ihn finden – gleiches Format wie task_brief in scripts/customer_agents.py.
 */
export function noteBrief(agentId: string, name: string, company: string, note: string): string {
  const head = `Kunden-Agent ${agentId} · ${name || "?"} (${company || "?"}) · Hinweis vom Inhaber: `;
  return (head + note.replace(/\s+/g, " ")).slice(0, 1000);
}

/** Kurzlabel für den JARVIS-Link: „Kunden-Agenten (3)“, ohne Zahl wenn unbekannt. */
export const jarvisLabel = (n: number | null) => (n == null ? "Kunden-Agenten" : `Kunden-Agenten (${n})`);

/** Zeile auf der Tarifseite bei Pro und individuell ab 50/Woche (docs/KUNDEN-AGENTEN.md „Tarifseite“). Inhaber 04.10.2026:
 *  „individueller ansprechpartner, nichts mit ai oder ki“ – neutral benannt; die KI-Kennzeichnung steht in jeder Mail des
 *  Ansprechpartners (Signatur, erste Mail), wo das Gespräch stattfindet (EU-KI-Verordnung Art. 50). */
export const PLAN_AGENT_LINE: Record<"en" | "fr" | "de", { title: string; text: string }> = {
  en: { title: "Personal account manager", text: "learns your goals and picks the right leads to increase your revenue" },
  fr: { title: "Interlocuteur dédié", text: "apprend vos objectifs et choisit les bonnes pistes pour augmenter votre chiffre d'affaires" },
  de: { title: "Persönlicher Ansprechpartner", text: "lernt Ihre Ziele und wählt die passenden Leads, um Ihren Umsatz zu steigern" },
};
export const planAgentLine = (lang: unknown) => PLAN_AGENT_LINE[lang === "fr" || lang === "de" ? lang : "en"];

/**
 * Absatz in der Willkommensmail: Ansprechpartner stellt gleich 4 kurze Fragen; ehrlich als KI erkennbar. Sprache = Sprache
 * der Mail (Stripe-Locale), nicht die der Persona – sonst stünde ein französischer Absatz in einer englischen Mail. Fehlende
 * Felder einer Persona aus der Datenbank führen nie zu „undefined“ im Text.
 */
export function welcomeAgentLine(p: Persona, lang: Lang = p.lang === "fr" ? "fr" : "en"): string {
  const name = fullName(p) || (lang === "fr" ? "Votre interlocuteur" : "Your account manager");
  const first = String(p.first_name ?? "").trim() || name;
  if (lang === "fr") {
    const role = p.lang === "fr" && p.role ? p.role : p.gender === "m" ? "Votre interlocuteur" : "Votre interlocutrice";
    return `${role}, ${name} (IA), vous écrit très bientôt avec 4 questions courtes sur vos objectifs et vos clients idéaux. Il s'agit d'une intelligence artificielle ; notre équipe lit chaque échange.`;
  }
  return `Your account manager, ${name} (AI assistant), will email you shortly with 4 quick questions about your goals and ideal clients. ${first} is an AI assistant and our team reads every message.`;
}

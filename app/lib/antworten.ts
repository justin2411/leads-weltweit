/**
 * Antworten-Cockpit (Nachtschicht 03./04.10.2026): reine Hilfsfunktionen ohne Next/Supabase, damit sie testbar sind.
 * Daten: signalwerk.inbound_replies (scripts/responder.py schreibt je menschlicher Antwort eine Zeile).
 * Reihenfolge: offene zuerst, dann nach Absicht (Kaufinteresse > Frage > Unklar > Probe > Rest), dann wartet am
 * längsten zuerst. Antworten des Inhabers werden vor dem Versand geprüft (lintAnswer): keine Preise, keine Währungen,
 * keine Garantien – wie die Regeln für automatische Antworten.
 */
import type { IconName } from "../app/icons";

export const STATUSES = ["offen", "spaeter", "erledigt"] as const;
export type ReplyStatus = (typeof STATUSES)[number];
export const STATUS_LABEL: Record<ReplyStatus, string> = { offen: "Offen", spaeter: "Später", erledigt: "Erledigt" };

export function isStatus(x: unknown): x is ReplyStatus {
  return typeof x === "string" && (STATUSES as readonly string[]).includes(x);
}

export type Tone = "gold" | "blue" | "amber" | "green" | "grey";
export type IntentMeta = { label: string; rank: number; icon: IconName; tone: Tone; urgent: boolean };

/** Absichten aus responder.classify (CLASSIFY_SCHEMA); Unbekanntes zählt als „Unklar“. */
export const INTENTS: Record<string, IntentMeta> = {
  buy: { label: "Kaufinteresse", rank: 0, icon: "stern", tone: "gold", urgent: true },
  question: { label: "Frage", rank: 1, icon: "frage", tone: "blue", urgent: true },
  other: { label: "Unklar", rank: 2, icon: "achtung", tone: "amber", urgent: false },
  sample: { label: "Probe", rank: 3, icon: "proben", tone: "green", urgent: false },
  not_interested: { label: "Kein Interesse", rank: 4, icon: "fehler-kreis", tone: "grey", urgent: false },
  unsubscribe: { label: "Abmeldung", rank: 5, icon: "abmeldung", tone: "grey", urgent: false },
  out_of_office: { label: "Abwesend", rank: 6, icon: "uhr", tone: "grey", urgent: false },
};

export function intentMeta(intent: string | null | undefined): IntentMeta {
  return INTENTS[String(intent ?? "")] ?? INTENTS.other;
}

/** Ab so vielen Minuten Wartezeit wird eine Kaufinteresse-/Frage-Antwort rot. */
export const ALERT_MIN = 15;

export type ReplyRow = {
  id: string;
  received_at: string | null;
  processed_at: string | null;
  status: string;
  intent: string | null;
};

/** Eingang der Antwort: Date-Kopfzeile, sonst Zeitpunkt der Verarbeitung. */
export function arrivedAt(r: Pick<ReplyRow, "received_at" | "processed_at">): string | null {
  const ok = (s: string | null) => !!s && !Number.isNaN(Date.parse(s));
  // Date-Kopfzeilen in der Zukunft (falsche Uhr beim Absender) zählen nicht
  if (ok(r.received_at) && (!ok(r.processed_at) || Date.parse(r.received_at!) <= Date.parse(r.processed_at!) + 5 * 60_000)) return r.received_at;
  return ok(r.processed_at) ? r.processed_at : null;
}

export function ageMinutes(r: Pick<ReplyRow, "received_at" | "processed_at">, now: Date): number | null {
  const t = arrivedAt(r);
  if (!t) return null;
  return Math.max(0, Math.floor((now.getTime() - Date.parse(t)) / 60_000));
}

/** „jetzt“, „12 min“, „3 h“, „2 T“ (kurz; „vor“ setzt die Oberfläche davor). */
export function ageLabel(min: number | null): string {
  if (min == null) return "–";
  if (min < 1) return "jetzt";
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / 1440)} T`;
}

/** Rot: Kaufinteresse oder Frage wartet offen länger als ALERT_MIN Minuten. */
export function isOverdue(r: ReplyRow, now: Date, limit = ALERT_MIN): boolean {
  if (r.status !== "offen" || !intentMeta(r.intent).urgent) return false;
  const m = ageMinutes(r, now);
  return m != null && m > limit;
}

/** Offen > Später > Erledigt; offen/später: wichtigste Absicht, dann wartet am längsten; erledigt: neueste zuerst. */
export function sortReplies<T extends ReplyRow>(rows: T[]): T[] {
  const st = (s: string) => { const i = (STATUSES as readonly string[]).indexOf(s); return i < 0 ? 9 : i; };
  const t = (r: T) => { const a = arrivedAt(r); return a ? Date.parse(a) : 0; };
  return [...rows].sort((a, b) => {
    if (st(a.status) !== st(b.status)) return st(a.status) - st(b.status);
    if (a.status === "erledigt") return t(b) - t(a);
    const ia = intentMeta(a.intent).rank, ib = intentMeta(b.intent).rank;
    if (ia !== ib) return ia - ib;
    return t(a) - t(b);
  });
}

export function countByStatus(rows: { status: string }[]): Record<ReplyStatus, number> {
  const out: Record<ReplyStatus, number> = { offen: 0, spaeter: 0, erledigt: 0 };
  for (const r of rows) if (isStatus(r.status)) out[r.status] += 1;
  return out;
}

// ------------------------------------------------------------------------------------------- Antwort des Inhabers
export const ANSWER_MAX = 5000;

/** Zahl (Ziffern) direkt vor einer Zeitangabe für Abo-Preise: „129 per month“, „249/mo“, „129 pro Monat“, „par mois“. */
const PERIOD = String.raw`(\/\s*(mo|mon|month|mth|yr|year|mois|an|monat|jahr)\b|(per|a|an|each|every|pro|par|im|je|al)\s+(month|year|monat|jahr|mois|an|année|annee|mes)\b|monthly|yearly|annually|mensuel|monatlich|jährlich)`;

const BANNED: [RegExp, string][] = [
  [/\p{Sc}/u, "Währungszeichen"], // alle Währungszeichen ($ € £ ¥ ¢ ₹ ₩ ₽ ฿ … inkl. U+20A0–20CF)
  [/\d[\d.,\s]*\s?(eur|euros?|usd|dollars?|bucks|gbp|pounds?|quid|chf|sek|nok|dkk|cad|aud|inr|cents?)\b/i, "Betrag"],
  [/\b(eur|usd|gbp|chf|sek|nok|dkk|cad|aud|inr)\s?\d/i, "Betrag"],
  [new RegExp(String.raw`\d[\d.,]*\s*` + PERIOD, "iu"), "Betrag pro Zeitraum"],
  [/preis/i, "„Preis“"],
  [/\bpric(e|es|ed|ing|ey)\b/i, "„price“"],
  [/\bprix\b/i, "„prix“"],
  [/\btarif/i, "„Tarif“"],
  [/guarant/i, "„guarantee“"],
  [/garanti/i, "„Garantie“"],
];

/** Wörter, die auch mit Leerzeichen, Punkten oder Bindestrichen zwischen den Buchstaben gefunden werden („p r i c e“). */
const BANNED_COMPACT: [RegExp, string][] = [
  [/preis/, "„Preis“"],
  [/price|pricing/, "„price“"],
  [/prix/, "„prix“"],
  [/guarant/, "„guarantee“"],
  [/garanti/, "„Garantie“"],
];

/** Häufige Doppelgänger-Buchstaben (kyrillisch/griechisch) für die Prüfung auf lateinische Buchstaben abbilden. */
const LOOKALIKE: Record<string, string> = {
  "а": "a", "в": "b", "е": "e", "ё": "e", "к": "k", "м": "m", "н": "h", "о": "o", "р": "p", "с": "c", "т": "t", "у": "y",
  "х": "x", "і": "i", "ї": "i", "ј": "j", "ѕ": "s", "ԁ": "d", "ɡ": "g", "А": "A", "В": "B", "Е": "E", "К": "K", "М": "M",
  "Н": "H", "О": "O", "Р": "P", "С": "C", "Т": "T", "Х": "X", "І": "I", "Ј": "J", "Ѕ": "S", "α": "a", "ε": "e", "ι": "i",
  "κ": "k", "ν": "v", "ο": "o", "ρ": "p", "τ": "t", "υ": "u", "χ": "x", "Α": "A", "Β": "B", "Ε": "E", "Ι": "I", "Κ": "K",
  "Μ": "M", "Ν": "N", "Ο": "O", "Ρ": "P", "Τ": "T", "Χ": "X", "Υ": "Y",
};

/** Unsichtbare Formatzeichen (Zero-Width, weiches Trennzeichen, BOM, Richtungsmarken; Unicode-Kategorie Cf). */
const FORMAT_CHARS = /\p{Cf}/gu;

/** Prüf-Kopie: NFKC (Vollbreite → normal), Formatzeichen weg, Akzente weg, Doppelgänger → lateinisch. */
function lintCopy(text: string): string {
  return text.normalize("NFKD").replace(/\p{M}/gu, "").normalize("NFKC").replace(FORMAT_CHARS, "")
    .replace(/[\u0370-\u03ff\u0400-\u04ff\u0500-\u052f\u0261]/g, (c) => LOOKALIKE[c] ?? c);
}

/**
 * Prüft die Antwort des Inhabers vor dem Versand. Rückgabe: Fehler (leer = in Ordnung). Preise, Beträge und Garantien
 * gehören nicht in eine schnelle Antwort (Regel wie bei den automatischen Antworten); dafür telefonieren oder die
 * Buchungsseite nennen. Geprüft wird eine normalisierte Kopie (Tarnung mit Unicode-Zeichen fällt auf) und zusätzlich
 * eine Kopie ohne Leer- und Satzzeichen (auseinandergezogene Wörter).
 */
export function lintAnswer(text: string): string[] {
  const raw = String(text ?? "");
  const t = lintCopy(raw);
  const compact = t.toLowerCase().replace(/[\s\p{P}\p{Z}_]+/gu, "");
  const errs: string[] = [];
  const add = (what: string) => { if (!errs.includes(`kein ${what}`)) errs.push(`kein ${what}`); };
  if (!t.trim()) errs.push("Text fehlt");
  if (raw.length > ANSWER_MAX) errs.push(`höchstens ${ANSWER_MAX} Zeichen`);
  for (const [re, what] of BANNED) if (re.test(t) || re.test(raw)) add(what);
  for (const [re, what] of BANNED_COMPACT) if (re.test(compact)) add(what);
  return errs;
}

/**
 * Zeilenenden vereinheitlichen, Unicode normalisieren (NFKC: Vollbreite-Zeichen → normale), unsichtbare Formatzeichen
 * (Zero-Width, weiches Trennzeichen, BOM, Richtungsmarken), Steuerzeichen und überlange Leerzeilen entfernen.
 * Gesendet wird genau dieser gesäuberte Text.
 */
export function cleanAnswer(text: unknown): string {
  return String(text ?? "")
    .normalize("NFKC")
    .replace(/\r\n?/g, "\n")
    .replace(FORMAT_CHARS, "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/g, "")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

/** Betreff der Antwort: „Re: …“ (nie doppelt). Ohne Betreff der Antwort: unser Betreff. */
export function replySubject(theirs: string | null | undefined, ours: string | null | undefined): string {
  const s = String(theirs ?? "").replace(/[\r\n]+/g, " ").trim() || String(ours ?? "").replace(/[\r\n]+/g, " ").trim();
  if (!s) return "Re: your message";
  return /^(re|aw|sv|réf|ref)\s*:/i.test(s) ? s.slice(0, 200) : `Re: ${s}`.slice(0, 200);
}

/** Gültige Message-ID „<…@…>“ ohne Zeilenumbrüche (Schutz vor Header-Injection), sonst null. */
export function messageId(raw: string | null | undefined): string | null {
  const s = String(raw ?? "").trim();
  if (!s || /[\r\n\s]/.test(s) || s.length > 400) return null;
  const v = s.startsWith("<") ? s : `<${s}>`;
  return /^<[^<>@]+@[^<>@]+>$/.test(v) ? v : null;
}

/** In-Reply-To = Message-ID der Antwort; References = unsere Mail, dann ihre (bleibt im selben Gesprächsverlauf). */
export function threadHeaders(theirId: string | null | undefined, ourId: string | null | undefined): { inReplyTo?: string; references?: string[] } {
  const their = messageId(theirId);
  const ours = messageId(ourId);
  const refs = [ours, their].filter((x, i, a): x is string => !!x && a.indexOf(x) === i);
  return { ...(their ? { inReplyTo: their } : {}), ...(refs.length ? { references: refs } : {}) };
}

export function answerLang(country: string | null | undefined, msgLanguage: string | null | undefined): "en" | "fr" {
  return msgLanguage === "fr" || (!msgLanguage && String(country ?? "").toUpperCase() === "FR") ? "fr" : "en";
}

/** Domain einer Adresse (klein, ohne www). */
export function domainOf(email: string | null | undefined): string {
  const d = String(email ?? "").split("@").pop()?.trim().toLowerCase() ?? "";
  return d.startsWith("www.") ? d.slice(4) : d;
}

/**
 * Adressen für „Sperren“ im Cockpit: Absender und die Adresse, die wir angeschrieben haben (beide klein, gültig, ohne
 * Doppelte) – wie inbox.py bei einer Abmeldung per Antwort.
 */
export function suppressTargets(sender: string, ours: string | null | undefined): string[] {
  const ok = (e: string) => /^[^\s@<>"]+@[^\s@<>"]+\.[a-z]{2,}$/i.test(e);
  return [sender, ours ?? ""].map((e) => String(e).trim().toLowerCase()).filter((e, i, a) => ok(e) && a.indexOf(e) === i);
}

/** Pflichtfußzeile für Antworten an Leute, die uns geschrieben haben (wie rules.render_footer, Abmeldung per Antwort). */
export function replyFooter(lang: "en" | "fr", legalName: string, address: string, domain: string): string {
  const who = domain || (lang === "fr" ? "votre adresse" : "your address");
  return lang === "fr"
    ? `—\n${legalName} · ${address}\nVous recevez ce message en réponse à votre e-mail. Pour ne plus recevoir de messages, répondez « désinscrire » et nous ne contacterons plus ${who}.`
    : `—\n${legalName} · ${address}\nYou are receiving this email in reply to your message. If you would rather not hear from us, reply "unsubscribe" and we will not contact ${who} again.`;
}

/** Erste Zeilen eines Textes (für „unsere Mail“): höchstens n Zeilen und max Zeichen. */
export function firstLines(text: string | null | undefined, n = 4, max = 320): string {
  const lines = String(text ?? "").replace(/\r\n?/g, "\n").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, n).join("\n");
  return lines.length > max ? `${lines.slice(0, max - 1).trimEnd()}…` : lines;
}

export function isUuid(x: unknown): x is string {
  return typeof x === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(x);
}

/** Kurzer, stabiler Hash (FNV-1a) – für Idempotency-Keys (derselbe Text an dieselbe Antwort geht nie doppelt raus). */
export function shortHash(s: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(36);
}

/**
 * A/B je Schritt (Inhaber 04.10.2026: „das gehirn soll jeden einzelnen unserer steps a/b splittesten können, damit es
 * mit den quoten immer genau schauen kann wo es KPIs weiter optimieren kann damit am ende mehr kunden bei rauskommen“).
 * Reine Funktionen ohne Next/Supabase/Node (testbar) – gleiche Regeln wie scripts/lib/ab.py, gemeinsame Fälle in
 * tests/fixtures/ab_cases.json. Schritte und Trichter: lib/ab-schritte.json (Aufrufer reichen sie als `reg` herein).
 *
 * Zuweisung fest je Einheit über einen Hash (lib/ab-assign.ts, sha256 wie Python) – nie Cookie oder Browser-Speicher.
 * Statistik: Beta(1+k, 1+n−k) je Variante, P(B > A) per Normal-Näherung; Gewinner erst bei ≥ 95 % und Mindestmenge.
 */
import { testAllowed, type TestScope } from "./test-scope.ts";

export type AbElement = { art: "text" | "zahl" | "wahl"; max?: number; min?: number; werte?: string[]; frage?: boolean };
export type AbStep = { key: string; station: string; titel: string; messung: string; min_n: number; elemente: Record<string, AbElement>;
  /** Grund, wenn der Schritt nicht getestet werden darf (z. B. Versandzeit seit Versand rund um die Uhr) */
  pausiert?: string };
export type AbStation = { key: string; titel: string; von: string; zu: string; richtwert: number };
export type AbRegistry = {
  sicherheit: number; max_tage: number; engpass_min_n: number; stationen: AbStation[]; schritte: AbStep[]; verboten: string[];
};
export type AbKey = "A" | "B";
export const AB_KEYS: AbKey[] = ["A", "B"];
export type AbStatus = "entwurf" | "laeuft" | "gewonnen" | "gestoppt";
export type AbVariant = { key: string; variant_id?: string } & Record<string, unknown>;
export type AbTest = {
  id: string; step: string; segment_id: string; country: string; element: string; hypothese: string; messung?: string;
  varianten: AbVariant[]; status: AbStatus; quelle?: string | null; salt?: string; min_n?: number;
  gestartet?: string | null; beendet?: string | null; gewinner?: AbKey | null; grund?: string | null; created_at?: string;
};
export type AbResult = { test_id: string; variant: string; n: number; k: number; k_positiv?: number };

/** Schritte (wie lib/ab-schritte.json, Gleichheit per Test) – für die Werkzeug-Prüfung ohne JSON-Import. */
export const AB_STEP_KEYS = ["mail_betreff", "mail_einstieg", "mail_zeit", "nachfass", "antwort", "landing", "probe_mail",
  "probe_nachfrage", "tarif", "checkout"] as const;
export const AB_COUNTRIES = ["US", "UK", "FR"] as const;
export const HYP_MAX = 160;
export const GRUND_MAX = 160;

// ------------------------------------------------------------------------------------------- Statistik
/** Standardnormalverteilung (Abramowitz/Stegun 7.1.26) – gleiche Formel wie scripts/lib/ab.py phi. */
export function phi(x: number): number {
  const s = x >= 0 ? 1 : -1;
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-z * z);
  return 0.5 * (1 + s * y);
}

/** P(Quote B > Quote A) mit Beta(1+k, 1+n−k) je Variante (Normal-Näherung). */
export function pBBetter(nA: number, kA: number, nB: number, kB: number): number {
  const mv = (n: number, k: number) => {
    const nn = Math.max(0, Math.trunc(n || 0)), kk = Math.max(0, Math.min(Math.trunc(k || 0), nn));
    const m = (kk + 1) / (nn + 2);
    return [m, (m * (1 - m)) / (nn + 3)] as const;
  };
  const [ma, va] = mv(nA, kA), [mb, vb] = mv(nB, kB);
  return phi((mb - ma) / Math.sqrt(va + vb));
}

export const rate = (n: number, k: number) => (n > 0 ? Math.min(k, n) / n : 0);
const round4 = (x: number) => Math.round(x * 10000) / 10000;
/** 0,123 → „12,3 %“ */
export const pct = (x: number, digits = 1) => `${(x * 100).toFixed(digits).replace(".", ",")} %`;

export type AbEval = { status: "laeuft" | "gewonnen" | "gestoppt"; gewinner: AbKey | null; leader: AbKey | null; sicherheit: number; pB: number; tage: number; grund: string };

/** Stand eines laufenden Tests (wie ab.py evaluate). rows = Ergebnis je Variante. */
export function evaluate(reg: AbRegistry, test: Pick<AbTest, "step" | "min_n" | "gestartet">, rows: { variant: string; n: number; k: number }[], now: Date): AbEval {
  const by = new Map(rows.map((r) => [r.variant, r]));
  const a = by.get("A") ?? { n: 0, k: 0 }, b = by.get("B") ?? { n: 0, k: 0 };
  const p = pBBetter(Number(a.n), Number(a.k), Number(b.n), Number(b.k));
  const leader: AbKey | null = p > 0.5 + 1e-6 ? "B" : p < 0.5 - 1e-6 ? "A" : null;
  const sure = Math.max(p, 1 - p);
  const minN = Number(test.min_n) || reg.schritte.find((s) => s.key === test.step)?.min_n || 100;
  const started = test.gestartet ? Date.parse(test.gestartet) : now.getTime();
  const days = (now.getTime() - started) / 86_400_000;
  const enough = Number(a.n) >= minN && Number(b.n) >= minN;
  const ra = rate(Number(a.n), Number(a.k)), rb = rate(Number(b.n), Number(b.k));
  const base = { sicherheit: round4(sure), pB: round4(p), leader, gewinner: null as AbKey | null, tage: Math.round(days * 10) / 10 };
  if (enough && leader && sure >= reg.sicherheit) {
    return { ...base, status: "gewonnen", gewinner: leader,
      grund: `${leader} gewinnt: ${pct(leader === "B" ? rb : ra)} gegen ${pct(leader === "B" ? ra : rb)}, Sicherheit ${pct(sure, 0)}` };
  }
  if (days >= reg.max_tage) return { ...base, status: "gestoppt", grund: `${reg.max_tage} Tage ohne klare Entscheidung – A bleibt` };
  if (!enough) return { ...base, status: "laeuft", grund: `zu wenig Daten (${Math.min(Number(a.n), Number(b.n))} von ${minN} je Variante)` };
  return { ...base, status: "laeuft", grund: `läuft, Sicherheit ${pct(sure, 0)}` };
}

// ------------------------------------------------------------------------------------------- Regeln
const EMOJI = /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{1F000}-\u{1F2FF}]/u;

/** Fehler eines Variantenwerts (leer = in Ordnung) – wie ab.py check_value. */
export function checkValue(reg: AbRegistry, step: string, element: string, value: unknown): string[] {
  const s = reg.schritte.find((x) => x.key === step);
  if (!s) return ["Schritt unbekannt"];
  const spec = s.elemente[element];
  if (!spec) return [`Element „${element}“ gibt es bei ${s.titel} nicht (erlaubt: ${Object.keys(s.elemente).join(", ")})`];
  if (spec.art === "zahl") {
    const raw = String(value ?? "").trim();
    if (!/^-?\d+$/.test(raw)) return ["ganze Zahl erwartet"];
    const v = Number(raw);
    return v >= (spec.min ?? 0) && v <= (spec.max ?? 0) ? [] : [`${spec.min}–${spec.max} erlaubt`];
  }
  if (spec.art === "wahl") return (spec.werte ?? []).includes(String(value)) ? [] : [`erlaubt: ${(spec.werte ?? []).join(", ")}`];
  const t = String(value ?? "").replace(/\s+/g, " ").trim();
  const errs: string[] = [];
  if (!t) errs.push("Text fehlt");
  if (t.length > (spec.max ?? 0)) errs.push(`höchstens ${spec.max} Zeichen (ist ${t.length})`);
  const low = t.toLowerCase();
  for (const w of reg.verboten) if (low.includes(w)) errs.push(`verboten: „${w.trim()}“`);
  if ((t.match(/\d+/g) ?? []).some((x) => x !== "10")) errs.push("keine Zahlen außer der 10 (keine erfundenen Zahlen)");
  if (/https?:\/\/|www\.|<\s*\/?[a-z]/.test(low)) errs.push("keine Links oder HTML");
  if (EMOJI.test(t)) errs.push("keine Emojis");
  if (element === "betreff" && /^\s*(re|fw|fwd|aw|wg|tr)\s*:/i.test(t)) errs.push("Betreff täuscht eine Antwort vor");
  if (spec.frage && !t.endsWith("?")) errs.push("muss eine Ja/Nein-Frage sein (endet mit ?)");
  return errs;
}

export type AbCreate = { step: string; segment: string; country: string; element: string; b: unknown; a?: unknown; hypothese: string };

/** Darf dieser Test angelegt werden? Freigabe-Liste (nur S2 US/UK/FR), ein Element, Werte, Hypothese. */
export function checkTest(reg: AbRegistry, scope: TestScope, x: AbCreate): string[] {
  const st = reg.schritte.find((s) => s.key === x.step);
  if (!st) return ["Schritt unbekannt"];
  if (st.pausiert) return [`Schritt pausiert: ${st.pausiert}`];  // Versandzeit: Versand läuft rund um die Uhr (04.10.2026)
  const errs: string[] = [];
  if (!testAllowed(scope, x.segment, x.country)) errs.push("Tests nur Webagenturen US/UK/FR (config/fokus.yaml tests)");
  errs.push(...checkValue(reg, x.step, x.element, x.b));
  if (x.a !== undefined && x.a !== null && x.a !== "") {
    errs.push(...checkValue(reg, x.step, x.element, x.a).map((e) => `A: ${e}`));
    if (String(x.a).trim() === String(x.b).trim()) errs.push("A und B sind gleich");
  }
  const h = String(x.hypothese ?? "").replace(/\s+/g, " ").trim();
  if (h.length < 5 || h.length > HYP_MAX) errs.push(`Hypothese: 5–${HYP_MAX} Zeichen`);
  return errs;
}

/** Wert des Elements in Variante key (undefined = Kontrolle unverändert). */
export function variantValue(t: Pick<AbTest, "varianten" | "element">, key: string): unknown {
  const v = (t.varianten ?? []).find((x) => x.key === key);
  const val = v?.[t.element];
  return val === null || val === "" ? undefined : val;
}

/** Übernommene Gewinner (gewonnen mit B): neuester je Element gilt für alle. */
export function overrides(tests: AbTest[], step: string, segment: string, country: string): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  tests.filter((t) => t.status === "gewonnen" && t.gewinner === "B" && t.step === step && t.segment_id === segment && t.country === country.toUpperCase())
    .sort((a, b) => String(a.beendet ?? "").localeCompare(String(b.beendet ?? "")))
    .forEach((t) => { const v = variantValue(t, "B"); if (v !== undefined) out[t.element] = v; });
  return out;
}

/** Parameter „<test-uuid>.<A|B>“ (Link aus der Probe-Mail, Formularfeld) → Teile; sonst null. */
export function parseAbParam(raw: unknown): { testId: string; variant: AbKey } | null {
  const m = /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([AB])$/i.exec(String(raw ?? "").trim());
  return m ? { testId: m[1].toLowerCase(), variant: m[2].toUpperCase() as AbKey } : null;
}

// ------------------------------------------------------------------------------------------- Zufall ohne Speicher
/** FNV-1a (32 Bit) → Zahl in [0, 1): feste „Zufallszahl“ je Schlüssel (Landingpage-Eimer, ?r=-Link). */
export function hashRand(key: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h / 0x100000000;
}

/** Kalendertag in deutscher Zeit (YYYY-MM-DD) – Teil des Besucher-Schlüssels (wechselt täglich, wie lib/visitor.ts). */
export function berlinDayKey(d: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Berlin", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
}

// ------------------------------------------------------------------------------------------- Trichter / Ansicht
export type FunnelRow = { station: string; n: number; k: number };
export type FunnelStation = AbStation & { n: number; k: number; rate: number; score: number | null; enough: boolean; engpass: boolean };

/** Stationen in Reihenfolge mit Quote; Engpass = größter Abfall gegenüber dem Richtwert (nur mit genug Daten). */
export function funnelView(reg: AbRegistry, rows: FunnelRow[]): FunnelStation[] {
  const list = reg.stationen.map((s) => {
    const r = rows.find((x) => x.station === s.key);
    const n = Number(r?.n) || 0, k = Number(r?.k) || 0;
    const enough = n >= reg.engpass_min_n;
    return { ...s, n, k, rate: rate(n, k), score: enough ? rate(n, k) / s.richtwert : null, enough, engpass: false };
  });
  const cands = list.filter((s) => s.score !== null).sort((a, b) => (a.score as number) - (b.score as number));
  if (cands.length) cands[0].engpass = true;
  return list;
}

export type TestView = {
  id: string; step: string; stepTitel: string; station: string; country: string; element: string; hypothese: string; status: AbStatus;
  variants: { key: string; n: number; k: number; rate: number; wert: string | null }[];
  eval: AbEval | null; gewinner: AbKey | null; grund: string | null; gestartet: string | null; beendet: string | null;
};

const short = (v: unknown) => (v === undefined || v === null ? null : String(v).slice(0, 160));

/** Tests für das Dashboard: Ergebnis je Variante (n, k, Quote) und für laufende die Auswertung. */
export function testsView(reg: AbRegistry, tests: AbTest[], results: AbResult[], now: Date): TestView[] {
  return tests.map((t) => {
    const s = reg.schritte.find((x) => x.key === t.step);
    const rows = AB_KEYS.map((key) => {
      const r = results.find((x) => x.test_id === t.id && x.variant === key);
      const n = Number(r?.n) || 0, k = Number(r?.k) || 0;
      return { key, n, k, rate: rate(n, k), wert: short(variantValue(t, key)) };
    });
    return {
      id: t.id, step: t.step, stepTitel: s?.titel ?? t.step, station: s?.station ?? "", country: t.country, element: t.element,
      hypothese: t.hypothese, status: t.status, variants: rows,
      eval: t.status === "laeuft" ? evaluate(reg, t, rows.map((r) => ({ variant: r.key, n: r.n, k: r.k })), now) : null,
      gewinner: t.gewinner ?? null, grund: t.grund ?? null, gestartet: t.gestartet ?? null, beendet: t.beendet ?? null,
    };
  });
}

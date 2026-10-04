/**
 * Umsatz-/Kundenprognose 30 Tage für Gehirn und JARVIS (Trichter-Hochrechnung je Land):
 *   Mails in 30 Tagen (Tempo der letzten 7 Tage, höchstens so viele freie Käufer) × Antwortquote × Proben je Antwort
 *   × Abschluss je Probe × Preis.
 * Ehrlich: Jede Quote kommt nur aus echten Zählungen. Gibt es auf einer Stufe noch keinen einzigen Treffer, wird ab
 * dort nicht hochgerechnet („noch keine Basis“) – keine Annahmen, keine Branchenwerte. Unsicherheit als Spanne
 * (Wilson-Intervall 80 %), bei kleinem n entsprechend breit. Reine Funktionen, keine Datenbank.
 */

export type PrognoseIn = {
  country: string;
  /** Erstmails gesendet seit Start (Trichter-Basis) */
  sent: number;
  /** echte Antworten (ohne Abwesenheit/Bounce) */
  replies: number;
  /** angeforderte Proben */
  samples: number;
  /** zahlende Kunden aus diesem Trichter */
  customers: number;
  /** gesendete Mails je Tag (Schnitt der letzten 7 vollen Tage) */
  perDay: number;
  /** mail-fähige Käufer ohne Mail – mehr kann der Versand in 30 Tagen nicht anschreiben; null = unbekannt */
  freeBuyers: number | null;
  /** Monatspreis je Kunde (Landeswährung), z. B. Starter 129 */
  price: number;
  currency: string;
};

export type Range = { lo: number; mid: number; hi: number };
export type Stage = { key: "antwort" | "probe" | "kunde"; k: number; n: number; rate: number | null; lo: number; hi: number };
export type Basis = "kein_versand" | "keine" | "duenn" | "ok";
export type Prognose = {
  country: string; currency: string; basis: Basis;
  mails30: number; stages: Stage[];
  antworten30: Range | null; proben30: Range | null; kunden30: Range | null; umsatz30: Range | null;
  /** kurzer Satz für Gehirn und Dashboard (≤ 160 Zeichen) */
  text: string;
};

const Z80 = 1.2816;
const DAYS = 30;
/** unter diesen Mengen ist die Prognose „dünn“ (Spanne breit, nur Richtung) */
export const MIN_SENT = 100, MIN_REPLIES = 5;

/** Wilson-Intervall (80 %) für k Treffer aus n; n = 0 → [0, 1]. */
export function wilson(k: number, n: number, z = Z80): { lo: number; hi: number } {
  if (n <= 0) return { lo: 0, hi: 1 };
  const p = Math.min(1, Math.max(0, k / n));
  const z2 = z * z, d = 1 + z2 / n;
  const c = (p + z2 / (2 * n)) / d;
  const h = (z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / d;
  return { lo: Math.max(0, c - h), hi: Math.min(1, c + h) };
}

const stage = (key: Stage["key"], k: number, n: number): Stage => {
  const kk = Math.max(0, Math.min(k, n)), w = wilson(kk, n);
  return { key, k: kk, n, rate: n > 0 ? kk / n : null, ...w };
};
const scale = (r: Range, s: Stage): Range => ({ lo: r.lo * s.lo, mid: r.mid * (s.rate ?? 0), hi: r.hi * s.hi });
const round = (r: Range, d = 0): Range => { const f = 10 ** d; return { lo: Math.floor(r.lo * f) / f, mid: Math.round(r.mid * f) / f, hi: Math.ceil(r.hi * f) / f }; };

/** Spanne kurz: „3“ oder „1–7“. */
export function fmtRange(r: Range | null, unit = ""): string {
  if (!r) return "–";
  const f = (x: number) => x.toLocaleString("de-DE", { maximumFractionDigits: 0 });
  return `${f(r.lo) === f(r.hi) ? f(r.mid) : `${f(r.lo)}–${f(r.hi)}`}${unit}`;
}

export function forecast(x: PrognoseIn): Prognose {
  const n = (v: number) => (Number.isFinite(v) && v > 0 ? v : 0);
  const sent = n(x.sent), replies = n(x.replies), samples = n(x.samples), customers = n(x.customers);
  const byPace = Math.round(n(x.perDay) * DAYS);
  const mails30 = x.freeBuyers === null ? byPace : Math.min(byPace, n(x.freeBuyers));
  const stages = [stage("antwort", replies, sent), stage("probe", samples, replies), stage("kunde", customers, samples)];
  const base = { country: x.country, currency: x.currency, mails30, stages };
  const sym = x.currency;
  if (!mails30) {
    return { ...base, basis: "kein_versand", antworten30: null, proben30: null, kunden30: null, umsatz30: null,
      text: `${x.country}: kein Versand in Sicht (0 Mails/Tag oder keine freien Käufer) – keine Prognose.` };
  }
  if (!replies) {
    return { ...base, basis: "keine", antworten30: null, proben30: null, kunden30: null, umsatz30: null,
      text: `${x.country}: noch keine Basis – 0 Antworten auf ${sent} Mails; ~${mails30} Mails in 30 Tagen geplant.` };
  }
  const m: Range = { lo: mails30, mid: mails30, hi: mails30 };
  const a = scale(m, stages[0]);
  const p = samples ? scale(a, stages[1]) : null;
  const k = samples && customers ? scale(p!, stages[2]) : null;
  const u = k ? { lo: k.lo * x.price, mid: k.mid * x.price, hi: k.hi * x.price } : null;
  const basis: Basis = sent < MIN_SENT || replies < MIN_REPLIES ? "duenn" : "ok";
  const ar = round(a), pr = p && round(p, 1), kr = k && round(k, 1), ur = u && round(u);
  const tail = !p ? "Proben/Kunden: noch keine Basis" : !k ? `~${fmtRange(pr)} Proben, Kunden: noch keine Basis` : `~${fmtRange(pr)} Proben, ${fmtRange(kr)} Kunden (${fmtRange(ur, ` ${sym}`)}/Mon.)`;
  return { ...base, basis, antworten30: ar, proben30: pr, kunden30: kr, umsatz30: ur,
    text: `${x.country}: ${mails30} Mails → ${fmtRange(ar)} Antworten, ${tail}${basis === "duenn" ? " (wenig Daten)" : ""}.` };
}

/** Summe über die Länder für die Kennzahl im Dashboard. Kunden nur, wenn jedes Land mit Versand eine Basis hat. */
export function summary(ps: Prognose[]): { value: string; sub: string; tone: "green" | "cyan" | "grey"; tip: string } {
  const active = ps.filter((p) => p.basis !== "kein_versand");
  const mails = active.reduce((a, p) => a + p.mails30, 0);
  const tip = ps.map((p) => p.text).join(" ");
  if (!active.length) return { value: "–", sub: "kein Versand", tone: "grey", tip };
  const withK = active.filter((p) => p.kunden30);
  if (!withK.length) {
    const ans = active.filter((p) => p.antworten30);
    if (!ans.length) return { value: "–", sub: "noch keine Basis", tone: "grey", tip };
    const sum = ans.reduce<Range>((r, p) => ({ lo: r.lo + p.antworten30!.lo, mid: r.mid + p.antworten30!.mid, hi: r.hi + p.antworten30!.hi }), { lo: 0, mid: 0, hi: 0 });
    return { value: fmtRange(sum), sub: "Antworten erwartet", tone: "cyan", tip };
  }
  const k = withK.reduce<Range>((r, p) => ({ lo: r.lo + p.kunden30!.lo, mid: r.mid + p.kunden30!.mid, hi: r.hi + p.kunden30!.hi }), { lo: 0, mid: 0, hi: 0 });
  const money = withK.map((p) => fmtRange(p.umsatz30, ` ${p.currency}`)).join(" + ");
  return { value: fmtRange(k), sub: `Kunden · ${money}/Mon.${withK.length < active.length ? " (Teil)" : ""}`, tone: k.mid >= 1 ? "green" : "cyan", tip };
}

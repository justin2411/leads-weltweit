/**
 * Individuelles Volumen: Kunde wählt 150–10.000 Leads pro Woche, Preis wird automatisch berechnet.
 * Grundlage ist das größte feste Paket (Preis und Wochenmenge); je mehr Leads, desto niedriger der Preis pro Lead
 * (Exponent < 1). Wird im Browser (Anzeige) und auf dem Server (Checkout) identisch gerechnet – der Server
 * vertraut nie einem Preis aus dem Formular.
 */
export const PER_WEEK: Record<string, number> = { starter: 15, pro: 50 };
export const CUSTOM_MIN = 150;
export const CUSTOM_MAX = 10_000;
const EXPONENT = 0.75;

type Base = { key: string; amount_cents?: number; currency?: string };

/** Größtes festes Paket mit Preis und bekannter Wochenmenge. */
export function basePlan<T extends Base>(plans: T[]): T | undefined {
  return plans.filter((p) => p.amount_cents && PER_WEEK[p.key]).sort((a, b) => PER_WEEK[b.key] - PER_WEEK[a.key])[0];
}

export function validWeekly(n: unknown): number | null {
  const v = Number(n);
  return Number.isInteger(v) && v >= CUSTOM_MIN && v <= CUSTOM_MAX ? v : null;
}

/** Monatspreis in Cent, auf ganze Währungseinheiten gerundet. */
export function customCents(base: Base, weekly: number): number {
  const w = PER_WEEK[base.key];
  return Math.round(((base.amount_cents ?? 0) * Math.pow(weekly / w, EXPONENT)) / 100) * 100;
}

export const perMonth = (weekly: number) => Math.round((weekly * 52) / 12);

/** Reglerstellung 0–1000 (logarithmisch) <-> Leads pro Woche, auf runde Werte. */
export function fromSlider(pos: number): number {
  const raw = CUSTOM_MIN * Math.pow(CUSTOM_MAX / CUSTOM_MIN, pos / 1000);
  const step = raw < 1000 ? 10 : raw < 3000 ? 50 : 100;
  return Math.min(CUSTOM_MAX, Math.max(CUSTOM_MIN, Math.round(raw / step) * step));
}
export function toSlider(weekly: number): number {
  return Math.round((1000 * Math.log(weekly / CUSTOM_MIN)) / Math.log(CUSTOM_MAX / CUSTOM_MIN));
}

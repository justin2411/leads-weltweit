/**
 * Statische Landingpages (Ladezeit, Inhaber 03.10.2026): ohne Suchparameter liefert proxy.ts die Seite aus dem
 * Cache, umgeschrieben auf /<land>/<zielgruppe>/s/<eimer>. Der Eimer (0 … BUCKETS-1) wird je Aufruf zufällig
 * gewählt und bestimmt die Variante (A/B-Test) – Anteile also in 10-%-Schritten (traffic_share 0–100).
 */
export const BUCKETS = 10;

/** Feste Zufallszahl je Eimer (Mitte des Intervalls), für pickVariant. */
export function bucketRand(b: number): number {
  return (b + 0.5) / BUCKETS;
}

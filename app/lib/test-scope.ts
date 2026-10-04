/**
 * Tests nur Webagenturen US/UK/FR (Inhaber 04.10.2026: „beim gehirn bei a/b tests soll er das nur für webagencys usa,
 * fr, und uk machen nichts mehr erst wenn ich ihm das freigebe das soll überall so sein“). Freigabe-Liste in
 * config/fokus.yaml `tests` (Spiegel: lib/ops-config.json, Python: scripts/lib/fokus.py test_allowed). Reine Funktionen.
 */
export type TestScope = { segmente: string[]; laender: string[] };

const up = (s: string | null | undefined) => String(s ?? "").trim().toUpperCase();

/** Darf für Segment × Land getestet werden (A/B, Varianten, Preise, Betreff)? Leere Liste = nichts freigegeben. */
export function testAllowed(scope: TestScope, segment: string | null | undefined, country: string | null | undefined): boolean {
  return scope.segmente.map(up).includes(up(segment)) && scope.laender.map(up).includes(up(country));
}

/** Land einer Seite: Spalte country, sonst Präfix des Slugs („uk/web-agencies“ → UK). */
const countryOf = (p: { country?: string | null; slug?: string | null }) => up(p.country ?? String(p.slug ?? "").split("/")[0]);

/** Seiten teilen: mit Tests (in der Freigabe-Liste) und ohne Tests (alles andere, Seite bleibt live, nur Kontrolle). */
export function splitByScope<T extends { segment_id?: string | null; country?: string | null; slug?: string | null }>(
  scope: TestScope, rows: T[],
): { tested: T[]; other: T[] } {
  const tested: T[] = [], other: T[] = [];
  for (const r of rows) (testAllowed(scope, r.segment_id, countryOf(r)) ? tested : other).push(r);
  return { tested, other };
}

/**
 * Varianten, die eine Seite ausspielen darf: in der Freigabe-Liste alle Kandidaten, sonst nur die Kontrolle
 * (Variante A, sonst größter Besucheranteil, sonst die erste) – kein Split-Test außerhalb der Liste.
 */
export function servableVariants<T extends { variant_key?: string | null; traffic_share?: number | null }>(
  scope: TestScope, page: { segment_id?: string | null; country?: string | null; slug?: string | null }, candidates: T[],
): T[] {
  if (candidates.length <= 1 || testAllowed(scope, page.segment_id, countryOf(page))) return candidates;
  const control = candidates.find((v) => up(v.variant_key) === "A")
    ?? [...candidates].sort((a, b) => (Number(b.traffic_share) || 0) - (Number(a.traffic_share) || 0))[0];
  return [control];
}

/**
 * Betrifft ein offener Vorschlag (decisions) eine Zielgruppe außerhalb der Liste? Erkennt „uk/accountants: …“
 * (Seite, Segment über slugSegment) und „S5/UK: …“. Ohne Bezug (allgemeine Vorschläge) zählt er als drin.
 */
export function proposalInScope(scope: TestScope, subject: string, slugSegment: Record<string, string>): boolean {
  const s = String(subject ?? "").trim();
  const seg = /^(S\d+)\/([A-Z]{2})\b/.exec(s);
  if (seg) return testAllowed(scope, seg[1], seg[2]);
  const page = /^([a-z]{2})\/([a-z0-9-]+)\b/.exec(s);
  if (page && slugSegment[`${page[1]}/${page[2]}`]) return testAllowed(scope, slugSegment[`${page[1]}/${page[2]}`], page[1]);
  return true;
}

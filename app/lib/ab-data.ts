import "server-only";
import reg from "@/lib/ab-schritte.json";
import { db } from "@/lib/supabase";
import { TEST_SCOPE } from "@/lib/test-scope-data";
import { testAllowed } from "@/lib/test-scope";
import { clientIp } from "@/lib/visitor";
import { assign } from "@/lib/ab-assign";
import {
  berlinDayKey, funnelView, overrides, parseAbParam, testsView, variantValue,
  type AbKey, type AbRegistry, type AbResult, type AbTest, type FunnelStation, type TestView,
} from "@/lib/ab";

/**
 * A/B je Schritt – Datenbank (nur serverseitig). Laufende Tests für die öffentlichen Seiten (60 s je Server-Instanz
 * zwischengespeichert), Ereignisse schreiben (doppelte ignoriert), Dashboard-Daten (Trichter, Tests, Ergebnisse).
 * Messung ohne Cookies: Einheit = ?r=-Token, Tages-Besucher-Hash (lib/visitor.ts) oder Checkout-ID.
 */
export const AB_REG = reg as unknown as AbRegistry;

let cache: { at: number; tests: AbTest[] } | null = null;

/** Laufende Tests und übernommene Gewinner (60 s Cache). Fehler → leer (Seiten laufen immer ohne Test weiter). */
export async function activeTests(): Promise<AbTest[]> {
  if (cache && Date.now() - cache.at < 60_000) return cache.tests;
  try {
    const { data, error } = await db().from("ab_tests").select("*").in("status", ["laeuft", "gewonnen"]).abortSignal(AbortSignal.timeout(3000));
    if (error) throw new Error(error.message);
    cache = { at: Date.now(), tests: (data ?? []) as AbTest[] };
  } catch {
    cache = { at: Date.now(), tests: cache?.tests ?? [] };
  }
  return cache.tests;
}

export type AbPick = { value: unknown; mark: { testId: string; variant: AbKey } | null };

/**
 * Wert eines Elements für diese Einheit: laufender Test (fest zugewiesene Variante) vor übernommenem Gewinner vor
 * undefined (= Standardtext). Nur in der Test-Freigabe (Webagenturen US/UK/FR).
 */
export async function abPick(step: string, element: string, segment: string, country: string, unit: string): Promise<AbPick> {
  const cc = String(country ?? "").toUpperCase();
  if (!testAllowed(TEST_SCOPE, segment, cc)) return { value: undefined, mark: null };
  const tests = await activeTests();
  const t = tests.find((x) => x.status === "laeuft" && x.step === step && x.segment_id === segment && x.country === cc);
  const won = overrides(tests, step, segment, cc)[element];
  if (t && t.element === element && unit) {
    const variant = assign(t.salt ?? "", unit);
    const v = variantValue(t, variant);
    return { value: v === undefined ? won : v, mark: { testId: t.id, variant } };
  }
  return { value: won, mark: null };
}

/** Gültige Marke aus einem Parameter „<test>.<A|B>“: Test läuft und gehört zu diesem Schritt. */
export async function validMark(raw: unknown, step: string): Promise<{ testId: string; variant: AbKey } | null> {
  const p = parseAbParam(raw);
  if (!p) return null;
  const t = (await activeTests()).find((x) => x.id === p.testId);
  return t && t.status === "laeuft" && t.step === step ? p : null;
}

/** Ereignis schreiben (exposure/conversion), doppelte je Einheit ignoriert. Fehler stören nie die Seite. */
export async function recordAb(mark: { testId: string; variant: AbKey } | null, unit: string | null | undefined,
                               kind: "exposure" | "conversion"): Promise<void> {
  if (!mark || !unit) return;
  try {
    await db().from("ab_events").upsert({ test_id: mark.testId, variant: mark.variant, unit: String(unit).slice(0, 80), kind },
      { onConflict: "test_id,unit,kind", ignoreDuplicates: true });
  } catch { /* Messung darf nie stören */ }
}

/** Marken {test_id: A|B} (z. B. aus der fertigen Probe) als Ereignisse schreiben. */
export async function recordAbMarks(marks: Record<string, string> | undefined, unit: string | null | undefined,
                                    kind: "exposure" | "conversion"): Promise<void> {
  for (const [testId, v] of Object.entries(marks ?? {})) {
    const mark = parseAbParam(`${testId}.${v}`);
    if (mark) await recordAb(mark, unit, kind);
  }
}

/**
 * Einheit für die Zuweisung auf öffentlichen Seiten: ?r=-Token der Mail (gleiche Person, gleiche Variante), sonst
 * IP|Browser|Tag (nur als Hash-Eingang, nie gespeichert). Leer = keine Zuweisung (Standard).
 */
export function unitKey(r: string | null | undefined, h: { get(name: string): string | null }): string {
  if (r && /^[A-Za-z0-9_-]{8,80}$/.test(r)) return `r:${r}`;
  const ip = clientIp(h);
  return ip ? `v:${ip}|${(h.get("user-agent") ?? "").slice(0, 200)}|${berlinDayKey()}` : "";
}

// ------------------------------------------------------------------------------------------- Dashboard
export type AbData = { tests: TestView[]; funnel: FunnelStation[]; days: number; error: string | null };

/** Trichter (30 Tage, Test-Freigabe) und Tests (laufend, Entwürfe, zuletzt beendete) mit Ergebnis je Variante. */
export async function loadAb(now: Date = new Date(), days = 30): Promise<AbData> {
  const t = () => AbortSignal.timeout(7000);
  const since = new Date(now.getTime() - 45 * 86_400_000).toISOString();
  const [tests, results, funnel] = await Promise.all([
    db().from("ab_tests").select("*").or(`status.in.(entwurf,laeuft),beendet.gte.${since}`).order("created_at", { ascending: false }).limit(60).abortSignal(t()),
    db().from("ab_results").select("*").abortSignal(t()),
    db().rpc("ab_funnel", { p_segments: TEST_SCOPE.segmente, p_countries: TEST_SCOPE.laender, p_days: days }).abortSignal(t()),
  ]);
  const err = [tests, results, funnel].find((r) => r.error)?.error?.message ?? null;
  return {
    tests: testsView(AB_REG, (tests.data ?? []) as AbTest[], (results.data ?? []) as AbResult[], now),
    funnel: funnelView(AB_REG, (funnel.data ?? []) as { station: string; n: number; k: number }[]),
    days, error: err,
  };
}

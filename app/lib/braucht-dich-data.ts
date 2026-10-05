import "server-only";
import { cache } from "react";
import { db } from "@/lib/supabase";
import { LEGAL } from "@/content/legal";
import opsConfig from "@/lib/ops-config.json";
import { brauchtDich, type BdDecision, type BdPunkt, type BdSeed } from "@/lib/braucht-dich";

/**
 * Daten für „Braucht dich“ (lib/braucht-dich.ts): jede Quelle einzeln fehlertolerant (Fehler → Punkt entfällt
 * statt falschem Alarm). Liest nie Werte von Secrets – nur ob GH_DISPATCH_TOKEN gesetzt ist und ob seed_checks Zeilen hat.
 */
const T = () => AbortSignal.timeout(3000);
const safe = async <X>(f: () => PromiseLike<X>, dflt: X): Promise<X> => { try { return await f(); } catch { return dflt; } };

/** Je Anfrage nur einmal geladen (Menü-Zähler und Karte teilen sich das Ergebnis). */
export const loadBrauchtDich = cache(async (): Promise<BdPunkt[]> => {
  const now = new Date();
  const since = new Date(now.getTime() - 8 * 86_400_000).toISOString();
  const [decisions, seedRows, legalReady, slotPlan, signaturDecided, seedOpen] = await Promise.all([
    safe(async () => {
      const r = await db().from("decisions").select("id, subject, reasoning, action, kurz_titel, kurz_grund")
        .eq("needs_owner", true).eq("status", "proposed").order("created_at", { ascending: false }).limit(10).abortSignal(T());
      if (r.error) throw new Error(r.error.message);
      return (r.data ?? []) as BdDecision[];
    }, null as BdDecision[] | null),
    safe(async () => {
      const r = await db().from("seed_checks").select("id", { count: "exact", head: true }).gte("at", since).abortSignal(T());
      if (r.error) throw new Error(r.error.message);
      return r.count ?? 0;
    }, null as number | null),
    safe(async () => {
      const r = await db().from("settings").select("legal_ready").eq("id", 1).abortSignal(T()).maybeSingle();
      if (r.error) throw new Error(r.error.message);
      return r.data ? !!r.data.legal_ready : false;
    }, null as boolean | null),
    safe(async () => {
      const r = await db().from("owner_settings").select("value").eq("key", "slot_plan").abortSignal(T()).maybeSingle();
      if (r.error) throw new Error(r.error.message);
      const v = r.data?.value;
      return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, number>) : {};
    }, null as Record<string, number> | null),
    safe(async () => {
      const r = await db().from("decisions").select("id").eq("metrics->>braucht_dich", "signatur").limit(1).abortSignal(T());
      if (r.error) throw new Error(r.error.message);
      return (r.data ?? []).length > 0;
    }, true),
    safe(async () => {
      // Kontrollmails ohne Einordnung: älter als 20 min (Zustellung), höchstens 3 Tage (danach nicht mehr auffindbar)
      const r = await db().from("seed_checks").select("id, country, seed, at, subject").is("placement", null)
        .gte("at", new Date(now.getTime() - 3 * 86_400_000).toISOString())
        .lte("at", new Date(now.getTime() - 20 * 60_000).toISOString())
        .order("at", { ascending: false }).limit(30).abortSignal(T());
      if (r.error) throw new Error(r.error.message);
      return (r.data ?? []) as BdSeed[];
    }, null as BdSeed[] | null),
  ]);
  const rules = (opsConfig as { rules?: { signatur_exklusiv?: string[] } }).rules;
  return brauchtDich({
    decisions, seedRows, legalReady, slotPlan, signaturDecided, seedOpen,
    dispatch: !!process.env.GH_DISPATCH_TOKEN?.trim(),
    legalOpen: Object.values(LEGAL).filter((d) => d.placeholder || d.body.trim().length <= 200).length,
    signaturFiles: rules?.signatur_exklusiv ?? [],
  });
});

/** Nur die Anzahl (Zähler im Menü); langsam/fehlerhaft → 0 statt hängender Seite. */
export function countBrauchtDich(): Promise<number> {
  return Promise.race([loadBrauchtDich().then((x) => x.length, () => 0), new Promise<number>((ok) => setTimeout(() => ok(0), 1500))]);
}

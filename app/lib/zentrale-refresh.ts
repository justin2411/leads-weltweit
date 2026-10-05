/**
 * JARVIS-Cache sofort neu rechnen, nachdem der Inhaber etwas gespeichert hat, das JARVIS zeigt (Ziele, Einstellungen,
 * Plätze, Proben-Soll, Bereiche …). Bug 05.10.2026: Ziele übernommen, JARVIS zeigte weiter „unbestätigt“, weil nur
 * der (verspätete) Wachhund dashboard_cache 'zentrale' auffrischte. Läuft nach der Antwort (next/server after()), damit
 * Speichern nie wartet oder scheitert; Fehler werden nur geloggt. Zusätzlich rechnet pg_cron alle 5 min neu
 * (Migration 20261005180000). Ohne Next-Abhängigkeit, damit der Test die Teile einzeln ersetzen kann.
 */
export type RpcLike = (fn: "zentrale_cache_refresh") => PromiseLike<{ error: { message: string } | null }>;
export type Deps = {
  rpc: RpcLike;
  schedule: (task: () => Promise<void>) => void;
  revalidate: (path: string) => void;
  log?: (msg: string) => void;
};

export const ZENTRALE_PFADE = ["/dashboard/jarvis", "/dashboard/buero"] as const;

/** Plant das Neu-Rechnen ein (nie blockierend, wirft nie). */
export function planeZentraleRefresh(d: Deps): void {
  const log = d.log ?? ((m: string) => console.error(m));
  try {
    d.schedule(async () => {
      try {
        const { error } = await d.rpc("zentrale_cache_refresh");
        if (error) log(`zentrale_cache_refresh: ${error.message}`);
      } catch (e) {
        log(`zentrale_cache_refresh: ${e instanceof Error ? e.message : String(e)}`);
      }
      for (const p of ZENTRALE_PFADE) {
        try {
          d.revalidate(p);
        } catch {
          /* außerhalb eines Requests: egal */
        }
      }
    });
  } catch (e) {
    log(`zentrale_cache_refresh nicht geplant: ${e instanceof Error ? e.message : String(e)}`);
  }
}

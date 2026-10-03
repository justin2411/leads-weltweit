import "server-only";
import { unstable_cache } from "next/cache";
import { db } from "@/lib/supabase";
import type { Live, OpsConfig, RawStock, RunInfo, Stock } from "@/lib/dashboard-logic";
import opsConfig from "@/lib/ops-config.json";

/**
 * Daten des Inhaber-Dashboards. Aggregation in der Datenbank (Funktionen aus Migration 20261003180000):
 * - dashboard_live:      bei jedem Aufruf (~0,3 s)
 * - dashboard_stock:     Leads/Käufer je Zielgruppe × Land (~2 s), 10 min zwischengespeichert – schont das Disk-IO-Budget
 * - dashboard_raw_stock: Rohbestand (Firmen ohne Lead, ~4 s), 1 h zwischengespeichert
 * Alles nur serverseitig mit dem Service-Schlüssel; der Zwischenspeicher enthält nur Zählungen.
 */
export const CONFIG = opsConfig as OpsConfig;

async function rpc<T>(fn: string, args: Record<string, unknown> = {}, timeoutMs = 10_000): Promise<T> {
  const { data, error } = await db().rpc(fn, args).abortSignal(AbortSignal.timeout(timeoutMs));
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

export async function loadLive(): Promise<Live> {
  // Notbremse-Fenster wie deliverability.window_start: letzte 30 Tage, aber nicht vor notbremse_ab
  const start = Math.max(Date.now() - 30 * 86_400_000, CONFIG.versand.notbremse_ab ? Date.parse(CONFIG.versand.notbremse_ab) : 0);
  const [live, blocked] = await Promise.all([
    rpc<Live>("dashboard_live", { p_window_start: new Date(start).toISOString() }),
    db().from("messages").select("id", { count: "exact", head: true }).eq("status", "draft").neq("check_errors", "{}")
      .abortSignal(AbortSignal.timeout(5000)),
  ]);
  return { ...live, drafts_blocked: blocked.count ?? 0 };
}

export const loadStock = unstable_cache(async () => rpc<Stock>("dashboard_stock", {}, 40_000), ["dashboard-stock-v1"], {
  revalidate: 600,
  tags: ["dashboard-stock"],
});

export const loadRawStock = unstable_cache(async () => rpc<RawStock>("dashboard_raw_stock", {}, 70_000), ["dashboard-raw-stock-v1"], {
  revalidate: 3600,
  tags: ["dashboard-stock"],
});

/**
 * Letzte GitHub-Läufe der Werke – nur wenn in Vercel ein Token mit Leserecht auf Actions gesetzt ist
 * (GH_DISPATCH_TOKEN, docs/EINRICHTUNG.md). Ohne Token: null (Dashboard leitet die Läufe aus der Datenbank ab).
 */
export const loadRuns = unstable_cache(
  async (): Promise<RunInfo[] | null> => {
    const token = process.env.GH_DISPATCH_TOKEN?.trim();
    if (!token) return null;
    const repo = process.env.GH_REPO?.trim() || "justin2411/leads-weltweit";
    const out: RunInfo[] = [];
    await Promise.all(
      CONFIG.workflows.map(async (w) => {
        try {
          const r = await fetch(`https://api.github.com/repos/${repo}/actions/workflows/${w.file}/runs?per_page=1&branch=main`, {
            headers: { Authorization: `Bearer ${token}`, Accept: "application/vnd.github+json" },
            signal: AbortSignal.timeout(4000),
            cache: "no-store",
          });
          if (!r.ok) return;
          const run = (await r.json()).workflow_runs?.[0];
          if (run) out.push({ file: w.file, name: w.name, status: run.status, conclusion: run.conclusion, updated_at: run.updated_at, url: run.html_url });
        } catch {
          /* ein Workflow ohne Antwort verhindert die Seite nicht */
        }
      }),
    );
    return out;
  },
  ["dashboard-runs-v1"],
  { revalidate: 300 },
);

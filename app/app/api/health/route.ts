import { envStatus } from "@/lib/env";

export const dynamic = "force-dynamic";

/** Diagnose ohne Login: nur ob Variablen gesetzt sind (nie Werte) und welches Deployment läuft. */
export async function GET() {
  return Response.json({
    umgebung: process.env.VERCEL_ENV ?? "unbekannt",
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "unbekannt",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "unbekannt",
    variablen: Object.fromEntries(envStatus().map((e) => [e.name, e.set ? "gesetzt" : "FEHLT"])),
  }, { headers: { "Cache-Control": "no-store" } });
}

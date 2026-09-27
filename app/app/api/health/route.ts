import { envStatus } from "@/lib/env";
import { stripe, stripeEnabled, type StripeMode } from "@/lib/stripe";

export const dynamic = "force-dynamic";

/** Stripe-Konto prüfen (nur Status, nie Schlüssel): kann das Konto Zahlungen annehmen? */
async function stripeStatus(mode: StripeMode) {
  if (!stripeEnabled(mode)) return "aus";
  try {
    const a = await stripe("account", undefined, mode, "GET");
    return { zahlungen: !!a.charges_enabled, angaben_vollstaendig: !!a.details_submitted, offen: a.requirements?.currently_due?.length ?? 0 };
  } catch (e) {
    return { fehler: (e as Error).message.replace(/\b(sk|rk|pk)_(live|test)_\w+/g, "[schlüssel]").replace(/\*{3,}\w*/g, "***") };
  }
}

/** Diagnose ohne Login: nur ob Variablen gesetzt sind (nie Werte) und welches Deployment läuft; ?stripe=1 prüft das Konto. */
export async function GET(req: Request) {
  const withStripe = new URL(req.url).searchParams.get("stripe") === "1";
  return Response.json({
    umgebung: process.env.VERCEL_ENV ?? "unbekannt",
    commit: (process.env.VERCEL_GIT_COMMIT_SHA ?? "").slice(0, 7) || "unbekannt",
    branch: process.env.VERCEL_GIT_COMMIT_REF ?? "unbekannt",
    variablen: Object.fromEntries(envStatus().map((e) => [e.name, e.set ? "gesetzt" : "FEHLT"])),
    ...(withStripe ? { stripe: { live: await stripeStatus("live"), test: await stripeStatus("test") } } : {}),
  }, { headers: { "Cache-Control": "no-store" } });
}

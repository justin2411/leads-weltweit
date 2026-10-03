import { homeStats } from "@/lib/site-pages";

export const dynamic = "force-dynamic";

/** Live-Zähler der Startseite: echte Anzahl erfasster Signale und Zuwachs der letzten 24 h (keine Firmendaten). */
export async function GET() {
  try {
    const s = await homeStats();
    return Response.json({ signals: s.signals, perDay: s.signals24h },
      { headers: { "Cache-Control": "public, s-maxage=60, stale-while-revalidate=300" } });
  } catch {
    return Response.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}

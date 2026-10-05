import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { loadTrichter } from "@/lib/jarvis-trichter-data";
import { tageAus } from "@/lib/jarvis-kpi";

export const dynamic = "force-dynamic";

/**
 * Website-Trichter der JARVIS-Zentrale (GET ?d=1|7|30, 1 = heute seit 00:00 Berlin): Besucher → Probe-Klick → Probe-Anfrage → Checkout → Kunde je Land,
 * dazu Quellen und Seiten. Nur mit Inhaber-Sitzung (sonst 404 wie das Dashboard), nur lesen, eigene anonyme Messung.
 */
const notFound = () => new Response("Not found", { status: 404 });

export async function GET(req: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySession(token, process.env.SESSION_SECRET?.trim())) return notFound();
  const tage = tageAus(new URL(req.url).searchParams.get("d"));
  const paket = await loadTrichter(tage);
  return Response.json({ paket }, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

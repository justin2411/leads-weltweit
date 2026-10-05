import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { loadZentrale } from "@/lib/zentrale-data";

export const dynamic = "force-dynamic";

/**
 * Live-Daten der JARVIS-Zentrale (GET ?teil=schnell|langsam). Nur mit Inhaber-Sitzung (sonst 404 wie das Dashboard),
 * nur lesen, nie zwischengespeichert. schnell alle 10 s, langsam alle 60 s (useZentrale, nur bei sichtbarem Tab).
 */
const notFound = () => new Response("Not found", { status: 404 });

export async function GET(req: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySession(token, process.env.SESSION_SECRET?.trim())) return notFound();
  const t = new URL(req.url).searchParams.get("teil");
  const teil = t === "schnell" || t === "langsam" ? t : "alle";
  const data = await loadZentrale(teil);
  return Response.json(data, { headers: { "Cache-Control": "no-store, max-age=0" } });
}

import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { askJarvis } from "@/lib/jarvis-ask";

export const dynamic = "force-dynamic";
/** Haiku + bis zu 6 Opus-Runden; askJarvis hört nach 50 s auf und überlässt den Rest der Routine. */
export const maxDuration = 60;

/**
 * Sofort-Antwort im JARVIS-Chat (Inhaber 04.10.2026: „alle chats sollen direkt antworten“). Nur mit gültiger
 * Inhaber-Sitzung (sonst 404 wie das Dashboard) und nur vom eigenen Ursprung. POST {session_id?, flow_id?, text, mode?}:
 * session_id = Sitzung (Chat, Tagesbericht, Baukasten, Website); leer = neue Chat-Sitzung; flow_id = Baukasten-Chat
 * des Flows; mode = „assistent“ | „gehirn“ (Schalter im Chat). Antwort: {ok, sessionId, messageId, reply, model, cost, routine, changed, fallback}. Ablauf: lib/jarvis-ask.ts.
 */
const notFound = () => new Response("Not found", { status: 404 });

export async function POST(req: Request) {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!verifySession(token, process.env.SESSION_SECRET?.trim())) return notFound();
  const origin = req.headers.get("origin");
  if (origin) {
    try {
      if (new URL(origin).host !== new URL(req.url).host && new URL(origin).host !== req.headers.get("host")) return notFound();
    } catch {
      return notFound();
    }
  }
  const data = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!data || typeof data !== "object") return Response.json({ ok: false, error: "Nachricht fehlt" }, { status: 400 });
  const r = await askJarvis({ sessionId: data.session_id, flowId: data.flow_id, text: data.text, mode: data.mode });
  return Response.json(r, { status: r.ok ? 200 : 400, headers: { "Cache-Control": "no-store" } });
}

export const GET = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;

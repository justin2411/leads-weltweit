import { pushAlarm } from "@/lib/push";
import { buildPayload, ReplayGuard, verifySigned } from "@/lib/push-core";
import { siteUrl } from "@/lib/site";

export const dynamic = "force-dynamic";

/**
 * Sofort-Alarm von den GitHub-Läufen (scripts/lib/push.py: Antwort mit Kaufinteresse/Frage/Unklar, später
 * Tagescheck/Notbremse) an das Handy des Inhabers. POST {title, body, url, kind, ts}, Kopfzeile X-Signature =
 * HMAC-SHA256(rohes JSON, SUPABASE_SERVICE_ROLE_KEY) als Hex; ts höchstens 5 Minuten alt; höchstens 30 Alarme pro
 * Stunde. Ohne gültige Signatur und für jede andere Methode: 404 (der Endpunkt verrät nichts).
 */
const replay = new ReplayGuard();
const notFound = () => new Response("Not found", { status: 404 });

export async function POST(req: Request) {
  const raw = await req.text().catch(() => "");
  const sig = req.headers.get("x-signature");
  const data = verifySigned(raw, sig, process.env.SUPABASE_SERVICE_ROLE_KEY?.trim());
  if (!data || !sig || !replay.fresh(sig)) return notFound();
  const p = buildPayload(data, siteUrl());
  if (!p) return Response.json({ ok: false, error: "payload" }, { status: 400 });
  try {
    const r = await pushAlarm(p.title, p.body, p.url, p.kind);
    if (r.skipped === "rate") return Response.json({ ok: false, error: "rate" }, { status: 429 });
    return Response.json({ ok: true, ...r });
  } catch (e) {
    console.log(`push api: ${String((e as Error)?.message ?? e).slice(0, 160)}`);
    return Response.json({ ok: false, error: "server" }, { status: 500 });
  }
}

export const GET = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;

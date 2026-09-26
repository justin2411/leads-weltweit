import { db } from "@/lib/supabase";
import { CLIENT_EVENTS } from "@/lib/variants";

export const dynamic = "force-dynamic";

/** Anonyme Ereignisse: nur Variante + Typ + Zeit. Keine IP, keine Cookies, keine personenbezogenen Daten. */
export async function POST(req: Request) {
  let body: { variant_id?: string; type?: string };
  try {
    body = JSON.parse(await req.text());
  } catch {
    return new Response(null, { status: 400 });
  }
  const { variant_id, type } = body;
  if (!variant_id || !type || !CLIENT_EVENTS.has(type) || !/^[0-9a-f-]{36}$/.test(variant_id)) {
    return new Response(null, { status: 400 });
  }
  const { data: v } = await db().from("page_variants").select("id, status").eq("id", variant_id).maybeSingle();
  if (!v || v.status !== "live") return new Response(null, { status: 204 });
  await db().from("page_events").insert({ variant_id, type });
  return new Response(null, { status: 204 });
}

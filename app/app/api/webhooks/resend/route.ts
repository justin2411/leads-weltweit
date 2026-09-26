import { verifySvix } from "@/lib/signature";
import { db, suppressEmail } from "@/lib/supabase";

export const dynamic = "force-dynamic";

// Resend-Ereignis -> unser Typ. Öffnungen und Klicks werden bewusst nicht gespeichert.
const TYPE_MAP: Record<string, string> = {
  "email.sent": "sent",
  "email.delivered": "delivered",
  "email.delivery_delayed": "delivery_delayed",
  "email.bounced": "bounced",
  "email.complained": "complained",
  "email.failed": "failed",
};

export async function POST(req: Request) {
  const body = await req.text();
  const ok = verifySvix(
    process.env.RESEND_WEBHOOK_SECRET ?? "",
    {
      id: req.headers.get("svix-id"),
      timestamp: req.headers.get("svix-timestamp"),
      signature: req.headers.get("svix-signature"),
    },
    body,
  );
  if (!ok) return new Response("invalid signature", { status: 401 });

  const event = JSON.parse(body) as { type: string; created_at?: string; data?: any };
  const type = TYPE_MAP[event.type];
  if (!type) return new Response("ignored", { status: 200 });

  const resendId: string | undefined = event.data?.email_id;
  const { data: message } = resendId
    ? await db().from("messages").select("id, to_email").eq("resend_id", resendId).maybeSingle()
    : { data: null };

  const { error } = await db()
    .from("email_events")
    .insert({
      message_id: message?.id ?? null,
      resend_id: resendId ?? null,
      type,
      dedupe_key: `svix:${req.headers.get("svix-id")}`,
      payload: { type: event.type, created_at: event.created_at, bounce: event.data?.bounce ?? null },
      occurred_at: event.created_at ?? new Date().toISOString(),
    });
  // 23505 = doppelt zugestellt (svix-id schon bekannt) -> trotzdem 200
  if (error && error.code !== "23505") return new Response(error.message, { status: 500 });

  if (type === "bounced" || type === "complained") {
    const recipients: string[] = message?.to_email ? [message.to_email] : (event.data?.to ?? []);
    for (const r of recipients) {
      await suppressEmail(r, type === "bounced" ? "bounce" : "complaint", `resend:${event.type}`);
    }
  }
  return new Response("ok", { status: 200 });
}

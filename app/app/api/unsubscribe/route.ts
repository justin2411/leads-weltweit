import { db, suppressEmail } from "@/lib/supabase";

export const dynamic = "force-dynamic";

function page(title: string, text: string, status = 200) {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${title}</title>
<style>body{font:16px/1.5 system-ui,sans-serif;max-width:32rem;margin:4rem auto;padding:0 1rem;color:#222;background:#fff}</style>
</head><body><h1>${title}</h1><p>${text}</p></body></html>`;
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

async function unsubscribe(token: string | null): Promise<"ok" | "invalid"> {
  if (!token || !/^[a-f0-9]{16,128}$/.test(token)) return "invalid";
  const { data, error } = await db()
    .from("messages")
    .select("id, to_email, resend_id")
    .eq("unsubscribe_token", token)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return "invalid";

  await suppressEmail(data.to_email, "unsubscribe", "unsubscribe-link");
  await db().from("email_events").insert({
    message_id: data.id,
    resend_id: data.resend_id,
    type: "unsubscribed",
    note: "Abmeldelink",
  });
  return "ok";
}

// Klick auf den Link in der Mail
export async function GET(req: Request) {
  const t = new URL(req.url).searchParams.get("t");
  const result = await unsubscribe(t);
  if (result === "invalid") {
    return page("Link not valid", "This unsubscribe link is not valid. Please reply to the email with “unsubscribe” and we will remove you.", 404);
  }
  return page(
    "You are unsubscribed",
    "Your address and your company domain have been removed. You will not receive any further emails from us.",
  );
}

// One-Click-Abmeldung aus dem Mailprogramm (RFC 8058, List-Unsubscribe-Post)
export async function POST(req: Request) {
  const t = new URL(req.url).searchParams.get("t");
  const result = await unsubscribe(t);
  return new Response(result === "ok" ? "unsubscribed" : "invalid token", {
    status: result === "ok" ? 200 : 404,
  });
}

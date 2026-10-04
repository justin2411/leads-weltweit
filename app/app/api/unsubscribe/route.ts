import { db, suppressEmail } from "@/lib/supabase";
import { handleGet, handlePost, type UnsubDeps } from "@/lib/unsubscribe";

export const dynamic = "force-dynamic";

// Inhaber 05.10.2026: „Abmeldelink ja“ – GET zeigt nur den Knopf „Abmelden bestätigen“, POST sperrt sofort.
const deps: UnsubDeps = {
  async find(token) {
    const { data, error } = await db()
      .from("messages")
      .select("id, to_email, resend_id, prospects(country)")
      .eq("unsubscribe_token", token)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!data) return null;
    const p: any = (data as any).prospects;
    return { id: String(data.id), to_email: data.to_email, resend_id: data.resend_id ?? null, country: p?.country ?? null };
  },
  async suppress(email) {
    await suppressEmail(email, "unsubscribe", "unsubscribe-link");
  },
  async event(row) {
    await db().from("email_events").insert(row);
  },
};

// Klick auf den Link in der Mail: nur Bestätigungsseite (Link-Scanner sperren nicht)
export async function GET(req: Request) {
  return handleGet(req.url, deps);
}

// Knopf „Abmelden bestätigen“ und One-Click-Abmeldung aus dem Mailprogramm (RFC 8058, List-Unsubscribe-Post)
export async function POST(req: Request) {
  return handlePost(req, deps);
}

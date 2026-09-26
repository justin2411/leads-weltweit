import "server-only";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient<any, "signalwerk"> | null = null;

/** Nur serverseitig: Service-Schlüssel, Schema `signalwerk`. */
export function db(): SupabaseClient<any, "signalwerk"> {
  if (client) return client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY fehlen");
  client = createClient<any, "signalwerk">(url, key, {
    db: { schema: "signalwerk" },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}

/** Sperrt Adresse und Domain dauerhaft (idempotent). */
export async function suppressEmail(email: string, reason: string, source: string) {
  const { error } = await db().rpc("suppress_email", {
    p_email: email.toLowerCase(),
    p_reason: reason,
    p_source: source,
  });
  if (error) throw new Error(`suppress_email: ${error.message}`);
}

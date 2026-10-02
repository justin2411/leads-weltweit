import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { canPublish } from "@/lib/legal";
import { db } from "@/lib/supabase";

export type Settings = {
  brain_enabled: boolean; auto_publish_pages: boolean; auto_merge_content: boolean;
  max_new_pages_per_week: number; legal_ready: boolean;
  pricing: import("@/lib/stripe").Plan[] | null;
};

// Letzter guter Stand je Server-Instanz: antwortet die Datenbank nicht, zeigen die Seiten diesen statt zu hängen.
let lastSettings: Settings | null = null;
const lastPages = new Map<string, { page: any; variants: any[] }>();

export async function getSettings(): Promise<Settings> {
  try {
    const { data, error } = await db().from("settings").select("*").eq("id", 1).maybeSingle();
    if (error) throw new Error(error.message);
    lastSettings = (data ?? { brain_enabled: true, auto_publish_pages: false, auto_merge_content: false, max_new_pages_per_week: 3, legal_ready: false, pricing: null }) as Settings;
    return lastSettings;
  } catch (e) {
    if (lastSettings) return lastSettings;
    throw e;
  }
}

export async function isOwner(): Promise<boolean> {
  // Nur lesen – Landingpages setzen nie Cookies.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token, process.env.SESSION_SECRET?.trim());
}

/** Öffentlich sichtbar? Seite live, Rechtstexte fertig und freigegeben. */
export function pageIsPublic(page: { status: string }, settings: Settings): boolean {
  return page.status === "live" && canPublish(settings.legal_ready);
}

export async function loadPage(slug: string) {
  try {
    const { data: page, error } = await db().from("landing_pages").select("*").eq("slug", slug).maybeSingle();
    if (error) throw new Error(error.message);
    if (!page) return null;
    const { data: variants, error: e2 } = await db().from("page_variants").select("*").eq("page_id", page.id).order("variant_key");
    if (e2) throw new Error(e2.message);
    const out = { page, variants: variants ?? [] };
    lastPages.set(slug, out);
    return out;
  } catch (e) {
    const old = lastPages.get(slug);
    if (old) return old;
    throw e;
  }
}

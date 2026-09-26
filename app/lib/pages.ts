import "server-only";
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { canPublish } from "@/lib/legal";
import { db } from "@/lib/supabase";

export type Settings = {
  brain_enabled: boolean; auto_publish_pages: boolean; auto_merge_content: boolean;
  max_new_pages_per_week: number; legal_ready: boolean;
  pricing: { key: string; name: string; price_label: string; stripe_price_id?: string; stripe_test_price_id?: string; description?: string }[] | null;
};

export async function getSettings(): Promise<Settings> {
  const { data, error } = await db().from("settings").select("*").eq("id", 1).maybeSingle();
  if (error) throw new Error(error.message);
  return (data ?? { brain_enabled: true, auto_publish_pages: false, auto_merge_content: false, max_new_pages_per_week: 3, legal_ready: false, pricing: null }) as Settings;
}

export async function isOwner(): Promise<boolean> {
  // Nur lesen – Landingpages setzen nie Cookies.
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token, process.env.SESSION_SECRET);
}

/** Öffentlich sichtbar? Seite live, Rechtstexte fertig und freigegeben. */
export function pageIsPublic(page: { status: string }, settings: Settings): boolean {
  return page.status === "live" && canPublish(settings.legal_ready);
}

export async function loadPage(slug: string) {
  const { data: page } = await db().from("landing_pages").select("*").eq("slug", slug).maybeSingle();
  if (!page) return null;
  const { data: variants } = await db().from("page_variants").select("*").eq("page_id", page.id).order("variant_key");
  return { page, variants: variants ?? [] };
}

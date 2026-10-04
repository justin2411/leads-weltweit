import { db } from "@/lib/supabase";
import { CLIENT_EVENTS } from "@/lib/variants";
import { RateLimiter, isBot, parseBeacon } from "@/lib/website-stats";

export const dynamic = "force-dynamic";

/**
 * Anonyme Ereignisse der Landingpages: Variante + Typ (A/B-Tests des Gehirns, page_events) und für die
 * Website-Auswertung Herkunftsart, Gerät, Scrolltiefe, Verweildauer und Klickposition (web_views/web_clicks).
 * Keine IP, keine Cookies, keine vollständige Referrer-Adresse, keine Formulareingaben (lib/website-stats.ts).
 */
const limiter = new RateLimiter();
const MAX_BODY = 1024;

// Variante → Seite (5 min je Server-Instanz), spart eine Abfrage pro Ereignis
const variants = new Map<string, { live: boolean; slug: string | null; at: number }>();
async function variantInfo(id: string): Promise<{ live: boolean; slug: string | null }> {
  const hit = variants.get(id);
  if (hit && Date.now() - hit.at < 5 * 60_000) return hit;
  const { data } = await db().from("page_variants").select("id, status, landing_pages(slug)").eq("id", id).maybeSingle();
  const lp = (data as { landing_pages?: { slug?: string } | { slug?: string }[] } | null)?.landing_pages;
  const slug = (Array.isArray(lp) ? lp[0]?.slug : lp?.slug) ?? null;
  const info = { live: data?.status === "live", slug, at: Date.now() };
  if (variants.size > 500) variants.clear();
  variants.set(id, info);
  return info;
}

const done = () => new Response(null, { status: 204 });

export async function POST(req: Request) {
  // Automatische Abrufe (Suchmaschinen, Link-Prüfer der Mail-Sicherheit, Vorschauen) zählen nicht
  if (isBot(req.headers.get("user-agent"))) return done();
  let body: unknown;
  try {
    const text = await req.text();
    if (text.length > MAX_BODY) return new Response(null, { status: 413 });
    body = JSON.parse(text);
  } catch {
    return new Response(null, { status: 400 });
  }
  const b = parseBeacon(body);
  if (!b || (b.kind === "legacy" && !CLIENT_EVENTS.has(b.type))) return new Response(null, { status: 400 });
  if (!limiter.allow(b.kind === "legacy" ? null : b.pv)) return new Response(null, { status: 429 });
  const v = await variantInfo(b.variant_id);
  if (!v.live || !v.slug) return done();
  try {
    if (b.kind === "legacy") {
      await db().from("page_events").insert({ variant_id: b.variant_id, type: b.type });
    } else if (b.kind === "view") {
      await Promise.all([
        db().from("page_events").insert({ variant_id: b.variant_id, type: "view" }),
        db().from("web_views").insert({ pv: b.pv, slug: v.slug, variant_id: b.variant_id, src: b.src, subj: b.subj, device: b.device }),
      ]);
    } else if (b.kind === "click") {
      await Promise.all([
        b.cta ? db().from("page_events").insert({ variant_id: b.variant_id, type: "cta_click" }) : null,
        db().from("web_clicks").insert({ slug: v.slug, device: b.device, x: b.x, y: b.y, el: b.el, label: b.label }),
      ]);
    } else {
      await db().rpc("web_view_end", { p_pv: b.pv, p_depth: b.depth, p_dwell: b.dwell });
    }
  } catch {
    /* Messung darf die Seite nie stören */
  }
  return done();
}

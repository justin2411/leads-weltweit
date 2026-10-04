import { db } from "@/lib/supabase";
import { CLIENT_EVENTS } from "@/lib/variants";
import { isOwner } from "@/lib/pages";
import { RateLimiter, browserOf, countryOfSlug, isBot, parseBeacon } from "@/lib/website-stats";
import { countable, isPreviewRef } from "@/lib/visitor";
import { countryFromHeaders, endHit, recordHit, recordSignal, visitorKey, type VisitorKey } from "@/lib/web-hits";
import { recordAb, validMark } from "@/lib/ab-data";

export const dynamic = "force-dynamic";

/**
 * Anonyme Ereignisse der Landingpages: Variante + Typ (A/B-Tests des Gehirns, page_events) und für die
 * Website-Auswertung Herkunftsart, Gerät, Scrolltiefe, Verweildauer und Klickposition (web_views/web_clicks).
 * Keine Cookies setzen, keine IP speichern, keine vollständige Referrer-Adresse, keine Formulareingaben (lib/website-stats.ts).
 *
 * Eindeutige Besucher (Inhaber 04.10.2026): je Aufruf der Landingpage bzw. Tarifseite ein Tages-Besucher-Schlüssel =
 * SHA-256(Tages-Salz | IP | User-Agent | Tag) (lib/visitor.ts); nur der Hash landet in web_visitors. Inhaber-Sitzung
 * (Dashboard-Login-Cookie, nur gelesen), Vorschau (?vorschau=1) und Bots zählen gar nicht – auch nicht in page_events.
 *
 * Website-Trichter (Inhaber 04.10.2026): zusätzlich je Aufruf von Startseite, Landingpage, Tarif und Danke eine schlanke
 * Zeile in web_hits (Stufe, Land, Hash, Gerät, Herkunft; beim Verlassen Sekunden und Scrolltiefe), lib/web-hits.ts.
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

/**
 * A/B je Schritt auf der Tarifseite (Einheit = Tages-Besucher-Hash): ab = Variante der Tarifseite gesehen (exposure),
 * abc = Klick aus der Probe-Mail (conversion des Probe-Mail-Tests). Nur laufende Tests des passenden Schritts.
 */
async function abVisit(vh: string | null, ab?: string, abc?: string) {
  if (!vh) return;
  await Promise.all([
    ab ? validMark(ab, "tarif").then((m) => recordAb(m, vh, "exposure")) : null,
    abc ? validMark(abc, "probe_mail").then((m) => recordAb(m, vh, "conversion")) : null,
  ]);
}

/** Eindeutigen Besucher vermerken (nur Hash, JARVIS-Linie „Website“). Ohne Schlüssel wird nichts gezählt. */
async function visit(key: VisitorKey | null, page: "landing" | "tarif", slug: string) {
  if (!key) return;
  await db().rpc("web_visit", { p_page: page, p_slug: slug, p_vh: key.vh, p_day: key.day });
}

export async function POST(req: Request) {
  // Automatische Abrufe (Suchmaschinen, Link-Prüfer der Mail-Sicherheit, Vorschauen) zählen nicht
  const bot = isBot(req.headers.get("user-agent"));
  if (!countable({ owner: false, preview: isPreviewRef(req.headers.get("referer")), bot })) return done();
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
  if (!limiter.allow(b.kind === "legacy" || b.kind === "visit" ? null : b.pv)) return new Response(null, { status: 429 });
  // Inhaber nie mitzählen (Login-Cookie auf derselben Domain, nur gelesen)
  if (await isOwner().catch(() => false)) return done();
  try {
    // Trichter: Ende eines Aufrufs (alle Stufen) und Startseite (ohne Variante, Land aus dem Hoster-Kürzel)
    if (b.kind === "hit_end") {
      await endHit(b.pv, b.ds, b.depth);
      return done();
    }
    if (b.kind === "hit" && b.stage === "start") {
      const key = await visitorKey(req.headers);
      if (key) await recordHit({ key, stage: "start", country: countryFromHeaders(req.headers), pv: b.pv, device: b.device, src: b.src, ref: b.ref,
                                  browser: browserOf(req.headers.get("user-agent")), um: b.um, uc: b.uc });
      return done();
    }
    // Zählungen und Web Vitals der Startseite (ohne Kennung)
    if ((b.kind === "ev" || b.kind === "vitals") && b.stage === "start") {
      await recordSignal(b, countryFromHeaders(req.headers), null);
      return done();
    }
  } catch {
    return done();
  }
  if (!b.variant_id) return done();
  const v = await variantInfo(b.variant_id);
  // Danke zählt auch, wenn die gekaufte Variante inzwischen nicht mehr live ist
  const danke = (b.kind === "hit" || b.kind === "ev" || b.kind === "vitals") && b.stage === "danke";
  if (!v.slug || (!v.live && !danke)) return done();
  try {
    if (b.kind === "ev" || b.kind === "vitals") {
      await recordSignal(b, countryOfSlug(v.slug), v.slug);
      return done();
    }
    if (b.kind === "legacy") {
      await db().from("page_events").insert({ variant_id: b.variant_id, type: b.type });
    } else if (b.kind === "view") {
      const key = await visitorKey(req.headers);
      await Promise.all([
        db().from("page_events").insert({ variant_id: b.variant_id, type: "view" }),
        db().from("web_views").insert({ pv: b.pv, slug: v.slug, variant_id: b.variant_id, src: b.src, subj: b.subj, device: b.device }),
        visit(key, "landing", v.slug),
        key && recordHit({ key, stage: "landing", country: countryOfSlug(v.slug), slug: v.slug, pv: b.pv, device: b.device, src: b.src, ref: b.ref,
                           browser: browserOf(req.headers.get("user-agent")), um: b.um, uc: b.uc }),
      ]);
    } else if (b.kind === "visit") {
      await visit(await visitorKey(req.headers), b.page, v.slug);
    } else if (b.kind === "hit") {
      const key = await visitorKey(req.headers);
      await Promise.all([
        b.stage === "tarif" ? visit(key, "tarif", v.slug) : null,
        key && recordHit({ key, stage: b.stage, country: countryOfSlug(v.slug), slug: v.slug, pv: b.pv, device: b.device, src: b.src, ref: b.ref,
                           browser: browserOf(req.headers.get("user-agent")), um: b.um, uc: b.uc }),
        b.stage === "tarif" ? abVisit(key?.vh ?? null, b.ab, b.abc) : null,
      ]);
    } else if (b.kind === "click") {
      await Promise.all([
        b.cta ? db().from("page_events").insert({ variant_id: b.variant_id, type: "cta_click" }) : null,
        db().from("web_clicks").insert({ slug: v.slug, device: b.device, x: b.x, y: b.y, el: b.el, label: b.label }),
      ]);
    } else if (b.kind === "end") {
      await Promise.all([
        db().rpc("web_view_end", { p_pv: b.pv, p_depth: b.depth, p_dwell: b.dwell }),
        b.ds !== null ? endHit(b.pv, b.ds, b.depth) : null,
      ]);
    }
  } catch {
    /* Messung darf die Seite nie stören */
  }
  return done();
}

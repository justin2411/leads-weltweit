import "server-only";
import { db } from "@/lib/supabase";
import { SaltCache, clientIp, visitorHash } from "@/lib/visitor";
import { geoCountry, type FunnelStage } from "@/lib/website-funnel";
import type { Beacon, Browser, Device, Source } from "@/lib/website-stats";
import { berlinDay } from "@/lib/visitor";

/**
 * Serverseitige Messung des Website-Trichters (signalwerk.web_hits): Tages-Besucher-Schlüssel wie in lib/visitor.ts
 * (Hash aus Tages-Salz, IP und User-Agent – gespeichert wird nur der Hash) und eine schlanke Zeile je Aufruf.
 * Gemeinsam für /api/events (Startseite, Landingpage, Tarif, Danke) und /api/checkout (Stripe).
 */

// Tages-Salz aus der Datenbank (je Server-Instanz zwischengespeichert, nie im Browser)
const salts = new SaltCache(async () => {
  const { data, error } = await db().rpc("web_salt_today");
  if (error || !data) return null;
  const x = data as { day?: string; salt?: string | null };
  return x.day && x.salt ? { day: x.day, salt: x.salt } : null;
});

export type VisitorKey = { day: string; vh: string };

/** Tages-Besucher-Schlüssel des Aufrufers; null ohne IP oder Salz (dann wird nichts gezählt). */
export async function visitorKey(h: Headers): Promise<VisitorKey | null> {
  const ip = clientIp(h);
  if (!ip) return null;
  const s = await salts.get();
  const vh = s && visitorHash(s.salt, ip, h.get("user-agent") ?? "", s.day);
  return s && vh ? { day: s.day, vh } : null;
}

/** Land der Startseite: nur das Länderkürzel, das der Hoster aus der IP ableitet (Kopfzeile), GB → UK. */
export const countryFromHeaders = (h: Headers) => geoCountry(h.get("x-vercel-ip-country"));

export type Hit = {
  key: VisitorKey; stage: FunnelStage; country: string; pv?: string; slug?: string | null;
  device?: Device | null; src?: Source | null; ref?: string | null;
  /** Browserfamilie (nur die Klasse), utm_medium / utm_campaign (bereinigt) */
  browser?: Browser | null; um?: string | null; uc?: string | null;
};

/** Eine Zeile je Aufruf. Fehler werden geschluckt – Messung darf nie eine Seite oder einen Kauf stören. */
export async function recordHit(x: Hit): Promise<void> {
  try {
    await db().from("web_hits").insert({
      ...(x.pv ? { pv: x.pv } : {}), day: x.key.day, vh: x.key.vh, stage: x.stage, country: x.country,
      slug: x.slug ?? null, device: x.device ?? null, src: x.src ?? null, ref: x.ref ?? null,
      ...(x.browser ? { browser: x.browser } : {}), ...(x.um ? { utm_medium: x.um } : {}), ...(x.uc ? { utm_campaign: x.uc } : {}),
    });
  } catch {
    /* nie stören */
  }
}

/** Ende eines Aufrufs: sichtbare Sekunden und Scrolltiefe (nur innerhalb 6 h, siehe web_hit_end). */
export async function endHit(pv: string, ds: number, depth: number): Promise<void> {
  try {
    await db().rpc("web_hit_end", { p_pv: pv, p_dwell: ds, p_scroll: depth });
  } catch {
    /* nie stören */
  }
}

/**
 * Zählung (CTA, Formular, Video) bzw. Core Web Vitals eines Aufrufs – ohne Hash, ohne Aufruf-ID, nur Stufe, Land,
 * Seite und Messwert (web_events / web_vitals). Fehler werden geschluckt.
 */
export async function recordSignal(b: Extract<Beacon, { kind: "ev" | "vitals" }>, country: string, slug: string | null): Promise<void> {
  try {
    const day = berlinDay();
    if (b.kind === "ev") await db().from("web_events").insert({ day, stage: b.stage, country, slug, kind: b.ev });
    else await db().from("web_vitals").insert({ day, stage: b.stage, country, slug, device: b.device, lcp_ms: b.lcp, inp_ms: b.inp, cls_m: b.cls });
  } catch {
    /* nie stören */
  }
}

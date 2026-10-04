import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";
import { BUCKETS } from "@/lib/landing-buckets";
import { berlinDayKey, hashRand } from "@/lib/ab";

/**
 * Ladezeit (Inhaber 03.10.2026): öffentliche Seiten kommen aus dem Cache, nur Aufrufe mit persönlichen oder
 * einmaligen Suchparametern werden pro Aufruf gerendert.
 * - Landingpage /<land>/<zielgruppe> ohne Vorschau, ?r=, ?angefragt=, ?fehler=, ?schritt=, ?v= → zwischengespeicherte
 *   Fassung /<land>/<zielgruppe>/s/<eimer>. Der Eimer (= Variante im A/B-Test) ist fest je Besucher und Tag: Hash aus
 *   IP, Browser und deutschem Tag (A/B je Schritt, Inhaber 04.10.2026) – nur zur Auswahl, nichts gespeichert, kein
 *   Cookie. Ohne IP zufällig.
 * - Kontaktseiten mit ?gesendet= oder ?fehler= → dynamische Fassung /contact/q/<sprache> (sonst statisch).
 */
const LANDING_DYNAMIC = ["vorschau", "v", "angefragt", "fehler", "r", "schritt"];
/** Feste Seiten mit zwei Pfadteilen (keine Landingpages). */
const NOT_LANDING = new Set(["/fr/contact", "/de/kontakt"]);
const CONTACT: Record<string, string> = { "/contact": "en", "/fr/contact": "fr", "/de/kontakt": "de" };

/** Manifest des Antworten-Cockpits (nur mit Sitzung, sonst 404). */
const OWNER_MANIFEST = "/dashboard/antworten/manifest.webmanifest";

/** Kopfzeilen für den Inhaber-Bereich: nie indexieren, nie zwischenspeichern. */
const PRIVATE_HEADERS: Record<string, string> = {
  "X-Robots-Tag": "noindex, nofollow, noarchive",
  "Cache-Control": "private, no-store, max-age=0",
  "Referrer-Policy": "no-referrer",
};

export function proxy(req: NextRequest) {
  const { pathname, searchParams } = req.nextUrl;
  // Dashboard (Inhaber 03.10.2026: nur über /login erreichbar, nirgends verlinkt): ohne Sitzung zeigt die Seite selbst
  // eine normale 404; nur mit Sitzungs-Cookie kommen die privaten Kopfzeilen dazu, damit die Adresse nichts verrät.
  if (pathname === "/dashboard" || pathname.startsWith("/dashboard/")) {
    // Route-Handler (Manifest) laufen ohne das Dashboard-Layout: ohne gültige Sitzung auf eine nicht vorhandene
    // Dashboard-Seite umschreiben, damit dieselbe normale 404 kommt wie überall im Dashboard (Review 04.10.2026)
    if (pathname === OWNER_MANIFEST && !verifySession(req.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET?.trim())) {
      const url = req.nextUrl.clone();
      url.pathname = "/dashboard/antworten/manifest";
      return NextResponse.rewrite(url);
    }
    const res = NextResponse.next();
    if (req.cookies.has(SESSION_COOKIE)) for (const [k, v] of Object.entries(PRIVATE_HEADERS)) res.headers.set(k, v);
    return res;
  }
  const contactLang = CONTACT[pathname];
  if (contactLang) {
    if (!searchParams.has("gesendet") && !searchParams.has("fehler")) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = `/contact/q/${contactLang}`;
    return NextResponse.rewrite(url);
  }
  if (NOT_LANDING.has(pathname) || !/^\/[a-z]{2}\/[a-z0-9-]+$/.test(pathname)) return NextResponse.next();
  if (LANDING_DYNAMIC.some((k) => searchParams.has(k))) return NextResponse.next();
  const url = req.nextUrl.clone();
  url.pathname = `${pathname}/s/${landingBucket(req)}`;
  return NextResponse.rewrite(url);
}

/** Eimer 0 … BUCKETS-1 fest je Besucher und Tag (IP|Browser|Tag, gehasht, nie gespeichert); ohne IP zufällig. */
function landingBucket(req: { headers: { get(name: string): string | null } }, rand: () => number = Math.random): number {
  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || (req.headers.get("x-real-ip") ?? "").trim();
  const r = ip ? hashRand(`v:${ip}|${(req.headers.get("user-agent") ?? "").slice(0, 200)}|${berlinDayKey()}`) : rand();
  return Math.min(BUCKETS - 1, Math.floor(r * BUCKETS));
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/:country([a-z]{2})/:segment([a-z0-9-]+)",
    { source: "/contact", has: [{ type: "query", key: "gesendet" }] },
    { source: "/contact", has: [{ type: "query", key: "fehler" }] },
  ],
};

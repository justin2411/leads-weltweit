import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth";
import { BUCKETS } from "@/lib/landing-buckets";

/**
 * Ladezeit (Inhaber 03.10.2026): öffentliche Seiten kommen aus dem Cache, nur Aufrufe mit persönlichen oder
 * einmaligen Suchparametern werden pro Aufruf gerendert.
 * - Landingpage /<land>/<zielgruppe> ohne Vorschau, ?r=, ?angefragt=, ?fehler=, ?schritt=, ?v= → zwischengespeicherte
 *   Fassung /<land>/<zielgruppe>/s/<eimer>; der Eimer wird je Aufruf zufällig gezogen (A/B-Test bleibt je Aufruf verteilt).
 * - Kontaktseiten mit ?gesendet= oder ?fehler= → dynamische Fassung /contact/q/<sprache> (sonst statisch).
 */
const LANDING_DYNAMIC = ["vorschau", "v", "angefragt", "fehler", "r", "schritt"];
/** Feste Seiten mit zwei Pfadteilen (keine Landingpages). */
const NOT_LANDING = new Set(["/fr/contact", "/de/kontakt"]);
const CONTACT: Record<string, string> = { "/contact": "en", "/fr/contact": "fr", "/de/kontakt": "de" };

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
  url.pathname = `${pathname}/s/${Math.floor(Math.random() * BUCKETS)}`;
  return NextResponse.rewrite(url);
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

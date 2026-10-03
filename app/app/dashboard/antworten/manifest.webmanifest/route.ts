import type { NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth";

/**
 * Web-App-Manifest nur für das Inhaber-Dashboard („Zum Home-Bildschirm“, nötig für Push auf dem iPhone).
 * Bewusst nicht als app/manifest.ts: das würde auf jeder öffentlichen Seite verlinkt und die Dashboard-Adresse
 * verraten (Inhaber 03.10.2026: Dashboard nirgends verlinkt). Verlinkt wird es nur von push-alarm.tsx, und zwar mit
 * crossorigin="use-credentials", damit der Browser das Sitzungs-Cookie mitschickt.
 * Ohne gültige Sitzung: 404 wie jede andere Dashboard-Adresse (proxy.ts schreibt solche Aufrufe auf eine nicht
 * vorhandene Dashboard-Seite um – dieselbe 404-Seite; die Prüfung hier ist die zweite Absicherung).
 */
export const dynamic = "force-dynamic";

export function GET(req: NextRequest) {
  if (!verifySession(req.cookies.get(SESSION_COOKIE)?.value, process.env.SESSION_SECRET?.trim())) {
    return new Response("Not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
  }
  const manifest = {
    name: "NextGen Profit",
    short_name: "NextGen",
    id: "/dashboard/antworten",
    start_url: "/dashboard/antworten",
    scope: "/dashboard/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#02060f",
    theme_color: "#0a1a33",
    lang: "de",
    icons: [
      { src: "/apple-icon.png", sizes: "180x180", type: "image/png", purpose: "any" },
      { src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any" },
    ],
  };
  return new Response(JSON.stringify(manifest), {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "private, no-store, max-age=0",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

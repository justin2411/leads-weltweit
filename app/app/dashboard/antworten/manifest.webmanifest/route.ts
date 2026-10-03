/**
 * Web-App-Manifest nur für das Inhaber-Dashboard („Zum Home-Bildschirm“, nötig für Push auf dem iPhone).
 * Bewusst nicht als app/manifest.ts: das würde auf jeder öffentlichen Seite verlinkt und die Dashboard-Adresse
 * verraten (Inhaber 03.10.2026: Dashboard nirgends verlinkt). Verlinkt wird es nur von push-alarm.tsx.
 * Ohne Login abrufbar, weil Browser Manifeste ohne Cookies laden; es enthält nur Name, Farben und Startseite.
 */
export const dynamic = "force-static";

export function GET() {
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
      "Cache-Control": "public, max-age=3600",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}

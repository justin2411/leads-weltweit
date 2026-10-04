/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      // Seiten-CSS (app/css/[file]): Dateiname enthält die Prüfsumme, daher dauerhaft im Browser cachebar
      { source: "/css/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
      // Videos, Vorschaubilder und Karten (public/): Namen tragen meist eine Fassung (v7-…, -v2), daher 1 Tag im Browser
      // und danach im Hintergrund erneuern statt bei jedem Aufruf neu nachzufragen (Ladezeit-Check 04.10.2026)
      ...["/video/:file*", "/maps/:file*"].map((source) => ({
        source,
        headers: [{ key: "Cache-Control", value: "public, max-age=86400, stale-while-revalidate=604800" }],
      })),
      // Inhaber-Anmeldung: nie indexieren, nie zwischenspeichern (nicht in robots.txt, damit die Adresse geheim bleibt).
      // /dashboard bekommt dieselben Kopfzeilen in proxy.ts – nur mit Sitzungs-Cookie, ohne Cookie ist es eine normale 404.
      ...["/login"].map((source) => ({
        source,
        headers: [
          { key: "X-Robots-Tag", value: "noindex, nofollow, noarchive" },
          { key: "Cache-Control", value: "private, no-store, max-age=0" },
          { key: "Referrer-Policy", value: "no-referrer" },
        ],
      })),
    ];
  },
};
export default nextConfig;

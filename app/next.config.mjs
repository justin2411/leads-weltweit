/** @type {import('next').NextConfig} */
const nextConfig = {
  poweredByHeader: false,
  async headers() {
    return [
      // Seiten-CSS (app/css/[file]): Dateiname enthält die Prüfsumme, daher dauerhaft im Browser cachebar
      { source: "/css/:file*", headers: [{ key: "Cache-Control", value: "public, max-age=31536000, immutable" }] },
    ];
  },
};
export default nextConfig;

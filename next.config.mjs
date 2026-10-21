/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  // Chrome du serveur pour fabriquer les PDF (/api/pdf) : chargé tel quel, sans passer par le bundler.
  serverExternalPackages: ["@sparticuz/chromium", "puppeteer-core"],
  outputFileTracingIncludes: { "/api/pdf": ["./node_modules/@sparticuz/chromium/bin/**"] },
  // Le Studio a été retiré : les anciens liens (raccourci de l'appli installée) ramènent à l'accueil.
  async redirects() {
    return [{ source: "/studio/:path*", destination: "/", permanent: false }];
  },
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
      // Fiche de renseignements publique : jamais dans une autre page, jamais en cache, lien secret jamais transmis.
      {
        source: "/renseignements/:path*",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Robots-Tag", value: "noindex, nofollow" },
          { key: "Cache-Control", value: "no-store" },
          { key: "X-Content-Type-Options", value: "nosniff" },
        ],
      },
    ];
  },
};
export default nextConfig;

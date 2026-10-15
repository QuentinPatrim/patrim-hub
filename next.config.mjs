/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  images: { unoptimized: true },
  // Le Studio a été retiré : les anciens liens (raccourci de l'appli installée) ramènent à l'accueil.
  async redirects() {
    return [{ source: "/studio/:path*", destination: "/", permanent: false }];
  },
  async headers() {
    return [
      { source: "/sw.js", headers: [{ key: "Cache-Control", value: "no-cache" }, { key: "Service-Worker-Allowed", value: "/" }] },
    ];
  },
};
export default nextConfig;

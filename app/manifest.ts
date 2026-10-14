import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PATRIM Hub",
    short_name: "PATRIM",
    description: "L'espace de vente de l'agence PATRIM : biens, acquéreurs, visites, estimations et marketing.",
    start_url: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0e1014",
    theme_color: "#6c191e",
    lang: "fr",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Nouveau contact", url: "/contacts?nouveau=1" },
      { name: "Estimation express", url: "/estimations/nouvelle" },
      { name: "Studio marketing", url: "/studio" },
    ],
  };
}

import { NextResponse } from "next/server";
import { geocode } from "@/lib/dvf";
import { getAddressPhoto } from "@/lib/photoAdresse";

/* GET /api/photo-adresse?q=adresse | ?lat=…&lon=…  [&v=n° de vue] [&mode=aerien] [&w=largeur]
   Photo automatique d'une adresse quand un bien n'a aucune photo :
   vue de rue Panoramax, sinon vue aérienne IGN (données ouvertes, sans clé).
   Appelée directement par les balises <img> (pas d'en-tête de connexion possible) :
   elle ne renvoie que des images publiques d'une adresse et ne lit aucune donnée du Hub.
   Le résultat est gardé en cache par Vercel, une adresse n'est calculée qu'une fois. */

export const maxDuration = 30;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let lat = Number(searchParams.get("lat"));
  let lon = Number(searchParams.get("lon"));
  const q = (searchParams.get("q") || "").trim().slice(0, 200);
  const variant = Math.min(20, Math.max(0, Math.floor(Number(searchParams.get("v")) || 0)));
  const mode = searchParams.get("mode") === "aerien" ? "aerien" : "auto";
  const largeur = Number(searchParams.get("w")) <= 700 ? 600 : 1200;

  try {
    if (!Number.isFinite(lat) || !Number.isFinite(lon) || !searchParams.get("lat") || (lat === 0 && lon === 0)) {
      if (!q) return NextResponse.json({ error: "Adresse manquante." }, { status: 400 });
      const found = await geocode(q);
      if (!found) return NextResponse.json({ error: "Adresse introuvable." }, { status: 404 });
      lat = found.lat;
      lon = found.lon;
    }
    // France métropolitaine (les sources Panoramax et IGN utilisées ne couvrent pas au-delà)
    if (lat < 41 || lat > 51.5 || lon < -5.5 || lon > 10) {
      return NextResponse.json({ error: "Adresse hors de France métropolitaine." }, { status: 400 });
    }

    const photo = await getAddressPhoto(lat, lon, variant, mode, largeur);
    return new NextResponse(new Uint8Array(photo.buffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "public, max-age=86400, s-maxage=2592000, stale-while-revalidate=604800",
        "X-Photo-Source": photo.source,
        "X-Photo-Credit": encodeURIComponent(photo.credit),
        "X-Photo-Variant": String(photo.variant),
        "X-Photo-Variants": String(photo.variants),
      },
    });
  } catch (error) {
    console.error("Erreur photo adresse :", error);
    return NextResponse.json({ error: "Aucune photo n'a pu être récupérée pour cette adresse." }, { status: 502 });
  }
}

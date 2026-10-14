import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/ai-server";

/* GET /api/estimation/adresse?q=…  (ou ?lat=…&lon=… pour l'adresse d'une position)
   Suggestions d'adresses (Géoplateforme IGN, repli Base Adresse Nationale),
   centrées sur Toulouse. → { suggestions: [{ label, rue, codePostal, ville, citycode, lat, lon }] } */

export const maxDuration = 15;

type Feature = {
  geometry?: { coordinates?: [number, number] };
  properties?: { label?: string; name?: string; postcode?: string; city?: string; citycode?: string; type?: string };
};

async function fetchJson(url: string, timeout = 4000) {
  const c = new AbortController();
  const t = setTimeout(() => c.abort(), timeout);
  try {
    const res = await fetch(url, { signal: c.signal, cache: "no-store" });
    if (!res.ok) throw new Error(String(res.status));
    return (await res.json()) as { features?: Feature[] };
  } finally {
    clearTimeout(t);
  }
}

export async function GET(req: Request) {
  const denied = await checkAccess(req);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const lat = Number(sp.get("lat"));
  const lon = Number(sp.get("lon"));
  const q = sp.get("q")?.trim() ?? "";
  let endpoints: string[];
  if (sp.has("lat") && sp.has("lon") && Number.isFinite(lat) && Number.isFinite(lon)) {
    // Adresse la plus proche d'une position (bouton « Je suis sur place »)
    endpoints = [
      `https://data.geopf.fr/geocodage/reverse?lon=${lon}&lat=${lat}&limit=3&index=address`,
      `https://api-adresse.data.gouv.fr/reverse/?lon=${lon}&lat=${lat}&limit=3`,
    ];
  } else {
    if (q.length < 3) return NextResponse.json({ suggestions: [] });
    const enc = encodeURIComponent(q.slice(0, 200));
    const bias = "&lat=43.6045&lon=1.4440";
    endpoints = [
      `https://data.geopf.fr/geocodage/search?q=${enc}&limit=6&autocomplete=1${bias}`,
      `https://api-adresse.data.gouv.fr/search/?q=${enc}&limit=6&autocomplete=1${bias}`,
    ];
  }
  for (const url of endpoints) {
    try {
      const data = await fetchJson(url);
      const suggestions = (data.features ?? [])
        .filter((f) => f.geometry?.coordinates && f.properties?.label)
        .map((f) => ({
          label: f.properties!.label!,
          rue: f.properties!.name ?? "",
          codePostal: f.properties!.postcode ?? "",
          ville: f.properties!.city ?? "",
          citycode: f.properties!.citycode ?? "",
          lon: f.geometry!.coordinates![0],
          lat: f.geometry!.coordinates![1],
          precis: f.properties!.type === "housenumber",
        }));
      return NextResponse.json({ suggestions });
    } catch {
      /* service suivant */
    }
  }
  return NextResponse.json({ suggestions: [], error: "Recherche d'adresse indisponible pour le moment." });
}

import { NextResponse } from "next/server";
import { checkAccess } from "@/lib/ai-server";
import { searchDvfComparables } from "@/lib/dvf";

/* POST /api/estimation/comparables
   { adresse, surface, type, pieces?, rayon? }
   → { centre, annees, rayon, statistiques, ventes, message? }
   Ventes réelles DVF (data.gouv.fr) autour du bien. */

export const maxDuration = 60;

export async function POST(req: Request) {
  const denied = await checkAccess(req);
  if (denied) return NextResponse.json({ error: denied }, { status: 401 });

  try {
    const b = await req.json().catch(() => ({}));
    const adresse = String(b?.adresse ?? "").trim();
    const surface = Number(b?.surface);
    if (!adresse || !surface || surface <= 0) {
      return NextResponse.json({ error: "Indiquez l'adresse et la surface du bien avant de chercher les ventes." }, { status: 400 });
    }
    const rayon = Math.min(Math.max(Math.round(Number(b?.rayon) || 500), 100), 3000);
    const type = String(b?.type ?? "appartement");

    const result = await searchDvfComparables({
      address: adresse,
      surface,
      propertyType: type.toLowerCase().includes("maison") ? "Maison" : "Appartement",
      radius: rayon,
      rooms: Math.max(0, Math.round(Number(b?.pieces) || 0)),
      surfaceTolerance: type.toLowerCase().includes("maison") ? 0.3 : 0.25,
      limit: 80,
    });

    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });

    const debut = result.years[0];
    return NextResponse.json({
      centre: result.center,
      annees: result.years,
      rayon,
      statistiques: result.stats,
      ventes: result.sales,
      message:
        result.sales.length === 0
          ? `Aucune vente comparable dans un rayon de ${rayon} m${debut ? ` depuis ${debut}` : ""}. Élargissez le rayon.`
          : undefined,
    });
  } catch (e) {
    console.error("Estimation – ventes DVF :", e);
    return NextResponse.json({ error: "La recherche des ventes n'a pas abouti. Réessayez dans un instant." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { utilisateur } from "@/lib/auth-server";

/* GET /api/mandats : fiches complètes des mandats (propriétaires, charges, DDT, photos…).
   Ces données privées sont rangées dans la variable Vercel MANDATS_JSON, jamais dans le code
   (le dépôt peut être public). Réservé à l'utilisateur connecté. */

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await utilisateur(req))) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  try {
    const mandats = JSON.parse(process.env.MANDATS_JSON || "[]");
    return NextResponse.json({ mandats: Array.isArray(mandats) ? mandats : [] });
  } catch {
    return NextResponse.json({ error: "MANDATS_JSON illisible" }, { status: 500 });
  }
}

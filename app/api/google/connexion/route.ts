import { NextResponse } from "next/server";
import { utilisateur } from "@/lib/auth-server";
import { googleConfigure, urlAutorisation } from "@/lib/google-server";

/* POST /api/google/connexion : adresse de la page Google où l'utilisateur connecté autorise le Hub. */

export async function POST(req: Request) {
  const u = await utilisateur(req);
  if (!u) return NextResponse.json({ error: "Session expirée, reconnecte-toi." }, { status: 401 });
  if (!googleConfigure()) return NextResponse.json({ error: "La connexion Google n'est pas encore réglée (codes à mettre dans Vercel)." }, { status: 501 });
  return NextResponse.json({ url: urlAutorisation(req, u.id, u.email ?? undefined) });
}

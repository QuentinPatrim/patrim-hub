import { NextResponse } from "next/server";
import { utilisateur } from "@/lib/auth-server";

/* GET /api/mandats : fiches complètes des mandats (propriétaires, charges, DDT, photos…).
   Ces données privées sont rangées dans les variables Vercel MANDATS_JSON (base) et MANDATS_AJOUTS
   (nouveaux mandats ou corrections, qui remplacent la fiche du même propriétaire), jamais dans le code
   (le dépôt peut être public). Réservé à l'utilisateur connecté. */

export const dynamic = "force-dynamic";

type Fiche = { proprietaire?: string; ref?: string; adresse?: string };

const lire = (nom: string): Fiche[] => {
  const v = JSON.parse(process.env[nom] || "[]");
  return Array.isArray(v) ? v : [];
};

export async function GET(req: Request) {
  if (!(await utilisateur(req))) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  try {
    const cle = (f: Fiche) => (f.proprietaire || f.ref || f.adresse || "").toLowerCase();
    const parCle = new Map<string, Fiche>();
    for (const f of [...lire("MANDATS_JSON"), ...lire("MANDATS_AJOUTS")]) parCle.set(cle(f) || String(parCle.size), f);
    return NextResponse.json({ mandats: [...parCle.values()] });
  } catch {
    return NextResponse.json({ error: "Variables des mandats illisibles" }, { status: 500 });
  }
}

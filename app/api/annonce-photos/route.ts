import { NextResponse } from "next/server";
import { utilisateur } from "@/lib/auth-server";

/* GET /api/annonce-photos?url=… : toutes les photos (taille réelle) d'une annonce du site patrim.fr,
   lues directement dans la page pour ne jamais recopier une adresse à la main. */

export const dynamic = "force-dynamic";

const PHOTO = /https?:\/\/www\.patrim\.fr\/photobox\/[^"'()\s<>]+?\/transaction\/photo\/(?!vignettes\/)[^"'()\s<>/]+?\.(?:jpe?g|png|webp)/gi;

export async function GET(req: Request) {
  if (!(await utilisateur(req))) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  const url = new URL(req.url).searchParams.get("url") || "";
  if (!/^https:\/\/www\.patrim\.fr\/[\w-]+$/i.test(url)) return NextResponse.json({ error: "Adresse d'annonce patrim.fr attendue" }, { status: 400 });
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 PATRIM Hub" }, cache: "no-store" });
    if (!r.ok) return NextResponse.json({ photos: [], error: `Annonce introuvable (${r.status})` });
    const html = (await r.text()).replace(/&amp;/g, "&");
    const photos = [...new Set(html.match(PHOTO) ?? [])];
    return NextResponse.json({ photos });
  } catch (e) {
    return NextResponse.json({ photos: [], error: e instanceof Error ? e.message : "Site injoignable" });
  }
}

import { NextResponse } from "next/server";
import { utilisateur } from "@/lib/auth-server";

/* GET /api/annonces-site : toutes les annonces de vente en ligne sur patrim.fr.
   La page de résultats du site est chargée en JavaScript ; on interroge donc directement les fiches
   par référence (le reste de l'adresse est ignoré par le site) et on lit titre, prix et photos. */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export type AnnonceSite = { ref: string; url: string; titre: string; type: string; ville: string; surface?: number; prix?: number; photos: string[] };

const PLAGES: [string, number, number][] = [
  ["TAPP", 99900, 99999],
  ["TMAI", 99400, 99499],
];
const PHOTO = /https?:\/\/www\.patrim\.fr\/photobox\/[^"'()\s<>]+?\/transaction\/photo\/(?!vignettes\/)[^"'()\s<>/]+?\.(?:jpe?g|png|webp)/gi;
let cache: { quand: number; annonces: AnnonceSite[] } | null = null;

const nombre = (s?: string) => (s ? Number(s.replace(/[^\d,]/g, "").replace(",", ".")) || undefined : undefined);

async function lire(ref: string): Promise<AnnonceSite | null> {
  const url = `https://www.patrim.fr/vente-bien-${ref}`;
  try {
    const r = await fetch(url, { headers: { "user-agent": "Mozilla/5.0 PATRIM Hub" }, cache: "no-store", signal: AbortSignal.timeout(8000) });
    if (!r.ok) return null;
    const html = (await r.text()).replace(/&amp;/g, "&").replace(/&nbsp;|&#160;/g, " ");
    const titre = html.match(/<title>([^<]*)<\/title>/i)?.[1]?.trim() ?? "";
    if (!titre.includes(ref)) return null;
    const m = titre.match(/^(\S+).*?de\s+([\d.,]+)\s*m.*?\sà\s+(.+?)\s+propos/i);
    const prix = html.match(/([\d][\d\s .]*)\s*€\s*-\s*Ref/i)?.[1];
    return {
      ref,
      url,
      titre: titre.replace(/\s*proposé par.*$/i, ""),
      type: (m?.[1] ?? "").toLowerCase(),
      ville: m?.[3] ?? "",
      surface: nombre(m?.[2]),
      prix: nombre(prix),
      photos: [...new Set(html.match(PHOTO) ?? [])].slice(0, 24),
    };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  if (!(await utilisateur(req))) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  if (cache && Date.now() - cache.quand < 30 * 60_000) return NextResponse.json({ annonces: cache.annonces });
  const refs = PLAGES.flatMap(([p, a, b]) => Array.from({ length: b - a + 1 }, (_, i) => `${p}${a + i}`));
  const annonces: AnnonceSite[] = [];
  for (let i = 0; i < refs.length; i += 25) {
    const lot = await Promise.all(refs.slice(i, i + 25).map(lire));
    annonces.push(...lot.filter((x): x is AnnonceSite => !!x));
  }
  cache = { quand: Date.now(), annonces };
  return NextResponse.json({ annonces });
}

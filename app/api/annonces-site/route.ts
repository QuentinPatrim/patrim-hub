import { NextResponse } from "next/server";
import { utilisateur } from "@/lib/auth-server";
import { photosDansPage } from "@/lib/patrim-site";

/* GET /api/annonces-site : toutes les annonces de vente en ligne sur patrim.fr.
   La page de résultats du site est chargée en JavaScript ; on interroge donc directement les fiches
   par référence (le reste de l'adresse est ignoré par le site) et on lit titre, prix et photos. */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export type AnnonceSite = {
  ref: string; url: string; titre: string; type: string; ville: string; quartier?: string; surface?: number; prix?: number; netVendeur?: number;
  pieces?: number; chambres?: number; etage?: number; ascenseur?: boolean; dpe?: string; ges?: string; description?: string; photos: string[];
};

const ENTITES: Record<string, string> = { "&eacute;": "é", "&egrave;": "è", "&ecirc;": "ê", "&agrave;": "à", "&acirc;": "â", "&ccedil;": "ç", "&ocirc;": "ô", "&ucirc;": "û", "&icirc;": "î", "&euro;": "€", "&rsquo;": "'", "&#039;": "'", "&quot;": '"', "&laquo;": "«", "&raquo;": "»", "&sup2;": "²" };
const decoder = (t: string) => t.replace(/&[a-z#0-9]+;/gi, (e) => ENTITES[e] ?? (e.startsWith("&#") ? String.fromCharCode(Number(e.slice(2, -1))) : " "));
const texteDe = (html: string) => decoder(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t\u00a0\u202f]+/g, " ");
const meta = (html: string, nom: string) => html.match(new RegExp(`<meta[^>]+(?:name|property)=["']${nom}["'][^>]*content=["']([^"']*)`, "i"))?.[1];

const PLAGES: [string, number, number][] = [
  ["TAPP", 99800, 99999],
  ["TMAI", 99350, 99499],
];
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
    const texte = texteDe(html);
    const prix = texte.match(/(?<![\w.,])(\d{1,3}(?:[ .]\d{3})+|\d{4,})\s*€\s*-\s*Ref/i)?.[1] ?? texte.match(/Prix\s*:?\s*(?<![\w.,])(\d{1,3}(?:[ .]\d{3})+|\d{4,})\s*€/i)?.[1];
    const net = texte.match(/(?<![\w.,])(\d{1,3}(?:[ .]\d{3})+|\d{4,})\s*€\s*net vendeur/i)?.[1] ?? texte.match(/net vendeur[^\d]{0,20}(?<![\w.,])(\d{1,3}(?:[ .]\d{3})+|\d{4,})\s*€/i)?.[1];
    const metas = [meta(html, "description"), meta(html, "og:description")].filter(Boolean).map((d) => decoder(d!));
    const para = texte.split(/\n+/).map((l) => l.trim()).filter((l) => /^[^:]{3,60}:\s/.test(l) && l.length > 120).sort((a, b) => b.length - a.length)[0];
    const description = [para, ...metas].filter(Boolean).sort((a, b) => b!.length - a!.length)[0];
    const quartier = description?.match(/^([^:]{3,60}?)\s*:/)?.[1]?.trim();
    const dpe = html.match(/dpe-([A-G])-\d+-([A-G])/i);
    const nb = (re: RegExp) => Number(texte.match(re)?.[1]) || undefined;
    const photos = photosDansPage(html);
    if (!photos.length) {
      const i = html.search(/photo/i);
      console.warn(`[annonces-site] ${ref} sans photo, html ${html.length} car., extrait : ${html.slice(Math.max(0, i - 200), i + 400).replace(/\s+/g, " ")}`);
    }
    return {
      ref,
      url,
      titre: titre.replace(/\s*proposé par.*$/i, ""),
      type: (m?.[1] ?? "").toLowerCase(),
      ville: m?.[3] ?? "",
      surface: nombre(m?.[2]),
      prix: nombre(prix),
      netVendeur: nombre(net),
      quartier,
      description,
      pieces: nb(/(\d+)\s*pi[eè]ces?/i),
      chambres: nb(/chambres?\s*:?\s*(\d+)/i) ?? nb(/(\d+)\s*chambres?/i),
      etage: nb(/[ée]tage\s*:?\s*(\d+)/i),
      ascenseur: /ascenseur\s*:?\s*oui/i.test(texte) || undefined,
      dpe: dpe?.[1]?.toUpperCase(),
      ges: dpe?.[2]?.toUpperCase(),
      photos,
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
  for (let i = 0; i < refs.length; i += 50) {
    const lot = await Promise.all(refs.slice(i, i + 50).map(lire));
    annonces.push(...lot.filter((x): x is AnnonceSite => !!x));
  }
  cache = { quand: Date.now(), annonces };
  return NextResponse.json({ annonces });
}

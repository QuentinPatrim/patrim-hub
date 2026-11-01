import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { roleEquipe, utilisateur } from "@/lib/auth-server";
import { cleServiceSupabase } from "@/lib/env";
import { photosDansPage } from "@/lib/patrim-site";
import { bienDepuisAnnonce, horsLigne, memeLogement, refSite, type AnnonceLocation, type BilanActualisation } from "@/components/location/site";
import type { BienLocation } from "@/components/location/bienLocation";
import type { BienType, ClasseDpe } from "@/lib/types";

/* Annonces de location en ligne sur patrim.fr → biens du Hub Location, communs à toute l'équipe.
   POST : bouton « Actualiser » (n'importe quel membre de l'équipe).
   GET  : tâche planifiée Vercel (CRON_SECRET), chaque matin.
   Avec Supabase, le serveur écrit lui-même les biens (au nom du titulaire) : tout le monde voit la même liste.
   Sans Supabase, il renvoie seulement les annonces ; le navigateur les range. */

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SITE = "https://www.patrim.fr";
const UA = { "user-agent": "Mozilla/5.0 PATRIM Hub" };
const ENTITES: Record<string, string> = { "&eacute;": "é", "&egrave;": "è", "&ecirc;": "ê", "&agrave;": "à", "&acirc;": "â", "&ccedil;": "ç", "&ocirc;": "ô", "&ucirc;": "û", "&icirc;": "î", "&euro;": "€", "&rsquo;": "'", "&#039;": "'", "&quot;": '"', "&sup2;": "²", "&nbsp;": " " };
const decoder = (t: string) => t.replace(/&[a-z#0-9]+;/gi, (e) => ENTITES[e] ?? (e.startsWith("&#") ? String.fromCharCode(Number(e.slice(2, -1))) : " "));
const texteDe = (html: string) => decoder(html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ").replace(/<br\s*\/?>/gi, "\n").replace(/<\/(p|li|h\d|div)>/gi, "\n").replace(/<[^>]+>/g, " ")).replace(/[ \t  ]+/g, " ");
const montant = (s?: string) => (s ? Number(s.replace(/[\s.]/g, "").replace(",", ".")) || undefined : undefined);
const entier = (s?: string) => (s ? Number(s) || undefined : undefined);

const TYPES: Record<string, BienType> = { appartement: "appartement", maison: "maison", parking: "parking", terrain: "terrain", immeuble: "immeuble" };

function enTete(desc?: string) {
  const e = desc?.match(/^([^:]{3,70}?)\s*:/)?.[1];
  if (!e) return {};
  const [q, r] = e.split("/").map((x) => x.trim());
  const joli = (t: string) =>
    t === t.toUpperCase() ? t.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, c: string) => a + c.toUpperCase()).replace(/\s(De|Des|Du|La|Le|Les|Et)(?=\s)/g, (m) => m.toLowerCase()) : t;
  return {
    quartier: q && q.length <= 40 && !/\d/.test(q) ? joli(q) : undefined,
    rue: r && /^(rue|avenue|av\.|all[ée]es?|boulevard|bd|place|chemin|impasse|route|quai|cours|faubourg|square|esplanade)\b/i.test(r) ? r : undefined,
  };
}

async function lireAnnonce(slug: string, ref: string): Promise<AnnonceLocation | null> {
  const url = `${SITE}/${slug}`;
  try {
    const r = await fetch(url, { headers: UA, cache: "no-store", signal: AbortSignal.timeout(10000) });
    if (!r.ok) return null;
    const html = (await r.text()).replace(/&amp;/g, "&");
    const texte = texteDe(html);
    const titrePage = decoder(html.match(/<title>([^<]*)<\/title>/i)?.[1] ?? "");
    const h2 = html.match(/<h2[^>]*class="titre"[^>]*>([\s\S]*?)<\/h2>/i)?.[1];
    const titre = (h2 ? decoder(h2.replace(/<sup>m&sup2;<\/sup>|<sup>m²<\/sup>/gi, "m²").replace(/<[^>]+>/g, "")) : titrePage.replace(/\s*propos.*$/i, "")).replace(/\s+/g, " ").trim();
    const genre = slug.split("-")[1] ?? "";
    const lignes = texte.split(/\n+/).map((l) => l.trim());
    const description = lignes.filter((l) => /^[^:]{3,70}:\s/.test(l) && l.length > 80 && !/^Loyer de|cookie|disque dur|navigat|terminal|g[ée]orisques/i.test(l)).sort((a, b) => b.length - a.length)[0];
    const dpe = html.match(/dpe-([A-G])-\d+-([A-G])/i);
    const meuble = texte.match(/Meubl[ée]\s*:\s*(Oui|Non)/i)?.[1];
    return {
      ref,
      url,
      titre: titre || titrePage,
      type: TYPES[genre] ?? "local",
      ville: titrePage.match(/.*\sà\s+(.+?)\s+propos/i)?.[1]?.trim() ?? "", // dernier « à » : « Parking à louer à Balma »
      ...enTete(description),
      surface: entier(texte.match(/Surface Habitable\s*:\s*(\d+)/i)?.[1] ?? texte.match(/Surface\s*:\s*(\d+)/i)?.[1]),
      pieces: entier(texte.match(/Nombre de pi[eè]ce\(s\)\s*:\s*(\d+)/i)?.[1]),
      chambres: entier(texte.match(/(\d+)\s+Chambres?\b/)?.[1]),
      etage: entier(texte.match(/Num[ée]ro Etage\s*:\s*(\d+)/i)?.[1]),
      nbEtages: entier(texte.match(/Nombre d'[ée]tage\(s\)\s*:\s*(\d+)/i)?.[1]),
      loyerCC: montant(texte.match(/Loyer de\s+([\d\s.,]+?)\s*€/i)?.[1]),
      charges: montant(texte.match(/Charges\s*:\s*([\d\s.,]+?)\s*€/i)?.[1]),
      depot: montant(texte.match(/D[ée]p[ôo]t de garantie\s*:\s*([\d\s.,]+?)\s*€/i)?.[1]),
      honoraires: montant(texte.match(/Honoraires de location\s*:\s*([\d\s.,]+?)\s*€/i)?.[1]),
      meuble: meuble ? /oui/i.test(meuble) : undefined,
      dpe: dpe?.[1]?.toUpperCase() as ClasseDpe | undefined,
      ges: dpe?.[2]?.toUpperCase() as ClasseDpe | undefined,
      description,
      photos: photosDansPage(html),
    };
  } catch {
    return null;
  }
}

/** Toutes les annonces de location en ligne, ou null si le site ne répond pas (rien n'est alors marqué hors ligne). */
async function annoncesEnLigne(): Promise<AnnonceLocation[] | null> {
  const r = await fetch(`${SITE}/resultats?transac=location`, { headers: UA, cache: "no-store", signal: AbortSignal.timeout(15000) }).catch(() => null);
  if (!r?.ok) return null;
  const html = await r.text();
  const liens = new Map<string, string>();
  for (const m of html.matchAll(/\b(location-[a-z_0-9-]+?-(GES\d+)_(\d+))\b/gi)) liens.set(`${m[2]}-${m[3]}`, m[1]);
  if (!liens.size) return null;
  const lues = await Promise.all([...liens].map(([ref, slug]) => lireAnnonce(slug, ref)));
  const ok = lues.filter((a): a is AnnonceLocation => !!a);
  return ok.length ? ok : null;
}

async function synchroniser(): Promise<NextResponse> {
  const annonces = await annoncesEnLigne();
  if (!annonces) return NextResponse.json({ error: "Le site patrim.fr ne répond pas pour l'instant. Réessayez dans quelques minutes." }, { status: 502 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const service = cleServiceSupabase();
  if (!url || !service) return NextResponse.json({ annonces });

  const db = createClient(url, service, { auth: { persistSession: false } });
  const { data: titulaire } = await db.from("hub_equipe").select("user_id").eq("role", "titulaire").limit(1).maybeSingle();
  const { data: rows, error } = await db.from("hub_docs").select("id,user_id,data").eq("kind", "biens").eq("data->>transaction", "location").limit(5000);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const proprio = (titulaire as { user_id: string } | null)?.user_id;
  if (!proprio) return NextResponse.json({ error: "Aucun titulaire dans l'équipe" }, { status: 500 });

  const existants = new Map<string, { id: string; user_id: string; data: BienLocation }>();
  const sansAnnonce = new Map<string, { id: string; user_id: string; data: BienLocation }>();
  for (const r of (rows ?? []) as { id: string; user_id: string; data: BienLocation }[]) {
    if (!refSite(r.data)) sansAnnonce.set(r.id, r);
    const ref = refSite(r.data);
    if (ref) existants.set(ref, r);
  }
  const now = new Date().toISOString();
  const bilan: BilanActualisation = { ajoutes: 0, misAJour: 0, horsLigne: 0, total: annonces.length };
  const ecrire: { id: string; user_id: string; kind: string; data: BienLocation; updated_at: string }[] = [];
  for (const a of annonces) {
    // Même référence, sinon le même logement suivi avant sa mise en ligne (liste loc, Gestion)
    let avant = existants.get(a.ref);
    if (!avant) {
      const m = memeLogement(a, [...sansAnnonce.values()].map((r) => ({ ...r.data, id: r.id })));
      if (m) {
        avant = sansAnnonce.get(m.id);
        sansAnnonce.delete(m.id);
      }
    }
    const id = avant?.id ?? crypto.randomUUID();
    const data = { ...bienDepuisAnnonce(a, avant?.data, now), id, createdAt: avant?.data.createdAt ?? now, updatedAt: now } as BienLocation;
    ecrire.push({ id, user_id: avant?.user_id ?? proprio, kind: "biens", data, updated_at: now });
    if (avant) bilan.misAJour++;
    else bilan.ajoutes++;
  }
  const enLigne = new Set(annonces.map((a) => a.ref));
  for (const [ref, r] of existants) {
    if (enLigne.has(ref)) continue;
    const h = horsLigne(r.data);
    if (!h) continue;
    ecrire.push({ id: r.id, user_id: r.user_id, kind: "biens", data: { ...h, updatedAt: now }, updated_at: now });
    bilan.horsLigne++;
  }
  const { error: e2 } = await db.from("hub_docs").upsert(ecrire);
  if (e2) return NextResponse.json({ error: e2.message }, { status: 500 });
  return NextResponse.json({ bilan, synchro: true });
}

export async function POST(req: Request) {
  const moi = await utilisateur(req);
  const local = !process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!local && !moi) return NextResponse.json({ error: "Connexion requise" }, { status: 401 });
  if (moi && cleServiceSupabase() && !(await roleEquipe(moi.id))) return NextResponse.json({ error: "Réservé à l'équipe PATRIM" }, { status: 403 });
  return synchroniser();
}

export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  return synchroniser();
}

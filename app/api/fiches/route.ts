import { NextResponse } from "next/server";
import { roleEquipe, utilisateur } from "@/lib/auth-server";
import { CONSERVATION_JOURS, DUREE_LIEN_JOURS, PIECES, nettoyerControle, nettoyerPrenom, nettoyerReponses, type ContextePublic, type KindFiche } from "@/components/fiches/fiche";
import { depotFiches, empreinte, ENTETES, nouveauJeton, type FicheServeur } from "@/components/fiches/serveur";

/* Fiches vendeur et acquéreur, côté conseiller (compte de l'équipe obligatoire).
   Une fiche est visible par le conseiller qui l'a créée, le titulaire et le
   responsable ; jamais par les autres collègues.
   GET  ?bien=<id>&kind=vendeur|acquereur : fiches du bien, avec les réponses.
   POST { action } : creer, lien, fermer, controler (évaluation du risque par l'agence), supprimer. */

export const dynamic = "force-dynamic";

const refus = (error: string, status: number) => NextResponse.json({ error }, { status, headers: ENTETES });
const jours = (n: number, depuis = Date.now()) => new Date(depuis + n * 86400_000).toISOString();
const kindDe = (v: unknown): KindFiche | null => (v === "vendeur" || v === "acquereur" ? v : null);

async function qui(req: Request) {
  const moi = await utilisateur(req);
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return { id: moi?.id ?? "local", voitTout: true };
  if (!moi) return null;
  const role = await roleEquipe(moi.id);
  if (!role) return null;
  return { id: moi.id, voitTout: role === "titulaire" || role === "responsable" };
}

const texte = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, max) || undefined : undefined);

function contexteDe(v: unknown, kind: KindFiche): ContextePublic | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  const titre = texte(s.titre, 160);
  if (!titre) return null;
  const c = s.conseiller as Record<string, unknown> | undefined;
  const photo = texte(s.photo, 500);
  const prix = typeof s.prix === "number" && Number.isFinite(s.prix) && s.prix > 0 && s.prix < 100_000_000 ? s.prix : undefined;
  // Documents demandés par le conseiller (il a peut-être déjà les autres)
  const pieces = Array.isArray(s.pieces) ? [...new Set(s.pieces.filter((x): x is string => typeof x === "string" && PIECES[kind].includes(x)))] : undefined;
  return {
    titre,
    ville: texte(s.ville, 80),
    // Le vendeur connaît son bien : seul l'acquéreur voit le prix affiché
    prix: kind === "acquereur" ? prix : undefined,
    photo: photo && /^https:\/\//.test(photo) ? photo : undefined,
    pieces,
    conseiller: c && texte(c.nom, 80) ? { nom: texte(c.nom, 80)!, tel: texte(c.tel, 24), mail: texte(c.mail, 120) } : undefined,
  };
}

const erreurBase = (e: unknown, defaut: string) => (/hub_fiches|controle/.test((e as Error).message ?? "") ? "La base n'est pas encore prête : il reste une mise à jour à lancer dans Supabase." : defaut);
const sansCompte = ({ userId: _u, ...f }: FicheServeur) => f;

export async function GET(req: Request) {
  const d = depotFiches();
  if (!d) return refus("Fiches en ligne indisponibles : l'appli n'est pas reliée à la base de l'équipe.", 503);
  const moi = await qui(req);
  if (!moi) return refus("Réservé à l'équipe PATRIM", 403);
  const q = new URL(req.url).searchParams;
  const bien = q.get("bien") ?? "";
  if (!/^[\w-]{1,64}$/.test(bien)) return refus("Bien inconnu", 400);
  try {
    await d.purger();
    const fiches = (await d.duBien(bien, kindDe(q.get("kind")) ?? undefined)).filter((f) => moi.voitTout || f.userId === moi.id).map(sansCompte);
    return NextResponse.json({ fiches }, { headers: ENTETES });
  } catch (e) {
    return refus(erreurBase(e, "Lecture impossible pour l'instant."), 500);
  }
}

export async function POST(req: Request) {
  const d = depotFiches();
  if (!d) return refus("Fiches en ligne indisponibles : l'appli n'est pas reliée à la base de l'équipe.", 503);
  const moi = await qui(req);
  if (!moi) return refus("Réservé à l'équipe PATRIM", 403);
  const corps = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  try {
    if (corps.action === "creer") {
      const kind = kindDe(corps.kind);
      const bienId = typeof corps.bienId === "string" && /^[\w-]{1,64}$/.test(corps.bienId) ? corps.bienId : null;
      const contexte = kind && contexteDe(corps.contexte, kind);
      if (!kind || !bienId || !contexte) return refus("Bien incomplet", 400);
      const jeton = nouveauJeton();
      // Ce que le Hub sait déjà (identité, adresse, bien) : le client n'a qu'à vérifier et compléter
      const { accord: _a, ...reponses } = nettoyerReponses(kind, corps.reponses);
      const id = await d.creer({ userId: moi.id, bienId, kind, contexte, prenom: nettoyerPrenom(corps.prenom), reponses, empreinte: empreinte(jeton), expire: jours(DUREE_LIEN_JOURS) });
      return NextResponse.json({ id, jeton }, { headers: ENTETES });
    }

    const f = typeof corps.id === "string" ? await d.fiche(corps.id) : null;
    if (!f || !(moi.voitTout || f.userId === moi.id)) return refus("Fiche introuvable", 404);
    // Un lien renvoyé ou une fiche rouverte : 30 jours de plus, sans dépasser la conservation
    const prolonger = () => {
      const fin = Math.min(Date.parse(jours(DUREE_LIEN_JOURS)), Date.parse(f.creeLe) + CONSERVATION_JOURS * 86400_000);
      return fin > Date.parse(f.expire) ? new Date(fin).toISOString() : undefined;
    };
    if (corps.action === "lien") {
      const jeton = nouveauJeton();
      await d.maj(f.id, { empreinte: empreinte(jeton), expire: prolonger(), ferme: false });
      return NextResponse.json({ id: f.id, jeton }, { headers: ENTETES });
    }
    if (corps.action === "fermer") {
      const rouvrir = corps.ferme === false;
      await d.maj(f.id, { ferme: !rouvrir, expire: rouvrir ? prolonger() : undefined });
      return NextResponse.json({ ok: true }, { headers: ENTETES });
    }
    if (corps.action === "controler") {
      const controle = nettoyerControle(corps.controle);
      await d.maj(f.id, { controle });
      return NextResponse.json({ controle }, { headers: ENTETES });
    }
    if (corps.action === "supprimer") {
      await d.supprimer(f.id);
      return NextResponse.json({ ok: true }, { headers: ENTETES });
    }
    return refus("Action inconnue", 400);
  } catch (e) {
    return refus(erreurBase(e, "Enregistrement impossible pour l'instant."), 500);
  }
}

import { NextResponse } from "next/server";
import { roleEquipe, utilisateur } from "@/lib/auth-server";
import { DUREE_LIEN_JOURS, CONSERVATION_JOURS, MAX_PERSONNES, nettoyerPieces, nettoyerPrenom, nettoyerReponses, type LogementPublic, type Reponses } from "@/components/renseignements/dossier";
import { depot, empreinte, ENTETES, nouveauJeton, type DossierServeur } from "@/components/renseignements/serveur";

/* Dossiers de renseignements, côté conseiller (compte de l'équipe obligatoire).
   Un dossier est visible par le conseiller qui l'a créé, le titulaire et le
   responsable ; jamais par les autres collègues (ce sont des prospects).
   GET  ?bien=<id> : dossiers du bien, avec les réponses.
   POST { action } : creer, lien, ajouter, retirer, fermer, pieces, supprimer.
   À la création, le conseiller peut joindre ce que le Hub sait déjà de la
   personne (identité, coordonnées) : elle n'a plus qu'à vérifier. */

export const dynamic = "force-dynamic";

const refus = (error: string, status: number) => NextResponse.json({ error }, { status, headers: ENTETES });
const jours = (n: number, depuis = Date.now()) => new Date(depuis + n * 86400_000).toISOString();

async function qui(req: Request) {
  const moi = await utilisateur(req);
  const local = !process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (local) return { id: moi?.id ?? "local", voitTout: true };
  if (!moi) return null;
  const role = await roleEquipe(moi.id);
  if (!role) return null;
  return { id: moi.id, voitTout: role === "titulaire" || role === "responsable" };
}

const texte = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f<>]/g, " ").trim().slice(0, max) || undefined : undefined);
const montant = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1_000_000 ? v : undefined);

function logementDe(v: unknown): LogementPublic | null {
  if (!v || typeof v !== "object") return null;
  const s = v as Record<string, unknown>;
  const titre = texte(s.titre, 160);
  if (!titre) return null;
  const c = s.conseiller as Record<string, unknown> | undefined;
  const photo = texte(s.photo, 500);
  const entree = texte(s.entree, 10);
  return {
    titre,
    ville: texte(s.ville, 80),
    meuble: typeof s.meuble === "boolean" ? s.meuble : undefined,
    loyer: montant(s.loyer),
    charges: montant(s.charges),
    depot: montant(s.depot),
    honoraires: montant(s.honoraires),
    entree: entree && /^\d{4}-\d{2}-\d{2}$/.test(entree) ? entree : undefined,
    photo: photo && /^https:\/\//.test(photo) ? photo : undefined,
    pieces: nettoyerPieces(s.pieces),
    conseiller: c && texte(c.nom, 80) ? { nom: texte(c.nom, 80)!, tel: texte(c.tel, 24), mail: texte(c.mail, 120) } : undefined,
  };
}

/** Réponses pré-remplies par le conseiller (jamais l'accord, que seule la personne donne). */
const prerempli = (v: unknown): Reponses => {
  const { accord: _a, ...r } = nettoyerReponses(v);
  return r;
};

export async function GET(req: Request) {
  const d = depot();
  if (!d) return refus("Fiches en ligne indisponibles : l'appli n'est pas reliée à la base de l'équipe.", 503);
  const moi = await qui(req);
  if (!moi) return refus("Réservé à l'équipe PATRIM", 403);
  const bien = new URL(req.url).searchParams.get("bien") ?? "";
  if (!/^[\w-]{1,64}$/.test(bien)) return refus("Bien inconnu", 400);
  try {
    await d.purger();
    const tous = await d.dossiersDuBien(bien);
    const dossiers = tous.filter((x) => moi.voitTout || x.userId === moi.id).map(({ userId: _u, ...x }) => x);
    return NextResponse.json({ dossiers }, { headers: ENTETES });
  } catch (e) {
    return refus((e as Error).message.includes("hub_dossier") ? "La base n'est pas encore prête : il reste une mise à jour à lancer dans Supabase." : "Lecture impossible pour l'instant.", 500);
  }
}

export async function POST(req: Request) {
  const d = depot();
  if (!d) return refus("Fiches en ligne indisponibles : l'appli n'est pas reliée à la base de l'équipe.", 503);
  const moi = await qui(req);
  if (!moi) return refus("Réservé à l'équipe PATRIM", 403);
  const corps = (await req.json().catch(() => ({}))) as Record<string, unknown>;
  const action = corps.action;
  const autorise = (x: DossierServeur | null): x is DossierServeur => !!x && (moi.voitTout || x.userId === moi.id);
  try {
    if (action === "creer") {
      const bienId = typeof corps.bienId === "string" && /^[\w-]{1,64}$/.test(corps.bienId) ? corps.bienId : null;
      const logement = logementDe(corps.logement);
      const prenom = nettoyerPrenom(corps.prenom);
      if (!bienId || !logement) return refus("Bien incomplet", 400);
      const id = await d.creerDossier({ userId: moi.id, bienId, logement, expire: jours(DUREE_LIEN_JOURS) });
      const jeton = nouveauJeton();
      const personneId = await d.ajouterPersonne({ dossierId: id, role: "locataire", principal: true, prenom, reponses: prerempli(corps.reponses), empreinte: empreinte(jeton) });
      return NextResponse.json({ id, personneId, jeton }, { headers: ENTETES });
    }

    if (action === "lien" || action === "retirer") {
      const p = typeof corps.personneId === "string" ? await d.personne(corps.personneId) : null;
      const dossier = p ? await d.dossier(p.dossierId) : null;
      if (!p || !autorise(dossier)) return refus("Personne introuvable", 404);
      if (action === "retirer") {
        if (p.principal) return refus("Le candidat principal ne peut pas être retiré : supprimez le dossier.", 400);
        await d.retirerPersonne(p.id);
        return NextResponse.json({ ok: true }, { headers: ENTETES });
      }
      const jeton = nouveauJeton();
      await d.majPersonne(p.id, { empreinte: empreinte(jeton) });
      // Le lien renvoyé reste valable 30 jours, sans dépasser la durée de conservation du dossier
      const fin = Math.min(Date.parse(jours(DUREE_LIEN_JOURS)), Date.parse(dossier.creeLe) + CONSERVATION_JOURS * 86400_000);
      if (fin > Date.parse(dossier.expire)) await d.majDossier(dossier.id, { expire: new Date(fin).toISOString() });
      return NextResponse.json({ id: p.id, jeton }, { headers: ENTETES });
    }

    const dossier = typeof corps.dossierId === "string" ? await d.dossier(corps.dossierId) : null;
    if (!autorise(dossier)) return refus("Dossier introuvable", 404);
    if (action === "ajouter") {
      const role = corps.role === "garant" ? "garant" : corps.role === "colocataire" ? "colocataire" : null;
      const prenom = nettoyerPrenom(corps.prenom);
      if (!role || !prenom) return refus("Indiquez le prénom de la personne.", 400);
      if (dossier.personnes.length >= MAX_PERSONNES) return refus(`Un dossier compte au plus ${MAX_PERSONNES} personnes.`, 400);
      const garantDe = role === "garant" ? dossier.personnes.find((p) => p.id === corps.garantDe && p.role !== "garant")?.id : undefined;
      if (role === "garant" && !garantDe) return refus("Indiquez pour qui la personne se porte garante.", 400);
      const jeton = nouveauJeton();
      const id = await d.ajouterPersonne({ dossierId: dossier.id, role, principal: false, garantDe, prenom, reponses: prerempli(corps.reponses), empreinte: empreinte(jeton) });
      return NextResponse.json({ id, jeton }, { headers: ENTETES });
    }
    if (action === "fermer") {
      const rouvrir = corps.ferme === false;
      const fin = Math.min(Date.parse(jours(DUREE_LIEN_JOURS)), Date.parse(dossier.creeLe) + CONSERVATION_JOURS * 86400_000);
      await d.majDossier(dossier.id, { ferme: !rouvrir, expire: rouvrir && fin > Date.parse(dossier.expire) ? new Date(fin).toISOString() : undefined });
      return NextResponse.json({ ok: true }, { headers: ENTETES });
    }
    if (action === "pieces") {
      // Documents demandés : modifiables après l'envoi, les liens déjà envoyés restent valables
      await d.majDossier(dossier.id, { logement: { ...dossier.logement, pieces: nettoyerPieces(corps.pieces) } });
      return NextResponse.json({ ok: true }, { headers: ENTETES });
    }
    if (action === "supprimer") {
      await d.supprimerDossier(dossier.id);
      return NextResponse.json({ ok: true }, { headers: ENTETES });
    }
    return refus("Action inconnue", 400);
  } catch (e) {
    return refus((e as Error).message.includes("hub_dossier") ? "La base n'est pas encore prête : il reste une mise à jour à lancer dans Supabase." : "Enregistrement impossible pour l'instant.", 500);
  }
}

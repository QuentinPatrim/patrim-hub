import { NextResponse } from "next/server";
import { MAX_PERSONNES, manquantsReponses, nettoyerPrenom, nettoyerReponses, type VuePublique } from "@/components/renseignements/dossier";
import { depot, empreinte, ENTETES, jetonValide, nouveauJeton, type DossierServeur, type PersonneServeur } from "@/components/renseignements/serveur";

/* Adresse publique de la fiche de renseignements : ouverte sans compte, avec le
   jeton secret du lien. Elle ne donne accès qu'à UNE personne d'UN dossier :
   ses propres réponses, le logement (sans le propriétaire) et, pour le
   candidat principal, les prénoms et l'avancement des autres personnes de
   son dossier (jamais leurs réponses). Aucune autre donnée du Hub n'est
   accessible par ici. */

export const dynamic = "force-dynamic";

const refus = (error: string, status: number) => NextResponse.json({ error }, { status, headers: ENTETES });
const INTROUVABLE = "Ce lien n'est pas valable. Il a peut-être été remplacé par un lien plus récent : demandez-le à votre conseiller PATRIM.";
const CLOS = "Ce dossier est clos. Pour toute question, contactez votre conseiller PATRIM.";

async function ouvrir(params: Promise<{ jeton: string }>) {
  const { jeton } = await params;
  const d = depot();
  if (!d) return { erreur: refus("Service indisponible pour l'instant. Réessayez plus tard.", 503) };
  if (!jetonValide(jeton)) return { erreur: refus(INTROUVABLE, 404) };
  const trouve = await d.parEmpreinte(empreinte(jeton)).catch(() => null);
  if (!trouve) return { erreur: refus(INTROUVABLE, 404) };
  if (trouve.dossier.ferme || Date.parse(trouve.dossier.expire) < Date.now()) return { erreur: refus(CLOS, 410) };
  return { d, jeton, ...trouve };
}

function vue(dossier: DossierServeur, moi: PersonneServeur): VuePublique {
  return {
    logement: dossier.logement,
    moi: { id: moi.id, role: moi.role, principal: moi.principal, garantDe: moi.garantDe, prenom: moi.prenom, statut: moi.statut, reponses: moi.reponses },
    foyer: moi.principal
      ? dossier.personnes.map(({ id, role, principal, garantDe, prenom, statut }) => ({ id, role, principal, garantDe, prenom, statut }))
      : // Un garant voit seulement le prénom de la personne qu'il garantit
        dossier.personnes.filter((p) => p.id === moi.garantDe).map(({ id, role, principal, prenom, statut }) => ({ id, role, principal, prenom, statut })),
    expire: dossier.expire,
  };
}

export async function GET(_req: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const o = await ouvrir(params);
  if (o.erreur) return o.erreur;
  return NextResponse.json(vue(o.dossier, o.personne), { headers: ENTETES });
}

export async function POST(req: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const o = await ouvrir(params);
  if (o.erreur) return o.erreur;
  const { d, jeton, dossier, personne: moi } = o;
  const texte = await req.text();
  if (texte.length > 20_000) return refus("Envoi trop volumineux.", 413);
  let corps: Record<string, unknown>;
  try {
    corps = JSON.parse(texte) as Record<string, unknown>;
  } catch {
    return refus("Envoi illisible.", 400);
  }
  const action = corps?.action;
  try {
    if (action === "enregistrer") {
      const reponses = nettoyerReponses(corps.reponses);
      const complet = !manquantsReponses(reponses).length && !!reponses.accord;
      if (corps.terminer === true && !complet) return refus("Il manque encore des informations : " + manquantsReponses(reponses).join(", ") + (reponses.accord ? "" : ", accord") + ".", 422);
      const statut = corps.terminer === true || (moi.statut === "termine" && complet) ? "termine" : "en_cours";
      await d.majPersonne(moi.id, { reponses, statut, prenom: reponses.prenom || moi.prenom });
      const maj = await d.parEmpreinte(empreinte(jeton));
      return NextResponse.json(maj ? vue(maj.dossier, maj.personne) : { ok: true }, { headers: ENTETES });
    }

    // Le candidat principal organise son dossier : conjoint, colocataires, garants.
    if (!moi.principal) return refus("Action réservée au candidat principal.", 403);
    const cible = typeof corps.personneId === "string" ? dossier.personnes.find((p) => p.id === corps.personneId) : undefined;

    if (action === "ajouter") {
      const role = corps.role === "garant" ? "garant" : corps.role === "colocataire" ? "colocataire" : null;
      const prenom = nettoyerPrenom(corps.prenom);
      if (!role || !prenom) return refus("Indiquez le prénom de la personne.", 400);
      if (dossier.personnes.length >= MAX_PERSONNES) return refus(`Un dossier compte au plus ${MAX_PERSONNES} personnes.`, 400);
      let garantDe: string | undefined;
      if (role === "garant") {
        garantDe = dossier.personnes.find((p) => p.id === corps.garantDe && p.role !== "garant")?.id;
        if (!garantDe) return refus("Indiquez pour qui la personne se porte garante.", 400);
      }
      const jeton = nouveauJeton();
      const id = await d.ajouterPersonne({ dossierId: dossier.id, role, principal: false, garantDe, prenom, empreinte: empreinte(jeton) });
      return NextResponse.json({ id, jeton }, { headers: ENTETES });
    }
    if (!cible || cible.principal) return refus("Personne introuvable dans votre dossier.", 404);
    if (action === "lien") {
      const jeton = nouveauJeton();
      await d.majPersonne(cible.id, { empreinte: empreinte(jeton) });
      return NextResponse.json({ id: cible.id, jeton }, { headers: ENTETES });
    }
    if (action === "retirer") {
      if (cible.statut === "termine") return refus("Cette personne a déjà envoyé sa fiche : demandez à votre conseiller de la retirer.", 400);
      await d.retirerPersonne(cible.id);
      return NextResponse.json({ ok: true }, { headers: ENTETES });
    }
    return refus("Action inconnue.", 400);
  } catch {
    return refus("Enregistrement impossible pour l'instant. Réessayez dans un instant.", 500);
  }
}

import { NextResponse } from "next/server";
import { notifierCompte } from "@/lib/push-server";
import { manquantsReponses, nettoyerReponses, TITRE_FICHE, type VuePublique } from "@/components/fiches/fiche";
import { depotFiches, empreinte, ENTETES, jetonValide, type FicheServeur } from "@/components/fiches/serveur";

/* Adresse publique d'une fiche vendeur ou acquéreur : ouverte sans compte,
   avec le jeton secret du lien. Elle ne donne accès qu'à UNE fiche : ses
   propres réponses et le bien (titre, ville, prix affiché pour l'acquéreur).
   Ni le vendeur, ni les autres acquéreurs, ni aucune autre donnée du Hub. */

export const dynamic = "force-dynamic";

const refus = (error: string, status: number) => NextResponse.json({ error }, { status, headers: ENTETES });
const INTROUVABLE = "Ce lien n'est pas valable. Il a peut-être été remplacé par un lien plus récent : demandez-le à votre conseiller PATRIM.";
const CLOS = "Cette fiche est close. Pour toute question, contactez votre conseiller PATRIM.";

async function ouvrir(params: Promise<{ jeton: string }>) {
  const { jeton } = await params;
  const d = depotFiches();
  if (!d) return { erreur: refus("Service indisponible pour l'instant. Réessayez plus tard.", 503) };
  if (!jetonValide(jeton)) return { erreur: refus(INTROUVABLE, 404) };
  const f = await d.parEmpreinte(empreinte(jeton)).catch(() => null);
  if (!f) return { erreur: refus(INTROUVABLE, 404) };
  if (f.ferme || Date.parse(f.expire) < Date.now()) return { erreur: refus(CLOS, 410) };
  return { d, f };
}

const vue = (f: FicheServeur): VuePublique => ({ kind: f.kind, contexte: f.contexte, prenom: f.prenom, statut: f.statut, reponses: f.reponses ?? {}, expire: f.expire });

export async function GET(_req: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const o = await ouvrir(params);
  if (o.erreur) return o.erreur;
  return NextResponse.json(vue(o.f), { headers: ENTETES });
}

export async function POST(req: Request, { params }: { params: Promise<{ jeton: string }> }) {
  const o = await ouvrir(params);
  if (o.erreur) return o.erreur;
  const { d, f } = o;
  const brut = await req.text();
  if (brut.length > 40_000) return refus("Envoi trop volumineux.", 413);
  let corps: Record<string, unknown>;
  try {
    corps = JSON.parse(brut) as Record<string, unknown>;
  } catch {
    return refus("Envoi illisible.", 400);
  }
  if (corps?.action !== "enregistrer") return refus("Action inconnue.", 400);
  try {
    const reponses = nettoyerReponses(f.kind, corps.reponses);
    const manque = manquantsReponses(f.kind, reponses, f.contexte);
    const complet = !manque.length && !!reponses.accord;
    if (corps.terminer === true && !complet) return refus("Il manque encore des informations : " + [...manque, ...(reponses.accord ? [] : ["accord"])].join(", ") + ".", 422);
    const statut = corps.terminer === true || (f.statut === "termine" && complet) ? "termine" : "en_cours";
    await d.maj(f.id, { reponses, statut, prenom: reponses.prenom || f.prenom });
    // Prévient le conseiller sur son téléphone quand la fiche arrive (pas à chaque correction)
    if (statut === "termine" && f.statut !== "termine") {
      const qui = [reponses.civilite === "M." ? "M." : reponses.civilite === "Mme" ? "Mme" : "", reponses.prenom, reponses.nom?.toUpperCase()].filter(Boolean).join(" ");
      await notifierCompte(f.userId, {
        titre: `${TITRE_FICHE[f.kind]} reçue`,
        texte: [qui, f.contexte.titre].filter(Boolean).join(" · "),
        url: `/biens/${f.bienId}/fiche-${f.kind}`,
        tag: `fiche-${f.id}`,
      });
    }
    return NextResponse.json(vue({ ...f, reponses, statut, prenom: reponses.prenom || f.prenom }), { headers: ENTETES });
  } catch {
    return refus("Enregistrement impossible pour l'instant. Réessayez dans un instant.", 500);
  }
}

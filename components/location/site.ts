import type { Bien, BienType, ClasseDpe } from "@/lib/types";
import type { BienLocation, InfosLocation } from "./bienLocation";

/* ============================================================
   Annonces de location de patrim.fr → biens du Hub Location.
   Utilisé par le serveur (actualisation commune à toute l'équipe)
   et par le navigateur en mode local. Seuls les champs venus du
   site sont réécrits : statut, locataires, propriétaires, gestion,
   baux et notes saisis dans le Hub ne bougent jamais.
   ============================================================ */

export type AnnonceLocation = {
  ref: string; // GES00190008-430
  url: string;
  titre: string;
  type: BienType;
  ville: string;
  quartier?: string;
  rue?: string;
  surface?: number;
  pieces?: number;
  chambres?: number;
  etage?: number;
  nbEtages?: number;
  loyerCC?: number;
  charges?: number;
  depot?: number;
  honoraires?: number;
  meuble?: boolean;
  dpe?: ClasseDpe;
  ges?: ClasseDpe;
  description?: string;
  photos: string[];
};

export type BilanActualisation = { ajoutes: number; misAJour: number; horsLigne: number; total: number };

const loyerHC = (a: AnnonceLocation) => (a.loyerCC != null ? Math.round((a.loyerCC - (a.charges ?? 0)) * 100) / 100 : undefined);

/** Données du bien d'après l'annonce, fusionnées avec le bien existant s'il y en a un. */
export function bienDepuisAnnonce(a: AnnonceLocation, avant: BienLocation | undefined, maintenant: string): Omit<BienLocation, "id" | "createdAt" | "updatedAt"> {
  const loc: InfosLocation = avant?.location ?? { statut: "a_louer" };
  const revenue = !loc.site?.enLigne; // nouvelle annonce, ou annonce remise en ligne
  return {
    ...(avant ?? {}),
    transaction: "location",
    statut: "retire", // jamais dans les calculs de vente (rapprochements, chiffres, briefing)
    ref: a.ref,
    titre: a.titre,
    type: a.type,
    adresse: avant?.adresse || a.rue || "",
    ville: a.ville,
    quartier: a.quartier ?? avant?.quartier,
    surface: a.surface ?? avant?.surface,
    pieces: a.pieces ?? avant?.pieces,
    chambres: a.chambres ?? avant?.chambres,
    etage: a.etage ?? avant?.etage,
    nbEtages: a.nbEtages ?? avant?.nbEtages,
    dpe: a.dpe ?? avant?.dpe,
    ges: a.ges ?? avant?.ges,
    description: a.description ?? avant?.description,
    photos: a.photos.length ? a.photos : avant?.photos,
    annonceUrl: a.url,
    location: {
      ...loc,
      statut: revenue ? "a_louer" : loc.statut,
      meuble: a.meuble ?? loc.meuble,
      loyer: loyerHC(a) ?? loc.loyer,
      charges: a.charges ?? loc.charges,
      depot: a.depot ?? loc.depot,
      honoraires: a.honoraires ?? loc.honoraires,
      site: { ref: a.ref, enLigne: true, vu: maintenant },
    },
  } as Omit<BienLocation, "id" | "createdAt" | "updatedAt">;
}

/** Bien dont l'annonce n'est plus en ligne : on le garde, marqué « hors ligne ». */
export function horsLigne(b: BienLocation): BienLocation | null {
  const loc = b.location;
  if (!loc?.site?.enLigne) return null;
  return { ...b, location: { ...loc, site: { ...loc.site, enLigne: false } } };
}

/** Bien du Hub qui correspond à une annonce (même référence). */
export const refSite = (b: Bien) => (b as BienLocation).location?.site?.ref;

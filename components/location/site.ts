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

/* ---------- Même logement, avant et après sa mise en ligne ----------
   Un logement suivi dans le Hub avant d'être sur patrim.fr (liste loc,
   « pub à faire ») est retrouvé quand son annonce paraît : même rue et
   même surface (ou même nombre de pièces). On complète ce bien au lieu
   d'en créer un autre : candidats, visites, suivi du dossier restent. */

const sansAccents = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
function cleRue(s: string) {
  return sansAccents(s)
    .toLowerCase()
    .replace(/\b\d{5}\b.*$/, "")
    .replace(/\b(appt|apt|appartement|porte|lot|bat|batiment|residence|etage)\b\.?\s*[\w-]*/g, " ")
    .replace(/\bbd\b/g, "boulevard")
    .replace(/\bav\b\.?/g, "avenue")
    .replace(/\ball?ee?s?\b/g, "allees")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/^\s*\d+\s*(bis|ter)?\s+/, "")
    .trim();
}

const relocationDe = (loc: InfosLocation) => (loc as InfosLocation & { relocation?: Record<string, unknown> }).relocation;

/** Bien du Hub sans annonce liée qui est ce logement, s'il n'y a qu'un candidat sûr. */
export function memeLogement(a: AnnonceLocation, biens: BienLocation[]): BienLocation | undefined {
  const rue = a.rue ? cleRue(a.rue) : "";
  const notes = biens
    .filter((b) => b.transaction === "location" && !refSite(b) && b.adresse)
    .map((b) => {
      const r = cleRue(b.adresse);
      const memeRue = !!rue && !!r && (r === rue || r.includes(rue) || rue.includes(r));
      const surface = a.surface && b.surface ? Math.abs(a.surface - b.surface) <= 1.5 : undefined;
      const pieces = a.pieces && b.pieces ? a.pieces === b.pieces : undefined;
      let n = 0;
      if (memeRue) n += 5;
      if (surface === true) n += 4;
      if (surface === false) n -= 6;
      if (pieces === true) n += 2;
      if (pieces === false) n -= 4;
      if (a.quartier && b.quartier && sansAccents(a.quartier).toLowerCase() === sansAccents(b.quartier).toLowerCase()) n += 1;
      return { b, n, memeRue };
    })
    .filter((x) => x.memeRue && x.n >= 7)
    .sort((x, y) => y.n - x.n);
  if (!notes.length || (notes[1] && notes[1].n === notes[0].n)) return undefined;
  return notes[0].b;
}

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
      // Dossier de relocation suivi dans la Gestion : l'annonce est en ligne
      ...(relocationDe(loc) ? { relocation: { ...relocationDe(loc), pub: "en_ligne" } } : {}),
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

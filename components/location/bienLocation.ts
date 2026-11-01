import type { Bien } from "@/lib/types";
import type { Tone } from "@/lib/format";

/* Location d'un bien : rangée à côté des champs de vente, sans modifier lib/types.ts. */

/** « En attente » : logement vide mais pas encore proposé (travaux, propriétaire qui hésite, pub à faire…). */
export type StatutLocation = "a_louer" | "en_attente" | "loue" | "preavis";

export const STATUT_LOCATION: Record<StatutLocation, { label: string; tone: Tone }> = {
  a_louer: { label: "À louer", tone: "ok" },
  en_attente: { label: "En attente", tone: "neutral" },
  loue: { label: "Loué", tone: "brand" },
  preavis: { label: "En préavis", tone: "warn" },
};

export interface InfosLocation {
  statut: StatutLocation;
  meuble?: boolean;
  loyer?: number; // hors charges, par mois
  charges?: number; // provision ou forfait, par mois
  depot?: number;
  debut?: string; // AAAA-MM-JJ
  locataireIds?: string[];
  /** Bail signé dont viennent ces informations. */
  bailActeId?: string;
  /** Mandat de gestion signé avec l'agence. */
  gestion?: { numero?: string; debut?: string; acteId?: string };
  /** Honoraires de location charge locataire, tels qu'annoncés. */
  honoraires?: number;
  /** Annonce de location sur patrim.fr (référence GES…), en ligne ou non à la dernière actualisation. */
  site?: { ref: string; enLigne: boolean; vu: string };
}

/** `transaction: "location"` : bien entré dans le Hub seulement pour la location (pas en vente). */
export type BienLocation = Bien & { location?: InfosLocation; transaction?: "vente" | "location" };

export const locationDe = (b: Bien) => (b as BienLocation).location;
export const locationSeule = (b: Bien) => (b as BienLocation).transaction === "location";

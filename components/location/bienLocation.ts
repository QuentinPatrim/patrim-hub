import type { Bien } from "@/lib/types";

/* Location d'un bien : rangée à côté des champs de vente, sans modifier lib/types.ts. */

export type StatutLocation = "a_louer" | "loue" | "preavis";

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
}

export type BienLocation = Bien & { location?: InfosLocation };

export const locationDe = (b: Bien) => (b as BienLocation).location;

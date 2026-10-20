/* Outils du module « Rédiger » : lecture des actes d'un bien, sans modifier les fichiers partagés. */

import { getAll } from "@/lib/store";
import type { Bien } from "@/lib/types";
import { lienActe, resumeActe, statutActe, titreActe, type Acte, type BienActes } from "./archive";

export { lienActe, resumeActe, statutActe, titreActe };
export type { Acte, BienActes };

/** Actes rattachés à un bien (mandats, offres, avenants, bons de visite). */
export const actesDuBien = (b: BienActes): Acte[] => b.actes ?? [];

/** Tous les actes de tous les biens (aperçu global). */
export function tousLesActes(): { bien: BienActes; acte: Acte }[] {
  const out: { bien: BienActes; acte: Acte }[] = [];
  for (const b of getAll("biens") as BienActes[]) for (const a of actesDuBien(b)) out.push({ bien: b, acte: a });
  return out;
}

export type { Bien };

import type { Bien } from "@/lib/types";

/* Dossier d'un bien : ce qui vient des pièces du dossier (titre de propriété, syndic, notaire,
   diagnostics…) et qui n'a pas de case dans la fiche. Confidentiel : jamais repris dans un
   contenu destiné au public. Rempli par l'import des mandats (voir lib/mandats.ts). */

export type DossierBien = {
  complementAdresse?: string; // bâtiment, escalier, porte, n° d'appartement
  copropriete?: string; // nom de la copropriété, nombre de lots
  lots?: string; // lots du bien (numéros, nature, tantièmes)
  syndic?: string; // nom, gestionnaire, coordonnées
  occupation?: string; // libre, ou loué (loyer, fin de bail)
  notaire?: string;
  dpe?: string; // date, n° ADEME, consommations
  ddt?: string;
  charges?: string; // détail des charges (année, source)
  taxeFonciere?: string; // détail (année)
  construction?: string; // période, quand l'année exacte n'est pas connue
  conseiller?: string; // collègue qui suit le mandat
  precisions?: string[];
  evenements?: string[]; // historique daté (offre, compromis, baisse de prix…)
  aVerifier?: string[];
  maj?: string; // AAAA-MM-JJ
};

export type BienDossier = Bien & { dossier?: DossierBien };

export const dossierDe = (b: Bien) => (b as BienDossier).dossier;

/** Lignes affichées, dans l'ordre. */
export const LIGNES_DOSSIER: [keyof DossierBien, string][] = [
  ["complementAdresse", "Accès"],
  ["occupation", "Occupation"],
  ["copropriete", "Copropriété"],
  ["lots", "Lots"],
  ["syndic", "Syndic"],
  ["charges", "Charges"],
  ["taxeFonciere", "Taxe foncière"],
  ["dpe", "DPE"],
  ["ddt", "Diagnostics"],
  ["construction", "Construction"],
  ["notaire", "Notaire"],
  ["conseiller", "Conseiller"],
];

export const dossierVide = (d?: DossierBien) =>
  !d || (!LIGNES_DOSSIER.some(([k]) => d[k]) && !d.precisions?.length && !d.evenements?.length && !d.aVerifier?.length);

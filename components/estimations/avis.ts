/* ============================================================
   Avis de valeur (modèle Immotech) : informations complémentaires
   gardées sur l'estimation (photos, charges, points forts…), avec
   des valeurs par défaut reprises du bien rattaché.
   ============================================================ */

import type { Bien, ClasseDpe, Estimation } from "@/lib/types";
import type { EstimationPlus } from "./shared";

/** Bien actuellement en vente dans le secteur (concurrence), saisi à la main. */
export type BienEnVente = { id: string; adresse: string; prix: number; surface?: number; portail?: string };

export type AvisPlus = {
  photos?: string[]; // la première sert de couverture
  pagesPhotos?: boolean; // pages « Le bien en images » (oui par défaut)
  ges?: ClasseDpe;
  annee?: number;
  taxeFonciere?: number;
  copro?: boolean;
  chargesMois?: number;
  equipements?: string[];
  descriptif?: string;
  pointsForts?: string[];
  pointsVigilance?: string[];
  analyse?: string; // sinon le commentaire argumenté de l'estimation
  loyer?: number; // valeur locative mensuelle hors charges
  loue?: boolean; // bien vendu loué : valeur libre et valeur occupée
  basLoue?: number;
  hautLoue?: number;
  enVente?: BienEnVente[];
  clientAdresse?: string;
};

export type EstimationAvis = EstimationPlus & { avis?: AvisPlus };
export const asAvis = (e: Estimation) => e as EstimationAvis;

export const EQUIPEMENTS = ["Garage", "Parking", "Cave", "Cellier", "Balcon", "Terrasse", "Loggia", "Jardin", "Piscine"];

/** Équipements déduits de l'estimation et du bien, quand rien n'a été choisi. */
function equipementsParDefaut(e: Estimation, b?: Bien) {
  const out = new Set<string>();
  (e.exterieur ?? b?.exterieur ?? "")
    .split(/[,/+]| et /i)
    .map((s) => s.trim().toLowerCase())
    .forEach((s) => {
      const m = EQUIPEMENTS.find((x) => x.toLowerCase() === s);
      if (m) out.add(m);
    });
  if (e.parking || (b?.parking && !/^non/i.test(b.parking))) out.add(/garage/i.test(b?.parking ?? "") ? "Garage" : "Parking");
  if (b?.cave) out.add("Cave");
  return EQUIPEMENTS.filter((x) => out.has(x));
}

/** Informations de l'avis : ce qui a été saisi, sinon ce que l'on sait du bien rattaché. */
export function avisComplet(e: Estimation, b?: Bien): AvisPlus {
  const a = asAvis(e).avis ?? {};
  const charges = b?.chargesAnnuelles ? Math.round(b.chargesAnnuelles / 12) : undefined;
  return {
    ...a,
    photos: a.photos ?? b?.photos ?? [],
    pagesPhotos: a.pagesPhotos ?? true,
    ges: a.ges ?? b?.ges,
    annee: a.annee ?? b?.anneeConstruction,
    taxeFonciere: a.taxeFonciere ?? b?.taxeFonciere,
    copro: a.copro ?? (b ? !!(b.lotsCopro || b.chargesAnnuelles) : e.type === "appartement"),
    chargesMois: a.chargesMois ?? charges,
    equipements: a.equipements ?? equipementsParDefaut(e, b),
    descriptif: a.descriptif ?? b?.description,
    pointsForts: a.pointsForts ?? b?.pointsForts ?? [],
    pointsVigilance: a.pointsVigilance ?? [],
    enVente: a.enVente ?? [],
  };
}

/** Une ligne par élément (listes saisies dans une zone de texte). */
export const lignes = (s: string) =>
  s
    .split("\n")
    .map((x) => x.replace(/^\s*[-•*]\s*/, "").trim())
    .filter(Boolean);

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

/** Points « à vérifier » réglés : clé du point (voir clePoint) → date où il a été coché.
    Rangé à côté du dossier, pas dedans : un nouvel import du dossier ne les efface pas. */
export type PointsRegles = Record<string, string>;

export type BienDossier = Bien & { dossier?: DossierBien; pointsRegles?: PointsRegles };

export const dossierDe = (b: Bien) => (b as BienDossier).dossier;
export const reglesDe = (b: Bien): PointsRegles => (b as BienDossier).pointsRegles ?? {};

/** Clé stable d'un point « à vérifier », tirée de son texte. */
export function clePoint(texte: string) {
  let h = 5381;
  for (let i = 0; i < texte.length; i++) h = (Math.imul(h, 33) + texte.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

/** Coche ou décoche un point : renvoie la nouvelle liste des points réglés. */
export function basculerPoint(regles: PointsRegles, texte: string, quand = new Date().toISOString()): PointsRegles {
  const cle = clePoint(texte);
  const { [cle]: deja, ...autres } = regles;
  return deja ? autres : { ...autres, [cle]: quand };
}

export type Categorie = "mandat" | "prix" | "copropriete" | "proprietaires" | "diagnostics" | "bien" | "autre";

export const CATEGORIES: Record<Categorie, string> = {
  mandat: "Mandat",
  prix: "Prix",
  copropriete: "Copropriété",
  proprietaires: "Propriétaires",
  diagnostics: "Diagnostics",
  bien: "Le bien",
  autre: "Autres",
};

const MOTS: Record<Exclude<Categorie, "autre">, RegExp> = {
  mandat: /mandat|avenant|statut|conseiller/i,
  prix: /prix|net vendeur|honoraires|offre/i,
  copropriete: /syndic|copropri|\blots?\b|tantièmes?|travaux|charges|taxe foncière|soldes?\b|désordres|quote-part|\bAG\b|assemblée|appels? de fonds/i,
  proprietaires: /propriét|ayants? droit|héritière?s?|indivis|succession|usufruit|régime matrimonial|situation familiale|\bnom\b|prénom|orthographe|adresse|téléphone|contacts?\b|e-mail|profession|naissance|signature|épouse/i,
  diagnostics: /\bDPE\b|\bGES\b|diagnostic|\bDDT\b|ADEME|amiante|\bclasses?\b/i,
  bien: /surface|pièces|étage|type|année|construction|code postal|quartier|ascenseur|chauffage|eau chaude|cave|cellier|stationnement|parking|nature|appartement|bâtiment|annonce|référence|loyer|bail|occupation/i,
};
// L'intitulé d'un point (« Prix : … ») dit son thème. Sans intitulé reconnu, on lit tout le texte,
// où le mandat est souvent cité comme simple source : il passe alors après les autres thèmes.
const ORDRE_TETE: Exclude<Categorie, "autre">[] = ["mandat", "prix", "copropriete", "proprietaires", "diagnostics", "bien"];
const ORDRE_TEXTE: Exclude<Categorie, "autre">[] = ["prix", "diagnostics", "copropriete", "proprietaires", "mandat", "bien"];

/** Thème d'un point « à vérifier ». */
export function categorie(point: string): Categorie {
  const tete = point.match(/^([^:]{2,70}) : /)?.[1];
  if (tete) for (const c of ORDRE_TETE) if (MOTS[c].test(tete)) return c;
  for (const c of ORDRE_TEXTE) if (MOTS[c].test(point)) return c;
  return "autre";
}

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

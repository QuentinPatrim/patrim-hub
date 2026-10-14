import type { Bien } from "./types";

/* Mandats du portefeuille de Quentin au 14/10/2026 (informations publiques des annonces
   et des fiches « Mémoire PATRIM »). Aucune donnée vendeur ici : à relier dans l'appli. */
type B = Partial<Bien> & Pick<Bien, "titre" | "type" | "adresse" | "ville" | "statut">;

export const MANDATS_PATRIM: B[] = [
  { ref: "TAPP99994", titre: "T3 avec chauffage collectif", type: "appartement", adresse: "12 boulevard de la Méditerranée", codePostal: "31400", ville: "Toulouse", quartier: "Pont des Demoiselles", prix: 219000, surface: 67.99, pieces: 3, chargesAnnuelles: 2977, taxeFonciere: 1300, chauffage: "Collectif (inclus dans les charges)", statut: "en_vente" },
  { ref: "TAPP99978", titre: "4 pièces avec parking et cellier", type: "appartement", adresse: "48 rue des Martyrs de la Libération", codePostal: "31500", ville: "Toulouse", prix: 446000, surface: 89.85, pieces: 4, parking: "Parking", statut: "en_vente", notes: "Compromis précédent annulé le 29/09/2026." },
  { ref: "TAPP99973", titre: "2 pièces avec parking", type: "appartement", adresse: "29 rue Denfert Rochereau", codePostal: "31000", ville: "Toulouse", prix: 163000, surface: 31, pieces: 2, parking: "Parking", statut: "compromis", notes: "Promesse prévue le 15/10/2026 à 17h." },
  { ref: "TAPP99962", titre: "T3 à Belle Paule", type: "appartement", adresse: "26 chemin du Coin de la Moure", codePostal: "31500", ville: "Toulouse", quartier: "Belle Paule", prix: 125000, surface: 45, pieces: 3, statut: "en_vente", notes: "Référence à confirmer." },
  { ref: "TAPP99990", titre: "Studio meublé loué", type: "appartement", adresse: "21 avenue des Écoles Jules Julien", codePostal: "31400", ville: "Toulouse", quartier: "Jules Julien", prix: 123000, surface: 20.65, pieces: 1, etage: 4, statut: "en_vente", notes: "Loué 599 € charges comprises. Référence à confirmer." },
  { ref: "TAPP99983", titre: "T1 bis au 8e avec ascenseur", type: "appartement", adresse: "17 rue Rosette", codePostal: "31500", ville: "Toulouse", quartier: "Montserby", prix: 86000, surface: 26.83, pieces: 1, etage: 8, ascenseur: true, statut: "en_vente", notes: "Référence à confirmer." },
  { ref: "TAPP99970", titre: "T3 avec 2 parkings", type: "appartement", adresse: "1 rue Mathieu Berdoulat", codePostal: "31100", ville: "Toulouse", prix: 149500, surface: 55, pieces: 3, parking: "2 parkings", statut: "en_vente", notes: "Référence à confirmer. Mandat : 149 000 € net vendeur + 6 000 € (écart avec l'annonce à vérifier)." },
  { titre: "Appartement rue Merly", type: "appartement", adresse: "28 rue Merly", codePostal: "31000", ville: "Toulouse", prix: 164000, surface: 27.7, statut: "en_vente" },
  { titre: "Appartement avec parking", type: "appartement", adresse: "29 rue de la Charbonnière", codePostal: "31400", ville: "Toulouse", prix: 112000, netVendeur: 105000, honoraires: 7000, parking: "Parking", statut: "sous_offre", notes: "Offre acceptée le 17/07, avant-contrat en préparation." },
  { titre: "Maison de ville T4 duplex + studio", type: "maison", adresse: "9 ter rue Compans", codePostal: "31500", ville: "Toulouse", netVendeur: 550000, surface: 140, statut: "en_vente", notes: "Prix FAI à compléter." },
];

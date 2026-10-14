/* ============================================================
   Modèle de données PATRIM Hub
   Chaque objet est stocké comme un document JSON (table hub_docs
   dans Supabase, ou stockage local du navigateur en mode local).
   ============================================================ */

export interface Doc {
  id: string;
  createdAt: string; // ISO
  updatedAt: string; // ISO
}

// ---------- Biens / mandats ----------
export type BienType = "appartement" | "maison" | "terrain" | "local" | "immeuble" | "parking";
export type BienStatut = "estimation" | "mandat_signe" | "en_vente" | "sous_offre" | "compromis" | "vendu" | "retire";
export type MandatType = "simple" | "exclusif" | "semi_exclusif";
export type ClasseDpe = "A" | "B" | "C" | "D" | "E" | "F" | "G";

export interface Bien extends Doc {
  ref?: string;               // ex. TAPP99978
  titre: string;              // ex. "T3 lumineux avec balcon"
  type: BienType;
  adresse: string;
  codePostal?: string;
  ville: string;
  quartier?: string;
  lat?: number;
  lon?: number;
  prix?: number;              // prix affiché FAI
  netVendeur?: number;
  honoraires?: number;        // en euros
  honorairesCharge?: "acquereur" | "vendeur";
  surface?: number;           // m² (Carrez si copro)
  surfaceTerrain?: number;
  pieces?: number;
  chambres?: number;
  etage?: number;
  nbEtages?: number;
  ascenseur?: boolean;
  exterieur?: string;         // balcon, terrasse, jardin…
  parking?: string;
  cave?: boolean;
  anneeConstruction?: number;
  chauffage?: string;
  dpe?: ClasseDpe;
  ges?: ClasseDpe;
  chargesAnnuelles?: number;
  taxeFonciere?: number;
  lotsCopro?: number;
  statut: BienStatut;
  mandat?: { numero?: string; type?: MandatType; debut?: string; fin?: string };
  vendeurIds?: string[];      // contacts vendeurs (confidentiel, jamais dans un contenu public)
  photos?: string[];          // URLs (Drive, portail…) ou data URL
  description?: string;
  pointsForts?: string[];
  driveUrl?: string;
  annonceUrl?: string;
  notes?: string;
  dateMiseEnVente?: string;
}

// ---------- Contacts (acquéreurs, vendeurs, prospects) ----------
export type ContactRole = "acquereur" | "vendeur" | "prospect_vendeur" | "locataire" | "partenaire";
export type EtapeAcquereur = "nouveau" | "qualifie" | "visite" | "offre" | "compromis" | "gagne" | "perdu";
export type Source = "seloger" | "leboncoin" | "bienici" | "site" | "telephone" | "vitrine" | "recommandation" | "instagram" | "pige" | "autre";

export interface Criteres {
  types?: BienType[];
  budgetMax?: number;
  budgetMin?: number;
  surfaceMin?: number;
  piecesMin?: number;
  quartiers?: string[];
  exterieur?: boolean;
  parking?: boolean;
  ascenseur?: boolean;
  investissement?: boolean;
  remarques?: string;
}

export interface Contact extends Doc {
  civilite?: "M." | "Mme" | "";
  prenom?: string;
  nom: string;
  tel?: string;
  email?: string;
  roles: ContactRole[];
  source?: Source;
  etape?: EtapeAcquereur;       // pipeline acquéreur
  criteres?: Criteres;
  financement?: { apport?: number; accordBanque?: boolean; courtier?: string; aVendre?: boolean };
  chaleur?: 1 | 2 | 3;          // 1 froid, 2 tiède, 3 chaud
  optinTel?: boolean;           // accord préalable au démarchage téléphonique (loi 2026)
  optinTelDate?: string;        // date de l'accord (preuve)
  adresse?: string;             // utile pour les vendeurs
  biensProposes?: string[];     // ids de biens
  bienOrigineId?: string;       // bien du lead entrant
  prochaineAction?: string;
  dateRelance?: string;         // AAAA-MM-JJ
  dernierContact?: string;      // ISO
  notes?: string;
  historique?: { date: string; type: "appel" | "mail" | "sms" | "visite" | "note"; texte: string }[];
}

// ---------- Agenda : visites, rendez-vous ----------
export type RdvType = "visite" | "estimation" | "appel" | "signature" | "rdv_vendeur" | "autre";
export interface Rdv extends Doc {
  type: RdvType;
  debut: string;              // ISO
  fin?: string;               // ISO
  titre?: string;
  bienId?: string;
  contactIds?: string[];
  lieu?: string;
  statut: "prevu" | "fait" | "annule";
  compteRendu?: string;
  avisClient?: 1 | 2 | 3 | 4 | 5;
  suite?: string;
}

// ---------- Estimations ----------
export type EtatBien = "a_renover" | "a_rafraichir" | "bon" | "refait" | "neuf";
export interface Comparable {
  adresse: string;
  date: string;
  prix: number;
  surface: number;
  pieces?: number;
  prixM2: number;
  distance?: number;
  source: "dvf" | "annonce" | "agence";
}
export interface Estimation extends Doc {
  adresse: string;
  codePostal?: string;
  ville?: string;
  lat?: number;
  lon?: number;
  type: "appartement" | "maison";
  surface: number;
  pieces?: number;
  etage?: number;
  ascenseur?: boolean;
  exterieur?: string;
  parking?: boolean;
  etat?: EtatBien;
  dpe?: ClasseDpe;
  proprietaireId?: string;    // contact
  comparables?: Comparable[];
  resultat?: { bas: number; median: number; haut: number; prixM2: number; ajustements?: { label: string; pct: number }[]; commentaire?: string };
  prixConseille?: number;
  statut: "a_faire" | "envoyee" | "mandat" | "perdue";
  notes?: string;
  bienId?: string;            // bien créé si mandat signé
}

// ---------- Tâches ----------
export interface Tache extends Doc {
  titre: string;
  echeance?: string;          // AAAA-MM-JJ
  fait: boolean;
  priorite?: 1 | 2 | 3;
  lien?: { kind: "bien" | "contact" | "estimation" | "rdv"; id: string };
  origine: "moi" | "agent";
  detail?: string;
}

// ---------- Marketing ----------
export type Canal = "instagram_post" | "instagram_reel" | "instagram_story" | "facebook" | "linkedin" | "annonce" | "email" | "video";
export interface Contenu extends Doc {
  bienId?: string;
  canal: Canal;
  titre: string;
  texte: string;
  hashtags?: string[];
  visuels?: string[];
  statut: "idee" | "brouillon" | "pret" | "programme" | "publie";
  datePrevue?: string;
}

// ---------- Briefings des agents de nuit ----------
export interface Briefing extends Doc {
  date: string;               // AAAA-MM-JJ
  resume: string;
  points: { titre: string; detail?: string; lien?: { kind: string; id: string }; type: "relance" | "matching" | "mandat" | "marketing" | "alerte" | "idee" }[];
}

export type Collections = {
  biens: Bien;
  contacts: Contact;
  rdvs: Rdv;
  estimations: Estimation;
  taches: Tache;
  contenus: Contenu;
  briefings: Briefing;
};
export type Kind = keyof Collections;

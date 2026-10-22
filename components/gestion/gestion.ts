"use client";

/* ============================================================
   Mandat de gestion locative PATRIM : brouillon, valeurs de départ
   tirées de la fiche du bien, tarifs de l'agence (annexe).
   Texte repris du modèle de l'agence (loi Hoguet, ICSIGN,
   médiation, RGPD), avec la rétractation de 14 jours et les
   plafonds d'honoraires de location en vigueur.
   ============================================================ */

import { adresseComplete } from "@/components/biens/utils";
import { dossierDe } from "@/components/biens/dossier";
import { AGENCE } from "@/components/documents/charte";
import { CHAMPS_MANDAT, NATURES, signataireRetenu, retenirSignataire, type Nature, type Signataire, avecSignataire } from "@/components/mandat/mandat";
import { civiliteLongue, manquants, partieDepuisContact, type ContactEtatCivil, type Partie } from "@/components/offre/offre";
import { PLAFONDS, type Zone } from "@/components/location/loi";
import { today } from "@/lib/format";
import type { Bien } from "@/lib/types";

export { CHAMPS_MANDAT as CHAMPS_GESTION, NATURES };

export type Usage = "habitation" | "mixte" | "professionnel" | "commercial";
export const USAGES: { v: Usage; label: string }[] = [
  { v: "habitation", label: "Habitation" },
  { v: "mixte", label: "Mixte habitation et professionnel" },
  { v: "professionnel", label: "Professionnel" },
  { v: "commercial", label: "Commercial" },
];

/** Tarifs des prestations supplémentaires (annexe du modèle de l'agence). Révisables : à tenir à jour. */
export const TARIFS = {
  assemblee: 120,
  declaration: 80,
  gli: 2.8,
  pj: { habitation: 79, commercial: 115, meuble: 89 },
  pno: { appartement: 80, commercial: 180 },
  sinistre: 40,
  expertise: 40,
};

export interface Gestion {
  bienId: string;
  /** Copie gardée sur la fiche du bien (voir components/documents/archive.ts). */
  acteId?: string;
  numero?: string;
  mandants: Partie[];
  qualite: string;
  nature: Nature;
  natureAutre?: string;
  garage?: string;
  cave?: string;
  identifiantFiscal?: string;
  lots?: string;
  adresseBien: string;
  tic: boolean;
  usage: Usage;

  /* Bien vacant : conditions de location souhaitées (annexe) */
  vacant: boolean;
  meuble?: boolean;
  loyerSouhaite?: number;
  chargesSouhaitees?: number;
  disponible?: string;

  /* Rémunération */
  tauxHt: number;
  fixeHt: number;
  /** Honoraires de première mise en location offerts au mandant. */
  premiereOfferte: boolean;
  /** Tarif de location de l'agence, TTC par m² habitable et par partie (état des lieux compris). */
  tarifNu: number;
  tarifMeuble: number;
  /** Limite éventuelle, en % d'un mois de loyer charges comprises. */
  limiteNu?: number;
  limiteMeuble?: number;
  reparationsMax: number;

  /* Assurances souscrites par l'intermédiaire de l'agence (annexe) */
  gli: boolean;
  pj: boolean;
  pno: boolean;

  dureeMois: number;
  /** Le mandant demande que la gestion commence avant la fin du délai de rétractation (bien déjà loué, par exemple). */
  executionImmediate?: boolean;
  conditionsParticulieres?: string;
  prospection: boolean;
  signataire: Signataire;
  date: string;
  maj: string;
}

/* ---------- Brouillon sur l'appareil ---------- */

const cle = (bienId: string) => `patrim-hub:gestion:${bienId}`;

export function lireGestion(bienId: string): Gestion | null {
  try {
    const raw = localStorage.getItem(cle(bienId));
    return raw ? avecSignataire(JSON.parse(raw) as Gestion) : null;
  } catch {
    return null;
  }
}
export function ecrireGestion(g: Gestion) {
  try {
    localStorage.setItem(cle(g.bienId), JSON.stringify({ ...g, maj: new Date().toISOString() }));
  } catch {}
  retenirSignataire(g.signataire);
}
export function effacerGestion(bienId: string) {
  try {
    localStorage.removeItem(cle(bienId));
  } catch {}
}

const NATURE_DE: Record<Bien["type"], Nature> = { appartement: "Appartement", maison: "Maison", local: "Local", immeuble: "Immeuble", parking: "Garage", terrain: "Terrain" };

export function gestionInitiale(b: Bien, proprietaires: ContactEtatCivil[]): Gestion {
  const d = dossierDe(b);
  return {
    bienId: b.id,
    mandants: proprietaires.map(partieDepuisContact),
    qualite: proprietaires.length > 1 ? "Propriétaires du bien ci-dessous désigné" : "Propriétaire du bien ci-dessous désigné",
    nature: NATURE_DE[b.type],
    lots: d?.lots,
    adresseBien: [adresseComplete(b), d?.complementAdresse].filter(Boolean).join(", "),
    tic: true,
    usage: b.type === "local" ? "commercial" : "habitation",
    vacant: true,
    tauxHt: 7,
    fixeHt: 1,
    premiereOfferte: false,
    tarifNu: 11,
    tarifMeuble: 13,
    limiteNu: 80,
    reparationsMax: 200,
    gli: false,
    pj: false,
    pno: false,
    dureeMois: 12,
    prospection: false,
    signataire: signataireRetenu(),
    date: today(),
    maj: new Date().toISOString(),
  };
}

export const titreGestion = (g: Gestion) => `Mandat de gestion${g.numero ? ` n° ${g.numero}` : ""}`;
/** Taux toutes taxes comprises (TVA 20 %). */
export const ttc = (ht: number) => Math.round(ht * 1.2 * 100) / 100;

export function manquantsGestion(g: Gestion) {
  return g.mandants.reduce((n, p) => n + manquants(p, CHAMPS_MANDAT).length, 0) + (g.numero ? 0 : 1) + (g.signataire.email ? 0 : 1) + (g.signataire.tel ? 0 : 1);
}

/** Points à revoir avant d'éditer le mandat. */
export function alertesGestion(g: Gestion, zone: Zone = "tendue"): { niveau: "danger" | "warn"; texte: string }[] {
  const out: { niveau: "danger" | "warn"; texte: string }[] = [];
  const max = PLAFONDS.bail[zone] + PLAFONDS.edl;
  for (const [t, label] of [[g.tarifNu, "location vide"], [g.tarifMeuble, "location meublée"]] as const)
    if (t > max)
      out.push({ niveau: "danger", texte: `Tarif ${label} au-dessus du plafond légal pour la part du locataire (${max.toLocaleString("fr-FR")} €/m² en ${PLAFONDS.annee}, état des lieux compris) : le locataire ne paiera que le plafond.` });
  if (g.tauxHt <= 0) out.push({ niveau: "warn", texte: "Taux de gestion à zéro." });
  if (!g.vacant && g.loyerSouhaite) out.push({ niveau: "warn", texte: "Le bien est indiqué comme loué : les conditions de location souhaitées ne figureront pas au mandat." });
  return out;
}

/** Mail au propriétaire pour réunir ce qu'il faut au mandat de gestion (brouillon, jamais envoyé automatiquement). */
export function mailDemandeGestion(p: Partie) {
  const manque = new Set(manquants(p, CHAMPS_MANDAT).map((m) => m.key));
  const items = [
    "une copie de votre pièce d'identité en cours de validité (recto verso)",
    "une copie de votre titre de propriété",
    "votre RIB, pour le versement mensuel des loyers",
    manque.has("adresse") && "votre adresse actuelle complète",
    manque.has("dateNaissance") || manque.has("lieuNaissance") ? "votre date et votre lieu de naissance" : null,
    manque.has("profession") && "votre profession",
    manque.has("email") || manque.has("tel") ? "l'adresse e-mail et le numéro de portable à utiliser pour la signature électronique (ils doivent être personnels)" : null,
    "l'identifiant fiscal du logement (espace impots.gouv.fr, rubrique « Biens immobiliers »)",
    "les diagnostics à annexer au bail (DPE, électricité et gaz de plus de 15 ans, état des risques, amiante, plomb si l'immeuble date d'avant 1949) et, en copropriété, le règlement de copropriété et le dernier décompte de charges",
  ].filter(Boolean) as string[];
  return {
    sujet: "Votre mandat de gestion locative – PATRIM",
    corps: [
      `Bonjour ${[civiliteLongue(p), p.nom].filter(Boolean).join(" ")},`.replace("Bonjour ,", "Bonjour,"),
      "",
      "Pour préparer le mandat de gestion de votre bien, pourriez-vous me transmettre :",
      ...items.map((i) => `• ${i} ;`),
      "",
      "Le mandat sera ensuite signé électroniquement via ICSIGN : vous recevrez un lien pour le signer en ligne, depuis votre téléphone ou votre ordinateur.",
      "",
      "Je reste à votre disposition pour toute question.",
      "",
      "Bien cordialement,",
      `${AGENCE.conseiller} – PATRIM`,
      AGENCE.conseillerTel,
    ].join("\n"),
  };
}

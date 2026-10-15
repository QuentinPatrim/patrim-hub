"use client";

/* ============================================================
   Mandat de vente simple PATRIM : brouillon et textes.
   Texte repris du modèle de l'agence (mandat de vente simple,
   clause ICSIGN, rétractation, médiation, RGPD).
   ============================================================ */

import { adresseComplete } from "@/components/biens/utils";
import { AGENCE } from "@/components/documents/charte";
import { CHAMPS, civiliteLongue, manquants, partieDepuisContact, type Champ, type ContactEtatCivil, type Partie } from "@/components/offre/offre";
import { today } from "@/lib/format";
import type { Bien, MandatType } from "@/lib/types";

export const CHAMPS_MANDAT: Champ[] = [...CHAMPS, { key: "profession", label: "Profession", demande: "votre profession" }];

export const NATURES = ["Appartement", "Maison", "Local", "Immeuble", "Garage", "Terrain", "Autre"] as const;
export type Nature = (typeof NATURES)[number];

export const DIAGNOSTICS = [
  "État amiante",
  "État parasitaire",
  "Constat de risque d'exposition au plomb",
  "État des risques",
  "Audit énergétique",
  "Diagnostic de performance énergétique",
  "État de l'installation intérieure d'électricité",
  "État de l'installation intérieure de gaz",
  "Contrôle assainissement (collectif ou individuel)",
  "Bornage",
  "Plan d'exposition au bruit",
] as const;

export const TYPES_MANDAT: { v: MandatType; label: string; titre: string }[] = [
  { v: "simple", label: "Simple", titre: "Mandat de vente simple" },
  { v: "semi_exclusif", label: "Semi-exclusif", titre: "Mandat de vente semi-exclusif" },
  { v: "exclusif", label: "Exclusif", titre: "Mandat de vente exclusif" },
];
/** Brouillons d'avant le choix du type : mandat simple. */
export const typeMandat = (m: Mandat): MandatType => m.type ?? "simple";
export const titreMandat = (m: Mandat) => TYPES_MANDAT.find((t) => t.v === typeMandat(m))!.titre;
/** Loi Hoguet (art. 6) : un mandat avec exclusivité doit préciser les actions du mandataire et la façon dont il rend compte. */
export const avecExclusivite = (m: Mandat) => typeMandat(m) !== "simple";

/** Textes proposés au passage en exclusif ou semi-exclusif (modifiables). */
export const ACTIONS_EXCLU =
  "Photographies du bien et diffusion de l'annonce sur le site patrim.fr et les portails immobiliers, présentation aux acquéreurs du fichier de l'agence, visites accompagnées par le mandataire.";
export const COMPTES_RENDUS_EXCLU = "Compte rendu par e-mail après chaque visite et point complet au moins une fois par mois.";

export interface Signataire {
  nom: string;
  qualite: string;
  email?: string;
  tel?: string;
}

export interface Mandat {
  bienId: string;
  /** Copie gardée sur la fiche du bien (voir components/documents/archive.ts). */
  acteId?: string;
  type?: MandatType;
  numero?: string;
  mandants: Partie[];
  qualite: string;
  nature: Nature;
  natureAutre?: string;
  lots?: string;
  adresseBien: string;
  occupation: "libre" | "loue";
  netVendeur?: number;
  honoraires?: number;
  charge: "acquereur" | "vendeur";
  conditionsParticulieres?: string;
  carrez?: string;
  diffusion: string;
  actions?: string;
  comptesRendus?: string;
  diagnostics: string[];
  dureeMois: number;
  prospection: boolean;
  signataire: Signataire;
  date: string;
  maj: string;
}

/* ---------- Brouillon sur l'appareil ---------- */

const cle = (bienId: string) => `patrim-hub:mandat:${bienId}`;
const CLE_SIGNATAIRE = "patrim-hub:mandat:signataire";

export function lireMandat(bienId: string): Mandat | null {
  try {
    const raw = localStorage.getItem(cle(bienId));
    return raw ? (JSON.parse(raw) as Mandat) : null;
  } catch {
    return null;
  }
}
export function ecrireMandat(m: Mandat) {
  try {
    localStorage.setItem(cle(m.bienId), JSON.stringify({ ...m, maj: new Date().toISOString() }));
  } catch {}
  retenirSignataire(m.signataire);
}
/** Signataire pour PATRIM gardé sur l'appareil (mandats et avenants). */
export function retenirSignataire(s: Signataire) {
  try {
    localStorage.setItem(CLE_SIGNATAIRE, JSON.stringify(s));
  } catch {}
}
export function effacerMandat(bienId: string) {
  try {
    localStorage.removeItem(cle(bienId));
  } catch {}
}
export function signataireRetenu(): Signataire {
  try {
    const raw = localStorage.getItem(CLE_SIGNATAIRE);
    if (raw) return JSON.parse(raw) as Signataire;
  } catch {}
  // Président de la SAS (information publique du registre du commerce) ; coordonnées à saisir une fois.
  return { nom: "Monsieur Julien PASSERINI", qualite: "président" };
}

const NATURE_DE: Record<Bien["type"], Nature> = { appartement: "Appartement", maison: "Maison", local: "Local", immeuble: "Immeuble", parking: "Garage", terrain: "Terrain" };

export function mandatInitial(b: Bien, vendeurs: ContactEtatCivil[]): Mandat {
  const honoraires = b.honoraires ?? (b.prix && b.netVendeur ? b.prix - b.netVendeur : undefined);
  return {
    bienId: b.id,
    type: b.mandat?.type ?? "simple",
    numero: b.mandat?.numero,
    mandants: vendeurs.map(partieDepuisContact),
    qualite: vendeurs.length > 1 ? "Agissant conjointement et solidairement en qualité de seuls propriétaires" : "Agissant en qualité de seul propriétaire",
    nature: NATURE_DE[b.type],
    lots: b.lotsCopro && b.type === "appartement" ? "" : undefined,
    adresseBien: adresseComplete(b),
    occupation: "libre",
    netVendeur: b.netVendeur ?? (b.prix && honoraires ? b.prix - honoraires : undefined),
    honoraires,
    charge: b.honorairesCharge ?? "acquereur",
    carrez: b.surface && b.type === "appartement" ? `${b.surface.toLocaleString("fr-FR")} m²` : undefined,
    diffusion: "Fichier clients et portails immobiliers",
    diagnostics: [],
    dureeMois: 12,
    ...(b.mandat?.type && b.mandat.type !== "simple" ? { actions: ACTIONS_EXCLU, comptesRendus: COMPTES_RENDUS_EXCLU } : {}),
    prospection: false,
    signataire: signataireRetenu(),
    date: today(),
    maj: new Date().toISOString(),
  };
}

/** Mail au vendeur pour réunir ce qu'il faut au mandat (brouillon, jamais envoyé automatiquement). */
export function mailDemandeMandat(p: Partie) {
  const manque = new Set(manquants(p, CHAMPS_MANDAT).map((m) => m.key));
  const items = [
    "une copie de votre pièce d'identité en cours de validité (recto verso)",
    "une copie de votre titre de propriété",
    manque.has("adresse") && "votre adresse actuelle complète",
    manque.has("dateNaissance") || manque.has("lieuNaissance") ? "votre date et votre lieu de naissance" : null,
    manque.has("profession") && "votre profession",
    manque.has("email") || manque.has("tel") ? "l'adresse e-mail et le numéro de portable à utiliser pour la signature électronique (ils doivent être personnels)" : null,
    "les diagnostics et documents dont vous disposez déjà (DPE, bail en cours si le bien est loué, documents de copropriété)",
  ].filter(Boolean) as string[];
  return {
    sujet: "Votre mandat de vente – PATRIM",
    corps: [
      `Bonjour ${[civiliteLongue(p), p.nom].filter(Boolean).join(" ")},`.replace("Bonjour ,", "Bonjour,"),
      "",
      "Pour préparer le mandat de vente de votre bien, pourriez-vous me transmettre :",
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

export const dureeLettres = (n: number) =>
  ({ 3: "TROIS", 6: "SIX", 9: "NEUF", 12: "DOUZE", 18: "DIX-HUIT", 24: "VINGT-QUATRE" })[n] ?? String(n);

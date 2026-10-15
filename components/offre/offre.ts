"use client";

/* ============================================================
   Offre d'achat : brouillon, parties, textes.
   Le brouillon (prix, conditions) reste sur l'appareil. L'état
   civil des parties est rangé dans leur fiche contact, pour ne
   pas avoir à le ressaisir.
   ============================================================ */

import { update } from "@/lib/store";
import { titrePublic } from "@/lib/titrePublic";
import { AGENCE } from "@/components/documents/charte";
import type { Bien, Contact } from "@/lib/types";

export type ContactEtatCivil = Contact & { dateNaissance?: string; lieuNaissance?: string; profession?: string };

export interface Partie {
  contactId?: string;
  civilite?: "M." | "Mme" | "";
  prenom?: string;
  nom?: string;
  dateNaissance?: string; // AAAA-MM-JJ
  lieuNaissance?: string;
  adresse?: string;
  email?: string;
  tel?: string;
  profession?: string;
}

export type Motif = "pret" | "vente" | "autre";

export interface Offre {
  bienId: string;
  acquereurs: Partie[];
  vendeurs: Partie[];
  designation: string;
  adresseBien: string;
  mandatNumero?: string;
  prix?: number;
  honoraires?: number;
  charge: "acquereur" | "vendeur";
  financement: "pret" | "comptant";
  /** Détailler l'apport et le prêt dans l'offre : facultatif, tous les acquéreurs ne communiquent pas ces chiffres. */
  detailFinancement?: boolean;
  apport?: number;
  montantPret?: number;
  dureePret?: number; // années
  tauxMax?: number; // %
  conditionSuspensive: boolean;
  motif: Motif;
  motifTexte?: string;
  validiteJours: number;
  conditionsParticulieres?: string;
  date: string; // AAAA-MM-JJ
  maj: string;
}

/* ---------- Brouillon sur l'appareil ---------- */

const cle = (bienId: string) => `patrim-hub:offre:${bienId}`;

/** Brouillons d'avant l'option : le détail était affiché dès qu'un montant était saisi. */
export const detailFinancement = (o: Offre) => o.detailFinancement ?? (o.apport != null || o.montantPret != null);

export function lireOffre(bienId: string): Offre | null {
  try {
    const raw = localStorage.getItem(cle(bienId));
    return raw ? (JSON.parse(raw) as Offre) : null;
  } catch {
    return null;
  }
}
export function ecrireOffre(o: Offre) {
  try {
    localStorage.setItem(cle(o.bienId), JSON.stringify({ ...o, maj: new Date().toISOString() }));
  } catch {}
}
export function effacerOffre(bienId: string) {
  try {
    localStorage.removeItem(cle(bienId));
  } catch {}
}

/* ---------- Parties ---------- */

export function partieDepuisContact(c: ContactEtatCivil): Partie {
  return {
    contactId: c.id,
    civilite: c.civilite,
    prenom: c.prenom,
    nom: c.nom,
    dateNaissance: c.dateNaissance,
    lieuNaissance: c.lieuNaissance,
    adresse: c.adresse,
    email: c.email,
    tel: c.tel,
    profession: c.profession,
  };
}

/** Recopie l'état civil saisi dans l'offre vers la fiche contact (sans effacer ce qui existe). */
export function enregistrerParties(parties: Partie[], contacts: ContactEtatCivil[]) {
  for (const p of parties) {
    const c = contacts.find((x) => x.id === p.contactId);
    if (!c) continue;
    const patch: Partial<ContactEtatCivil> = {};
    (["civilite", "prenom", "nom", "dateNaissance", "lieuNaissance", "adresse", "email", "tel", "profession"] as const).forEach((k) => {
      const v = p[k]?.trim();
      if (v && v !== (c[k] ?? "")) (patch as Record<string, string>)[k] = v;
    });
    if (Object.keys(patch).length) update("contacts", c.id, patch as Partial<Contact>);
  }
}

export type Champ = { key: keyof Partie; label: string; demande: string };
export const CHAMPS: Champ[] = [
  { key: "prenom", label: "Prénom", demande: "" },
  { key: "nom", label: "Nom", demande: "" },
  { key: "dateNaissance", label: "Date de naissance", demande: "votre date de naissance" },
  { key: "lieuNaissance", label: "Lieu de naissance", demande: "votre lieu de naissance (ville et département)" },
  { key: "adresse", label: "Adresse", demande: "votre adresse actuelle complète" },
  { key: "email", label: "E-mail", demande: "votre adresse e-mail" },
  { key: "tel", label: "Portable", demande: "votre numéro de portable" },
];

export const manquants = (p: Partie, champs: Champ[] = CHAMPS) => champs.filter((c) => !p[c.key]?.toString().trim());

/* ---------- Textes ---------- */

export const civiliteLongue = (p: Partie) => (p.civilite === "M." ? "Monsieur" : p.civilite === "Mme" ? "Madame" : "");
export const ne = (p: Partie) => (p.civilite === "M." ? "né" : p.civilite === "Mme" ? "née" : "né(e)");
export const nomOffre = (p: Partie) => [civiliteLongue(p), p.prenom, p.nom?.toUpperCase()].filter(Boolean).join(" ");

export const dateLettres = (ymd?: string) =>
  ymd ? new Date(ymd + "T12:00:00").toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" }) : "";

/** Désignation de départ, à compléter par le conseiller (rien n'est inventé). */
export function designationDepuisBien(b: Bien) {
  const type = { appartement: "Un appartement", maison: "Une maison", terrain: "Un terrain", local: "Un local", immeuble: "Un immeuble", parking: "Un emplacement de stationnement" }[b.type];
  const parts = [
    type + (b.pieces && (b.type === "appartement" || b.type === "maison") ? ` de ${b.pieces === 1 ? "type studio (T1)" : `${b.pieces} pièces`}` : ""),
    b.surface ? `d'une surface de ${b.surface.toLocaleString("fr-FR")} m²${b.type === "appartement" ? " (loi Carrez)" : " habitables"}` : "d'une surface de [À compléter] m²",
    b.type === "appartement" && b.etage != null ? `situé ${b.etage === 0 ? "au rez-de-chaussée" : `au ${b.etage}e étage`}` : "",
    b.surfaceTerrain ? `sur un terrain de ${b.surfaceTerrain.toLocaleString("fr-FR")} m²` : "",
  ].filter(Boolean);
  const annexes = [b.exterieur, b.parking, b.cave ? "une cave" : ""].filter(Boolean).join(", ");
  return `${parts.join(", ")}, composé de [À compléter : pièces]${annexes ? `, avec ${annexes}` : ""}.${b.type === "appartement" ? " Lot(s) de copropriété n° [À compléter]." : ""}`;
}

const salutation = (p: Partie, vendeur: boolean) => (vendeur || !p.prenom ? `Bonjour ${[civiliteLongue(p), p.nom].filter(Boolean).join(" ")}`.trim() : `Bonjour ${p.prenom}`) + ",";

/** Mail de demande des pièces et informations manquantes (brouillon, jamais envoyé automatiquement). */
export function mailDemande(p: Partie, b: Bien, role: "acquereur" | "vendeur", avecFinancement: boolean) {
  const manque = new Set(manquants(p).map((m) => m.key));
  const items = [
    "une copie de votre pièce d'identité en cours de validité (recto verso)",
    manque.has("adresse") && "votre adresse actuelle complète",
    manque.has("dateNaissance") || manque.has("lieuNaissance") ? "votre date et votre lieu de naissance" : null,
    manque.has("email") || manque.has("tel")
      ? "l'adresse e-mail et le numéro de portable à utiliser pour la signature électronique (ils doivent être personnels)"
      : null,
    role === "acquereur" && avecFinancement && "le montant de votre apport et, si vous l'avez, votre accord de principe bancaire",
  ].filter(Boolean) as string[];
  const bien = titrePublic(b);
  const intro =
    role === "acquereur"
      ? `Pour rédiger votre offre d'achat sur le bien « ${bien} », pourriez-vous me transmettre :`
      : `Dans la perspective de la rédaction d'une offre d'achat sur votre bien, pourriez-vous me transmettre :`;
  return {
    sujet: role === "acquereur" ? `Votre offre d'achat – ${bien}` : `Votre bien – informations pour l'offre d'achat`,
    corps: [
      salutation(p, role === "vendeur"),
      "",
      intro,
      ...items.map((i) => `• ${i} ;`),
      "",
      "L'offre sera ensuite signée électroniquement via ICSIGN : vous recevrez un lien pour la signer en ligne, depuis votre téléphone ou votre ordinateur.",
      "",
      "Je reste à votre disposition pour toute question.",
      "",
      "Bien cordialement,",
      `${AGENCE.conseiller} – PATRIM`,
      AGENCE.conseillerTel,
    ].join("\n"),
  };
}

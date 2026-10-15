"use client";

/* ============================================================
   Transmission du dossier au notaire, une fois l'offre acceptée :
   le mail qui lance l'avant-contrat (bien, parties, prix,
   financement, copropriété, occupation, diagnostics, pièces).
   Rempli depuis l'offre gardée sur la fiche et le dossier du bien.
   Brouillon sur l'appareil ; rien n'est envoyé d'ici.
   ============================================================ */

import { adresseComplete } from "@/components/biens/utils";
import { dossierDe } from "@/components/biens/dossier";
import { AGENCE, telActe } from "@/components/documents/charte";
import { TYPES_MANDAT } from "@/components/mandat/mandat";
import { CHAMPS, dateLettres, designationDepuisBien, detailFinancement, ne, nomOffre, partieDepuisContact, type Champ, type ContactEtatCivil, type Offre, type Partie } from "@/components/offre/offre";
import type { Acte } from "@/components/documents/archive";
import { diagnosticsSuivis, resumeDiagnostics } from "@/components/diagnostics/diagnostics";
import { today } from "@/lib/format";
import type { Bien } from "@/lib/types";

/** Pour les vendeurs, le notaire a l'état civil par le titre : nom et coordonnées suffisent. */
export const CHAMPS_VENDEUR: Champ[] = CHAMPS.filter((c) => ["prenom", "nom", "adresse", "email", "tel"].includes(c.key));

export const PIECES = [
  { cle: "offre", chip: "Offre signée", texte: "l'offre d'achat signée" },
  { cle: "mandat", chip: "Mandat", texte: "le mandat de vente" },
  { cle: "identite", chip: "Pièces d'identité", texte: "les pièces d'identité des parties" },
  { cle: "titre", chip: "Titre de propriété", texte: "le titre de propriété" },
  { cle: "ddt", chip: "Diagnostics (DDT)", texte: "le dossier de diagnostic technique" },
  { cle: "copro", chip: "Pièces de copropriété", texte: "les pièces de copropriété" },
  { cle: "charges", chip: "Décompte de charges", texte: "le dernier décompte de charges" },
  { cle: "tf", chip: "Taxe foncière", texte: "l'avis de taxe foncière" },
  { cle: "bail", chip: "Bail et état des lieux", texte: "le bail en cours avec l'état des lieux d'entrée" },
] as const;
export type ClePiece = (typeof PIECES)[number]["cle"];

export interface Transmission {
  bienId: string;
  /** Offre gardée sur la fiche du bien d'où viennent les parties et le prix. */
  offreActeId?: string;
  /** E-mails du ou des notaires, séparés par des virgules. */
  destinataires: string;
  offreDate?: string; // AAAA-MM-JJ
  acceptation?: string; // AAAA-MM-JJ
  acquereurs: Partie[];
  vendeurs: Partie[];
  prix?: number;
  honoraires?: number;
  charge: "acquereur" | "vendeur";
  financement: "pret" | "comptant";
  montantPret?: number;
  conditionSuspensive: boolean;
  bien: string;
  copropriete: string;
  occupation: string;
  diagnostics: string;
  attention: string;
  pieces: ClePiece[];
  lien?: string;
  /** Demander au notaire s'il intervient pour les deux parties. */
  confrere: boolean;
  maj: string;
}

/* ---------- Brouillon sur l'appareil ---------- */

const cle = (bienId: string) => `patrim-hub:notaire:${bienId}`;

export function lireTransmission(bienId: string): Transmission | null {
  try {
    const raw = localStorage.getItem(cle(bienId));
    return raw ? (JSON.parse(raw) as Transmission) : null;
  } catch {
    return null;
  }
}
export function ecrireTransmission(t: Transmission) {
  try {
    localStorage.setItem(cle(t.bienId), JSON.stringify({ ...t, maj: new Date().toISOString() }));
  } catch {}
}
export function effacerTransmission(bienId: string) {
  try {
    localStorage.removeItem(cle(bienId));
  } catch {}
}

/* ---------- Brouillon de départ ---------- */

type ActeOffre = Extract<Acte, { kind: "offre" }>;

/** Offres gardées sur la fiche (sauf abandonnées), la plus récente d'abord. */
export const offresDuBien = (actes: Acte[]) => actes.filter((a): a is ActeOffre => a.kind === "offre" && a.statut !== "refuse").sort((x, y) => y.maj.localeCompare(x.maj));

/** L'offre demandée, sinon la dernière offre signée, sinon la plus récente. */
export function offreRetenue(actes: Acte[], id?: string | null): ActeOffre | undefined {
  const offres = offresDuBien(actes);
  return offres.find((a) => a.id === id) ?? offres.find((a) => a.statut === "signe") ?? offres[0];
}

export const emailsDe = (texte?: string) => [...new Set(texte?.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/g) ?? [])];

type DepuisOffre = Pick<
  Transmission,
  "offreActeId" | "offreDate" | "acceptation" | "acquereurs" | "vendeurs" | "prix" | "honoraires" | "charge" | "financement" | "montantPret" | "conditionSuspensive"
>;

/** Parties, prix et financement repris de l'offre (ou, sans offre, de la fiche du bien). */
export function depuisOffre(b: Bien, vendeurs: ContactEtatCivil[], acte?: ActeOffre): DepuisOffre {
  const o: Offre | undefined = acte?.data;
  const honoraires = b.honoraires ?? (b.prix && b.netVendeur ? b.prix - b.netVendeur : undefined);
  return {
    offreActeId: acte?.id,
    offreDate: o?.date,
    // Date à laquelle l'offre a été marquée signée dans l'appli : à vérifier à l'écran.
    acceptation: acte?.statut === "signe" ? acte.maj.slice(0, 10) : undefined,
    acquereurs: o?.acquereurs ?? [],
    vendeurs: o?.vendeurs.length ? o.vendeurs : vendeurs.map(partieDepuisContact),
    prix: o ? o.prix : b.prix,
    honoraires: o ? o.honoraires : honoraires,
    charge: o?.charge ?? b.honorairesCharge ?? "acquereur",
    financement: o?.financement ?? "pret",
    montantPret: o && detailFinancement(o) ? o.montantPret : undefined,
    conditionSuspensive: o ? o.financement === "pret" && o.conditionSuspensive : true,
  };
}

export function transmissionInitiale(b: Bien, vendeurs: ContactEtatCivil[], actes: Acte[], offreId?: string | null): Transmission {
  const d = dossierDe(b);
  const acte = offreRetenue(actes, offreId);
  const loue = /^\s*lou[ée]/i.test(d?.occupation ?? "");
  const copro = !!(d?.copropriete || d?.syndic || d?.lots);
  return {
    bienId: b.id,
    destinataires: emailsDe(d?.notaire).join(", "),
    ...depuisOffre(b, vendeurs, acte),
    bien: [acte?.data.designation || designationDepuisBien(b), d?.copropriete && `Copropriété : ${d.copropriete}`, d?.lots && `Lots : ${d.lots}`].filter(Boolean).join("\n"),
    copropriete: [d?.syndic && `Syndic : ${d.syndic}`, d?.charges && `Charges : ${d.charges}`].filter(Boolean).join("\n"),
    occupation: d?.occupation ?? "",
    // Dates saisies dans « Diagnostics » quand il y en a, sinon ce que dit le dossier.
    diagnostics: [d?.ddt, diagnosticsSuivis(b) ? resumeDiagnostics(b, today()) : d?.dpe && `DPE : ${d.dpe}`].filter(Boolean).join("\n"),
    attention: "",
    pieces: (["offre", "mandat", "identite", "ddt"] as ClePiece[]).concat(copro ? ["copro", "charges"] : [], b.taxeFonciere || d?.taxeFonciere ? ["tf"] : [], loue ? ["bail"] : []),
    confrere: false,
    maj: new Date().toISOString(),
  };
}

/* ---------- Le mail ---------- */

const AC = (quoi: string) => `[À compléter : ${quoi}]`;
const euros = (n: number) => `${n.toLocaleString("fr-FR")} €`;
const NATURE: Record<Bien["type"], string> = {
  appartement: "d'un appartement situé",
  maison: "d'une maison située",
  local: "d'un local situé",
  immeuble: "d'un immeuble situé",
  parking: "d'un emplacement de stationnement situé",
  terrain: "d'un terrain situé",
};

const nomsDeFamille = (ps: Partie[]) => [...new Set(ps.map((p) => p.nom?.trim().toUpperCase()).filter(Boolean))].join(" - ");

const liste = (xs: string[]) => (xs.length > 1 ? `${xs.slice(0, -1).join(", ")} et ${xs[xs.length - 1]}` : xs[0] ?? "");

/** « Libellé : texte », ou le texte sous le libellé quand il tient sur plusieurs lignes. */
const bloc = (libelle: string, texte: string) => (texte.includes("\n") ? `${libelle} :\n${texte}` : `${libelle} : ${texte}`);

function partie(p: Partie, avecNaissance: boolean) {
  const naissance = avecNaissance ? `, ${ne(p)} le ${p.dateNaissance ? dateLettres(p.dateNaissance) : AC("date de naissance")} à ${p.lieuNaissance?.trim() || AC("lieu de naissance")}` : "";
  return `${nomOffre(p) || AC("nom")}${naissance}, demeurant ${p.adresse?.trim() || AC("adresse")} – ${p.email?.trim() || AC("e-mail")} – ${telActe(p.tel) ?? AC("portable")}`;
}

function parties(libelle: string, ps: Partie[], avecNaissance: boolean) {
  if (!ps.length) return `${libelle} : ${AC(libelle.toLowerCase())}`;
  if (ps.length === 1) return `${libelle} : ${partie(ps[0], avecNaissance)}`;
  return `${libelle}s :\n${ps.map((p) => `- ${partie(p, avecNaissance)}`).join("\n")}`;
}

/** Prénom suivi du nom en capitales, comme dans la signature des mails de l'agence. */
const signataire = (nom: string) => nom.replace(/(\S+)$/, (n) => n.toUpperCase());

export function texteTransmission(t: Transmission, b: Bien): { sujet: string; corps: string } {
  const adresse = adresseComplete(b);
  const titreMandat = TYPES_MANDAT.find((x) => x.v === (b.mandat?.type ?? "simple"))?.titre ?? "Mandat de vente";
  const offre = t.offreDate ? `Une offre d'achat formulée le ${dateLettres(t.offreDate)}` : "Une offre d'achat";
  const net = t.prix != null && t.honoraires != null ? t.prix - t.honoraires : undefined;
  const financement =
    t.financement === "comptant"
      ? "paiement comptant, sans condition suspensive d'obtention de prêt."
      : `acquisition financée par un emprunt${t.montantPret ? ` de ${euros(t.montantPret)}` : ""}, ${t.conditionSuspensive ? "sous" : "sans"} condition suspensive d'obtention de prêt.`;
  const pieces = PIECES.filter((p) => t.pieces.includes(p.cle)).map((p) => p.texte);
  const [rue, ville] = AGENCE.adresse.split(" – ");

  const paragraphes = [
    emailsDe(t.destinataires).length > 1 ? "Maîtres," : "Maître,",
    `Je me permets de venir vers vous dans le cadre de la vente ${NATURE[b.type]} ${adresse}. ${offre} a été acceptée le ${
      t.acceptation ? dateLettres(t.acceptation) : AC("date d'acceptation")
    } : je vous transmets l'ensemble des éléments en ma possession afin que vous puissiez engager la rédaction de l'avant-contrat.`,
    t.bien.trim() && bloc("Le bien", t.bien.trim()),
    [parties("Vendeur", t.vendeurs, false), b.mandat?.numero && `${titreMandat} n° ${b.mandat.numero}${b.mandat.debut ? `, signé le ${dateLettres(b.mandat.debut)}` : ""}.`].filter(Boolean).join("\n"),
    parties("Acquéreur", t.acquereurs, true),
    [
      `Prix frais d'agence inclus : ${t.prix != null ? euros(t.prix) : AC("prix")}`,
      `Honoraires d'agence, à la charge ${t.charge === "vendeur" ? "du vendeur" : "de l'acquéreur"} : ${t.honoraires != null ? euros(t.honoraires) : AC("honoraires")}`,
      `Prix net vendeur : ${net != null ? euros(net) : AC("prix net vendeur")}`,
    ].join("\n"),
    `Financement : ${financement}`,
    t.copropriete.trim() && bloc("Syndic et charges", t.copropriete.trim()),
    t.occupation.trim() && bloc("Occupation", t.occupation.trim()),
    t.diagnostics.trim() && bloc("Diagnostics", t.diagnostics.trim()),
    t.attention.trim() && bloc("Point d'attention", t.attention.trim()),
    [pieces.length ? `Vous trouverez ci-joint ${liste(pieces)}.` : "", t.lien?.trim() ? `Les documents sont également disponibles via ce lien : ${t.lien.trim()}` : ""].filter(Boolean).join("\n"),
    t.confrere && "Pourriez-vous enfin m'indiquer si votre office intervient pour les deux parties, ou si je dois saisir un confrère ?",
    "Je reste à votre disposition pour tout complément d'information.",
    ["Bien cordialement,", "", signataire(AGENCE.conseiller), "Patrim", rue, ville, telActe(AGENCE.tel), telActe(AGENCE.conseillerTel)].join("\n"),
  ];

  return {
    sujet: `VENTE ${nomsDeFamille(t.vendeurs) || AC("vendeur")} / ${nomsDeFamille(t.acquereurs) || AC("acquéreur")} – ${adresse} – Transmission du dossier`,
    corps: paragraphes.filter(Boolean).join("\n\n"),
  };
}

/** Nombre de « [À compléter] » restant dans le mail. */
export const aCompleter = (m: { sujet: string; corps: string }) => (`${m.sujet}\n${m.corps}`.match(/\[À compléter/g) ?? []).length;

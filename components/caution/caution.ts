"use client";

/* ============================================================
   Acte de cautionnement solidaire à durée déterminée PATRIM
   (locataire unique, couple marié ou colocation), rédigé à partir
   d'un bail du Hub. Une copie du bail est gardée dans l'acte : les
   montants restent ceux que la caution a signés.
   Règle de l'agence : un acte par caution, sauf un couple marié
   qui se porte caution dans un seul acte.
   ============================================================ */

import { AGENCE } from "@/components/documents/charte";
import { civiliteLongue, type Partie } from "@/components/offre/offre";
import { dureeBail, type Bail } from "@/components/bail/bail";
import { today } from "@/lib/format";

export type Situation = "celibataire" | "marie" | "pacse" | "divorce" | "veuf";
export const SITUATIONS: { v: Situation; label: string }[] = [
  { v: "celibataire", label: "Célibataire" },
  { v: "marie", label: "Marié(e)" },
  { v: "pacse", label: "Pacsé(e)" },
  { v: "divorce", label: "Divorcé(e)" },
  { v: "veuf", label: "Veuf(ve)" },
];

export interface Caution {
  bienId: string;
  /** Copie gardée sur la fiche du bien (voir components/documents/archive.ts). */
  acteId?: string;
  /** Bail garanti (acte du bien) et sa copie au moment de la rédaction. */
  bailActeId?: string;
  bail: Bail;
  /** Une personne, ou deux pour un couple marié (un seul acte). */
  personnes: Partie[];
  situation: Situation;
  profession?: string;
  contrat?: "cdi" | "cdd" | "autre";
  finCdd?: string;
  remuneration?: number;
  autresRevenus?: number;
  /** Colocation : le colocataire dont le congé met fin à l'engagement (article 8-1 de la loi). */
  colocataireLie?: string;
  /** Le bailleur a une assurance loyers impayés : la caution n'est possible que pour un étudiant ou un apprenti. */
  gli?: boolean;
  etudiantApprenti?: boolean;
  date: string;
  maj: string;
}

/* ---------- Brouillon sur l'appareil ---------- */

const cle = (bienId: string) => `patrim-hub:caution:${bienId}`;

export function lireCaution(bienId: string): Caution | null {
  try {
    const raw = localStorage.getItem(cle(bienId));
    return raw ? (JSON.parse(raw) as Caution) : null;
  } catch {
    return null;
  }
}
export function ecrireCaution(c: Caution) {
  try {
    localStorage.setItem(cle(c.bienId), JSON.stringify({ ...c, maj: new Date().toISOString() }));
  } catch {}
}
export function effacerCaution(bienId: string) {
  try {
    localStorage.removeItem(cle(bienId));
  } catch {}
}

export function cautionInitiale(bail: Bail, bailActeId?: string): Caution {
  return {
    bienId: bail.bienId,
    bailActeId,
    bail,
    personnes: [{ civilite: "" }],
    situation: "celibataire",
    contrat: "cdi",
    colocataireLie: bail.locataires.length > 1 ? nomCaution(bail.locataires[0]) : undefined,
    date: today(),
    maj: new Date().toISOString(),
  };
}

/* ---------- Calculs ---------- */

/** Montant maximum garanti : trois années de loyers charges comprises. */
export const montantMax = (b: Bail) => ((b.loyer ?? 0) + (b.charges ?? 0)) * 36;
/** Durée maximum de l'engagement, en années (règle de l'agence : durée du bail × 4). */
export const dureeMaxAns = (b: Bail) => Math.round((dureeBail(b) * 4) / 12);
export const revenusTotal = (c: Caution) => (c.remuneration ?? 0) + (c.autresRevenus ?? 0);

/* ---------- Textes ---------- */

/** « Monsieur DUPONT Jean » : forme des actes de cautionnement. */
export const nomCaution = (p: Partie) => [civiliteLongue(p), p.nom?.toUpperCase(), p.prenom].filter(Boolean).join(" ");
export const nomsCaution = (c: Caution) => c.personnes.map(nomCaution).filter(Boolean).join(" et ");
export const locatairesTexte = (b: Bail, sep = " et ") => b.locataires.map(nomCaution).filter(Boolean).join(sep);
export const bailleursTexte = (b: Bail) => (b.qualiteBailleur !== "physique" && b.societe ? b.societe : b.bailleurs.map(nomCaution).filter(Boolean).join(" et "));

export const titreCaution = (c: Caution) => {
  const qui = nomsCaution(c);
  return `Acte de cautionnement${qui ? ` de ${qui}` : ""}`;
};

/** Champs manquants de la caution (affichés en [À compléter] dans l'acte). */
export function manquantsCaution(c: Caution) {
  const out: string[] = [];
  c.personnes.forEach((p, i) => {
    const suffixe = c.personnes.length > 1 ? ` (${i + 1})` : "";
    if (!p.nom?.trim() || !p.prenom?.trim()) out.push(`Nom et prénom${suffixe}`);
    if (!p.dateNaissance) out.push(`Date de naissance${suffixe}`);
    if (!p.lieuNaissance?.trim()) out.push(`Lieu de naissance${suffixe}`);
    if (!p.email?.trim()) out.push(`E-mail${suffixe}`);
    if (!p.tel?.trim()) out.push(`Portable${suffixe}`);
  });
  if (!c.personnes[0]?.adresse?.trim()) out.push("Domicile");
  if (!c.profession?.trim()) out.push("Profession");
  if (c.contrat === "cdd" && !c.finCdd) out.push("Fin du CDD");
  if (c.remuneration == null) out.push("Revenus");
  return out;
}

export function alertesCaution(c: Caution): { niveau: "danger" | "warn"; texte: string }[] {
  const out: { niveau: "danger" | "warn"; texte: string }[] = [];
  if (c.gli && !c.etudiantApprenti)
    out.push({ niveau: "danger", texte: "Le bailleur a une assurance loyers impayés : il ne peut pas demander de caution, sauf si le locataire est étudiant ou apprenti (article 22-1 de la loi)." });
  if (!c.bail.loyer) out.push({ niveau: "danger", texte: "Le bail n'a pas de loyer : le montant maximum garanti ne peut pas être calculé." });
  if (c.bail.locataires.length > 1 && !c.colocataireLie) out.push({ niveau: "danger", texte: "Colocation : indiquer le colocataire que cette caution accompagne (sinon l'acte est nul)." });
  if (c.personnes.length > 1 && c.situation !== "marie") out.push({ niveau: "warn", texte: "Un seul acte pour deux personnes : réservé à un couple marié. Sinon, faire un acte par personne." });
  const loyerCc = (c.bail.loyer ?? 0) + (c.bail.charges ?? 0);
  if (loyerCc && c.remuneration != null && revenusTotal(c) < loyerCc * 3)
    out.push({ niveau: "warn", texte: `Revenus de la caution inférieurs à trois fois le loyer charges comprises (${(loyerCc * 3).toLocaleString("fr-FR")} €).` });
  return out;
}

/** Mail à la caution pour réunir les pièces (brouillon, jamais envoyé automatiquement). */
export function mailDemandeCaution(c: Caution, logement: string) {
  const p = c.personnes[0] ?? {};
  return {
    sujet: `Votre acte de cautionnement – ${logement}`,
    corps: [
      `Bonjour ${[civiliteLongue(p), p.nom].filter(Boolean).join(" ")},`.replace("Bonjour ,", "Bonjour,"),
      "",
      `Vous allez vous porter caution pour la location de ${locatairesTexte(c.bail) || "[À compléter]"}. Pour préparer l'acte, pourriez-vous me transmettre :`,
      "• une copie de votre pièce d'identité en cours de validité (recto verso) ;",
      "• un justificatif de domicile de moins de trois mois ;",
      "• vos trois derniers bulletins de salaire (ou tout justificatif de revenus) et votre dernier avis d'imposition ;",
      "• votre contrat de travail ou une attestation de votre employeur ;",
      "• votre date et votre lieu de naissance, votre situation familiale et votre profession ;",
      "• l'adresse e-mail et le numéro de portable à utiliser pour la signature électronique (ils doivent être personnels).",
      "",
      "Vous recevrez ensuite l'acte et une copie du bail. L'acte se signe électroniquement via ICSIGN, depuis votre téléphone ou votre ordinateur.",
      "",
      "Je reste à votre disposition pour toute question.",
      "",
      "Bien cordialement,",
      `${AGENCE.conseiller} – PATRIM`,
      AGENCE.conseillerTel,
    ].join("\n"),
  };
}

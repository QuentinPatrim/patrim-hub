"use client";

/* ============================================================
   Fiche de renseignements à remettre aux candidats locataires et à
   leurs garants : rappel du logement et des sommes, colonnes à
   remplir, liste des pièces que l'on peut demander (décret
   n° 2015-1437, annexe I) et de celles qu'il est interdit de
   demander (article 22-2 de la loi du 6 juillet 1989).
   Rien sur les candidats n'est gardé dans l'appli : la fiche part
   vierge, le candidat la remplit.
   ============================================================ */

import { adresseComplete } from "@/components/biens/utils";
import { lireBail, totalLocataire } from "@/components/bail/bail";
import { locationDe } from "@/components/location/bienLocation";
import { dateActe, eurosCts } from "@/components/location/loi";
import { AGENCE } from "@/components/documents/charte";
import type { Bien } from "@/lib/types";

export interface FicheCandidat {
  bienId: string;
  logement: string;
  meuble: boolean;
  loyer?: number;
  charges?: number;
  depot?: number;
  /** Honoraires à la charge du locataire (visite, dossier, bail et état des lieux). */
  honoraires?: number;
  /** Date d'entrée prévue (état des lieux et remise des clés). */
  entree?: string;
  coloc: boolean;
  garants: 0 | 1 | 2;
  maj: string;
}

const cle = (bienId: string) => `patrim-hub:candidat:${bienId}`;

export function lireFiche(bienId: string): FicheCandidat | null {
  try {
    const raw = localStorage.getItem(cle(bienId));
    return raw ? (JSON.parse(raw) as FicheCandidat) : null;
  } catch {
    return null;
  }
}
export function ecrireFiche(f: FicheCandidat) {
  try {
    localStorage.setItem(cle(f.bienId), JSON.stringify({ ...f, maj: new Date().toISOString() }));
  } catch {}
}
export function effacerFiche(bienId: string) {
  try {
    localStorage.removeItem(cle(bienId));
  } catch {}
}

/** Valeurs de départ : le bail en cours de rédaction sur ce bien, sinon la location saisie sur la fiche du bien. */
export function ficheInitiale(b: Bien): FicheCandidat {
  const bail = lireBail(b.id);
  const loc = locationDe(b);
  const honoraires = bail ? totalLocataire(bail) : 0;
  return {
    bienId: b.id,
    logement: [b.titre, adresseComplete(b)].filter(Boolean).join(", "),
    meuble: bail ? bail.type === "meuble" : !!loc?.meuble,
    loyer: bail?.loyer ?? loc?.loyer,
    charges: bail?.charges ?? loc?.charges,
    depot: bail?.depot ?? loc?.depot,
    honoraires: honoraires || undefined,
    entree: bail?.debut,
    coloc: (bail?.locataires.length ?? 0) > 1,
    garants: 1,
    maj: new Date().toISOString(),
  };
}

/** Loyer et charges du premier mois, au prorata des jours restants (jour d'entrée compris). */
export function premierMois(f: FicheCandidat) {
  if (!f.entree || !f.loyer) return undefined;
  const [a, m, j] = f.entree.split("-").map(Number);
  const jours = new Date(a, m, 0).getDate();
  const restants = jours - j + 1;
  const montant = Math.round((((f.loyer + (f.charges ?? 0)) * restants) / jours) * 100) / 100;
  const fin = `${a}-${String(m).padStart(2, "0")}-${String(jours).padStart(2, "0")}`;
  return { montant, restants, jours, fin };
}

export const totalEntree = (f: FicheCandidat) => (f.depot ?? 0) + (f.honoraires ?? 0) + (premierMois(f)?.montant ?? 0);

/** Mail au candidat : la fiche, les pièces et les sommes à régler (brouillon, jamais envoyé automatiquement). */
export function mailCandidat(f: FicheCandidat) {
  const pm = premierMois(f);
  const lignes = [
    f.depot ? `• dépôt de garantie : ${eurosCts(f.depot)}` : null,
    f.honoraires ? `• honoraires de location (visite, dossier, bail et état des lieux) : ${eurosCts(f.honoraires)}` : null,
    pm ? `• loyer et charges du ${dateActe(f.entree, { annee: false, majuscule: false })} au ${dateActe(pm.fin, { annee: true, majuscule: false })} (${pm.restants} jours sur ${pm.jours}) : ${eurosCts(pm.montant)}` : null,
  ].filter(Boolean) as string[];
  return {
    sujet: `Votre candidature – ${f.logement}`,
    corps: [
      "Bonjour,",
      "",
      `Suite à votre visite, vous trouverez ci-joint la fiche de renseignements pour le logement suivant : ${f.logement}. Merci de la compléter (une colonne par personne : vous, votre conjoint ou colocataire${f.garants ? ", et chaque garant" : ""}) et de me la renvoyer avec les pièces indiquées au verso, en copie.`,
      "",
      "Ne m'envoyez pas de relevé de compte bancaire, de photo d'identité, de carte Vitale ni d'attestation de bonne tenue de compte : ces documents ne peuvent pas vous être demandés.",
      ...(lignes.length
        ? [
            "",
            "Si votre dossier est retenu, voici les sommes à régler à la signature du bail, par virement sur le compte de l'agence (RIB ci-joint) :",
            ...lignes,
            `Total : ${eurosCts(totalEntree(f))}.`,
          ]
        : []),
      ...(f.entree ? ["", `L'état des lieux d'entrée et la remise des clés sont prévus le ${dateActe(f.entree, { annee: true, majuscule: false })}.`] : []),
      "",
      "Je reste à votre disposition pour toute question.",
      "",
      "Bien cordialement,",
      `${AGENCE.conseiller} – PATRIM`,
      AGENCE.conseillerTel,
    ].join("\n"),
  };
}

/** Annexe I du décret n° 2015-1437 du 5 novembre 2015 : pièces justificatives pouvant être demandées au candidat. */
export const PIECES_CANDIDAT: [string, string[]][] = [
  [
    "Une pièce d'identité en cours de validité, avec photographie et signature",
    ["Carte nationale d'identité française ou étrangère", "Passeport français ou étranger", "Permis de conduire français ou étranger", "Titre de séjour (carte de séjour temporaire, carte de résident, carte de ressortissant de l'Union européenne)"],
  ],
  [
    "Un seul justificatif de domicile",
    [
      "Trois dernières quittances de loyer ou, à défaut, attestation du précédent bailleur indiquant que vous êtes à jour de vos loyers et charges",
      "Attestation d'hébergement sur l'honneur de la personne qui vous héberge",
      "Attestation d'élection de domicile auprès d'un organisme agréé",
      "Dernier avis de taxe foncière ou, à défaut, titre de propriété de la résidence principale",
    ],
  ],
  [
    "Un ou plusieurs justificatifs d'activité professionnelle",
    [
      "Contrat de travail ou de stage ou, à défaut, attestation de l'employeur (emploi, rémunération, date d'entrée, période d'essai)",
      "Extrait K ou K bis de moins de trois mois (entreprise commerciale), extrait D1 (artisan)",
      "Certificat d'identification de l'INSEE (travailleur indépendant), carte professionnelle (profession libérale)",
      "Toute pièce récente attestant de l'activité pour les autres professionnels",
      "Carte d'étudiant ou certificat de scolarité de l'année en cours",
    ],
  ],
  [
    "Un ou plusieurs justificatifs de ressources",
    [
      "Dernier ou avant-dernier avis d'imposition ou de non-imposition",
      "Trois derniers bulletins de salaire",
      "Justificatif des indemnités de stage",
      "Deux derniers bilans ou attestation de ressources d'un comptable (non-salariés)",
      "Justificatifs des indemnités, retraites, pensions, prestations sociales et familiales des trois derniers mois",
      "Simulation des aides au logement (CAF ou MSA)",
      "Avis d'attribution de bourse (étudiants boursiers)",
      "Titre de propriété ou dernier avis de taxe foncière ; justificatif de revenus fonciers, de rentes ou de revenus de capitaux",
    ],
  ],
];

/** Article 22-2 de la loi du 6 juillet 1989 : pièces qu'il est interdit de demander (extraits). */
export const PIECES_INTERDITES = [
  "Photo d'identité (hors celle de la pièce d'identité)",
  "Carte d'assuré social (carte Vitale)",
  "Relevé de compte bancaire ou postal",
  "Attestation de bonne tenue de compte",
  "Attestation d'absence de crédit en cours",
  "Autorisation de prélèvement automatique",
  "Jugement de divorce (sauf le passage « Par ces motifs »)",
  "Attestation du précédent bailleur, si les quittances sont fournies",
  "Contrat de mariage, certificat de concubinage",
  "Chèque de réservation",
  "Dossier médical",
  "Extrait de casier judiciaire",
  "Versement sur un compte bloqué",
  "Plus de deux bilans (indépendants)",
];

/** Lignes du tableau à remplir par chaque personne. */
export const LIGNES_FICHE: { label: string; haut?: boolean }[] = [
  { label: "Civilité, nom" },
  { label: "Prénom(s)" },
  { label: "Nom de naissance" },
  { label: "Date et lieu de naissance" },
  { label: "Adresse actuelle", haut: true },
  { label: "Portable" },
  { label: "E-mail" },
  { label: "Situation familiale" },
  { label: "Personnes à charge" },
  { label: "Logement actuel (locataire, propriétaire, hébergé)" },
  { label: "Loyer actuel" },
  { label: "Profession" },
  { label: "Employeur (nom, adresse, téléphone)", haut: true },
  { label: "Contrat (CDI, CDD, autre) et date d'embauche" },
  { label: "Salaire net mensuel" },
  { label: "Autres revenus (allocations, pensions…)" },
];

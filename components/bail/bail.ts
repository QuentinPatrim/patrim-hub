"use client";

/* ============================================================
   Bail d'habitation PATRIM (logement vide ou meublé) : brouillon,
   valeurs de départ tirées de la fiche du bien, contrôles de la
   loi du 6 juillet 1989 et du contrat type (décret 2015-587).
   Aucune donnée personnelle ici : le bail rédigé reste sur
   l'appareil et sur la fiche du bien.
   ============================================================ */

import { adresseComplete, estCopro } from "@/components/biens/utils";
import { dossierDe } from "@/components/biens/dossier";
import { AGENCE } from "@/components/documents/charte";
import { CHAMPS, civiliteLongue, manquants, partieDepuisContact, type Champ, type ContactEtatCivil, type Partie } from "@/components/offre/offre";
import { signataireRetenu, retenirSignataire, type Signataire } from "@/components/mandat/mandat";
import { PLAFONDS, decenceEnergetique, irlConnu, loyerGele, periodeConstruction, plafondsLocataire, ventilerHonoraires, type Irl, type Zone } from "@/components/location/loi";
import { today } from "@/lib/format";
import type { Bien } from "@/lib/types";

export type TypeBail = "nu" | "meuble";
export type QualiteBailleur = "physique" | "sci_familiale" | "morale";

export const QUALITES: { v: QualiteBailleur; label: string }[] = [
  { v: "physique", label: "Personne physique" },
  { v: "sci_familiale", label: "SCI familiale" },
  { v: "morale", label: "Personne morale (société)" },
];

/** Bailleur : nom, prénom et domicile. Locataire : coordonnées de signature. */
export const CHAMPS_BAILLEUR: Champ[] = CHAMPS.filter((c) => ["prenom", "nom", "adresse"].includes(c.key));
export const CHAMPS_LOCATAIRE: Champ[] = CHAMPS.filter((c) => ["prenom", "nom", "email", "tel"].includes(c.key));

export const AUTRES_PARTIES = ["Grenier", "Comble aménagé", "Terrasse", "Balcon", "Loggia", "Jardin privatif"] as const;
export const EQUIPEMENTS = ["Cuisine équipée", "WC", "Douche", "Baignoire", "Détecteur de fumée", "Climatisation"] as const;
export const PRIVATIFS = ["Cave", "Parking", "Garage", "Piscine"] as const;
export const COMMUNS = ["Garage à vélo", "Ascenseur", "Espaces verts", "Aires et équipements de jeux", "Local poubelle", "Gardiennage"] as const;

/** Mobilier minimum d'un logement meublé (décret n° 2015-981 du 31 juillet 2015). */
export const MOBILIER = [
  "Literie comprenant couette ou couverture",
  "Dispositif d'occultation des fenêtres dans les pièces destinées à être utilisées comme chambre à coucher",
  "Plaques de cuisson",
  "Four ou four à micro-ondes",
  "Réfrigérateur et congélateur ou, au minimum, réfrigérateur doté d'un compartiment à une température inférieure ou égale à -6 °C",
  "Vaisselle nécessaire à la prise des repas",
  "Ustensiles de cuisine",
  "Table et sièges",
  "Étagères de rangement",
  "Luminaires",
  "Matériel d'entretien ménager adapté aux caractéristiques du logement",
] as const;

export const ANNEXES = [
  "Extrait du règlement de copropriété (destination de l'immeuble, jouissance et usage des parties privatives et communes, quote-part du lot dans chaque catégorie de charges)",
  "Règlement intérieur de l'immeuble",
  "Diagnostic de performance énergétique",
  "Constat de risque d'exposition au plomb (immeubles construits avant le 1er janvier 1949)",
  "État de l'installation intérieure d'électricité",
  "État de l'installation intérieure de gaz",
  "Copie de l'état mentionnant l'absence ou la présence d'amiante",
  "État des risques et pollutions",
  "Notice d'information relative aux droits et obligations des locataires et des bailleurs",
  "État des lieux d'entrée",
  "Autorisation préalable de mise en location",
  "Références aux loyers habituellement constatés dans le voisinage pour des logements comparables",
] as const;
/** Annexes cochées par défaut (les autres dépendent du logement). */
const ANNEXES_DEFAUT = [ANNEXES[2], ANNEXES[4], ANNEXES[6], ANNEXES[7], ANNEXES[8], ANNEXES[9]];

export const DETAIL_CHARGES = "Provision d'eau froide, entretien des parties communes et taxe d'ordures ménagères.";

export interface Bail {
  bienId: string;
  /** Copie gardée sur la fiche du bien (voir components/documents/archive.ts). */
  acteId?: string;
  type: TypeBail;

  /* Parties */
  bailleurs: Partie[];
  qualiteBailleur: QualiteBailleur;
  /** Société bailleresse (dénomination et siège), représentée par les personnes choisies. */
  societe?: string;
  siege?: string;
  /** Le bailleur est représenté par PATRIM, mandataire gestionnaire. */
  parPatrim: boolean;
  /** Le bailleur signe aussi le bail sur ICSIGN. */
  bailleurSigne: boolean;
  locataires: Partie[];

  /* Logement */
  identifiantFiscal?: string;
  localisation: string;
  habitat: "collectif" | "individuel";
  regime: "copropriete" | "mono";
  periode?: string;
  surface?: number;
  pieces?: number;
  autresParties: string[];
  autresPartiesPlus?: string;
  equipements: string[];
  equipementsPlus?: string;
  chauffage: "individuel" | "collectif";
  chauffageRepartition?: string;
  eauChaude: "individuelle" | "collective";
  eauChaudeRepartition?: string;
  usage: "habitation" | "mixte";
  profession?: string;
  privatifs: string[];
  privatifsPlus?: string;
  communs: string[];
  communsPlus?: string;

  /* Durée */
  debut?: string;
  /** Bail vide : durée réduite (1 an minimum) pour un événement précis, bailleur personne physique. */
  dureeReduite?: boolean;
  dureeReduiteMois?: number;
  evenement?: string;
  /** Bail meublé : location à un étudiant, 9 mois sans reconduction. */
  etudiant?: boolean;

  /* Loyer */
  loyer?: number;
  zone: Zone;
  /** Décret d'évolution des loyers à la relocation (zones tendues, dont Toulouse). */
  decretRelocation: boolean;
  premiereLocation?: boolean;
  dernierLoyer?: number;
  dernierLoyerDate?: string;
  derniereRevision?: string;
  /** Encadrement des loyers (loyer de référence majoré) : Toulouse n'est pas concernée. */
  encadrement: boolean;
  loyerReference?: number;
  loyerReferenceMajore?: number;
  complementLoyer?: number;
  complementMotif?: string;
  revision: "anniversaire" | "date";
  revisionDate?: string;
  irl: Irl;

  /* Charges et paiement */
  chargesMode: "provisions" | "periodique" | "forfait";
  charges?: number;
  chargesDetail: string;
  assuranceColoc?: boolean;
  assuranceColocAnnuelle?: number;
  paiement: "echoir" | "echu";
  jourPaiement: string;

  /* Travaux */
  travaux?: string;
  majorationTravaux?: string;
  diminutionTravaux?: string;

  /* Garanties et honoraires */
  depot?: number;
  honorairesLocataire: { bail?: number; edl?: number };
  honorairesBailleur: { bail?: number; edl?: number; autres?: number };
  /** Le bailleur paie le même montant que le locataire (cas le plus courant). */
  memeHonoraires: boolean;

  /* Conditions particulières */
  catnat: boolean;
  zoneBruit?: string;
  congePrecedent?: string;
  /** Meublé : ménage de sortie refacturé sur justificatif (à la place d'un forfait). */
  menageSortie?: boolean;
  conditionsParticulieres?: string;

  /* Annexes */
  annexes: string[];
  mobilier: string[];
  inventaire?: string;

  signataire: Signataire;
  date: string;
  maj: string;
}

/* ---------- Brouillon sur l'appareil ---------- */

const cle = (bienId: string) => `patrim-hub:bail:${bienId}`;

export function lireBail(bienId: string): Bail | null {
  try {
    const raw = localStorage.getItem(cle(bienId));
    return raw ? (JSON.parse(raw) as Bail) : null;
  } catch {
    return null;
  }
}
export function ecrireBail(b: Bail) {
  try {
    localStorage.setItem(cle(b.bienId), JSON.stringify({ ...b, maj: new Date().toISOString() }));
  } catch {}
  retenirSignataire(b.signataire);
}
export function effacerBail(bienId: string) {
  try {
    localStorage.removeItem(cle(bienId));
  } catch {}
}

/* ---------- Valeurs de départ ---------- */

const contient = (t: string | undefined, ...mots: string[]) => !!t && mots.some((m) => t.toLowerCase().includes(m));

export function bailInitial(b: Bien, proprietaires: ContactEtatCivil[], type: TypeBail = "nu"): Bail {
  const d = dossierDe(b);
  const localisation = [adresseComplete(b), d?.complementAdresse, b.type === "appartement" && b.etage != null ? (b.etage === 0 ? "rez-de-chaussée" : `${b.etage}e étage`) : ""]
    .filter(Boolean)
    .join(", ");
  const ext = b.exterieur;
  return {
    bienId: b.id,
    type,
    bailleurs: proprietaires.map(partieDepuisContact),
    qualiteBailleur: "physique",
    parPatrim: true,
    bailleurSigne: false,
    locataires: [],
    localisation,
    habitat: b.type === "maison" ? "individuel" : "collectif",
    regime: estCopro(b) ? "copropriete" : "mono",
    periode: periodeConstruction(b.anneeConstruction) || d?.construction || undefined,
    surface: b.surface,
    pieces: b.pieces,
    autresParties: AUTRES_PARTIES.filter((p) => contient(ext, p.toLowerCase().replace(" privatif", "").replace(" aménagé", ""))),
    equipements: ["WC", "Détecteur de fumée"],
    chauffage: contient(b.chauffage, "collectif") ? "collectif" : "individuel",
    eauChaude: contient(b.chauffage, "collectif") ? "collective" : "individuelle",
    usage: "habitation",
    privatifs: [b.cave && "Cave", b.parking && (contient(b.parking, "garage", "box") ? "Garage" : "Parking")].filter(Boolean) as string[],
    communs: [b.ascenseur && "Ascenseur"].filter(Boolean) as string[],
    debut: undefined,
    zone: "tendue",
    decretRelocation: true,
    encadrement: false,
    revision: "anniversaire",
    irl: irlConnu(today()),
    chargesMode: "provisions",
    chargesDetail: DETAIL_CHARGES,
    paiement: "echoir",
    jourPaiement: "avant le 10 de chaque mois",
    honorairesLocataire: {},
    honorairesBailleur: {},
    memeHonoraires: true,
    catnat: false,
    menageSortie: type === "meuble",
    annexes: [...ANNEXES_DEFAUT, ...(estCopro(b) ? [ANNEXES[0]] : [])],
    mobilier: [],
    signataire: signataireRetenu(),
    date: today(),
    maj: new Date().toISOString(),
  };
}

/* ---------- Règles ---------- */

/** Durée du bail en mois, selon le type de bail et la qualité du bailleur. */
export function dureeBail(x: Pick<Bail, "type" | "qualiteBailleur" | "dureeReduite" | "dureeReduiteMois" | "etudiant">) {
  if (x.type === "meuble") return x.etudiant ? 9 : 12;
  if (x.dureeReduite && x.qualiteBailleur !== "morale") return Math.max(12, Math.min(35, x.dureeReduiteMois ?? 12));
  return x.qualiteBailleur === "morale" ? 72 : 36;
}
/** Dépôt de garantie maximum : 1 mois de loyer hors charges (vide), 2 mois (meublé). */
export const depotMax = (x: Pick<Bail, "type" | "loyer">) => (x.loyer ? x.loyer * (x.type === "meuble" ? 2 : 1) : undefined);

export const totalLocataire = (x: Bail) => (x.honorairesLocataire.bail ?? 0) + (x.honorairesLocataire.edl ?? 0);
export const totalBailleur = (x: Bail) => (x.honorairesBailleur.bail ?? 0) + (x.honorairesBailleur.edl ?? 0) + (x.honorairesBailleur.autres ?? 0);
/** Honoraires du bailleur : identiques à ceux du locataire quand l'option est cochée. */
export const honorairesBailleur = (x: Bail) => (x.memeHonoraires ? { ...x.honorairesLocataire, autres: x.honorairesBailleur.autres } : x.honorairesBailleur);

/** Répartit un total d'honoraires « locataire » (fiche de renseignements) selon la méthode PATRIM. */
export const repartir = (total: number, surface?: number) => ventilerHonoraires(total, surface);

export const montantAssuranceMois = (x: Bail) => (x.assuranceColoc && x.assuranceColocAnnuelle ? Math.round((x.assuranceColocAnnuelle / 12) * 100) / 100 : 0);
export const premiereEcheance = (x: Bail) => (x.loyer ?? 0) + (x.charges ?? 0) + montantAssuranceMois(x);

export type Alerte = { niveau: "danger" | "warn"; texte: string };

/** Ce qui ne respecte pas la loi ou mérite une vérification avant signature. */
export function alertesBail(x: Bail, dpe?: string): Alerte[] {
  const out: Alerte[] = [];
  const decence = decenceEnergetique(dpe, x.debut);
  if (decence) out.push(decence);
  if (!dpe) out.push({ niveau: "warn", texte: "Classe énergie inconnue : le DPE doit être annexé au bail et le logement ne doit pas être classé G." });

  const max = depotMax(x);
  if (x.depot && max && x.depot > max + 0.001)
    out.push({ niveau: "danger", texte: `Dépôt de garantie trop élevé : ${x.type === "meuble" ? "deux mois" : "un mois"} de loyer hors charges maximum, soit ${max.toLocaleString("fr-FR")} €.` });

  if (x.type === "nu" && x.dureeReduite) {
    if (x.qualiteBailleur === "morale") out.push({ niveau: "danger", texte: "Une société (hors SCI familiale) ne peut pas signer un bail à durée réduite : 6 ans minimum." });
    if (!x.evenement?.trim()) out.push({ niveau: "danger", texte: "Durée réduite : l'événement précis qui la justifie (raison professionnelle ou familiale du bailleur) doit être écrit dans le bail." });
  }
  if (x.type === "meuble" && x.mobilier.length < MOBILIER.length)
    out.push({ niveau: "warn", texte: `Mobilier minimum incomplet (${x.mobilier.length}/${MOBILIER.length}) : sans ces éléments, le bail peut être requalifié en location vide (3 ans, dépôt d'un mois).` });

  // Forfait de charges : toujours permis en meublé (art. 25-10), seulement en colocation en location vide (art. 8-1).
  if (x.chargesMode === "forfait" && x.type === "nu" && x.locataires.length < 2) out.push({ niveau: "danger", texte: "Le forfait de charges n'est possible en location vide qu'en colocation." });

  const pl = plafondsLocataire(x.zone, x.surface);
  const hl = x.honorairesLocataire;
  const hb = honorairesBailleur(x);
  if (pl && hl.bail && hl.bail > pl.bail + 0.001)
    out.push({ niveau: "danger", texte: `Honoraires locataire (visite, dossier, bail) au-dessus du plafond : ${PLAFONDS.bail[x.zone].toLocaleString("fr-FR")} €/m² × ${x.surface} m² = ${pl.bail.toLocaleString("fr-FR")} €.` });
  if (pl && hl.edl && hl.edl > pl.edl + 0.001)
    out.push({ niveau: "danger", texte: `Honoraires d'état des lieux au-dessus du plafond : ${PLAFONDS.edl.toLocaleString("fr-FR")} €/m² × ${x.surface} m² = ${pl.edl.toLocaleString("fr-FR")} €.` });
  if ((hl.bail ?? 0) > (hb.bail ?? 0) + 0.001 || (hl.edl ?? 0) > (hb.edl ?? 0) + 0.001)
    out.push({ niveau: "danger", texte: "La part du locataire ne peut pas dépasser celle du bailleur (article 5 de la loi du 6 juillet 1989)." });
  if (!x.surface && (hl.bail || hl.edl)) out.push({ niveau: "warn", texte: "Surface habitable manquante : impossible de vérifier les plafonds d'honoraires." });

  if (loyerGele(dpe) && x.decretRelocation && !x.premiereLocation && x.dernierLoyer && x.loyer && x.loyer > x.dernierLoyer)
    out.push({ niveau: "danger", texte: "Logement classé F ou G : le loyer ne peut pas dépasser celui du précédent locataire." });
  else if (x.decretRelocation && !x.premiereLocation && x.dernierLoyer && x.loyer && x.loyer > x.dernierLoyer)
    out.push({ niveau: "warn", texte: "Zone tendue : le nouveau loyer ne peut pas dépasser celui du précédent locataire, sauf révision IRL non faite dans les 12 derniers mois ou travaux importants." });
  if (x.decretRelocation && !x.premiereLocation && !x.dernierLoyer) out.push({ niveau: "warn", texte: "Zone tendue : indiquer le loyer du dernier locataire (obligatoire dans le bail)." });

  if (x.surface && x.surface < 9) out.push({ niveau: "danger", texte: "Surface habitable inférieure à 9 m² : logement non décent." });
  return out;
}

/** Nom du bail : « Bail vide », « Bail meublé ». */
export const titreBail = (x: Pick<Bail, "type">) => (x.type === "meuble" ? "Bail meublé" : "Bail vide");

/** Mail au locataire ou au bailleur pour réunir ce qu'il manque au bail (brouillon, jamais envoyé automatiquement). */
export function mailDemandeBail(p: Partie, role: "locataire" | "bailleur", logement: string) {
  const manque = new Set(manquants(p, role === "locataire" ? CHAMPS_LOCATAIRE : CHAMPS_BAILLEUR).map((m) => m.key));
  const items = (
    role === "locataire"
      ? [
          "une copie de votre pièce d'identité en cours de validité (recto verso)",
          manque.has("email") || manque.has("tel") ? "l'adresse e-mail et le numéro de portable à utiliser pour la signature électronique (ils doivent être personnels)" : null,
          "votre attestation d'assurance habitation, à fournir au plus tard le jour de la remise des clés",
        ]
      : [
          manque.has("adresse") && "votre adresse actuelle complète",
          manque.has("prenom") && "votre prénom tel qu'il figure sur votre pièce d'identité",
          "l'identifiant fiscal du logement (sur votre espace impots.gouv.fr, rubrique « Biens immobiliers »)",
          "les diagnostics à annexer au bail (DPE, électricité et gaz de plus de 15 ans, état des risques, amiante, plomb si l'immeuble date d'avant 1949)",
        ]
  ).filter(Boolean) as string[];
  const bonjour = role === "locataire" && p.prenom ? `Bonjour ${p.prenom},` : `Bonjour ${[civiliteLongue(p), p.nom].filter(Boolean).join(" ")},`.replace("Bonjour ,", "Bonjour,");
  return {
    sujet: `Votre bail – ${logement}`,
    corps: [
      bonjour,
      "",
      "Pour préparer le bail, pourriez-vous me transmettre :",
      ...items.map((i) => `• ${i} ;`),
      "",
      "Le bail sera ensuite signé électroniquement via ICSIGN : vous recevrez un lien pour le signer en ligne, depuis votre téléphone ou votre ordinateur.",
      "",
      "Je reste à votre disposition pour toute question.",
      "",
      "Bien cordialement,",
      `${AGENCE.conseiller} – PATRIM`,
      AGENCE.conseillerTel,
    ].join("\n"),
  };
}

/* ============================================================
   Échéancier de gestion locative : pour chaque logement loué,
   révision annuelle du loyer (IRL), fin de période du bail et
   date limite de congé du bailleur, attestation d'assurance du
   locataire. Fonctions pures, calculées depuis le bail signé
   dans le Hub ou le bail en cours saisi à la main.
   ============================================================ */

import type { Bien } from "@/lib/types";
import type { Tone } from "@/lib/format";
import { IRL, loyerGele, trimestreTexte, valeurIrl } from "@/components/location/loi";
import { locationDe, type InfosLocation } from "@/components/location/bienLocation";
import type { BienActes } from "@/components/documents/archive";
import { dureeBail } from "@/components/bail/bail";

/** Bail en cours, saisi dans l'échéancier quand il n'a pas été rédigé dans le Hub. */
export interface BailEnCours {
  debut: string; // AAAA-MM-JJ
  loyer: number; // hors charges, actuel
  type: "nu" | "meuble";
  morale?: boolean; // bailleur personne morale (bail vide de 6 ans)
  etudiant?: boolean;
  /** IRL de référence : trimestre du bail, et valeur retenue à la dernière révision (ou à la signature). */
  irlTrimestre: 1 | 2 | 3 | 4;
  irlAnnee: number;
  irlValeur: number;
  /** Révision à une date autre que l'anniversaire (MM-JJ). */
  revisionLe?: string;
  derniereRevision?: string;
  /** Une attestation d'assurance reçue pour l'année en cours (AAAA-MM-JJ). */
  assuranceRecue?: string;
}
export interface Revision {
  date: string;
  ancien: number;
  nouveau: number;
  irl: string; // « 3e trimestre 2026 : 148,06 »
}
export type InfosGestion = InfosLocation & { bailEnCours?: BailEnCours; revisions?: Revision[] };
export const gestionDe = (b: Bien) => locationDe(b) as InfosGestion | undefined;

/** Bail suivi : celui saisi ici, sinon le bail signé dans le Hub. */
export function bailSuivi(b: Bien): (BailEnCours & { source: "saisi" | "hub" }) | undefined {
  const g = gestionDe(b);
  if (g?.bailEnCours) return { ...g.bailEnCours, source: "saisi" };
  const acte = [...((b as BienActes).actes ?? [])].reverse().find((a) => a.kind === "bail" && a.statut === "signe");
  if (!acte || acte.kind !== "bail") return undefined;
  const x = acte.data;
  if (!x.debut || !x.loyer) return undefined;
  return {
    source: "hub",
    debut: x.debut,
    loyer: g?.loyer ?? x.loyer,
    type: x.type,
    morale: x.qualiteBailleur === "morale",
    etudiant: x.etudiant,
    irlTrimestre: x.irl.trimestre,
    irlAnnee: x.irl.annee,
    irlValeur: x.irl.valeur,
    revisionLe: x.revision === "date" && x.revisionDate ? x.revisionDate.slice(5) : undefined,
  };
}

export type CleEvt = "revision" | "conge" | "fin" | "assurance";
export interface Evenement {
  cle: CleEvt;
  bienId: string;
  date: string;
  titre: string;
  texte: string;
  tone: Tone;
  /** Révision : nouveau loyer calculé. */
  revision?: { ancien: number; nouveau: number; irl: (typeof IRL)[number]; provisoire: boolean; gele: boolean };
}

const ajoutMois = (ymd: string, n: number) => {
  const d = new Date(ymd + "T12:00:00Z");
  const j = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(j, dernier));
  return d.toISOString().slice(0, 10);
};
const veille = (ymd: string) => new Date(new Date(ymd + "T12:00:00Z").getTime() - 86400000).toISOString().slice(0, 10);
const court = (ymd: string) => ymd.split("-").reverse().join("/");
const jours = (de: string, a: string) => Math.round((new Date(a + "T12:00:00Z").getTime() - new Date(de + "T12:00:00Z").getTime()) / 86400000);
const eur2 = (n: number) => `${n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
export const libelleIrl = (i: { trimestre: number; annee: number; valeur: number }) => `${trimestreTexte(i.trimestre)} trimestre ${i.annee} : ${valeurIrl(i.valeur)}`;

/** Prochaine date de révision encore due (la révision non demandée dans l'année qui suit est perdue). */
export function prochaineRevision(x: BailEnCours, auj: string) {
  const mmjj = x.revisionLe ?? x.debut.slice(5);
  const depuis = x.derniereRevision ?? x.debut;
  let an = Number(depuis.slice(0, 4));
  let d = `${an}-${mmjj}`;
  while (d <= depuis || jours(d, auj) > 365) d = `${++an}-${mmjj}`;
  return d;
}

/** Calcul de la révision à une date : dernier IRL du trimestre de référence publié à cette date (ou le dernier connu). */
export function calculRevision(x: BailEnCours, date: string, dpe?: string) {
  const memeTrimestre = IRL.filter((i) => i.trimestre === x.irlTrimestre && i.annee > x.irlAnnee);
  const publie = memeTrimestre.find((i) => i.publie <= date);
  const irl = publie ?? memeTrimestre[0];
  if (!irl) return undefined;
  return { ancien: x.loyer, nouveau: Math.round(((x.loyer * irl.valeur) / x.irlValeur) * 100) / 100, irl, provisoire: !publie, gele: loyerGele(dpe) };
}

/** Fin de la période en cours du bail et date limite du congé du bailleur. */
export function periodeBail(x: BailEnCours, auj: string) {
  const duree = dureeBail({ type: x.type, qualiteBailleur: x.morale ? "morale" : "physique", etudiant: x.etudiant });
  const reconduction = x.type === "meuble" ? 12 : duree;
  let n = duree;
  if (!x.etudiant) while (veille(ajoutMois(x.debut, n)) < auj) n += reconduction;
  const suivante = ajoutMois(x.debut, n); // lendemain de la fin de période
  const preavis = x.type === "meuble" ? 3 : 6;
  return { fin: veille(suivante), limiteConge: veille(ajoutMois(suivante, -preavis)), preavis, reconduction };
}

export function evenements(b: Bien, auj: string, horizon = 120): Evenement[] {
  const x = bailSuivi(b);
  if (!x) return [];
  const out: Evenement[] = [];
  const ok = (d: string) => jours(auj, d) <= horizon;

  // Révision IRL
  const dRev = prochaineRevision(x, auj);
  if (ok(dRev)) {
    const r = calculRevision(x, dRev, b.dpe);
    const passee = dRev < auj;
    out.push({
      cle: "revision",
      bienId: b.id,
      date: dRev,
      titre: "Révision du loyer",
      texte: !r
        ? `IRL du ${trimestreTexte(x.irlTrimestre)} trimestre ${x.irlAnnee + 1} pas encore connu dans le Hub`
        : r.gele
          ? `Logement classé ${b.dpe} : révision interdite, le loyer reste à ${eur2(x.loyer)}`
          : `${eur2(r.ancien)} → ${eur2(r.nouveau)} (IRL ${libelleIrl(r.irl)}${r.provisoire ? ", pas encore publié pour cette date" : ""})${passee ? `. À demander au locataire avant le ${court(ajoutMois(dRev, 12))}, sinon elle est perdue pour l'année` : ""}`,
      tone: r?.gele ? "neutral" : passee ? "danger" : jours(auj, dRev) <= 30 ? "warn" : "info",
      revision: r,
    });
  }

  // Fin de la période du bail (reconduction tacite) et congé du bailleur
  const { fin, limiteConge, preavis, reconduction } = periodeBail(x, auj);
  if (ok(limiteConge) && limiteConge >= auj)
    out.push({
      cle: "conge",
      bienId: b.id,
      date: limiteConge,
      titre: "Date limite de congé du bailleur",
      texte: `Pour reprendre ou vendre le logement à la fin du bail (${court(fin)}), le congé doit être reçu par le locataire au plus tard le ${court(limiteConge)} (${preavis} mois avant). À faire signifier par commissaire de justice ou lettre recommandée.`,
      tone: jours(auj, limiteConge) <= 30 ? "danger" : "warn",
    });
  if (ok(fin) && fin >= auj)
    out.push({
      cle: "fin",
      bienId: b.id,
      date: fin,
      titre: x.type === "meuble" && x.etudiant ? "Fin du bail étudiant" : "Fin de période du bail",
      texte: x.type === "meuble" && x.etudiant ? "Bail étudiant de 9 mois : il prend fin sans reconduction." : `Sans congé, le bail est reconduit pour ${reconduction === 12 ? "un an" : `${reconduction / 12} ans`}.`,
      tone: "neutral",
    });

  // Attestation d'assurance habitation (chaque année à la date anniversaire)
  const mmjj = x.debut.slice(5);
  let dAss = `${auj.slice(0, 4)}-${mmjj}`;
  if (jours(dAss, auj) > 60) dAss = `${Number(auj.slice(0, 4)) + 1}-${mmjj}`;
  const recue = x.assuranceRecue && jours(x.assuranceRecue, dAss) <= 60;
  if (!recue && ok(dAss) && dAss > x.debut)
    out.push({
      cle: "assurance",
      bienId: b.id,
      date: dAss,
      titre: "Attestation d'assurance du locataire",
      texte: "Demander l'attestation de l'année. Sans attestation, le bailleur peut assurer le logement pour le compte du locataire et lui refacturer la prime, après mise en demeure restée sans effet un mois.",
      tone: dAss < auj ? "warn" : "info",
    });

  return out;
}

/** Biens suivis dans l'échéancier : en location, loués ou en préavis, ou avec un bail suivi. */
export const biensGeres = (biens: Bien[]) => biens.filter((b) => locationDe(b) && (bailSuivi(b) || ["loue", "preavis"].includes(locationDe(b)!.statut)));

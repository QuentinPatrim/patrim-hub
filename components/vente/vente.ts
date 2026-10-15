/* ============================================================
   Suivi d'une vente entre l'avant-contrat et l'acte : délai de
   rétractation, prêt, droit de préemption, date de l'acte.
   Les dates viennent de l'avant-contrat et sont saisies par le
   conseiller ; l'appli ne calcule que les délais légaux qui en
   découlent, et ne devine rien quand une date manque.
   Fonctions pures : aussi utilisées par le briefing du matin.
   ============================================================ */

import type { Bien } from "@/lib/types";
import type { Tone } from "@/lib/format";
import type { BienActes } from "@/components/documents/archive";
import type { Offre } from "@/components/offre/offre";

export type AvantContrat = "compromis" | "promesse";

/** Ce que le conseiller coche avant l'acte. */
export const CHECKS = [
  { cle: "facture", label: "Facture d'honoraires envoyée au notaire" },
  { cle: "visite", label: "Visite avant l'acte avec l'acquéreur" },
  { cle: "cles", label: "Relevé des compteurs et remise des clés" },
] as const;
export type CleCheck = (typeof CHECKS)[number]["cle"];

export interface SuiviVente {
  avantContrat?: AvantContrat;
  /** Signature de l'avant-contrat, faite ou prévue (AAAA-MM-JJ). */
  signature?: string;
  /** Acquéreurs suivis (fiches contact). Vide : ceux de l'offre acceptée. */
  acquereurIds?: string[];
  /** Délai de rétractation de 10 jours (acquéreur particulier, logement). Vide : d'après le type de bien. */
  sru?: boolean;
  /** Première présentation de la notification à l'acquéreur, ou remise en main propre. */
  notification?: string;
  /** Achat financé par un prêt, sous condition suspensive. Vide : d'après l'offre. */
  pret?: boolean;
  depotAvant?: string;
  depotFait?: string;
  obtentionAvant?: string;
  accord?: string;
  /** Offre de prêt reçue par l'acquéreur (délai de réflexion de 10 jours). */
  offrePret?: string;
  /** Déclaration d'intention d'aliéner reçue par la mairie (2 mois pour préempter). */
  dia?: string;
  renonciation?: string;
  acte?: string;
  /** Heure de l'acte (HH:MM). */
  acteHeure?: string;
  acteSigne?: string;
  faits?: Partial<Record<CleCheck, string>>;
  /** Derniers points faits avec un contact (acquéreur, vendeur) : id → date ISO. */
  points?: Record<string, string>;
}
export type BienVente = Bien & { vente?: SuiviVente };

export const venteDe = (b: Bien): SuiviVente => (b as BienVente).vente ?? {};

/** Biens dont la vente est suivie ici. */
export const VENTE_EN_COURS = (b: Bien) => b.statut === "sous_offre" || b.statut === "compromis";

/* ---------- Dates ---------- */

export function ajouterJours(ymd: string, n: number) {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Même quantième n mois plus tard (31 janvier + 1 mois → 28 ou 29 février). */
export function ajouterMois(ymd: string, n: number) {
  const d = new Date(ymd + "T12:00:00Z");
  const jour = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + n);
  const dernier = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0, 12)).getUTCDate();
  d.setUTCDate(Math.min(jour, dernier));
  return d.toISOString().slice(0, 10);
}

export const joursEntre = (de: string, a: string) => Math.round((new Date(a + "T12:00:00Z").getTime() - new Date(de + "T12:00:00Z").getTime()) / 86400000);

/** Dimanche de Pâques (algorithme de Meeus). */
function paques(an: number) {
  const a = an % 19;
  const b = Math.floor(an / 100);
  const c = an % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mois = Math.floor((h + l - 7 * m + 114) / 31);
  const jour = ((h + l - 7 * m + 114) % 31) + 1;
  return `${an}-${String(mois).padStart(2, "0")}-${String(jour).padStart(2, "0")}`;
}

/** Jours fériés en métropole. */
export function joursFeries(an: number) {
  const p = paques(an);
  return [`${an}-01-01`, ajouterJours(p, 1), `${an}-05-01`, `${an}-05-08`, ajouterJours(p, 39), ajouterJours(p, 50), `${an}-07-14`, `${an}-08-15`, `${an}-11-01`, `${an}-11-11`, `${an}-12-25`];
}

const ouvrable = (ymd: string) => {
  const j = new Date(ymd + "T12:00:00Z").getUTCDay();
  return j !== 0 && j !== 6 && !joursFeries(Number(ymd.slice(0, 4))).includes(ymd);
};

/** Un délai qui finit un samedi, un dimanche ou un jour férié est prolongé jusqu'au premier jour ouvrable suivant. */
export function prorogation(ymd: string) {
  let d = ymd;
  while (!ouvrable(d)) d = ajouterJours(d, 1);
  return d;
}

/** Dernier jour du délai de rétractation : 10 jours à compter du lendemain de la notification. */
export const finRetractation = (notification: string) => prorogation(ajouterJours(notification, 10));
/** L'acquéreur peut accepter l'offre de prêt à partir du 11e jour après l'avoir reçue. */
export const acceptationPret = (offre: string) => ajouterJours(offre, 11);
/** La mairie a 2 mois après réception de la DIA pour préempter ; son silence vaut renonciation. */
export const finPreemption = (dia: string) => ajouterMois(dia, 2);
/** La condition suspensive de prêt dure au moins un mois après la signature. */
export const minimumPret = (signature: string) => ajouterMois(signature, 1);

/** « 25 novembre », « 1er décembre », avec l'année si ce n'est pas celle d'aujourd'hui. */
export function dateTexte(ymd: string, auj: string, jour = false) {
  const opts: Intl.DateTimeFormatOptions = { day: "numeric", month: "long", timeZone: "UTC", ...(jour ? { weekday: "long" } : {}), ...(ymd.slice(0, 4) !== auj.slice(0, 4) ? { year: "numeric" } : {}) };
  return new Date(ymd + "T12:00:00Z").toLocaleDateString("fr-FR", opts).replace(/(^|\s)1 /, "$11er ");
}

/** « aujourd'hui », « demain », « dans 12 j », « il y a 3 j ». */
export function dans(ymd: string, auj: string) {
  const n = joursEntre(auj, ymd);
  return n === 0 ? "aujourd'hui" : n === 1 ? "demain" : n === -1 ? "hier" : n > 0 ? `dans ${n} j` : `il y a ${-n} j`;
}

/* ---------- Ce que dit la fiche ---------- */

/** L'offre retenue : la dernière acceptée, sinon la plus récente (hors offres refusées). */
export function offreRetenue(b: Bien): Offre | undefined {
  const offres = ((b as BienActes).actes ?? []).filter((a) => a.kind === "offre" && a.statut !== "refuse").sort((x, y) => y.maj.localeCompare(x.maj));
  return (offres.find((a) => a.statut === "signe") ?? offres[0])?.data as Offre | undefined;
}

/** Acquéreurs suivis : ceux choisis ici, sinon ceux de l'offre retenue. */
export function acquereursDe(b: Bien): string[] {
  const v = venteDe(b);
  if (v.acquereurIds) return v.acquereurIds;
  return (offreRetenue(b)?.acquereurs ?? []).map((p) => p.contactId).filter((x): x is string => !!x);
}

/** Prêt sous condition suspensive : ce qui est saisi ici, sinon ce que dit l'offre. undefined : à préciser. */
export function avecPret(b: Bien): boolean | undefined {
  const v = venteDe(b);
  if (v.pret != null) return v.pret;
  const o = offreRetenue(b);
  return o ? o.financement === "pret" && o.conditionSuspensive : undefined;
}

/** Délai de rétractation : ce qui est saisi ici, sinon oui pour un logement. */
export const avecRetractation = (b: Bien) => venteDe(b).sru ?? !["terrain", "parking", "local"].includes(b.type);

export const nomAvantContrat = (b: Bien) => (venteDe(b).avantContrat === "promesse" ? "la promesse de vente" : "le compromis");

/* ---------- Échéances ---------- */

export type CleEcheance = "signature" | "retractation" | "depot" | "pret" | "offrePret" | "dia" | "acte";
export type EtatEcheance = "fait" | "aVenir" | "bientot" | "depasse" | "aCompleter";

export interface Echeance {
  cle: CleEcheance;
  label: string;
  date?: string;
  etat: EtatEcheance;
  texte: string;
  tone: Tone;
}

const TON: Record<EtatEcheance, Tone> = { fait: "ok", aVenir: "info", bientot: "warn", depasse: "danger", aCompleter: "neutral" };

/** Le calendrier de la vente, dans l'ordre où les étapes arrivent. */
export function echeances(b: Bien, auj: string): Echeance[] {
  const v = venteDe(b);
  const out: Echeance[] = [];
  const e = (cle: CleEcheance, label: string, etat: EtatEcheance, texte: string, date?: string, tone?: Tone) => out.push({ cle, label, etat, texte, date, tone: tone ?? TON[etat] });
  const le = (d: string, jour = false) => `le ${dateTexte(d, auj, jour)}`;
  const promesse = v.avantContrat === "promesse";

  // Avant-contrat
  const labelSignature = promesse ? "Signature de la promesse" : "Signature du compromis";
  if (!v.signature) e("signature", labelSignature, "aCompleter", "Date à compléter");
  else if (v.signature <= auj) e("signature", labelSignature, "fait", `${promesse ? "Signée" : "Signé"} ${le(v.signature)}`, v.signature);
  else e("signature", labelSignature, joursEntre(auj, v.signature) <= 3 ? "bientot" : "aVenir", `Prévue ${le(v.signature, true)} (${dans(v.signature, auj)})`, v.signature);

  // Délai de rétractation
  if (avecRetractation(b)) {
    const label = "Délai de rétractation";
    if (v.notification) {
      const fin = finRetractation(v.notification);
      if (fin < auj) e("retractation", label, "fait", `Terminé ${le(fin)}`, fin);
      else e("retractation", label, "aVenir", `Jusqu'au ${dateTexte(fin, auj, true)} inclus (${dans(fin, auj)})`, fin);
    } else if (v.signature && v.signature <= auj) e("retractation", label, "aCompleter", "Date de notification à compléter");
    else e("retractation", label, "aVenir", "10 jours à partir de la notification à l'acquéreur");
  }

  // Prêt
  const pret = avecPret(b);
  if (pret === undefined) e("pret", "Financement", "aCompleter", "Prêt ou comptant : à préciser");
  if (pret) {
    if (v.depotAvant || v.depotFait) {
      const label = "Dépôt des demandes de prêt";
      if (v.depotFait) e("depot", label, "fait", `Fait ${le(v.depotFait)}`, v.depotFait);
      else if (v.depotAvant! < auj) e("depot", label, "depasse", `Date dépassée (${dateTexte(v.depotAvant!, auj)}) : demander le justificatif`, v.depotAvant);
      else e("depot", label, joursEntre(auj, v.depotAvant!) <= 5 ? "bientot" : "aVenir", `Avant ${le(v.depotAvant!)} (${dans(v.depotAvant!, auj)})`, v.depotAvant);
    }
    const label = "Obtention du prêt";
    if (v.accord) e("pret", label, "fait", `Accord reçu ${le(v.accord)}`, v.accord);
    else if (!v.obtentionAvant) e("pret", label, "aCompleter", "Date limite à compléter (voir l'avant-contrat)");
    else if (v.obtentionAvant < auj) e("pret", label, "depasse", `Date limite dépassée depuis ${le(v.obtentionAvant)}`, v.obtentionAvant);
    else e("pret", label, joursEntre(auj, v.obtentionAvant) <= 15 ? "bientot" : "aVenir", `Avant ${le(v.obtentionAvant)} (${dans(v.obtentionAvant, auj)})`, v.obtentionAvant);
    if (v.offrePret) {
      const des = acceptationPret(v.offrePret);
      e("offrePret", "Offre de prêt", des <= auj ? "fait" : "aVenir", des <= auj ? `Reçue ${le(v.offrePret)}, acceptable depuis ${le(des)}` : `Reçue ${le(v.offrePret)} : acceptation possible à partir ${le(des).replace(/^le /, "du ")}`, des);
    }
  }

  // Droit de préemption
  if (v.dia || v.renonciation) {
    const label = "Droit de préemption";
    if (v.renonciation) e("dia", label, "fait", `Renonciation de la mairie reçue ${le(v.renonciation)}`, v.renonciation);
    else {
      const fin = finPreemption(v.dia!);
      e("dia", label, fin < auj ? "fait" : "aVenir", fin < auj ? `Délai de 2 mois écoulé ${le(fin)}` : `Réponse de la mairie au plus tard ${le(fin)}`, fin);
    }
  }

  // Acte authentique
  const heure = v.acteHeure ? ` à ${v.acteHeure.replace(":", "h")}` : "";
  if (v.acteSigne) e("acte", "Acte de vente", "fait", `Signé ${le(v.acteSigne)}`, v.acteSigne);
  else if (!v.acte) e("acte", "Acte de vente", "aCompleter", "Date à fixer avec le notaire");
  else if (v.acte < auj) e("acte", "Acte de vente", "depasse", `Prévu ${le(v.acte)} : l'acte est-il signé ?`, v.acte, "warn");
  else e("acte", "Acte de vente", joursEntre(auj, v.acte) <= 7 ? "bientot" : "aVenir", `${dateTexte(v.acte, auj, true).replace(/^./, (c) => c.toUpperCase())}${heure} (${dans(v.acte, auj)})`, v.acte);

  // Acte signé : la vente est faite, seules les étapes passées restent au calendrier.
  return v.acteSigne ? out.filter((x) => x.etat === "fait") : out;
}

const URGENCE: EtatEcheance[] = ["depasse", "bientot", "aCompleter", "aVenir"];

/** L'échéance qui demande le plus d'attention. */
export function prochaine(liste: Echeance[]) {
  for (const etat of URGENCE) {
    const x = liste.find((y) => y.etat === etat);
    if (x) return x;
  }
}

/** Dates incohérentes entre elles (rien n'est corrigé d'office). */
export function incoherences(b: Bien): string[] {
  const v = venteDe(b);
  const out: string[] = [];
  if (v.acteSigne) return out;
  if (avecPret(b) && v.signature && v.obtentionAvant && v.obtentionAvant < minimumPret(v.signature))
    out.push("La date limite du prêt est à moins d'un mois de la signature : la condition suspensive doit durer au moins un mois.");
  if (v.acte) {
    if (avecRetractation(b) && v.notification && v.acte <= finRetractation(v.notification)) out.push("L'acte est prévu avant la fin du délai de rétractation.");
    if (avecPret(b) && v.offrePret && v.acte < acceptationPret(v.offrePret)) out.push("L'acte est prévu avant que l'acquéreur puisse accepter son offre de prêt (délai de réflexion de 10 jours).");
    if (v.dia && !v.renonciation && v.acte < finPreemption(v.dia)) out.push("L'acte est prévu avant la fin du délai de préemption : vérifier avec le notaire que la mairie a renoncé.");
    if (avecPret(b) && !v.accord && v.obtentionAvant && v.acte < v.obtentionAvant) out.push("L'acte est prévu avant la date limite d'obtention du prêt, sans accord de la banque saisi.");
  }
  return out;
}

/** Ce qu'il manque pour que le suivi soit complet (pour le briefing). */
export function manques(b: Bien, auj: string): string[] {
  const v = venteDe(b);
  const pret = avecPret(b);
  return [
    !v.signature && "date de signature de l'avant-contrat",
    avecRetractation(b) && v.signature && v.signature <= auj && !v.notification && "date de notification à l'acquéreur",
    pret === undefined && "financement (prêt ou comptant)",
    pret && !v.accord && !v.obtentionAvant && "date limite d'obtention du prêt",
  ].filter((x): x is string => !!x);
}

/** Cases d'avant l'acte pas encore cochées. */
export const checksRestants = (b: Bien) => CHECKS.filter((c) => !venteDe(b).faits?.[c.cle]);

/** Dernier point fait avec l'un des contacts donnés (date ISO). */
export function dernierPoint(b: Bien, ids: string[]) {
  const points = venteDe(b).points ?? {};
  return ids.map((id) => points[id]).filter(Boolean).sort().pop();
}

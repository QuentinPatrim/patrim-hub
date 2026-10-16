/* ============================================================
   « Mes chiffres » : honoraires encaissés (acte signé) et à
   venir, activité du mois, transformation et origine des
   acquéreurs. Tout vient de ce qui est saisi dans le Hub (suivi
   de la vente, offres, agenda, mandats, estimations) : une date
   ou un montant manquant n'est pas compté, rien n'est deviné.
   Fonctions pures, aussi utilisées par l'accueil.
   ============================================================ */

import type { Bien, Contact, EtapeAcquereur, Estimation, Rdv, Source } from "@/lib/types";
import type { BienActes } from "@/components/documents/archive";
import { VENTE_EN_COURS, acquereursDe, ajouterJours, ajouterMois, joursEntre, offreRetenue, venteDe } from "@/components/vente/vente";

export interface Donnees {
  biens: Bien[];
  contacts: Contact[];
  rdvs: Rdv[];
  estimations: Estimation[];
}

/* ---------- Périodes ---------- */

/** Période, bornes comprises (AAAA-MM-JJ). */
export interface Periode {
  de: string;
  a: string;
}
const dans = (ymd: string | undefined, p: Periode) => !!ymd && ymd >= p.de && ymd <= p.a;

export const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];

/** Jour à Paris (AAAA-MM-JJ) d'une date ISO ; un jour est rendu tel quel. */
export function jourDe(iso?: string) {
  if (!iso) return undefined;
  if (/^\d{4}-\d{2}-\d{2}$/.test(iso)) return iso;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? undefined : d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
}

/** Le mois du jour donné, décalé de n mois (0 : ce mois-ci, -1 : le mois dernier). */
export function mois(auj: string, n = 0): Periode & { nom: string } {
  const de = ajouterMois(`${auj.slice(0, 7)}-01`, n);
  return { de, a: ajouterJours(ajouterMois(de, 1), -1), nom: MOIS[Number(de.slice(5, 7)) - 1] };
}
export const annee = (an: number): Periode => ({ de: `${an}-01-01`, a: `${an}-12-31` });
/** Les 12 derniers mois, aujourd'hui compris. */
export const douzeMois = (auj: string): Periode => ({ de: ajouterJours(ajouterMois(auj, -12), 1), a: auj });

/* ---------- Honoraires ---------- */

/** Vente engagée : sous offre, compromis, vendu, ou acte saisi. */
const engagee = (b: Bien) => VENTE_EN_COURS(b) || b.statut === "vendu" || !!venteDe(b).acteSigne;

/**
 * Honoraires d'un bien : pour une vente engagée, ceux de l'offre retenue (ils ont pu être
 * négociés) ; sinon ceux de la fiche ; sinon prix moins net vendeur. undefined : inconnus.
 */
export function honorairesDe(b: Bien): number | undefined {
  const offre = engagee(b) ? offreRetenue(b)?.honoraires : undefined;
  if (offre != null) return offre;
  if (b.honoraires != null) return b.honoraires;
  if (b.prix != null && b.netVendeur != null && b.prix > b.netVendeur) return b.prix - b.netVendeur;
  return undefined;
}

/** signee : acte passé ; enCours : sous offre ou compromis ; aDater : vendu sans date d'acte. */
export type EtatVente = "signee" | "enCours" | "aDater";
export interface Vente {
  b: Bien;
  etat: EtatVente;
  honoraires?: number;
  /** Acte signé, ou prévu pour une vente en cours. */
  acte?: string;
}

/** Ventes signées, en cours et à dater, d'après le suivi de la vente. */
export function ventes(biens: Bien[], auj: string): Vente[] {
  const out: Vente[] = [];
  for (const b of biens) {
    const v = venteDe(b);
    if (v.acteSigne && v.acteSigne <= auj) out.push({ b, etat: "signee", honoraires: honorairesDe(b), acte: v.acteSigne });
    else if (VENTE_EN_COURS(b) || (b.statut === "vendu" && v.acteSigne)) out.push({ b, etat: "enCours", honoraires: honorairesDe(b), acte: v.acteSigne ?? v.acte });
    else if (b.statut === "vendu") out.push({ b, etat: "aDater", honoraires: honorairesDe(b) });
  }
  return out;
}

const EN_PORTEFEUILLE = (b: Bien) => b.statut === "en_vente" || b.statut === "mandat_signe";
const somme = (l: (number | undefined)[]) => l.reduce<number>((s, n) => s + (n ?? 0), 0);

export interface Bilan {
  /** Honoraires des actes signés depuis le 1er janvier, et nombre d'actes. */
  encaisses: number;
  actes: number;
  /** Honoraires des ventes en cours (sous offre, compromis). */
  aVenir: number;
  enCours: number;
  /** Honoraires potentiels des biens en vente. */
  portefeuille: number;
  mandats: number;
  /** Ventes et biens en vente dont les honoraires ne sont pas connus. */
  sansMontant: number;
}

export function bilan(biens: Bien[], auj: string): Bilan {
  const vs = ventes(biens, auj);
  const signees = vs.filter((v) => v.etat === "signee" && dans(v.acte, annee(Number(auj.slice(0, 4)))));
  const enCours = vs.filter((v) => v.etat === "enCours");
  const stock = biens.filter(EN_PORTEFEUILLE).map(honorairesDe);
  return {
    encaisses: somme(signees.map((v) => v.honoraires)),
    actes: signees.length,
    aVenir: somme(enCours.map((v) => v.honoraires)),
    enCours: enCours.length,
    portefeuille: somme(stock),
    mandats: stock.length,
    sansMontant: [...signees, ...enCours].filter((v) => v.honoraires == null).length + stock.filter((h) => h == null).length,
  };
}

/** Honoraires potentiels (accueil) : ventes en cours et biens en vente. */
export function honorairesPotentiels(biens: Bien[], auj: string) {
  const b = bilan(biens, auj);
  return b.aVenir + b.portefeuille;
}

export interface MoisHonoraires {
  mois: number; // 0 à 11
  signe: number;
  prevu: number;
}

/** Honoraires mois par mois : actes signés, et actes prévus des ventes en cours. */
export function parMois(vs: Vente[], an: number): MoisHonoraires[] {
  const out = MOIS.map((_, i) => ({ mois: i, signe: 0, prevu: 0 }));
  for (const v of vs) {
    if (!v.acte || Number(v.acte.slice(0, 4)) !== an) continue;
    const m = out[Number(v.acte.slice(5, 7)) - 1];
    if (v.etat === "signee") m.signe += v.honoraires ?? 0;
    else if (v.etat === "enCours") m.prevu += v.honoraires ?? 0;
  }
  return out;
}

/** Années du graphique : celles des actes signés ou prévus, et l'année en cours. */
export function anneesDe(vs: Vente[], auj: string): number[] {
  const s = new Set([Number(auj.slice(0, 4))]);
  vs.forEach((v) => v.acte && s.add(Number(v.acte.slice(0, 4))));
  return [...s].sort((x, y) => x - y);
}

/* ---------- Activité ---------- */

export interface Activite {
  estimations: number;
  mandats: number;
  exclusifs: number;
  acquereurs: number;
  visites: number;
  offres: number;
  compromis: number;
  actes: number;
}

const AVEC_EXCLUSIVITE = (b: Bien) => b.mandat?.type === "exclusif" || b.mandat?.type === "semi_exclusif";
/** Rendez-vous qui a eu lieu (ou aurait dû avoir lieu) : pas annulé, et passé. */
const passe = (r: Rdv, maintenant: Date) => r.statut !== "annule" && new Date(r.debut).getTime() <= maintenant.getTime();
const signeAvant = (ymd: string | undefined, auj: string) => !!ymd && ymd <= auj;

/** Offres rédigées dans le Hub : date et acquéreurs. */
function offresDu(biens: Bien[]) {
  return biens.flatMap((b) =>
    ((b as BienActes).actes ?? []).flatMap((a) =>
      a.kind === "offre" ? [{ date: a.data.date || jourDe(a.creeLe), contactIds: a.data.acquereurs.map((p) => p.contactId).filter((x): x is string => !!x) }] : []
    )
  );
}

/**
 * Estimations : celles faites dans le Hub et les rendez-vous d'estimation de l'agenda.
 * Un rendez-vous et une estimation du même jour sont le plus souvent la même : jour par
 * jour, le plus grand des deux nombres est retenu.
 */
function estimationsDans(d: Donnees, p: Periode, maintenant: Date) {
  const faites = new Map<string, number>();
  const rdvs = new Map<string, number>();
  const compter = (m: Map<string, number>, j?: string) => j && dans(j, p) && m.set(j, (m.get(j) ?? 0) + 1);
  d.estimations.forEach((e) => compter(faites, jourDe(e.createdAt)));
  d.rdvs.forEach((r) => r.type === "estimation" && passe(r, maintenant) && compter(rdvs, jourDe(r.debut)));
  let n = 0;
  new Set([...faites.keys(), ...rdvs.keys()]).forEach((j) => (n += Math.max(faites.get(j) ?? 0, rdvs.get(j) ?? 0)));
  return n;
}

export function activite(d: Donnees, p: Periode, maintenant: Date): Activite {
  const auj = jourDe(maintenant.toISOString())!;
  const mandats = d.biens.filter((b) => dans(b.mandat?.debut, p));
  return {
    estimations: estimationsDans(d, p, maintenant),
    mandats: mandats.length,
    exclusifs: mandats.filter(AVEC_EXCLUSIVITE).length,
    acquereurs: d.contacts.filter((c) => c.roles?.includes("acquereur") && dans(jourDe(c.createdAt), p)).length,
    visites: d.rdvs.filter((r) => r.type === "visite" && passe(r, maintenant) && dans(jourDe(r.debut), p)).length,
    offres: offresDu(d.biens).filter((o) => dans(o.date, p)).length,
    compromis: d.biens.filter((b) => signeAvant(venteDe(b).signature, auj) && dans(venteDe(b).signature, p)).length,
    actes: d.biens.filter((b) => signeAvant(venteDe(b).acteSigne, auj) && dans(venteDe(b).acteSigne, p)).length,
  };
}

/* ---------- Parcours des acquéreurs ---------- */

const ETAPES_VISITE: EtapeAcquereur[] = ["visite", "offre", "compromis", "gagne"];
const ETAPES_OFFRE: EtapeAcquereur[] = ["offre", "compromis", "gagne"];
const ETAPES_VENTE: EtapeAcquereur[] = ["compromis", "gagne"];

export interface Parcours {
  visite: boolean;
  offre: boolean;
  vente: boolean;
}

/**
 * Jusqu'où chaque acquéreur est allé : visite (agenda), offre (rédigée dans le Hub), achat
 * (avant-contrat ou acte). L'étape de la fiche contact complète ; une étape franchie compte
 * les précédentes (une offre suppose une visite).
 */
function parcours(d: Donnees, maintenant: Date): (c: Contact) => Parcours {
  const auj = jourDe(maintenant.toISOString())!;
  const visiteurs = new Set(d.rdvs.filter((r) => r.type === "visite" && passe(r, maintenant)).flatMap((r) => r.contactIds ?? []));
  const offrants = new Set(offresDu(d.biens).flatMap((o) => o.contactIds));
  const acheteurs = new Set(
    d.biens
      .filter((b) => b.statut === "compromis" || b.statut === "vendu" || signeAvant(venteDe(b).signature, auj) || signeAvant(venteDe(b).acteSigne, auj))
      .flatMap(acquereursDe)
  );
  return (c) => {
    const e = c.etape ?? "nouveau";
    const vente = acheteurs.has(c.id) || ETAPES_VENTE.includes(e);
    const offre = vente || offrants.has(c.id) || ETAPES_OFFRE.includes(e);
    return { visite: offre || visiteurs.has(c.id) || ETAPES_VISITE.includes(e), offre, vente };
  };
}

const nouveauxAcquereurs = (d: Donnees, p: Periode) => d.contacts.filter((c) => c.roles?.includes("acquereur") && dans(jourDe(c.createdAt), p));

/* ---------- Transformation (12 derniers mois) ---------- */

export interface Transformation {
  /** Acquéreurs arrivés sur 12 mois qui ont visité, et parmi eux ceux qui ont fait une offre. */
  visiteurs: number;
  offrants: number;
  /** Estimations faites dans le Hub sur 12 mois, et celles devenues mandat. */
  estimations: number;
  mandatsObtenus: number;
  /** Délai moyen (jours) entre la mise en vente et l'accord, sur les ventes des 12 derniers mois. */
  delai?: number;
  ventesDelai: number;
  /** Mandats en cours, et ceux avec exclusivité (exclusif ou semi-exclusif). */
  mandatsEnCours: number;
  exclusifs: number;
}

/** Jour où le bien a trouvé preneur : avant-contrat signé, sinon offre acceptée. */
function accord(b: Bien, auj: string) {
  const s = venteDe(b).signature;
  if (signeAvant(s, auj)) return s;
  return ((b as BienActes).actes ?? [])
    .flatMap((a) => (a.kind === "offre" && a.statut === "signe" && a.data.date ? [a.data.date] : []))
    .sort()[0];
}

const STATUTS_MANDAT_EN_COURS = new Set(["mandat_signe", "en_vente", "sous_offre", "compromis"]);

export function transformation(d: Donnees, maintenant: Date): Transformation {
  const auj = jourDe(maintenant.toISOString())!;
  const p = douzeMois(auj);
  const de = parcours(d, maintenant);
  const acquereurs = nouveauxAcquereurs(d, p).map(de);
  const estimations = d.estimations.filter((e) => dans(jourDe(e.createdAt), p));
  const delais = d.biens.flatMap((b) => {
    const debut = b.dateMiseEnVente ?? b.mandat?.debut;
    const fin = accord(b, auj);
    return debut && fin && dans(fin, p) && fin >= debut ? [joursEntre(debut, fin)] : [];
  });
  const enCours = d.biens.filter((b) => STATUTS_MANDAT_EN_COURS.has(b.statut));
  return {
    visiteurs: acquereurs.filter((x) => x.visite).length,
    offrants: acquereurs.filter((x) => x.offre).length,
    estimations: estimations.length,
    mandatsObtenus: estimations.filter((e) => e.statut === "mandat" || !!e.bienId).length,
    delai: delais.length ? Math.round(somme(delais) / delais.length) : undefined,
    ventesDelai: delais.length,
    mandatsEnCours: enCours.length,
    exclusifs: enCours.filter(AVEC_EXCLUSIVITE).length,
  };
}

/* ---------- Origine des acquéreurs (12 derniers mois) ---------- */

export interface LigneOrigine {
  source?: Source;
  contacts: number;
  visite: number;
  offre: number;
  vente: number;
}

/** Nouveaux acquéreurs des 12 derniers mois par origine, et jusqu'où ils sont allés. Origine non renseignée en dernier. */
export function origines(d: Donnees, maintenant: Date): LigneOrigine[] {
  const de = parcours(d, maintenant);
  const lignes = new Map<string, LigneOrigine>();
  for (const c of nouveauxAcquereurs(d, douzeMois(jourDe(maintenant.toISOString())!))) {
    const l = lignes.get(c.source ?? "") ?? { source: c.source, contacts: 0, visite: 0, offre: 0, vente: 0 };
    const x = de(c);
    l.contacts++;
    if (x.visite) l.visite++;
    if (x.offre) l.offre++;
    if (x.vente) l.vente++;
    lignes.set(c.source ?? "", l);
  }
  return [...lignes.values()].sort((x, y) => Number(!x.source) - Number(!y.source) || y.contacts - x.contacts || y.offre - x.offre);
}

/* ---------- Affichage ---------- */

/** « 7,5 k€ », « 21 k€ », « 850 € », « 0 € » : sans retour à la ligne avant l'unité. */
export function kEur(n: number) {
  if (n < 1000) return `${Math.round(n).toLocaleString("fr-FR")} €`;
  return `${(n / 1000).toLocaleString("fr-FR", { maximumFractionDigits: n < 10000 ? 1 : 0 })} k€`;
}

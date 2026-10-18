/* ============================================================
   « Mes revenus » : fixe, commissions et indemnités du
   conseiller, mois par mois. Données personnelles : elles vivent
   seulement dans le compte du conseiller (hub_docs, kind
   « revenus », jamais partagé à l'équipe par les règles de la
   base) et jamais dans le code. Fonctions pures.
   ============================================================ */

/** Une période du contrat (alternance, CDI…) et ce qu'elle verse chaque mois. */
export interface Periode {
  id: string;
  intitule: string;
  debut: string; // AAAA-MM
  fin?: string; // AAAA-MM, vide = en cours
  fixe?: number; // par mois
  ik?: number; // indemnités kilométriques par mois
  /** 13e mois versé en décembre, au prorata des mois de la période dans l'année. */
  treizieme?: boolean;
}

export interface Contrat {
  id: string;
  nature: "contrat";
  periodes: Periode[];
  /** Base des montants : brut ou net. */
  base: "brut" | "net";
  /** Part des honoraires d'agence HT sur une vente (0,15 = 15 %). */
  taux: number;
  /** Part des honoraires HT sur une location (honoraires locataire × 2). */
  tauxLocation: number;
  /** Part du loyer mensuel sur une mise en gestion, et nombre de mois versés d'un coup. */
  tauxGestion: number;
  moisGestion: number;
  /** Honoraires saisis TTC (la TVA est retirée avant la commission). */
  honorairesTTC: boolean;
  tva: number;
  /** Commission versée avec la paie du mois de l'acte (0) ou du mois suivant (1). */
  decalage: 0 | 1;
  /** Objectif de commissions par année. */
  objectifs: Record<string, number>;
  updatedAt: string;
}

export type StatutVente = "acte" | "compromis" | "offre";
export type TypeDossier = "vente" | "location" | "gestion";

/** Un dossier qui rapporte une commission (vente, location ou mise en gestion). */
export interface VenteRevenu {
  id: string;
  nature: "vente";
  type?: TypeDossier; // vide = vente
  libelle: string; // propriétaire ou bien
  adresse?: string;
  mandat?: string;
  prixVente?: number;
  /** Vente : honoraires d'agence ; location : honoraires locataire ; gestion : loyer mensuel. */
  honoraires?: number;
  dateCompromis?: string; // AAAA-MM-JJ
  dateActe?: string; // signée ou prévue
  /** Mois de paie choisi à la main (AAAA-MM) ; vide = mois de l'acte. */
  moisPaie?: string;
  statut: StatutVente; // « acte » = encaissé
  partage: number; // nombre de commerciaux sur le dossier
  /** Commission du conseiller ; vide = calculée. */
  commission?: number;
  source: "excel" | "saisie";
  cle?: string; // repère pour mettre à jour un dossier déjà importé
  updatedAt: string;
}

/** Un mois pointé à la main d'après la fiche de paie (ou repris de l'Excel). */
export interface MoisRevenu {
  id: string;
  nature: "mois";
  mois: string; // AAAA-MM
  fixe?: number;
  /** Commissions du mois qui ne sont pas détaillées par dossier. */
  commissions?: number;
  primes?: number;
  ik?: number;
  autres?: number;
  /** Total réellement versé (fiche de paie), pour comparer. */
  verse?: number;
  note?: string;
  source?: "excel" | "saisie";
  updatedAt: string;
}

export type DocRevenu = Contrat | VenteRevenu | MoisRevenu;

export const CONTRAT_DEFAUT: Omit<Contrat, "id" | "updatedAt"> = {
  nature: "contrat",
  periodes: [],
  base: "brut",
  taux: 0.15,
  tauxLocation: 0.135,
  tauxGestion: 0.06,
  moisGestion: 6,
  honorairesTTC: true,
  tva: 0.2,
  decalage: 0,
  objectifs: {},
};

export const TYPE_DOSSIER: Record<TypeDossier, string> = { vente: "Vente", location: "Location", gestion: "Gestion" };

/* ---------- Mois ---------- */

export const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
export const moisDe = (ymd: string) => ymd.slice(0, 7);
export function decaler(m: string, n: number) {
  const [a, mm] = m.split("-").map(Number);
  const t = a * 12 + (mm - 1) + n;
  return `${Math.floor(t / 12)}-${String((t % 12) + 1).padStart(2, "0")}`;
}
export function nomMois(m: string, avecAnnee = true) {
  const t = MOIS[Number(m.slice(5, 7)) - 1] ?? m;
  return avecAnnee ? `${t} ${m.slice(0, 4)}` : t;
}
export const majuscule = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
export function entre(de: string, a: string) {
  const out: string[] = [];
  for (let m = de; m <= a && out.length < 600; m = decaler(m, 1)) out.push(m);
  return out;
}

/* ---------- Commissions ---------- */

/** Commission d'un dossier : saisie, sinon calculée comme dans le classeur de Quentin. */
export function commissionDe(v: VenteRevenu, c: Contrat): number | undefined {
  if (v.commission != null) return v.commission;
  if (v.honoraires == null) return undefined;
  const ht = (x: number) => (c.honorairesTTC ? x / (1 + c.tva) : x);
  const part = Math.max(1, v.partage || 1);
  if (v.type === "location") return (ht(v.honoraires * 2) * (c.tauxLocation ?? CONTRAT_DEFAUT.tauxLocation)) / part;
  if (v.type === "gestion") return (v.honoraires * (c.moisGestion ?? CONTRAT_DEFAUT.moisGestion) * (c.tauxGestion ?? CONTRAT_DEFAUT.tauxGestion)) / part;
  return (ht(v.honoraires) * c.taux) / part;
}

/** Mois de paie où tombe la commission d'un dossier. */
export function moisPaie(v: VenteRevenu, c: Contrat) {
  if (v.moisPaie) return v.moisPaie;
  return v.dateActe ? decaler(moisDe(v.dateActe), c.decalage) : undefined;
}

/** Encaissé : acte signé (ou dossier encaissé) et mois de paie arrivé. */
export function actee(v: VenteRevenu, auj: string, c?: Contrat) {
  if (v.statut !== "acte") return false;
  if (v.moisPaie) return v.moisPaie <= moisDe(auj);
  return !!v.dateActe && v.dateActe <= auj && (!c || (moisPaie(v, c) ?? "") <= moisDe(auj));
}

/** Ce que le contrat prévoit pour un mois (undefined : hors contrat). */
export function contratDuMois(m: string, c: Contrat) {
  const p = c.periodes.find((x) => x.debut <= m && (!x.fin || m <= x.fin));
  if (!p) return undefined;
  let fixe = p.fixe;
  if (fixe != null && p.treizieme && m.endsWith("-12")) {
    const an = m.slice(0, 4);
    const nb = entre(`${an}-01`, `${an}-12`).filter((x) => x >= p.debut && (!p.fin || x <= p.fin)).length;
    fixe += (p.fixe! * nb) / 12;
  }
  return { fixe, ik: p.ik, periode: p };
}

export interface LigneMois {
  mois: string;
  fixe: number;
  fixeConnu: boolean;
  commissions: number;
  ventes: VenteRevenu[];
  primes: number;
  ik: number;
  autres: number;
  total: number;
  pointe?: MoisRevenu;
  periode?: Periode;
}

export interface Donnees {
  contrat: Contrat;
  ventes: VenteRevenu[];
  mois: MoisRevenu[];
}

/** Premier mois connu : début du contrat, sinon première commission ou premier mois pointé. */
export function premierMois(d: Donnees, auj: string) {
  const cands = [
    ...d.contrat.periodes.map((p) => p.debut),
    ...d.ventes.filter((v) => actee(v, auj, d.contrat)).map((v) => moisPaie(v, d.contrat)!),
    ...d.mois.map((m) => m.mois),
  ].filter((m) => m && m <= moisDe(auj));
  return cands.length ? cands.sort()[0] : undefined;
}

export function ligne(m: string, d: Donnees, auj: string): LigneMois {
  const pointe = d.mois.find((x) => x.mois === m);
  const cm = contratDuMois(m, d.contrat);
  const fixeVal = pointe?.fixe ?? cm?.fixe;
  const ventes = d.ventes.filter((v) => actee(v, auj, d.contrat) && moisPaie(v, d.contrat) === m);
  const commissions = ventes.reduce((s, v) => s + (commissionDe(v, d.contrat) ?? 0), 0) + (pointe?.commissions ?? 0);
  const primes = pointe?.primes ?? 0;
  const ik = pointe?.ik ?? cm?.ik ?? 0;
  const autres = pointe?.autres ?? 0;
  const fixe = fixeVal ?? 0;
  return { mois: m, fixe, fixeConnu: fixeVal != null, commissions, ventes, primes, ik, autres, total: fixe + commissions + primes + ik + autres, pointe, periode: cm?.periode };
}

/** Tous les mois, du premier connu au mois en cours. */
export function lignes(d: Donnees, auj: string): LigneMois[] {
  const de = premierMois(d, auj);
  if (!de) return [];
  return entre(de, moisDe(auj)).map((m) => ligne(m, d, auj));
}

const somme = (ls: LigneMois[], f: (l: LigneMois) => number) => ls.reduce((s, l) => s + f(l), 0);

export interface Bilan {
  an: number;
  total: number;
  fixe: number;
  variable: number; // commissions + primes
  partVariable?: number;
  moisEcoules: number;
  moyenne?: number;
  meilleur?: LigneMois;
  totalN1?: number;
  commissionsN1?: number;
  evolution?: number;
  evolutionCommissions?: number;
  dossiers: number;
  commissions: number;
  moisAvecCommission: number;
  depuisDebut: number;
  commissionsDepuisDebut: number;
  moisDepuisDebut: number;
  moyenneCommissions?: number; // par mois avec commission, depuis le début
  ventesDepuisDebut: number;
  commissionMoyenneVente?: number;
  honorairesApportes: number;
  fixeManquant: number;
}

export function bilan(d: Donnees, auj: string, an = Number(auj.slice(0, 4))): Bilan {
  const toutes = lignes(d, auj);
  const fin = an === Number(auj.slice(0, 4)) ? moisDe(auj) : `${an}-12`;
  const annee = toutes.filter((l) => l.mois.startsWith(`${an}-`) && l.mois <= fin);
  const finN1 = `${an - 1}-${fin.slice(5, 7)}`;
  const n1 = toutes.filter((l) => l.mois.startsWith(`${an - 1}-`) && l.mois <= finN1);
  const total = somme(annee, (l) => l.total);
  const fixe = somme(annee, (l) => l.fixe);
  const variable = somme(annee, (l) => l.commissions + l.primes);
  const commissions = somme(annee, (l) => l.commissions);
  const totalN1 = n1.length ? somme(n1, (l) => l.total) : undefined;
  const commissionsN1 = n1.length ? somme(n1, (l) => l.commissions) : undefined;
  const avecCom = toutes.filter((l) => l.commissions > 0);
  const ventes = d.ventes.filter((v) => actee(v, auj, d.contrat) && (v.type ?? "vente") === "vente");
  const comVentes = ventes.map((v) => commissionDe(v, d.contrat)).filter((x): x is number => x != null);
  return {
    an,
    total,
    fixe,
    variable,
    partVariable: total > 0 ? variable / total : undefined,
    moisEcoules: annee.length,
    moyenne: annee.length && total > 0 ? total / annee.length : undefined,
    meilleur: annee.reduce<LigneMois | undefined>((b, l) => (l.total > 0 && (!b || l.total > b.total) ? l : b), undefined),
    totalN1,
    commissionsN1,
    evolution: totalN1 ? total / totalN1 - 1 : undefined,
    evolutionCommissions: commissionsN1 ? commissions / commissionsN1 - 1 : undefined,
    dossiers: annee.reduce((s, l) => s + l.ventes.length, 0),
    commissions,
    moisAvecCommission: annee.filter((l) => l.commissions > 0).length,
    depuisDebut: somme(toutes, (l) => l.total),
    commissionsDepuisDebut: somme(toutes, (l) => l.commissions),
    moisDepuisDebut: toutes.length,
    moyenneCommissions: avecCom.length ? somme(avecCom, (l) => l.commissions) / avecCom.length : undefined,
    ventesDepuisDebut: ventes.length,
    commissionMoyenneVente: comVentes.length ? comVentes.reduce((s, x) => s + x, 0) / comVentes.length : undefined,
    honorairesApportes: ventes.reduce((s, v) => s + (v.honoraires ?? 0), 0),
    fixeManquant: toutes.filter((l) => !l.fixeConnu).length,
  };
}

/** Par année : total, fixe, commissions, mois. */
export function parAnnee(d: Donnees, auj: string) {
  const map = new Map<number, { an: number; total: number; fixe: number; variable: number; ik: number; mois: number }>();
  for (const l of lignes(d, auj)) {
    const an = Number(l.mois.slice(0, 4));
    const r = map.get(an) ?? { an, total: 0, fixe: 0, variable: 0, ik: 0, mois: 0 };
    r.total += l.total;
    r.fixe += l.fixe;
    r.variable += l.commissions + l.primes;
    r.ik += l.ik;
    r.mois += 1;
    map.set(an, r);
  }
  return [...map.values()].sort((a, b) => b.an - a.an);
}

export interface Projection {
  an: number;
  realise: number;
  commissionsRealisees: number;
  fixeRestant: number;
  aVenir: { v: VenteRevenu; commission?: number; mois?: string }[];
  commissionsAVenir: number;
  atterrissage: number;
  objectif?: number;
  reste?: number;
  moisRestants: number;
  rythme?: number;
  ventesNecessaires?: number;
  honorairesNecessaires?: number;
}

/** Fin d'année : réalisé + fixe et IK des mois restants + dossiers en cours qui tombent avant le 31/12. */
export function projection(d: Donnees, auj: string): Projection {
  const an = Number(auj.slice(0, 4));
  const b = bilan(d, auj, an);
  const mois = moisDe(auj);
  const restants = entre(decaler(mois, 1), `${an}-12`);
  const fixeRestant = restants.reduce((s, m) => {
    const c = contratDuMois(m, d.contrat);
    return s + (c?.fixe ?? 0) + (c?.ik ?? 0);
  }, 0);
  const aVenir = d.ventes
    .filter((v) => !actee(v, auj, d.contrat))
    .map((v) => ({ v, commission: commissionDe(v, d.contrat), mois: moisPaie(v, d.contrat) }))
    .sort((x, y) => (x.mois ?? "9").localeCompare(y.mois ?? "9"));
  // Acte prévu d'ici décembre (une date dépassée reste attendue)
  const commissionsAVenir = aVenir.filter((x) => x.mois && x.mois <= `${an}-12`).reduce((s, x) => s + (x.commission ?? 0), 0);
  const objectif = d.contrat.objectifs[String(an)];
  const reste = objectif != null ? Math.max(0, objectif - b.commissions) : undefined;
  const moisRestants = restants.length + 1; // le mois en cours compte encore
  const ttc = (x: number) => (d.contrat.honorairesTTC ? x * (1 + d.contrat.tva) : x);
  return {
    an,
    realise: b.total,
    commissionsRealisees: b.commissions,
    fixeRestant,
    aVenir,
    commissionsAVenir,
    atterrissage: b.total + fixeRestant + commissionsAVenir,
    objectif,
    reste,
    moisRestants,
    rythme: reste != null && reste > 0 ? reste / moisRestants : undefined,
    ventesNecessaires: reste && b.commissionMoyenneVente && b.ventesDepuisDebut >= 3 ? Math.ceil(reste / b.commissionMoyenneVente) : undefined,
    honorairesNecessaires: reste && d.contrat.taux ? ttc(reste / d.contrat.taux) : undefined,
  };
}

/** Le mois à pointer : le mois dernier s'il ne l'est pas encore. */
export function moisAPointer(d: Donnees, auj: string) {
  const dernier = decaler(moisDe(auj), -1);
  const debut = premierMois(d, auj);
  if (debut && debut <= dernier && !d.mois.some((m) => m.mois === dernier)) return dernier;
  return undefined;
}

/* ============================================================
   « Mes revenus » : fixe et commissions du conseiller, mois par
   mois. Données personnelles : elles vivent seulement dans le
   compte du conseiller (hub_docs, kind « revenus », jamais
   partagé à l'équipe par les règles de la base) et jamais dans
   le code. Fonctions pures.
   ============================================================ */

/** Une période du contrat (alternance, CDI…) et son fixe mensuel. */
export interface Periode {
  id: string;
  intitule: string;
  debut: string; // AAAA-MM
  fin?: string; // AAAA-MM, vide = en cours
  fixe?: number; // par mois
}

export interface Contrat {
  id: string;
  nature: "contrat";
  periodes: Periode[];
  /** Base des montants : brut ou net. */
  base: "brut" | "net";
  /** Part des honoraires d'agence HT qui revient au conseiller (0,15 = 15 %). */
  taux: number;
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

/** Une vente qui rapporte une commission. */
export interface VenteRevenu {
  id: string;
  nature: "vente";
  libelle: string; // propriétaire ou bien
  adresse?: string;
  mandat?: string;
  prixVente?: number;
  honoraires?: number; // honoraires d'agence, tels que saisis (TTC ou HT selon le contrat)
  dateCompromis?: string; // AAAA-MM-JJ
  dateActe?: string; // signée ou prévue
  statut: StatutVente;
  partage: number; // nombre de commerciaux sur le dossier
  /** Commission du conseiller ; vide = calculée depuis les honoraires. */
  commission?: number;
  source: "excel" | "saisie";
  cle?: string; // repère pour mettre à jour une vente déjà importée
  updatedAt: string;
}

/** Un mois pointé à la main d'après la fiche de paie. */
export interface MoisRevenu {
  id: string;
  nature: "mois";
  mois: string; // AAAA-MM
  fixe?: number;
  primes?: number;
  autres?: number;
  /** Total réellement versé (fiche de paie), pour comparer. */
  verse?: number;
  note?: string;
  updatedAt: string;
}

export type DocRevenu = Contrat | VenteRevenu | MoisRevenu;

export const CONTRAT_DEFAUT: Omit<Contrat, "id" | "updatedAt"> = {
  nature: "contrat",
  periodes: [],
  base: "brut",
  taux: 0.15,
  honorairesTTC: true,
  tva: 0.2,
  decalage: 0,
  objectifs: {},
};

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

/** Commission d'une vente : saisie, sinon honoraires HT × taux ÷ nombre de commerciaux. */
export function commissionDe(v: VenteRevenu, c: Contrat): number | undefined {
  if (v.commission != null) return v.commission;
  if (v.honoraires == null) return undefined;
  const ht = c.honorairesTTC ? v.honoraires / (1 + c.tva) : v.honoraires;
  return (ht * c.taux) / Math.max(1, v.partage || 1);
}

/** Mois de paie où tombe la commission d'une vente actée. */
export function moisPaie(v: VenteRevenu, c: Contrat) {
  return v.dateActe ? decaler(moisDe(v.dateActe), c.decalage) : undefined;
}

/** Fixe prévu par le contrat pour un mois (undefined : hors contrat ou montant inconnu). */
export function fixeContrat(m: string, c: Contrat) {
  const p = c.periodes.find((x) => x.debut <= m && (!x.fin || m <= x.fin));
  return p ? { fixe: p.fixe, periode: p } : undefined;
}

export interface LigneMois {
  mois: string;
  fixe: number;
  fixeConnu: boolean;
  commissions: number;
  ventes: VenteRevenu[];
  primes: number;
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

/** Les ventes actées (acte signé à aujourd'hui). */
export const actee = (v: VenteRevenu, auj: string) => v.statut === "acte" && !!v.dateActe && v.dateActe <= auj;

/** Premier mois connu : début du contrat, sinon première commission ou premier mois pointé. */
export function premierMois(d: Donnees, auj: string) {
  const cands = [
    ...d.contrat.periodes.map((p) => p.debut),
    ...d.ventes.filter((v) => actee(v, auj)).map((v) => moisPaie(v, d.contrat)!),
    ...d.mois.map((m) => m.mois),
  ].filter(Boolean);
  return cands.length ? cands.sort()[0] : undefined;
}

export function ligne(m: string, d: Donnees, auj: string): LigneMois {
  const pointe = d.mois.find((x) => x.mois === m);
  const fc = fixeContrat(m, d.contrat);
  const fixeVal = pointe?.fixe ?? fc?.fixe;
  const ventes = d.ventes.filter((v) => actee(v, auj) && moisPaie(v, d.contrat) === m);
  const commissions = ventes.reduce((s, v) => s + (commissionDe(v, d.contrat) ?? 0), 0);
  const primes = pointe?.primes ?? 0;
  const autres = pointe?.autres ?? 0;
  const fixe = fixeVal ?? 0;
  return { mois: m, fixe, fixeConnu: fixeVal != null, commissions, ventes, primes, autres, total: fixe + commissions + primes + autres, pointe, periode: fc?.periode };
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
  /** Même période l'an dernier (janvier → mois en cours). */
  totalN1?: number;
  variableN1?: number;
  evolution?: number;
  ventes: number;
  commissions: number;
  depuisDebut: number;
  commissionsDepuisDebut: number;
  ventesDepuisDebut: number;
  commissionMoyenne?: number;
  honorairesApportes: number;
  fixeManquant: number; // mois sans fixe connu
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
  const avecRevenu = annee.filter((l) => l.total > 0);
  const totalN1 = n1.length ? somme(n1, (l) => l.total) : undefined;
  const ventesActees = d.ventes.filter((v) => actee(v, auj));
  const commTous = ventesActees.map((v) => commissionDe(v, d.contrat)).filter((x): x is number => x != null);
  const ventesAn = annee.flatMap((l) => l.ventes);
  return {
    an,
    total,
    fixe,
    variable,
    partVariable: total > 0 ? variable / total : undefined,
    moisEcoules: annee.length,
    moyenne: avecRevenu.length ? total / annee.length : undefined,
    meilleur: annee.reduce<LigneMois | undefined>((b, l) => (l.total > 0 && (!b || l.total > b.total) ? l : b), undefined),
    totalN1,
    variableN1: n1.length ? somme(n1, (l) => l.commissions + l.primes) : undefined,
    evolution: totalN1 ? total / totalN1 - 1 : undefined,
    ventes: ventesAn.length,
    commissions: somme(annee, (l) => l.commissions),
    depuisDebut: somme(toutes, (l) => l.total),
    commissionsDepuisDebut: commTous.reduce((s, x) => s + x, 0),
    ventesDepuisDebut: ventesActees.length,
    commissionMoyenne: commTous.length ? commTous.reduce((s, x) => s + x, 0) / commTous.length : undefined,
    honorairesApportes: ventesActees.reduce((s, v) => s + (v.honoraires ?? 0), 0),
    fixeManquant: toutes.filter((l) => !l.fixeConnu).length,
  };
}

/** Par année : total, fixe, commissions, ventes. */
export function parAnnee(d: Donnees, auj: string) {
  const map = new Map<number, { an: number; total: number; fixe: number; variable: number; ventes: number; mois: number }>();
  for (const l of lignes(d, auj)) {
    const an = Number(l.mois.slice(0, 4));
    const r = map.get(an) ?? { an, total: 0, fixe: 0, variable: 0, ventes: 0, mois: 0 };
    r.total += l.total;
    r.fixe += l.fixe;
    r.variable += l.commissions + l.primes;
    r.ventes += l.ventes.length;
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
  rythme?: number; // commissions à faire par mois
  ventesNecessaires?: number;
  honorairesNecessaires?: number;
}

/** Fin d'année : réalisé + fixe des mois restants + ventes en cours dont l'acte tombe avant le 31/12. */
export function projection(d: Donnees, auj: string): Projection {
  const an = Number(auj.slice(0, 4));
  const b = bilan(d, auj, an);
  const mois = moisDe(auj);
  const restants = entre(decaler(mois, 1), `${an}-12`);
  const fixeRestant = restants.reduce((s, m) => s + (fixeContrat(m, d.contrat)?.fixe ?? 0), 0);
  const aVenir = d.ventes
    .filter((v) => !actee(v, auj))
    .map((v) => ({ v, commission: commissionDe(v, d.contrat), mois: v.dateActe ? decaler(moisDe(v.dateActe), d.contrat.decalage) : undefined }))
    .sort((x, y) => (x.mois ?? "9").localeCompare(y.mois ?? "9"));
  // Acte prévu d'ici décembre (une date dépassée reste attendue : elle tombe ce mois-ci au plus tôt)
  const dansLAnnee = aVenir.filter((x) => x.mois && x.mois <= `${an}-12`);
  const commissionsAVenir = dansLAnnee.reduce((s, x) => s + (x.commission ?? 0), 0);
  const objectif = d.contrat.objectifs[String(an)];
  const reste = objectif != null ? Math.max(0, objectif - b.commissions) : undefined;
  const moisRestants = restants.length + 1; // le mois en cours compte encore
  const ht = (x: number) => (d.contrat.honorairesTTC ? x * (1 + d.contrat.tva) : x);
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
    ventesNecessaires: reste && b.commissionMoyenne ? Math.ceil(reste / b.commissionMoyenne) : undefined,
    honorairesNecessaires: reste && d.contrat.taux ? ht(reste / d.contrat.taux) : undefined,
  };
}

/** Le mois à pointer : le mois dernier s'il ne l'est pas encore, sinon le mois en cours. */
export function moisAPointer(d: Donnees, auj: string) {
  const dernier = decaler(moisDe(auj), -1);
  const debut = premierMois(d, auj);
  if (debut && debut <= dernier && !d.mois.some((m) => m.mois === dernier)) return dernier;
  return undefined;
}

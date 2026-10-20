/* ============================================================
   Location : règles de la loi du 6 juillet 1989 et chiffres
   publics utiles aux baux et aux actes de cautionnement.
   Rien de personnel ici : uniquement des données officielles.
   ============================================================ */

import { enLettres } from "@/components/documents/charte";

/* ---------- IRL (INSEE) ---------- */

export type Irl = { trimestre: 1 | 2 | 3 | 4; annee: number; valeur: number; publie: string };

/** Indices de référence des loyers publiés par l'INSEE, du plus récent au plus ancien.
    À compléter à chaque publication (mi-janvier, mi-avril, mi-juillet, mi-octobre). */
export const IRL: Irl[] = [
  { trimestre: 3, annee: 2026, valeur: 148.06, publie: "2026-10-15" },
  { trimestre: 2, annee: 2026, valeur: 148.37, publie: "2026-07-10" },
  { trimestre: 1, annee: 2026, valeur: 146.6, publie: "2026-04-15" },
  { trimestre: 4, annee: 2025, valeur: 145.78, publie: "2026-01-15" },
  { trimestre: 3, annee: 2025, valeur: 145.77, publie: "2025-10-15" },
  { trimestre: 2, annee: 2025, valeur: 146.68, publie: "2025-07-11" },
  { trimestre: 1, annee: 2025, valeur: 145.47, publie: "2025-04-15" },
  { trimestre: 4, annee: 2024, valeur: 144.64, publie: "2025-01-15" },
];
/** Dernier IRL publié à une date donnée (AAAA-MM-JJ). */
export const irlConnu = (ymd: string) => IRL.find((i) => i.publie <= ymd) ?? IRL[IRL.length - 1];
export const trimestreTexte = (t: number) => (t === 1 ? "1er" : `${t}e`);
export const valeurIrl = (v: number) => v.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/* ---------- Honoraires de location (art. 5, décret n° 2014-890) ---------- */

export type Zone = "tres_tendue" | "tendue" | "non_tendue";
export const ZONES: { v: Zone; label: string }[] = [
  { v: "tendue", label: "Zone tendue (Toulouse)" },
  { v: "tres_tendue", label: "Zone très tendue" },
  { v: "non_tendue", label: "Hors zone tendue" },
];
/** Plafonds TTC par m² habitable pour les baux signés depuis le 1er janvier 2026
    (arrêtés du 17 juillet 2025 et du 13 novembre 2025). Revalorisés chaque année : à vérifier en janvier. */
export const PLAFONDS: { annee: number; bail: Record<Zone, number>; edl: number } = {
  annee: 2026,
  bail: { tres_tendue: 12.1, tendue: 10.09, non_tendue: 8.07 },
  edl: 3.03,
};
/** Tarif de l'agence pour l'état des lieux d'entrée (sous le plafond légal). */
export const TARIF_EDL_AGENCE = 3;

const arrondi = (n: number) => Math.round(n * 100) / 100;

/** Ventilation PATRIM des honoraires d'un montant global : état des lieux au tarif de l'agence, le reste pour visite, dossier et bail. */
export function ventilerHonoraires(total: number, surface?: number) {
  const edl = surface ? Math.min(arrondi(TARIF_EDL_AGENCE * surface), total) : 0;
  return { bail: arrondi(total - edl), edl };
}
/** Montants maximum imputables au locataire. */
export const plafondsLocataire = (zone: Zone, surface?: number) =>
  surface ? { bail: arrondi(PLAFONDS.bail[zone] * surface), edl: arrondi(PLAFONDS.edl * surface) } : undefined;

/* ---------- Écriture des montants et des dates ---------- */

const chiffres = (n: number, milliers: " " | ".") =>
  n.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/[   ]/g, milliers === "." ? "." : " ");

/** 570.5 → « cinq cent soixante-dix euros et cinquante centimes (570,50 €) ». Points pour les milliers dans les cautionnements. */
export function montantBail(n: number, milliers: " " | "." = " ") {
  const e = Math.floor(n + 1e-9);
  const c = Math.round((n - e) * 100);
  const euros = `${enLettres(e)} euro${e > 1 ? "s" : ""}`;
  const cts = c === 0 ? "et zéro centime" : `et ${enLettres(c)} centime${c > 1 ? "s" : ""}`;
  return `${euros} ${cts} (${chiffres(n, milliers)} €)`;
}
/** 570.5 → « 570,50 € » */
export const eurosCts = (n: number, milliers: " " | "." = " ") => `${chiffres(n, milliers)} €`;

const MOIS = ["janvier", "février", "mars", "avril", "mai", "juin", "juillet", "août", "septembre", "octobre", "novembre", "décembre"];
/** Dates des actes de location : « 03 Août 2026 » (bail), « 03 août 2026 » (cautionnement), sans année pour une date de révision. */
export function dateActe(ymd?: string, opts: { majuscule?: boolean; annee?: boolean } = {}) {
  if (!ymd) return "";
  const [a, m, j] = ymd.split("-").map(Number);
  const mois = MOIS[m - 1];
  return [String(j).padStart(2, "0"), opts.majuscule === false ? mois : mois[0].toUpperCase() + mois.slice(1), opts.annee === false ? "" : String(a)].filter(Boolean).join(" ");
}

export function ajouterMois(ymd: string, mois: number) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + mois);
  return d.toISOString().slice(0, 10);
}

export const ANS_LETTRES: Record<number, string> = { 1: "un", 2: "deux", 3: "trois", 4: "quatre", 6: "six", 12: "douze", 24: "vingt-quatre" };
export const dureeTexte = (mois: number) =>
  mois % 12 === 0 ? `${ANS_LETTRES[mois / 12] ?? mois / 12} an${mois / 12 > 1 ? "s" : ""}` : `${enLettres(mois)} mois`;

/* ---------- Diagnostics et décence énergétique ---------- */

/** Logements interdits à la location (critère de décence énergétique, art. 6 et décret 2002-120). */
export function decenceEnergetique(dpe?: string, dateEffet?: string): { niveau: "danger" | "warn"; texte: string } | undefined {
  if (!dpe) return undefined;
  const d = dateEffet ?? new Date().toISOString().slice(0, 10);
  if (dpe === "G") return { niveau: "danger", texte: "Logement classé G : il n'est plus décent et ne peut plus être mis en location depuis le 1er janvier 2025." };
  if (dpe === "F")
    return d >= "2028-01-01"
      ? { niveau: "danger", texte: "Logement classé F : interdit à la location depuis le 1er janvier 2028." }
      : { niveau: "warn", texte: "Logement classé F : loyer gelé (aucune hausse à la relocation ni révision), et interdit à la location à partir du 1er janvier 2028." };
  if (dpe === "E" && d >= "2034-01-01") return { niveau: "danger", texte: "Logement classé E : interdit à la location depuis le 1er janvier 2034." };
  return undefined;
}
/** Classes F et G : pas de révision ni de hausse de loyer (art. 17-1 et 17 de la loi, depuis le 24 août 2022). */
export const loyerGele = (dpe?: string) => dpe === "F" || dpe === "G";

/** Périodes de construction du contrat type. */
export function periodeConstruction(annee?: number) {
  if (!annee) return "";
  if (annee < 1949) return "Avant 1949";
  if (annee <= 1974) return "De 1949 à 1974";
  if (annee <= 1989) return "De 1975 à 1989";
  if (annee <= 2005) return "De 1989 à 2005";
  return "Depuis 2005";
}

/* ============================================================
   Estimation d'un immeuble (lot par lot) et d'un stationnement.

   Immeuble : trois approches, affichées côte à côte puis
   moyennées, travaux à prévoir déduits :
   1. Par les lots : chaque logement valorisé au prix médian des
      appartements de même surface vendus autour (DVF), ajusté de
      l'état, du DPE et du rez-de-chaussée ; locaux d'activité
      par leur loyer capitalisé ; parkings et caves au forfait.
      La somme subit une décote de vente en bloc (un acheteur
      d'immeuble paie moins que la somme des lots vendus un à un).
   2. Par le rendement : loyers annuels / taux de rendement brut
      attendu par un investisseur dans le secteur.
   3. Par les immeubles vendus en bloc autour (DVF), au m².

   Stationnement : prix médian des places, box et garages vendus
   seuls autour (DVF), ajusté selon le type.
   ============================================================ */

import type { ClasseDpe, EtatBien } from "@/lib/types";
import type { ExpressResult, MarketBase } from "@/lib/expressEstimate";
import { CONDITIONS } from "@/lib/expressEstimate";
import { calculer, type Vente } from "./shared";

export type TypeLot = "logement" | "commerce" | "bureau" | "parking" | "cave" | "autre";

export const TYPES_LOT: { value: TypeLot; label: string; court: string }[] = [
  { value: "logement", label: "Logement", court: "Logement" },
  { value: "commerce", label: "Local commercial", court: "Commerce" },
  { value: "bureau", label: "Bureau", court: "Bureau" },
  { value: "parking", label: "Parking / garage", court: "Parking" },
  { value: "cave", label: "Cave / cellier", court: "Cave" },
  { value: "autre", label: "Autre", court: "Autre" },
];
export const typeLotLabel = (t: TypeLot) => TYPES_LOT.find((x) => x.value === t)?.label ?? t;

export interface LotImmeuble {
  id: string;
  /** Numéro ou nom du lot : « Lot 3 », « T2 1er gauche »… */
  nom: string;
  type: TypeLot;
  surface?: number;
  pieces?: number;
  etage?: number;
  /** Loué (bail en cours) ou vide. */
  loue?: boolean;
  /** Loyer mensuel hors charges : réel si loué, de marché si vide. */
  loyer?: number;
  dpe?: ClasseDpe;
  /** Valeur saisie à la main (remplace le calcul). */
  valeur?: number;
}

export interface ParamsImmeuble {
  /** Décote de vente en bloc, 0,15 = 15 %. */
  decote: number;
  /** Rendement brut attendu, 0,065 = 6,5 %. */
  rendement: number;
  /** Travaux à prévoir (toiture, façade, mise aux normes…), en euros. */
  travaux?: number;
  /** Taxe foncière + assurance + entretien, par an (pour le rendement net). */
  chargesAnnuelles?: number;
  ascenseur?: boolean;
}

export const PARAMS_DEFAUT: ParamsImmeuble = { decote: 0.15, rendement: 0.065 };

/** Forfaits par défaut (Toulouse), modifiables lot par lot. */
export const FORFAIT: Partial<Record<TypeLot, number>> = { parking: 15000, cave: 3000 };
/** Taux de capitalisation des loyers des locaux d'activité. */
export const TAUX_ACTIVITE: Partial<Record<TypeLot, number>> = { commerce: 0.08, bureau: 0.075 };

export const nouveauLot = (n: number, type: TypeLot = "logement"): LotImmeuble => ({
  id: Math.random().toString(36).slice(2, 9),
  nom: `Lot ${n}`,
  type,
  loue: type === "logement" ? true : undefined,
});

export const surfaceTotale = (lots: LotImmeuble[]) => lots.filter((l) => l.type === "logement" || l.type === "commerce" || l.type === "bureau").reduce((t, l) => t + (l.surface ?? 0), 0);
export const loyersAnnuels = (lots: LotImmeuble[]) => lots.reduce((t, l) => t + (l.loyer ?? 0), 0) * 12;
export const loyersEnPlace = (lots: LotImmeuble[]) => lots.filter((l) => l.loue).reduce((t, l) => t + (l.loyer ?? 0), 0) * 12;
export const logements = (lots: LotImmeuble[]) => lots.filter((l) => l.type === "logement");

export function resumeLots(lots: LotImmeuble[]) {
  const n = (t: TypeLot) => lots.filter((l) => l.type === t).length;
  const parts = [
    n("logement") ? `${n("logement")} logement${n("logement") > 1 ? "s" : ""}` : "",
    n("commerce") ? `${n("commerce")} commerce${n("commerce") > 1 ? "s" : ""}` : "",
    n("bureau") ? `${n("bureau")} bureau${n("bureau") > 1 ? "x" : ""}` : "",
    n("parking") ? `${n("parking")} parking${n("parking") > 1 ? "s" : ""}` : "",
    n("cave") ? `${n("cave")} cave${n("cave") > 1 ? "s" : ""}` : "",
    n("autre") ? `${n("autre")} autre${n("autre") > 1 ? "s" : ""}` : "",
  ];
  return parts.filter(Boolean).join(", ");
}

const arrondi = (n: number, pas = 1000) => Math.round(n / pas) * pas;

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const b = Math.floor(pos);
  const r = pos - b;
  return sorted[b + 1] !== undefined ? sorted[b] + r * (sorted[b + 1] - sorted[b]) : sorted[b];
}

/** Marché des appartements de surface voisine d'un lot (± 30 %), sinon tout le secteur. */
export function marcheDuLot(surface: number, ventes: Vente[], global: MarketBase): MarketBase & { local: boolean } {
  const ppm = ventes
    .filter((v) => !v.exclu && !v.bloc && v.prixM2 > 0 && v.surface >= surface * 0.7 && v.surface <= surface * 1.3)
    .map((v) => v.prixM2)
    .sort((a, b) => a - b);
  if (ppm.length < 3) return { ...global, local: false };
  return { medianSqm: Math.round(quantile(ppm, 0.5)), p25: Math.round(quantile(ppm, 0.25)), p75: Math.round(quantile(ppm, 0.75)), count: ppm.length, local: true };
}

export interface ValeurLot {
  lot: LotImmeuble;
  valeur: number;
  /** Comment la valeur est obtenue, en une ligne. */
  detail: string;
  calcul?: ExpressResult;
  aChiffrer?: boolean;
}

export function valeurLot(l: LotImmeuble, o: { ventes: Vente[]; marche: MarketBase | null; etat?: EtatBien; ascenseur?: boolean }): ValeurLot {
  if (l.valeur) return { lot: l, valeur: l.valeur, detail: "valeur saisie" };
  if (l.type === "logement") {
    if (!l.surface || !o.marche) return { lot: l, valeur: 0, detail: l.surface ? "pas de prix de marché" : "surface à saisir", aChiffrer: true };
    const m = marcheDuLot(l.surface, o.ventes, o.marche);
    const r = calculer({ type: "appartement", surface: l.surface, pieces: l.pieces, etage: l.etage, ascenseur: o.ascenseur, etat: o.etat, dpe: l.dpe }, m);
    return {
      lot: l,
      valeur: r.central,
      calcul: r,
      detail: `${r.sqm.toLocaleString("fr-FR")} €/m² (${m.local ? `${m.count} ventes de même surface` : "médiane du secteur"}${r.adjustments.length ? `, ${r.adjustments.map((a) => a.label.toLowerCase()).join(", ")}` : ""})`,
    };
  }
  const taux = TAUX_ACTIVITE[l.type];
  if (taux && l.loyer) return { lot: l, valeur: arrondi((l.loyer * 12) / taux), detail: `loyer capitalisé à ${(taux * 100).toLocaleString("fr-FR")} %` };
  const forfait = FORFAIT[l.type];
  if (forfait) return { lot: l, valeur: forfait, detail: "forfait du secteur" };
  return { lot: l, valeur: 0, detail: taux ? "loyer ou valeur à saisir" : "valeur à saisir", aChiffrer: true };
}

export interface ResultatImmeuble {
  lots: ValeurLot[];
  sommeLots: number;
  parLots: number;
  loyers: number;
  parRendement?: number;
  /** Médiane €/m² des immeubles vendus en bloc retenus. */
  blocM2?: number;
  nbBlocs: number;
  parBlocs?: number;
  travaux: number;
  central: number;
  bas: number;
  haut: number;
  /** Rendement brut et net sur la valeur centrale. */
  rendementBrut?: number;
  rendementNet?: number;
  confiance: "élevée" | "moyenne" | "faible";
}

export function calculerImmeuble(lots: LotImmeuble[], p: ParamsImmeuble, o: { ventes: Vente[]; marche: MarketBase | null; etat?: EtatBien }): ResultatImmeuble | null {
  const vals = lots.map((l) => valeurLot(l, { ...o, ascenseur: p.ascenseur }));
  const sommeLots = vals.reduce((t, v) => t + v.valeur, 0);
  const travaux = p.travaux ?? 0;
  const parLots = sommeLots ? arrondi(sommeLots * (1 - p.decote) - travaux) : 0;
  const loyers = loyersAnnuels(lots);
  const parRendement = loyers && p.rendement > 0 ? arrondi(loyers / p.rendement - travaux) : undefined;
  const blocs = o.ventes
    .filter((v) => v.bloc && !v.exclu && v.prixM2 > 0)
    .map((v) => v.prixM2)
    .sort((a, b) => a - b);
  const surface = surfaceTotale(lots);
  const blocM2 = blocs.length ? Math.round(quantile(blocs, 0.5)) : undefined;
  const parBlocs = blocM2 && blocs.length >= 2 && surface ? arrondi(blocM2 * surface - travaux) : undefined;

  const methodes = [parLots || undefined, parRendement, parBlocs].filter((x): x is number => !!x && x > 0);
  if (!methodes.length) return null;
  const central = arrondi(methodes.reduce((t, x) => t + x, 0) / methodes.length);
  const bas = arrondi(Math.min(...methodes, central * 0.95));
  const haut = arrondi(Math.max(...methodes, central * 1.05));
  const ecart = (haut - bas) / central;
  const confiance = methodes.length >= 2 && ecart < 0.2 && !vals.some((v) => v.aChiffrer) ? "élevée" : methodes.length >= 2 && ecart < 0.35 ? "moyenne" : "faible";
  return {
    lots: vals,
    sommeLots,
    parLots,
    loyers,
    parRendement,
    blocM2,
    nbBlocs: blocs.length,
    parBlocs,
    travaux,
    central,
    bas,
    haut,
    rendementBrut: loyers ? loyers / central : undefined,
    rendementNet: loyers ? (loyers - (p.chargesAnnuelles ?? 0)) / central : undefined,
    confiance,
  };
}

/* ---------- Stationnement ---------- */

export type TypeParking = "exterieur" | "sous_sol" | "box" | "garage";
export const TYPES_PARKING: { value: TypeParking; label: string; coef: number }[] = [
  { value: "exterieur", label: "Place extérieure", coef: -0.2 },
  { value: "sous_sol", label: "Place en sous-sol", coef: 0 },
  { value: "box", label: "Box fermé", coef: 0.2 },
  { value: "garage", label: "Garage", coef: 0.3 },
];

export function calculerParking(type: TypeParking | undefined, marche: MarketBase, etat?: EtatBien): ExpressResult {
  const adjustments = [];
  const t = TYPES_PARKING.find((x) => x.value === type);
  if (t?.coef) adjustments.push({ label: t.label, pct: t.coef });
  const cond = CONDITIONS.find((c) => c.id === etat);
  if (cond?.adj && (etat === "a_renover" || etat === "a_rafraichir")) adjustments.push({ label: cond.label, pct: cond.adj / 2 });
  const totalPct = adjustments.reduce((s, a) => s + a.pct, 0);
  const central = arrondi(marche.medianSqm * (1 + totalPct), 500);
  const spread = marche.medianSqm ? (marche.p75 - marche.p25) / marche.medianSqm : 0.4;
  const half = spread < 0.3 ? 0.08 : 0.12;
  return {
    baseSqm: marche.medianSqm,
    adjustments,
    totalPct,
    sqm: central,
    central,
    low: arrondi(central * (1 - half), 500),
    high: arrondi(central * (1 + half), 500),
    confidence: marche.count >= 10 && spread < 0.4 ? "élevée" : marche.count >= 4 ? "moyenne" : "faible",
  };
}

export const pctTexte = (x: number) => `${(Math.round(x * 1000) / 10).toLocaleString("fr-FR")} %`;

/* ---------- Commentaire argumenté (IA) ---------- */

const eurTxt = (n: number) => `${Math.round(n).toLocaleString("fr-FR")} €`;

export function promptImmeuble(o: {
  adresse: string;
  quartier?: string;
  lots: LotImmeuble[];
  p: ParamsImmeuble;
  r: ResultatImmeuble;
  etat?: EtatBien;
  marche: MarketBase | null;
  rayon?: number;
  prixConseille?: number;
}) {
  const { r, p } = o;
  const lignes = [
    `Immeuble entier : ${o.adresse}${o.quartier ? ` (quartier ${o.quartier})` : ""}. ${resumeLots(o.lots)}, ${Math.round(surfaceTotale(o.lots))} m² au total. État général : ${CONDITIONS.find((c) => c.id === o.etat)?.label ?? "bon"}.${p.ascenseur ? " Avec ascenseur." : ""}`,
    `Lots : ${r.lots.map((v) => `${v.lot.nom} (${typeLotLabel(v.lot.type).toLowerCase()}${v.lot.surface ? ` ${v.lot.surface} m²` : ""}${v.lot.dpe ? `, DPE ${v.lot.dpe}` : ""}${v.lot.loue ? `, loué ${v.lot.loyer ? eurTxt(v.lot.loyer) + "/mois" : ""}` : ", libre"}) ${v.valeur ? eurTxt(v.valeur) : "à chiffrer"}`).join(" ; ")}.`,
    o.marche ? `Marché des appartements vendus seuls : médiane ${o.marche.medianSqm} €/m² sur ${o.marche.count} ventes DVF${o.rayon ? ` à moins de ${o.rayon} m` : ""}.` : "",
    r.parLots ? `Approche par les lots : somme ${eurTxt(r.sommeLots)}, décote de vente en bloc ${Math.round(p.decote * 100)} %, soit ${eurTxt(r.parLots)}.` : "",
    r.parRendement ? `Approche par le rendement : loyers annuels ${eurTxt(r.loyers)} capitalisés à ${pctTexte(p.rendement)} brut, soit ${eurTxt(r.parRendement)}.` : "",
    r.parBlocs ? `Immeubles vendus en bloc dans le secteur : ${r.nbBlocs} ventes, médiane ${r.blocM2} €/m², soit ${eurTxt(r.parBlocs)}.` : "",
    r.travaux ? `Travaux à prévoir déduits : ${eurTxt(r.travaux)}.` : "",
    `Fourchette : ${eurTxt(r.bas)} / ${eurTxt(r.central)} / ${eurTxt(r.haut)}.${r.rendementBrut ? ` Rendement brut sur la valeur centrale : ${pctTexte(r.rendementBrut)}.` : ""}`,
    o.prixConseille ? `Prix de présentation conseillé : ${eurTxt(o.prixConseille)}.` : "",
  ].filter(Boolean);
  return `Rédige le commentaire argumenté d'un avis de valeur pour un immeuble de rapport, destiné au propriétaire (vouvoiement).
${lignes.join("\n")}

Consignes : 3 courts paragraphes, 150 à 220 mots au total, sans titre ni liste ni markdown.
1) Les approches retenues (lots, rendement, ventes d'immeubles) et ce qu'elles donnent. 2) Ce qui pèse sur la valeur : état locatif, DPE des logements (un logement classé G ne peut plus être loué depuis 2025, F à partir de 2028), travaux, vente en bloc. 3) Le prix conseillé et la cible d'acquéreurs (investisseurs, marchands de biens).
Ton prudent et factuel : pas de promesse de délai ni de prix de vente, aucun superlatif. N'invente aucune caractéristique.`;
}

export function promptParking(o: { adresse: string; typeParking?: TypeParking; r: ExpressResult; marche: MarketBase; rayon?: number; prixConseille?: number }) {
  const t = TYPES_PARKING.find((x) => x.value === o.typeParking)?.label ?? "Stationnement";
  return `Rédige le commentaire argumenté d'un avis de valeur pour un stationnement, destiné au propriétaire (vouvoiement).
Bien : ${t}, ${o.adresse}.
Marché : ${o.marche.count} places, box ou garages vendus seuls (DVF)${o.rayon ? ` à moins de ${o.rayon} m` : ""}, prix médian ${eurTxt(o.marche.medianSqm)}, la moitié entre ${eurTxt(o.marche.p25)} et ${eurTxt(o.marche.p75)}.
Ajustements : ${o.r.adjustments.length ? o.r.adjustments.map((a) => `${a.label} ${a.pct > 0 ? "+" : ""}${Math.round(a.pct * 100)} %`).join(", ") : "aucun"}.
Fourchette : ${eurTxt(o.r.low)} / ${eurTxt(o.r.central)} / ${eurTxt(o.r.high)}.${o.prixConseille ? ` Prix conseillé : ${eurTxt(o.prixConseille)}.` : ""}

Consignes : 2 courts paragraphes, 90 à 140 mots, sans titre ni liste ni markdown. Ton prudent et factuel, aucun superlatif, n'invente rien.`;
}

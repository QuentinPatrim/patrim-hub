"use client";

/* ============================================================
   Bon de visite : le visiteur reconnaît avoir découvert le bien
   par l'agence et s'engage à ne pas l'acheter sans elle. Signé
   au doigt sur le téléphone du conseiller pendant la visite (ou
   en PDF, sur ICSIGN ou sur papier), puis gardé dans les
   documents du bien. Une fois signé, le bon est figé : il ne
   suit plus les changements de la fiche du bien ou du contact.
   Rien sur le vendeur : le bon est remis au visiteur.
   ============================================================ */

import { getAll, update } from "@/lib/store";
import { TYPE_BIEN } from "@/lib/format";
import type { Bien, BienType, Contact, Rdv } from "@/lib/types";
import { adresseComplete } from "@/components/biens/utils";
import { AGENCE } from "@/components/documents/charte";
import { enregistrerActe, type Acte, type BienActes } from "@/components/documents/archive";
import { nomOffre, type Partie } from "@/components/offre/offre";
import { titrePublic } from "@/lib/titrePublic";

/** Tracé d'une signature : chemin SVG dans un cadre largeur × hauteur. */
export interface Trace {
  d: string;
  w: number;
  h: number;
}

export type Visiteur = Pick<Partie, "contactId" | "civilite" | "prenom" | "nom" | "tel" | "email" | "adresse"> & { signature?: Trace };

/** Ce que le bon dit du bien : uniquement ce que le visiteur peut savoir (jamais le vendeur). */
export interface BienVisite {
  type: BienType;
  pieces?: number;
  surface?: number;
  adresse: string;
  ville?: string;
  prix?: number;
  honoraires?: number;
  charge?: "acquereur" | "vendeur";
  mandat?: string;
}

export interface BonVisite {
  rdvId: string;
  bienId: string;
  /** Copie gardée sur la fiche du bien (voir components/documents/archive.ts). */
  acteId?: string;
  /** Début de la visite (ISO). */
  visite: string;
  visiteurs: Visiteur[];
  bien: BienVisite;
  conseiller: string;
  /** Signé sur le téléphone du conseiller (ISO). */
  signeLe?: string;
  maj: string;
}

export function bienVisite(b: Bien): BienVisite {
  return {
    type: b.type,
    pieces: b.pieces,
    surface: b.surface,
    adresse: adresseComplete(b),
    ville: b.ville,
    prix: b.prix,
    honoraires: b.honoraires ?? (b.prix && b.netVendeur ? b.prix - b.netVendeur : undefined),
    charge: b.honorairesCharge,
    mandat: b.mandat?.numero,
  };
}

export const visiteurDepuisContact = (c: Contact): Visiteur => ({
  contactId: c.id,
  civilite: c.civilite,
  prenom: c.prenom,
  nom: c.nom,
  tel: c.tel,
  email: c.email,
  adresse: c.adresse,
});

/** Bon de la visite, à partir de l'agenda, de la fiche du bien et des fiches contact. */
export function bonDepuis(r: Rdv, b: Bien, contacts: Contact[]): BonVisite {
  return {
    rdvId: r.id,
    bienId: b.id,
    visite: r.debut,
    visiteurs: (r.contactIds ?? []).map((id) => contacts.find((c) => c.id === id)).filter((c): c is Contact => !!c).map(visiteurDepuisContact),
    bien: bienVisite(b),
    conseiller: AGENCE.conseiller,
    maj: new Date().toISOString(),
  };
}

/** Le bon gardé sur la fiche du bien pour cette visite (signé ou en attente de signature). */
export function bonDuRdv(b: Bien | undefined, rdvId: string) {
  return ((b as BienActes | undefined)?.actes ?? []).find((a): a is Extract<Acte, { kind: "bon" }> => a.kind === "bon" && a.data.rdvId === rdvId);
}

/* ---------- Textes ---------- */

const TZ = "Europe/Paris";
/** « jeudi 16 octobre 2026 à 14h30 » */
export function quand(iso: string) {
  const d = new Date(iso);
  const jour = d.toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ }).replace(/ 1 /, " 1er ");
  return `${jour} à ${d.toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).replace(":", "h")}`;
}

/** « Appartement de 3 pièces, 72 m² » */
export function descriptionBien(b: BienVisite) {
  const habitation = b.type === "appartement" || b.type === "maison";
  const pieces = habitation && b.pieces ? (b.pieces === 1 ? " d'une pièce" : ` de ${b.pieces} pièces`) : "";
  return `${TYPE_BIEN[b.type] ?? "Bien"}${pieces}${b.surface ? `, ${b.surface.toLocaleString("fr-FR")} m²` : ""}`;
}

const euros = (n: number) => `${n.toLocaleString("fr-FR")} €`;

/** « 299 000 € honoraires inclus (14 000 € TTC à la charge de l'acquéreur) », rien si le prix n'est pas connu. */
export function prixTexte(b: BienVisite) {
  if (!b.prix) return undefined;
  if (b.charge === "vendeur") return `${euros(b.prix)} (honoraires à la charge du vendeur)`;
  if (b.charge === "acquereur") return `${euros(b.prix)} honoraires inclus${b.honoraires ? ` (${euros(b.honoraires)} TTC à la charge de l'acquéreur)` : ", à la charge de l'acquéreur"}`;
  return euros(b.prix);
}

export const nomVisiteur = (v: Visiteur) => nomOffre(v) || "Visiteur";

/** Accords : « Je soussigné », « Je soussignée », « Nous soussignés »… */
function accords(vs: Visiteur[]) {
  const femmes = vs.length > 0 && vs.every((v) => v.civilite === "Mme");
  const connu = vs.length > 0 && vs.every((v) => v.civilite === "M." || v.civilite === "Mme");
  const e = femmes ? "e" : connu ? "" : "(e)";
  return vs.length > 1
    ? { sujet: `Nous soussigné${e}s`, reconnais: "reconnaissons", me: "nous", nousA: "nous a", si: "nous souhaitons", engage: "nous nous engageons", Engage: "Nous nous engageons" }
    : { sujet: `Je soussigné${e}`, reconnais: "reconnais", me: "me", nousA: "m'a", si: "je souhaite", engage: "je m'engage", Engage: "Je m'engage" };
}

/** L'engagement du visiteur, mot pour mot (écran de signature et PDF). */
export function engagement(bon: Pick<BonVisite, "visite" | "visiteurs" | "conseiller">) {
  const a = accords(bon.visiteurs);
  const jour = new Date(bon.visite).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric", timeZone: TZ }).replace(/ 1 /, " 1er ");
  return [
    `${a.sujet} ${a.reconnais} avoir visité le ${jour} le bien désigné ci-dessus, qui ${a.nousA} été présenté par l'agence PATRIM, représentée par ${bon.conseiller}, et dont l'adresse ${a.nousA} été communiquée par l'agence.`,
    `Si ${a.si} acquérir ce bien, directement ou par personne interposée, ${a.engage} à le faire par l'intermédiaire de l'agence PATRIM, sans traiter directement avec le propriétaire ni passer par un autre professionnel, pendant vingt-quatre mois à compter de cette visite. ${a.Engage} également à ne pas transmettre à des tiers l'adresse et les informations reçues sur ce bien.`,
    `À défaut, l'agence PATRIM pourra ${a.me} demander réparation du préjudice subi, notamment la perte de sa rémunération.`,
  ];
}

export const MENTION_DONNEES =
  "Les informations de ce bon sont utilisées par l'agence PATRIM pour le suivi de votre recherche immobilière. Vous pouvez y accéder, les faire rectifier ou effacer en vous adressant à l'agence.";

/* ---------- Signature ---------- */

/** Garde le bon signé sur la fiche du bien et le note dans l'historique des visiteurs. Renvoie l'identifiant du document. */
export function signerBon(bon: BonVisite, signatures: Trace[]): string {
  const signeLe = new Date().toISOString();
  const acteId = enregistrerActe(bon.bienId, "bon", { ...bon, visiteurs: bon.visiteurs.map((v, i) => ({ ...v, signature: signatures[i] })), signeLe, maj: signeLe }, "signe");
  const b = getAll("biens").find((x) => x.id === bon.bienId);
  const texte = `Bon de visite signé : ${b ? titrePublic(b) : descriptionBien(bon.bien)}`;
  for (const v of bon.visiteurs) {
    const c = v.contactId ? getAll("contacts").find((x) => x.id === v.contactId) : undefined;
    if (c) update("contacts", c.id, { historique: [...(c.historique ?? []), { date: signeLe, type: "visite", texte }] });
  }
  return acteId;
}

/** Retire les signatures (mauvais signataire, bon à refaire) : le bon redevient un brouillon. */
export function annulerSignature(bon: BonVisite) {
  enregistrerActe(bon.bienId, "bon", { ...bon, visiteurs: bon.visiteurs.map(({ signature: _, ...v }) => v), signeLe: undefined, maj: new Date().toISOString() }, "brouillon");
}

/* ---------- Tracé ---------- */

/** Chemin SVG lissé à partir des traits saisis (un trait = une liste de points). */
export function versChemin(traits: [number, number][][]) {
  return traits
    .map((s) => {
      if (s.length === 1) return `M${s[0][0]} ${s[0][1]}l0.1 0`;
      let d = `M${s[0][0]} ${s[0][1]}`;
      for (let i = 1; i < s.length - 1; i++) d += `Q${s[i][0]} ${s[i][1]} ${Math.round((s[i][0] + s[i + 1][0]) / 2)} ${Math.round((s[i][1] + s[i + 1][1]) / 2)}`;
      const l = s[s.length - 1];
      return `${d}L${l[0]} ${l[1]}`;
    })
    .join("");
}

/** Longueur totale des traits : en dessous d'un seuil, c'est un effleurement, pas une signature. */
export const longueur = (traits: [number, number][][]) =>
  traits.reduce((n, s) => n + s.slice(1).reduce((m, p, i) => m + Math.hypot(p[0] - s[i][0], p[1] - s[i][1]), 0), 0);

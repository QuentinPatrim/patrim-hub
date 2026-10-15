/* ============================================================
   Baisse de prix : la baisse à annoncer, gardée sur le bien, et
   les acquéreurs à prévenir (ceux qui ont visité le bien, ceux à
   qui il a été proposé, ceux dont le budget colle au nouveau prix).
   Fonctions pures : aussi utilisées par le briefing du matin.
   ============================================================ */

import type { Bien, Contact, Rdv } from "@/lib/types";
import { ACQUEREUR_ACTIF, BIEN_DISPONIBLE, matchScore } from "@/lib/matching";

export interface BaissePrix {
  /** Prix affiché avant la baisse, honoraires inclus (s'il est connu). */
  de?: number;
  /** Nouveau prix affiché, honoraires inclus. */
  a: number;
  date: string; // AAAA-MM-JJ
  /** Acquéreurs prévenus de cette baisse : contact → date du message. */
  prevenus?: Record<string, string>;
}
export type BienBaisse = Bien & { baisse?: BaissePrix };

/** La baisse à annoncer, tant que le prix affiché n'a pas bougé depuis. */
export const baisseEnCours = (b: BienBaisse) => (b.baisse && b.prix != null && b.baisse.a === b.prix ? b.baisse : undefined);

/**
 * Quand le prix affiché change dans l'appli (fiche modifiée, avenant signé) : garde la baisse
 * à annoncer, ou l'efface si le prix remonte. Tant que personne n'a été prévenu, la baisse part
 * du prix que les acquéreurs connaissaient (une faute de frappe corrigée ne change rien).
 */
export function suiviBaisse(b: BienBaisse, nouveau: number | undefined, jour: string): Partial<BienBaisse> {
  if (nouveau == null || b.prix == null || nouveau === b.prix) return {};
  const enCours = baisseEnCours(b);
  const depart = enCours?.de != null && !Object.keys(enCours.prevenus ?? {}).length ? enCours.de : b.prix;
  return nouveau < depart ? { baisse: { de: depart, a: nouveau, date: jour } } : { baisse: undefined };
}

export type Groupe = "visite" | "propose" | "budget";
export interface Cible {
  c: Contact;
  groupe: Groupe;
  /** Date de la visite (la plus récente), passée ou prévue. */
  visite?: string;
  aVenir?: boolean;
  score?: number;
  /** Hors budget à l'ancien prix, dans le budget au nouveau. */
  grace?: boolean;
}

const compatible = (c: Contact, b: Bien) => {
  const m = matchScore(c, b);
  return m.score >= 60 && !m.bloquants.length ? m : undefined;
};

/** Qui prévenir d'une baisse : visites du bien, bien déjà proposé, puis budgets compatibles au nouveau prix. */
export function cibles(b: Bien, contacts: Contact[], rdvs: Rdv[], de?: number, now = Date.now()): Cible[] {
  const vendeurs = new Set(b.vendeurIds ?? []);
  const parId = new Map(contacts.map((c) => [c.id, c]));
  const vus = new Map<string, Cible>();

  // Ceux qui ont visité (ou vont visiter) le bien, même sortis du suivi : une baisse peut les faire revenir.
  rdvs
    .filter((r) => r.bienId === b.id && r.type === "visite" && r.statut !== "annule")
    .sort((x, y) => y.debut.localeCompare(x.debut))
    .forEach((r) =>
      (r.contactIds ?? []).forEach((id) => {
        const c = parId.get(id);
        if (!c || vus.has(id) || vendeurs.has(id) || !c.roles?.includes("acquereur") || c.etape === "gagne") return;
        vus.set(id, { c, groupe: "visite", visite: r.debut, aVenir: new Date(r.debut).getTime() > now });
      }),
    );

  for (const c of contacts)
    if (!vus.has(c.id) && !vendeurs.has(c.id) && ACQUEREUR_ACTIF(c) && c.biensProposes?.includes(b.id)) vus.set(c.id, { c, groupe: "propose" });

  const avant = de != null && b.prix != null && de > b.prix ? { ...b, prix: de } : undefined;
  const budget: Cible[] = [];
  for (const c of contacts) {
    if (vus.has(c.id) || vendeurs.has(c.id) || !ACQUEREUR_ACTIF(c)) continue;
    const m = compatible(c, b);
    if (m) budget.push({ c, groupe: "budget", score: m.score, grace: !!avant && !compatible(c, avant) });
  }
  budget.sort((x, y) => Number(!!y.grace) - Number(!!x.grace) || (y.score ?? 0) - (x.score ?? 0));

  return [...vus.values(), ...budget];
}

/** Baisse de moins de 30 jours : rappelée en haut de la fiche et dans le briefing du matin. */
export const baisseRecente = (b: BienBaisse, now = Date.now()) => {
  const baisse = baisseEnCours(b);
  return baisse && now - new Date(baisse.date + "T12:00:00").getTime() <= 30 * 86400000 ? baisse : undefined;
};

/** Acquéreurs pas encore prévenus de la baisse en cours (aucun s'il n'y a rien à annoncer). */
export function aPrevenir(b: BienBaisse, contacts: Contact[], rdvs: Rdv[], now = Date.now()) {
  const baisse = baisseEnCours(b);
  if (!baisse || !BIEN_DISPONIBLE(b)) return [];
  return cibles(b, contacts, rdvs, baisse.de, now).filter((x) => !baisse.prevenus?.[x.c.id]);
}

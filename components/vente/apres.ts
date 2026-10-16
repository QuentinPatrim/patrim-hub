/* ============================================================
   Après l'acte : remercier l'acquéreur et le vendeur (avec le
   lien pour laisser un avis), puis leur donner des nouvelles à
   chaque date anniversaire de la vente. Ce qui est dû, jamais
   envoyé d'ici. Fonctions pures : aussi utilisées par le
   briefing du matin.
   ============================================================ */

import type { Bien } from "@/lib/types";
import { acquereursDe, ajouterJours, ajouterMois, joursEntre, venteDe } from "./vente";

export type RoleClient = "acquereur" | "vendeur";
export interface ClientVente {
  id: string;
  role: RoleClient;
}

/** Le remerciement est rappelé pendant le mois qui suit l'acte. */
export const MERCI_JOURS = 30;
/** Les nouvelles se donnent d'une semaine avant à un mois après la date anniversaire. */
const AVANT = 7;
const APRES = 30;

/** Acquéreurs puis vendeurs de la vente, sans doublon. */
export function clientsVente(b: Bien): ClientVente[] {
  const acquereurs = acquereursDe(b).map((id) => ({ id, role: "acquereur" as const }));
  const vendeurs = (b.vendeurIds ?? []).filter((id) => !acquereurs.some((a) => a.id === id)).map((id) => ({ id, role: "vendeur" as const }));
  return [...acquereurs, ...vendeurs];
}

const EN_LETTRES = ["", "un", "deux", "trois", "quatre", "cinq", "six", "sept", "huit", "neuf", "dix"];
/** « un an », « deux ans »… */
export const nAns = (n: number) => `${EN_LETTRES[n] ?? n} an${n > 1 ? "s" : ""}`;

export interface Anniversaire {
  /** Années depuis l'acte. */
  n: number;
  date: string;
  /** Dans la fenêtre où l'on donne des nouvelles. */
  ouvert: boolean;
}

/** Date anniversaire en cours, sinon la prochaine (le 29 février devient le 28). */
export function anniversaireDe(acte: string, auj: string): Anniversaire {
  let n = 1;
  while (ajouterJours(ajouterMois(acte, 12 * n), APRES) < auj) n++;
  const date = ajouterMois(acte, 12 * n);
  return { n, date, ouvert: ajouterJours(date, -AVANT) <= auj };
}

/** Nouvelles déjà données pour cette date anniversaire. */
export const nouvellesFaites = (b: Bien, id: string, a: Anniversaire) => (venteDe(b).nouvelles?.[id]?.slice(0, 10) ?? "") >= ajouterJours(a.date, -AVANT);

export interface ApresAFaire {
  /** À remercier : dans le mois qui suit l'acte. */
  merci: ClientVente[];
  /** À qui donner des nouvelles : autour de la date anniversaire. */
  nouvelles: ClientVente[];
  anniversaire?: Anniversaire;
}

/** Ce qu'il reste à faire après la vente (rien tant que l'acte n'est pas signé). */
export function apresAFaire(b: Bien, auj: string): ApresAFaire {
  const v = venteDe(b);
  if (!v.acteSigne || v.acteSigne > auj) return { merci: [], nouvelles: [] };
  const clients = clientsVente(b);
  const anniversaire = anniversaireDe(v.acteSigne, auj);
  return {
    merci: joursEntre(v.acteSigne, auj) <= MERCI_JOURS ? clients.filter((c) => !v.merci?.[c.id]) : [],
    nouvelles: anniversaire.ouvert ? clients.filter((c) => !nouvellesFaites(b, c.id, anniversaire)) : [],
    anniversaire,
  };
}

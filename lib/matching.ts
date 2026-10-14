import type { Bien, Contact } from "./types";

/* Rapprochement acquéreur ↔ bien : score de 0 à 100 et raisons lisibles. */

export interface Match { score: number; raisons: string[]; bloquants: string[] }

const norm = (s?: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim();

export function matchScore(c: Contact, b: Bien): Match {
  const k = c.criteres ?? {};
  const raisons: string[] = [];
  const bloquants: string[] = [];
  let score = 50;

  if (k.types?.length) {
    if (k.types.includes(b.type)) { score += 10; raisons.push("Type recherché"); }
    else bloquants.push("Type différent");
  }
  if (b.prix && k.budgetMax) {
    const r = b.prix / k.budgetMax;
    if (r <= 1) { score += 20; raisons.push("Dans le budget"); }
    else if (r <= 1.08) { score += 5; raisons.push("Budget légèrement dépassé (négociable)"); }
    else bloquants.push(`Au-dessus du budget (+${Math.round((r - 1) * 100)} %)`);
    if (k.budgetMin && b.prix < k.budgetMin * 0.8) score -= 10;
  }
  if (k.surfaceMin && b.surface) {
    if (b.surface >= k.surfaceMin) { score += 10; raisons.push("Surface suffisante"); }
    else if (b.surface >= k.surfaceMin * 0.9) score += 2;
    else bloquants.push("Trop petit");
  }
  if (k.piecesMin && b.pieces) {
    if (b.pieces >= k.piecesMin) { score += 8; raisons.push(`${b.pieces} pièces`); }
    else bloquants.push("Pas assez de pièces");
  }
  if (k.quartiers?.length) {
    const q = norm(b.quartier) + " " + norm(b.ville) + " " + norm(b.codePostal);
    if (k.quartiers.some((x) => q.includes(norm(x)))) { score += 12; raisons.push("Secteur recherché"); }
    else score -= 8;
  }
  if (k.exterieur && b.exterieur) { score += 5; raisons.push("Extérieur"); }
  if (k.parking && b.parking) { score += 5; raisons.push("Stationnement"); }
  if (k.ascenseur && b.etage && b.etage > 1 && !b.ascenseur) bloquants.push("Pas d'ascenseur");
  if (c.financement?.accordBanque) score += 3;

  score -= bloquants.length * 25;
  return { score: Math.max(0, Math.min(100, score)), raisons, bloquants };
}

export const BIEN_DISPONIBLE = (b: Bien) => b.statut === "en_vente" || b.statut === "mandat_signe";
export const ACQUEREUR_ACTIF = (c: Contact) => c.roles?.includes("acquereur") && c.etape !== "perdu" && c.etape !== "gagne";

/** Meilleurs acquéreurs pour un bien (ou meilleurs biens pour un acquéreur). */
export function topMatches<T>(items: T[], scoreOf: (t: T) => Match, min = 60) {
  return items
    .map((t) => ({ item: t, ...scoreOf(t) }))
    .filter((m) => m.score >= min && !m.bloquants.length)
    .sort((a, b) => b.score - a.score);
}

import type { Bien, Contact } from "./types";
import { TOULOUSE_QUARTIERS } from "./toulouseQuartiers";

/* ============================================================
   Rapprochement acquéreur ↔ bien : score de 0 à 100.
   - raisons : points communs (affichés en vert)
   - ecarts : petites différences acceptables (affichées en orange)
   - bloquants : critère clairement hors cible (le bien n'est pas proposé)
   Critères : type, budget, surface, pièces, quartier / ville
   (avec les quartiers voisins de Toulouse), extérieur, parking,
   ascenseur, financement.
   ============================================================ */

export interface Match { score: number; raisons: string[]; bloquants: string[]; ecarts?: string[] }

const norm = (s?: string) => (s ?? "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[-']/g, " ").replace(/\s+/g, " ").trim();

const distKm = (a: { lat: number; lon: number }, b: { lat: number; lon: number }) => {
  const R = 6371, dLat = ((b.lat - a.lat) * Math.PI) / 180, dLon = ((b.lon - a.lon) * Math.PI) / 180;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
};
const quartierToulouse = (nom?: string) => {
  const n = norm(nom);
  return n ? TOULOUSE_QUARTIERS.find((q) => norm(q.name) === n || n.includes(norm(q.name))) : undefined;
};

/** Le bien est-il dans un secteur recherché ? "oui", "voisin" (quartier toulousain à moins de 1,6 km) ou "non". */
function secteurOk(souhaits: string[], b: Bien): "oui" | "voisin" | "non" {
  const lieu = ` ${norm(b.quartier)} ${norm(b.ville)} ${norm(b.codePostal)} `;
  if (souhaits.some((x) => norm(x) && lieu.includes(norm(x)))) return "oui";
  const enToulouse = !b.ville || norm(b.ville) === "toulouse";
  const qb = enToulouse ? quartierToulouse(b.quartier) : undefined;
  const pos = b.lat && b.lon ? { lat: b.lat, lon: b.lon } : qb;
  if (!pos) return "non";
  return souhaits.some((x) => {
    const q = quartierToulouse(x);
    return q && distKm(pos, q) <= 1.6;
  })
    ? "voisin"
    : "non";
}

export function matchScore(c: Contact, b: Bien): Match {
  const k = c.criteres ?? {};
  const raisons: string[] = [];
  const ecarts: string[] = [];
  const bloquants: string[] = [];
  let score = 50;

  if (k.types?.length) {
    if (k.types.includes(b.type)) { score += 10; raisons.push("Type recherché"); }
    else bloquants.push("Type différent");
  }
  if (b.prix && k.budgetMax) {
    const r = b.prix / k.budgetMax;
    if (r <= 1) { score += 20; raisons.push("Dans le budget"); }
    else if (r <= 1.08) { score += 5; ecarts.push(`Budget dépassé de ${Math.round((r - 1) * 100)} % (négociable)`); }
    else bloquants.push(`Au-dessus du budget (+${Math.round((r - 1) * 100)} %)`);
    if (k.budgetMin && b.prix < k.budgetMin * 0.8) { score -= 10; ecarts.push("Sous son budget habituel"); }
  }
  if (k.surfaceMin && b.surface) {
    if (b.surface >= k.surfaceMin) { score += 10; raisons.push("Surface suffisante"); }
    else if (b.surface >= k.surfaceMin * 0.9) { score += 2; ecarts.push(`Surface un peu juste (${Math.round(k.surfaceMin - b.surface)} m² de moins)`); }
    else bloquants.push("Trop petit");
  }
  if (k.piecesMin && b.pieces) {
    if (b.pieces >= k.piecesMin) { score += 8; raisons.push(`${b.pieces} pièces`); }
    else if (b.pieces === k.piecesMin - 1 && b.surface && k.surfaceMin && b.surface >= k.surfaceMin) { ecarts.push("Une pièce de moins (surface suffisante)"); }
    else bloquants.push("Pas assez de pièces");
  }
  if (k.quartiers?.length) {
    const s = secteurOk(k.quartiers, b);
    if (s === "oui") { score += 12; raisons.push("Secteur recherché"); }
    else if (s === "voisin") { score += 5; ecarts.push("Quartier voisin de sa recherche"); }
    else { score -= 8; ecarts.push("Hors secteur recherché"); }
  }
  if (k.exterieur) {
    if (b.exterieur) { score += 5; raisons.push("Extérieur"); }
    else ecarts.push("Pas d'extérieur");
  }
  if (k.parking) {
    if (b.parking) { score += 5; raisons.push("Stationnement"); }
    else ecarts.push("Pas de stationnement");
  }
  if (k.ascenseur && b.etage && b.etage > 1 && !b.ascenseur) bloquants.push("Pas d'ascenseur");
  if (c.financement?.accordBanque) score += 3;

  score -= bloquants.length * 25;
  return { score: Math.max(0, Math.min(100, score)), raisons, bloquants, ecarts };
}

export const BIEN_DISPONIBLE = (b: Bien) => b.statut === "en_vente" || b.statut === "mandat_signe";
export const ACQUEREUR_ACTIF = (c: Contact) => c.roles?.includes("acquereur") && c.etape !== "perdu" && c.etape !== "gagne";

/** Libellé court d'un score. */
export const niveauMatch = (score: number) => (score >= 85 ? "Excellent" : score >= 70 ? "Très bon" : score >= 60 ? "Bon" : "À étudier");

/** Meilleurs acquéreurs pour un bien (ou meilleurs biens pour un acquéreur). */
export function topMatches<T>(items: T[], scoreOf: (t: T) => Match, min = 60) {
  return items
    .map((t) => ({ item: t, ...scoreOf(t) }))
    .filter((m) => m.score >= min && !m.bloquants.length)
    .sort((a, b) => b.score - a.score);
}

/* Outils partagés du module Estimations (libellés, calculs, appels serveur). */

import type { Comparable, Estimation, EtatBien, ClasseDpe, Contact } from "@/lib/types";
import type { DvfSale, DvfStats } from "@/lib/dvf";
import type { Tone } from "@/lib/format";
import { CONDITIONS, expressEstimate, type ExpressResult, type MarketBase } from "@/lib/expressEstimate";
import { authHeaders } from "@/lib/ai";
import { quartiersAround } from "@/lib/toulouseQuartiers";

/* ---------- Types étendus (champs propres au module) ---------- */

/** Vente comparable, avec les informations utiles à l'écran. */
export type Vente = Comparable & {
  id: string;
  ville?: string;
  lat?: number;
  lon?: number;
  exclu?: boolean;
  dependances?: number;
  terrain?: number;
};

export type Confiance = ExpressResult["confidence"];

export type EstimationPlus = Estimation & {
  rayon?: number;
  quartier?: string;
  confiance?: Confiance;
  marche?: MarketBase;
  periode?: string;         // ex. "2021 – 2026"
  prixM2Manuel?: number;    // référence saisie à la main si aucune vente
  surfaceTerrain?: number;
};

export const asPlus = (e: Estimation) => e as EstimationPlus;
export const ventesDe = (e?: Estimation): Vente[] =>
  ((e?.comparables ?? []) as Vente[]).map((v, i) => ({ ...v, id: v.id ?? `v${i}` }));

/* ---------- Libellés ---------- */

export type StatutEstim = Estimation["statut"];
export const STATUT_ESTIM: Record<StatutEstim, { label: string; tone: Tone }> = {
  a_faire: { label: "À présenter", tone: "warn" },
  envoyee: { label: "Avis remis", tone: "info" },
  mandat: { label: "Mandat", tone: "ok" },
  perdue: { label: "Perdue", tone: "neutral" },
};
export const STATUTS: StatutEstim[] = ["a_faire", "envoyee", "mandat", "perdue"];

export const ETAT_LABEL: Record<EtatBien, string> = Object.fromEntries(CONDITIONS.map((c) => [c.id, c.label])) as Record<EtatBien, string>;
export const DPE_CLASSES: ClasseDpe[] = ["A", "B", "C", "D", "E", "F", "G"];
export const EXTERIEURS = ["Balcon", "Terrasse", "Loggia", "Jardin"] as const;

export const CONFIANCE_TONE: Record<Confiance, Tone> = { élevée: "ok", moyenne: "warn", faible: "danger" };

export const typeLabel = (t: Estimation["type"]) => (t === "maison" ? "Maison" : "Appartement");

export function resumeBien(e: Pick<Estimation, "type" | "surface" | "pieces">) {
  return [typeLabel(e.type), e.pieces ? `${e.pieces} pièce${e.pieces > 1 ? "s" : ""}` : null, e.surface ? `${e.surface.toLocaleString("fr-FR")} m²` : null]
    .filter(Boolean)
    .join(" · ");
}

export function etageLabel(etage?: number, ascenseur?: boolean) {
  if (etage == null) return undefined;
  const e = etage === 0 ? "Rez-de-chaussée" : `${etage}${etage === 1 ? "er" : "e"} étage`;
  return etage === 0 ? e : `${e}${ascenseur ? " avec ascenseur" : " sans ascenseur"}`;
}

export const mapsUrl = (e: { lat?: number; lon?: number; adresse: string }) =>
  e.lat != null && e.lon != null
    ? `https://www.google.com/maps/search/?api=1&query=${e.lat},${e.lon}`
    : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(e.adresse)}`;

export function quartierDe(lat?: number, lon?: number, citycode?: string, ville?: string) {
  if (lat == null || lon == null) return undefined;
  const toulouse = citycode === "31555" || (ville ?? "").toLowerCase() === "toulouse";
  if (!toulouse) return undefined;
  return quartiersAround({ lat, lon }, 0)[0]?.name;
}

/* ---------- Ventes et statistiques ---------- */

export function venteDepuisDvf(s: DvfSale): Vente {
  return {
    id: s.id,
    adresse: s.address || "Adresse non communiquée",
    ville: s.city,
    date: s.date,
    prix: s.price,
    surface: s.surface,
    pieces: s.rooms || undefined,
    prixM2: s.pricePerSqm,
    distance: s.distance,
    source: "dvf",
    lat: s.lat,
    lon: s.lon,
    dependances: s.dependances || undefined,
    terrain: s.landSurface || undefined,
  };
}

function quantile(sorted: number[], q: number) {
  if (!sorted.length) return 0;
  const pos = (sorted.length - 1) * q;
  const b = Math.floor(pos);
  const r = pos - b;
  return sorted[b + 1] !== undefined ? sorted[b] + r * (sorted[b + 1] - sorted[b]) : sorted[b];
}

/** Statistiques sur les ventes retenues (non écartées). */
export function marcheDe(ventes: Vente[]): MarketBase | null {
  const ppm = ventes.filter((v) => !v.exclu && v.prixM2 > 0).map((v) => v.prixM2).sort((a, b) => a - b);
  if (!ppm.length) return null;
  return {
    medianSqm: Math.round(quantile(ppm, 0.5)),
    p25: Math.round(quantile(ppm, 0.25)),
    p75: Math.round(quantile(ppm, 0.75)),
    count: ppm.length,
  };
}

/** Ventes dont le prix au m² sort nettement du lot (règle des 1,5 écarts interquartiles). */
export function atypiques(ventes: Vente[]): Set<string> {
  const ppm = ventes.map((v) => v.prixM2).sort((a, b) => a - b);
  if (ppm.length < 5) return new Set();
  const q1 = quantile(ppm, 0.25);
  const q3 = quantile(ppm, 0.75);
  const iqr = q3 - q1;
  return new Set(ventes.filter((v) => v.prixM2 < q1 - 1.5 * iqr || v.prixM2 > q3 + 1.5 * iqr).map((v) => v.id));
}

export function periodeDe(ventes: Vente[]) {
  const ys = ventes.filter((v) => !v.exclu && v.date).map((v) => Number(v.date.slice(0, 4))).filter(Boolean);
  if (!ys.length) return undefined;
  const a = Math.min(...ys);
  const b = Math.max(...ys);
  return a === b ? String(a) : `${a} – ${b}`;
}

/* ---------- Calcul ---------- */

export type BienSaisi = {
  type: Estimation["type"];
  surface: number;
  pieces?: number;
  etage?: number;
  ascenseur?: boolean;
  exterieur?: string;
  parking?: boolean;
  etat?: EtatBien;
  dpe?: ClasseDpe;
};

export function calculer(b: BienSaisi, marche: MarketBase): ExpressResult {
  return expressEstimate(
    {
      propertyType: b.type === "maison" ? "Maison" : "Appartement",
      surface: b.surface,
      rooms: b.pieces ?? 0,
      floor: b.type === "appartement" ? b.etage ?? null : null,
      hasElevator: !!b.ascenseur,
      condition: b.etat ?? "bon",
      outdoor: !!b.exterieur,
      parking: !!b.parking,
      dpe: b.dpe,
    },
    marche
  );
}

/* ---------- Appels serveur ---------- */

export type Suggestion = { label: string; rue: string; codePostal: string; ville: string; citycode: string; lat: number; lon: number; precis: boolean };

export async function chercherAdresses(q: string, signal?: AbortSignal): Promise<Suggestion[]> {
  const res = await fetch(`/api/estimation/adresse?q=${encodeURIComponent(q)}`, { headers: await authHeaders(), signal });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Recherche d'adresse indisponible.");
  return data.suggestions ?? [];
}

export type ReponseVentes = {
  centre?: { lat: number; lon: number; label: string; citycode: string };
  annees?: number[];
  rayon: number;
  statistiques?: DvfStats | null;
  ventes: DvfSale[];
  message?: string;
};

export async function chercherVentes(p: { adresse: string; surface: number; type: string; pieces?: number; rayon: number }): Promise<ReponseVentes> {
  const res = await fetch("/api/estimation/comparables", { method: "POST", headers: await authHeaders(), body: JSON.stringify(p) });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "La recherche des ventes n'a pas abouti.");
  return data as ReponseVentes;
}

/* ---------- Texte argumenté (IA) ---------- */

export function promptCommentaire(o: {
  bien: BienSaisi & { adresse: string; quartier?: string };
  res: ExpressResult;
  marche: MarketBase;
  rayon?: number;
  periode?: string;
  prixConseille?: number;
  ventesManuelles?: boolean;
}) {
  const { bien: b, res, marche } = o;
  const lignes = [
    `Bien : ${resumeBien(b)}, ${b.adresse}${b.quartier ? ` (quartier ${b.quartier})` : ""}.`,
    b.type === "appartement" && b.etage != null ? `Étage : ${etageLabel(b.etage, b.ascenseur)}.` : "",
    `Extérieur : ${b.exterieur || "aucun"}. Stationnement : ${b.parking ? "oui" : "non"}. État : ${ETAT_LABEL[b.etat ?? "bon"]}. DPE : ${b.dpe ?? "non communiqué"}.`,
    o.ventesManuelles
      ? `Référence de marché : ${marche.medianSqm} €/m² (saisie par le conseiller, pas de ventes DVF exploitables).`
      : `Marché : ${marche.count} ventes réelles comparables (DVF, actes notariés)${o.rayon ? ` dans un rayon de ${o.rayon} m` : ""}${o.periode ? ` sur ${o.periode}` : ""}. Prix médian ${marche.medianSqm} €/m², la moitié des ventes entre ${marche.p25} et ${marche.p75} €/m².`,
    `Ajustements appliqués : ${res.adjustments.length ? res.adjustments.map((a) => `${a.label} ${a.pct > 0 ? "+" : ""}${Math.round(a.pct * 100)} %`).join(", ") : "aucun"}.`,
    `Fourchette : ${res.low} € / ${res.central} € / ${res.high} € (${res.sqm} €/m² ajusté). Fiabilité : ${res.confidence}.`,
    o.prixConseille ? `Prix de présentation conseillé par Quentin : ${o.prixConseille} €.` : "",
  ].filter(Boolean);
  return `Rédige le commentaire argumenté d'un avis de valeur destiné au propriétaire (vouvoiement).
${lignes.join("\n")}

Consignes : 3 courts paragraphes, 140 à 200 mots au total, sans titre ni liste ni markdown.
1) Ce que disent les ventes réelles du secteur. 2) Pourquoi le bien se situe à ce niveau (atouts et points de vigilance, uniquement d'après les informations ci-dessus). 3) Le prix de présentation conseillé et la stratégie (un prix juste dès le départ attire les acquéreurs sérieux).
Ton prudent et factuel : pas de promesse de délai ni de prix de vente, aucun superlatif. N'invente aucune caractéristique.`;
}

export const SYSTEM_COMMENTAIRE =
  "Tu rédiges des avis de valeur pour l'agence PATRIM à Toulouse. Tu écris comme un conseiller expérimenté : clair, posé, chiffré, honnête. Réponds uniquement par le texte du commentaire.";

/* ---------- Divers ---------- */

export const contactLabel = (c?: Contact) => (c ? [c.civilite, c.prenom, c.nom].filter(Boolean).join(" ") : "");

export const arrondi = (n: number, pas = 1000) => Math.round(n / pas) * pas;

export async function adresseIci(lat: number, lon: number): Promise<Suggestion | undefined> {
  const res = await fetch(`/api/estimation/adresse?lat=${lat}&lon=${lon}`, { headers: await authHeaders() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Adresse introuvable.");
  return data.suggestions?.[0];
}

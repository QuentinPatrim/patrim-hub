import type { BienStatut, BienType, ContactRole, EtapeAcquereur, RdvType, Source } from "./types";

export const eur = (n?: number | null) => (n == null || isNaN(n) ? "—" : `${Math.round(n).toLocaleString("fr-FR")} €`);
export const eurK = (n?: number | null) =>
  n == null || isNaN(n) ? "—" : n >= 1_000_000 ? `${(n / 1_000_000).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} M€` : `${Math.round(n / 1000).toLocaleString("fr-FR")} k€`;
export const m2 = (n?: number | null) => (n == null ? "—" : `${n.toLocaleString("fr-FR", { maximumFractionDigits: 2 })} m²`);
export const pct = (p: number) => `${p > 0 ? "+" : ""}${Math.round(p * 100)} %`;

const TZ = "Europe/Paris";
export const dateCourte = (iso?: string) =>
  iso ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short", timeZone: TZ }) : "—";
export const dateLongue = (iso?: string) =>
  iso ? new Date(iso.length === 10 ? iso + "T12:00:00" : iso).toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", timeZone: TZ }) : "—";
export const heure = (iso?: string) => (iso ? new Date(iso).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit", timeZone: TZ }).replace(":", "h") : "");
/** Date du jour à Paris au format AAAA-MM-JJ */
export const today = () => new Date().toLocaleDateString("sv-SE", { timeZone: TZ });
export const addDays = (ymd: string, n: number) => {
  const d = new Date(ymd + "T12:00:00Z");
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
export const ilya = (iso?: string) => {
  if (!iso) return "jamais";
  const j = Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);
  return j <= 0 ? "aujourd'hui" : j === 1 ? "hier" : j < 30 ? `il y a ${j} j` : `il y a ${Math.floor(j / 30)} mois`;
};

export const nomComplet = (c?: { civilite?: string; prenom?: string; nom?: string }) =>
  c ? [c.prenom, c.nom].filter(Boolean).join(" ") || "Sans nom" : "—";
export const initiales = (c?: { prenom?: string; nom?: string }) =>
  ((c?.prenom?.[0] ?? "") + (c?.nom?.[0] ?? "")).toUpperCase() || "?";

export const STATUT_BIEN: Record<BienStatut, { label: string; tone: Tone }> = {
  estimation: { label: "Estimation", tone: "neutral" },
  mandat_signe: { label: "Mandat signé", tone: "info" },
  en_vente: { label: "En vente", tone: "ok" },
  sous_offre: { label: "Sous offre", tone: "warn" },
  compromis: { label: "Compromis", tone: "brand" },
  vendu: { label: "Vendu", tone: "brand" },
  retire: { label: "Retiré", tone: "neutral" },
};
export const TYPE_BIEN: Record<BienType, string> = {
  appartement: "Appartement",
  maison: "Maison",
  terrain: "Terrain",
  local: "Local",
  immeuble: "Immeuble",
  parking: "Parking",
};
export const ETAPE: Record<EtapeAcquereur, { label: string; tone: Tone }> = {
  nouveau: { label: "Nouveau", tone: "info" },
  qualifie: { label: "Qualifié", tone: "neutral" },
  visite: { label: "Visite", tone: "warn" },
  offre: { label: "Offre", tone: "brand" },
  compromis: { label: "Compromis", tone: "brand" },
  gagne: { label: "Acté", tone: "ok" },
  perdu: { label: "Perdu", tone: "neutral" },
};
export const ROLE: Record<ContactRole, string> = {
  acquereur: "Acquéreur",
  vendeur: "Vendeur",
  prospect_vendeur: "Prospect vendeur",
  locataire: "Locataire",
  partenaire: "Partenaire",
};
export const SOURCE: Record<Source, string> = {
  seloger: "SeLoger",
  leboncoin: "Leboncoin",
  bienici: "Bien'ici",
  site: "Site Patrim",
  telephone: "Téléphone",
  vitrine: "Vitrine",
  recommandation: "Recommandation",
  instagram: "Instagram",
  pige: "Pige",
  autre: "Autre",
};
export const RDV_TYPE: Record<RdvType, string> = {
  visite: "Visite",
  estimation: "Estimation",
  appel: "Appel",
  signature: "Signature",
  rdv_vendeur: "RDV vendeur",
  autre: "Rendez-vous",
};

export type Tone = "neutral" | "info" | "ok" | "warn" | "danger" | "brand";

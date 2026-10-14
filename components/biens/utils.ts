import { Building, Building2, Car, House, Store, Trees, type LucideIcon } from "lucide-react";
import type { Bien, BienStatut, BienType, Contact } from "@/lib/types";
import { ACQUEREUR_ACTIF, matchScore, topMatches } from "@/lib/matching";

/* Outils partagés du module Biens (et réutilisés par l'Agenda). */

export const TYPE_ICON: Record<BienType, LucideIcon> = {
  appartement: Building2,
  maison: House,
  terrain: Trees,
  local: Store,
  immeuble: Building,
  parking: Car,
};

export const STATUTS: BienStatut[] = ["en_vente", "mandat_signe", "sous_offre", "compromis", "estimation", "vendu", "retire"];

export const prixM2 = (b: Pick<Bien, "prix" | "surface">) => (b.prix && b.surface ? b.prix / b.surface : undefined);

/** Nombre de jours écoulés depuis une date (AAAA-MM-JJ ou ISO). */
export const joursDepuis = (iso?: string) => {
  if (!iso) return undefined;
  const d = new Date(iso.length === 10 ? iso + "T12:00:00" : iso).getTime();
  return Math.max(0, Math.floor((Date.now() - d) / 86400000));
};

export const adresseComplete = (b?: Pick<Bien, "adresse" | "codePostal" | "ville">) =>
  b ? [b.adresse, [b.codePostal, b.ville].filter(Boolean).join(" ")].filter(Boolean).join(", ") : "";

/** Secteur public d'un bien (sans numéro de rue) : quartier + ville. */
export const secteur = (b: Pick<Bien, "quartier" | "ville">) => [b.quartier, b.ville].filter(Boolean).join(", ");

export const estCopro = (b: Pick<Bien, "type">) => b.type === "appartement" || b.type === "parking" || b.type === "local";

/** Champs importants encore vides. */
export function champsACompleter(b: Bien): { key: string; label: string }[] {
  const out: { key: string; label: string }[] = [];
  const add = (cond: boolean, key: string, label: string) => cond && out.push({ key, label });
  add(!b.prix, "prix", "Prix affiché");
  add(!b.netVendeur, "netVendeur", "Net vendeur");
  add(!b.surface, "surface", estCopro(b) ? "Surface Carrez" : "Surface habitable");
  add(b.type !== "terrain" && b.type !== "parking" && !b.pieces, "pieces", "Nombre de pièces");
  add(b.type === "appartement" && b.etage == null, "etage", "Étage");
  add(b.type === "appartement" && b.ascenseur == null, "ascenseur", "Ascenseur");
  add(b.type !== "terrain" && b.type !== "parking" && !b.dpe, "dpe", "Classe énergie (DPE)");
  add(b.type !== "terrain" && b.type !== "parking" && !b.ges, "ges", "Classe climat (GES)");
  add(estCopro(b) && !b.chargesAnnuelles, "chargesAnnuelles", "Charges de copropriété");
  add(estCopro(b) && !b.lotsCopro, "lotsCopro", "Nombre de lots");
  add(!b.taxeFonciere, "taxeFonciere", "Taxe foncière");
  add(b.type !== "terrain" && !b.anneeConstruction, "anneeConstruction", "Année de construction");
  add(b.type !== "terrain" && b.type !== "parking" && !b.chauffage, "chauffage", "Chauffage");
  add(!b.quartier, "quartier", "Quartier");
  add(!b.codePostal, "codePostal", "Code postal");
  add(!b.mandat?.numero, "mandat", "N° de mandat");
  add(!b.vendeurIds?.length, "vendeurIds", "Vendeur");
  add(!b.photos?.length, "photos", "Photos");
  add(!b.description, "description", "Description");
  return out;
}

export const acquereursCompatibles = (b: Bien, contacts: Contact[]) =>
  topMatches(contacts.filter(ACQUEREUR_ACTIF), (c) => matchScore(c, b));

/* ---------- Liens de contact ---------- */
export const telHref = (tel?: string) => (tel ? "tel:" + tel.replace(/[^\d+]/g, "") : undefined);
export const smsHref = (tel?: string, body?: string) =>
  tel ? `sms:${tel.replace(/[^\d+]/g, "")}${body ? "?&body=" + encodeURIComponent(body) : ""}` : undefined;
export const waHref = (tel?: string, text?: string) => {
  if (!tel) return undefined;
  let d = tel.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0")) d = "33" + d.slice(1);
  return `https://wa.me/${d}${text ? "?text=" + encodeURIComponent(text) : ""}`;
};
export const mailHref = (email?: string, subject?: string, body?: string) => {
  const q = [subject && "subject=" + encodeURIComponent(subject), body && "body=" + encodeURIComponent(body)].filter(Boolean).join("&");
  return `mailto:${email ?? ""}${q ? "?" + q : ""}`;
};
export const mapsHref = (lieu: string) => `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(lieu)}`;

/** Texte de proposition d'un bien à un acquéreur : sobre, sans information confidentielle. */
export function texteProposition(b: Bien, c: Contact) {
  const carac = [
    b.type === "appartement" || b.type === "maison" ? (b.pieces ? `${b.pieces} pièces` : "") : "",
    b.surface ? `${b.surface.toLocaleString("fr-FR")} m²` : "",
    b.exterieur ?? "",
    b.parking ?? "",
  ].filter(Boolean);
  const lignes = [
    `Bonjour ${c.prenom || [c.civilite, c.nom].filter(Boolean).join(" ")},`,
    "",
    `Je pense à vous pour un bien que je viens de rentrer${b.quartier ? ` sur le secteur ${b.quartier}` : b.ville ? ` à ${b.ville}` : ""} et qui correspond à votre recherche :`,
    "",
    `${b.titre}`,
    carac.length ? `• ${carac.join(" · ")}` : null,
    b.prix ? `• Prix : ${Math.round(b.prix).toLocaleString("fr-FR")} € honoraires inclus` : null,
    b.dpe ? `• DPE : classe ${b.dpe}` : null,
    b.annonceUrl ? `\nL'annonce : ${b.annonceUrl}` : null,
    "",
    "Si vous souhaitez le visiter, je vous propose quelques créneaux dès cette semaine. Dites-moi ce qui vous arrange.",
    "",
    "Bien à vous,",
    "Quentin Delsol",
    "PATRIM Immobilier",
  ];
  return lignes.filter((l) => l !== null).join("\n").replace(/\n{3,}/g, "\n\n");
}

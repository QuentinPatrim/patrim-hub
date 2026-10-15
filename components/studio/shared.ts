"use client";

/* Outils communs du Studio : faits publics d'un bien, copier / partager,
   enregistrement d'un contenu, petites constantes de marque. */

import { create } from "@/lib/store";
import { titrePublic } from "@/lib/titrePublic";
import { eur, m2, TYPE_BIEN } from "@/lib/format";
import type { Bien, Canal, Contenu } from "@/lib/types";

export const AGENCE = {
  nom: "PATRIM",
  conseiller: "Quentin Delsol",
  adresse: "45 allées Jean Jaurès, 31000 Toulouse",
  tel: "05 61 99 08 08",
  telHref: "tel:+33561990808",
  instagram: "patrim.toulouse",
};

export const CANAL: Record<Canal, { label: string; short: string; color: string }> = {
  annonce: { label: "Annonce portail", short: "Annonce", color: "#4a4f55" },
  instagram_post: { label: "Post Instagram", short: "Instagram", color: "#c13584" },
  instagram_reel: { label: "Reel Instagram", short: "Reel", color: "#e1306c" },
  instagram_story: { label: "Story Instagram", short: "Story", color: "#f77737" },
  facebook: { label: "Post Facebook", short: "Facebook", color: "#1877f2" },
  linkedin: { label: "Post LinkedIn", short: "LinkedIn", color: "#0a66c2" },
  email: { label: "Mail acquéreurs", short: "Mail", color: "#6c191e" },
  video: { label: "Vidéo", short: "Vidéo", color: "#0d1420" },
};

export const STATUT_CONTENU: Record<Contenu["statut"], { label: string; tone: "neutral" | "info" | "ok" | "warn" | "brand" }> = {
  idee: { label: "Idée", tone: "neutral" },
  brouillon: { label: "Brouillon", tone: "warn" },
  pret: { label: "Prêt", tone: "info" },
  programme: { label: "Programmé", tone: "brand" },
  publie: { label: "Publié", tone: "ok" },
};

/** Libellé court d'un bien : "T3 · 68 m² · Carmes". */
export function bienLigne(b: Bien) {
  return [b.pieces ? (b.type === "maison" ? `Maison ${b.pieces} p.` : `T${b.pieces}`) : TYPE_BIEN[b.type], b.surface ? m2(b.surface) : null, b.quartier || b.ville]
    .filter(Boolean)
    .join(" · ");
}

export function lieuPublic(b: Bien) {
  return [b.quartier, b.ville].filter(Boolean).join(", ") || b.ville || "Toulouse";
}

/** Faits publiables d'un bien (jamais : vendeur, notes internes, adresse exacte, numéro de mandat). */
export function faitsPublics(b: Bien): string {
  const l: string[] = [];
  const add = (k: string, v: unknown) => {
    if (v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length)) return;
    l.push(`- ${k} : ${Array.isArray(v) ? v.join(" ; ") : v}`);
  };
  add("Titre", titrePublic(b));
  add("Type", TYPE_BIEN[b.type]);
  add("Secteur", [b.quartier, b.codePostal, b.ville].filter(Boolean).join(" "));
  add("Prix honoraires inclus", b.prix ? eur(b.prix) : undefined);
  if (b.honoraires && b.prix) {
    const net = b.prix - b.honoraires;
    add("Honoraires d'agence", `${eur(b.honoraires)} TTC, soit ${((b.honoraires / net) * 100).toLocaleString("fr-FR", { maximumFractionDigits: 2 })} % du prix hors honoraires (${eur(net)}) — à la charge de : [À compléter]`);
  }
  add("Surface", b.surface ? m2(b.surface) : undefined);
  add("Terrain", b.surfaceTerrain ? m2(b.surfaceTerrain) : undefined);
  add("Pièces", b.pieces);
  add("Chambres", b.chambres);
  add("Étage", b.etage != null ? (b.etage === 0 ? "rez-de-chaussée" : `${b.etage}${b.nbEtages ? ` sur ${b.nbEtages}` : ""}`) : undefined);
  add("Ascenseur", b.ascenseur == null ? undefined : b.ascenseur ? "oui" : "non");
  add("Extérieur", b.exterieur);
  add("Stationnement", b.parking);
  add("Cave", b.cave ? "oui" : undefined);
  add("Année de construction", b.anneeConstruction);
  add("Chauffage", b.chauffage);
  add("Classe énergie (DPE)", b.dpe);
  add("Classe climat (GES)", b.ges);
  add("Charges de copropriété", b.chargesAnnuelles ? `${eur(b.chargesAnnuelles)} / an` : undefined);
  add("Lots de copropriété", b.lotsCopro);
  add("Taxe foncière", b.taxeFonciere ? `${eur(b.taxeFonciere)} / an` : undefined);
  add("Points forts", b.pointsForts);
  add("Description", b.description);
  add("Référence", b.ref);
  return l.join("\n");
}

export async function copier(texte: string) {
  try {
    await navigator.clipboard.writeText(texte);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = texte;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      document.execCommand("copy");
      ta.remove();
      return true;
    } catch {
      return false;
    }
  }
}

/** Partage natif (téléphone). Renvoie "partage" | "copie" | "annule". */
export async function partager(data: { title?: string; text: string }) {
  if (typeof navigator !== "undefined" && navigator.share) {
    try {
      await navigator.share(data);
      return "partage" as const;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return "annule" as const;
    }
  }
  await copier(data.text);
  return "copie" as const;
}

export async function partagerFichiers(files: File[], title: string) {
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.share && nav.canShare?.({ files })) {
    try {
      await nav.share({ files, title });
      return true;
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") return true;
    }
  }
  return false;
}

export function telecharger(blob: Blob, nom: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = nom;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function slug(s: string) {
  return (
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || "patrim"
  );
}

export function enregistrerContenu(c: Omit<Contenu, "id" | "createdAt" | "updatedAt">) {
  return create("contenus", c);
}

/** Message d'erreur lisible. */
export const errMsg = (e: unknown) => (e instanceof Error ? e.message : "Une erreur est survenue.");

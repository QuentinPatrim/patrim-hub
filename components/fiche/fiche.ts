"use client";

/* ============================================================
   Fiche du bien destinée à un acquéreur ou à un client.
   On n'y met QUE des informations publiques (celles d'une annonce) :
   jamais le vendeur, les notes, le net vendeur seul, les offres
   ni les autres acquéreurs. L'adresse exacte est masquée par défaut.
   ============================================================ */

import { supabase } from "@/lib/supabase";
import { uid, update } from "@/lib/store";
import { titrePublic } from "@/lib/titrePublic";
import { AGENCE } from "@/components/documents/charte";
import type { Bien, BienStatut, BienType, ClasseDpe, Contact } from "@/lib/types";

export interface FichePublique {
  v: 1;
  titre: string;
  type: BienType;
  ref?: string;
  secteur: string;           // « Saint-Cyprien · 31300 Toulouse » ou adresse complète
  prix?: number;             // honoraires inclus
  prixHorsHonoraires?: number;
  honorairesPct?: number;    // en % du prix hors honoraires (si à la charge de l'acquéreur)
  honorairesCharge?: "acquereur" | "vendeur";
  surface?: number;
  surfaceTerrain?: number;
  pieces?: number;
  chambres?: number;
  etage?: number;
  nbEtages?: number;
  ascenseur?: boolean;
  exterieur?: string;
  parking?: string;
  cave?: boolean;
  anneeConstruction?: number;
  chauffage?: string;
  dpe?: ClasseDpe;
  ges?: ClasseDpe;
  chargesAnnuelles?: number;
  taxeFonciere?: number;
  lotsCopro?: number;
  description?: string;
  pointsForts?: string[];
  photos: string[];
  disponible: boolean;
  sousOffre?: boolean;
  majLe: string;             // AAAA-MM-JJ
  conseiller?: { nom: string; titre: string; tel: string; mail: string }; // celui qui envoie la fiche
}

export type BienPartage = Bien & { partageId?: string };

const INDISPONIBLE: BienStatut[] = ["compromis", "vendu", "retire"];

export function ficheDepuisBien(b: Bien, vendeurs: Contact[], opts: { adresse: boolean }): FichePublique {
  const lieu = [b.codePostal, b.ville].filter(Boolean).join(" ");
  const secteur = opts.adresse && b.adresse ? [b.adresse, lieu].filter(Boolean).join(", ") : [b.quartier, lieu].filter(Boolean).join(" · ");
  const honoraires = b.honoraires ?? (b.prix && b.netVendeur ? b.prix - b.netVendeur : undefined);
  const acq = b.honorairesCharge === "acquereur";
  return {
    v: 1,
    conseiller: { nom: AGENCE.conseiller, titre: AGENCE.conseillerTitre, tel: AGENCE.conseillerTel, mail: AGENCE.conseillerMail },
    titre: titrePublic(b, vendeurs.flatMap((v) => [v.nom, [v.prenom, v.nom].filter(Boolean).join(" ")])),
    type: b.type,
    ref: b.ref,
    secteur,
    prix: b.prix,
    prixHorsHonoraires: acq && b.prix && honoraires ? b.prix - honoraires : undefined,
    honorairesPct: acq && b.prix && honoraires ? Math.round((honoraires / (b.prix - honoraires)) * 1000) / 10 : undefined,
    honorairesCharge: b.honorairesCharge,
    surface: b.surface,
    surfaceTerrain: b.surfaceTerrain,
    pieces: b.pieces,
    chambres: b.chambres,
    etage: b.etage,
    nbEtages: b.nbEtages,
    ascenseur: b.ascenseur,
    exterieur: b.exterieur,
    parking: b.parking,
    cave: b.cave,
    anneeConstruction: b.anneeConstruction,
    chauffage: b.chauffage,
    dpe: b.dpe,
    ges: b.ges,
    chargesAnnuelles: b.chargesAnnuelles,
    taxeFonciere: b.taxeFonciere,
    lotsCopro: b.lotsCopro,
    description: b.description,
    pointsForts: b.pointsForts,
    // Seulement les photos en ligne (site patrim.fr, portails) : les photos prises au téléphone restent dans l'appli.
    photos: (b.photos ?? []).filter((p) => /^https?:\/\//.test(p)).slice(0, 12),
    disponible: !INDISPONIBLE.includes(b.statut),
    sousOffre: b.statut === "sous_offre",
    majLe: new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" }),
  };
}

/* ---------- Lien sans compte (repli) : la fiche est rangée dans le lien lui-même ---------- */

const b64url = (bytes: Uint8Array) => {
  let s = "";
  bytes.forEach((x) => (s += String.fromCharCode(x)));
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};
const deb64url = (s: string) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));

async function flux(bytes: Uint8Array, t: CompressionStream | DecompressionStream) {
  const out = new Blob([bytes as BlobPart]).stream().pipeThrough(t as unknown as ReadableWritablePair<Uint8Array, Uint8Array>);
  return new Uint8Array(await new Response(out).arrayBuffer());
}

export async function encoderFiche(f: FichePublique): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(f));
  if (typeof CompressionStream !== "undefined") return "z" + b64url(await flux(json, new CompressionStream("deflate-raw")));
  return "j" + b64url(json);
}

export async function decoderFiche(s: string): Promise<FichePublique | null> {
  try {
    const bytes = deb64url(s.slice(1));
    const json = s[0] === "z" ? await flux(bytes, new DecompressionStream("deflate-raw")) : bytes;
    const f = JSON.parse(new TextDecoder().decode(json));
    return f && f.v === 1 ? (f as FichePublique) : null;
  } catch {
    return null;
  }
}

/**
 * Publie la fiche et renvoie son lien. Connecté : lien court, toujours le même pour un bien
 * (republier met la fiche à jour). Sinon : lien long qui contient la fiche.
 */
export async function lienFiche(b: BienPartage, fiche: FichePublique): Promise<string> {
  const origin = window.location.origin;
  if (supabase) {
    const { data: u } = await supabase.auth.getUser();
    if (u.user) {
      const id = b.partageId ?? uid();
      const { error } = await supabase.from("hub_docs").upsert({ id, kind: "partage", data: fiche, user_id: u.user.id, updated_at: new Date().toISOString() });
      if (!error) {
        if (!b.partageId) update("biens", b.id, { partageId: id } as Partial<Bien>);
        return `${origin}/imprimer/partage/${id}`;
      }
    }
  }
  return `${origin}/imprimer/partage/lien#${await encoderFiche(fiche)}`;
}

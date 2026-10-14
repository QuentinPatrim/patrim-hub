"use client";

import { authHeaders } from "./ai";
import { MANDATS_PATRIM } from "./seed";
import { cloudEnabled } from "./supabase";
import { bulkCreate, create, getAll, remove, update } from "./store";
import type { Bien, BienType } from "./types";

/* Import et mise à jour des mandats.
   Les fiches complètes (propriétaire, charges, DDT, photos…) viennent de /api/mandats
   (données privées côté serveur) ; sans connexion, la liste publique de lib/seed.ts sert de base. */

type Fiche = Partial<Bien> & {
  proprietaire?: string;
  ddt?: string;
  driveFolderId?: string;
  aVerifier?: string[];
  sources?: string[];
};

const norm = (s?: string) =>
  (s ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b(avenue|av)\b/g, "av")
    .replace(/\b(boulevard|bd)\b/g, "bd")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

async function fiches(): Promise<Fiche[]> {
  if (cloudEnabled) {
    try {
      const r = await fetch("/api/mandats", { headers: await authHeaders(), cache: "no-store" });
      const j = (await r.json()) as { mandats?: Fiche[] };
      if (r.ok && j.mandats?.length) return j.mandats;
    } catch {
      /* hors connexion : liste publique */
    }
  }
  return MANDATS_PATRIM;
}

/** Contact vendeur : retrouvé par son nom, sinon créé. */
function vendeur(nom: string) {
  const cle = norm(nom);
  const c = getAll("contacts").find((x) => norm([x.nom, x.prenom].filter(Boolean).join(" ")) === cle || norm([x.prenom, x.nom].filter(Boolean).join(" ")) === cle);
  if (c) return c.id;
  const [n, ...p] = nom.trim().split(/\s+/);
  return create("contacts", { nom: n, prenom: p.join(" ") || undefined, roles: ["vendeur"], historique: [] }).id;
}

/** Photos de l'annonce, lues en direct sur patrim.fr (toutes, dans l'ordre du site). */
async function photosAnnonce(url?: string): Promise<string[]> {
  if (!url || !cloudEnabled) return [];
  try {
    const r = await fetch(`/api/annonce-photos?url=${encodeURIComponent(url)}`, { headers: await authHeaders(), cache: "no-store" });
    const j = (await r.json()) as { photos?: string[] };
    return r.ok && Array.isArray(j.photos) ? j.photos.slice(0, 24) : [];
  } catch {
    return [];
  }
}

type AnnonceSite = {
  ref: string; url: string; titre?: string; type: string; ville: string; quartier?: string; surface?: number; prix?: number; netVendeur?: number;
  pieces?: number; chambres?: number; etage?: number; ascenseur?: boolean; dpe?: string; ges?: string; description?: string; photos: string[];
};

const CLASSES = "ABCDEFG";
/** Infos de l'annonce (prix, texte, DPE…) reprises dans la fiche du bien. */
function infosAnnonce(a: AnnonceSite): Partial<Bien> {
  const classe = (c?: string) => (c && CLASSES.includes(c) ? (c as Bien["dpe"]) : undefined);
  return {
    prix: a.prix,
    netVendeur: a.netVendeur,
    quartier: a.quartier,
    description: a.description,
    pieces: a.pieces ?? (Number(a.titre?.match(/(\d+)\s*pi[eè]ce/i)?.[1]) || undefined),
    chambres: a.chambres,
    etage: a.etage,
    ascenseur: a.ascenseur,
    dpe: classe(a.dpe),
    ges: classe(a.ges),
  };
}

const vide = (v: unknown) => v === undefined || v === null || v === "" || (Array.isArray(v) && !v.length);
/** Champs de `infos` à reporter sur `bien` : seulement là où rien n'est encore saisi. */
function aCompleter(bien: Partial<Bien>, infos: Partial<Bien>) {
  const patch: Partial<Bien> = {};
  for (const [k, v] of Object.entries(infos) as [keyof Bien, unknown][]) if (!vide(v) && vide(bien[k])) (patch as Record<string, unknown>)[k] = v;
  return patch;
}

const MARQUEUR = "Ajouté depuis le site patrim.fr : propriétaire, adresse et détails à compléter.";

/** Toutes les annonces de vente en ligne sur patrim.fr (lues par le serveur). */
async function annoncesSite(): Promise<AnnonceSite[]> {
  if (!cloudEnabled) return [];
  try {
    const r = await fetch("/api/annonces-site", { headers: await authHeaders(), cache: "no-store" });
    const j = (await r.json()) as { annonces?: AnnonceSite[] };
    return r.ok && Array.isArray(j.annonces) ? j.annonces : [];
  } catch {
    return [];
  }
}

/** Annonce d'un bien : par référence, sinon par ville + type + surface (seulement si une seule correspond). */
function annonceDe(f: Fiche, annonces: AnnonceSite[]) {
  const parRef = f.ref && annonces.find((a) => a.ref === f.ref);
  if (parRef) return parRef;
  if (!f.surface || !f.ville) return undefined;
  const ok = annonces.filter(
    (a) => norm(a.ville).startsWith(norm(f.ville)) && (!f.type || a.type.startsWith(f.type.slice(0, 4))) && a.surface && Math.abs(a.surface - f.surface!) <= 2
  );
  if (ok.length === 1) return ok[0];
  // Sinon même prix dans la même ville (la surface ou le type de l'annonce peuvent différer du mandat)
  const prix = f.prix && annonces.filter((a) => a.prix === f.prix && norm(a.ville).startsWith(norm(f.ville)));
  return prix && prix.length === 1 ? prix[0] : undefined;
}

const TYPES: BienType[] = ["appartement", "maison", "terrain", "local", "immeuble", "parking"];

/** Bien créé à partir d'une annonce du site qui n'a pas encore de fiche dans l'appli. */
function bienDepuisAnnonce(a: AnnonceSite & { titre?: string }): Partial<Bien> {
  const type = TYPES.find((t) => a.type.startsWith(t.slice(0, 4))) ?? "appartement";
  const infos = infosAnnonce(a);
  const pieces = infos.pieces;
  const nom = type === "appartement" ? "Appartement" : type === "maison" ? "Maison" : type[0].toUpperCase() + type.slice(1);
  return {
    ...infos,
    ref: a.ref,
    titre: [nom, pieces && `${pieces} pièces`, a.surface && `${a.surface} m²`].filter(Boolean).join(" "),
    type,
    adresse: "[À compléter]",
    ville: a.ville || "Toulouse",
    surface: a.surface,
    photos: a.photos,
    annonceUrl: a.url,
    statut: "en_vente",
    notes: MARQUEUR,
  };
}

const duSite = (p: string) => p.startsWith("https://www.patrim.fr/");

export async function importerMandats() {
  const [liste, annonces] = await Promise.all([fiches(), annoncesSite()]);
  let crees = 0,
    maj = 0;
  const nouveaux: Partial<Bien>[] = [];
  const utilisees = new Set<string>();

  for (const f of liste) {
    const { proprietaire, ddt, driveFolderId, aVerifier, sources: _sources, ...champs } = f;
    void _sources;
    // Champs saisis en texte dans les dossiers (lots, année approximative) : gardés dans les notes
    const texte: string[] = [];
    for (const k of ["lotsCopro", "anneeConstruction", "etage", "nbEtages", "surfaceTerrain"] as const) {
      const v = (champs as Record<string, unknown>)[k];
      if (typeof v === "string") {
        texte.push(`${k === "lotsCopro" ? "Lots" : k === "anneeConstruction" ? "Construction" : k} : ${v}`);
        delete (champs as Record<string, unknown>)[k];
      }
    }
    const notes = [champs.notes, ...texte, ddt && `DDT : ${ddt}`, aVerifier?.length ? `À vérifier : ${aVerifier.join(" ; ")}` : ""].filter(Boolean).join("\n");
    const data: Partial<Bien> = {
      ...champs,
      notes: notes || undefined,
      driveUrl: champs.driveUrl ?? (driveFolderId ? `https://drive.google.com/drive/folders/${driveFolderId}` : undefined),
    };
    if (proprietaire) data.vendeurIds = [vendeur(proprietaire)];
    const annonce = annonceDe(f, annonces);
    if (annonce) {
      utilisees.add(annonce.ref);
      data.ref ??= annonce.ref;
      data.annonceUrl = annonce.url;
      Object.assign(data, aCompleter(data, infosAnnonce(annonce)));
    }
    const enLigne = annonce?.photos.length ? annonce.photos : await photosAnnonce(data.annonceUrl);
    if (enLigne.length) data.photos = enLigne;

    const rue = (a?: string) => norm(a?.split(",")[0]);
    const existant = getAll("biens").find((b) => (f.ref && b.ref === f.ref) || (f.adresse && rue(b.adresse) === rue(f.adresse)));
    // Doublon créé plus tôt depuis le site pour cette même annonce : retiré s'il n'a pas été modifié
    if (annonce) {
      for (const b of getAll("biens")) {
        if (b.id !== existant?.id && (b.ref === annonce.ref || b.annonceUrl === annonce.url) && b.notes === MARQUEUR && !b.vendeurIds?.length) {
          remove("biens", b.id);
          maj++;
        }
      }
    }
    if (existant) {
      // On complète sans écraser ce que Quentin a déjà saisi (photos, statut, notes modifiées…)
      const patch: Partial<Bien> = {};
      for (const [k, v] of Object.entries(data) as [keyof Bien, unknown][]) {
        if (v === undefined || v === null || v === "") continue;
        if (vide(existant[k]) || k === "titre" || k === "vendeurIds") (patch as Record<string, unknown>)[k] = v;
      }
      // Photos : la liste complète du site remplace celles venues du site, jamais celles ajoutées depuis le téléphone
      const actuelles = existant.photos ?? [];
      if (enLigne.length && actuelles.every(duSite) && actuelles.join() !== enLigne.join()) patch.photos = enLigne;
      // Les points à vérifier et le DDT s'ajoutent aux notes existantes, une seule fois
      if (existant.notes && data.notes && !existant.notes.includes(data.notes)) patch.notes = `${existant.notes}\n${data.notes}`;
      if (Object.keys(patch).length) {
        update("biens", existant.id, patch);
        maj++;
      }
    } else {
      nouveaux.push({ ...data, statut: data.statut ?? "en_vente" });
      crees++;
    }
  }
  // Annonces du site sans mandat dans la liste : ajoutées (ou complétées si le bien existe déjà avec cette référence)
  for (const a of annonces) {
    if (utilisees.has(a.ref)) continue;
    const existant = getAll("biens").find((b) => b.ref === a.ref || b.annonceUrl === a.url);
    if (existant) {
      const patch = aCompleter(existant, { ...infosAnnonce(a), annonceUrl: a.url, ref: a.ref });
      const actuelles = existant.photos ?? [];
      if (a.photos.length && actuelles.every(duSite) && actuelles.join() !== a.photos.join()) patch.photos = a.photos;
      if (Object.keys(patch).length) {
        update("biens", existant.id, patch);
        maj++;
      }
    } else {
      nouveaux.push(bienDepuisAnnonce(a));
      crees++;
    }
  }
  if (nouveaux.length) await bulkCreate("biens", nouveaux);
  return { crees, maj };
}

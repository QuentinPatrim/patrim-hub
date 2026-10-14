"use client";

import { authHeaders } from "./ai";
import { MANDATS_PATRIM } from "./seed";
import { cloudEnabled } from "./supabase";
import { bulkCreate, create, getAll, update } from "./store";
import type { Bien } from "./types";

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

type AnnonceSite = { ref: string; url: string; type: string; ville: string; surface?: number; prix?: number; photos: string[] };

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
  return ok.length === 1 ? ok[0] : undefined;
}

const duSite = (p: string) => p.startsWith("https://www.patrim.fr/");

export async function importerMandats() {
  const [liste, annonces] = await Promise.all([fiches(), annoncesSite()]);
  let crees = 0,
    maj = 0;
  const nouveaux: Partial<Bien>[] = [];

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
      data.ref ??= annonce.ref;
      data.annonceUrl = annonce.url;
      data.prix ??= annonce.prix;
    }
    const enLigne = annonce?.photos.length ? annonce.photos : await photosAnnonce(data.annonceUrl);
    if (enLigne.length) data.photos = enLigne;

    const rue = (a?: string) => norm(a?.split(",")[0]);
    const existant = getAll("biens").find((b) => (f.ref && b.ref === f.ref) || (f.adresse && rue(b.adresse) === rue(f.adresse)));
    if (existant) {
      // On complète sans écraser ce que Quentin a déjà saisi (photos, statut, notes modifiées…)
      const patch: Partial<Bien> = {};
      for (const [k, v] of Object.entries(data) as [keyof Bien, unknown][]) {
        if (v === undefined || v === null || v === "") continue;
        const actuel = existant[k];
        const vide = actuel === undefined || actuel === null || actuel === "" || (Array.isArray(actuel) && !actuel.length);
        if (vide || k === "titre" || k === "vendeurIds") (patch as Record<string, unknown>)[k] = v;
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
  if (nouveaux.length) await bulkCreate("biens", nouveaux);
  return { crees, maj };
}

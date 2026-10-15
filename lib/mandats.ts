"use client";

import { authHeaders } from "./ai";
import { MANDATS_PATRIM } from "./seed";
import { cloudEnabled } from "./supabase";
import { bulkCreate, create, getAll, remove, update } from "./store";
import type { Bien, BienType, Contact } from "./types";
import type { BienDossier, DossierBien } from "@/components/biens/dossier";
import type { ContactEtatCivil } from "@/components/offre/offre";

/* Import et mise à jour des mandats.
   Les fiches complètes (propriétaire, charges, DDT, photos…) viennent de /api/mandats
   (données privées côté serveur) ; sans connexion, la liste publique de lib/seed.ts sert de base. */

/** Un propriétaire (une personne par fiche contact, même en indivision ou en succession). */
type Personne = {
  civilite?: "M." | "Mme";
  prenom?: string;
  nom: string;
  nomNaissance?: string;
  dateNaissance?: string;
  lieuNaissance?: string;
  profession?: string;
  adresse?: string;
  tel?: string;
  email?: string;
  situation?: string;
};

type Fiche = Partial<Bien> & {
  /** Nom affiché du ou des propriétaires (ancien format, sert aussi de clé côté serveur). */
  proprietaire?: string;
  proprietaires?: Personne[];
  dossier?: DossierBien;
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

const vide = (v: unknown) => v === undefined || v === null || v === "" || v === "[À compléter]" || (Array.isArray(v) && !v.length);
/** Texte récupéré par erreur sur le site (bandeau cookies, coordonnées de l'agence) : traité comme vide. */
const parasite = (v: unknown) => typeof v === "string" && /disque dur|cookie|votre terminal|^agence patrim/i.test(v);

/** Champs de `infos` à reporter : seulement là où rien n'est encore saisi. */
function aCompleter<T extends object>(obj: T, infos: Partial<T>): Partial<T> {
  const patch: Partial<T> = {};
  const o = obj as Record<string, unknown>;
  for (const [k, v] of Object.entries(infos)) if (!vide(v) && (vide(o[k]) || parasite(o[k]))) (patch as Record<string, unknown>)[k] = v;
  return patch;
}

const nomsDe = (c: { nom?: string; prenom?: string }) => [norm(`${c.nom ?? ""} ${c.prenom ?? ""}`), norm(`${c.prenom ?? ""} ${c.nom ?? ""}`)];

/** Fiche contact d'un propriétaire : retrouvée par son nom (ou complétée quand seul le nom de famille
    était connu), sinon créée. Ce qui est déjà saisi n'est jamais remplacé. */
function personne(p: Personne, ancienne?: string): string {
  const contacts = getAll("contacts") as ContactEtatCivil[];
  const cle = norm(`${p.nom} ${p.prenom ?? ""}`);
  const seulNom = contacts.filter((c) => c.roles?.includes("vendeur") && !c.prenom && norm(c.nom) === norm(p.nom));
  // Fiche créée par un import précédent avec tous les noms dans un seul contact : reprise pour la première personne
  const groupee = ancienne ? contacts.find((c) => !c.tel && !c.email && nomsDe(c).includes(norm(ancienne))) : undefined;
  const c = contacts.find((x) => nomsDe(x).includes(cle)) ?? (seulNom.length === 1 && p.prenom ? seulNom[0] : undefined) ?? groupee;
  const infos: Partial<ContactEtatCivil> = {
    civilite: p.civilite,
    prenom: p.prenom,
    tel: p.tel,
    email: p.email,
    adresse: p.adresse,
    dateNaissance: p.dateNaissance,
    lieuNaissance: p.lieuNaissance,
    profession: p.profession,
    notes: [p.nomNaissance && `${p.civilite === "M." ? "Né" : "Née"} ${p.nomNaissance}`, p.situation].filter(Boolean).join(". ") || undefined,
  };
  if (c) {
    const patch = aCompleter(c, infos);
    if (c === groupee) Object.assign(patch, { nom: p.nom, prenom: p.prenom });
    if (!c.roles?.includes("vendeur")) patch.roles = [...(c.roles ?? []), "vendeur"];
    if (Object.keys(patch).length) update("contacts", c.id, patch as Partial<Contact>);
    return c.id;
  }
  const champs = Object.fromEntries(Object.entries(infos).filter(([, v]) => !vide(v))) as Partial<ContactEtatCivil>;
  return create("contacts", { ...champs, nom: p.nom, roles: ["vendeur"], historique: [] }).id;
}

/** Contact vendeur (ancien format, un seul nom) : retrouvé par son nom, sinon créé. */
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
    const { proprietaire, proprietaires, dossier: dossierFiche, ddt, driveFolderId, aVerifier, sources: _sources, ...champs } = f;
    void _sources;
    // Champs saisis en texte dans les dossiers (lots détaillés, année approximative) : rangés dans le dossier du bien
    const precisions: string[] = [];
    const LIBELLES = { lotsCopro: "Lots", anneeConstruction: "Construction", etage: "Étage", nbEtages: "Niveaux", surfaceTerrain: "Terrain" } as const;
    for (const k of Object.keys(LIBELLES) as (keyof typeof LIBELLES)[]) {
      const v = (champs as Record<string, unknown>)[k];
      if (typeof v === "string") {
        precisions.push(`${LIBELLES[k]} : ${v}`);
        delete (champs as Record<string, unknown>)[k];
      }
    }
    const dossier: DossierBien = Object.fromEntries(
      Object.entries({
        ...dossierFiche,
        ddt: dossierFiche?.ddt ?? ddt,
        aVerifier: dossierFiche?.aVerifier ?? aVerifier,
        precisions: [...(dossierFiche?.precisions ?? []), ...precisions],
      }).filter(([, v]) => !vide(v))
    );
    const data: Partial<BienDossier> = {
      ...champs,
      driveUrl: champs.driveUrl ?? (driveFolderId ? `https://drive.google.com/drive/folders/${driveFolderId}` : undefined),
    };
    if (Object.keys(dossier).length) data.dossier = { ...dossier, maj: new Date().toISOString().slice(0, 10) };
    if (proprietaires?.length) data.vendeurIds = proprietaires.map((p, i) => personne(p, i === 0 ? proprietaire : undefined));
    else if (proprietaire) data.vendeurIds = [vendeur(proprietaire)];
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
      const { vendeurIds, dossier: dossierImport, mandat, titre, ...reste } = data;
      const patch: Partial<BienDossier> = aCompleter(existant, reste);
      if (titre && titre !== existant.titre) patch.titre = titre;
      // Vendeurs : ceux du dossier, plus ceux ajoutés à la main
      const ids = [...new Set([...(vendeurIds ?? []), ...(existant.vendeurIds ?? [])])];
      if (ids.join() !== (existant.vendeurIds ?? []).join()) patch.vendeurIds = ids;
      // Mandat : seules les informations manquantes (numéro, type, dates) sont ajoutées
      const manque = mandat ? aCompleter(existant.mandat ?? {}, mandat) : {};
      if (Object.keys(manque).length) patch.mandat = { ...existant.mandat, ...manque };
      // Le dossier vient des pièces (rien ne s'y saisit à la main) : il est remplacé à chaque import
      const sansDate = (d?: DossierBien) => JSON.stringify({ ...d, maj: undefined });
      if (dossierImport && sansDate(dossierImport) !== sansDate((existant as BienDossier).dossier)) patch.dossier = dossierImport;
      // Bien créé depuis le site : la mention « à compléter » disparaît une fois le dossier rattaché
      if (existant.notes === MARQUEUR && (vendeurIds?.length || reste.adresse)) patch.notes = reste.notes ?? "";
      // Photos : la liste complète du site remplace celles venues du site, jamais celles ajoutées depuis le téléphone
      const actuelles = existant.photos ?? [];
      if (enLigne.length && actuelles.every(duSite) && actuelles.join() !== enLigne.join()) patch.photos = enLigne;
      if (Object.keys(patch).length) {
        update("biens", existant.id, patch as Partial<Bien>);
        maj++;
      }
    } else {
      nouveaux.push({ ...data, statut: data.statut ?? "en_vente" } as Partial<Bien>);
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

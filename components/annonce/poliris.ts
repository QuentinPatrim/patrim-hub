/* ============================================================
   Fichier d'annonces au format Poliris (SeLoger, version 4.09),
   le format que lisent les portails et les multidiffuseurs.
   Paquet ZIP : Annonces.csv (une annonce par ligne, 329 champs
   entre guillemets séparés par !#, encodage ISO-8859-1), Config.txt
   et Photos.cfg (photos transmises par leur adresse web).
   Le fichier est seulement produit sur l'appareil : rien n'est
   envoyé d'ici. Aucune donnée du dossier confidentiel (vendeur,
   notes, propriétaire) n'y figure.
   ============================================================ */

import { locationDe, locationSeule } from "@/components/location/bienLocation";
import { ventilerHonoraires } from "@/components/location/loi";
import type { Bien, BienType } from "@/lib/types";
import { annonceDe, enCopro, tauxHonoraires, texteAnnonce, trous } from "./annonce";
import { creerZip } from "./zip";

export const VERSION_POLIRIS = "4.09";
const NB_CHAMPS = 329;

export interface ReglagesExport {
  /** Identifiant agence fourni par le portail ou le multidiffuseur (champ 1). */
  agence: string;
  /** Nom du logiciel, pour Config.txt et le nom du fichier. */
  logiciel: string;
  /** Lien vers le barème des honoraires de l'agence (champ 307). */
  bareme: string;
}
export const REGLAGES_DEFAUT: ReglagesExport = { agence: "", logiciel: "patrimhub", bareme: "" };

const TYPES: Record<BienType, string> = {
  appartement: "Appartement",
  maison: "Maison/villa",
  terrain: "Terrain",
  local: "Local",
  immeuble: "Immeuble",
  parking: "Parking/box",
};

/** Bien à mettre dans le fichier par défaut : en vente, ou à louer. */
export function aDiffuser(b: Bien) {
  if (locationSeule(b)) return locationDe(b)?.statut === "a_louer";
  return b.statut === "en_vente";
}
/** Bien qu'on peut ajouter au fichier : vente en cours ou location libre ou en préavis. */
export function diffusable(b: Bien) {
  if (locationSeule(b)) return locationDe(b)?.statut !== "loue";
  return b.statut === "en_vente" || b.statut === "mandat_signe" || b.statut === "sous_offre";
}

const dec = (n?: number) => (n == null || Number.isNaN(n) ? "" : String(Math.round(n * 100) / 100));
const ent = (n?: number) => (n == null || Number.isNaN(n) ? "" : String(Math.round(n)));
const ouiNon = (v?: boolean) => (v == null ? "" : v ? "OUI" : "NON");
const jjmmaaaa = (ymd?: string) => (ymd && /^\d{4}-\d{2}-\d{2}/.test(ymd) ? `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}/${ymd.slice(0, 4)}` : "");

/** Référence affichée (20 caractères) et identifiant technique stable (30 caractères). */
export const refDe = (b: Bien) => (b.ref || locationDe(b)?.site?.ref || b.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 8)).slice(0, 20);
const idTechnique = (b: Bien) => b.id.replace(/[^A-Za-z0-9]/g, "").slice(0, 30);

function libelle(b: Bien) {
  const t = b.titre?.trim();
  if (t && t.length <= 64) return t;
  const typo = b.type === "appartement" && b.pieces ? `T${b.pieces}` : TYPES[b.type];
  return [typo, b.surface ? `${b.surface} m²` : "", b.quartier || b.ville].filter(Boolean).join(" ").slice(0, 64);
}

/** Valeur d'un champ : sur une ligne, guillemets remplacés par des apostrophes. */
const propre = (s: string) => s.replace(/\r?\n/g, "<BR>").replace(/"/g, "'");

/** Les 329 champs d'une annonce, dans l'ordre (rang 1 = indice 0). */
export function champsPoliris(b: Bien, r: ReglagesExport): string[] {
  const f: string[] = new Array(NB_CHAMPS).fill("");
  const set = (rang: number, v: string) => (f[rang - 1] = v);
  const a = annonceDe(b);
  const loc = locationSeule(b);
  const l = locationDe(b);

  set(1, r.agence);
  set(2, refDe(b));
  set(3, loc ? "Location" : "Vente");
  set(4, TYPES[b.type] ?? "Inconnu");
  set(5, b.codePostal ?? "");
  set(6, b.ville ?? "");
  set(7, "France");
  set(8, b.adresse ?? "");
  set(9, b.quartier ?? "");
  if (loc) {
    const cc = l?.loyer != null ? l.loyer + (l.charges ?? 0) : undefined;
    set(11, dec(cc));
    set(13, "OUI");
    set(15, dec(l?.honoraires));
    set(23, dec(l?.charges));
    set(26, ouiNon(l?.meuble));
    set(304, a.forfait ? "1" : "2");
    if (l?.honoraires) set(306, dec(ventilerHonoraires(l.honoraires, b.surface).edl));
  } else {
    const vendeur = b.honorairesCharge === "vendeur";
    const net = b.netVendeur ?? (b.prix && b.honoraires ? b.prix - b.honoraires : undefined);
    set(11, dec(b.prix));
    set(15, vendeur ? "0" : dec(tauxHonoraires(b)));
    set(302, vendeur ? "2" : "1");
    set(303, dec(vendeur ? b.prix : net));
    if (enCopro(b)) {
      set(258, "OUI");
      set(259, ent(b.lotsCopro));
      set(260, dec(b.chargesAnnuelles));
      set(261, a.procedure?.trim() ? "OUI" : "NON");
      set(262, (a.procedure ?? "").trim().slice(0, 128));
    }
    set(112, (b.mandat?.numero ?? "").slice(0, 15));
    set(113, jjmmaaaa(b.mandat?.debut));
    set(83, ouiNon(b.mandat?.type ? b.mandat.type === "exclusif" : undefined));
  }
  set(16, dec(b.surface));
  set(17, dec(b.surfaceTerrain));
  set(18, ent(b.pieces ?? (b.type === "parking" || b.type === "terrain" ? 0 : undefined)));
  set(19, ent(b.chambres));
  set(20, libelle(b));
  set(21, texteAnnonce(b, a).slice(0, 4000));
  set(22, jjmmaaaa(a.dispo));
  set(24, ent(b.etage));
  set(25, ent(b.nbEtages));
  set(27, ent(b.anneeConstruction));
  set(41, ouiNon(b.ascenseur));
  set(42, ouiNon(b.cave));
  set(108, b.codePostal ?? "");
  set(109, b.ville ?? "");

  // Photos : 1 à 9 (rangs 85-93), 10 à 20 (164-174), 21 à 30 (264-273), par leur adresse web.
  const photos = (b.photos ?? []).filter((p) => /^https?:\/\//.test(p)).slice(0, 30);
  photos.forEach((p, i) => set(i < 9 ? 85 + i : i < 20 ? 164 + (i - 9) : 264 + (i - 20), p));

  // DPE / GES (classes, valeurs) et coût estimé de l'énergie.
  set(176, ent(a.dpeKwh));
  set(177, b.dpe ?? "");
  set(178, ent(a.gesKg));
  set(179, b.ges ?? "");
  if (a.energieMin && a.energieMax) {
    set(325, "DPE_v07-2021");
    set(326, dec(a.energieMin));
    set(327, dec(a.energieMax));
    set(328, ent(a.energieAnnee));
  }

  set(175, idTechnique(b));
  set(301, VERSION_POLIRIS);
  set(307, r.bareme.trim());
  return f.map(propre);
}

/** Ce qui manque à une annonce pour être acceptée (obligatoire) ou complète (conseillé). */
export function verifier(b: Bien, r: ReglagesExport): { bloquant: string[]; conseil: string[] } {
  const f = champsPoliris(b, r);
  const v = (rang: number) => f[rang - 1];
  const loc = locationSeule(b);
  const bloquant: string[] = [];
  const conseil: string[] = [];
  if (!/^\d{5}$/.test(v(5))) bloquant.push("code postal");
  if (!v(6)) bloquant.push("ville");
  if (!v(11)) bloquant.push(loc ? "loyer" : "prix");
  if (!v(15)) bloquant.push(loc ? "honoraires locataire" : "taux d'honoraires");
  if (v(18) === "") bloquant.push("nombre de pièces");
  if (loc) {
    if (!v(23)) bloquant.push("charges");
    if (!v(306)) bloquant.push("part état des lieux (surface)");
  } else if (v(302) === "1" && !v(303)) bloquant.push("net vendeur");
  if (!v(177) || !v(179)) conseil.push("classes DPE et GES");
  if (!v(326)) conseil.push("coût de l'énergie");
  if (!v(16)) conseil.push("surface");
  if (!v(85)) conseil.push("photos");
  const t = trous(texteAnnonce(b, annonceDe(b)));
  if (t.length) conseil.push(`texte à compléter (${t.join(", ")})`);
  return { bloquant, conseil };
}

/* ---------- Encodage ISO-8859-1 ---------- */

const REMPLACE: Record<string, string> = {
  "\u2019": "'",
  "\u2018": "'",
  "\u201c": "'",
  "\u201d": "'",
  "\u2026": "...",
  "\u2013": "-",
  "\u2014": "-",
  "\u0153": "oe",
  "\u0152": "OE",
  "\u20ac": "euros",
  "\u2082": "2",
  "\u00a0": " ",
  "\u202f": " ",
  "\u2009": " ",
};

export function latin1(s: string): Uint8Array {
  const t = s.replace(/[\u2019\u2018\u201c\u201d\u2026\u2013\u2014\u0153\u0152\u20ac\u2082\u00a0\u202f\u2009]/g, (c) => REMPLACE[c] ?? c);
  const out: number[] = [];
  for (const ch of t) {
    const c = ch.codePointAt(0)!;
    if (c < 256) out.push(c);
    else {
      const base = ch.normalize("NFD")[0];
      out.push(base && base.charCodeAt(0) < 256 ? base.charCodeAt(0) : 0x3f);
    }
  }
  return new Uint8Array(out);
}

/* ---------- Paquet ---------- */

export const ligneCsv = (champs: string[]) => champs.map((c) => `"${c}"`).join("!#");

export function nomPaquet(r: ReglagesExport) {
  const bout = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "") || "x";
  return `${bout(r.logiciel)}_${bout(r.agence || "test")}.zip`;
}

export function paquetPoliris(biens: Bien[], r: ReglagesExport): Blob {
  const csv = biens.map((b) => ligneCsv(champsPoliris(b, r))).join("\r\n") + "\r\n";
  const config = [`Version=${VERSION_POLIRIS}`, `Application=${r.logiciel || "patrimhub"} / 1.0`, "Devise=Euro"].join("\r\n") + "\r\n";
  return creerZip([
    { nom: "Annonces.csv", data: latin1(csv) },
    { nom: "Config.txt", data: latin1(config) },
    { nom: "Photos.cfg", data: latin1("Mode=URL\r\n") },
  ]);
}

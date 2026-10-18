/* ============================================================
   Reprise du classeur « Suivi des commissions » (Excel), lu sur
   l'appareil : rien n'est envoyé. On ne garde que les ventes
   du conseiller (colonne Commercial), et les réglages de calcul
   (taux, TTC/HT, TVA, partage) et objectifs du classeur.
   Module pur (testable hors navigateur).
   ============================================================ */

import { ErreurLecture, entites, extraire, lireZip } from "@/components/ics/lecture";
import type { StatutVente, VenteRevenu } from "./revenus";

export type Feuilles = Map<string, string[][]>;

const colonne = (ref: string) => {
  const lettres = /^[A-Z]+/i.exec(ref)?.[0].toUpperCase() ?? "";
  let n = 0;
  for (const l of lettres) n = n * 26 + (l.charCodeAt(0) - 64);
  return n - 1;
};

/** Toutes les feuilles d'un classeur .xlsx, par nom (valeurs calculées telles qu'enregistrées par Excel). */
export async function lireFeuilles(o: Uint8Array): Promise<Feuilles> {
  if (!(o[0] === 0x50 && o[1] === 0x4b)) throw new ErreurLecture("Ce fichier n'est pas un classeur Excel (.xlsx). Choisis le fichier « Suivi_Commissions ».");
  const zip = lireZip(o);
  const lire = async (nom: string) => {
    const e = zip.get(nom);
    return e ? new TextDecoder().decode(await extraire(o, e)) : undefined;
  };
  const classeur = await lire("xl/workbook.xml");
  if (classeur === undefined) throw new ErreurLecture("Ce fichier compressé n'est pas un classeur Excel.");
  const liens = (await lire("xl/_rels/workbook.xml.rels")) ?? "";
  const cibles = new Map<string, string>();
  for (const m of liens.matchAll(/<Relationship\b[^>]*>/g)) {
    const id = /\bId="([^"]+)"/.exec(m[0])?.[1];
    const cible = /\bTarget="([^"]+)"/.exec(m[0])?.[1];
    if (id && cible) cibles.set(id, cible.startsWith("/") ? cible.slice(1) : `xl/${cible}`);
  }

  const partages: string[] = [];
  const sst = (await lire("xl/sharedStrings.xml")) ?? "";
  for (const si of sst.matchAll(/<si\b[^>]*>([\s\S]*?)<\/si>/g)) {
    const sans = si[1].replace(/<rPh\b[\s\S]*?<\/rPh>/g, "");
    partages.push(entites([...sans.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join("")));
  }

  const feuilles: Feuilles = new Map();
  for (const s of classeur.matchAll(/<sheet\b[^>]*>/g)) {
    const nom = entites(/\bname="([^"]*)"/.exec(s[0])?.[1] ?? "");
    const rid = /\br:id="([^"]+)"/.exec(s[0])?.[1];
    const xml = rid && cibles.get(rid) ? await lire(cibles.get(rid)!) : undefined;
    if (!xml) continue;
    const lignes: string[][] = [];
    for (const r of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
      const num = Number(/\br="(\d+)"/.exec(r[1])?.[1] ?? lignes.length + 1) - 1;
      const ligne: string[] = [];
      let i = 0;
      for (const c of (r[2] ?? "").matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
        const ref = /\br="([A-Z]+\d+)"/i.exec(c[1])?.[1];
        if (ref) i = colonne(ref);
        const type = /\bt="(\w+)"/.exec(c[1])?.[1];
        const corps = c[2] ?? "";
        const v = /<v>([\s\S]*?)<\/v>/.exec(corps)?.[1];
        let valeur = "";
        if (type === "s") valeur = partages[Number(v)] ?? "";
        else if (type === "inlineStr") valeur = entites([...corps.matchAll(/<t\b[^>]*>([\s\S]*?)<\/t>/g)].map((t) => t[1]).join(""));
        else if (v !== undefined) valeur = entites(v);
        ligne[i] = valeur;
        i++;
      }
      lignes[num] = Array.from(ligne, (x) => x ?? "");
    }
    feuilles.set(nom, Array.from(lignes, (l) => l ?? []));
  }
  if (!feuilles.size) throw new ErreurLecture("Aucune feuille trouvée dans ce classeur.");
  return feuilles;
}

/* ---------- Lecture du suivi des commissions ---------- */

export const normal = (t: string) =>
  t
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();

const nombre = (t: string | undefined) => {
  if (!t) return undefined;
  const n = Number(t.replace(/\s|€/g, "").replace(",", "."));
  return Number.isFinite(n) ? n : undefined;
};

/** Date Excel (numéro de série, ou texte JJ/MM/AAAA) en AAAA-MM-JJ. */
export function dateExcel(t: string | undefined) {
  if (!t) return undefined;
  const fr = /^(\d{1,2})\/(\d{1,2})\/(\d{4})/.exec(t.trim());
  if (fr) return `${fr[3]}-${fr[2].padStart(2, "0")}-${fr[1].padStart(2, "0")}`;
  if (/^\d{4}-\d{2}-\d{2}/.test(t)) return t.slice(0, 10);
  const n = nombre(t);
  if (n == null || n < 20000 || n > 80000) return undefined;
  return new Date(Math.round((n - 25569) * 86400000)).toISOString().slice(0, 10);
}

const STATUTS: [RegExp, StatutVente][] = [
  [/vendu|acte/, "acte"],
  [/compromis/, "compromis"],
  [/offre/, "offre"],
];

export interface Reprise {
  ventes: Omit<VenteRevenu, "id" | "updatedAt">[];
  reglages: { taux?: number; honorairesTTC?: boolean; tva?: number; partageAuto: boolean };
  objectifs: Record<string, number>;
  /** Lignes à son nom mais pas reprises (vendu sans date d'acte…). */
  ignorees: number;
}

function trouverEntete(t: string[][], mots: string[]) {
  for (let i = 0; i < Math.min(t.length, 30); i++) {
    const l = (t[i] ?? []).map(normal);
    if (mots.every((m) => l.some((c) => c.startsWith(m)))) return i;
  }
  return -1;
}

/** Lit le classeur et garde les ventes dont la colonne Commercial contient `prenom`. */
export function lireSuivi(f: Feuilles, prenom: string): Reprise {
  const nomFeuille = [...f.keys()].find((n) => normal(n).includes("suivi")) ?? [...f.keys()].find((n) => trouverEntete(f.get(n)!, ["commercial", "honoraires"]) >= 0);
  const t = nomFeuille ? f.get(nomFeuille)! : undefined;
  const h = t ? trouverEntete(t, ["commercial", "honoraires"]) : -1;
  if (!t || h < 0) throw new ErreurLecture("Je ne trouve pas l'onglet « Suivi dossiers » (colonnes Commercial et Honoraires) dans ce classeur.");

  // Réglages du classeur
  const reglages: Reprise["reglages"] = { partageAuto: true };
  const objectifs: Record<string, number> = {};
  for (const [, lignes] of f) {
    for (const l of lignes) {
      const cellules = (l ?? []).filter((c) => c !== "");
      if (!cellules.length) continue;
      const lib = normal(cellules[0]);
      const val = cellules[1];
      if (lib.startsWith("taux de commission")) reglages.taux = nombre(val);
      else if (lib.includes("honoraires de la colonne") && val) reglages.honorairesTTC = normal(val) === "ttc";
      else if (lib.startsWith("taux de tva")) reglages.tva = nombre(val);
      else if (lib.startsWith("partager automatiquement") && val) reglages.partageAuto = normal(val) !== "non";
      const obj = /^ma commission (\d{4})$/.exec(lib);
      if (obj && nombre(val) != null) objectifs[obj[1]] = nombre(val)!;
    }
  }

  const ent = (t[h] ?? []).map(normal);
  const col = (...debuts: string[]) => ent.findIndex((c) => debuts.some((d) => c.startsWith(d)));
  const C = {
    proprio: col("proprietaire"),
    mandat: col("n° mandat", "n mandat", "numero de mandat", "mandat"),
    adresse: col("adresse"),
    prix: col("offre / prix", "prix de vente", "offre"),
    honoraires: col("honoraires"),
    compromis: col("date compromis"),
    acte: ent.findIndex((c) => c === "date acte" || c === "date de l'acte"),
    probable: col("date acte probable"),
    commercial: col("commercial"),
    statut: col("statut"),
  };
  const cible = normal(prenom);
  const val = (l: string[], i: number) => (i >= 0 ? (l[i] ?? "").trim() : "");

  const ventes: Reprise["ventes"] = [];
  let ignorees = 0;
  for (const l of t.slice(h + 1)) {
    if (!l) continue;
    const noms = val(l, C.commercial)
      .split(/\/|,|\bet\b|&/i)
      .map(normal)
      .filter(Boolean);
    if (!noms.includes(cible)) continue;
    const st = normal(val(l, C.statut));
    const statut = STATUTS.find(([re]) => re.test(st))?.[1];
    if (!statut) continue; // mandat sans offre : pas encore une vente
    // Vente en cours : la date d'acte prévue (colonne calculée du classeur) si elle est connue
    const dateActe = dateExcel(val(l, C.acte)) ?? (statut !== "acte" ? dateExcel(val(l, C.probable)) : undefined);
    if (statut === "acte" && !dateActe) {
      ignorees++;
      continue;
    }
    const libelle = val(l, C.proprio) || val(l, C.adresse) || "Vente";
    const mandat = val(l, C.mandat) || undefined;
    ventes.push({
      nature: "vente",
      libelle,
      adresse: val(l, C.adresse) || undefined,
      mandat,
      prixVente: nombre(val(l, C.prix)),
      honoraires: nombre(val(l, C.honoraires)),
      dateCompromis: dateExcel(val(l, C.compromis)),
      dateActe,
      statut,
      partage: reglages.partageAuto ? Math.max(1, noms.length) : 1,
      source: "excel",
      cle: `excel:${normal(libelle)}|${normal(val(l, C.adresse))}`,
    });
  }
  return { ventes, reglages, objectifs, ignorees };
}

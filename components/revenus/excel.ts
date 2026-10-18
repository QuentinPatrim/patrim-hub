/* ============================================================
   Reprise du classeur « Suivi des commissions » (Excel), lu sur
   l'appareil : rien n'est envoyé. On ne garde que les ventes
   du conseiller (colonne Commercial), et les réglages de calcul
   (taux, TTC/HT, TVA, partage) et objectifs du classeur.
   Module pur (testable hors navigateur).
   ============================================================ */

import { ErreurLecture, entites, extraire, lireZip } from "@/components/ics/lecture";
import { type MoisRevenu, type Periode, type StatutVente, type TypeDossier, type VenteRevenu } from "./revenus";

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
  /** « suivi » : classeur des commissions de l'agence ; « revenus » : classeur personnel (saisie mensuelle). */
  genre: "suivi" | "revenus";
  ventes: Omit<VenteRevenu, "id" | "updatedAt">[];
  mois: Omit<MoisRevenu, "id" | "updatedAt">[];
  periodes: Periode[];
  reglages: { taux?: number; tauxLocation?: number; tauxGestion?: number; moisGestion?: number; honorairesTTC?: boolean; tva?: number; base?: "brut" | "net"; partageAuto: boolean };
  objectifs: Record<string, number>;
  /** Lignes à son nom mais pas reprises (vendu sans date d'acte…). */
  ignorees: number;
}

/** Reconnaît le classeur et le lit : personnel (« Saisie mensuelle ») ou suivi de l'agence. */
export function lireClasseur(f: Feuilles, prenom: string, auj: string): Reprise {
  if ([...f.keys()].some((n) => normal(n).includes("saisie mensuelle"))) return lireRevenus(f, auj);
  return lireSuivi(f, prenom);
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
  return { genre: "suivi", ventes, mois: [], periodes: [], reglages, objectifs, ignorees };
}

/* ---------- Classeur personnel : saisie mensuelle, honoraires par dossier, paramètres ---------- */

const MOIS_NOMS = ["janvier", "fevrier", "mars", "avril", "mai", "juin", "juillet", "aout", "septembre", "octobre", "novembre", "decembre"];
const TYPES: [RegExp, TypeDossier][] = [
  [/locat/, "location"],
  [/gest/, "gestion"],
  [/vente/, "vente"],
];

function feuille(f: Feuilles, nom: string) {
  const k = [...f.keys()].find((n) => normal(n).includes(nom));
  return k ? f.get(k)! : undefined;
}

/** Lit le classeur personnel de revenus : les mois passés, les dossiers et les réglages du contrat. */
export function lireRevenus(f: Feuilles, auj: string): Reprise {
  const courant = auj.slice(0, 7);
  const t = feuille(f, "saisie mensuelle")!;
  const h = trouverEntete(t, ["annee", "mois", "fixe retenu"]);
  if (h < 0) throw new ErreurLecture("Je ne trouve pas les colonnes Année, Mois et Fixe retenu dans l'onglet « Saisie mensuelle ».");
  const ent = (t[h] ?? []).map(normal);
  const col = (...debuts: string[]) => ent.findIndex((c) => debuts.some((d) => c.startsWith(d)));
  const C = {
    an: col("annee"),
    mois: ent.findIndex((c) => c === "mois"),
    num: ent.findIndex((c) => c === "n°" || c === "no" || c === "n"),
    contrat: col("contrat"),
    fixe: col("fixe retenu"),
    manuelles: col("commissions (saisie manuelle)", "commissions (saisie"),
    ik: ent.findIndex((c) => c === "ik"),
    percu: col("net reellement percu"),
  };
  const val = (l: string[], i: number) => (i >= 0 ? (l[i] ?? "").trim() : "");

  // Réglages du classeur
  const reglages: Reprise["reglages"] = { partageAuto: false };
  const par = feuille(f, "parametres") ?? [];
  const parAn = new Map<number, { fixeAlt?: number; fixeCdi?: number; ikAlt?: number; ikCdi?: number; moisTreizieme?: number }>();
  const hp = trouverEntete(par, ["annee", "fixe mensuel"]);
  const ep = hp >= 0 ? (par[hp] ?? []).map(normal) : [];
  const cp = (...m: string[]) => ep.findIndex((c) => m.every((x) => c.includes(x)));
  for (const l of par) {
    const cellules = (l ?? []).filter((c) => c !== "");
    if (!cellules.length) continue;
    const lib = normal(cellules[0]);
    if (lib.includes("part sur une vente")) reglages.taux = nombre(cellules[1]);
    else if (lib.includes("part sur une location")) reglages.tauxLocation = nombre(cellules[1]);
    else if (lib.startsWith("honoraires de gestion")) reglages.tauxGestion = nombre(cellules[1]);
    else if (lib.includes("mois de gestion")) reglages.moisGestion = nombre(cellules[1]);
    else if (lib.startsWith("taux de tva")) reglages.tva = nombre(cellules[1]);
    else if (lib.startsWith("les commissions sont saisies")) reglages.base = normal(cellules[1] ?? "").startsWith("brut") ? "brut" : "net";
  }
  if (hp >= 0) {
    for (const l of par.slice(hp + 1)) {
      const an = nombre(l?.[ep.findIndex((c) => c === "annee")]);
      if (!an || an < 2000 || an > 2100) continue;
      parAn.set(an, {
        fixeAlt: nombre(l[cp("fixe", "alternance")]),
        fixeCdi: nombre(l[cp("fixe", "cdi")]),
        ikAlt: nombre(l[cp("ik", "alternance")]),
        ikCdi: nombre(l[cp("ik", "cdi")]),
        moisTreizieme: nombre(l[cp("mois du", "13")]),
      });
    }
  }
  reglages.honorairesTTC = true;

  // Mois passés (le mois en cours et les mois « prévus » ne sont pas repris)
  const mois: Reprise["mois"] = [];
  const contrats: { mois: string; contrat: string }[] = [];
  for (const l of t.slice(h + 1)) {
    if (!l) continue;
    const an = nombre(val(l, C.an));
    let n = nombre(val(l, C.num));
    if (n == null) n = MOIS_NOMS.indexOf(normal(val(l, C.mois))) + 1;
    if (!an || !n || n < 1 || n > 12) continue;
    const m = `${an}-${String(n).padStart(2, "0")}`;
    if (m >= courant) continue; // le mois en cours se pointe dans le Hub
    const fixe = nombre(val(l, C.fixe)) ?? 0;
    const commissions = nombre(val(l, C.manuelles)) ?? 0;
    const ik = nombre(val(l, C.ik)) ?? 0;
    if (!fixe && !commissions && !ik) continue; // avant le début du contrat
    const percu = nombre(val(l, C.percu));
    mois.push({ nature: "mois", mois: m, fixe, commissions: commissions || undefined, ik: ik || undefined, verse: percu, source: "excel" });
    contrats.push({ mois: m, contrat: val(l, C.contrat) || "Contrat" });
  }
  if (!mois.length) throw new ErreurLecture("L'onglet « Saisie mensuelle » ne contient aucun mois rempli jusqu'à aujourd'hui.");

  // Périodes du contrat : mois consécutifs sous le même intitulé ; fixe et IK de la dernière année connue
  const periodes: Periode[] = [];
  for (const c of contrats) {
    const der = periodes[periodes.length - 1];
    if (der && normal(der.intitule) === normal(c.contrat)) der.fin = c.mois;
    else periodes.push({ id: `p-${c.mois}`, intitule: c.contrat, debut: c.mois, fin: c.mois });
  }
  for (const p of periodes) {
    const cdi = normal(p.intitule).includes("cdi");
    const ans = [...parAn.entries()].filter(([an]) => an >= Number(p.debut.slice(0, 4)) && an <= Number(p.fin!.slice(0, 4))).sort((a, b) => b[0] - a[0]);
    const v = ans.map(([, x]) => (cdi ? { fixe: x.fixeCdi, ik: x.ikCdi } : { fixe: x.fixeAlt, ik: x.ikAlt })).find((x) => x.fixe);
    const dernier = mois.filter((m) => m.mois >= p.debut && m.mois <= p.fin! && !m.mois.endsWith("-12")).pop();
    p.fixe = v?.fixe ?? dernier?.fixe;
    p.ik = v?.ik ?? dernier?.ik;
    p.treizieme = cdi && ans.some(([, x]) => x.moisTreizieme === 12);
  }
  const derniere = periodes[periodes.length - 1];
  if (derniere) delete derniere.fin; // la période en cours continue

  // Dossiers (honoraires affectés à un mois)
  const ventes: Reprise["ventes"] = [];
  const ho = feuille(f, "honoraires");
  const hh = ho ? trouverEntete(ho, ["type", "ma commission"]) : -1;
  if (ho && hh >= 0) {
    const eh = (ho[hh] ?? []).map(normal);
    const ch = (...d: string[]) => eh.findIndex((c) => d.some((x) => c.startsWith(x)));
    const H = { date: ch("date"), an: ch("annee"), type: ch("type"), ref: ch("bien"), montant: ch("montant"), commission: ch("ma commission"), mois: ch("mois") };
    for (const l of ho.slice(hh + 1)) {
      if (!l) continue;
      const commission = nombre(val(l, H.commission));
      const type = TYPES.find(([re]) => re.test(normal(val(l, H.type))))?.[1];
      if (!commission || !type) continue;
      const an = nombre(val(l, H.an));
      const n = nombre(val(l, H.mois)) ?? 0;
      const moisPaie = an && n >= 1 && n <= 12 ? `${an}-${String(n).padStart(2, "0")}` : undefined;
      const ref = val(l, H.ref);
      const date = dateExcel(val(l, H.date));
      ventes.push({
        nature: "vente",
        type,
        libelle: ref || `${type === "vente" ? "Vente" : type === "location" ? "Location" : "Gestion"}${moisPaie ? ` de ${moisPaie.slice(5)}/${moisPaie.slice(0, 4)}` : ""}`,
        honoraires: nombre(val(l, H.montant)),
        // En attente : la date n'est pas celle de l'acte, le prévisionnel l'estime
        dateActe: moisPaie ? date : undefined,
        dateOffre: moisPaie ? undefined : date,
        moisPaie,
        statut: moisPaie ? "acte" : "offre",
        partage: 1,
        commission,
        source: "excel",
        cle: `revenus:${type}|${normal(ref)}|${val(l, H.montant)}|${date ?? ""}`,
      });
    }
  }
  return { genre: "revenus", ventes, mois, periodes, reglages, objectifs: {}, ignorees: 0 };
}


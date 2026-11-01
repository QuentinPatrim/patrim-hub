/* ============================================================
   Gestion : dossier de relocation d'un logement, du préavis du
   locataire sortant à la restitution de son dépôt de garantie.
   Suit le processus interne de l'agence (10 étapes) et sert de
   « liste loc » commune à l'équipe. ICS reste le logiciel de
   gestion : le Hub prépare ce qu'il faut y recopier.
   Le dossier est rangé sur le bien (bien.location.relocation),
   donc visible de toute l'équipe comme les biens à louer.
   ============================================================ */

import type { Bien, Rdv } from "@/lib/types";
import type { Tone } from "@/lib/format";
import { locationDe, type BienLocation, type InfosLocation } from "@/components/location/bienLocation";
import type { BienActes } from "@/components/documents/archive";

export type EtapeId = "preavis" | "diags" | "liste" | "pub" | "visites" | "dossier" | "bail" | "edl" | "ics" | "caution";
export type Garantie = "gli" | "visale" | "goodloc" | "garant" | "autre";
export type Pub = "a_faire" | "prete" | "en_ligne";

export interface Retenue {
  libelle: string;
  montant: number;
}

export interface Relocation {
  /** Date d'ouverture du dossier (AAAA-MM-JJ). */
  ouverte: string;
  /** Colonne « ETAT » de la liste loc, en texte libre (ce que l'équipe lit en premier). */
  etat?: string;
  /** Préavis du locataire sortant : réception de la lettre, durée, date de sortie (« Vacant le »). */
  preavis?: { recuLe?: string; duree?: 1 | 3; lrar?: boolean };
  sortie?: string;
  /** Logement déjà vide. */
  vacant?: boolean;
  sortant?: { nom?: string; tel?: string; email?: string };
  /** Propriétaire tel qu'écrit dans la liste, quand il n'a pas de fiche dans le Hub. */
  proprietaire?: string;
  dpeOk?: boolean;
  relanceDpe?: string;
  gli?: boolean;
  pub?: Pub;
  /** Loyer indiqué dans la liste loc (colonne « Prix »). */
  loyerListe?: number;
  etageTexte?: string;
  infos?: string;
  disponibilites?: string;
  prospects?: string;
  dossier?: { garantie?: Garantie; par?: string; valideLe?: string; immoaccess?: string };
  edls?: string;
  edle?: string;
  icsLe?: string;
  /** Restitution du dépôt de garantie du locataire sortant. */
  caution?: { montant?: number; conforme?: boolean; retenues?: Retenue[]; restitueLe?: string };
  /** Étapes cochées à la main (date). */
  etapes?: Partial<Record<EtapeId, string>>;
  fermeeLe?: string;
  /** Dernière mise à jour depuis la liste loc. */
  importeLe?: string;
}

export type InfosRelocation = InfosLocation & { relocation?: Relocation };
export const relocationDe = (b: Bien) => (locationDe(b) as InfosRelocation | undefined)?.relocation;

export const GARANTIES: { v: Garantie; label: string }[] = [
  { v: "gli", label: "GLI (Immoaccess)" },
  { v: "visale", label: "Visale" },
  { v: "goodloc", label: "GoodLoc" },
  { v: "garant", label: "Garant (acte de cautionnement)" },
  { v: "autre", label: "Autre" },
];
export const PUBS: { v: Pub; label: string }[] = [
  { v: "a_faire", label: "Pub à faire" },
  { v: "prete", label: "Pub prête" },
  { v: "en_ligne", label: "En ligne sur LocNet" },
];

export const ETAPES: { id: EtapeId; label: string; detail: string }[] = [
  { id: "preavis", label: "Préavis enregistré sur ICS", detail: "Lettre recommandée reçue, date de sortie calculée." },
  { id: "diags", label: "Diagnostics vérifiés", detail: "Sur ICS : si un diagnostic obligatoire manque, on le commande." },
  { id: "liste", label: "Sur la liste loc", detail: "DPE et GLI cochés." },
  { id: "pub", label: "Annonce en ligne sur LocNet", detail: "Créée et diffusée par ICS." },
  { id: "visites", label: "Prospects et visites", detail: "Prévenir le locataire en place avant chaque visite." },
  { id: "dossier", label: "Dossier validé + Immoaccess GLI", detail: "Fiche de renseignements, pièces, garantie." },
  { id: "bail", label: "Bail et acte de cautionnement", detail: "Signés sur ICSIGN." },
  { id: "edl", label: "EDL de sortie et d'entrée", detail: "Faits sur EDLV2." },
  { id: "ics", label: "Dossier enregistré sur ICS", detail: "Fiche de renseignements et indice (IRL de référence)." },
  { id: "caution", label: "Dépôt de garantie restitué", detail: "Au locataire sortant, dans le délai légal." },
];

/* ---------- Dates ---------- */

const pad = (n: number) => String(n).padStart(2, "0");
export function ajouterMois(ymd: string, n: number): string {
  const [a, m, j] = ymd.split("-").map(Number);
  const cible = new Date(Date.UTC(a, m - 1 + n, 1));
  const fin = new Date(Date.UTC(cible.getUTCFullYear(), cible.getUTCMonth() + 1, 0)).getUTCDate();
  return `${cible.getUTCFullYear()}-${pad(cible.getUTCMonth() + 1)}-${pad(Math.min(j, fin))}`;
}
export const jourJ = (ymd: string) => ymd.split("-").reverse().join("/");
export function joursEntre(de: string, a: string) {
  return Math.round((Date.parse(`${a}T12:00:00Z`) - Date.parse(`${de}T12:00:00Z`)) / 86400000);
}

/** Date de sortie : le préavis court à compter de la réception de la lettre (Toulouse, zone tendue : 1 mois). */
export const dateSortie = (recuLe: string, duree: 1 | 3 = 1) => ajouterMois(recuLe, duree);

/* ---------- Restitution du dépôt de garantie (loi du 6 juillet 1989, art. 22) ---------- */

export interface EcheanceCaution {
  /** Date limite de restitution. */
  limite: string;
  /** Délai retenu : 1 mois si l'état des lieux de sortie est conforme, 2 mois sinon. */
  mois: 1 | 2;
  /** Jours restants (négatif : en retard). */
  reste: number;
  /** Majoration due en cas de retard : 10 % du loyer mensuel hors charges par mois commencé. */
  majoration?: number;
}

export function echeanceCaution(r: Relocation, loyerHC: number | undefined, auj: string): EcheanceCaution | undefined {
  if (!r.edls || r.caution?.restitueLe) return undefined;
  const mois: 1 | 2 = r.caution?.conforme === false ? 2 : 1;
  const limite = ajouterMois(r.edls, mois);
  const reste = joursEntre(auj, limite);
  let majoration: number | undefined;
  if (reste < 0 && loyerHC) {
    let n = 0;
    let d = limite;
    while (d < auj) {
      n++;
      d = ajouterMois(limite, n);
    }
    majoration = Math.round(loyerHC * 0.1 * n * 100) / 100;
  }
  return { limite, mois, reste, majoration };
}

export const totalRetenues = (r: Relocation) => (r.caution?.retenues ?? []).reduce((s, x) => s + (x.montant || 0), 0);

/* ---------- Avancement ---------- */

const bailSigneDepuis = (b: Bien, depuis: string) =>
  ((b as BienActes).actes ?? []).some((a) => a.kind === "bail" && a.statut === "signe" && (a.maj ?? "").slice(0, 10) >= depuis);

/** Étapes faites : cochées à la main, ou déduites des informations du dossier. */
export function etapesFaites(b: Bien, r: Relocation, rdvs: Rdv[], auj: string): Set<EtapeId> {
  const f = new Set<EtapeId>(Object.keys(r.etapes ?? {}) as EtapeId[]);
  if (r.preavis?.recuLe || r.sortie || r.vacant) f.add("preavis");
  if (r.dpeOk) f.add("diags");
  if (r.dpeOk !== undefined && r.gli !== undefined) f.add("liste");
  if (r.pub === "en_ligne") f.add("pub");
  if (rdvs.some((x) => x.bienId === b.id && x.type === "visite" && x.statut !== "annule" && x.debut.slice(0, 10) >= r.ouverte)) f.add("visites");
  if (r.dossier?.valideLe) f.add("dossier");
  if (bailSigneDepuis(b, r.ouverte)) f.add("bail");
  if (r.edls && r.edle && r.edls <= auj && r.edle <= auj) f.add("edl");
  if (r.icsLe) f.add("ics");
  if (r.caution?.restitueLe) f.add("caution");
  return f;
}

export const prochaineEtape = (faites: Set<EtapeId>) => ETAPES.find((e) => !faites.has(e.id));

/** Où en est le logement, en une étiquette. */
export function situation(r: Relocation, auj: string): { label: string; tone: Tone } {
  if (r.fermeeLe) return { label: "Dossier fermé", tone: "neutral" };
  if (r.vacant || (r.sortie && r.sortie <= auj)) return { label: "Vacant", tone: "danger" };
  if (r.sortie) return { label: `Libre le ${jourJ(r.sortie)}`, tone: "warn" };
  return { label: "Préavis", tone: "warn" };
}

/** Logements avec un dossier de relocation (ouvert ou fermé). */
export const biensEnRelocation = (biens: Bien[]) => biens.filter((b) => !!relocationDe(b));

/** Patch à enregistrer sur le bien. */
export function patchRelocation(b: Bien, r: Relocation | undefined, extra?: Partial<InfosLocation>): Partial<Bien> {
  const loc = (locationDe(b) ?? { statut: "a_louer" }) as InfosRelocation;
  return { location: { ...loc, ...extra, relocation: r } } as Partial<BienLocation>;
}

/* ============================================================
   Import de la « LISTE LOCATIONS » (Google Sheets, onglet
   « En publicité ») : export CSV / TSV ou copier-coller. Tout se
   fait sur l'appareil ; rien n'est envoyé ailleurs que dans le Hub.
   ============================================================ */

export interface LigneListe {
  section?: string;
  etat?: string;
  dpe?: boolean;
  relanceDpe?: string;
  gli?: boolean;
  typeTexte: string;
  pieces?: number;
  meuble?: boolean;
  typeBien: Bien["type"];
  proprietaire?: string;
  adresseBrute: string;
  adresse: string;
  codePostal?: string;
  ville: string;
  quartier?: string;
  surface?: number;
  etage?: number;
  etageTexte?: string;
  loyer?: number;
  vacant: boolean;
  sortie?: string;
  infos?: string;
  sortant?: string;
  tel?: string;
  disponibilites?: string;
  prospects?: string;
}

/** Lecteur CSV/TSV : guillemets, retours à la ligne dans les cellules, séparateur deviné. */
export function lireTableau(texte: string): string[][] {
  const t = texte.replace(/^﻿/, "").replace(/\r\n?/g, "\n");
  const premiere = t.split("\n").find((l) => l.trim()) ?? "";
  const sep = (premiere.match(/\t/g)?.length ?? 0) > 0 ? "\t" : (premiere.match(/;/g)?.length ?? 0) > (premiere.match(/,/g)?.length ?? 0) ? ";" : ",";
  const lignes: string[][] = [];
  let ligne: string[] = [];
  let cell = "";
  let guil = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (guil) {
      if (c === '"' && t[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (c === '"') guil = false;
      else cell += c;
    } else if (c === '"' && cell === "") guil = true;
    else if (c === sep) {
      ligne.push(cell);
      cell = "";
    } else if (c === "\n") {
      ligne.push(cell);
      lignes.push(ligne);
      ligne = [];
      cell = "";
    } else cell += c;
  }
  if (cell || ligne.length) {
    ligne.push(cell);
    lignes.push(ligne);
  }
  return lignes;
}

export const sansAccent = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "");
const cleEntete = (s: string) => sansAccent(s).toLowerCase().replace(/[^a-z0-9²]/g, "");
const propre = (s?: string) => (s ?? "").replace(/\s+/g, " ").trim();

const COLONNES: Record<keyof Omit<LigneListe, "section" | "pieces" | "meuble" | "typeBien" | "adresse" | "codePostal" | "ville" | "vacant" | "sortie" | "etage" | "etageTexte" | "typeTexte" | "adresseBrute" | "surface" | "loyer" | "dpe" | "gli"> | "type" | "adr" | "m2" | "et" | "prix" | "vacantLe" | "dpeC" | "gliC", string[]> = {
  etat: ["etat"],
  dpeC: ["dpe"],
  relanceDpe: ["relancedpe"],
  gliC: ["gli"],
  type: ["typedelogement", "type"],
  proprietaire: ["proprietaires", "proprietaire"],
  adr: ["adresse"],
  quartier: ["quartier"],
  m2: ["m²", "m2", "surface"],
  et: ["et", "etage"],
  prix: ["prix", "loyer"],
  vacantLe: ["vacantle"],
  infos: ["infos"],
  sortant: ["nomdulocataire", "locataire"],
  tel: ["numerodetelephone", "telephone"],
  disponibilites: ["disponibilites"],
  prospects: ["prospects"],
};

const nombre = (s?: string) => {
  const v = (s ?? "").replace(/[^\d,.-]/g, "").replace(/\.(?=\d{3}\b)/g, "").replace(",", ".");
  const n = parseFloat(v);
  return Number.isFinite(n) && n > 0 ? n : undefined;
};
const booleen = (s?: string) => {
  const v = sansAccent(propre(s)).toLowerCase();
  if (["true", "vrai", "oui", "x", "1", "ok"].includes(v)) return true;
  if (["false", "faux", "non", "0"].includes(v)) return false;
  return undefined;
};
const dateFr = (s?: string) => {
  const m = propre(s).match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (!m) return undefined;
  const a = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${a}-${pad(+m[2])}-${pad(+m[1])}`;
};
/** « 07,50,69,70,69 » → « 07 50 69 70 69 » (plusieurs numéros : séparés par « / »). */
export function telListe(s?: string) {
  const nums = (s ?? "").match(/(?:\+33\s?|0)\d(?:[\s.,-]?\d{2}){4}/g);
  return nums?.map((n) => n.replace(/\D/g, "").replace(/^33/, "0").replace(/(\d{2})(?=\d)/g, "$1 ")).join(" / ");
}

function lireType(s: string): Pick<LigneListe, "pieces" | "meuble" | "typeBien"> {
  const v = sansAccent(s).toLowerCase();
  const p = v.match(/\b[tf]\s?(\d)/);
  const typeBien: Bien["type"] = /local|commerc|bureau/.test(v) ? "local" : /parking|garage|box/.test(v) ? "parking" : /maison|villa/.test(v) ? "maison" : "appartement";
  return { pieces: p ? +p[1] : /studio/.test(v) ? 1 : undefined, meuble: /meubl/.test(v) || undefined, typeBien };
}

function lireAdresse(s: string) {
  const brut = propre(s);
  const m = brut.match(/^(.*?)\s*\b(\d{5})\b\s*(.*)$/);
  if (!m) return { adresse: brut, ville: "Toulouse" };
  const ville = propre(m[3]).toLowerCase().replace(/(^|[\s-])\S/g, (x) => x.toUpperCase()) || "Toulouse";
  return { adresse: propre(m[1]), codePostal: m[2], ville };
}

/** Lit l'onglet « En publicité » de la liste loc. Les lignes de titre (« APPARTEMENT T1 ») servent de section. */
export function lireListe(texte: string): LigneListe[] {
  const t = lireTableau(texte);
  const iEntete = t.findIndex((l) => l.some((c) => cleEntete(c) === "etat") && l.some((c) => cleEntete(c).startsWith("adresse")));
  if (iEntete < 0) return [];
  const entete = t[iEntete].map(cleEntete);
  const col = (k: keyof typeof COLONNES) => entete.findIndex((h) => COLONNES[k].includes(h));
  const idx = Object.fromEntries((Object.keys(COLONNES) as (keyof typeof COLONNES)[]).map((k) => [k, col(k)])) as Record<keyof typeof COLONNES, number>;
  const lire = (l: string[], k: keyof typeof COLONNES) => (idx[k] >= 0 ? (l[idx[k]] ?? "") : "");

  const out: LigneListe[] = [];
  let section: string | undefined;
  for (const l of t.slice(iEntete + 1)) {
    const pleines = l.map(propre).filter(Boolean);
    if (!pleines.length) continue;
    const adr = propre(lire(l, "adr"));
    // Ligne de titre fusionnée : même texte partout, ou une seule cellule remplie
    if (!adr || new Set(pleines).size === 1) {
      if (new Set(pleines).size === 1 && pleines[0].length < 40) section = pleines[0];
      if (!adr) continue;
      if (new Set(pleines).size === 1) continue;
    }
    const typeTexte = propre(lire(l, "type")) || section || "";
    const vacantLe = propre(lire(l, "vacantLe"));
    const et = propre(lire(l, "et"));
    const etNum = /^rdc$/i.test(et) ? 0 : /^\d+$/.test(et) ? +et : undefined;
    out.push({
      section,
      etat: propre(lire(l, "etat")) || undefined,
      dpe: booleen(lire(l, "dpeC")),
      relanceDpe: propre(lire(l, "relanceDpe")) || undefined,
      gli: booleen(lire(l, "gliC")),
      typeTexte,
      ...lireType(typeTexte),
      proprietaire: propre(lire(l, "proprietaire")) || undefined,
      adresseBrute: adr,
      ...lireAdresse(adr),
      quartier: propre(lire(l, "quartier")) || undefined,
      surface: nombre(lire(l, "m2")),
      etage: etNum,
      etageTexte: etNum === undefined && et ? et : undefined,
      loyer: /\d/.test(lire(l, "prix")) && !/[a-z]{4,}/i.test(lire(l, "prix")) ? nombre(lire(l, "prix")) : undefined,
      infos: [propre(lire(l, "infos")), /[a-z]{4,}/i.test(lire(l, "prix")) ? propre(lire(l, "prix")) : ""].filter(Boolean).join(" · ") || undefined,
      vacant: /vacant/i.test(vacantLe),
      sortie: dateFr(vacantLe),
      sortant: lire(l, "sortant").split("\n").map(propre).filter(Boolean).join(" et ") || undefined,
      tel: telListe(lire(l, "tel")),
      disponibilites: propre(lire(l, "disponibilites")) || undefined,
      prospects: lire(l, "prospects").split("\n").map(propre).filter(Boolean).join("\n") || undefined,
    });
  }
  return out;
}

/* ---------- Rapprochement avec les biens du Hub ---------- */

const MOTS_INUTILES = /\b(appt|apt|appartement|porte|lot|bat|batiment|residence|res|etage|n°|no)\b\.?\s*[\w-]*/g;
export function cleAdresse(s: string) {
  return sansAccent(s)
    .toLowerCase()
    .replace(/\b\d{5}\b.*$/, "")
    .replace(MOTS_INUTILES, " ")
    .replace(/\b(bd)\b/g, "boulevard")
    .replace(/\b(av)\b/g, "avenue")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
const rue = (cle: string) => cle.replace(/^\d+\s*(bis|ter)?\s*/, "").trim();

/** Biens du Hub Location qui peuvent être ce logement, le plus probable en premier. */
export function candidats(l: LigneListe, biens: Bien[]): Bien[] {
  const cl = cleAdresse(l.adresseBrute);
  const r = rue(cl);
  if (!r) return [];
  const notes = biens
    .map((b) => {
      const cb = cleAdresse(b.adresse || "");
      if (!cb) return { b, n: 0 };
      let n = 0;
      if (cb === cl) n += 10;
      else if (rue(cb) && (rue(cb) === r || cl.includes(rue(cb)) || cb.includes(r))) n += 5;
      else return { b, n: 0 };
      if (l.surface && b.surface && Math.abs(l.surface - b.surface) <= 1.5) n += 3;
      if (l.pieces && b.pieces === l.pieces) n += 1;
      const ref = relocationDe(b);
      if (ref && ref.proprietaire && l.proprietaire && sansAccent(ref.proprietaire).toLowerCase() === sansAccent(l.proprietaire).toLowerCase()) n += 4;
      return { b, n };
    })
    .filter((x) => x.n >= 5)
    .sort((a, b) => b.n - a.n);
  return notes.map((x) => x.b);
}

/** Libellé de garantie et conseiller lus dans la colonne ETAT (« DOSSIER VISALE OK CLEMENT »). */
export function lireEtat(etat?: string): { pub?: Pub; dossier?: Relocation["dossier"] } {
  const v = sansAccent(etat ?? "").toLowerCase();
  if (!v) return {};
  if (/pub\s*a\s*faire/.test(v)) return { pub: "a_faire" };
  if (/pub\s*pret/.test(v)) return { pub: "prete" };
  const dossierOk = /(dossier|goodloc|visale|gli)[^]*\b(ok|valide)/.test(v) || /\b(ok|valide)\b[^]*(dossier)/.test(v);
  if (dossierOk) {
    const garantie: Garantie | undefined = /visale/.test(v) ? "visale" : /goodloc/.test(v) ? "goodloc" : /\bgli\b/.test(v) ? "gli" : undefined;
    const par = v.match(/\b(clement|sabri|julien|rebecca|vanessa|sandrine|quentin)\b/)?.[1];
    return { pub: "en_ligne", dossier: { garantie, par: par ? (par === "clement" ? "Clément" : par[0].toUpperCase() + par.slice(1)) : undefined } };
  }
  if (/visite/.test(v)) return { pub: "en_ligne" };
  return {};
}

/** Données de la liste loc fusionnées dans le dossier : ce qui est saisi dans le Hub (EDL, caution, ICS…) ne bouge pas. */
export function fusionner(avant: Relocation | undefined, l: LigneListe, auj: string): Relocation {
  const lu = lireEtat(l.etat);
  const r: Relocation = { ...(avant ?? { ouverte: auj }) };
  r.etat = l.etat;
  r.dpeOk = l.dpe ?? r.dpeOk;
  r.relanceDpe = l.relanceDpe;
  r.gli = l.gli ?? r.gli;
  r.proprietaire = l.proprietaire ?? r.proprietaire;
  r.loyerListe = l.loyer ?? r.loyerListe;
  r.etageTexte = l.etageTexte;
  r.infos = l.infos;
  r.disponibilites = l.disponibilites;
  r.prospects = l.prospects;
  r.vacant = l.vacant || undefined;
  if (l.sortie) r.sortie = l.sortie;
  if (l.sortant || l.tel) r.sortant = { ...r.sortant, nom: l.sortant ?? r.sortant?.nom, tel: l.tel ?? r.sortant?.tel };
  if (lu.pub && r.pub !== "en_ligne") r.pub = lu.pub;
  if (lu.dossier && !r.dossier?.valideLe) r.dossier = { ...r.dossier, ...lu.dossier, garantie: r.dossier?.garantie ?? lu.dossier.garantie, valideLe: auj };
  r.importeLe = auj;
  return r;
}

/** Titre d'un bien créé depuis la liste loc (« T2 meublé · Carmes »). */
export function titreDepuisLigne(l: LigneListe) {
  const base = l.typeBien === "local" ? "Local commercial" : l.pieces ? `T${l.pieces}${l.meuble ? " meublé" : ""}` : propre(l.typeTexte) || "Logement";
  return [base, l.quartier || l.ville].filter(Boolean).join(" · ");
}

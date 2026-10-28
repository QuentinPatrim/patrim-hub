"use client";

/* Lecteur de documents : envoie un PDF ou des photos de pages à /api/documents/lire,
   puis transforme la lecture en modifications de la fiche, à cocher une par une.
   Rien n'est reporté sans que le conseiller l'ait validé. */

import { authHeaders, fileToBase64Jpeg } from "@/lib/ai";
import { supabase } from "@/lib/supabase";
import { DIAGS, diagnosticsDe, type CleDiag, type Diagnostics } from "@/components/diagnostics/diagnostics";
import { dossierDe, type DossierBien } from "@/components/biens/dossier";
import { eur, m2 } from "@/lib/format";
import type { Bien } from "@/lib/types";

export type TypeDoc = "pv_ag" | "diagnostics" | "titre" | "charges" | "taxe_fonciere" | "reglement" | "pre_etat_date" | "autre";

export const TYPE_DOC: Record<TypeDoc, string> = {
  pv_ag: "PV d'assemblée générale",
  diagnostics: "Diagnostics",
  titre: "Titre de propriété",
  charges: "Charges de copropriété",
  taxe_fonciere: "Taxe foncière",
  reglement: "Règlement de copropriété",
  pre_etat_date: "Pré-état daté",
  autre: "Document",
};

type Fiche = Partial<Pick<Bien, "surface" | "dpe" | "ges" | "chargesAnnuelles" | "taxeFonciere" | "lotsCopro" | "anneeConstruction" | "chauffage">>;
type DossierLu = Partial<Pick<DossierBien, "syndic" | "copropriete" | "lots" | "charges" | "taxeFonciere" | "dpe" | "ddt" | "occupation">>;

export interface Lecture {
  type: TypeDoc;
  titre?: string;
  date?: string;
  resume?: string;
  fiche?: Fiche;
  diagnostics?: Partial<Record<CleDiag, { date?: string; presence?: boolean }>>;
  dossier?: DossierLu;
  travaux?: { objet: string; montant?: number; quotePart?: number; echeance?: string; statut?: string }[];
  points?: { niveau: "alerte" | "info"; texte: string }[];
  questions?: string[];
}

/** Taille au-delà de laquelle un PDF passe par le dépôt temporaire (limite des requêtes Vercel). */
const DIRECT_MAX = 3_000_000;

/** Lit un PDF ou des photos de pages. */
export async function lireDocument(fichiers: File[], bien: Bien): Promise<Lecture> {
  const contexte = {
    type: bien.type,
    surface: bien.surface,
    dpe: bien.dpe,
    ges: bien.ges,
    chargesAnnuelles: bien.chargesAnnuelles,
    taxeFonciere: bien.taxeFonciere,
    lotsCopro: bien.lotsCopro,
    anneeConstruction: bien.anneeConstruction,
    lots: dossierDe(bien)?.lots,
  };
  const pdf = fichiers.find((f) => f.type === "application/pdf" || /\.pdf$/i.test(f.name));
  const corps: Record<string, unknown> = { bien: contexte, nom: (pdf ?? fichiers[0])?.name };
  if (pdf) {
    if (pdf.size > 32_000_000) throw new Error("PDF trop lourd (32 Mo au plus). Garde seulement les pages utiles ou prends-les en photo.");
    if (pdf.size <= DIRECT_MAX) corps.pdf = await enBase64(pdf);
    else {
      if (!supabase) throw new Error("PDF trop lourd pour être lu sans connexion au Hub : prends les pages utiles en photo.");
      const d = await appel({ depot: true });
      const { error } = await supabase.storage.from(d.seau).uploadToSignedUrl(d.chemin, d.token, pdf, { contentType: "application/pdf" });
      if (error) throw new Error("Envoi du PDF impossible : " + error.message);
      corps.chemin = d.chemin;
    }
  } else {
    corps.images = await Promise.all(fichiers.slice(0, 12).map(async (f) => {
      const { mediaType, data } = await fileToBase64Jpeg(f, 1600);
      return { mediaType, data };
    }));
  }
  const r = await appel(corps);
  return r.lecture as Lecture;
}

async function appel(corps: Record<string, unknown>) {
  const r = await fetch("/api/documents/lire", { method: "POST", headers: await authHeaders(), body: JSON.stringify(corps) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || (r.status === 413 ? "Fichier trop lourd." : "Le lecteur n'a pas répondu."));
  return d;
}

function enBase64(f: Blob): Promise<string> {
  return new Promise((ok, ko) => {
    const lr = new FileReader();
    lr.onload = () => ok(String(lr.result).split(",")[1] ?? "");
    lr.onerror = () => ko(new Error("Fichier illisible."));
    lr.readAsDataURL(f);
  });
}

/* ---------- propositions de mise à jour ---------- */

export interface Proposition {
  cle: string;
  groupe: "Fiche" | "Diagnostics" | "Dossier" | "À vérifier";
  label: string;
  avant?: string;
  apres: string;
  /** Cochée d'office. */
  conseillee: boolean;
}

const LABEL_FICHE: Record<keyof Fiche, [string, (v: never) => string]> = {
  surface: ["Surface", (v: number) => m2(v)],
  dpe: ["DPE", (v: string) => `Classe ${v}`],
  ges: ["GES", (v: string) => `Classe ${v}`],
  chargesAnnuelles: ["Charges annuelles", (v: number) => eur(v)],
  taxeFonciere: ["Taxe foncière", (v: number) => eur(v)],
  lotsCopro: ["Lots de la copropriété", (v: number) => String(v)],
  anneeConstruction: ["Année de construction", (v: number) => String(v)],
  chauffage: ["Chauffage", (v: string) => v],
};

const LABEL_DOSSIER: Record<keyof DossierLu, string> = {
  syndic: "Syndic",
  copropriete: "Copropriété",
  lots: "Lots",
  charges: "Détail des charges",
  taxeFonciere: "Détail taxe foncière",
  dpe: "Détail DPE",
  ddt: "Dossier de diagnostics",
  occupation: "Occupation",
};

const dateFr = (d?: string) => (d && /^\d{4}-\d{2}-\d{2}/.test(d) ? d.slice(0, 10).split("-").reverse().join("/") : d ?? "");
const valide = (v: unknown) => v !== undefined && v !== null && v !== "" && !(typeof v === "number" && isNaN(v));

/** Texte d'un point « à vérifier », préfixé par le document d'où il vient. */
const point = (l: Lecture, texte: string) => `${l.titre || TYPE_DOC[l.type] || "Document"} : ${texte}`;

export function propositions(b: Bien, l: Lecture): Proposition[] {
  const out: Proposition[] = [];
  const fiche = l.fiche ?? {};
  for (const k of Object.keys(LABEL_FICHE) as (keyof Fiche)[]) {
    const v = fiche[k];
    if (!valide(v) || String(v) === String(b[k] ?? "")) continue;
    const [label, f] = LABEL_FICHE[k];
    out.push({ cle: `fiche.${k}`, groupe: "Fiche", label, avant: valide(b[k]) ? f(b[k] as never) : undefined, apres: f(v as never), conseillee: !valide(b[k]) });
  }
  const diags = diagnosticsDe(b);
  for (const r of DIAGS) {
    const d = l.diagnostics?.[r.cle];
    if (!d?.date || !/^\d{4}-\d{2}-\d{2}$/.test(d.date)) continue;
    if (d.date === diags[r.cle]?.date && (d.presence === undefined || d.presence === diags[r.cle]?.presence)) continue;
    const pres = r.resultat && d.presence !== undefined ? (d.presence ? " · présence relevée" : " · absence") : "";
    out.push({ cle: `diag.${r.cle}`, groupe: "Diagnostics", label: r.label, avant: diags[r.cle]?.date ? `Rapport du ${dateFr(diags[r.cle]!.date)}` : undefined, apres: `Rapport du ${dateFr(d.date)}${pres}`, conseillee: !diags[r.cle]?.date || d.date > diags[r.cle]!.date! });
  }
  const dossier = dossierDe(b) ?? {};
  for (const k of Object.keys(LABEL_DOSSIER) as (keyof DossierLu)[]) {
    const v = l.dossier?.[k];
    if (!valide(v) || v === dossier[k]) continue;
    out.push({ cle: `dossier.${k}`, groupe: "Dossier", label: LABEL_DOSSIER[k], avant: dossier[k] || undefined, apres: String(v), conseillee: !dossier[k] });
  }
  const deja = new Set(dossier.aVerifier ?? []);
  (l.travaux ?? []).forEach((t, i) => {
    const texte = point(l, `travaux ${t.statut ?? ""} : ${t.objet}${t.montant ? `, ${eur(t.montant)} au total` : ""}${t.quotePart ? `, quote-part du lot ${eur(t.quotePart)}` : ""}${t.echeance ? `, échéance ${dateFr(t.echeance)}` : ""}`.replace(/\s+:/, " :").replace(/ {2,}/g, " "));
    if (!deja.has(texte)) out.push({ cle: `travaux.${i}`, groupe: "À vérifier", label: "Travaux", apres: texte, conseillee: t.statut !== "refusé" });
  });
  (l.points ?? []).forEach((p, i) => {
    const texte = point(l, p.texte);
    if (!deja.has(texte)) out.push({ cle: `point.${i}`, groupe: "À vérifier", label: p.niveau === "alerte" ? "Point d'attention" : "À savoir", apres: texte, conseillee: p.niveau === "alerte" });
  });
  return out;
}

/** Modifications de la fiche pour les propositions retenues, plus la trace de la lecture dans l'historique du dossier. */
export function patchLecture(b: Bien, l: Lecture, retenues: Set<string>, auj: string): Partial<Bien> {
  const patch: Record<string, unknown> = {};
  const fiche = l.fiche ?? {};
  for (const k of Object.keys(LABEL_FICHE) as (keyof Fiche)[]) if (retenues.has(`fiche.${k}`)) patch[k] = fiche[k];
  const diags: Diagnostics = { ...diagnosticsDe(b) };
  let diagsTouches = false;
  for (const r of DIAGS) {
    const d = l.diagnostics?.[r.cle];
    if (!d || !retenues.has(`diag.${r.cle}`)) continue;
    diags[r.cle] = { ...diags[r.cle], date: d.date, concerne: true, ...(r.resultat && d.presence !== undefined ? { presence: d.presence } : {}) };
    diagsTouches = true;
  }
  if (diagsTouches) patch.diagnostics = diags;
  const ancien = dossierDe(b) ?? {};
  const dossier: DossierBien = { ...ancien };
  for (const k of Object.keys(LABEL_DOSSIER) as (keyof DossierLu)[]) if (retenues.has(`dossier.${k}`)) dossier[k] = l.dossier?.[k];
  const aVerifier = [...(ancien.aVerifier ?? [])];
  for (const p of propositions(b, l)) if (p.groupe === "À vérifier" && retenues.has(p.cle)) aVerifier.push(p.apres);
  dossier.aVerifier = aVerifier;
  dossier.evenements = [...(ancien.evenements ?? []), `${dateFr(auj)} : lecture de « ${l.titre || TYPE_DOC[l.type]} » (${retenues.size} élément${retenues.size > 1 ? "s" : ""} repris)`];
  dossier.maj = auj;
  patch.dossier = dossier;
  return patch as Partial<Bien>;
}

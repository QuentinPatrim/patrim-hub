import type { Bien, BienStatut, MandatType } from "@/lib/types";

/* Registre des mandats : état de chaque mandat (en cours, bientôt fini, expiré, dates inconnues)
   et contrôles (numéro en double, bien en vente sans mandat valable).
   Fonctions pures : utilisées par la page Registre, la page « À régler » et l'agent de nuit. */

/** Biens dont le mandat est en cours (affichés dans l'onglet « En cours »). */
export const STATUTS_ACTIFS: BienStatut[] = ["en_vente", "mandat_signe", "sous_offre", "compromis"];
/** Biens pour lesquels un mandat valable reste indispensable (compromis signé : la vente est engagée). */
const STATUTS_A_COUVRIR: BienStatut[] = ["en_vente", "mandat_signe", "sous_offre"];

export const TYPE_MANDAT: Record<MandatType, string> = { simple: "Simple", exclusif: "Exclusif", semi_exclusif: "Semi-exclusif" };

export type EtatMandat = "expire" | "bientot" | "en_cours" | "sans_fin" | "sans_numero";

export const ETAT_MANDAT: Record<EtatMandat, { label: string; tone: "ok" | "warn" | "danger" | "neutral" }> = {
  en_cours: { label: "En cours", tone: "ok" },
  bientot: { label: "Fin proche", tone: "warn" },
  expire: { label: "Expiré", tone: "danger" },
  sans_fin: { label: "Fin inconnue", tone: "neutral" },
  sans_numero: { label: "Sans numéro", tone: "neutral" },
};

export interface LigneRegistre {
  bien: Bien;
  numero?: string;
  etat: EtatMandat;
  /** Jours avant la fin (en cours, fin proche) ou depuis la fin (expiré). */
  jours?: number;
  doublon: boolean;
  actif: boolean;
}

export interface AlerteMandat {
  code: "doublon" | "expire" | "bientot" | "sans_numero" | "sans_fin";
  niveau: "danger" | "warn";
  titre: string;
  detail?: string;
  bienIds: string[];
}

const jourParis = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Paris" });
/** Nombre de jours de a à b (dates AAAA-MM-JJ). */
const ecart = (a: string, b: string) => Math.round((Date.parse(b.slice(0, 10) + "T12:00:00Z") - Date.parse(a.slice(0, 10) + "T12:00:00Z")) / 86400000);
export const nomBien = (b: Bien) => b.titre || b.adresse || "Bien sans titre";
/** Date d'un mandat, avec l'année (un mandat court souvent sur deux ans). */
export const dateMandat = (iso?: string) =>
  iso ? new Date(iso.slice(0, 10) + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Paris" }) : "";
const ordreNumero = (n?: string) => (n && /^\d+$/.test(n) ? Number(n) : -1);
const pluriel = (n: number, mot: string) => `${n} ${mot}${n > 1 ? "s" : ""}`;

export function registre(biens: Bien[], now = new Date()): LigneRegistre[] {
  const jour = jourParis(now);
  const parNumero = new Map<string, number>();
  biens.forEach((b) => {
    const n = b.mandat?.numero?.trim();
    if (n) parNumero.set(n, (parNumero.get(n) ?? 0) + 1);
  });
  return biens
    .filter((b) => b.mandat?.numero?.trim() || b.mandat?.debut || STATUTS_ACTIFS.includes(b.statut))
    .map((b) => {
      const numero = b.mandat?.numero?.trim() || undefined;
      const fin = b.mandat?.fin;
      let etat: EtatMandat;
      let jours: number | undefined;
      if (fin) {
        const reste = ecart(jour, fin);
        etat = reste < 0 ? "expire" : reste <= 30 ? "bientot" : "en_cours";
        jours = Math.abs(reste);
      } else etat = numero ? "sans_fin" : "sans_numero";
      return { bien: b, numero, etat, jours, doublon: !!numero && (parNumero.get(numero) ?? 0) > 1, actif: STATUTS_ACTIFS.includes(b.statut) };
    })
    .sort((x, y) => ordreNumero(y.numero) - ordreNumero(x.numero) || nomBien(x.bien).localeCompare(nomBien(y.bien)));
}

/** Ce qui doit être réglé dans le registre, du plus grave au moins grave. */
export function alertesMandats(lignes: LigneRegistre[]): AlerteMandat[] {
  const out: AlerteMandat[] = [];
  const doublons = new Map<string, LigneRegistre[]>();
  lignes.filter((l) => l.doublon && l.numero).forEach((l) => doublons.set(l.numero!, [...(doublons.get(l.numero!) ?? []), l]));
  for (const [n, ls] of doublons)
    out.push({
      code: "doublon",
      niveau: "danger",
      titre: `Le n°${n} figure sur ${ls.length} mandats`,
      detail: `${ls.map((l) => nomBien(l.bien)).join(" ; ")}. Vérifier le registre des mandats de l'agence.`,
      bienIds: ls.map((l) => l.bien.id),
    });

  const aCouvrir = lignes.filter((l) => STATUTS_A_COUVRIR.includes(l.bien.statut));
  for (const l of aCouvrir.filter((l) => l.etat === "expire"))
    out.push({
      code: "expire",
      niveau: "danger",
      titre: `Mandat ${l.numero ? `n°${l.numero} ` : ""}expiré depuis ${pluriel(l.jours ?? 0, "jour")} : ${nomBien(l.bien)}`,
      detail:
        l.bien.statut === "sous_offre"
          ? "Le bien est sous offre : vérifier qu'un mandat valable (ou un avenant de prolongation) couvre la vente."
          : "Le bien est toujours en vente : faire signer un nouveau mandat (ou retrouver l'avenant de prolongation) avant toute offre.",
      bienIds: [l.bien.id],
    });
  for (const l of aCouvrir.filter((l) => l.etat === "bientot"))
    out.push({
      code: "bientot",
      niveau: "warn",
      titre: l.jours ? `Fin du mandat ${l.numero ? `n°${l.numero} ` : ""}dans ${pluriel(l.jours, "jour")} : ${nomBien(l.bien)}` : `Le mandat ${l.numero ? `n°${l.numero} ` : ""}finit aujourd'hui : ${nomBien(l.bien)}`,
      detail: "Préparer le renouvellement avec le vendeur.",
      bienIds: [l.bien.id],
    });
  const sansNumero = aCouvrir.filter((l) => !l.numero);
  if (sansNumero.length)
    out.push({
      code: "sans_numero",
      niveau: "warn",
      titre: `${pluriel(sansNumero.length, "bien")} en cours sans numéro de mandat`,
      detail: sansNumero.map((l) => nomBien(l.bien)).join(" ; "),
      bienIds: sansNumero.map((l) => l.bien.id),
    });
  const sansFin = aCouvrir.filter((l) => l.numero && l.etat === "sans_fin");
  if (sansFin.length)
    out.push({
      code: "sans_fin",
      niveau: "warn",
      titre: `${pluriel(sansFin.length, "mandat")} sans date de fin`,
      detail: sansFin.map((l) => `n°${l.numero} ${nomBien(l.bien)}`).join(" ; "),
      bienIds: sansFin.map((l) => l.bien.id),
    });
  return out;
}

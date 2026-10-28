"use client";

/* Radar vendeurs : signaux publics (renvoyés par /api/radar) et signaux
   du fichier PATRIM (estimations sans suite, mandats perdus, bailleurs
   dont le logement devient une passoire), plus le courrier « Au
   propriétaire » adapté à chaque cas. */

import { authHeaders } from "@/lib/ai";
import { AGENCE } from "@/components/documents/charte";
import { nomConseiller } from "@/lib/equipe";
import type { Bien, Estimation } from "@/lib/types";
import { cleAdresse } from "./suivi";

export type Source = "dpe" | "audit" | "bodacc" | "fichier";
export interface Signal {
  id: string;
  source: Source;
  date: string;
  adresse: string;
  codePostal?: string;
  ville?: string;
  lat?: number;
  lon?: number;
  titre: string;
  detail?: string;
  classe?: string;
  type?: string;
  surface?: number;
  lien?: string;
  /** Fiche du Hub liée (estimation, bien). */
  page?: string;
  score: number;
}

export const SOURCE: Record<Source, { label: string; tone: "danger" | "warn" | "ok" | "brand" | "info" | "neutral" }> = {
  audit: { label: "Audit énergétique", tone: "danger" },
  dpe: { label: "DPE récent", tone: "warn" },
  bodacc: { label: "Société (BODACC)", tone: "brand" },
  fichier: { label: "Mon fichier", tone: "info" },
};

export const CP_TOULOUSE = ["31000", "31100", "31200", "31300", "31400", "31500"];

export async function chargerSignaux(codesPostaux: string[], jours: number) {
  const r = await fetch("/api/radar", { method: "POST", headers: await authHeaders(), body: JSON.stringify({ codesPostaux, jours }) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(d.error || "Le radar n'a pas répondu.");
  return d as { signaux: Signal[]; sources: Record<string, number | string> };
}

const jours = (iso: string) => Math.floor((Date.now() - new Date(iso).getTime()) / 86400000);

/** Signaux tirés du Hub : estimations restées sans mandat, biens retirés, bailleurs en passoire. */
export function signauxFichier(biens: Bien[], estimations: Estimation[]): Signal[] {
  const out: Signal[] = [];
  for (const e of estimations) {
    if (e.bienId || e.statut === "mandat" || e.statut === "a_faire" || jours(e.updatedAt) < 30 || jours(e.updatedAt) > 730) continue;
    out.push({
      id: `estim:${e.id}`,
      source: "fichier",
      date: e.updatedAt.slice(0, 10),
      adresse: e.adresse,
      codePostal: e.codePostal,
      ville: e.ville,
      lat: e.lat,
      lon: e.lon,
      titre: `Estimation sans mandat (${e.type})`,
      detail: `Avis de valeur ${e.statut === "perdue" ? "perdu" : "envoyé"} il y a ${Math.round(jours(e.updatedAt) / 30)} mois : reprendre des nouvelles`,
      page: `/estimations/${e.id}`,
      score: e.statut === "perdue" ? 3 : 4,
    });
  }
  for (const b of biens) {
    const location = (b as Bien & { transaction?: string }).transaction === "location";
    if (location && (b.dpe === "F" || b.dpe === "G")) {
      out.push({
        id: `bailleur:${b.id}`,
        source: "fichier",
        date: (b.updatedAt ?? b.createdAt).slice(0, 10),
        adresse: [b.adresse, b.codePostal, b.ville].filter(Boolean).join(" "),
        titre: `Bailleur avec un logement classé ${b.dpe}`,
        detail: b.dpe === "G" ? "Classe G : plus de nouveau bail possible depuis 2025. Proposer travaux ou vente" : "Classe F : location interdite pour les nouveaux baux en 2028. Proposer un arbitrage",
        page: `/biens/${b.id}`,
        score: b.dpe === "G" ? 5 : 4,
      });
      continue;
    }
    if (location) continue;
    if (b.statut === "retire" && jours(b.updatedAt) <= 540)
      out.push({
        id: `retire:${b.id}`,
        source: "fichier",
        date: b.updatedAt.slice(0, 10),
        adresse: [b.adresse, b.codePostal, b.ville].filter(Boolean).join(" "),
        titre: "Mandat retiré",
        detail: "Le vendeur n'a peut-être pas vendu : reprendre contact",
        page: `/biens/${b.id}`,
        score: 3,
      });
  }
  return out;
}

/** Retire les adresses déjà en mandat chez nous (inutile de les prospecter). */
export function horsPortefeuille(signaux: Signal[], biens: Bien[]) {
  const nos = new Set(biens.filter((b) => b.statut !== "retire" && b.statut !== "vendu").map((b) => cleAdresse(b.adresse)));
  return signaux.filter((s) => s.source === "fichier" || s.source === "bodacc" || !nos.has(cleAdresse(s.adresse)));
}

/** Courrier « Au propriétaire » : discret, sans dire comment l'adresse a été trouvée au-delà des données publiques. */
export function courrier(s: Signal): { objet: string; corps: string[] } {
  const appart = s.type === "appartement";
  const intro: Record<Source, string> = {
    dpe: `Nous accompagnons en ce moment plusieurs acquéreurs qui recherchent ${appart ? "un appartement" : "un bien"} dans votre secteur${s.ville ? `, à ${s.ville}` : ""}, et votre adresse fait partie de celles qui correspondent à leurs critères.`,
    audit: "Si vous envisagez de vendre votre maison, nous serions heureux de vous accompagner : nous avons des acquéreurs qui recherchent dans votre secteur, y compris pour des maisons avec des travaux de rénovation énergétique à prévoir.",
    bodacc: "Dans le cadre de la cession des actifs immobiliers de votre société, notre agence peut vous proposer une estimation et une commercialisation rapides auprès de son fichier d'acquéreurs et d'investisseurs.",
    fichier: "Nous nous étions rencontrés au sujet de votre bien, et je me permets de reprendre de vos nouvelles.",
  };
  return {
    objet: s.source === "bodacc" ? "Cession de vos actifs immobiliers" : "Votre bien intéresse nos acquéreurs",
    corps: [
      s.source === "bodacc" ? "Madame, Monsieur," : "Madame, Monsieur le Propriétaire,",
      intro[s.source],
      "Je vous propose, sans aucun engagement, une estimation gratuite de votre bien fondée sur les ventes réellement enregistrées autour de chez vous. Elle vous donnera une idée précise de sa valeur aujourd'hui, que vous ayez un projet ou non.",
      `Vous pouvez me joindre directement au ${AGENCE.conseillerTel}${AGENCE.conseillerMail ? ` ou par e-mail à ${AGENCE.conseillerMail}` : ""}.`,
      "Je vous prie d'agréer, Madame, Monsieur, l'expression de mes salutations distinguées.",
      nomConseiller(),
    ],
  };
}

export const MENTION_RGPD =
  "Ce courrier vous est adressé à partir de données publiques relatives au logement (adresse), sans traitement de données vous concernant nominativement. Pour ne plus recevoir de courrier de notre part, il suffit de nous l'indiquer par téléphone ou par e-mail : votre adresse sera retirée de nos envois.";

"use client";

/* ============================================================
   Documents rattachés à la fiche du bien (offres d'achat,
   mandats…) : une copie de chaque acte rédigé est gardée sur le
   bien, consultable à tout moment, avec un statut qui peut faire
   avancer le statut du bien.
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { getAll, uid, update, useDoc } from "@/lib/store";
import { eur } from "@/lib/format";
import type { Bien, BienStatut } from "@/lib/types";
import { nomOffre, type Offre } from "@/components/offre/offre";
import { titreMandat, type Mandat } from "@/components/mandat/mandat";
import { pointAvenant, prixPresentation, titreAvenant, type Avenant } from "@/components/avenant/avenant";
import { basculerPoint, clePoint, dossierDe, reglesDe, type BienDossier } from "@/components/biens/dossier";

export type ActeKind = "offre" | "mandat" | "avenant";
export type ActeStatut = "brouillon" | "envoye" | "signe" | "refuse";

interface ActeBase {
  id: string;
  statut: ActeStatut;
  creeLe: string; // ISO
  maj: string; // ISO
}
export type Acte = (ActeBase & { kind: "offre"; data: Offre }) | (ActeBase & { kind: "mandat"; data: Mandat }) | (ActeBase & { kind: "avenant"; data: Avenant });
export type BienActes = Bien & { actes?: Acte[] };

export const STATUTS_ACTE: Record<ActeKind, { v: ActeStatut; label: string; tone: "neutral" | "info" | "ok" | "danger" }[]> = {
  offre: [
    { v: "brouillon", label: "Brouillon", tone: "neutral" },
    { v: "envoye", label: "Envoyée pour signature", tone: "info" },
    { v: "signe", label: "Acceptée et signée", tone: "ok" },
    { v: "refuse", label: "Refusée ou caduque", tone: "danger" },
  ],
  mandat: [
    { v: "brouillon", label: "Brouillon", tone: "neutral" },
    { v: "envoye", label: "Envoyé pour signature", tone: "info" },
    { v: "signe", label: "Signé", tone: "ok" },
    { v: "refuse", label: "Abandonné", tone: "danger" },
  ],
  avenant: [
    { v: "brouillon", label: "Brouillon", tone: "neutral" },
    { v: "envoye", label: "Envoyé pour signature", tone: "info" },
    { v: "signe", label: "Signé", tone: "ok" },
    { v: "refuse", label: "Abandonné", tone: "danger" },
  ],
};
export const statutActe = (a: Acte) => STATUTS_ACTE[a.kind].find((s) => s.v === a.statut)!;

export function titreActe(a: Acte) {
  if (a.kind === "offre") {
    const noms = a.data.acquereurs.map(nomOffre).filter(Boolean).join(" et ");
    return `Offre d'achat${noms ? ` de ${noms}` : ""}`;
  }
  if (a.kind === "avenant") return titreAvenant(a.data);
  return `${titreMandat(a.data)}${a.data.numero ? ` n° ${a.data.numero}` : ""}`;
}
export function resumeActe(a: Acte) {
  if (a.kind === "offre") return a.data.prix ? `${eur(a.data.prix)} honoraires inclus` : "Prix à compléter";
  if (a.kind === "avenant") {
    const hai = prixPresentation(a.data.nouveau);
    return hai != null ? `Nouveau prix : ${eur(hai)} honoraires inclus` : a.data.nouveau.netVendeur ? `Nouveau prix : ${eur(a.data.nouveau.netVendeur)} net vendeur` : "Prix à compléter";
  }
  const noms = a.data.mandants.map(nomOffre).filter(Boolean).join(" et ");
  return [a.data.netVendeur ? `${eur(a.data.netVendeur)} net vendeur` : "", noms].filter(Boolean).join(" · ");
}
export const lienActe = (bienId: string, a: Acte) => `/imprimer/${a.kind}/${bienId}?acte=${a.id}`;

const actesDu = (bienId: string) => ((getAll("biens").find((x) => x.id === bienId) as BienActes | undefined)?.actes ?? []);

/** Garde (ou met à jour) la copie de l'acte sur la fiche du bien. Renvoie son identifiant. */
export function enregistrerActe(bienId: string, kind: "offre", data: Offre): string;
export function enregistrerActe(bienId: string, kind: "mandat", data: Mandat): string;
export function enregistrerActe(bienId: string, kind: "avenant", data: Avenant): string;
export function enregistrerActe(bienId: string, kind: ActeKind, data: Offre | Mandat | Avenant): string {
  const actes = actesDu(bienId);
  const now = new Date().toISOString();
  const id = data.acteId && actes.some((a) => a.id === data.acteId) ? data.acteId : uid();
  const copie = { ...data, acteId: id };
  const existant = actes.find((a) => a.id === id);
  const acte = { id, kind, data: copie, statut: existant?.statut ?? "brouillon", creeLe: existant?.creeLe ?? now, maj: now } as Acte;
  update("biens", bienId, { actes: [acte, ...actes.filter((a) => a.id !== id)] } as Partial<Bien>);
  return id;
}

export function supprimerActe(bienId: string, acteId: string) {
  update("biens", bienId, { actes: actesDu(bienId).filter((a) => a.id !== acteId) } as Partial<Bien>);
}

const RANG: Record<BienStatut, number> = { estimation: 0, mandat_signe: 1, en_vente: 2, sous_offre: 3, compromis: 4, vendu: 5, retire: -1 };

function ajouterMois(iso: string, mois: number) {
  const d = new Date(`${iso}T12:00:00`);
  d.setMonth(d.getMonth() + mois);
  return d.toISOString().slice(0, 10);
}

/**
 * Change le statut d'un acte et, si besoin, celui du bien :
 * offre acceptée → « Sous offre » ; plus aucune offre acceptée → retour « En vente » ;
 * mandat signé → n° et type du mandat repris sur le bien, « Mandat signé » s'il était en estimation ;
 * avenant signé → nouveau prix, honoraires et charge des honoraires repris sur le bien.
 * Renvoie le nouveau statut du bien quand il a changé.
 */
export function changerStatutActe(bienId: string, acteId: string, statut: ActeStatut): BienStatut | undefined {
  const b = getAll("biens").find((x) => x.id === bienId) as BienActes | undefined;
  if (!b) return;
  const actes = (b.actes ?? []).map((a) => (a.id === acteId ? ({ ...a, statut, maj: new Date().toISOString() } as Acte) : a));
  const acte = actes.find((a) => a.id === acteId);
  if (!acte) return;
  const patch: Partial<BienActes & BienDossier> = { actes };

  if (acte.kind === "offre") {
    const uneAcceptee = actes.some((a) => a.kind === "offre" && a.statut === "signe");
    if (uneAcceptee && RANG[b.statut] < RANG.sous_offre) patch.statut = "sous_offre";
    if (!uneAcceptee && b.statut === "sous_offre") patch.statut = "en_vente";
  } else if (acte.kind === "avenant") {
    const n = acte.data.nouveau;
    if (statut === "signe" && n.netVendeur != null) {
      patch.netVendeur = n.netVendeur;
      if (n.honoraires != null) {
        patch.honoraires = n.honoraires;
        patch.prix = n.netVendeur + n.honoraires;
      }
      patch.honorairesCharge = n.charge;
    }
    if (statut === "signe") {
      // Le point « aucun avenant trouvé » du dossier est réglé par cet avenant.
      const regles = reglesDe(b);
      const ouverts = (dossierDe(b)?.aVerifier ?? []).filter((p) => pointAvenant(p) && !regles[clePoint(p)]);
      if (ouverts.length) patch.pointsRegles = ouverts.reduce((r, p) => basculerPoint(r, p), regles);
    }
  } else if (statut === "signe") {
    const m = acte.data;
    patch.mandat = { ...b.mandat, numero: m.numero || b.mandat?.numero, type: m.type ?? "simple", debut: m.date, fin: m.date ? ajouterMois(m.date, m.dureeMois) : b.mandat?.fin };
    if (b.statut === "estimation") patch.statut = "mandat_signe";
  }
  update("biens", bienId, patch as Partial<Bien>);
  return patch.statut && patch.statut !== b.statut ? patch.statut : undefined;
}

/**
 * Pour les pages d'impression : l'acte gardé sur la fiche (lien « ?acte=… »), sinon le brouillon
 * de cet appareil. undefined tant que ce n'est pas chargé, null si rien n'est trouvé.
 */
export function useActe<T extends Offre | Mandat | Avenant>(bienId: string, kind: ActeKind, brouillon: (bienId: string) => T | null): T | null | undefined {
  const { doc: bien } = useDoc("biens", bienId);
  const [acteId, setActeId] = useState<string | null | undefined>(undefined);
  const [attente, setAttente] = useState(true);
  useEffect(() => {
    setActeId(new URLSearchParams(window.location.search).get("acte"));
    const t = setTimeout(() => setAttente(false), 4000);
    return () => clearTimeout(t);
  }, [bienId]);
  return useMemo(() => {
    if (acteId === undefined) return undefined;
    if (!acteId) return brouillon(bienId);
    const a = (bien as BienActes | undefined)?.actes?.find((x) => x.id === acteId && x.kind === kind);
    if (a) return a.data as T;
    return attente && !bien ? undefined : brouillon(bienId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [acteId, bien, attente, bienId, kind]);
}

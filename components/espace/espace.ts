"use client";

import { useSyncExternalStore } from "react";

/* ============================================================
   Espace de travail : PATRIM Hub Vente ou PATRIM Hub Location.
   Choisi à l'entrée de l'appli, gardé sur l'appareil. Chaque
   espace a son menu, ses biens et ses prospects ; les
   propriétaires sont communs aux deux.
   ============================================================ */

export type Espace = "vente" | "location";
const CLE = "patrim-hub:espace";
const ecoute = new Set<() => void>();

function lire(): Espace | null {
  try {
    const v = localStorage.getItem(CLE);
    return v === "vente" || v === "location" ? v : null;
  } catch {
    return null;
  }
}

export function choisirEspace(e: Espace | null) {
  try {
    if (e) localStorage.setItem(CLE, e);
    else localStorage.removeItem(CLE);
  } catch {
    /* stockage indisponible : le choix vaut pour la session */
  }
  memoire = e;
  ecoute.forEach((f) => f());
}

let memoire: Espace | null | undefined;
const courant = () => (memoire === undefined ? (memoire = lire()) : memoire);

/** Espace choisi (null tant qu'aucun choix, « undefined » pendant le rendu serveur). */
export function useEspace(): Espace | null | undefined {
  return useSyncExternalStore(
    (f) => {
      ecoute.add(f);
      return () => ecoute.delete(f);
    },
    courant,
    () => undefined
  );
}

export const NOM_ESPACE: Record<Espace, string> = { vente: "Transaction", location: "Location" };

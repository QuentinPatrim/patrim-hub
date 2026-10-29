"use client";

import { useSyncExternalStore } from "react";

/**
 * Photo de fond du thème « Dashboard ». Réglage propre à l'appareil (comme le thème) :
 * une photo proposée par l'appli, un dégradé bordeaux, la photo d'un bien, ou une photo de la galerie du téléphone.
 */
export const FOND_KEY = "patrim-hub:fond";
export const FOND_PERSO_KEY = "patrim-hub:fond-perso";

export type FondPropose = { id: string; nom: string; image?: string; mini?: string; voile: number };
// voile = opacité du voile sombre (une photo claire en demande plus pour garder le texte lisible)
export const FONDS: FondPropose[] = [
  { id: "salon", nom: "Salon", image: "/fonds/salon.jpg", mini: "/fonds/salon-mini.jpg", voile: 0.5 },
  { id: "agence", nom: "L'agence", image: "/fonds/agence.jpg", mini: "/fonds/agence-mini.jpg", voile: 0.68 },
  { id: "bordeaux", nom: "Bordeaux", voile: 0 },
];
export const FOND_DEFAUT = "salon";

export type Fond = { id: string; image?: string; voile: number };

const ls = new Set<() => void>();
const lire = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};

let cache: { cle: string | null; perso: string | null; fond: Fond } | null = null;
function get(): Fond {
  const cle = lire(FOND_KEY);
  const perso = cle === "perso" ? lire(FOND_PERSO_KEY) : null;
  if (cache && cache.cle === cle && cache.perso === perso) return cache.fond;
  let fond: Fond;
  if (cle === "perso" && perso) fond = { id: "perso", image: perso, voile: 0.55 };
  else if (cle?.startsWith("url:")) fond = { id: cle, image: cle.slice(4), voile: 0.55 };
  else fond = FONDS.find((f) => f.id === cle) ?? FONDS.find((f) => f.id === FOND_DEFAUT)!;
  cache = { cle, perso, fond };
  return fond;
}
const SERVEUR: Fond = { id: FOND_DEFAUT, voile: 0.5 };

export function choisirFond(id: string) {
  try {
    localStorage.setItem(FOND_KEY, id);
  } catch {}
  ls.forEach((l) => l());
}

/** Réduit la photo choisie dans la galerie et la garde sur l'appareil. */
export async function enregistrerPhotoPerso(file: File) {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error("Cette image n'a pas pu être ouverte."));
      i.src = url;
    });
    const max = 1400;
    const r = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.round(img.naturalWidth * r);
    c.height = Math.round(img.naturalHeight * r);
    c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
    const data = c.toDataURL("image/jpeg", 0.8);
    try {
      localStorage.setItem(FOND_PERSO_KEY, data);
    } catch {
      throw new Error("La photo est trop lourde pour être gardée sur ce téléphone. Essayez-en une autre.");
    }
    choisirFond("perso");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export const photoPerso = () => lire(FOND_PERSO_KEY);

export function useFond() {
  return useSyncExternalStore(
    (cb) => {
      ls.add(cb);
      return () => ls.delete(cb);
    },
    get,
    () => SERVEUR
  );
}

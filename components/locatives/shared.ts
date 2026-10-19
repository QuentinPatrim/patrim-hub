/* Outils partagés du module Estimations locatives (libellés, lecture du terrain). */

import type { Tone } from "@/lib/format";
import type { Confiance } from "@/components/estimations/shared";
import { quartierDe as quartierDeToulouse } from "@/components/estimations/shared";
import type { Suggestion } from "@/components/estimations/shared";

export type { Confiance, Suggestion };

export const CONFIANCE_TONE: Record<Confiance, Tone> = { élevée: "ok", moyenne: "warn", faible: "danger" };

export const DPE_CLASSES = ["A", "B", "C", "D", "E", "F", "G"] as const;

export const EXTERIEURS = ["Balcon", "Terrasse", "Loggia", "Jardin"] as const;

export function quartierDe(lat?: number, lon?: number, citycode?: string, ville?: string) {
  return quartierDeToulouse(lat, lon, citycode, ville);
}

export function resumeBien(e: { type: "appartement" | "maison"; surface: number; pieces?: number }) {
  const t = e.type === "maison" ? "Maison" : "Appartement";
  return [t, e.pieces ? `${e.pieces} pièce${e.pieces > 1 ? "s" : ""}` : null, e.surface ? `${e.surface.toLocaleString("fr-FR")} m²` : null]
    .filter(Boolean)
    .join(" · ");
}

export const ETAT_LABEL: Record<string, string> = {
  a_renover: "À rénover",
  a_rafraichir: "À rafraîchir",
  bon: "Bon état",
  refait: "Refait à neuf",
  neuf: "Récent / neuf",
};

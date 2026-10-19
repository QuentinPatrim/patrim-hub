"use client";

/* Numéro de mandat de l'agence : un seul compteur partagé par toute
   l'équipe (Quentin, Julien, Clément…), tenu dans Supabase. Il ne
   repart jamais à 1, même d'une année sur l'autre. Aujourd'hui :
   dernier signé 1022, le prochain est 1023. */

import { authHeaders } from "@/lib/ai";
import { cloudEnabled } from "@/lib/supabase";

export type ApercuNumero = { numero: number; prochains: number[] };

/** Prochain numéro (aperçu, rien n'est consommé). */
export async function apercuNumero(): Promise<ApercuNumero | null> {
  if (!cloudEnabled) return null;
  try {
    const r = await fetch("/api/mandats/numero", { headers: await authHeaders(), cache: "no-store" });
    if (!r.ok) return null;
    return (await r.json()) as ApercuNumero;
  } catch {
    return null;
  }
}

/** Réserve le prochain numéro : chaque appel consomme exactement un numéro, atomiquement. */
export async function reserverNumero(): Promise<number | null> {
  if (!cloudEnabled) return null;
  try {
    const r = await fetch("/api/mandats/numero", { method: "POST", headers: await authHeaders() });
    if (!r.ok) return null;
    const j = (await r.json()) as { numero?: number };
    return typeof j.numero === "number" ? j.numero : null;
  } catch {
    return null;
  }
}

/** Numéro saisi à la main : on le propose tel quel (l'agent garde la main). */
export const numeroManuel = (n: number) => String(n);

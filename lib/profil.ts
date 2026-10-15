"use client";

/* ============================================================
   Profil du conseiller : signature manuscrite pour les avis de
   valeur, lien de la page d'avis clients. Stocké côté
   utilisateur, jamais dans le dépôt :
   - connecté : une ligne « profil » dans hub_docs (réservée à
     l'utilisateur par les règles de sécurité Supabase) ;
   - toujours : une copie sur le téléphone pour l'affichage immédiat.
   ============================================================ */

import { useEffect, useState } from "react";
import { supabase } from "./supabase";
import { uid } from "./store";

export interface Profil {
  id: string;
  signature?: string; // image PNG (data URL), fond transparent ou blanc
  lienAvis?: string; // page où les clients laissent un avis sur l'agence (Google…)
  updatedAt: string;
}

const CLE = "patrim-hub:profil";
const listeners = new Set<(p: Profil | null) => void>();
let courant: Profil | null | undefined;

function lireLocal(): Profil | null {
  try {
    const raw = localStorage.getItem(CLE);
    return raw ? (JSON.parse(raw) as Profil) : null;
  } catch {
    return null;
  }
}
function ecrireLocal(p: Profil | null) {
  try {
    if (p) localStorage.setItem(CLE, JSON.stringify(p));
    else localStorage.removeItem(CLE);
  } catch {}
}
function publier(p: Profil | null) {
  courant = p;
  ecrireLocal(p);
  listeners.forEach((l) => l(p));
}

async function chargerDistant() {
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const { data, error } = await supabase.from("hub_docs").select("id,data").eq("kind", "profil").order("updated_at", { ascending: false }).limit(1);
  if (error || !data?.length) return;
  const p = { ...(data[0].data as Profil), id: data[0].id as string };
  const local = courant ?? lireLocal();
  if (!local || (p.updatedAt ?? "") >= (local.updatedAt ?? "")) publier(p);
}

/** Change un champ du profil en gardant les autres, à partir de la dernière version du compte. */
async function enregistrer(patch: Partial<Omit<Profil, "id" | "updatedAt">>, erreur: string) {
  await chargerDistant().catch(() => undefined);
  const base = courant ?? lireLocal();
  const p: Profil = { ...(base ?? {}), ...patch, id: base?.id ?? uid(), updatedAt: new Date().toISOString() };
  publier(p);
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const { error } = await supabase.from("hub_docs").upsert({ id: p.id, kind: "profil", data: p, user_id: u.user.id, updated_at: p.updatedAt });
  if (error) throw new Error(erreur);
}

export const enregistrerSignature = (signature: string | undefined) => enregistrer({ signature }, "La signature est gardée sur ce téléphone, mais n'a pas pu être synchronisée.");
export const enregistrerLienAvis = (lienAvis: string | undefined) => enregistrer({ lienAvis }, "Le lien est gardé sur ce téléphone, mais n'a pas pu être synchronisé.");

function useProfil() {
  const [p, setP] = useState<Profil | null>(null);
  useEffect(() => {
    if (courant === undefined) courant = lireLocal();
    setP(courant);
    listeners.add(setP);
    void chargerDistant();
    return () => {
      listeners.delete(setP);
    };
  }, []);
  return p;
}

/** Signature du conseiller (undefined tant qu'aucune n'est enregistrée). */
export const useSignature = () => useProfil()?.signature;
/** Lien de la page d'avis clients (undefined tant qu'il n'est pas réglé). */
export const useLienAvis = () => useProfil()?.lienAvis;

/**
 * Prépare une photo ou un scan de signature : recadrée à 900 px de large
 * au plus, fond blanc rendu transparent pour se poser sur le document.
 */
export async function preparerSignature(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((ok, ko) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => ko(new Error("Cette image ne peut pas être lue."));
      i.src = url;
    });
    const k = Math.min(1, 900 / img.width, 360 / img.height);
    const w = Math.max(1, Math.round(img.width * k));
    const h = Math.max(1, Math.round(img.height * k));
    const cv = document.createElement("canvas");
    cv.width = w;
    cv.height = h;
    const ctx = cv.getContext("2d");
    if (!ctx) throw new Error("Votre navigateur ne permet pas de préparer l'image.");
    ctx.drawImage(img, 0, 0, w, h);
    const d = ctx.getImageData(0, 0, w, h);
    // Fond clair → transparent ; trait conservé et légèrement foncé
    for (let i = 0; i < d.data.length; i += 4) {
      const lum = 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
      if (lum > 215) d.data[i + 3] = 0;
      else if (lum > 160) d.data[i + 3] = Math.round(((215 - lum) / 55) * d.data[i + 3]);
    }
    ctx.putImageData(d, 0, 0);
    return cv.toDataURL("image/png");
  } finally {
    URL.revokeObjectURL(url);
  }
}

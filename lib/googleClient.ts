"use client";

import { authHeaders } from "./ai";
import { cloudEnabled } from "./supabase";

/* Côté téléphone : la connexion Google de l'utilisateur (Réglages) et la synchro automatique
   Gmail + Agenda tant que l'appli est ouverte (toutes les 5 minutes au plus). */

const CLE = "patrim-hub:google";
const DERNIERE = "patrim-hub:google:synchro";

export type EtatGoogle = { configure: boolean; connecte: boolean; email?: string; derniereSynchro?: string; aide?: string };

export function googleConnecte() {
  try {
    return localStorage.getItem(CLE) === "1";
  } catch {
    return false;
  }
}

function retenir(c: boolean) {
  try {
    localStorage.setItem(CLE, c ? "1" : "0");
  } catch {}
}

export async function etatGoogle(): Promise<EtatGoogle> {
  const r = await fetch("/api/google/etat", { headers: await authHeaders() });
  const j = (await r.json().catch(() => ({}))) as EtatGoogle & { error?: string };
  if (!r.ok) throw new Error(j.error || "État Google indisponible");
  retenir(!!j.connecte);
  return j;
}

export async function connecterGoogle() {
  const r = await fetch("/api/google/connexion", { method: "POST", headers: await authHeaders() });
  const j = (await r.json().catch(() => ({}))) as { url?: string; error?: string };
  if (!j.url) throw new Error(j.error || "Connexion impossible");
  window.location.href = j.url;
}

export async function deconnecterGoogle() {
  await fetch("/api/google/etat", { method: "DELETE", headers: await authHeaders() });
  retenir(false);
}

export async function synchroGoogle(force = false): Promise<Record<string, number> | null> {
  if (!cloudEnabled || (!force && !googleConnecte())) return null;
  try {
    const avant = Number(localStorage.getItem(DERNIERE) || 0);
    if (!force && Date.now() - avant < 5 * 60_000) return null;
    localStorage.setItem(DERNIERE, String(Date.now()));
  } catch {}
  const r = await fetch("/api/google/synchro", { method: "POST", headers: await authHeaders() });
  const j = (await r.json().catch(() => ({}))) as { bilan?: Record<string, number>; error?: string; pasConnecte?: boolean };
  if (j.pasConnecte) retenir(false);
  if (!r.ok) throw new Error(j.error || "Synchronisation impossible");
  return j.bilan ?? null;
}

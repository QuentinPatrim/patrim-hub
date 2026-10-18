"use client";

/* ============================================================
   Stockage de « Mes revenus » : une ligne par document dans
   hub_docs (kind « revenus »). Les règles de la base ne la
   montrent qu'au compte qui l'a créée : ni le responsable ni
   les collègues ne la voient (le kind n'est pas « commun »).
   Copie sur l'appareil rangée sous l'identifiant du compte,
   pour qu'un autre compte connecté sur le même téléphone ne la
   lise jamais.
   ============================================================ */

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import { uid } from "@/lib/store";
import { CONTRAT_DEFAUT, type Contrat, type DocRevenu, type Donnees, type MoisRevenu, type VenteRevenu } from "./revenus";

const KIND = "revenus";
const PREFIXE = "patrim-hub:revenus:";

let compte: string | null | undefined; // undefined : pas encore connu
let docs: DocRevenu[] = [];
let charge = false;
const listeners = new Set<() => void>();

async function compteConnecte() {
  if (compte !== undefined) return compte;
  if (!supabase) return (compte = "local");
  const { data } = await supabase.auth.getUser();
  return (compte = data.user?.id ?? null);
}

function lireLocal(c: string): DocRevenu[] {
  try {
    const raw = localStorage.getItem(PREFIXE + c);
    return raw ? (JSON.parse(raw) as DocRevenu[]) : [];
  } catch {
    return [];
  }
}
function publier(liste: DocRevenu[]) {
  docs = liste;
  if (compte) {
    try {
      localStorage.setItem(PREFIXE + compte, JSON.stringify(liste));
    } catch {}
  }
  listeners.forEach((l) => l());
}

async function charger() {
  const c = await compteConnecte();
  if (!c) return;
  if (!charge) publier(lireLocal(c));
  charge = true;
  if (!supabase) return;
  const { data, error } = await supabase.from("hub_docs").select("id,data").eq("kind", KIND).eq("user_id", c).limit(5000);
  if (error || !data) return;
  publier(data.map((r: { id: string; data: DocRevenu }) => ({ ...r.data, id: r.id })));
}

async function envoyer(liste: DocRevenu[]) {
  const c = await compteConnecte();
  if (!supabase || !c || c === "local" || !liste.length) return;
  const { error } = await supabase.from("hub_docs").upsert(liste.map((d) => ({ id: d.id, kind: KIND, data: d, user_id: c, updated_at: d.updatedAt })));
  if (error) throw new Error("C'est gardé sur ce téléphone, mais pas encore synchronisé avec ton compte. Réessaie avec du réseau.");
}

/** Ajoute ou remplace des documents (même id). */
export async function enregistrer(liste: Array<Omit<VenteRevenu, "id" | "updatedAt"> & { id?: string } | Omit<MoisRevenu, "id" | "updatedAt"> & { id?: string } | Omit<Contrat, "id" | "updatedAt"> & { id?: string }>) {
  await compteConnecte();
  const now = new Date().toISOString();
  const prets = liste.map((d) => ({ ...d, id: d.id ?? uid(), updatedAt: now }) as DocRevenu);
  const ids = new Set(prets.map((d) => d.id));
  publier([...prets, ...docs.filter((d) => !ids.has(d.id))]);
  await envoyer(prets);
  return prets;
}

export async function supprimer(id: string) {
  publier(docs.filter((d) => d.id !== id));
  if (!supabase) return;
  const { error } = await supabase.from("hub_docs").delete().eq("id", id).eq("kind", KIND);
  if (error) throw new Error("La suppression n'a pas pu être synchronisée. Réessaie avec du réseau.");
}

/** Les données de « Mes revenus » du compte connecté. */
export function useRevenus(): Donnees & { pret: boolean } {
  const [, maj] = useState(0);
  const [pret, setPret] = useState(false);
  useEffect(() => {
    const l = () => maj((n) => n + 1);
    listeners.add(l);
    void charger().finally(() => setPret(true));
    return () => {
      listeners.delete(l);
    };
  }, []);
  return useMemo(() => {
    const contrats = docs.filter((d): d is Contrat => d.nature === "contrat").sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
    const contrat: Contrat = { ...CONTRAT_DEFAUT, ...(contrats[0] ?? { id: "", updatedAt: "" }) };
    return {
      pret,
      contrat,
      ventes: docs.filter((d): d is VenteRevenu => d.nature === "vente"),
      mois: docs.filter((d): d is MoisRevenu => d.nature === "mois"),
    };
    // docs change de référence à chaque publication
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docs, pret]);
}

/* Changement de compte sur le même appareil : on oublie tout de suite ce qui était affiché. */
if (typeof window !== "undefined" && supabase) {
  supabase.auth.onAuthStateChange((_e, session) => {
    const id = session?.user?.id ?? null;
    if (compte === undefined || id === compte) return;
    compte = undefined;
    charge = false;
    docs = [];
    listeners.forEach((l) => l());
    if (id) void charger();
  });
}

"use client";

/* ============================================================
   « À envoyer » : ce que le conseiller a reporté, écarté ou déjà
   envoyé depuis la boîte (quand le module d'origine ne le garde
   pas lui-même). Une ligne « boite » dans hub_docs, réservée à
   l'utilisateur, avec une copie sur le téléphone.
   ============================================================ */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { uid } from "@/lib/store";

export interface EtatBoite {
  id: string;
  /** Message reporté : clé → jour où il revient (AAAA-MM-JJ). */
  reportes?: Record<string, string>;
  /** Message écarté : clé → date ISO. */
  ecartes?: Record<string, string>;
  /** Message envoyé, quand la fiche d'origine ne le note pas : clé → date ISO. */
  envoyes?: Record<string, string>;
  updatedAt: string;
}

const CLE = "patrim-hub:boite";
const listeners = new Set<(e: EtatBoite | null) => void>();
let courant: EtatBoite | null | undefined;

function lireLocal(): EtatBoite | null {
  try {
    const raw = localStorage.getItem(CLE);
    return raw ? (JSON.parse(raw) as EtatBoite) : null;
  } catch {
    return null;
  }
}
function publier(e: EtatBoite | null) {
  courant = e;
  try {
    if (e) localStorage.setItem(CLE, JSON.stringify(e));
  } catch {}
  listeners.forEach((l) => l(e));
}

async function chargerDistant() {
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const { data, error } = await supabase.from("hub_docs").select("id,data").eq("kind", "boite").eq("user_id", u.user.id).order("updated_at", { ascending: false }).limit(1);
  if (error || !data?.length) return;
  const e = { ...(data[0].data as EtatBoite), id: data[0].id as string };
  const local = courant ?? lireLocal();
  if (!local || (e.updatedAt ?? "") >= (local.updatedAt ?? "")) publier(e);
}

type Champ = "reportes" | "ecartes" | "envoyes";

/** Note une clé dans l'un des registres de la boîte (et nettoie les entrées de plus de 6 mois). */
export async function noterBoite(champ: Champ, cle: string, valeur: string) {
  const base = courant ?? lireLocal();
  const limite = new Date(Date.now() - 183 * 86400000).toISOString();
  const recent = (r?: Record<string, string>) => Object.fromEntries(Object.entries(r ?? {}).filter(([, v]) => v >= limite.slice(0, v.length)));
  const e: EtatBoite = {
    id: base?.id ?? uid(),
    reportes: recent(base?.reportes),
    ecartes: recent(base?.ecartes),
    envoyes: recent(base?.envoyes),
    updatedAt: new Date().toISOString(),
  };
  e[champ] = { ...(e[champ] ?? {}), [cle]: valeur };
  publier(e);
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("hub_docs").upsert({ id: e.id, kind: "boite", data: e, user_id: u.user.id, updated_at: e.updatedAt });
}

export function useEtatBoite() {
  const [e, setE] = useState<EtatBoite | null>(null);
  useEffect(() => {
    if (courant === undefined) courant = lireLocal();
    setE(courant);
    listeners.add(setE);
    void chargerDistant();
    return () => {
      listeners.delete(setE);
    };
  }, []);
  return e;
}

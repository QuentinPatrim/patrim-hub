"use client";

/* ============================================================
   Radar vendeurs : ce qui a été fait pour chaque adresse (courrier,
   boîtage, refus). Une ligne « radar » dans hub_docs, réservée au
   conseiller, avec une copie sur le téléphone. Un refus (« ne plus
   me contacter ») est gardé pour ne jamais recontacter l'adresse.
   ============================================================ */

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { uid } from "@/lib/store";

export type Action = "courrier" | "boitage" | "contact" | "ignore" | "refus";
export const ACTION: Record<Action, string> = {
  courrier: "Courrier envoyé",
  boitage: "Boîtage fait",
  contact: "Propriétaire contacté",
  ignore: "Écarté",
  refus: "Ne plus contacter",
};

export interface SuiviRadar {
  id: string;
  /** Signal ou adresse normalisée → action et date. */
  faits: Record<string, { action: Action; date: string }>;
  /** Codes postaux suivis. */
  codesPostaux?: string[];
  updatedAt: string;
}

const CLE = "patrim-hub:radar";
const listeners = new Set<(s: SuiviRadar | null) => void>();
let courant: SuiviRadar | null | undefined;

/** « 12 Rue des Lois, 31000 Toulouse » et « 12 rue des lois » donnent la même clé. */
export const cleAdresse = (a: string) =>
  a
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/\b\d{5}\b.*$/, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function lireLocal(): SuiviRadar | null {
  try {
    const raw = localStorage.getItem(CLE);
    return raw ? (JSON.parse(raw) as SuiviRadar) : null;
  } catch {
    return null;
  }
}
function publier(s: SuiviRadar | null) {
  courant = s;
  try {
    if (s) localStorage.setItem(CLE, JSON.stringify(s));
  } catch {}
  listeners.forEach((l) => l(s));
}

async function chargerDistant() {
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  const { data, error } = await supabase.from("hub_docs").select("id,data").eq("kind", "radar").eq("user_id", u.user.id).order("updated_at", { ascending: false }).limit(1);
  if (error || !data?.length) return;
  const s = { ...(data[0].data as SuiviRadar), id: data[0].id as string };
  const local = courant ?? lireLocal();
  if (!local || (s.updatedAt ?? "") >= (local.updatedAt ?? "")) publier(s);
}

export async function enregistrerRadar(patch: Partial<Omit<SuiviRadar, "id" | "updatedAt">>) {
  const base = courant ?? lireLocal();
  const s: SuiviRadar = { faits: {}, ...(base ?? {}), ...patch, id: base?.id ?? uid(), updatedAt: new Date().toISOString() };
  publier(s);
  if (!supabase) return;
  const { data: u } = await supabase.auth.getUser();
  if (!u.user) return;
  await supabase.from("hub_docs").upsert({ id: s.id, kind: "radar", data: s, user_id: u.user.id, updated_at: s.updatedAt });
}

export function noterAction(cle: string, action: Action | null) {
  const faits = { ...(courant ?? lireLocal())?.faits };
  if (action) faits[cle] = { action, date: new Date().toISOString() };
  else delete faits[cle];
  return enregistrerRadar({ faits });
}

export function useSuiviRadar() {
  const [s, setS] = useState<SuiviRadar | null>(null);
  useEffect(() => {
    if (courant === undefined) courant = lireLocal();
    setS(courant);
    listeners.add(setS);
    void chargerDistant();
    return () => {
      listeners.delete(setS);
    };
  }, []);
  return s;
}

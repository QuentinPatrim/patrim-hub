"use client";

/* ============================================================
   Équipe PATRIM Hub : qui est connecté et ce qu'il peut voir.
   - titulaire   (Quentin) : son portefeuille, gère les accès.
   - responsable (Julien)  : tous les biens, propriétaires et
     estimations de l'équipe, jamais les prospects des autres.
   - collegue    (Clément) : ses propres fiches, plus les biens
     qu'on lui a partagés.
   Les règles sont appliquées par la base (Supabase), l'écran
   ne fait que les expliquer.
   ============================================================ */

import { useEffect, useState } from "react";
import { supabase } from "./supabase";

export type RoleEquipe = "titulaire" | "responsable" | "collegue";

export interface Membre {
  user_id: string;
  role: RoleEquipe;
  prenom: string;
  nom: string;
  titre?: string | null;
  tel?: string | null;
  email?: string | null;
}

export const ROLE_EQUIPE: Record<RoleEquipe, { label: string; detail: string }> = {
  titulaire: { label: "Titulaire", detail: "Gère l'appli et les accès." },
  responsable: { label: "Responsable", detail: "Voit tous les biens, propriétaires et estimations. Jamais tes prospects." },
  collegue: { label: "Collègue", detail: "Voit ses propres fiches et les biens que tu lui partages. Jamais tes prospects." },
};

/** Conseiller par défaut (mode local, ou avant le chargement du compte). */
const PAR_DEFAUT = { prenom: "Quentin", nom: "Delsol", titre: "Conseiller en vente", tel: "06 52 45 96 54", mail: "quentin.delsol@patrim.fr" };
export type Conseiller = typeof PAR_DEFAUT & { role: RoleEquipe; userId?: string };

const CLE = "patrim-hub:moi";
let moi: Conseiller = { ...PAR_DEFAUT, role: "titulaire" };
const listeners = new Set<(c: Conseiller) => void>();

if (typeof window !== "undefined") {
  try {
    const raw = localStorage.getItem(CLE);
    if (raw) moi = { ...moi, ...(JSON.parse(raw) as Partial<Conseiller>) };
  } catch {}
}

function publier(c: Conseiller) {
  moi = c;
  try {
    localStorage.setItem(CLE, JSON.stringify(c));
  } catch {}
  listeners.forEach((l) => l(c));
}

/** Le conseiller connecté, pour les signatures des messages et des documents. */
export const conseiller = (): Conseiller => moi;
export const nomConseiller = () => `${moi.prenom} ${moi.nom}`.trim();

let charge: Promise<void> | null = null;
/** Lit la fiche équipe du compte connecté (après connexion). */
export function chargerMoi(force = false) {
  if (!supabase) return Promise.resolve();
  if (charge && !force) return charge;
  charge = (async () => {
    const { data: u } = await supabase!.auth.getUser();
    const user = u.user;
    if (!user) return;
    const { data } = await supabase!.from("hub_equipe").select("user_id,role,prenom,nom,titre,tel").eq("user_id", user.id).maybeSingle();
    const m = data as Membre | null;
    const mail = user.email ?? "";
    // Sans fiche équipe : prénom et nom déduits de l'adresse prenom.nom@patrim.fr
    const [p = "", n = ""] = mail.split("@")[0].split(".");
    const maj = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
    publier({
      userId: user.id,
      role: m?.role ?? "collegue",
      prenom: m?.prenom || maj(p),
      nom: m?.nom || maj(n),
      titre: m?.titre || "Conseiller en vente",
      tel: m?.tel || "",
      mail,
    });
  })().catch(() => {
    charge = null;
  });
  return charge;
}

export function useMoi() {
  const [c, setC] = useState<Conseiller>(moi);
  useEffect(() => {
    setC(moi);
    listeners.add(setC);
    void chargerMoi();
    return () => {
      listeners.delete(setC);
    };
  }, []);
  return c;
}

/** Membres de l'équipe (sans le compte connecté). */
export function useEquipe() {
  const [membres, setMembres] = useState<Membre[] | null>(null);
  useEffect(() => {
    if (!supabase) return setMembres([]);
    let vivant = true;
    void supabase
      .from("hub_equipe")
      .select("user_id,role,prenom,nom,titre,tel")
      .then(({ data }) => vivant && setMembres(((data ?? []) as Membre[]).filter((m) => m.user_id !== moi.userId)));
    return () => {
      vivant = false;
    };
  }, []);
  return membres;
}

/** Efface les données gardées sur l'appareil (changement de compte, déconnexion). */
export function viderAppareil() {
  try {
    Object.keys(localStorage)
      .filter((k) => k.startsWith("patrim-hub:") && k !== "patrim-hub:theme")
      .forEach((k) => localStorage.removeItem(k));
  } catch {}
}
